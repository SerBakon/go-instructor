"""Standalone test script for KataGo service integration.

Verifies:
1. Threshold verdict logic.
2. MockKataGoEngine output formatting.
3. RealKataGoEngine inference using the Surface CPU-tuned net_b6c96 model.
"""

import sys
import time
from pathlib import Path

# Add backend to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services.katago_service import (
    MockKataGoEngine,
    RealKataGoEngine,
    calculate_verdict,
    get_katago_engine,
)
from app.config import settings


def test_verdict_thresholds():
    print("Testing verdict threshold logic...")
    assert calculate_verdict(5.0, 0.20) == "blunder"
    assert calculate_verdict(4.0, 0.05) == "blunder"
    assert calculate_verdict(1.8, 0.07) == "mistake"
    assert calculate_verdict(0.9, 0.03) == "neutral"
    assert calculate_verdict(0.2, 0.005) == "good"
    print("✓ Verdict threshold tests passed.")


def test_mock_engine():
    print("\nTesting MockKataGoEngine...")
    engine = MockKataGoEngine()
    sample_moves = [
        ("B", "Q16"),
        ("W", "D4"),
        ("B", "Q4"),
        ("W", "D16"),
        ("B", "C14"),
    ]
    evals = engine.analyze_game(sample_moves, komi=6.5)
    assert len(evals) == len(sample_moves)

    for ev in evals:
        assert 0.0 <= ev.winrate <= 1.0
        assert ev.winrate_loss >= 0.0
        assert ev.score_loss >= 0.0
        assert ev.verdict in ("good", "neutral", "mistake", "blunder")
        assert ev.best_move is not None

    print(f"✓ Mock engine generated {len(evals)} evaluations successfully.")


def test_real_engine():
    print("\nTesting RealKataGoEngine with CPU-tuned net_b6c96...")
    print(f"  Binary: {settings.katago_path}")
    print(f"  Model:  {settings.katago_model_path}")
    print(f"  Config: {settings.katago_config_path}")

    start_time = time.time()
    with get_katago_engine() as engine:
        init_time = time.time() - start_time
        print(f"  KataGo initialized in {init_time:.2f}s")
        assert isinstance(engine, RealKataGoEngine), f"Expected RealKataGoEngine, got {type(engine)}"

        # 8-move sequence: standard opening moves, plus White passing on move 6 (blunder!)
        sample_moves = [
            ("B", "Q16"),
            ("W", "D4"),
            ("B", "Q4"),
            ("W", "D16"),
            ("B", "C14"),
            ("W", None),     # White passes (major blunder)
            ("B", "C17"),
            ("W", "F3"),
        ]

        query_start = time.time()
        evals = engine.analyze_game(sample_moves, komi=6.5, max_visits=50)
        query_time = time.time() - query_start

        print(f"  Analyzed {len(sample_moves)} moves in {query_time:.2f}s ({query_time/len(sample_moves)*1000:.1f}ms/move)")
        assert len(evals) == len(sample_moves)

        print("\n  Turn-by-turn evaluations:")
        for ev in evals:
            coord_str = ev.coordinate or "PASS"
            print(
                f"    Move {ev.move_number} ({ev.player} {coord_str:>4}): "
                f"Winrate: {ev.winrate*100:>5.1f}% (loss: -{ev.winrate_loss*100:>4.1f}%) | "
                f"Score: {ev.score_lead:>+5.1f} (loss: -{ev.score_loss:>4.1f}) | "
                f"Best: {ev.best_move or 'None':>4} | "
                f"Verdict: {ev.verdict}"
            )

        # Move 6 was White pass -> verify it was flagged as a blunder
        pass_eval = evals[5]
        assert pass_eval.player == "W"
        assert pass_eval.coordinate is None
        assert pass_eval.verdict == "blunder", f"Expected blunder on pass, got {pass_eval.verdict}"
        assert pass_eval.score_loss >= 4.0, f"Expected score loss >= 4.0, got {pass_eval.score_loss}"

        print("\n✓ Pass move correctly flagged as blunder with large score loss.")

    total_time = time.time() - start_time
    print(f"✓ RealKataGoEngine full test completed in {total_time:.2f}s")


def test_sgf_to_katago_pipeline():
    print("\nTesting SGF Service -> KataGo Pipeline...")
    from app.services.sgf_service import parse_sgf

    sample_sgf = "(;GM[1]FF[4]CA[UTF-8]AP[test]KM[6.5]RU[Japanese]PB[BlackPlayer]PW[WhitePlayer];B[pd];W[dp];B[pp];W[dd])"
    parsed_game = parse_sgf(sample_sgf)
    assert len(parsed_game.moves) == 4

    moves_for_katago = [(m.player, m.coordinate) for m in parsed_game.moves]
    assert moves_for_katago == [
        ("B", "Q16"),
        ("W", "D4"),
        ("B", "Q4"),
        ("W", "D16"),
    ]

    with get_katago_engine() as engine:
        evals = engine.analyze_game(
            moves_for_katago,
            komi=parsed_game.komi,
            rules=parsed_game.rules,
            board_x_size=parsed_game.board_size,
            board_y_size=parsed_game.board_size,
            max_visits=30,
        )
        assert len(evals) == 4
        print(f"✓ Successfully piped parsed SGF into KataGo; received {len(evals)} evaluations.")


def analyze_single_sgf(sgf_path: Path):
    """Parses and analyzes an individual SGF file, printing flagged moves."""
    from app.services.sgf_service import parse_sgf

    print(f"\n=======================================================")
    print(f"Analyzing SGF: {sgf_path.name}")
    print(f"Path: {sgf_path}")
    print(f"=======================================================")

    raw_sgf = sgf_path.read_text(encoding="utf-8", errors="replace")
    parsed = parse_sgf(raw_sgf)
    moves_for_katago = [(m.player, m.coordinate) for m in parsed.moves]

    print(f"Matchup:    {parsed.black_player or 'Black'} vs {parsed.white_player or 'White'}")
    print(f"Board size: {parsed.board_size}x{parsed.board_size} | Rules: {parsed.rules} | Komi: {parsed.komi}")
    print(f"Total moves: {len(moves_for_katago)}")

    if not moves_for_katago:
        print("Game has no moves.")
        return

    with get_katago_engine() as engine:
        t0 = time.time()
        evals = engine.analyze_game(
            moves_for_katago,
            komi=parsed.komi,
            rules=parsed.rules,
            board_x_size=parsed.board_size,
            board_y_size=parsed.board_size,
            max_visits=settings.katago_max_visits,
        )
        elapsed = time.time() - t0
        ms_per_move = (elapsed / len(moves_for_katago)) * 1000
        print(f"Analysis completed in {elapsed:.2f}s ({ms_per_move:.1f}ms per move)\n")

        flagged = [e for e in evals if e.verdict in ("mistake", "blunder")]
        print(f"Flagged moves ({len(flagged)} found):")
        print(f"{'Move':<6} {'Player':<8} {'Coord':<8} {'Verdict':<10} {'Score Loss':<12} {'WR Loss':<10} {'Suggested Best'}")
        print("-" * 75)
        for e in flagged:
            coord_str = e.coordinate or "PASS"
            best_str = e.best_move or "PASS"
            print(
                f"{e.move_number:<6} {e.player:<8} {coord_str:<8} {e.verdict.upper():<10} "
                f"-{e.score_loss:<11.1f} -{e.winrate_loss*100:<8.1f}% {best_str}"
            )


def test_custom_sgf_files():
    """Scans backend/tests/custom_sgfs/ and runs analysis on any .sgf files found."""
    sgf_dir = Path(__file__).resolve().parent / "custom_sgfs"
    sgf_files = sorted(list(sgf_dir.glob("*.sgf")) + list(sgf_dir.glob("*.SGF")))

    if not sgf_files:
        print(f"\n[custom_sgfs] No custom SGF files found in {sgf_dir}.")
        print("  -> Drop your .sgf files into backend/tests/custom_sgfs/ to analyze them automatically!")
        return

    print(f"\n[custom_sgfs] Found {len(sgf_files)} custom SGF file(s) in {sgf_dir}")
    for file in sgf_files:
        analyze_single_sgf(file)


if __name__ == "__main__":
    if len(sys.argv) > 1:
        # CLI usage: python tests/test_katago.py path/to/game.sgf
        target = Path(sys.argv[1])
        if target.is_file():
            analyze_single_sgf(target)
        else:
            print(f"File not found: {target}")
    else:
        test_verdict_thresholds()
        test_mock_engine()
        test_real_engine()
        test_sgf_to_katago_pipeline()
        test_custom_sgf_files()
        print("\n===============================")
        print("ALL KATAGO INTEGRATION TESTS PASSED!")
        print("===============================")
