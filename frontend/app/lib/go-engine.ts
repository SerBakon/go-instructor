export type Player = "B" | "W";
export type Stone = Player | null;

export interface MoveItem {
	move_number: number;
	player: string;
	coordinate: string | null;
	comment?: string | null;
}

export interface BoardState {
	grid: Stone[][]; // 19x19 grid, grid[y][x]
	captures: {
		B: number;
		W: number;
	};
	lastMove: {
		x: number;
		y: number;
		player: Player;
	} | null;
}

// GTP column letters: A through T, excluding 'I'
const GTP_COLUMNS = [
	"A",
	"B",
	"C",
	"D",
	"E",
	"F",
	"G",
	"H",
	"J",
	"K",
	"L",
	"M",
	"N",
	"O",
	"P",
	"Q",
	"R",
	"S",
	"T",
];

/**
 * Converts a GTP coordinate string (e.g. "Q16", "D4", "pass") to 0-indexed (x, y) coordinates.
 * x: 0 (A) to 18 (T)
 * y: 0 (top, row 19) to 18 (bottom, row 1)
 */
export function gtpToCoords(
	coord: string | null | undefined,
	size = 19,
): { x: number; y: number } | null {
	if (!coord) return null;
	const clean = coord.trim().toUpperCase();
	if (clean === "PASS" || clean === "" || clean === "RESIGN") return null;

	const colLetter = clean[0];
	const rowStr = clean.slice(1);

	const x = GTP_COLUMNS.indexOf(colLetter);
	const rowNum = Number.parseInt(rowStr, 10);

	if (x === -1 || Number.isNaN(rowNum) || rowNum < 1 || rowNum > size) {
		return null;
	}

	// In GTP, 1 is the bottom row and `size` is the top row.
	// For screen rendering, y = 0 is top.
	const y = size - rowNum;
	return { x, y };
}

/**
 * Converts 0-indexed (x, y) coordinates back to a GTP coordinate string.
 */
export function coordsToGtp(x: number, y: number, size = 19): string {
	if (x < 0 || x >= size || y < 0 || y >= size) return "pass";
	const colLetter = GTP_COLUMNS[x] ?? "?";
	const rowNum = size - y;
	return `${colLetter}${rowNum}`;
}

export function createEmptyBoard(size = 19): Stone[][] {
	return Array.from({ length: size }, () => Array(size).fill(null));
}

function getNeighbors(x: number, y: number, size = 19): [number, number][] {
	const neighbors: [number, number][] = [];
	if (x > 0) neighbors.push([x - 1, y]);
	if (x < size - 1) neighbors.push([x + 1, y]);
	if (y > 0) neighbors.push([x, y - 1]);
	if (y < size - 1) neighbors.push([x, y + 1]);
	return neighbors;
}

/**
 * Finds a connected group of stones of the same color and counts its liberties.
 */
function findGroup(
	grid: Stone[][],
	startX: number,
	startY: number,
	size = 19,
): { stones: [number, number][]; liberties: Set<string> } {
	const color = grid[startY]?.[startX];
	if (!color) {
		return { stones: [], liberties: new Set() };
	}

	const stones: [number, number][] = [];
	const liberties = new Set<string>();
	const visited = new Set<string>();
	const queue: [number, number][] = [[startX, startY]];
	visited.add(`${startX},${startY}`);

	while (queue.length > 0) {
		const next = queue.shift();
		if (!next) break;
		const [cx, cy] = next;
		stones.push([cx, cy]);

		for (const [nx, ny] of getNeighbors(cx, cy, size)) {
			const key = `${nx},${ny}`;
			const neighborColor = grid[ny]?.[nx];

			if (neighborColor === null) {
				liberties.add(key);
			} else if (neighborColor === color && !visited.has(key)) {
				visited.add(key);
				queue.push([nx, ny]);
			}
		}
	}

	return { stones, liberties };
}

/**
 * Replays moves up to `targetMoveNumber` and returns the resulting board state.
 * targetMoveNumber = 0 means empty board before any moves are played.
 */
export function replayBoardState(
	moves: MoveItem[],
	targetMoveNumber: number,
	size = 19,
): BoardState {
	const grid = createEmptyBoard(size);
	const captures = { B: 0, W: 0 };
	let lastMove: BoardState["lastMove"] = null;

	const movesToPlay = moves.slice(0, targetMoveNumber);

	for (const move of movesToPlay) {
		const player = move.player.toUpperCase() as Player;
		if (player !== "B" && player !== "W") continue;

		const coords = gtpToCoords(move.coordinate, size);
		if (!coords) {
			// Pass move
			lastMove = null;
			continue;
		}

		const { x, y } = coords;
		grid[y][x] = player;
		lastMove = { x, y, player };

		const opponent: Player = player === "B" ? "W" : "B";
		const capturedGroups: [number, number][][] = [];

		// Check adjacent opponent stones for captures
		for (const [nx, ny] of getNeighbors(x, y, size)) {
			if (grid[ny]?.[nx] === opponent) {
				const group = findGroup(grid, nx, ny, size);
				if (group.liberties.size === 0) {
					capturedGroups.push(group.stones);
				}
			}
		}

		// Remove captured stones
		for (const stones of capturedGroups) {
			for (const [cx, cy] of stones) {
				if (grid[cy]?.[cx] === opponent) {
					grid[cy][cx] = null;
					captures[player] += 1;
				}
			}
		}

		// In case of suicide (rare/illegal in standard rules), remove self stones if no liberties
		const selfGroup = findGroup(grid, x, y, size);
		if (selfGroup.liberties.size === 0) {
			for (const [cx, cy] of selfGroup.stones) {
				grid[cy][cx] = null;
				captures[opponent] += 1;
			}
		}
	}

	return { grid, captures, lastMove };
}

/**
 * Pre-computes all board states for each move number from 0 to N.
 */
export function precalculateAllBoardStates(
	moves: MoveItem[],
	size = 19,
): BoardState[] {
	const states: BoardState[] = [replayBoardState([], 0, size)];
	for (let i = 1; i <= moves.length; i++) {
		states.push(replayBoardState(moves, i, size));
	}
	return states;
}

/**
 * Extracts board size from raw SGF text (looks for SZ[<num>]), defaulting to 19.
 */
export function extractBoardSizeFromSgf(
	rawSgf?: string | null,
	fallback = 19,
): number {
	if (!rawSgf) return fallback;
	const match = rawSgf.match(/SZ\[(\d+)\]/i);
	if (match) {
		const parsed = Number.parseInt(match[1], 10);
		if (!Number.isNaN(parsed) && parsed >= 2 && parsed <= 25) {
			return parsed;
		}
	}
	return fallback;
}
