"""Background worker for executing full-game KataGo evaluation."""

import logging
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.game import AnalysisResult, Game, Move
from app.services.katago_service import get_katago_engine
from app.services.sgf_service import parse_sgf

logger = logging.getLogger(__name__)


def process_game_analysis(game_id: int) -> None:
    """Background worker function to analyze a game and save results.

    State machine transitions:
    - pending / failed -> analyzing -> completed
    - or analyzing -> failed (on uncaught error)

    Idempotent: updates existing AnalysisResult records if already present.
    """
    db: Session = SessionLocal()
    try:
        game = db.query(Game).filter(Game.id == game_id).first()
        if not game:
            logger.warning("Game %d not found for analysis", game_id)
            return

        if game.status == "analyzing":
            logger.info("Game %d is already being analyzed, skipping duplicate run", game_id)
            return

        # 1. Transition state to 'analyzing'
        game.status = "analyzing"
        db.commit()

        # 2. Retrieve game moves in sequential order
        moves = (
            db.query(Move)
            .filter(Move.game_id == game_id)
            .order_by(Move.move_number.asc())
            .all()
        )

        if not moves:
            logger.info("Game %d has no moves to analyze", game_id)
            game.status = "completed"
            db.commit()
            return

        # 3. Detect board dimensions from raw SGF (default to 19x19)
        board_size = 19
        try:
            parsed = parse_sgf(game.raw_sgf)
            board_size = parsed.board_size
        except Exception:
            pass

        moves_input = [(m.player, m.coordinate) for m in moves]

        # 4. Run KataGo analysis engine
        logger.info(
            "Starting KataGo analysis for game %d (%d moves, %dx%d board)",
            game_id,
            len(moves),
            board_size,
            board_size,
        )
        with get_katago_engine() as engine:
            evaluations = engine.analyze_game(
                moves=moves_input,
                komi=game.komi,
                rules=game.rules or "japanese",
                board_x_size=board_size,
                board_y_size=board_size,
            )

        # 5. Persist evaluations into analysis_results table (idempotent upsert)
        for move, ev in zip(moves, evaluations):
            analysis = (
                db.query(AnalysisResult)
                .filter(AnalysisResult.move_id == move.id)
                .first()
            )
            if not analysis:
                analysis = AnalysisResult(move_id=move.id)
                db.add(analysis)

            analysis.winrate = ev.winrate
            analysis.winrate_loss = ev.winrate_loss
            analysis.score_lead = ev.score_lead
            analysis.score_loss = ev.score_loss
            analysis.best_move = ev.best_move
            analysis.verdict = ev.verdict

        # 6. Transition state to 'completed'
        game.status = "completed"
        db.commit()
        logger.info("Successfully completed KataGo analysis for game %d", game_id)

    except Exception as e:
        logger.exception("Failed analyzing game %d: %s", game_id, e)
        db.rollback()
        try:
            game = db.query(Game).filter(Game.id == game_id).first()
            if game:
                game.status = "failed"
                db.commit()
        except Exception:
            pass
    finally:
        db.close()
