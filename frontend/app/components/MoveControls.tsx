"use client";

import {
	ChevronFirst,
	ChevronLast,
	ChevronLeft,
	ChevronRight,
	Pause,
	Play,
} from "lucide-react";
import { useEffect, useState } from "react";

interface MoveControlsProps {
	currentMoveNumber: number;
	totalMoves: number;
	onSelectMove: (moveNumber: number) => void;
}

export default function MoveControls({
	currentMoveNumber,
	totalMoves,
	onSelectMove,
}: MoveControlsProps) {
	const [isPlaying, setIsPlaying] = useState(false);

	// Keyboard arrow navigation
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (
				e.target instanceof HTMLInputElement ||
				e.target instanceof HTMLTextAreaElement
			) {
				return;
			}
			if (e.key === "ArrowLeft") {
				e.preventDefault();
				onSelectMove(Math.max(0, currentMoveNumber - 1));
			} else if (e.key === "ArrowRight") {
				e.preventDefault();
				onSelectMove(Math.min(totalMoves, currentMoveNumber + 1));
			} else if (e.key === "Home") {
				e.preventDefault();
				onSelectMove(0);
			} else if (e.key === "End") {
				e.preventDefault();
				onSelectMove(totalMoves);
			} else if (e.key === " ") {
				e.preventDefault();
				setIsPlaying((prev) => !prev);
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [currentMoveNumber, totalMoves, onSelectMove]);

	// Auto-play timer
	useEffect(() => {
		if (!isPlaying) return;
		if (currentMoveNumber >= totalMoves) {
			setIsPlaying(false);
			return;
		}

		const interval = setInterval(() => {
			onSelectMove(currentMoveNumber + 1);
		}, 1200);

		return () => clearInterval(interval);
	}, [isPlaying, currentMoveNumber, totalMoves, onSelectMove]);

	return (
		<div className="flex w-full flex-col gap-2 rounded-xl border border-stone-800 bg-stone-900/90 p-3 shadow-xl backdrop-blur-md">
			{/* Slider scrubber */}
			<div className="flex items-center gap-3">
				<span className="font-mono text-stone-400 text-xs">0</span>
				<input
					type="range"
					min="0"
					max={totalMoves}
					value={currentMoveNumber}
					onChange={(e) => onSelectMove(Number(e.target.value))}
					className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-stone-800 accent-amber-400 focus:outline-none"
				/>
				<span className="font-mono text-stone-400 text-xs">{totalMoves}</span>
			</div>

			{/* Buttons toolbar */}
			<div className="flex items-center justify-between pt-1">
				<div className="flex items-center gap-1.5">
					<button
						type="button"
						onClick={() => onSelectMove(0)}
						disabled={currentMoveNumber <= 0}
						className="flex h-9 w-9 items-center justify-center rounded-lg border border-stone-800 bg-stone-950 text-stone-300 transition-colors hover:border-stone-700 hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-40"
						title="First Move (Home)"
					>
						<ChevronFirst className="h-4 w-4" />
					</button>

					<button
						type="button"
						onClick={() => onSelectMove(Math.max(0, currentMoveNumber - 1))}
						disabled={currentMoveNumber <= 0}
						className="flex h-9 w-9 items-center justify-center rounded-lg border border-stone-800 bg-stone-950 text-stone-300 transition-colors hover:border-stone-700 hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-40"
						title="Previous Move (←)"
					>
						<ChevronLeft className="h-4 w-4" />
					</button>

					<button
						type="button"
						onClick={() => setIsPlaying((prev) => !prev)}
						disabled={totalMoves === 0}
						className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
							isPlaying
								? "border-amber-500/50 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30"
								: "border-stone-800 bg-stone-950 text-stone-300 hover:border-stone-700 hover:bg-stone-800"
						}`}
						title="Play/Pause (Space)"
					>
						{isPlaying ? (
							<Pause className="h-4 w-4" />
						) : (
							<Play className="h-4 w-4" />
						)}
					</button>

					<button
						type="button"
						onClick={() =>
							onSelectMove(Math.min(totalMoves, currentMoveNumber + 1))
						}
						disabled={currentMoveNumber >= totalMoves}
						className="flex h-9 w-9 items-center justify-center rounded-lg border border-stone-800 bg-stone-950 text-stone-300 transition-colors hover:border-stone-700 hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-40"
						title="Next Move (→)"
					>
						<ChevronRight className="h-4 w-4" />
					</button>

					<button
						type="button"
						onClick={() => onSelectMove(totalMoves)}
						disabled={currentMoveNumber >= totalMoves}
						className="flex h-9 w-9 items-center justify-center rounded-lg border border-stone-800 bg-stone-950 text-stone-300 transition-colors hover:border-stone-700 hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-40"
						title="Last Move (End)"
					>
						<ChevronLast className="h-4 w-4" />
					</button>
				</div>

				<div className="font-mono text-stone-400 text-xs">
					Move <strong className="text-amber-400">{currentMoveNumber}</strong> /{" "}
					{totalMoves}
				</div>
			</div>
		</div>
	);
}
