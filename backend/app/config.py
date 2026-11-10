from pathlib import Path
from pydantic import Field, AliasChoices
from pydantic_settings import BaseSettings, SettingsConfigDict

_BACKEND_DIR = Path(__file__).resolve().parent.parent
_DEFAULT_DB = str(_BACKEND_DIR / "data" / "omniassist.db")
_DEFAULT_UPLOADS = str(_BACKEND_DIR / "data" / "uploads")
_ENV_FILE = str(_BACKEND_DIR / ".env")


class Settings(BaseSettings):
    database_path: str = Field(default=_DEFAULT_DB, validation_alias=AliasChoices("OMNIASSIST_DATABASE_PATH", "database_path"))
    upload_dir: str = Field(default=_DEFAULT_UPLOADS, validation_alias=AliasChoices("OMNIASSIST_UPLOAD_DIR", "upload_dir"))
    max_upload_bytes: int = Field(default=7 * 1024 * 1024, gt=0, le=7 * 1024 * 1024, validation_alias=AliasChoices("OMNIASSIST_MAX_UPLOAD_BYTES", "max_upload_bytes"))
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.8-flash"
    gemini_image_input: bool = True
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    openai_image_input: bool = True
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-haiku-4-5-20251001"
    anthropic_image_input: bool = True
    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"
    groq_image_input: bool = False
    openrouter_api_key: str = ""
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    nvidia_api_key: str = ""
    nvidia_base_url: str = "https://integrate.api.nvidia.com/v1"
    omniassist_web_origin: str = "http://localhost:5173"
    auth_secret: str = Field(default="", validation_alias=AliasChoices("OMNIASSIST_AUTH_SECRET", "auth_secret"))
    registration_invite_code: str = Field(default="", validation_alias=AliasChoices("OMNIASSIST_REGISTRATION_INVITE_CODE", "registration_invite_code"))
    daily_provider_request_limit: int = Field(default=0, ge=0, validation_alias=AliasChoices("OMNIASSIST_DAILY_PROVIDER_REQUEST_LIMIT", "daily_provider_request_limit"))
    live_enabled: bool = Field(default=True, validation_alias=AliasChoices("OMNIASSIST_LIVE_ENABLED", "live_enabled"))
    gemini_live_model: str = Field(default="gemini-3.8-live", validation_alias=AliasChoices("GEMINI_LIVE_MODEL", "gemini_live_model"))
    tavily_api_key: str = Field(default="", validation_alias=AliasChoices("TAVILY_API_KEY", "tavily_api_key"))
    usage_retention_days: int = Field(default=90, gt=0, validation_alias=AliasChoices("OMNIASSIST_USAGE_RETENTION_DAYS", "usage_retention_days"))
    model_pricing_json: str = Field(default="{}", validation_alias=AliasChoices("OMNIASSIST_MODEL_PRICING_JSON", "model_pricing_json"))

    model_config = SettingsConfigDict(env_prefix="", env_file=(_ENV_FILE, ".env", "../.env"), extra="ignore")


settings = Settings()
