import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from .config import settings


def connect() -> sqlite3.Connection:
    path = Path(settings.database_path)
    if not path.is_absolute():
        path = (Path(__file__).resolve().parent.parent / path).resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def initialize() -> None:
    conn = connect()
    try:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE COLLATE NOCASE,
          password_hash TEXT NOT NULL,
          memory_enabled INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS auth_rate_limits (
          client_key TEXT PRIMARY KEY,
          window_started REAL NOT NULL,
          request_count INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS provider_usage (
          owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          usage_date TEXT NOT NULL,
          request_count INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY(owner_id, usage_date)
        );
        CREATE TABLE IF NOT EXISTS model_usage_events (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          usage_date TEXT NOT NULL,
          model_id TEXT NOT NULL,
          input_tokens INTEGER,
          output_tokens INTEGER,
          cached_input_tokens INTEGER,
          cache_write_input_tokens INTEGER,
          estimated_cost_usd REAL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_model_usage_owner_date ON model_usage_events(owner_id,usage_date);
        CREATE TABLE IF NOT EXISTS active_live_sessions (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          session_id TEXT NOT NULL UNIQUE,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS conversations (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL DEFAULT 'legacy' REFERENCES users(id),
          title TEXT NOT NULL,
          summary TEXT NOT NULL DEFAULT '',
          summary_through INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at DESC);
        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
          role TEXT NOT NULL CHECK(role IN ('user','assistant')),
          content TEXT NOT NULL,
          model_id TEXT,
          attachment_ids TEXT NOT NULL DEFAULT '[]',
          source_urls TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at);
        CREATE TABLE IF NOT EXISTS files (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
          filename TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          size_bytes INTEGER NOT NULL,
          extracted_text TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_files_conversation_created ON files(conversation_id, created_at);
        CREATE TABLE IF NOT EXISTS memories (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          content TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS activity_events (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          conversation_id TEXT,
          event_type TEXT NOT NULL,
          detail_json TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_activity_owner_created ON activity_events(owner_id, created_at DESC);
        CREATE TABLE IF NOT EXISTS file_chunks (
          id TEXT PRIMARY KEY,
          file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
          chunk_index INTEGER NOT NULL,
          content TEXT NOT NULL,
          vector_json TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_chunks_file ON file_chunks(file_id, chunk_index);
        CREATE TABLE IF NOT EXISTS actions (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
          action_type TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          result_json TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_actions_owner_status ON actions(owner_id, status);
        """)
        message_columns = {row["name"] for row in conn.execute("PRAGMA table_info(messages)")}
        if "attachment_ids" not in message_columns:
            conn.execute("ALTER TABLE messages ADD COLUMN attachment_ids TEXT NOT NULL DEFAULT '[]'")
        if "source_urls" not in message_columns:
            conn.execute("ALTER TABLE messages ADD COLUMN source_urls TEXT NOT NULL DEFAULT '[]'")
        conversation_columns = {row["name"] for row in conn.execute("PRAGMA table_info(conversations)")}
        if "owner_id" not in conversation_columns:
            conn.execute("ALTER TABLE conversations ADD COLUMN owner_id TEXT NOT NULL DEFAULT 'legacy'")
        if "summary" not in conversation_columns:
            conn.execute("ALTER TABLE conversations ADD COLUMN summary TEXT NOT NULL DEFAULT ''")
        if "summary_through" not in conversation_columns:
            conn.execute("ALTER TABLE conversations ADD COLUMN summary_through INTEGER NOT NULL DEFAULT 0")
        usage_columns = {row["name"] for row in conn.execute("PRAGMA table_info(model_usage_events)")}
        if "cache_write_input_tokens" not in usage_columns:
            conn.execute("ALTER TABLE model_usage_events ADD COLUMN cache_write_input_tokens INTEGER")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_conversations_owner_updated ON conversations(owner_id, updated_at DESC)")
        conn.execute("INSERT OR IGNORE INTO users(id,email,password_hash,created_at) VALUES('legacy','legacy-local@omniassist.invalid','',?)", (datetime.now(timezone.utc).isoformat(),))
    finally:
        conn.close()


@contextmanager
def transaction():
    conn = connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
