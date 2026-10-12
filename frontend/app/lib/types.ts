export interface AnalysisResult {
	id: number;
	move_id: number;
	winrate: number | null;
	winrate_loss: number | null;
	score_lead: number | null;
	score_loss: number | null;
	best_move: string | null;
	verdict: "good" | "neutral" | "mistake" | "blunder" | null;
	explanation: string | null;
	created_at: string | null;
}

export interface MoveWithAnalysis {
	id: number;
	game_id: number;
	move_number: number;
	player: "B" | "W";
	coordinate: string | null;
	comment: string | null;
	analysis: AnalysisResult | null;
}

export interface GameAnalysis {
	id: number;
	user_id?: number | null;
	title: string | null;
	raw_sgf: string;
	black_player: string | null;
	white_player: string | null;
	komi: number;
	rules: string;
	result: string | null;
	status: "pending" | "analyzing" | "completed" | "failed";
	created_at: string | null;
	updated_at: string | null;
	move_count: number;
	moves: MoveWithAnalysis[];
}

export interface GameSummary {
	id: number;
	title: string | null;
	black_player: string | null;
	white_player: string | null;
	komi: number;
	rules: string;
	result: string | null;
	status: "pending" | "analyzing" | "completed" | "failed";
	move_count: number;
	created_at: string | null;
}
