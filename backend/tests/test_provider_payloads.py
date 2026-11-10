import json
import unittest
from unittest.mock import patch

from app.ai.providers import anthropic, gemini, openai_compatible


class FakeResponse:
    is_error = False

    def __init__(self, lines):
        self.lines = lines

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None

    async def aiter_lines(self):
        for line in self.lines:
            yield line


class FakeClient:
    def __init__(self, response_line):
        response_lines = response_line if isinstance(response_line, list) else [response_line]
        self.response = FakeResponse([f"data: {line}" for line in response_lines])
        self.request = None

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None

    def stream(self, method, url, **kwargs):
        self.request = {"method": method, "url": url, **kwargs}
        return self.response


class ProviderPayloadTests(unittest.IsolatedAsyncioTestCase):
    async def test_openai_compatible_image_is_a_data_url(self):
        fake = FakeClient(json.dumps({"choices": [{"delta": {"content": "ok"}}]}))
        with patch("app.ai.providers.openai_compatible.httpx.AsyncClient", return_value=fake):
            output = [part async for part in openai_compatible.stream("OpenAI API", "https://example.test/v1", "vision-model", "server-key", [
                {"role": "user", "content": "What is shown?", "images": [{"mime_type": "image/png", "data": "cG5n"}]}
            ])]
        body = fake.request["json"]
        self.assertEqual(output, ["ok"])
        self.assertEqual(body["messages"][1]["content"][1]["image_url"]["url"], "data:image/png;base64,cG5n")
        self.assertNotIn("server-key", str(body))

    async def test_openai_compatible_usage_trailer_is_reported(self):
        fake = FakeClient([json.dumps({"choices":[{"delta":{"content":"ok"}}]}),json.dumps({"choices":[],"usage":{"prompt_tokens":12,"completion_tokens":4,"prompt_tokens_details":{"cached_tokens":3}}})])
        reports=[]
        with patch("app.ai.providers.openai_compatible.httpx.AsyncClient", return_value=fake):
            output=[part async for part in openai_compatible.stream("OpenAI API","https://example.test/v1","text-model","server-key",[{"role":"user","content":"hi"}],reports.append)]
        self.assertEqual(output,["ok"])
        self.assertEqual(reports[-1],{"input_tokens":12,"output_tokens":4,"cached_input_tokens":3})
        self.assertEqual(fake.request["json"]["stream_options"],{"include_usage":True})

    async def test_anthropic_stream_reports_usage(self):
        fake=FakeClient([json.dumps({"type":"message_start","message":{"usage":{"input_tokens":9,"cache_read_input_tokens":2}}}),json.dumps({"type":"content_block_delta","delta":{"text":"ok"}}),json.dumps({"type":"message_delta","usage":{"output_tokens":3}})])
        reports=[]
        with patch("app.ai.providers.anthropic.httpx.AsyncClient",return_value=fake):
            output=[part async for part in anthropic.stream("claude-model","server-key",[{"role":"user","content":"hi"}],reports.append)]
        self.assertEqual(output,["ok"])
        self.assertEqual(reports[-1],{"input_tokens":11,"output_tokens":3,"cached_input_tokens":2,"cache_write_input_tokens":0})

    async def test_anthropic_receives_image_and_pdf_content_blocks(self):
        fake = FakeClient(json.dumps({"type": "content_block_delta", "delta": {"text": "ok"}}))
        with patch("app.ai.providers.anthropic.httpx.AsyncClient", return_value=fake):
            output = [part async for part in anthropic.stream("claude-vision", "server-key", [
                {"role": "user", "content": "Review these files", "images": [{"mime_type": "image/jpeg", "data": "aW1hZ2U="}],
                 "documents": [{"mime_type": "application/pdf", "data": "cGRm"}]}
            ])]
        content = fake.request["json"]["messages"][0]["content"]
        self.assertEqual(output, ["ok"])
        self.assertEqual([block["type"] for block in content], ["text", "image", "document"])
        self.assertEqual(content[2]["source"]["media_type"], "application/pdf")

    async def test_anthropic_receives_pdf_when_it_is_the_only_attachment(self):
        fake=FakeClient(json.dumps({"type":"content_block_delta","delta":{"text":"read"}}))
        with patch("app.ai.providers.anthropic.httpx.AsyncClient",return_value=fake):
            _=[part async for part in anthropic.stream("claude-vision","server-key",[{"role":"user","content":"Summarize this","documents":[{"mime_type":"application/pdf","data":"cGRm"}]}])]
        content=fake.request["json"]["messages"][0]["content"]
        self.assertEqual(content[0]["type"],"text")
        self.assertEqual(content[1]["type"],"document")

    async def test_gemini_receives_inline_image_and_pdf(self):
        fake = FakeClient(json.dumps({"candidates": [{"content": {"parts": [{"text": "ok"}]}}]}))
        with patch("app.ai.providers.gemini.httpx.AsyncClient", return_value=fake):
            output = [part async for part in gemini.stream("gemini-vision", "server-key", [
                {"role": "user", "content": "Review these files", "images": [{"mime_type": "image/webp", "data": "aW1hZ2U="}],
                 "documents": [{"mime_type": "application/pdf", "data": "cGRm"}]}
            ])]
        body = fake.request["json"]
        self.assertEqual(output, ["ok"])
        self.assertEqual(body["contents"][0]["parts"][1]["inline_data"]["mime_type"], "image/webp")
        self.assertEqual(body["contents"][0]["parts"][2]["inline_data"]["mime_type"], "application/pdf")

    async def test_gemini_stream_reports_multimodal_usage(self):
        fake=FakeClient(json.dumps({"candidates":[{"content":{"parts":[{"text":"ok"}]}}],"usageMetadata":{"promptTokenCount":20,"candidatesTokenCount":4,"thoughtsTokenCount":2,"cachedContentTokenCount":5}}))
        reports=[]
        with patch("app.ai.providers.gemini.httpx.AsyncClient",return_value=fake):
            output=[part async for part in gemini.stream("gemini-model","server-key",[{"role":"user","content":"hi"}],reports.append)]
        self.assertEqual(output,["ok"])
        self.assertEqual(reports[-1],{"input_tokens":20,"output_tokens":6,"cached_input_tokens":5})


if __name__ == "__main__":
    unittest.main()
