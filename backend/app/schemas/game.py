from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field
from app.schemas.move import MoveResponse


class GameCreate(BaseModel):
    raw_sgf: str = Field(..., description="Raw SGF text of the Go game")
    title: Optional[str] = Field(None, description="Optional custom title for the game")
    user_id: Optional[int] = Field(None, description="Optional user ID associated with the game")


class GameSummaryResponse(BaseModel):
    id: int
    user_id: Optional[int] = None
    title: Optional[str] = None
    black_player: Optional[str] = None
    white_player: Optional[str] = None
    komi: float
    rules: str
    result: Optional[str] = None
    status: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    move_count: int

    model_config = ConfigDict(from_attributes=True)


class GameResponse(BaseModel):
    id: int
    user_id: Optional[int] = None
    title: Optional[str] = None
    raw_sgf: str
    black_player: Optional[str] = None
    white_player: Optional[str] = None
    komi: float
    rules: str
    result: Optional[str] = None
    status: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    move_count: int
    moves: List[MoveResponse] = []

    model_config = ConfigDict(from_attributes=True)
