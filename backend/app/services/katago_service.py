"""KataGo analysis engine service.

Interfaces with KataGo's JSON analysis mode:
katago analysis -config <config_path> -model <model_path>

Architecture rules:
1. KataGo output is ground truth for move quality. Verdicts (good, neutral,
   mistake, blunder) are determined purely by code threshold logic — never by an LLM.
2. Supports MockKataGoEngine for zero-CPU dev/testing and RealKataGoEngine
   for actual inference.
"""

from __future__ import annotations

import itertools
import json
import logging
import os
import subprocess
import threading
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from queue import Queue
from typing import Any, Dict, List, Optional, Tuple

from app.config import settings

logger = logging.getLogger(__name__)


# ==============================================================================
# Domain Models & Verdict Thresholds
# ==============================================================================

@dataclass
class MoveEvaluation:
    move_number: int
    player: str  # 'B' or 'W'
    coordinate: Optional[str]  # e.g., 'Q16', None for pass
    winrate: float  # Player's winrate after move (0.0 to 1.0)
    winrate_loss: float  # Drop in winrate due to this move (>= 0.0)
    score_lead: float  # Player's score lead after move (points)
    score_loss: float  # Points lost due to this move (>= 0.0)
    best_move: Optional[str]  # Recommended alternative coordinate (e.g., 'D17')
    verdict: str  # 'good', 'neutral', 'mistake', 'blunder'


def calculate_verdict(score_loss: float, winrate_loss: float) -> str:
    """Pure code logic for determining move quality verdict.

    KataGo metrics are ground truth. Thresholds:
    - blunder: score_loss >= 4.0 or winrate_loss >= 0.15
    - mistake: score_loss >= 1.5 or winrate_loss >= 0.06
    - neutral: score_loss >= 0.7 or winrate_loss >= 0.025
    - good: optimal / minor loss
    """
    if score_loss >= 4.0 or winrate_loss >= 0.15:
        return "blunder"
    if score_loss >= 1.5 or winrate_loss >= 0.06:
        return "mistake"
    if score_loss >= 0.7 or winrate_loss >= 0.025:
        return "neutral"
    return "good"


# ==============================================================================
# Engine Interface
# ==============================================================================

class KataGoEngine(ABC):
    """Abstract base class for KataGo engines (mock and real)."""

    @abstractmethod
    def analyze_game(
        self,
        moves: List[Tuple[str, Optional[str]]],
        komi: float = 6.5,
        rules: str = "japanese",
        board_x_size: int = 19,
        board_y_size: int = 19,
        max_visits: Optional[int] = None,
    ) -> List[MoveEvaluation]:
        """Analyze a complete game sequence.

        Args:
            moves: List of (player, coordinate) tuples in game order.
                   Coordinate is None for pass.
            komi: Game komi (default: 6.5).
            rules: Ruleset ('japanese', 'chinese', etc.).
            board_x_size: Board width (default: 19).
            board_y_size: Board height (default: 19).
            max_visits: Playouts per turn (defaults to config max_visits).

        Returns:
            List of MoveEvaluation objects corresponding to each move.
        """
        pass

    def close(self) -> None:
        """Clean up subprocess or background resources."""
        pass

    def __enter__(self) -> KataGoEngine:
        return self

    def __exit__(self, *args: object) -> None:
        self.close()


# ==============================================================================
# Mock Engine (for CI & zero-CPU dev)
# ==============================================================================

class MockKataGoEngine(KataGoEngine):
    """Deterministic mock engine that simulates KataGo analysis.

    Useful for tests and local development without CPU overhead.
    """

    def analyze_game(
        self,
        moves: List[Tuple[str, Optional[str]]],
        komi: float = 6.5,
        rules: str = "japanese",
        board_x_size: int = 19,
        board_y_size: int = 19,
        max_visits: Optional[int] = None,
    ) -> List[MoveEvaluation]:
        evaluations: List[MoveEvaluation] = []
        current_b_winrate = 0.50
        current_b_score = 0.5

        for i, (player, coord) in enumerate(moves, start=1):
            # Inject a couple of deterministic mistakes/blunders for testing
            if i in (10, 30):
                score_loss = 4.5
                winrate_loss = 0.18
                best_move = "C17"
            elif i in (15, 45):
                score_loss = 2.0
                winrate_loss = 0.08
                best_move = "K10"
            elif i % 7 == 0:
                score_loss = 0.8
                winrate_loss = 0.03
                best_move = "D4"
            else:
                score_loss = 0.1
                winrate_loss = 0.005
                best_move = "Q16"

            verdict = calculate_verdict(score_loss, winrate_loss)

            if player.upper() == "B":
                current_b_winrate = max(0.01, min(0.99, current_b_winrate - winrate_loss + 0.01))
                current_b_score = current_b_score - score_loss + 0.2
                p_winrate = current_b_winrate
                p_score = current_b_score
            else:
                current_b_winrate = max(0.01, min(0.99, current_b_winrate + winrate_loss - 0.01))
                current_b_score = current_b_score + score_loss - 0.2
                p_winrate = 1.0 - current_b_winrate
                p_score = -current_b_score

            evaluations.append(
                MoveEvaluation(
                    move_number=i,
                    player=player.upper(),
                    coordinate=coord,
                    winrate=round(p_winrate, 4),
                    winrate_loss=round(winrate_loss, 4),
                    score_lead=round(p_score, 2),
                    score_loss=round(score_loss, 2),
                    best_move=best_move,
                    verdict=verdict,
                )
            )

        return evaluations


# ==============================================================================
# Real Engine (Subprocess JSON lines)
# ==============================================================================

class RealKataGoEngine(KataGoEngine):
    """Spawns and manages a persistent KataGo subprocess in analysis mode."""

    def __init__(
        self,
        binary_path: str,
        model_path: str,
        config_path: str,
    ):
        self.binary_path = binary_path
        self.model_path = model_path
        self.config_path = config_path

        if not os.path.isfile(binary_path) or not os.access(binary_path, os.X_OK):
            raise FileNotFoundError(f"KataGo binary not found or not executable: {binary_path}")
        if not os.path.isfile(model_path):
            raise FileNotFoundError(f"KataGo model not found: {model_path}")
        if not os.path.isfile(config_path):
            raise FileNotFoundError(f"KataGo config not found: {config_path}")

        command = [
            binary_path,
            "analysis",
            "-model",
            model_path,
            "-config",
            config_path,
        ]

        logger.info("Spawning KataGo process: %s", " ".join(command))
        self._process = subprocess.Popen(
            command,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,  # Line-buffered
        )

        self._query_counter = itertools.count()
        self._pending_queries: Dict[str, Queue[Dict[str, Any]]] = {}
        self._lock = threading.Lock()

        # Background reader for stdout
        self._stdout_thread = threading.Thread(target=self._read_stdout, daemon=True)
        self._stdout_thread.start()

        # Background drainer for stderr to prevent pipe buffer stalls
        self._stderr_thread = threading.Thread(target=self._drain_stderr, daemon=True)
        self._stderr_thread.start()

    def _read_stdout(self) -> None:
        """Reads JSON responses from KataGo stdout and dispatches by query id."""
        assert self._process.stdout is not None
        for line in self._process.stdout:
            line = line.strip()
            if not line:
                continue
            try:
                data = json.loads(line)
            except json.JSONDecodeError:
                logger.warning("Could not decode KataGo stdout line: %s", line)
                continue

            if data.get("isDuringSearch"):
                continue  # Search in progress, ignore interim progress updates

            query_id = data.get("id")
            with self._lock:
                queue = self._pending_queries.get(query_id)
            if queue is not None:
                queue.put(data)

    def _drain_stderr(self) -> None:
        """Drains KataGo stderr continuously."""
        assert self._process.stderr is not None
        for line in self._process.stderr:
            line = line.strip()
            if line:
                logger.debug("KataGo stderr: %s", line)

    def analyze_game(
        self,
        moves: List[Tuple[str, Optional[str]]],
        komi: float = 6.5,
        rules: str = "japanese",
        board_x_size: int = 19,
        board_y_size: int = 19,
        max_visits: Optional[int] = None,
    ) -> List[MoveEvaluation]:
        """Analyzes a full game via whole-game batching (analyzeTurns: [0..N])."""
        if self._process.poll() is not None:
            raise RuntimeError(
                f"KataGo process has exited (code {self._process.returncode})"
            )

        if not moves:
            return []

        visits = max_visits or settings.katago_max_visits
        query_id = f"game_{next(self._query_counter)}"
        num_moves = len(moves)
        turns_to_analyze = list(range(num_moves + 1))  # Turn 0 (root) through Turn N

        # Format moves: pass becomes "pass"
        formatted_moves = [
            [player.upper(), coord if coord else "pass"]
            for player, coord in moves
        ]

        query = {
            "id": query_id,
            "rules": rules.lower(),
            "komi": komi,
            "boardXSize": board_x_size,
            "boardYSize": board_y_size,
            "moves": formatted_moves,
            "analyzeTurns": turns_to_analyze,
            "maxVisits": visits,
        }

        response_queue: Queue[Dict[str, Any]] = Queue()
        with self._lock:
            self._pending_queries[query_id] = response_queue

        try:
            assert self._process.stdin is not None
            payload = json.dumps(query) + "\n"
            self._process.stdin.write(payload)
            self._process.stdin.flush()

            # Collect responses for all requested turns
            turn_responses: Dict[int, Dict[str, Any]] = {}
            expected_turns = len(turns_to_analyze)

            for _ in range(expected_turns):
                resp = response_queue.get()
                if "error" in resp:
                    raise RuntimeError(f"KataGo engine returned error: {resp['error']}")
                turn_num = resp.get("turnNumber")
                if turn_num is not None:
                    turn_responses[turn_num] = resp

            return self._compute_evaluations(moves, turn_responses)

        finally:
            with self._lock:
                self._pending_queries.pop(query_id, None)

    def _compute_evaluations(
        self,
        moves: List[Tuple[str, Optional[str]]],
        turn_responses: Dict[int, Dict[str, Any]],
    ) -> List[MoveEvaluation]:
        """Calculates winrate/score deltas and verdicts between consecutive turns."""
        evaluations: List[MoveEvaluation] = []

        for move_idx, (player, coord) in enumerate(moves, start=1):
            prev_turn = move_idx - 1
            curr_turn = move_idx

            prev_resp = turn_responses.get(prev_turn)
            curr_resp = turn_responses.get(curr_turn)

            if not prev_resp or not curr_resp:
                raise RuntimeError(
                    f"Missing turn evaluation for move {move_idx} (turns {prev_turn}->{curr_turn})"
                )

            prev_root = prev_resp["rootInfo"]
            curr_root = curr_resp["rootInfo"]

            # With reportAnalysisWinratesAs = BLACK in config:
            # winrate is always Black's winrate, scoreLead is always Black's score lead
            prev_b_winrate = float(prev_root.get("winrate", 0.5))
            prev_b_score = float(prev_root.get("scoreLead", 0.0))

            curr_b_winrate = float(curr_root.get("winrate", 0.5))
            curr_b_score = float(curr_root.get("scoreLead", 0.0))

            # Best move candidate before move was played
            prev_move_infos = prev_resp.get("moveInfos", [])
            best_move = None
            if prev_move_infos:
                raw_best = prev_move_infos[0].get("move")
                if raw_best and raw_best.lower() != "pass":
                    best_move = raw_best
                elif raw_best and raw_best.lower() == "pass":
                    best_move = "pass"

            is_black = player.upper() == "B"
            if is_black:
                player_winrate = curr_b_winrate
                player_score = curr_b_score
                winrate_loss = max(0.0, prev_b_winrate - curr_b_winrate)
                score_loss = max(0.0, prev_b_score - curr_b_score)
            else:
                player_winrate = 1.0 - curr_b_winrate
                player_score = -curr_b_score
                winrate_loss = max(0.0, curr_b_winrate - prev_b_winrate)
                score_loss = max(0.0, curr_b_score - prev_b_score)

            verdict = calculate_verdict(score_loss, winrate_loss)

            evaluations.append(
                MoveEvaluation(
                    move_number=move_idx,
                    player=player.upper(),
                    coordinate=coord,
                    winrate=round(player_winrate, 4),
                    winrate_loss=round(winrate_loss, 4),
                    score_lead=round(player_score, 2),
                    score_loss=round(score_loss, 2),
                    best_move=best_move,
                    verdict=verdict,
                )
            )

        return evaluations

    def close(self) -> None:
        """Terminates the KataGo process cleanly."""
        if self._process.poll() is None:
            logger.info("Closing KataGo subprocess...")
            if self._process.stdin is not None:
                try:
                    self._process.stdin.close()
                except Exception:
                    pass
            try:
                self._process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                logger.warning("KataGo did not exit in 5s, terminating...")
                self._process.terminate()


# ==============================================================================
# Engine Factory
# ==============================================================================

def get_katago_engine(force_mock: Optional[bool] = None) -> KataGoEngine:
    """Returns an initialized KataGo engine (Real or Mock).

    Checks configuration and binary/model file availability. If KataGo assets
    are not found or mock is forced, falls back gracefully to MockKataGoEngine.
    """
    should_mock = force_mock if force_mock is not None else settings.force_mock_katago
    if should_mock:
        logger.info("Using MockKataGoEngine (forced mock)")
        return MockKataGoEngine()

    binary_path = Path(settings.katago_path)
    model_path = Path(settings.katago_model_path)
    config_path = Path(settings.katago_config_path)

    if (
        binary_path.is_file()
        and os.access(binary_path, os.X_OK)
        and model_path.is_file()
        and config_path.is_file()
    ):
        try:
            return RealKataGoEngine(
                binary_path=str(binary_path),
                model_path=str(model_path),
                config_path=str(config_path),
            )
        except Exception as e:
            logger.error("Failed to start RealKataGoEngine (%s), falling back to mock", e)
            return MockKataGoEngine()

    logger.warning(
        "KataGo files not fully configured (binary=%s, model=%s, config=%s). Falling back to mock.",
        binary_path.exists(),
        model_path.exists(),
        config_path.exists(),
    )
    return MockKataGoEngine()
