"""Small local lexical retrieval index; file text stays in the private backend."""
import hashlib
import json
import math
import re


def _vector(text: str) -> dict[str, float]:
    counts: dict[str, float] = {}
    for term in re.findall(r"[a-zA-Z0-9_]{2,}", text.lower()):
        # Stable hashed feature buckets provide a dependency-free local vector.
        key = str(int.from_bytes(hashlib.blake2s(term.encode(), digest_size=2).digest(), "big") % 4096)
        counts[key] = counts.get(key, 0.0) + 1.0
    norm = math.sqrt(sum(v*v for v in counts.values())) or 1.0
    return {k: v/norm for k, v in counts.items()}


def chunks(text: str, size: int = 1100, overlap: int = 150):
    start = 0
    while start < len(text):
        end = min(len(text), start + size)
        yield text[start:end]
        if end == len(text):
            break
        start = end - overlap


def index_file(conn, file_id: str, text: str, created_at: str):
    conn.execute("DELETE FROM file_chunks WHERE file_id=?", (file_id,))
    for index, content in enumerate(chunks(text)):
        conn.execute("INSERT INTO file_chunks(id,file_id,chunk_index,content,vector_json,created_at) VALUES(?,?,?,?,?,?)",
                     (f"{file_id}:{index}", file_id, index, content, json.dumps(_vector(content)), created_at))


def retrieve(conn, conversation_id: str, query: str, limit: int = 5):
    query_vector = _vector(query)
    rows = conn.execute("SELECT fc.content,fc.vector_json,f.filename FROM file_chunks fc JOIN files f ON f.id=fc.file_id WHERE f.conversation_id=?", (conversation_id,)).fetchall()
    scored = []
    for row in rows:
        vector = json.loads(row["vector_json"])
        score = sum(value * vector.get(key, 0) for key, value in query_vector.items())
        if score > 0.025:
            scored.append((score, row["filename"], row["content"]))
    return sorted(scored, reverse=True)[:limit]
