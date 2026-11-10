from typing import Literal
from pydantic import BaseModel, Field


class ConversationCreate(BaseModel):
    title: str = Field(default="New conversation", min_length=1, max_length=120)


class ConversationRename(BaseModel):
    title: str = Field(min_length=1, max_length=120)


class ChatRequest(BaseModel):
    conversation_id: str
    message: str = Field(min_length=1, max_length=20000)
    model_id: str
    file_ids: list[str] = Field(default_factory=list, max_length=3)
    web_search: bool = False
    anthropic_api_key: str = Field(default="", max_length=512)
    tavily_api_key: str = Field(default="", max_length=512)


class Credentials(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=10, max_length=256)
    invite_code: str = Field(default="", max_length=256)


class AccountDelete(BaseModel):
    password: str = Field(min_length=1, max_length=256)


class MemoryCreate(BaseModel):
    content: str = Field(min_length=1, max_length=2000)


class MemoryUpdate(BaseModel):
    enabled: bool


class ActionProposal(BaseModel):
    conversation_id: str
    action_type: Literal["navigate_url", "open_tab", "copy_text", "scroll_to_text", "fill_text", "web_search"]
    payload: dict = Field(max_length=12)


class ActionResult(BaseModel):
    result: dict = Field(default_factory=dict, max_length=12)


class ActionSuggestion(BaseModel):
    conversation_id: str
    model_id: str
    intent: str = Field(min_length=1,max_length=5000)
    page_context: str = Field(default="",max_length=12000)
