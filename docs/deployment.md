# Deployment and security notes

## Current deployment boundary

OmniAssist is a development-grade service. It supports an optional shared account invitation code, persists authentication-attempt rate limits in SQLite, and can enforce a per-user daily provider-request count. Standard model token usage and configured-rate estimates are tracked; Live-media and external service billing are not completely metered. Before exposing it publicly, add email verification or individually managed invitations, monitoring, backups, and a tested database migration plan. Live API use, browser capture, and third-party search can incur provider charges; request counts are not a cost ceiling.

## Backend

1. Use Python 3.11 or newer and install `backend/requirements.txt` in a locked virtual environment.
2. Store secrets in the host's secret manager or a root-readable environment file. Never commit `.env`.
3. Set `OMNIASSIST_AUTH_SECRET` to at least 32 random bytes encoded as a string. Changing this secret invalidates existing sessions.
4. Set provider keys only for providers/models that are enabled. `GEMINI_API_KEY` is used by standard Gemini and Gemini Live. `TAVILY_API_KEY` is used only when a user turns on web search.
5. Set `OMNIASSIST_DATABASE_PATH` and `OMNIASSIST_UPLOAD_DIR` to durable private storage. Back up the SQLite database and upload directory together. Do not serve the upload directory as static content.
6. Optionally set `OMNIASSIST_REGISTRATION_INVITE_CODE` to require that code for new accounts. Set `OMNIASSIST_DAILY_PROVIDER_REQUEST_LIMIT` to a positive number to enforce a UTC daily request cap (0 disables it). This counts standard turns, action suggestions and Live session starts. `OMNIASSIST_MODEL_PRICING_JSON` accepts per-model input/output USD rates per million tokens; optional cache read/write rates can be configured separately. Usage metadata comes from configured standard provider streams. Live audio/video billing and any call lacking returned token metadata or a required cache-write rate are marked unpriced. Keep rates synchronized with your provider account and model pricing; estimates exclude taxes, discounts, and non-token charges. Request and usage records older than `OMNIASSIST_USAGE_RETENTION_DAYS` (90 days by default) are removed as new provider requests are reserved. The invite is a shared gate, not individual invitation management. Bind Uvicorn to loopback behind an HTTPS reverse proxy. Configure request-size limits, WebSocket proxying, timeouts and rate limiting at the proxy. SQLite coordinates Live-session leases across workers sharing the same database, but use a stable `OMNIASSIST_AUTH_SECRET` on every worker and a local durable database volume. For production concurrency, migrate to PostgreSQL and validate the deployment under load.
7. Configure `OMNIASSIST_WEB_ORIGIN` to the exact HTTPS web origin. The API accepts Chrome extension origins for bearer-token requests; extension pages must be protected by their own session token and HTTPS remote API URL.

## Web client

Build `apps/web` with `npm ci && npm run build`. Serve the generated `dist` directory from the HTTPS origin. Set `VITE_API_BASE_URL` to the API base if it is not same-origin. Ensure `/api/live` is proxied as WebSocket traffic. Provider credentials must never be added to Vite variables.

## Chrome extension

Load `apps/extension` as an unpacked extension in Chrome 116 or newer. For a deployed API, add the exact HTTPS API origin to `host_permissions` in `apps/extension/manifest.json` before distributing the extension. The extension refuses remote HTTP API URLs. After changing the manifest, reload the extension. Its action and live media code use explicit extension UI interaction; tab capture stops on tab switch or tab close. Offscreen capture may request microphone permission separately.

## Data and safety

- Passwords use PBKDF2-SHA256 hashes; API sessions are signed bearer tokens with a 12-hour expiry.
- Provider keys remain on the server. Browser and extension clients keep only the user session token.
- Web search is opt-in per turn and sends that query to the configured Tavily service. Search snippets are treated as untrusted text; returned HTTPS source URLs are persisted with the assistant response.
- Uploaded file bytes are stored privately under random identifiers. Enforce filesystem permissions and include both database and upload directory in backups.
- AI-proposed browser actions are restricted to the documented action types, validated on the server, and cannot execute until the user approves them. The extension confirms again before execution. No arbitrary JavaScript action is supported.
- Once a conversation grows beyond 30 messages, the selected chat model can make an additional request to maintain a compact summary of older text-only turns. Live-transcribed and file-attached turns are excluded; original messages remain stored, and the user can clear the compact summary.
- Live audio/video is streamed to the configured Gemini Live model through the server. Live transcription text is persisted in the selected conversation; raw media frames/audio are not retained by OmniAssist.
- Login and registration throttling uses the shared SQLite database, hashes the client address before storing it, and limits each address to 12 attempts per 60-second window. Still apply edge rate limits and configure proxy handling of client IPs carefully.
