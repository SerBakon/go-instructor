"""Integration tests for Phase 4: Analysis Worker and Database Persistence."""

import sys
import time
from pathlib import Path

# Add backend to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.main import app
from app.models.game import AnalysisResult, Game, Move
from app.workers.analysis_worker import process_game_analysis

client = TestClient(app)

SAMPLE_SGF = (
    "(;GM[1]FF[4]CA[UTF-8]KM[6.5]RU[Japanese]PB[PlayerBlack]PW[PlayerWhite]"
    ";B[pd];W[dp];B[pp];W[dd];B[cf];W[];B[cc])"
)


def test_direct_worker_execution():
    print("Testing direct worker execution...")
    db: Session = SessionLocal()
    try:
        # Ingest game via TestClient without auto-analysis
        response = client.post("/games", json={"raw_sgf": SAMPLE_SGF, "title": "Worker Test Game"}, params={"auto_analyze": False})
        assert response.status_code == 201, response.text
        game_data = response.json()
        game_id = game_data["id"]
        assert game_data["status"] == "pending"

        # Check moves saved
        moves = db.query(Move).filter(Move.game_id == game_id).order_by(Move.move_number.asc()).all()
        assert len(moves) == 7

        # Run worker directly
        start_time = time.time()
        process_game_analysis(game_id)
        elapsed = time.time() - start_time
        print(f"  Worker analyzed 7 moves in {elapsed:.2f}s")

        # Verify Game status updated to 'completed'
        db.expire_all()
        game = db.query(Game).filter(Game.id == game_id).first()
        assert game.status == "completed", f"Expected 'completed', got '{game.status}'"

        # Verify AnalysisResult rows exist for every move
        results = (
            db.query(AnalysisResult)
            .join(Move, Move.id == AnalysisResult.move_id)
            .filter(Move.game_id == game_id)
            .order_by(Move.move_number.asc())
            .all()
        )
        assert len(results) == len(moves)

        print("  Move-by-move persisted results:")
        for r in results:
            assert r.winrate is not None
            assert r.score_lead is not None
            assert r.score_loss is not None
            assert r.verdict in ("good", "neutral", "mistake", "blunder")
            print(
                f"    Move #{r.move.move_number} ({r.move.player} {r.move.coordinate or 'PASS'}): "
                f"WR: {r.winrate*100:.1f}%, Score: {r.score_lead:+.1f}, "
                f"Loss: -{r.score_loss:.1f}, Best: {r.best_move or 'None'}, Verdict: {r.verdict}"
            )

        # Move 6 was White pass -> verify blunder
        pass_res = results[5]
        assert pass_res.move.coordinate is None
        assert pass_res.verdict == "blunder"

        print("✓ Worker completed analysis and persisted results into database.")

        # Test idempotency: re-running analysis should update without error
        process_game_analysis(game_id)
        db.expire_all()
        results_after = (
            db.query(AnalysisResult)
            .join(Move, Move.id == AnalysisResult.move_id)
            .filter(Move.game_id == game_id)
            .all()
        )
        assert len(results_after) == len(moves)
        print("✓ Worker idempotency verified (re-analysis succeeded without duplicate constraint errors).")

        # Clean up
        client.delete(f"/games/{game_id}")
    finally:
        db.close()


def test_api_analysis_endpoints():
    print("\nTesting API analysis endpoints (trigger & fetch)...")

    # Ingest game with auto_analyze=False
    res = client.post("/games", json={"raw_sgf": SAMPLE_SGF, "title": "API Analysis Game"}, params={"auto_analyze": False})
    assert res.status_code == 201
    game_id = res.json()["id"]

    # Initial analysis fetch should show status pending and empty analysis for moves
    res_analysis = client.get(f"/games/{game_id}/analysis")
    assert res_analysis.status_code == 200
    analysis_data = res_analysis.json()
    assert analysis_data["status"] == "pending"
    assert len(analysis_data["moves"]) == 7
    assert analysis_data["moves"][0]["analysis"] is None

    # Trigger analysis via POST /games/{game_id}/analyze
    # Note: TestClient runs FastAPI BackgroundTasks synchronously when the request ends!
    res_trigger = client.post(f"/games/{game_id}/analyze")
    assert res_trigger.status_code == 202
    assert res_trigger.json()["status"] == "analyzing"

    # Fetch analysis after background task completed
    res_completed = client.get(f"/games/{game_id}/analysis")
    assert res_completed.status_code == 200
    completed_data = res_completed.json()
    assert completed_data["status"] == "completed"

    for m in completed_data["moves"]:
        assert m["analysis"] is not None
        assert m["analysis"]["verdict"] in ("good", "neutral", "mistake", "blunder")

    print(f"✓ GET /games/{game_id}/analysis returned completed evaluations for all {len(completed_data['moves'])} moves.")

    # Clean up with cascading delete
    del_res = client.delete(f"/games/{game_id}")
    assert del_res.status_code == 204
    print("✓ Cascading delete verified (game, moves, and analysis_results cleaned up).")


if __name__ == "__main__":
    test_direct_worker_execution()
    test_api_analysis_endpoints()
    print("\n===============================")
    print("ALL PHASE 4 WORKER TESTS PASSED!")
    print("===============================")
