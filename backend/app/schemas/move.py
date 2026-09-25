from typing import Optional
from pydantic import BaseModel, ConfigDict


class MoveBase(BaseModel):
    move_number: int
    player: str  # 'B' or 'W'
    coordinate: Optional[str] = None  # e.g., 'Q16' (None for pass)
    comment: Optional[str] = None


class MoveCreate(MoveBase):
    pass


class MoveResponse(MoveBase):
    id: int
    game_id: int

    model_config = ConfigDict(from_attributes=True)
