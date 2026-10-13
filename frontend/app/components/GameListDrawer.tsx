"use client";

import { Plus, RotateCw, Swords, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { deleteGame, fetchGames } from "../lib/api";
import type { GameSummary } from "../lib/types";

interface GameListDrawerProps {
	isOpen: boolean;
	currentGameId?: number | null;
	onSelectGame: (gameId: number) => void;
	onNewGameClick: () => void;
	onClose: () => void;
}

export default function GameListDrawer({
	isOpen,
	currentGameId,
	onSelectGame,
	onNewGameClick,
	onClose,
}: GameListDrawerProps) {
	const [games, setGames] = useState<GameSummary[]>([]);
	const [isLoading, setIsLoading] = useState(false);

	const loadGames = async () => {
		setIsLoading(true);
		try {
			const list = await fetchGames();
			setGames(list);
		} catch (err) {
			console.error("Failed to fetch games list", err);
		} finally {
			setIsLoading(false);
		}
	};

	useEffect(() => {
		if (isOpen) {
			loadGames();
		}
	}, [isOpen]);

	const handleDelete = async (e: React.MouseEvent, gameId: number) => {
		e.stopPropagation();
		if (!confirm("Are you sure you want to delete this game analysis?")) return;
		try {
			await deleteGame(gameId);
			setGames((prev) => prev.filter((g) => g.id !== gameId));
		} catch (err) {
			console.error("Failed to delete game", err);
		}
	};

	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
			<div className="flex h-full w-full max-w-md flex-col border-stone-800 border-l bg-stone-900 p-6 text-stone-100 shadow-2xl">
				{/* Drawer Header */}
				<div className="mb-4 flex items-center justify-between border-stone-800 border-b pb-4">
					<div className="flex items-center gap-2">
						<Swords className="h-5 w-5 text-amber-400" />
						<h2 className="font-bold text-base text-stone-100">
							Analyzed Games
						</h2>
					</div>
					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={loadGames}
							className="rounded-lg p-1.5 text-stone-400 transition-colors hover:bg-stone-800 hover:text-stone-200"
							title="Refresh games"
						>
							<RotateCw
								className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
							/>
						</button>
						<button
							type="button"
							onClick={onClose}
							className="rounded-lg p-1.5 text-stone-400 transition-colors hover:bg-stone-800 hover:text-stone-200"
						>
							<X className="h-5 w-5" />
						</button>
					</div>
				</div>

				{/* New Game Button */}
				<button
					type="button"
					onClick={() => {
						onClose();
						onNewGameClick();
					}}
					className="mb-4 flex items-center justify-center gap-2 rounded-xl bg-amber-500 py-2.5 font-semibold text-stone-950 text-xs shadow-lg transition-transform hover:bg-amber-400 active:scale-[0.98]"
				>
					<Plus className="h-4 w-4" />
					Analyze New Game
				</button>

				{/* Games List */}
				<div className="flex-1 space-y-2 overflow-y-auto pr-1">
					{games.length === 0 && !isLoading && (
						<div className="py-12 text-center text-stone-500 text-xs">
							No games uploaded yet. Click "Analyze New Game" to start!
						</div>
					)}

					{games.map((g) => {
						const isSelected = g.id === currentGameId;
						return (
							<div
								key={g.id}
								className={`group flex items-center justify-between rounded-xl border p-3.5 transition-all ${
									isSelected
										? "border-amber-500/60 bg-amber-500/10 shadow-md"
										: "border-stone-800 bg-stone-950/70 hover:border-stone-700 hover:bg-stone-950"
								}`}
							>
								<button
									type="button"
									onClick={() => {
										onSelectGame(g.id);
										onClose();
									}}
									className="min-w-0 flex-1 pr-3 text-left focus:outline-none"
								>
									<h3 className="truncate font-semibold text-stone-200 text-xs">
										{g.title || `Game #${g.id}`}
									</h3>
									<p className="mt-0.5 truncate text-[11px] text-stone-400">
										{g.black_player || "Black"} vs {g.white_player || "White"}
									</p>
									<div className="mt-1 flex items-center gap-2 font-mono text-[10px] text-stone-500">
										<span>
											{g.board_size
												? `${g.board_size}x${g.board_size}`
												: "19x19"}
										</span>
										<span>•</span>
										<span>{g.move_count} moves</span>
										<span>•</span>
										<span
											className={
												g.status === "completed"
													? "text-emerald-400"
													: g.status === "analyzing"
														? "animate-pulse text-amber-400"
														: "text-stone-400"
											}
										>
											{g.status}
										</span>
									</div>
								</button>

								<button
									type="button"
									onClick={(e) => handleDelete(e, g.id)}
									className="rounded-lg p-1.5 text-stone-500 opacity-0 transition-all hover:bg-rose-500/20 hover:text-rose-400 group-hover:opacity-100"
									title="Delete game"
								>
									<Trash2 className="h-4 w-4" />
								</button>
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
}
