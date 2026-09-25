from sqlalchemy import (
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    username = Column(String(100), unique=True, index=True, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    games = relationship("Game", back_populates="user", cascade="all, delete-orphan")


class Game(Base):
    __tablename__ = "games"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    title = Column(String(255), nullable=True)
    raw_sgf = Column(Text, nullable=False)
    black_player = Column(String(100), nullable=True)
    white_player = Column(String(100), nullable=True)
    komi = Column(Float, default=6.5)
    rules = Column(String(50), default="japanese")
    result = Column(String(50), nullable=True)
    status = Column(String(50), default="pending", index=True)  # pending, analyzing, completed, failed
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="games")
    moves = relationship(
        "Move",
        back_populates="game",
        cascade="all, delete-orphan",
        order_by="Move.move_number",
    )


class Move(Base):
    __tablename__ = "moves"

    id = Column(Integer, primary_key=True, index=True)
    game_id = Column(Integer, ForeignKey("games.id", ondelete="CASCADE"), nullable=False, index=True)
    move_number = Column(Integer, nullable=False)
    player = Column(String(1), nullable=False)  # 'B' or 'W'
    coordinate = Column(String(10), nullable=True)  # e.g., 'Q16' or SGF 'pd' (null for pass)
    comment = Column(Text, nullable=True)

    __table_args__ = (
        UniqueConstraint("game_id", "move_number", name="uq_game_move_number"),
    )

    game = relationship("Game", back_populates="moves")
    analysis = relationship(
        "AnalysisResult",
        back_populates="move",
        uselist=False,
        cascade="all, delete-orphan",
    )


class AnalysisResult(Base):
    __tablename__ = "analysis_results"

    id = Column(Integer, primary_key=True, index=True)
    move_id = Column(
        Integer,
        ForeignKey("moves.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    winrate = Column(Float, nullable=True)
    winrate_loss = Column(Float, nullable=True)
    score_lead = Column(Float, nullable=True)
    score_loss = Column(Float, nullable=True)
    best_move = Column(String(10), nullable=True)
    verdict = Column(String(50), nullable=True)  # good, neutral, mistake, blunder
    explanation = Column(Text, nullable=True)     # LLM natural-language explanation (flagged moves only)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    move = relationship("Move", back_populates="analysis")
