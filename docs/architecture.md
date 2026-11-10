# OmniAssist architecture and implementation status

## Runtime layout

```text
Web React/Vite ── REST + NDJSON + WebSocket ── FastAPI ── standard provider adapters
                                                ├── Gemini Live relay (audio + sampled frames)
                                                ├── SQLite (accounts, conversations, files, memories)
                                                ├── private upload directory
                                                └── local hashed lexical retrieval index
Chrome MV3 side panel ── authenticated REST + NDJSON ── shared conversations/actions
                  └── tabCapture + offscreen media document ── WS ── Gemini Live relay
```

The backend owns provider credentials, account data, conversation storage and private uploads. Web sessions use signed bearer tokens; set `OMNIASSIST_AUTH_SECRET` to a stable random secret before deployment. Existing anonymous conversations are assigned to the first registered account during migration. SQLite is suitable for a local single-process install; multi-worker deployment needs a shared database, durable key management and migration/backup procedures.

## Standard model gateway

`backend/app/providers.py` exposes configured Gemini, OpenAI API, Anthropic Claude and Groq models. Capability flags are returned without credentials. Provider-specific request formatting lives in `backend/app/ai/providers/`. Standard provider streams report token metadata where the provider supplies it; the per-account usage ledger calculates estimated USD only for model IDs with operator-configured rates. The regular chat stream is distinct from `/api/live`; live media is currently Gemini-only. Image support is configured per model. PDFs go natively to Gemini/Claude and as extracted text to OpenAI/Groq.

## Files and retrieval

Files are allowlisted by extension and signature, size bounded, stored under a private random ID, and deleted with their conversation. PDF and text/code extraction is bounded. Extracted text is divided into overlapping chunks and represented by stable hashed lexical vectors in SQLite. Query terms select up to five relevant excerpts for a conversation; this is local lexical retrieval and does not use a hosted embedding/vector service. Saved memories are user-authored, visible/editable/deletable in settings, and only injected when enabled.

## Live session

The web client explicitly requests `getDisplayMedia()` and microphone access, encodes audio for Gemini Live, and sends resized JPEG observations at a fixed maximum of one frame per second. The extension uses a user-clicked `tabCapture.getMediaStreamId()` call in the MV3 service worker, then consumes that stream in an offscreen `USER_MEDIA` document. Both clients send audio/video to the authenticated backend Gemini Live relay without exposing the provider API key. Screen and microphone capture can be stopped independently. Extension audio replies play through its offscreen audio context; web audio replies play in the page. The web client displays a local screen preview. Both clients show the Live provider/model, screen and microphone status, elapsed session time, and listening/thinking/speaking/reconnecting states. Frames are resized and a 32×18 full-frame luminance difference check suppresses near-identical frames, with a 15-second refresh. Local checks slow to two-second intervals while stable and run once per second after changes; delivery to the provider is capped at one frame per second. Transcribed user speech forces a fresh observation, and both clients expose a manual live-frame capture control. The relay requests input/output transcription, persists completed transcript turns, enables context-window compression, retains Gemini session-resumption handles, and reconnects through GoAway/provider socket resets with a bounded retry for transient failures. Gemini documents a 2-minute audio/video session limit without context compression and recommends resumption for periodic connection resets; this flow still needs real-credential soak testing.

Chrome capture APIs have distinct permissions and lifecycle constraints. The MV3 side panel shares account conversations and model selection, offers direct page-summary and selected-text explanation actions, reads page/selection text on demand, attaches a still capture, and can start/stop extension tab and microphone streams. Extension remote APIs must use HTTPS and be listed in `host_permissions`. Actions are allowlisted, validated server-side, marked pending until user approval, and require a second confirmation before execution. No model-provided JavaScript is evaluated.

## Authenticated API

- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
- `GET /api/usage` (UTC request/token totals, configured-rate cost estimate and estimate coverage)
- `DELETE /api/conversations/{id}/summary` (clear compacted conversation context, retaining original messages)
- Authenticated conversation CRUD and case-insensitive title/message search (`GET /api/conversations?q=...`)
- `POST /api/files`, `DELETE /api/files/{id}`
- `POST /api/chat/stream` (NDJSON response, optional file IDs)
- `GET/POST /api/memories`, `PATCH /api/memories/settings`, `DELETE /api/memories/{id}`
- `GET /api/activity`, `GET /api/actions`, `POST /api/actions/suggest`, `POST /api/actions/propose`, `POST /api/actions/{id}/approve`, `POST /api/actions/{id}/reject`, `POST /api/actions/{id}/result`
- `WS /api/live` (first packet `{token: ...}`, then Gemini Live client protocol messages)

## Status against the supplied requirements

Implemented: standard text streaming; provider selection; account ownership; private image/PDF/text uploads; PDF/text extraction; local RAG; user-managed saved memories with add/edit/delete/disable controls; automatic compact summaries of eligible text-only conversation context with a user clear control; opt-in Tavily search with source persistence; model-suggested structured actions with server validation, approval, rejection and activity logging; standard provider token usage with operator-configured rate estimates; turn-based browser dictation and speech synthesis; web and extension live media through Gemini Live; adaptive live frame sampling and status; MV3 side panel with shared conversation/model access, page extraction, direct page and selection actions, screenshot attachment and approved-action execution.

Not complete: compact live-session summaries; automatic memory extraction; complete cost coverage (live-media billing and calls without provider token metadata remain unpriced); PostgreSQL production migration/load validation and full browser/provider acceptance with real credentials.

## Validation

Backend tests use `python -m unittest discover -s tests -v`. Web client type-check and production bundle use `npm run build` from `apps/web`. Live provider operation requires a real configured Gemini credential and a compatible account/model; it cannot be simulated by ordinary text model tests.
