"""Background worker for executing full-game KataGo evaluation and LLM explanations."""

import logging
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.game import AnalysisResult, Game, Move
from app.services.katago_service import get_katago_engine
from app.services.llm_service import FlaggedMoveContext, GameContext, get_llm_service
from app.services.sgf_service import parse_sgf

logger = logging.getLogger(__name__)


def run_katago_analysis(db: Session, game: Game) -> list[AnalysisResult]:
    """Run KataGo evaluations on all game moves, persist immediately, and commit.

    Transitions status to 'explaining' if there are flagged moves to explain,
    or 'completed' if no moves require LLM commentary.
    """
    moves = (
        db.query(Move)
        .filter(Move.game_id == game.id)
        .order_by(Move.move_number.asc())
        .all()
    )
    if not moves:
        logger.info("Game %d has no moves to analyze", game.id)
        game.status = "completed"
        db.commit()
        return []

    # Detect board dimensions from raw SGF (default to 19x19)
    board_size = 19
    try:
        parsed = parse_sgf(game.raw_sgf)
        board_size = parsed.board_size
    except Exception:
        pass

    moves_input = [(m.player, m.coordinate) for m in moves]

    logger.info(
        "Starting KataGo analysis for game %d (%d moves, %dx%d board)",
        game.id,
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

    # Persist evaluations into analysis_results table (idempotent upsert)
    saved_results: list[AnalysisResult] = []
    has_flagged_moves = False
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
        saved_results.append(analysis)

        if ev.verdict in ("mistake", "blunder"):
            has_flagged_moves = True

    # Immediate commit: client can now see winrate timeline & suggested moves!
    if has_flagged_moves:
        game.status = "explaining"
    else:
        game.status = "completed"
    db.commit()
    logger.info(
        "KataGo analysis committed for game %d. Status updated to: %s",
        game.id,
        game.status,
    )
    return saved_results


def run_llm_explanations(game_id: int) -> None:
    """Run LLM teaching explanations pass for flagged moves in a game."""
    db: Session = SessionLocal()
    try:
        game = db.query(Game).filter(Game.id == game_id).first()
        if not game:
            logger.warning("Game %d not found for LLM explanations", game_id)
            return

        moves = (
            db.query(Move)
            .filter(Move.game_id == game_id)
            .order_by(Move.move_number.asc())
            .all()
        )
        if not moves:
            game.status = "completed"
            db.commit()
            return

        board_size = 19
        try:
            parsed = parse_sgf(game.raw_sgf)
            board_size = parsed.board_size
        except Exception:
            pass

        # Collect flagged moves that need explanation
        flagged_contexts: list[FlaggedMoveContext] = []
        analysis_by_move: dict[int, AnalysisResult] = {}
        for idx, move in enumerate(moves):
            analysis = (
                db.query(AnalysisResult)
                .filter(AnalysisResult.move_id == move.id)
                .first()
            )
            if not analysis:
                continue
            analysis_by_move[move.move_number] = analysis

            if analysis.verdict in ("mistake", "blunder"):
                recent_moves = [
                    f"#{m.move_number} {m.player} {m.coordinate or 'PASS'}"
                    for m in moves[max(0, idx - 4) : idx]
                ]
                flagged_contexts.append(
                    FlaggedMoveContext(
                        move_number=move.move_number,
                        player=move.player,
                        coordinate=move.coordinate,
                        verdict=analysis.verdict,
                        score_loss=analysis.score_loss or 0.0,
                        winrate_loss=analysis.winrate_loss or 0.0,
                        best_move=analysis.best_move,
                        recent_moves=recent_moves,
                    )
                )

        if flagged_contexts:
            logger.info(
                "Requesting LLM explanations for %d flagged move(s) in game %d",
                len(flagged_contexts),
                game_id,
            )
            llm_service = get_llm_service()
            game_context = GameContext(
                black_player=game.black_player,
                white_player=game.white_player,
                board_size=board_size,
            )
            explanations = llm_service.explain_flagged_moves(game_context, flagged_contexts)

            for move_num, explanation_text in explanations.items():
                if move_num in analysis_by_move:
                    analysis_by_move[move_num].explanation = explanation_text

        game.status = "completed"
        db.commit()
        logger.info("Successfully completed LLM explanations for game %d", game_id)
    except Exception as e:
        logger.exception("Failed generating LLM explanations for game %d: %s", game_id, e)
        db.rollback()
        # Even if LLM explanation fails, keep KataGo results intact!
        try:
            game = db.query(Game).filter(Game.id == game_id).first()
            if game:
                game.status = "completed"
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


def process_game_analysis(game_id: int) -> None:
    """Full-game analysis pipeline: KataGo evaluation pass first, then LLM explanation pass.

    State machine transitions:
    - pending / failed -> analyzing -> (KataGo finishes & commits) -> explaining -> (LLM finishes & commits) -> completed
    """
    db: Session = SessionLocal()
    should_run_llm = False
    try:
        game = db.query(Game).filter(Game.id == game_id).first()
        if not game:
            logger.warning("Game %d not found for analysis", game_id)
            return

        if game.status in ("analyzing", "explaining"):
            logger.info("Game %d is already in progress (%s), skipping", game_id, game.status)
            return

        game.status = "analyzing"
        db.commit()

        run_katago_analysis(db, game)
        should_run_llm = game.status == "explaining"
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
        return
    finally:
        db.close()

    # Step 2: Run LLM explanation pass if status transitioned to 'explaining'
    if should_run_llm:
        run_llm_explanations(game_id)
