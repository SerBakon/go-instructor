from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict
from app.schemas.move import MoveResponse


class AnalysisResultResponse(BaseModel):
    id: int
    move_id: int
    winrate: Optional[float] = None
    winrate_loss: Optional[float] = None
    score_lead: Optional[float] = None
    score_loss: Optional[float] = None
    best_move: Optional[str] = None
    verdict: Optional[str] = None
    explanation: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class MoveWithAnalysisResponse(MoveResponse):
    analysis: Optional[AnalysisResultResponse] = None


class GameAnalysisResponse(BaseModel):
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
    moves: List[MoveWithAnalysisResponse] = []

    model_config = ConfigDict(from_attributes=True)


class AnalysisTriggerResponse(BaseModel):
    game_id: int
    status: str
    message: str
