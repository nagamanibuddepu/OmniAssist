import json
import math
import uuid
from datetime import datetime, timezone

from .config import settings


def estimate_cost(model_id: str, input_tokens: int, output_tokens: int, cached_input_tokens: int = 0, cache_write_input_tokens: int = 0) -> float | None:
    """Estimate USD using operator-supplied per-million-token rates for a model."""
    try:
        pricing = json.loads(settings.model_pricing_json)
        if not isinstance(pricing, dict):
            return None
        rates = pricing.get(model_id)
        if not isinstance(rates, dict):
            return None
        raw_rates = [rates["input_usd_per_million"], rates["output_usd_per_million"], rates.get("cached_input_usd_per_million", rates["input_usd_per_million"])]
        if cache_write_input_tokens and "cache_write_input_usd_per_million" not in rates:
            return None
        if isinstance(rates.get("cache_write_input_usd_per_million"), bool):
            return None
        write_rate = float(rates["cache_write_input_usd_per_million"]) if cache_write_input_tokens else 0.0
        if any(isinstance(rate, bool) for rate in raw_rates):
            return None
        input_rate, output_rate, cached_rate = map(float, raw_rates)
        if not all(math.isfinite(rate) and rate >= 0 for rate in (input_rate, output_rate, cached_rate, write_rate)):
            return None
        uncached_tokens = max(0, input_tokens - cached_input_tokens - cache_write_input_tokens)
        return (uncached_tokens * input_rate + cached_input_tokens * cached_rate + cache_write_input_tokens * write_rate + output_tokens * output_rate) / 1_000_000
    except (ValueError, TypeError, KeyError, json.JSONDecodeError):
        return None


def persist_usage_event(conn, owner_id: str, model_id: str, usage: dict | None) -> None:
    usage = usage or {}
    timestamp = datetime.now(timezone.utc)
    input_tokens = _token_count(usage.get("input_tokens"))
    output_tokens = _token_count(usage.get("output_tokens"))
    cached_tokens = _token_count(usage.get("cached_input_tokens"))
    cache_write_tokens = _token_count(usage.get("cache_write_input_tokens"))
    cost = None
    if input_tokens is not None and output_tokens is not None:
        cost = estimate_cost(model_id, input_tokens, output_tokens, cached_tokens or 0, cache_write_tokens or 0)
    conn.execute(
        "INSERT INTO model_usage_events(id,owner_id,usage_date,model_id,input_tokens,output_tokens,cached_input_tokens,cache_write_input_tokens,estimated_cost_usd,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
        (str(uuid.uuid4()), owner_id, timestamp.date().isoformat(), model_id,
         input_tokens, output_tokens, cached_tokens, cache_write_tokens, cost, timestamp.isoformat()),
    )


def _token_count(value) -> int | None:
    if isinstance(value, int) and not isinstance(value, bool) and value >= 0:
        return value
    return None
