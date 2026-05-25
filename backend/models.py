from pydantic import BaseModel, Field


class SessionPayload(BaseModel):
    session_id: str = Field(alias="sessionId")
    user_agent: str | None = Field(default=None, alias="userAgent")
    page_url: str | None = Field(default=None, alias="pageUrl")


class LogPayload(BaseModel):
    session_id: str = Field(alias="sessionId")
    level: str
    message: str
    data: dict = Field(default_factory=dict)
    timestamp: str | None = None
