import type { GameAnalysis, GameSummary } from "./types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function fetchGames(skip = 0, limit = 50): Promise<GameSummary[]> {
	const res = await fetch(`${API_BASE_URL}/games?skip=${skip}&limit=${limit}`);
	if (!res.ok) {
		throw new Error(`Failed to fetch games: ${res.statusText}`);
	}
	return res.json();
}

export async function fetchGameAnalysis(gameId: number): Promise<GameAnalysis> {
	const res = await fetch(`${API_BASE_URL}/games/${gameId}/analysis`);
	if (!res.ok) {
		throw new Error(`Failed to fetch game analysis: ${res.statusText}`);
	}
	return res.json();
}

export async function uploadSgfFile(
	file: File,
	title?: string,
): Promise<GameAnalysis> {
	const formData = new FormData();
	formData.append("file", file);
	if (title?.trim()) {
		formData.append("title", title.trim());
	}

	const res = await fetch(`${API_BASE_URL}/games/upload?auto_analyze=true`, {
		method: "POST",
		body: formData,
	});

	if (!res.ok) {
		const err = await res.json().catch(() => ({}));
		throw new Error(err.detail || `Upload failed: ${res.statusText}`);
	}
	return res.json();
}

export async function createGameFromRawSgf(
	rawSgf: string,
	title?: string,
): Promise<GameAnalysis> {
	const res = await fetch(`${API_BASE_URL}/games?auto_analyze=true`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			raw_sgf: rawSgf,
			title: title?.trim() || null,
		}),
	});

	if (!res.ok) {
		const err = await res.json().catch(() => ({}));
		throw new Error(err.detail || `Failed to create game: ${res.statusText}`);
	}
	return res.json();
}

export async function triggerAnalysis(gameId: number): Promise<void> {
	const res = await fetch(`${API_BASE_URL}/games/${gameId}/analyze`, {
		method: "POST",
	});
	if (!res.ok) {
		throw new Error(`Failed to trigger analysis: ${res.statusText}`);
	}
}

export async function triggerExplanations(gameId: number): Promise<void> {
	const res = await fetch(`${API_BASE_URL}/games/${gameId}/explain`, {
		method: "POST",
	});
	if (!res.ok) {
		throw new Error(`Failed to trigger explanations: ${res.statusText}`);
	}
}

export async function deleteGame(gameId: number): Promise<void> {
	const res = await fetch(`${API_BASE_URL}/games/${gameId}`, {
		method: "DELETE",
	});
	if (!res.ok) {
		throw new Error(`Failed to delete game: ${res.statusText}`);
	}
}
