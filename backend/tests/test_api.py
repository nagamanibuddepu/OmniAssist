import io
import tempfile
import unittest
import asyncio
import json
import sys
import types
import uuid
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from PIL import Image as PILImage
from pypdf import PdfReader, PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

from app.config import settings
from app.db import transaction
from app.main import app

# Windows event loop policy for TestClient
import sys
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.previous_path = settings.database_path
        self.previous_upload_dir = settings.upload_dir
        self.previous_max_upload_bytes = settings.max_upload_bytes
        self.previous_key = settings.openai_api_key
        self.previous_gemini_key = settings.gemini_api_key
        self.previous_live_enabled = settings.live_enabled
        self.previous_groq_key = settings.groq_api_key
        self.previous_groq_image_input = settings.groq_image_input
        self.previous_image_input = settings.openai_image_input
        self.previous_invite = settings.registration_invite_code
        self.previous_daily_limit = settings.daily_provider_request_limit
        self.previous_model_pricing = settings.model_pricing_json
        settings.database_path = str(Path(self.temp.name) / "test.db")
        settings.upload_dir = str(Path(self.temp.name) / "uploads")
        settings.max_upload_bytes = 7 * 1024 * 1024
        settings.openai_api_key = "test-only-key"
        settings.gemini_api_key = "test-gemini-key"
        settings.openai_image_input = True
        settings.groq_image_input = False
        settings.registration_invite_code = ""
        settings.daily_provider_request_limit = 0
        settings.model_pricing_json = "{}"
        self.client_context = TestClient(app)
        self.client = self.client_context.__enter__()
        registered = self.client.post("/api/auth/register", json={"email": "owner@example.test", "password": "sufficient-test-password"})
        if registered.status_code != 200:
            raise AssertionError(registered.text)
        self.client.headers.update({"Authorization": f"Bearer {registered.json()['access_token']}"})

    def tearDown(self):
        self.client_context.__exit__(None, None, None)
        settings.database_path = self.previous_path
        settings.upload_dir = self.previous_upload_dir
        settings.max_upload_bytes = self.previous_max_upload_bytes
        settings.openai_api_key = self.previous_key
        settings.gemini_api_key = self.previous_gemini_key
        settings.live_enabled = self.previous_live_enabled
        settings.groq_api_key = self.previous_groq_key
        settings.groq_image_input = self.previous_groq_image_input
        settings.openai_image_input = self.previous_image_input
        settings.registration_invite_code = self.previous_invite
        settings.daily_provider_request_limit = self.previous_daily_limit
        settings.model_pricing_json = self.previous_model_pricing
        self.temp.cleanup()

    def test_health_and_capabilities_do_not_expose_credentials(self):
        self.assertEqual(self.client.get("/api/health").json()["status"], "ok")
        catalog = self.client.get("/api/models").json()
        openai = next(model for model in catalog["models"] if model["provider"] == "OpenAI API")
        groq = next(model for model in catalog["models"] if model["provider"] == "Groq")
        gemini = next(model for model in catalog["models"] if model["provider"] == "Google Gemini")
        anthropic = next(model for model in catalog["models"] if model["provider"] == "Anthropic Claude")
        self.assertTrue(openai["configured"])
        self.assertTrue(openai["image_input"])
        self.assertTrue(openai["document_input"])
        self.assertFalse(groq["image_input"])
        self.assertFalse(openai["native_realtime"])
        self.assertEqual(gemini["name"],"gemini-3.8-flash")
        self.assertEqual(anthropic["name"],"claude-haiku-4-5-20251001")
        self.assertNotIn("test-only-key", str(catalog))
        self.assertTrue(catalog["live_model"]["native_realtime"])
        self.assertEqual(catalog["live_model"]["provider"],"Google Gemini Live")

    def test_registration_invite_gate_and_persistent_auth_throttle(self):
        settings.registration_invite_code = "team-invite-2026"
        rejected = self.client.post("/api/auth/register", json={"email":"blocked@example.test","password":"sufficient-test-password"})
        self.assertEqual(rejected.status_code,403)
        accepted = self.client.post("/api/auth/register", json={"email":"invited@example.test","password":"sufficient-test-password","invite_code":"team-invite-2026"})
        self.assertEqual(accepted.status_code,200)
        for _ in range(9):
            self.client.post("/api/auth/login", json={"email":"missing@example.test","password":"sufficient-test-password"})
        limited = self.client.post("/api/auth/login", json={"email":"missing@example.test","password":"sufficient-test-password"})
        self.assertEqual(limited.status_code,429)
        from app.db import transaction
        with transaction() as conn:
            self.assertGreater(conn.execute("SELECT COUNT(*) FROM auth_rate_limits").fetchone()[0],0)

    def test_daily_provider_request_limit_and_usage_endpoint(self):
        settings.daily_provider_request_limit = 2
        settings.model_pricing_json = json.dumps({"openai:gpt-4o-mini":{"input_usd_per_million":1,"output_usd_per_million":2,"cached_input_usd_per_million":0.5}})
        conversation = self.client.post("/api/conversations", json={}).json()
        async def fake_stream(_model, _messages, on_usage=None):
            on_usage({"input_tokens":10,"output_tokens":5,"cached_input_tokens":4,"cache_write_input_tokens":0})
            yield "A bounded response."
        with patch("app.main.stream_completion", fake_stream):
            for _ in range(2):
                response = self.client.post("/api/chat/stream", json={"conversation_id":conversation["id"],"message":"Hello","model_id":"openai:gpt-4o-mini"})
                self.assertEqual(response.status_code,200)
            exceeded = self.client.post("/api/chat/stream", json={"conversation_id":conversation["id"],"message":"One more","model_id":"openai:gpt-4o-mini"})
        self.assertEqual(exceeded.status_code,429)
        usage = self.client.get("/api/usage").json()
        self.assertEqual(usage["provider_requests"],2)
        self.assertEqual(usage["daily_limit"],2)
        self.assertEqual(usage["input_tokens"],20)
        self.assertEqual(usage["output_tokens"],10)
        self.assertEqual(usage["cached_input_tokens"],8)
        self.assertAlmostEqual(usage["estimated_cost_usd"],0.000036)
        self.assertTrue(usage["cost_estimate_complete"])
        from app.usage_meter import estimate_cost
        self.assertIsNone(estimate_cost("openai:gpt-4o-mini",10,5,4,2))
        settings.model_pricing_json = json.dumps({"openai:gpt-4o-mini":{"input_usd_per_million":1,"output_usd_per_million":2,"cached_input_usd_per_million":0.5,"cache_write_input_usd_per_million":3}})
        self.assertAlmostEqual(estimate_cost("openai:gpt-4o-mini",10,5,4,2),0.000022)

    def test_compact_conversation_summary_preserves_context_and_can_be_cleared(self):
        conversation = self.client.post("/api/conversations", json={}).json()
        with transaction() as conn:
            for index in range(40):
                role = "user" if index % 2 == 0 else "assistant"
                content = f"Earlier task message {index}. Keep the project requirement and decision {index}."
                model_id = "gemini-live:test" if index in (6,7) else "openai:gpt-4o-mini"
                attachments = '["attachment"]' if index == 8 else "[]"
                if index in (6,7,8,9): content = "SECRET screen and file content that must not enter the compact summary."
                conn.execute("INSERT INTO messages(id,conversation_id,role,content,model_id,attachment_ids,created_at) VALUES(?,?,?,?,?,?,?)", (str(uuid.uuid4()),conversation["id"],role,content,model_id,attachments,f"2020-01-01T00:00:{index:02d}Z"))
        provider_calls = []
        async def fake_stream(_model, messages, on_usage=None):
            provider_calls.append(messages)
            if "Update the compact summary" in messages[0]["content"]:
                self.assertNotIn("SECRET screen and file content", messages[0]["content"])
                yield "The user is working on a project; preserve its requirements and prior decisions."
            else:
                yield "A context-aware response."
        with patch("app.main.stream_completion", fake_stream):
            first = self.client.post("/api/chat/stream", json={"conversation_id":conversation["id"],"message":"Continue the project","model_id":"openai:gpt-4o-mini"})
            second = self.client.post("/api/chat/stream", json={"conversation_id":conversation["id"],"message":"What decisions did we make?","model_id":"openai:gpt-4o-mini"})
        self.assertEqual(first.status_code,200)
        self.assertEqual(second.status_code,200)
        saved = self.client.get(f"/api/conversations/{conversation['id']}").json()
        self.assertIn("preserve its requirements",saved["conversation"]["summary"])
        self.assertEqual(saved["conversation"]["summary_through"],22)
        self.assertIn("Compact summary of earlier text-only conversation context",provider_calls[2][-1]["content"])
        self.assertEqual(self.client.get("/api/usage").json()["provider_requests"],3)
        cleared = self.client.delete(f"/api/conversations/{conversation['id']}/summary")
        self.assertEqual(cleared.status_code,200)
        after = self.client.get(f"/api/conversations/{conversation['id']}").json()
        self.assertEqual(after["conversation"]["summary"],"")
        self.assertEqual(after["conversation"]["summary_through"],44)
        self.assertGreater(len(after["messages"]),40)

    def test_action_suggestions_share_daily_provider_cap(self):
        settings.daily_provider_request_limit = 1
        conversation = self.client.post("/api/conversations", json={}).json()
        async def fake_stream(_model, _messages, on_usage=None):
            yield '{"action_type":"copy_text","payload":{"text":"Done"}}'
        with patch("app.main.stream_completion", fake_stream):
            first = self.client.post("/api/actions/suggest", json={"conversation_id":conversation["id"],"model_id":"openai:gpt-4o-mini","intent":"Copy a short response"})
            second = self.client.post("/api/actions/suggest", json={"conversation_id":conversation["id"],"model_id":"openai:gpt-4o-mini","intent":"Copy another response"})
        self.assertEqual(first.status_code,200)
        self.assertEqual(second.status_code,429)

    def test_conversation_crud_and_stream_persisted_messages(self):
        conversation = self.client.post("/api/conversations", json={}).json()
        self.assertEqual(self.client.patch(f"/api/conversations/{conversation['id']}", json={"title": "Debugging"}).json()["title"], "Debugging")

        async def fake_stream(_model, _messages, on_usage=None):
            yield "A streamed answer."

        with patch("app.main.stream_completion", fake_stream):
            response = self.client.post("/api/chat/stream", json={
                "conversation_id": conversation["id"], "message": "Explain this", "model_id": "openai:gpt-4o-mini"
            })
        self.assertEqual(response.status_code, 200)
        self.assertIn('"type": "delta"', response.text)
        self.assertIn('"type": "done"', response.text)
        stored = self.client.get(f"/api/conversations/{conversation['id']}").json()
        self.assertEqual([item["role"] for item in stored["messages"]], ["user", "assistant"])
        self.assertEqual(stored["messages"][-1]["content"], "A streamed answer.")
        self.assertEqual([item["id"] for item in self.client.get("/api/conversations?q=streamed%20answer").json()["conversations"]], [conversation["id"]])
        self.assertEqual(self.client.get("/api/conversations?q=not%20present").json()["conversations"], [])
        self.client.delete(f"/api/conversations/{conversation['id']}")
        self.assertEqual(self.client.get(f"/api/conversations/{conversation['id']}").status_code, 404)

    def test_unknown_model_is_rejected(self):
        response = self.client.post("/api/chat/stream", json={"conversation_id": "missing", "message": "hi", "model_id": "unknown:model"})
        self.assertEqual(response.status_code, 400)

    def test_workspace_and_account_deletion_remove_owned_data(self):
        conversation = self.client.post("/api/conversations", json={}).json()
        upload = self.client.post("/api/files", data={"conversation_id": conversation["id"]},
                                  files={"file": ("notes.txt", b"private notes", "text/plain")})
        self.assertEqual(upload.status_code, 200)
        stored = Path(settings.upload_dir, f"{upload.json()['id']}.bin")
        self.assertTrue(stored.exists())
        self.assertEqual(self.client.delete("/api/workspace").status_code, 200)
        self.assertEqual(self.client.get("/api/conversations").json()["conversations"], [])
        self.assertFalse(stored.exists())
        self.assertEqual(self.client.get("/api/auth/me").json()["email"], "owner@example.test")
        conversation = self.client.post("/api/conversations", json={}).json()
        upload = self.client.post("/api/files", data={"conversation_id": conversation["id"]},
                                  files={"file": ("keep.txt", b"account data", "text/plain")})
        stored = Path(settings.upload_dir, f"{upload.json()['id']}.bin")
        rejected = self.client.request("DELETE", "/api/auth/account", json={"password": "wrong-password-value"})
        self.assertEqual(rejected.status_code, 401)
        self.assertTrue(stored.exists())
        deleted = self.client.request("DELETE", "/api/auth/account", json={"password": "sufficient-test-password"})
        self.assertEqual(deleted.status_code, 200)
        self.assertFalse(stored.exists())
        self.assertEqual(self.client.get("/api/auth/me").status_code, 401)

    def test_login_and_conversation_owner_isolation(self):
        login = self.client.post("/api/auth/login", json={"email": "owner@example.test", "password": "sufficient-test-password"})
        self.assertEqual(login.status_code, 200)
        conversation = self.client.post("/api/conversations", json={}).json()
        other = TestClient(app)
        try:
            other_user = other.post("/api/auth/register", json={"email": "other@example.test", "password": "another-secure-password"}).json()
            other.headers.update({"Authorization": f"Bearer {other_user['access_token']}"})
            self.assertEqual(other.get(f"/api/conversations/{conversation['id']}").status_code, 404)
            self.assertEqual(other.delete(f"/api/conversations/{conversation['id']}").status_code, 404)
        finally:
            other.close()

    def test_text_upload_is_private_and_context_is_retained(self):
        conversation = self.client.post("/api/conversations", json={}).json()
        upload = self.client.post("/api/files", data={"conversation_id": conversation["id"]},
                                  files={"file": ("notes.txt", b"The project uses SQLite.", "text/plain")})
        self.assertEqual(upload.status_code, 200)
        attached = upload.json()
        stored_file = Path(settings.upload_dir, f"{attached['id']}.bin")
        self.assertTrue(stored_file.exists())
        self.assertNotIn(str(stored_file), str(upload.json()))

        captured = []

        async def fake_stream(_model, messages, on_usage=None):
            captured.extend(messages)
            yield "The project uses SQLite."

        with patch("app.main.stream_completion", fake_stream):
            response = self.client.post("/api/chat/stream", json={"conversation_id": conversation["id"],
                                       "message": "What database does it use?", "model_id": "openai:gpt-4o-mini",
                                       "file_ids": [attached["id"]]})
        self.assertEqual(response.status_code, 200)
        self.assertIn("The project uses SQLite.", captured[-1]["content"])
        saved = self.client.get(f"/api/conversations/{conversation['id']}").json()
        self.assertEqual(saved["messages"][0]["attachments"][0]["filename"], "notes.txt")
        self.assertEqual(saved["files"][0]["filename"], "notes.txt")
        self.assertEqual(self.client.delete(f"/api/files/{attached['id']}").status_code, 200)
        self.assertFalse(stored_file.exists())

    def test_image_upload_is_validated_and_forwarded_to_vision_model(self):
        conversation = self.client.post("/api/conversations", json={}).json()
        image = io.BytesIO()
        PILImage.new("RGB", (12, 12), "#4466aa").save(image, format="PNG")
        upload = self.client.post("/api/files", data={"conversation_id": conversation["id"]},
                                  files={"file": ("chart.png", image.getvalue(), "image/png")})
        self.assertEqual(upload.status_code, 200)
        file_id = upload.json()["id"]
        captured = []

        async def fake_stream(_model, messages, on_usage=None):
            captured.extend(messages)
            yield "I see a blue chart."

        with patch("app.main.stream_completion", fake_stream):
            response = self.client.post("/api/chat/stream", json={"conversation_id": conversation["id"],
                                       "message": "Describe this image.", "model_id": "openai:gpt-4o-mini",
                                       "file_ids": [file_id]})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(captured[-1]["images"][0]["mime_type"], "image/png")
        self.assertTrue(captured[-1]["images"][0]["data"])

    def test_pdf_upload_extracts_text_and_preserves_native_document_context(self):
        writer = PdfWriter()
        page = writer.add_blank_page(width=612, height=792)
        font = DictionaryObject({NameObject("/Type"): NameObject("/Font"), NameObject("/Subtype"): NameObject("/Type1"), NameObject("/BaseFont"): NameObject("/Helvetica")})
        font_ref = writer._add_object(font)
        page[NameObject("/Resources")] = DictionaryObject({NameObject("/Font"): DictionaryObject({NameObject("/F1"): font_ref})})
        stream = DecodedStreamObject()
        stream.set_data(b"BT /F1 12 Tf 72 720 Td (PDF text extraction works.) Tj ET")
        page[NameObject("/Contents")] = writer._add_object(stream)
        pdf_bytes = io.BytesIO()
        writer.write(pdf_bytes)

        conversation = self.client.post("/api/conversations", json={}).json()
        upload = self.client.post("/api/files", data={"conversation_id": conversation["id"]},
                                  files={"file": ("report.pdf", pdf_bytes.getvalue(), "application/pdf")})
        self.assertEqual(upload.status_code, 200)
        file_id = upload.json()["id"]
        stored = Path(settings.upload_dir, f"{file_id}.bin").read_bytes()
        self.assertIn("PDF text extraction works.", PdfReader(io.BytesIO(stored)).pages[0].extract_text())
        captured = []

        async def fake_stream(_model, messages, on_usage=None):
            captured.extend(messages)
            yield "The report text is available."

        with patch("app.main.stream_completion", fake_stream):
            response = self.client.post("/api/chat/stream", json={"conversation_id": conversation["id"],
                                       "message": "Summarize the report", "model_id": "gemini:gemini-3.8-flash",
                                       "file_ids": [file_id]})
        self.assertEqual(response.status_code, 200)
        self.assertIn("PDF text extraction works.", captured[-1]["content"])
        self.assertEqual(captured[-1]["documents"][0]["mime_type"], "application/pdf")

    def test_upload_rejects_type_and_image_model_without_vision(self):
        conversation = self.client.post("/api/conversations", json={}).json()
        invalid = self.client.post("/api/files", data={"conversation_id": conversation["id"]},
                                   files={"file": ("payload.png", b"not an image", "image/png")})
        self.assertEqual(invalid.status_code, 400)
        unsupported = self.client.post("/api/files", data={"conversation_id": conversation["id"]},
                                       files={"file": ("program.exe", b"binary", "application/octet-stream")})
        self.assertEqual(unsupported.status_code, 400)

        settings.groq_api_key = "test-groq-key"
        try:
            image = io.BytesIO()
            PILImage.new("RGB", (2, 2), "red").save(image, format="PNG")
            uploaded = self.client.post("/api/files", data={"conversation_id": conversation["id"]},
                                        files={"file": ("small.png", image.getvalue(), "image/png")}).json()
            blocked = self.client.post("/api/chat/stream", json={"conversation_id": conversation["id"],
                                         "message": "Inspect", "model_id": "groq:llama-3.3-70b-versatile",
                                         "file_ids": [uploaded["id"]]})
            self.assertEqual(blocked.status_code, 400)
            self.assertIn("not configured for image input", blocked.json()["detail"])
        finally:
            settings.groq_api_key = self.previous_groq_key

    def test_upload_limit_returns_payload_too_large(self):
        conversation = self.client.post("/api/conversations", json={}).json()
        previous_limit = settings.max_upload_bytes
        settings.max_upload_bytes = 8
        try:
            response = self.client.post("/api/files", data={"conversation_id": conversation["id"]},
                                        files={"file": ("notes.txt", b"123456789", "text/plain")})
            self.assertEqual(response.status_code, 413)
            self.assertIn("8 bytes", response.json()["detail"])
        finally:
            settings.max_upload_bytes = previous_limit

    def test_saved_memories_are_owned_and_user_controlled(self):
        saved = self.client.post("/api/memories", json={"content": "Prefer concise answers"})
        self.assertEqual(saved.status_code, 200)
        self.assertTrue(self.client.get("/api/memories").json()["enabled"])
        updated = self.client.patch(f"/api/memories/{saved.json()['id']}", json={"content": "Prefer concise, clear answers"})
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json()["content"], "Prefer concise, clear answers")
        other = TestClient(app)
        registered = other.post("/api/auth/register", json={"email": "other@example.test", "password": "another-secure-password"})
        other.headers.update({"Authorization": f"Bearer {registered.json()['access_token']}"})
        self.assertEqual(other.get("/api/memories").json()["memories"], [])
        self.assertEqual(other.patch(f"/api/memories/{saved.json()['id']}", json={"content": "Changed by another user"}).status_code, 404)
        self.assertEqual(other.delete(f"/api/memories/{saved.json()['id']}").status_code, 404)
        self.assertEqual(self.client.patch("/api/memories/settings", json={"enabled": False}).json(), {"enabled": False})

    def test_actions_require_approval_and_record_activity(self):
        conversation = self.client.post("/api/conversations", json={}).json()
        invalid = self.client.post("/api/actions/propose", json={"conversation_id":conversation["id"],"action_type":"navigate_url","payload":{"url":"javascript:alert(1)"}})
        self.assertEqual(invalid.status_code, 422)
        sensitive = self.client.post("/api/actions/propose", json={"conversation_id":conversation["id"],"action_type":"fill_text","payload":{"label":"Password","value":"secret"}})
        self.assertEqual(sensitive.status_code, 422)
        for label in ("Card Number", "PIN", "Bank Account Number", "Tax ID", "Email Address", "Date of Birth"):
            blocked = self.client.post("/api/actions/propose", json={"conversation_id":conversation["id"],"action_type":"fill_text","payload":{"label":label,"value":"1234"}})
            self.assertEqual(blocked.status_code, 422, label)
        proposal = self.client.post("/api/actions/propose", json={"conversation_id":conversation["id"],"action_type":"open_tab","payload":{"url":"https://example.com/docs"}})
        self.assertEqual(proposal.status_code, 200)
        action_id = proposal.json()["id"]
        self.assertEqual(self.client.post(f"/api/actions/{action_id}/result", json={"result":{"ok":True}}).status_code, 409)
        self.assertEqual(self.client.post(f"/api/actions/{action_id}/approve").json()["status"], "approved")
        self.assertEqual(self.client.post(f"/api/actions/{action_id}/result", json={"result":{"ok":True}}).json()["status"], "completed")
        rejected = self.client.post("/api/actions/propose", json={"conversation_id":conversation["id"],"action_type":"copy_text","payload":{"text":"declined"}}).json()
        self.assertEqual(self.client.post(f"/api/actions/{rejected['id']}/reject").json()["status"], "rejected")
        self.assertEqual(self.client.post(f"/api/actions/{rejected['id']}/approve").status_code, 409)
        events = self.client.get(f"/api/activity?conversation_id={conversation['id']}").json()["events"]
        self.assertEqual([item["event_type"] for item in reversed(events)], ["action_proposed","action_approved","action_completed","action_proposed","action_rejected"])

    def test_model_action_suggestion_is_held_pending(self):
        conversation=self.client.post("/api/conversations",json={}).json();
        async def fake_stream(_model,_messages,on_usage=None):
            yield '{"action_type":"scroll_to_text","payload":{"text":"Installation"}}'
        with patch("app.main.stream_completion",fake_stream):
            result=self.client.post("/api/actions/suggest",json={"conversation_id":conversation["id"],"model_id":"openai:gpt-4o-mini","intent":"Find the installation section","page_context":"Installation guide"})
        self.assertEqual(result.status_code,200)
        self.assertEqual(result.json()["status"],"pending")
        self.assertEqual(result.json()["action_type"],"scroll_to_text")

    def test_explicit_web_search_is_injected_and_sources_persist(self):
        conversation = self.client.post("/api/conversations", json={}).json()
        captured = []
        async def fake_search(_query):
            return [{"title":"Official Docs","url":"https://example.com/docs","content":"Relevant result."}]
        async def fake_stream(_model, messages, on_usage=None):
            captured.extend(messages); yield "Here is a sourced answer."
        with patch("app.main.web_search", fake_search), patch("app.main.stream_completion", fake_stream):
            response = self.client.post("/api/chat/stream", json={"conversation_id":conversation["id"],"message":"Find docs","model_id":"openai:gpt-4o-mini","web_search":True})
        self.assertEqual(response.status_code,200)
        self.assertIn("https://example.com/docs",captured[-1]["content"])
        self.assertIn('"type": "sources"', response.text)
        saved = self.client.get(f"/api/conversations/{conversation['id']}").json()
        self.assertEqual(saved["messages"][-1]["sources"],[{"title":"Official Docs","url":"https://example.com/docs"}])

    def test_live_proxy_configures_resume_and_persists_transcript(self):
        conversation=self.client.post("/api/conversations",json={}).json()
        settings.live_enabled=True
        setups=[]; opened=0
        class FakeUpstream:
            def __init__(self,index): self.index=index
            async def __aenter__(self): return self
            async def __aexit__(self,*_args): return False
            async def send(self,packet): setups.append(json.loads(packet)["setup"])
            def __aiter__(self): return self.events()
            async def events(self):
                yield json.dumps({"setupComplete":{}})
                if self.index==0:
                    yield json.dumps({"sessionResumptionUpdate":{"resumable":True,"newHandle":"resume-token"}})
                    yield json.dumps({"serverContent":{"inputTranscription":{"text":"Explain this chart"},"outputTranscription":{"text":"It shows a rising trend."},"turnComplete":True}})
                    yield json.dumps({"goAway":{}})
                await asyncio.sleep(30)
        def connect(*_args,**_kwargs):
            nonlocal opened
            item=FakeUpstream(opened);opened+=1;return item
        fake_websockets=types.SimpleNamespace(connect=connect)
        with patch.dict(sys.modules,{"websockets":fake_websockets}):
            with self.client.websocket_connect("/api/live") as socket:
                socket.send_json({"token":self.client.headers["Authorization"].split(" ",1)[1],"conversation_id":conversation["id"]})
                received=[]; completions=0
                while completions<2:
                    packet=json.loads(socket.receive_text());received.append(packet);completions+=int("setupComplete" in packet)
                # End the client side explicitly while the mocked resumed provider
                # connection is still open; otherwise TestClient cancels its portal
                # task as the context manager exits on some Starlette/httpx versions.
                socket.close(code=1000)
        self.assertEqual(setups[0]["contextWindowCompression"],{"slidingWindow":{}})
        self.assertEqual(setups[1]["sessionResumption"]["handle"],"resume-token")
        self.assertTrue(any("sessionResumptionUpdate" in item for item in received))
        saved=self.client.get(f"/api/conversations/{conversation['id']}").json()["messages"]
        self.assertEqual([item["content"] for item in saved],["Explain this chart","It shows a rising trend."])
        with transaction() as conn:
            self.assertEqual(conn.execute("SELECT COUNT(*) FROM active_live_sessions").fetchone()[0],0)


if __name__ == "__main__":
    unittest.main()
