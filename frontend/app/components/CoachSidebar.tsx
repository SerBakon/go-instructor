"use client";

import {
	AlertCircle,
	AlertTriangle,
	Award,
	Bot,
	CheckCircle2,
	ChevronLeft,
	ChevronRight,
	Compass,
	Lightbulb,
	TrendingDown,
} from "lucide-react";
import type { MoveWithAnalysis } from "../lib/types";

interface CoachSidebarProps {
	currentMove: MoveWithAnalysis | null;
	currentMoveNumber: number;
	totalMoves: number;
	moves: MoveWithAnalysis[];
	onSelectMove: (moveNumber: number) => void;
}

export default function CoachSidebar({
	currentMove,
	currentMoveNumber,
	totalMoves,
	moves,
	onSelectMove,
}: CoachSidebarProps) {
	const analysis = currentMove?.analysis;
	const verdict = analysis?.verdict ?? null;

	// Jump to next/prev mistake or blunder
	const nextFlaggedMove = moves.find(
		(m) =>
			m.move_number > currentMoveNumber &&
			(m.analysis?.verdict === "blunder" || m.analysis?.verdict === "mistake"),
	);

	const prevFlaggedMove = [...moves]
		.reverse()
		.find(
			(m) =>
				m.move_number < currentMoveNumber &&
				(m.analysis?.verdict === "blunder" ||
					m.analysis?.verdict === "mistake"),
		);

	const getVerdictBadge = () => {
		switch (verdict) {
			case "blunder":
				return (
					<span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/40 bg-rose-500/15 px-3 py-1 font-semibold text-rose-300 text-xs shadow-sm">
						<AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
						Blunder
					</span>
				);
			case "mistake":
				return (
					<span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/15 px-3 py-1 font-semibold text-amber-300 text-xs shadow-sm">
						<AlertCircle className="h-3.5 w-3.5 text-amber-400" />
						Mistake
					</span>
				);
			case "good":
				return (
					<span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-3 py-1 font-semibold text-emerald-300 text-xs shadow-sm">
						<CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
						Good Move
					</span>
				);
			case "neutral":
				return (
					<span className="inline-flex items-center gap-1.5 rounded-full border border-stone-600/50 bg-stone-700/20 px-3 py-1 font-medium text-stone-300 text-xs shadow-sm">
						<Award className="h-3.5 w-3.5 text-stone-400" />
						Standard
					</span>
				);
			default:
				return (
					<span className="inline-flex items-center gap-1.5 rounded-full border border-stone-700 bg-stone-800/40 px-3 py-1 font-medium text-stone-400 text-xs">
						Unrated
					</span>
				);
		}
	};

	return (
		<div className="flex h-full w-full flex-col gap-4 rounded-2xl border border-stone-800 bg-stone-900/90 p-5 text-stone-100 shadow-2xl backdrop-blur-md">
			{/* Move Title & Controls Header */}
			<div className="flex items-center justify-between border-stone-800/80 border-b pb-4">
				<div className="flex items-center gap-3">
					<div
						className={`flex h-9 w-9 items-center justify-center rounded-full font-bold text-sm shadow-md ring-1 ${
							currentMove?.player.toUpperCase() === "B"
								? "bg-stone-950 text-white ring-stone-700"
								: "bg-white text-stone-950 ring-stone-300"
						}`}
					>
						{currentMoveNumber === 0 ? "0" : currentMove?.player}
					</div>
					<div>
						<h2 className="font-semibold text-base text-stone-100">
							{currentMoveNumber === 0
								? "Game Start"
								: `Move ${currentMoveNumber}: ${currentMove?.coordinate || "Pass"}`}
						</h2>
						<p className="text-stone-400 text-xs">
							{currentMoveNumber === 0
								? "Empty 19x19 board"
								: `${currentMove?.player === "B" ? "Black" : "White"} • Move ${currentMoveNumber} of ${totalMoves}`}
						</p>
					</div>
				</div>

				<div>{getVerdictBadge()}</div>
			</div>

			{/* Jump to Next/Previous Blunder buttons */}
			<div className="grid grid-cols-2 gap-2 text-xs">
				<button
					type="button"
					onClick={() =>
						prevFlaggedMove && onSelectMove(prevFlaggedMove.move_number)
					}
					disabled={!prevFlaggedMove}
					className="flex items-center justify-center gap-1 rounded-lg border border-stone-800 bg-stone-950/60 px-3 py-2 text-stone-300 transition-colors hover:border-stone-700 hover:bg-stone-800/60 disabled:cursor-not-allowed disabled:opacity-40"
				>
					<ChevronLeft className="h-3.5 w-3.5" />
					Prev Error{" "}
					{prevFlaggedMove ? `(#${prevFlaggedMove.move_number})` : ""}
				</button>
				<button
					type="button"
					onClick={() =>
						nextFlaggedMove && onSelectMove(nextFlaggedMove.move_number)
					}
					disabled={!nextFlaggedMove}
					className="flex items-center justify-center gap-1 rounded-lg border border-stone-800 bg-stone-950/60 px-3 py-2 text-stone-300 transition-colors hover:border-stone-700 hover:bg-stone-800/60 disabled:cursor-not-allowed disabled:opacity-40"
				>
					Next Error{" "}
					{nextFlaggedMove ? `(#${nextFlaggedMove.move_number})` : ""}
					<ChevronRight className="h-3.5 w-3.5" />
				</button>
			</div>

			{/* KataGo Objective Metrics Cards */}
			{analysis && (
				<div className="grid grid-cols-2 gap-3">
					{/* Winrate Loss */}
					<div className="flex flex-col rounded-xl border border-stone-800/90 bg-stone-950/70 p-3 shadow-inner">
						<span className="text-[11px] text-stone-400">Winrate Loss</span>
						<div className="mt-1 flex items-baseline gap-1.5">
							<span
								className={`font-bold font-mono text-lg ${
									(analysis.winrate_loss ?? 0) >= 0.1
										? "text-rose-400"
										: (analysis.winrate_loss ?? 0) >= 0.04
											? "text-amber-400"
											: "text-emerald-400"
								}`}
							>
								{analysis.winrate_loss != null
									? `-${(analysis.winrate_loss * 100).toFixed(1)}%`
									: "--"}
							</span>
							<TrendingDown className="h-3.5 w-3.5 text-stone-500" />
						</div>
					</div>

					{/* Score Loss */}
					<div className="flex flex-col rounded-xl border border-stone-800/90 bg-stone-950/70 p-3 shadow-inner">
						<span className="text-[11px] text-stone-400">Score Loss</span>
						<div className="mt-1 flex items-baseline gap-1.5">
							<span
								className={`font-bold font-mono text-lg ${
									(analysis.score_loss ?? 0) >= 3.0
										? "text-rose-400"
										: (analysis.score_loss ?? 0) >= 1.0
											? "text-amber-400"
											: "text-emerald-400"
								}`}
							>
								{analysis.score_loss != null
									? `-${analysis.score_loss.toFixed(1)} pts`
									: "--"}
							</span>
							<TrendingDown className="h-3.5 w-3.5 text-stone-500" />
						</div>
					</div>
				</div>
			)}

			{/* Suggested Alternative vs Played Move */}
			{analysis?.best_move && (
				<div className="flex items-center justify-between rounded-xl border border-sky-900/40 bg-sky-950/30 p-3 text-xs shadow-sm">
					<div className="flex items-center gap-2">
						<Compass className="h-4 w-4 text-sky-400" />
						<span className="text-stone-300">KataGo Suggested:</span>
					</div>
					<div className="flex items-center gap-2">
						<span className="rounded bg-sky-500/20 px-2 py-0.5 font-bold font-mono text-sky-300 text-sm ring-1 ring-sky-500/30">
							{analysis.best_move}
						</span>
					</div>
				</div>
			)}

			{/* AI Teacher Coaching Explanation Card */}
			<div className="flex flex-1 flex-col rounded-xl border border-amber-900/30 bg-gradient-to-b from-amber-950/20 to-stone-950/80 p-4 shadow-xl">
				<div className="mb-2 flex items-center gap-2 border-amber-900/30 border-b pb-2 text-amber-300">
					<Bot className="h-4 w-4 text-amber-400" />
					<h3 className="font-semibold text-xs tracking-wide">
						AI Instructor Commentary
					</h3>
				</div>

				<div className="flex-1 overflow-y-auto pr-1 text-sm text-stone-200 leading-relaxed">
					{analysis?.explanation ? (
						<p className="whitespace-pre-line text-stone-300 text-xs sm:text-sm">
							{analysis.explanation}
						</p>
					) : verdict === "good" ? (
						<div className="flex flex-col gap-2 pt-2 text-emerald-300/90 text-xs">
							<div className="flex items-center gap-2">
								<CheckCircle2 className="h-4 w-4 text-emerald-400" />
								<span className="font-medium">
									Accurate and natural Go move.
								</span>
							</div>
							<p className="text-stone-400">
								KataGo confirms this play preserves the balance of territory and
								thickness without loss of initiative.
							</p>
						</div>
					) : verdict === "neutral" ? (
						<div className="flex flex-col gap-2 pt-2 text-stone-400 text-xs">
							<div className="flex items-center gap-2">
								<Lightbulb className="h-4 w-4 text-stone-400" />
								<span className="font-medium text-stone-300">
									Acceptable variation.
								</span>
							</div>
							<p>
								A playable choice with minor score delta. The position remains
								balanced.
							</p>
						</div>
					) : currentMoveNumber === 0 ? (
						<p className="pt-2 text-stone-400 text-xs italic">
							Use the arrow keys or scrubber below to step through moves and
							view AI evaluations.
						</p>
					) : (
						<p className="pt-2 text-stone-400 text-xs italic">
							Move evaluation in progress or unflagged.
						</p>
					)}
				</div>
			</div>
		</div>
	);
}
