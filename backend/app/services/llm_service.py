"""LLM Teaching Explanation Service.

Generates natural-language coaching explanations for flagged moves (mistakes and blunders).
KataGo evaluates move quality objectively; the LLM explains *why* a move was faulty
and *what* the suggested alternative accomplishes.
"""

from abc import ABC, abstractmethod
import json
import logging
from typing import Dict, List, Optional
from pydantic import BaseModel, Field

from app.config import settings

logger = logging.getLogger(__name__)

FALLBACK_ERROR_MESSAGE = "There was an error with the LLM response. Please try again later."


class FlaggedMoveContext(BaseModel):
    """Context required for the LLM to explain a single flagged move."""

    move_number: int
    player: str  # 'B' or 'W'
    coordinate: Optional[str] = None  # e.g., 'Q16' or None for PASS
    verdict: str  # 'mistake' or 'blunder'
    score_loss: float
    winrate_loss: float
    best_move: Optional[str] = None
    recent_moves: List[str] = Field(default_factory=list)  # e.g., ["12: W D4", "13: B Q10"]


class GameContext(BaseModel):
    """Overall game metadata for LLM explanation generation."""

    black_player: Optional[str] = "Black"
    white_player: Optional[str] = "White"
    board_size: int = 19


class MoveExplanationItem(BaseModel):
    """Structured explanation for a single move."""

    move_number: int
    explanation: str


class GameExplanationsPayload(BaseModel):
    """Structured response container for batched explanations."""

    explanations: List[MoveExplanationItem]


SYSTEM_PROMPT = """You are an encouraging, insightful, and pedagogical Go (Baduk / Weiqi) coach.
You are reviewing a Go game where an objective AI engine (KataGo) has analyzed the moves.
KataGo has identified specific moves as either a "mistake" or a "blunder".

Your role is to explain to the player in plain, accessible terms WHY their move was a mistake/blunder and WHY KataGo's recommended alternative move is better.

Teaching Guidelines:
1. Keep each explanation concise and focused (2-3 sentences max).
2. Focus on practical Go principles: shape (good/bad shape), eye space, cutting vs connecting, sente/gote (initiative), overplay vs solid play, urgent moves before big moves.
3. Explicitly reference the coordinate played (or Pass) and KataGo's recommended move.
4. KataGo's evaluation is ground truth; do NOT invent a different verdict or disagree with the engine.
5. Provide encouragement and constructive takeaways for the student.
"""


class LLMService(ABC):
    """Abstract interface for LLM coaching explanations."""

    @abstractmethod
    def explain_flagged_moves(
        self,
        game_context: GameContext,
        flagged_moves: List[FlaggedMoveContext],
    ) -> Dict[int, str]:
        """Generate explanations for a list of flagged moves.

        Returns a dictionary mapping move_number to explanation string.
        """
        pass


class DisabledLLMService(LLMService):
    """Fallback service when no API key is provided or LLM is unavailable."""

    def explain_flagged_moves(
        self,
        game_context: GameContext,
        flagged_moves: List[FlaggedMoveContext],
    ) -> Dict[int, str]:
        return {m.move_number: FALLBACK_ERROR_MESSAGE for m in flagged_moves}


class GeminiLLMService(LLMService):
    """Real LLM service powered by Google Gemini API."""

    def __init__(self, api_key: str, model_name: str = "gemini-3.8-flash"):
        from google import genai

        self.client = genai.Client(api_key=api_key)
        self.model_name = model_name

    def _build_prompt(
        self, game_context: GameContext, flagged_moves: List[FlaggedMoveContext]
    ) -> str:
        prompt_lines = [
            "Game Context:",
            f"- Board size: {game_context.board_size}x{game_context.board_size}",
            f"- Black Player: {game_context.black_player or 'Black'}",
            f"- White Player: {game_context.white_player or 'White'}",
            "",
            f"Please explain the following {len(flagged_moves)} flagged move(s):",
            "",
        ]

        for m in flagged_moves:
            player_str = "Black" if m.player == "B" else "White"
            coord_str = m.coordinate or "PASS"
            prompt_lines.append(f"### Move #{m.move_number} ({player_str})")
            prompt_lines.append(f"- Played move: {coord_str}")
            prompt_lines.append(
                f"- Verdict: {m.verdict.upper()} (Score loss: {abs(m.score_loss):.1f} points, Winrate loss: {m.winrate_loss * 100:.1f}%)"
            )
            prompt_lines.append(f"- Recommended alternative: {m.best_move or 'None'}")
            if m.recent_moves:
                prompt_lines.append(f"- Preceding moves: {', '.join(m.recent_moves)}")
            prompt_lines.append("")

        return "\n".join(prompt_lines)

    def explain_flagged_moves(
        self,
        game_context: GameContext,
        flagged_moves: List[FlaggedMoveContext],
    ) -> Dict[int, str]:
        if not flagged_moves:
            return {}

        prompt = self._build_prompt(game_context, flagged_moves)
        results: Dict[int, str] = {}

        try:
            from google.genai import types

            response = self.client.models.generate_content(
                model=self.model_name,
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM_PROMPT,
                    response_mime_type="application/json",
                    response_schema=GameExplanationsPayload,
                    temperature=0.2,
                ),
            )

            # Parse JSON structured output
            if response.text:
                data = json.loads(response.text)
                items = data.get("explanations", [])
                for item in items:
                    move_num = item.get("move_number")
                    explanation_text = item.get("explanation", "").strip()
                    if move_num is not None and explanation_text:
                        results[int(move_num)] = explanation_text

            logger.info("Gemini generated %d explanations successfully", len(results))

        except Exception as e:
            logger.error("Gemini API call failed: %s", e)

        # If the LLM failed or missed any flagged moves, use the fallback message
        for m in flagged_moves:
            if m.move_number not in results:
                results[m.move_number] = FALLBACK_ERROR_MESSAGE

        return results


def get_llm_service() -> LLMService:
    """Factory function to get the configured LLM service.

    Returns:
    - GeminiLLMService if gemini_api_key is configured.
    - DisabledLLMService if gemini_api_key is missing (sets fallback error message).
    """
    if not settings.gemini_api_key:
        logger.info("GEMINI_API_KEY is not configured; using DisabledLLMService with fallback message")
        return DisabledLLMService()

    try:
        return GeminiLLMService(
            api_key=settings.gemini_api_key,
            model_name=settings.gemini_model,
        )
    except Exception as e:
        logger.warning("Failed to initialize GeminiLLMService: %s; using DisabledLLMService", e)
        return DisabledLLMService()
