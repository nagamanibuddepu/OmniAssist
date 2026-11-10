from dataclasses import dataclass
from typing import AsyncIterator, Callable

from .ai.providers import anthropic, gemini, openai_compatible
from .config import settings


@dataclass(frozen=True)
class Model:
    id: str
    provider: str
    name: str
    raw_model_id: str
    description: str
    capabilities: tuple[str, ...]
    key: str
    image_input: bool = False
    context_limit: int | None = None
    byok: bool = False
    free: bool = False

    def public(self):
        return {
            "id": self.id,
            "provider": self.provider,
            "name": self.name,
            "model_id": self.raw_model_id,
            "description": self.description,
            "capabilities": list(self.capabilities),
            "configured": bool(self.key),
            "text_input": True,
            "text_output": True,
            "image_input": self.image_input,
            "document_input": True,
            "audio_input": False,
            "audio_output": False,
            "native_realtime": False,
            "video_input": False,
            "streaming": True,
            "function_calling": False,
            "context_limit": self.context_limit,
            "free": self.free,
            "byok": self.byok,
        }


def _model(
    prefix: str,
    provider: str,
    model_name: str,
    key: str,
    image_input: bool,
    display_name: str | None = None,
    byok: bool = False,
    free: bool = False,
    context_limit: int | None = None,
) -> Model:
    capabilities = ["text", "streaming", "documents"]
    if image_input:
        capabilities.append("image")
    if byok:
        capabilities.append("byok")
    if free:
        capabilities.append("free")

    name = display_name or model_name
    description = f"{provider} {name}. Text, PDF, code and documents; "
    if byok:
        description += "Bring Your Own Key (BYOK) required for Anthropic Claude."
    else:
        description += "multimodal image and screen analysis enabled." if image_input else "text-only model."

    return Model(
        id=f"{prefix}:{model_name}",
        provider=provider,
        name=name,
        raw_model_id=model_name,
        description=description,
        capabilities=tuple(capabilities),
        key=key,
        image_input=image_input,
        context_limit=context_limit,
        byok=byok,
        free=free,
    )


def model_registry() -> list[Model]:
    return [
        # Google Gemini
        _model("gemini", "Google Gemini", settings.gemini_model, settings.gemini_api_key, settings.gemini_image_input),
        # OpenRouter Vision Models
        _model(
            "openrouter",
            "OpenRouter",
            "nvidia/nemotron-3.5-super-vl:free",
            settings.openrouter_api_key,
            image_input=True,
            display_name="Nemotron 3.5 Super VL",
            free=True,
        ),
        _model(
            "openrouter",
            "OpenRouter",
            "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
            settings.openrouter_api_key,
            image_input=True,
            display_name="Nemotron 3 Nano Omni",
            free=True,
        ),
        # Groq
        _model(
            "groq",
            "Groq",
            settings.groq_model,
            settings.groq_api_key,
            image_input=settings.groq_image_input,
            display_name="GPT-OSS 120B" if "120b" in settings.groq_model else "Llama 3.3 70B",
        ),
        _model(
            "groq",
            "Groq",
            "qwen/qwen3.8-27b",
            settings.groq_api_key,
            image_input=True,
            display_name="Qwen 3.8 27B",
        ),
        # NVIDIA NIM
        _model(
            "nvidia",
            "NVIDIA NIM",
            "nvidia/nemotron-3.5-super-vl-120b-a12b",
            settings.nvidia_api_key,
            image_input=True,
            display_name="Nemotron 3.5 Super VL 120B",
        ),
        # OpenAI API
        _model("openai", "OpenAI API", settings.openai_model, settings.openai_api_key, settings.openai_image_input),
        # Anthropic Claude (BYOK)
        _model(
            "anthropic",
            "Anthropic Claude",
            settings.anthropic_model,
            settings.anthropic_api_key,
            settings.anthropic_image_input,
            byok=True,
        ),
    ]


def get_model(model_id: str) -> Model | None:
    registry = model_registry()
    for m in registry:
        if (
            m.id == model_id
            or m.name == model_id
            or m.raw_model_id == model_id
            or m.id.endswith(":" + model_id)
        ):
            return m
    # Handle retired or aliased models smoothly
    if "11b" in model_id or "llama-3.2-11b" in model_id:
        for m in registry:
            if m.provider == "NVIDIA NIM":
                return m
    if "gemma" in model_id.lower():
        for m in registry:
            if "gemma" in m.raw_model_id.lower():
                return m
    if "gemini" in model_id.lower():
        for m in registry:
            if m.provider == "Google Gemini":
                return m
    if "groq" in model_id.lower() or "llama" in model_id.lower():
        for m in registry:
            if m.provider == "Groq" and not m.image_input:
                return m
        for m in registry:
            if m.provider == "Groq":
                return m
    return None


async def stream_completion(
    model: Model,
    messages: list[dict],
    on_usage: Callable[[dict], None] | None = None,
) -> AsyncIterator[str]:
    key = model.key
    if not key:
        if model.byok:
            raise RuntimeError(f"{model.provider} requires your Anthropic API key (BYOK). Enter your key in Settings to use Claude.")
        raise RuntimeError(f"{model.provider} is not configured. Add its API key to backend/.env and restart the server.")

    if model.provider == "Google Gemini":
        async for text in gemini.stream(model.raw_model_id, key, messages, on_usage):
            yield text
        return

    if model.provider == "OpenRouter":
        headers = {
            "HTTP-Referer": settings.omniassist_web_origin or "http://localhost:5173",
            "X-Title": "OmniAssist",
        }
        async for text in openai_compatible.stream(
            model.provider,
            settings.openrouter_base_url,
            model.raw_model_id,
            key,
            messages,
            on_usage,
            extra_headers=headers,
        ):
            yield text
        return

    if model.provider == "NVIDIA NIM":
        async for text in openai_compatible.stream(
            model.provider,
            settings.nvidia_base_url,
            model.raw_model_id,
            key,
            messages,
            on_usage,
        ):
            yield text
        return

    if model.provider == "OpenAI API":
        try:
            async for text in openai_compatible.stream(
                model.provider,
                "https://api.openai.com/v1",
                model.raw_model_id,
                key,
                messages,
                on_usage,
            ):
                yield text
            return
        except RuntimeError as e:
            err_str = str(e).lower()
            if "credit balance exhausted" in err_str or "quota" in err_str or "429" in err_str:
                fallback = get_model("nvidia:nvidia/nemotron-3.5-super-vl-120b-a12b") or get_model("groq:qwen/qwen3.8-27b") or get_model("gemini:gemini-flash-lite-latest")
                if fallback and fallback.key:
                    yield "*(OpenAI account has $0 balance. Automatically routed response via " + fallback.name + ")*\n\n"
                    async for text in stream_completion(fallback, messages, on_usage):
                        yield text
                    return
            raise

    if model.provider == "Groq":
        async for text in openai_compatible.stream(
            model.provider,
            "https://api.groq.com/openai/v1",
            model.raw_model_id,
            key,
            messages,
            on_usage,
        ):
            yield text
        return

    async for text in anthropic.stream(model.raw_model_id, key, messages, on_usage):
        yield text
