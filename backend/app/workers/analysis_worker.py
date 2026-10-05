"""Background worker for executing full-game KataGo evaluation."""

import logging
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.game import AnalysisResult, Game, Move
from app.services.katago_service import get_katago_engine
from app.services.llm_service import FlaggedMoveContext, GameContext, get_llm_service
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
        analysis_by_move: dict[int, AnalysisResult] = {}
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
            analysis_by_move[move.move_number] = analysis

        # 6. LLM Teaching Explanation pass for flagged moves (mistakes and blunders)
        flagged_contexts: list[FlaggedMoveContext] = []
        for idx, (move, ev) in enumerate(zip(moves, evaluations)):
            if ev.verdict in ("mistake", "blunder"):
                recent_moves = [
                    f"#{m.move_number} {m.player} {m.coordinate or 'PASS'}"
                    for m in moves[max(0, idx - 4) : idx]
                ]
                flagged_contexts.append(
                    FlaggedMoveContext(
                        move_number=move.move_number,
                        player=move.player,
                        coordinate=move.coordinate,
                        verdict=ev.verdict,
                        score_loss=ev.score_loss or 0.0,
                        winrate_loss=ev.winrate_loss or 0.0,
                        best_move=ev.best_move,
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

        # 7. Transition state to 'completed'
        game.status = "completed"
        db.commit()
        logger.info("Successfully completed full analysis and LLM explanation pass for game %d", game_id)

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
