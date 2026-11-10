# OmniAssist API

`/api/health`, `/api/auth/register`, and `/api/auth/login` are public. All other `/api` HTTP endpoints require `Authorization: Bearer <access_token>`. JSON requests use `Content-Type: application/json`; the exception is file upload, which uses multipart form data. The API also publishes its interactive OpenAPI schema at `/docs` when the backend is running.

## Authentication and discovery

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Liveness check; public |
| POST | `/api/auth/register` | Create account and issue access token |
| POST | `/api/auth/login` | Authenticate and issue access token |
| GET | `/api/auth/me` | Current account |
| GET | `/api/models` | Configured model catalog and live model capability |
| GET | `/api/usage` | UTC provider request/token totals, configured-rate cost estimate, estimate coverage and optional request limit |

The usage response includes `provider_requests`, `model_calls`, `priced_calls`, `unpriced_calls`, input/output/cached/cache-write token totals, `estimated_cost_usd`, and `cost_estimate_complete`. Cost is `null` when no token call has a configured rate. The ledger records provider-reported token usage; live audio/video is recorded as unpriced because its billing cannot be inferred from the text-stream usage payload.

## Conversations and files

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/conversations?q=...` | List conversations; optional case-insensitive search in title and message text |
| POST | `/api/conversations` | Create conversation |
| GET | `/api/conversations/{id}` | Read conversation, messages, and file metadata |
| PATCH | `/api/conversations/{id}` | Rename conversation |
| DELETE | `/api/conversations/{id}` | Delete conversation and owned records |
| DELETE | `/api/conversations/{id}/summary` | Clear compact summary while keeping source messages |
| POST | `/api/files` | Upload private conversation file (multipart: `conversation_id`, `file`) |
| DELETE | `/api/files/{id}` | Delete an owned upload |
| POST | `/api/chat/stream` | Stream a standard model turn as NDJSON |

`POST /api/chat/stream` accepts `{conversation_id, message, model_id, file_ids?, web_search?}`. Each line is a JSON event; `delta` events contain streamed text and `done` ends the turn. The selected model's registry capabilities determine which file modalities are accepted.

## Memory, actions, and activity

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/memories` | List saved preferences and enabled state |
| POST | `/api/memories` | Add a saved preference (`{content}`) |
| PATCH | `/api/memories/{id}` | Edit an owned preference (`{content}`) |
| DELETE | `/api/memories/{id}` | Delete an owned preference |
| PATCH | `/api/memories/settings` | Enable or disable saved preferences (`{enabled}`) |
| GET | `/api/activity?conversation_id=...` | Read recent account activity, optionally scoped to a conversation |
| GET | `/api/actions?conversation_id=...` | List action proposals for a conversation |
| POST | `/api/actions/propose` | Create a validated pending action |
| POST | `/api/actions/suggest` | Ask a configured standard model for one safe proposal |
| POST | `/api/actions/{id}/approve` | Approve a pending action |
| POST | `/api/actions/{id}/reject` | Reject a pending action |
| POST | `/api/actions/{id}/result` | Report result of an approved extension action |

Actions stay pending until approved. The extension separately confirms approved actions before execution. Only allowlisted action types are supported; arbitrary page JavaScript is never accepted.

## Live session

`/api/live` is an authenticated WebSocket relay. The first JSON packet is `{ "token": "..." }`; subsequent client/provider protocol packets carry Gemini Live audio, sampled image frames, and control messages. This endpoint is separate from ordinary text streaming. The Gemini Live relay persists completed transcript turns and uses provider session resumption where available. Live traffic is Gemini-only in this release.

## Ownership and errors

Conversation, file, memory, action, and activity queries are scoped to the authenticated account. Missing or foreign-owned resources return `404`. Validation errors return `422`, unsupported/unconfigured provider cases return a clear `4xx`/`5xx` response, and configured provider request limits return `429`.
