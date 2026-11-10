import base64
import hashlib
import hmac
import json
import re
import secrets
import time
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import settings
from .db import transaction
from .file_service import remove_file
from .schemas import AccountDelete, Credentials

router = APIRouter(prefix="/api/auth", tags=["auth"])
_bearer = HTTPBearer(auto_error=False)
_local_secret = secrets.token_bytes(32)
_secret = settings.auth_secret.encode("utf-8") if settings.auth_secret else _local_secret
_email_pattern = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
_dummy_hash = "pbkdf2_sha256$310000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="


def _b64(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _b64decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 310_000)
    return f"pbkdf2_sha256$310000${_b64(salt)}${_b64(digest)}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        scheme, iterations, salt, expected = encoded.split("$")
        if scheme != "pbkdf2_sha256":
            return False
        actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), _b64decode(salt), int(iterations))
        return hmac.compare_digest(actual, _b64decode(expected))
    except (ValueError, TypeError):
        return False


def issue_token(user_id: str) -> str:
    now = int(time.time())
    header = _b64(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    payload = _b64(json.dumps({"sub": user_id, "iat": now, "exp": now + 12 * 60 * 60}, separators=(",", ":")).encode())
    unsigned = f"{header}.{payload}"
    signature = _b64(hmac.new(_secret, unsigned.encode(), hashlib.sha256).digest())
    return f"{unsigned}.{signature}"


def _user_from_token(token: str) -> dict | None:
    try:
        header, payload, signature = token.split(".")
        unsigned = f"{header}.{payload}"
        expected = hmac.new(_secret, unsigned.encode(), hashlib.sha256).digest()
        if not hmac.compare_digest(expected, _b64decode(signature)):
            return None
        claims = json.loads(_b64decode(payload))
        if int(claims["exp"]) < int(time.time()):
            return None
        with transaction() as conn:
            row = conn.execute("SELECT id,email,memory_enabled,created_at FROM users WHERE id=?", (claims["sub"],)).fetchone()
        return dict(row) if row else None
    except (ValueError, KeyError, TypeError, json.JSONDecodeError):
        return None


def current_user(credentials: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> dict:
    user = _user_from_token(credentials.credentials) if credentials and credentials.scheme.lower() == "bearer" else None
    if not user:
        raise HTTPException(401, "Sign in to continue.", headers={"WWW-Authenticate": "Bearer"})
    return user


def _rate_limit(request: Request) -> None:
    raw_key = request.client.host if request.client else "unknown"
    key = hashlib.sha256(raw_key.encode("utf-8")).hexdigest()
    current = time.time()
    with transaction() as conn:
        conn.execute("""
            INSERT INTO auth_rate_limits(client_key,window_started,request_count) VALUES(?,?,1)
            ON CONFLICT(client_key) DO UPDATE SET
              request_count=CASE WHEN auth_rate_limits.window_started < ? THEN 1 ELSE auth_rate_limits.request_count+1 END,
              window_started=CASE WHEN auth_rate_limits.window_started < ? THEN ? ELSE auth_rate_limits.window_started END
        """, (key,current,current-60,current-60,current))
        count = conn.execute("SELECT request_count FROM auth_rate_limits WHERE client_key=?", (key,)).fetchone()["request_count"]
        conn.execute("DELETE FROM auth_rate_limits WHERE window_started < ?", (current-86400,))
    if count > 12:
        raise HTTPException(429, "Too many sign-in attempts. Try again in a minute.")


def _session(row) -> dict:
    user = {"id": row["id"], "email": row["email"], "memory_enabled": bool(row["memory_enabled"]), "created_at": row["created_at"]}
    return {"access_token": issue_token(row["id"]), "token_type": "bearer", "expires_in": 43200, "user": user}


@router.post("/register")
def register(body: Credentials, request: Request):
    _rate_limit(request)
    if settings.registration_invite_code and not hmac.compare_digest(body.invite_code, settings.registration_invite_code):
        raise HTTPException(403, "A valid account invitation code is required.")
    email = body.email.strip().lower()
    if not _email_pattern.fullmatch(email):
        raise HTTPException(422, "Enter a valid email address.")
    if len(body.password) < 10:
        raise HTTPException(422, "Use a password with at least 10 characters.")
    user_id, created = str(uuid.uuid4()), datetime.now(timezone.utc).isoformat()
    with transaction() as conn:
        try:
            conn.execute("INSERT INTO users(id,email,password_hash,created_at) VALUES(?,?,?,?)",
                         (user_id, email, hash_password(body.password), created))
        except Exception as exc:
            if "UNIQUE constraint failed" in str(exc):
                raise HTTPException(409, "An account already exists for this email.") from exc
            raise
        conn.execute("UPDATE conversations SET owner_id=? WHERE owner_id='legacy'", (user_id,))
        conn.execute("DELETE FROM users WHERE id='legacy'")
        row = conn.execute("SELECT id,email,memory_enabled,created_at FROM users WHERE id=?", (user_id,)).fetchone()
    return _session(row)


@router.post("/login")
def login(body: Credentials, request: Request):
    _rate_limit(request)
    email = body.email.strip().lower()
    with transaction() as conn:
        row = conn.execute("SELECT id,email,password_hash,memory_enabled,created_at FROM users WHERE email=?", (email,)).fetchone()
    encoded = row["password_hash"] if row else _dummy_hash
    if not verify_password(body.password, encoded) or not row:
        raise HTTPException(401, "Email or password is incorrect.", headers={"WWW-Authenticate": "Bearer"})
    return _session(row)


@router.get("/me")
def me(user: dict = Depends(current_user)):
    return user


@router.delete("/account")
def delete_account(body: AccountDelete, user: dict = Depends(current_user)):
    with transaction() as conn:
        row = conn.execute("SELECT password_hash FROM users WHERE id=?", (user["id"],)).fetchone()
    if not row or not verify_password(body.password, row["password_hash"]):
        raise HTTPException(401, "Password is incorrect.")
    with transaction() as conn:
        file_ids = [item["id"] for item in conn.execute(
            "SELECT files.id FROM files JOIN conversations ON conversations.id=files.conversation_id WHERE conversations.owner_id=?",
            (user["id"],)).fetchall()]
        conn.execute("DELETE FROM conversations WHERE owner_id=?", (user["id"],))
        conn.execute("DELETE FROM memories WHERE user_id=?", (user["id"],))
        conn.execute("DELETE FROM provider_usage WHERE owner_id=?", (user["id"],))
        conn.execute("DELETE FROM model_usage_events WHERE owner_id=?", (user["id"],))
        conn.execute("DELETE FROM activity_events WHERE owner_id=?", (user["id"],))
        conn.execute("DELETE FROM active_live_sessions WHERE user_id=?", (user["id"],))
        conn.execute("DELETE FROM users WHERE id=?", (user["id"],))
    for file_id in file_ids:
        remove_file(file_id)
    return {"deleted": True}
