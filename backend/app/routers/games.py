from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.game import Game, Move
from app.schemas.game import GameCreate, GameResponse, GameSummaryResponse
from app.services.sgf_service import SGFParseError, parse_sgf

router = APIRouter(prefix="/games", tags=["games"])


@router.post("", response_model=GameResponse, status_code=status.HTTP_201_CREATED)
def create_game(payload: GameCreate, db: Session = Depends(get_db)):
    """Ingest a new Go game from raw SGF.

    Parses metadata and move sequence, then persists the game and moves to Postgres.
    """
    try:
        parsed = parse_sgf(payload.raw_sgf)
    except SGFParseError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid SGF: {str(e)}",
        )

    # Resolve game title: payload title > parsed SGF title > player matchup > default
    title = payload.title or parsed.title
    if not title:
        if parsed.black_player and parsed.white_player:
            title = f"{parsed.black_player} vs {parsed.white_player}"
        else:
            title = "Untitled Game"

    db_game = Game(
        user_id=payload.user_id,
        title=title,
        raw_sgf=payload.raw_sgf,
        black_player=parsed.black_player,
        white_player=parsed.white_player,
        komi=parsed.komi,
        rules=parsed.rules,
        result=parsed.result,
        status="pending",
    )
    db.add(db_game)
    db.flush()

    db_moves = [
        Move(
            game_id=db_game.id,
            move_number=m.move_number,
            player=m.player,
            coordinate=m.coordinate,
            comment=m.comment,
        )
        for m in parsed.moves
    ]
    db.add_all(db_moves)
    db.commit()
    db.refresh(db_game)

    return db_game


@router.get("", response_model=List[GameSummaryResponse])
def list_games(
    skip: int = Query(0, ge=0, description="Number of games to skip"),
    limit: int = Query(50, ge=1, le=100, description="Maximum number of games to return"),
    db: Session = Depends(get_db),
):
    """List games with summary metadata and move count."""
    games = (
        db.query(Game)
        .order_by(Game.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return games


@router.get("/{game_id}", response_model=GameResponse)
def get_game(game_id: int, db: Session = Depends(get_db)):
    """Fetch a single game with its complete move sequence."""
    game = db.query(Game).filter(Game.id == game_id).first()
    if not game:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Game with ID {game_id} not found",
        )
    return game


@router.delete("/{game_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_game(game_id: int, db: Session = Depends(get_db)):
    """Delete a game and its associated moves/analysis."""
    game = db.query(Game).filter(Game.id == game_id).first()
    if not game:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Game with ID {game_id} not found",
        )
    db.delete(game)
    db.commit()
    return None
