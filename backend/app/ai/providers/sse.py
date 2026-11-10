import json
from typing import AsyncIterator

import httpx


async def event_data(response: httpx.Response) -> AsyncIterator[str]:
    async for line in response.aiter_lines():
        if line.startswith("data:"):
            value = line[5:].strip()
            if value and value != "[DONE]":
                yield value


def provider_error(provider: str, response: httpx.Response) -> RuntimeError:
    detail = ""
    error_code = ""
    error_type = ""
    try:
        content = response.read()
        if content:
            data = json.loads(content)
            if isinstance(data, dict):
                err = data.get("error")
                if isinstance(err, dict):
                    detail = err.get("message", "")
                    error_code = str(err.get("code", ""))
                    error_type = str(err.get("type", ""))
                elif isinstance(err, str):
                    detail = err
                if not detail:
                    detail = data.get("detail") or data.get("title") or ""
    except Exception:
        pass

    if response.status_code == 429:
        if (
            error_code == "credit_balance_exhausted"
            or error_type == "insufficient_quota"
            or "credit" in detail.lower()
            or "quota" in detail.lower()
        ):
            return RuntimeError(
                f"{provider} credit balance exhausted ($0 balance). OpenAI requires adding a prepaid credit balance at https://platform.openai.com/settings/organization/billing before API keys can be used. In the meantime, use free multimodal models like OpenRouter Nemotron 3.5 Super VL, Google Gemini Flash, or Groq Qwen 3.8."
            )
        if "rate-limited upstream" in detail.lower() or "temporarily" in detail.lower():
            return RuntimeError(
                f"{provider} free-tier route is temporarily busy upstream: {detail}. Switch to Nemotron 3.5 Super VL (Free) or Groq for instant responses."
            )
        return RuntimeError(f"{provider} rate limit exceeded (429). {detail}".strip())

    if response.status_code in (404, 410):
        return RuntimeError(f"{provider} model retired or unavailable ({response.status_code}): {detail or 'The requested model is no longer available on this provider.'}")

    if detail:
        return RuntimeError(f"{provider} error ({response.status_code}): {detail[:300]}")
    return RuntimeError(f"{provider} request failed ({response.status_code}). Check the model configuration and provider status.")
