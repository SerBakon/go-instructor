from typing import List, Optional
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.game import Game, Move, User
from app.schemas.game import GameCreate, GameResponse, GameSummaryResponse
from app.services.sgf_service import SGFParseError, parse_sgf

router = APIRouter(prefix="/games", tags=["games"])


def _save_game_and_moves(
    db: Session,
    raw_sgf: str,
    title: Optional[str] = None,
    user_id: Optional[int] = None,
    fallback_title: Optional[str] = None,
) -> Game:
    """Helper to parse SGF and persist game + moves in a database transaction."""
    try:
        parsed = parse_sgf(raw_sgf)
    except SGFParseError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid SGF: {str(e)}",
        )

    # Sanitize user_id: if <= 0 (e.g. Swagger default '0') or not found in users table, default to None
    valid_user_id: Optional[int] = None
    if user_id is not None and user_id > 0:
        user_exists = db.query(User.id).filter(User.id == user_id).first()
        if user_exists:
            valid_user_id = user_id

    # Resolve game title: payload title > parsed SGF title > fallback title > player matchup > default
    resolved_title = title or parsed.title or fallback_title
    if not resolved_title:
        if parsed.black_player and parsed.white_player:
            resolved_title = f"{parsed.black_player} vs {parsed.white_player}"
        else:
            resolved_title = "Untitled Game"

    # Truncate strings to match database column maximum lengths safely
    resolved_title = resolved_title[:255]
    black_player = parsed.black_player[:100] if parsed.black_player else None
    white_player = parsed.white_player[:100] if parsed.white_player else None
    rules = (parsed.rules or "japanese")[:50]
    result = parsed.result[:50] if parsed.result else None

    try:
        db_game = Game(
            user_id=valid_user_id,
            title=resolved_title,
            raw_sgf=raw_sgf,
            black_player=black_player,
            white_player=white_player,
            komi=parsed.komi,
            rules=rules,
            result=result,
            status="pending",
        )
        db.add(db_game)
        db.flush()

        db_moves = [
            Move(
                game_id=db_game.id,
                move_number=m.move_number,
                player=m.player[:1],
                coordinate=m.coordinate[:10] if m.coordinate else None,
                comment=m.comment,
            )
            for m in parsed.moves
        ]
        db.add_all(db_moves)
        db.commit()
        db.refresh(db_game)
        return db_game
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Database error while saving game: {str(e)}",
        )



@router.post("", response_model=GameResponse, status_code=status.HTTP_201_CREATED)
def create_game(payload: GameCreate, db: Session = Depends(get_db)):
    """Ingest a new Go game from raw SGF JSON body."""
    return _save_game_and_moves(
        db=db,
        raw_sgf=payload.raw_sgf,
        title=payload.title,
        user_id=payload.user_id,
    )


@router.post("/upload", response_model=GameResponse, status_code=status.HTTP_201_CREATED)
async def upload_game_file(
    file: UploadFile = File(..., description="SGF file to upload (.sgf)"),
    title: Optional[str] = Form(None, description="Optional custom title for the game"),
    user_id: Optional[int] = Form(None, description="Optional user ID"),
    db: Session = Depends(get_db),
):
    """Ingest a new Go game by uploading an SGF file (e.g. from frontend drag-and-drop)."""
    if file.filename and not file.filename.lower().endswith((".sgf", ".txt")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file must have a .sgf or .txt extension",
        )

    content_bytes = await file.read()
    if not content_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty",
        )

    # Decode bytes to text, trying common Go SGF encodings
    raw_sgf: Optional[str] = None
    for encoding in ("utf-8", "utf-8-sig", "gbk", "shift_jis", "iso-8859-1"):
        try:
            raw_sgf = content_bytes.decode(encoding)
            break
        except UnicodeDecodeError:
            continue

    if raw_sgf is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unable to decode SGF file with supported encodings (UTF-8, GBK, Shift-JIS, ISO-8859-1)",
        )

    fallback_title = None
    if file.filename:
        base_name = file.filename.rsplit(".", 1)[0].replace("_", " ").strip()
        if base_name:
            fallback_title = base_name

    return _save_game_and_moves(
        db=db,
        raw_sgf=raw_sgf,
        title=title,
        user_id=user_id,
        fallback_title=fallback_title,
    )



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
