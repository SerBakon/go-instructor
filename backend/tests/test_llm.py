"""Tests for Phase 6: LLM Teaching Explanation Pass."""

import json
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

# Add backend to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.main import app
from app.models.game import AnalysisResult, Game, Move
from app.services.llm_service import (
    FALLBACK_ERROR_MESSAGE,
    DisabledLLMService,
    FlaggedMoveContext,
    GameContext,
    GeminiLLMService,
    get_llm_service,
)
from app.workers.analysis_worker import process_game_analysis

client = TestClient(app)

SAMPLE_SGF = (
    "(;GM[1]FF[4]CA[UTF-8]KM[6.5]RU[Japanese]PB[PlayerBlack]PW[PlayerWhite]"
    ";B[pd];W[dp];B[pp];W[dd];B[cf];W[];B[cc])"
)


def test_disabled_llm_service_fallback_message():
    print("Testing DisabledLLMService fallback message...")
    service = DisabledLLMService()
    game_ctx = GameContext(black_player="Alice", white_player="Bob", board_size=19)
    flagged = [
        FlaggedMoveContext(
            move_number=6,
            player="W",
            coordinate=None,
            verdict="blunder",
            score_loss=15.0,
            winrate_loss=0.35,
            best_move="Q16",
        ),
    ]

    explanations = service.explain_flagged_moves(game_ctx, flagged)
    assert len(explanations) == 1
    assert explanations[6] == FALLBACK_ERROR_MESSAGE
    print(f"✓ DisabledLLMService returned: '{FALLBACK_ERROR_MESSAGE}'")


def test_gemini_service_prompt_building():
    print("Testing prompt generation...")
    service = GeminiLLMService(api_key="fake-test-key")
    game_ctx = GameContext(black_player="Alice", white_player="Bob", board_size=19)
    flagged = [
        FlaggedMoveContext(
            move_number=6,
            player="W",
            coordinate=None,
            verdict="blunder",
            score_loss=15.0,
            winrate_loss=0.35,
            best_move="C16",
            recent_moves=["#4 W D16", "#5 B C14"],
        ),
    ]
    prompt = service._build_prompt(game_ctx, flagged)
    assert "Move #6 (White)" in prompt
    assert "Played move: PASS" in prompt
    assert "Verdict: BLUNDER" in prompt
    assert "Score loss: 15.0 points" in prompt
    assert "Recommended alternative: C16" in prompt
    assert "#4 W D16" in prompt
    print("✓ Prompt contains all required pedagogical context.")


def test_gemini_service_success_and_error_handling():
    print("Testing GeminiLLMService success and fallback handling...")
    service = GeminiLLMService(api_key="fake-test-key")

    game_ctx = GameContext(black_player="Player1", white_player="Player2", board_size=19)
    flagged = [
        FlaggedMoveContext(
            move_number=6,
            player="W",
            coordinate=None,
            verdict="blunder",
            score_loss=12.0,
            winrate_loss=0.30,
            best_move="C16",
        ),
        FlaggedMoveContext(
            move_number=8,
            player="B",
            coordinate="K10",
            verdict="mistake",
            score_loss=3.0,
            winrate_loss=0.07,
            best_move="D10",
        ),
    ]

    # 1. Successful structured response from Gemini
    mock_response = MagicMock()
    mock_response.text = json.dumps({
        "explanations": [
            {
                "move_number": 6,
                "explanation": "White passed during the opening, giving away initiative. Playing C16 would have defended the corner effectively.",
            },
            {
                "move_number": 8,
                "explanation": "Black played center prematurely while side territories remain open. D10 builds solid influence.",
            },
        ]
    })
    service.client.models.generate_content = MagicMock(return_value=mock_response)

    results = service.explain_flagged_moves(game_ctx, flagged)
    assert len(results) == 2
    assert "White passed" in results[6]
    assert "Black played center" in results[8]
    print("✓ GeminiLLMService parsed structured responses correctly.")

    # 2. API error handling (e.g. rate limit, bad API key, network failure)
    service.client.models.generate_content = MagicMock(side_effect=RuntimeError("API quota exceeded"))
    results_err = service.explain_flagged_moves(game_ctx, flagged)
    assert len(results_err) == 2
    assert results_err[6] == FALLBACK_ERROR_MESSAGE
    assert results_err[8] == FALLBACK_ERROR_MESSAGE
    print("✓ GeminiLLMService set fallback error message when the API failed.")

    # 3. Partial response (Gemini returns only move 6, move 8 omitted)
    mock_partial = MagicMock()
    mock_partial.text = json.dumps({
        "explanations": [
            {
                "move_number": 6,
                "explanation": "White passed during opening.",
            }
        ]
    })
    service.client.models.generate_content = MagicMock(return_value=mock_partial)
    results_partial = service.explain_flagged_moves(game_ctx, flagged)
    assert results_partial[6] == "White passed during opening."
    assert results_partial[8] == FALLBACK_ERROR_MESSAGE
    print("✓ Omitted move in LLM response fell back to error message.")


def test_worker_fallback_when_llm_unconfigured():
    print("\nTesting worker execution when Gemini API key is unconfigured...")
    db: Session = SessionLocal()
    try:
        orig_key = settings.gemini_api_key
        settings.gemini_api_key = ""

        # Ingest game without auto-analysis
        res = client.post(
            "/games",
            json={"raw_sgf": SAMPLE_SGF, "title": "Worker Fallback Game"},
            params={"auto_analyze": False},
        )
        assert res.status_code == 201, res.text
        game_id = res.json()["id"]

        # Run worker
        process_game_analysis(game_id)

        # Verify DB records
        game = db.query(Game).filter(Game.id == game_id).first()
        assert game.status == "completed"

        results = (
            db.query(AnalysisResult)
            .join(Move, Move.id == AnalysisResult.move_id)
            .filter(Move.game_id == game_id)
            .order_by(Move.move_number.asc())
            .all()
        )

        for r in results:
            if r.verdict in ("mistake", "blunder"):
                assert r.explanation == FALLBACK_ERROR_MESSAGE, (
                    f"Flagged move #{r.move.move_number} should have fallback error message"
                )
            else:
                assert r.explanation is None, (
                    f"Unflagged move #{r.move.move_number} should have None for explanation"
                )

        print(f"✓ Flagged moves received: '{FALLBACK_ERROR_MESSAGE}', unflagged moves remain None.")

        # Clean up
        client.delete(f"/games/{game_id}")
    finally:
        settings.gemini_api_key = orig_key
        db.close()


def test_worker_persistence_with_gemini():
    print("\nTesting worker execution with Gemini explanation response...")
    db: Session = SessionLocal()
    try:
        orig_key = settings.gemini_api_key
        settings.gemini_api_key = "fake-gemini-key"

        # Ingest game
        res = client.post(
            "/games",
            json={"raw_sgf": SAMPLE_SGF, "title": "Worker Gemini Game"},
            params={"auto_analyze": False},
        )
        assert res.status_code == 201
        game_id = res.json()["id"]

        # Mock generate_content on Gemini client
        with patch("google.genai.Client") as mock_client_cls:
            mock_client = MagicMock()
            mock_client_cls.return_value = mock_client

            mock_response = MagicMock()
            mock_response.text = json.dumps({
                "explanations": [
                    {
                        "move_number": 6,
                        "explanation": "Passing in the early opening surrenders tempo and territory to Black without compensation.",
                    }
                ]
            })
            mock_client.models.generate_content.return_value = mock_response

            process_game_analysis(game_id)

        # Verify database
        res_api = client.get(f"/games/{game_id}/analysis")
        assert res_api.status_code == 200
        analysis_json = res_api.json()
        assert analysis_json["status"] == "completed"

        move_6 = analysis_json["moves"][5]
        assert move_6["analysis"]["verdict"] == "blunder"
        assert "Passing in the early opening" in move_6["analysis"]["explanation"]

        move_1 = analysis_json["moves"][0]
        assert move_1["analysis"]["verdict"] == "good"
        assert move_1["analysis"]["explanation"] is None

        print("✓ Persisted Gemini explanation to database and verified via GET /games/{id}/analysis.")

        # Clean up
        client.delete(f"/games/{game_id}")
    finally:
        settings.gemini_api_key = orig_key
        db.close()


if __name__ == "__main__":
    test_disabled_llm_service_fallback_message()
    test_gemini_service_prompt_building()
    test_gemini_service_success_and_error_handling()
    test_worker_fallback_when_llm_unconfigured()
    test_worker_persistence_with_gemini()
    print("\n===============================")
    print("ALL PHASE 6 LLM TESTS PASSED!")
    print("===============================")
