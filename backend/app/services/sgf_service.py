from dataclasses import dataclass, field
from typing import List, Optional
from sgfmill import common, sgf


class SGFParseError(ValueError):
    """Raised when SGF data cannot be parsed."""
    pass


@dataclass
class ParsedMove:
    move_number: int
    player: str  # 'B' or 'W'
    coordinate: Optional[str] = None  # e.g., 'Q16' or None for pass
    comment: Optional[str] = None


@dataclass
class ParsedGame:
    title: Optional[str]
    black_player: Optional[str]
    white_player: Optional[str]
    komi: float
    rules: str
    result: Optional[str]
    moves: List[ParsedMove] = field(default_factory=list)


def parse_sgf(raw_sgf: str) -> ParsedGame:
    """Parse raw SGF content into structured game metadata and move sequence.

    Args:
        raw_sgf: Raw SGF string text.

    Returns:
        ParsedGame instance with metadata and moves list.

    Raises:
        SGFParseError: If SGF content is empty or structurally invalid.
    """
    if not raw_sgf or not raw_sgf.strip():
        raise SGFParseError("SGF content is empty")

    cleaned_sgf = raw_sgf.strip()

    try:
        sgf_game = sgf.Sgf_game.from_string(cleaned_sgf)
    except Exception as e_str:
        try:
            sgf_game = sgf.Sgf_game.from_bytes(cleaned_sgf.encode("utf-8", errors="replace"))
        except Exception:
            raise SGFParseError(f"Failed to parse SGF: {str(e_str)}") from e_str

    root = sgf_game.get_root()

    # Title: GN (game name) or EV (event)
    title: Optional[str] = None
    if root.has_property("GN"):
        title = str(root.get("GN")).strip() or None
    elif root.has_property("EV"):
        title = str(root.get("EV")).strip() or None

    # Players
    black_player: Optional[str] = None
    if root.has_property("PB"):
        black_player = str(root.get("PB")).strip() or None

    white_player: Optional[str] = None
    if root.has_property("PW"):
        white_player = str(root.get("PW")).strip() or None

    # Komi
    komi: float = 6.5
    if root.has_property("KM"):
        try:
            komi = float(root.get("KM"))
        except (ValueError, TypeError):
            komi = 6.5

    # Rules
    rules: str = "japanese"
    if root.has_property("RU"):
        val = str(root.get("RU")).strip().lower()
        if val:
            rules = val

    # Result
    result: Optional[str] = None
    if root.has_property("RE"):
        result = str(root.get("RE")).strip() or None

    # Move sequence
    parsed_moves: List[ParsedMove] = []
    move_number = 1

    for node in sgf_game.get_main_sequence():
        color, vertex = node.get_move()
        if color is None:
            continue

        player = color.upper()
        coordinate = common.format_vertex(vertex) if vertex is not None else None
        comment = str(node.get("C")).strip() if node.has_property("C") else None

        parsed_moves.append(
            ParsedMove(
                move_number=move_number,
                player=player,
                coordinate=coordinate,
                comment=comment,
            )
        )
        move_number += 1

    return ParsedGame(
        title=title,
        black_player=black_player,
        white_player=white_player,
        komi=komi,
        rules=rules,
        result=result,
        moves=parsed_moves,
    )
