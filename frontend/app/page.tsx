"use client";

import {
	FolderOpen,
	Loader2,
	Plus,
	RotateCw,
	Sparkles,
	Swords,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import CoachSidebar from "./components/CoachSidebar";
import GameListDrawer from "./components/GameListDrawer";
import GameUploader from "./components/GameUploader";
import GoBoard from "./components/GoBoard";
import MoveControls from "./components/MoveControls";
import WinrateChart from "./components/WinrateChart";
import { fetchGameAnalysis, fetchGames } from "./lib/api";
import {
	extractBoardSizeFromSgf,
	precalculateAllBoardStates,
} from "./lib/go-engine";
import type { GameAnalysis } from "./lib/types";

export default function Home() {
	const [game, setGame] = useState<GameAnalysis | null>(null);
	const [currentMoveNumber, setCurrentMoveNumber] = useState<number>(0);
	const [isUploaderOpen, setIsUploaderOpen] = useState<boolean>(false);
	const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
	const [isLoadingInitial, setIsLoadingInitial] = useState<boolean>(true);

	// Load the most recent game on first mount if available
	useEffect(() => {
		async function init() {
			try {
				const games = await fetchGames(0, 1);
				if (games.length > 0) {
					const fullGame = await fetchGameAnalysis(games[0].id);
					setGame(fullGame);
					setCurrentMoveNumber(fullGame.moves.length > 0 ? 1 : 0);
				} else {
					// No games yet -> open uploader
					setIsUploaderOpen(true);
				}
			} catch (err) {
				console.error("Initial load error", err);
				setIsUploaderOpen(true);
			} finally {
				setIsLoadingInitial(false);
			}
		}
		init();
	}, []);

	// Background polling when game status is analyzing or pending
	useEffect(() => {
		if (!game || (game.status !== "analyzing" && game.status !== "pending")) {
			return;
		}

		const pollId = setInterval(async () => {
			try {
				const updated = await fetchGameAnalysis(game.id);
				setGame(updated);
			} catch (err) {
				console.error("Polling error", err);
			}
		}, 2000);

		return () => clearInterval(pollId);
	}, [game?.id, game?.status]);

	// Determine board size (from API board_size or parsed from raw SGF)
	const boardSize = useMemo(() => {
		if (!game) return 19;
		if (game.board_size && game.board_size >= 2) return game.board_size;
		return extractBoardSizeFromSgf(game.raw_sgf, 19);
	}, [game]);

	// Precompute board states for all moves in memory (instant 0ms scrubbing)
	const boardStates = useMemo(() => {
		if (!game || game.moves.length === 0) {
			return precalculateAllBoardStates([], boardSize);
		}
		return precalculateAllBoardStates(game.moves, boardSize);
	}, [game?.moves, boardSize]);

	const currentBoardState = useMemo(() => {
		const safeIdx = Math.max(
			0,
			Math.min(currentMoveNumber, boardStates.length - 1),
		);
		return boardStates[safeIdx];
	}, [boardStates, currentMoveNumber]);

	const currentMove = useMemo(() => {
		if (!game || currentMoveNumber === 0) return null;
		return game.moves[currentMoveNumber - 1] ?? null;
	}, [game, currentMoveNumber]);

	const handleGameLoaded = useCallback((newGame: GameAnalysis) => {
		setGame(newGame);
		setCurrentMoveNumber(newGame.moves.length > 0 ? 1 : 0);
		setIsUploaderOpen(false);
	}, []);

	const handleSelectGame = useCallback(async (gameId: number) => {
		try {
			const fullGame = await fetchGameAnalysis(gameId);
			setGame(fullGame);
			setCurrentMoveNumber(fullGame.moves.length > 0 ? 1 : 0);
		} catch (err) {
			console.error("Failed to load selected game", err);
		}
	}, []);

	return (
		<div className="flex min-h-screen flex-col bg-stone-950 font-sans text-stone-100">
			{/* Top Navigation Bar */}
			<header className="sticky top-0 z-40 flex items-center justify-between border-stone-800/80 border-b bg-stone-900/80 px-6 py-3.5 backdrop-blur-xl">
				<div className="flex items-center gap-3">
					<div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-stone-950 shadow-md ring-1 ring-amber-300/40">
						<Swords className="h-5 w-5" />
					</div>
					<div>
						<div className="flex items-center gap-2">
							<h1 className="font-bold text-base text-stone-100 tracking-tight">
								Go Instructor
							</h1>
							<span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-medium text-[10px] text-amber-400 ring-1 ring-amber-500/30">
								KataGo + Gemini AI
							</span>
						</div>
						<p className="text-[11px] text-stone-400">
							{game?.title || "AI-Powered Baduk Game Analysis"}
						</p>
					</div>
				</div>

				{/* Header Actions */}
				<div className="flex items-center gap-2.5">
					<button
						type="button"
						onClick={() => setIsDrawerOpen(true)}
						className="flex items-center gap-1.5 rounded-xl border border-stone-800 bg-stone-900/90 px-3.5 py-2 font-medium text-stone-300 text-xs transition-colors hover:border-stone-700 hover:bg-stone-800 hover:text-stone-100"
					>
						<FolderOpen className="h-4 w-4 text-stone-400" />
						Games Library
					</button>

					<button
						type="button"
						onClick={() => setIsUploaderOpen(true)}
						className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-3.5 py-2 font-semibold text-stone-950 text-xs shadow-md transition-transform hover:bg-amber-400 active:scale-[0.98]"
					>
						<Plus className="h-4 w-4" />
						Analyze SGF
					</button>
				</div>
			</header>

			{/* Ongoing Analysis Progress Banner */}
			{game && (game.status === "analyzing" || game.status === "pending") && (
				<div className="flex items-center justify-between border-amber-500/30 border-b bg-amber-500/10 px-6 py-2.5 text-amber-300 text-xs">
					<div className="flex items-center gap-2.5">
						<Loader2 className="h-4 w-4 animate-spin text-amber-400" />
						<span className="font-medium">
							KataGo engine is evaluating moves & Gemini AI is generating
							coaching explanations...
						</span>
					</div>
					<div className="flex items-center gap-2 text-[11px] text-amber-400/80">
						<span>Auto-updating in live background</span>
						<RotateCw className="h-3.5 w-3.5 animate-spin" />
					</div>
				</div>
			)}

			{/* Main Workspace Layout */}
			<main className="flex w-full flex-1 flex-col p-4 md:p-6 lg:flex-row lg:gap-6">
				{isLoadingInitial ? (
					<div className="flex flex-1 items-center justify-center">
						<div className="flex flex-col items-center gap-3 text-sm text-stone-400">
							<Loader2 className="h-8 w-8 animate-spin text-amber-400" />
							<span>Loading Go Instructor workspace...</span>
						</div>
					</div>
				) : game ? (
					<>
						{/* Left Column: Board, Controls & Winrate Chart */}
						<div className="flex w-full shrink-0 flex-col items-center gap-4 lg:w-[600px] xl:w-[660px] 2xl:w-[720px]">
							{/* Game Matchup Metadata Card */}
							<div className="flex w-full items-center justify-between rounded-xl border border-stone-800/90 bg-stone-900/80 px-4 py-2.5 text-xs">
								<div className="flex items-center gap-2">
									<span className="inline-block h-3.5 w-3.5 rounded-full bg-black ring-1 ring-stone-600" />
									<strong className="text-stone-200">
										{game.black_player || "Black"}
									</strong>
								</div>
								<div className="font-mono text-[11px] text-stone-400">
									<span className="rounded bg-stone-800 px-1.5 py-0.5 font-semibold text-amber-400">
										{boardSize}x{boardSize}
									</span>{" "}
									• Komi: {game.komi} • Rules: {game.rules}
									{game.result ? ` • Result: ${game.result}` : ""}
								</div>
								<div className="flex items-center gap-2">
									<strong className="text-stone-200">
										{game.white_player || "White"}
									</strong>
									<span className="inline-block h-3.5 w-3.5 rounded-full bg-white ring-1 ring-stone-400" />
								</div>
							</div>

							{/* Go Board */}
							<GoBoard
								boardState={currentBoardState}
								size={boardSize}
								currentMoveNumber={currentMoveNumber}
								lastMovePlayer={currentMove?.player ?? null}
								lastMoveCoordinate={currentMove?.coordinate ?? null}
								bestMoveCoordinate={currentMove?.analysis?.best_move ?? null}
							/>
						</div>

						{/* Right Column: Move Controls, Winrate Chart & AI Coach Sidebar */}
						<div className="mt-4 flex w-full min-w-0 flex-1 flex-col gap-4 lg:mt-0">
							{/* Move Navigation Controls */}
							<MoveControls
								currentMoveNumber={currentMoveNumber}
								totalMoves={game.moves.length}
								onSelectMove={setCurrentMoveNumber}
							/>

							{/* Winrate Timeline Chart */}
							<WinrateChart
								moves={game.moves}
								currentMoveNumber={currentMoveNumber}
								onSelectMove={setCurrentMoveNumber}
							/>

							{/* AI Coach Sidebar */}
							<CoachSidebar
								currentMove={currentMove}
								currentMoveNumber={currentMoveNumber}
								totalMoves={game.moves.length}
								boardSize={boardSize}
								moves={game.moves}
								onSelectMove={setCurrentMoveNumber}
							/>
						</div>
					</>
				) : (
					/* No Game Loaded Placeholder */
					<div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
						<div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/30">
							<Sparkles className="h-8 w-8" />
						</div>
						<h2 className="mt-4 font-bold text-stone-100 text-xl">
							Welcome to Go Instructor
						</h2>
						<p className="mt-2 max-w-md text-sm text-stone-400">
							Upload an SGF file or choose one of our built-in sample games to
							get KataGo winrates and Gemini AI coaching explanations.
						</p>
						<button
							type="button"
							onClick={() => setIsUploaderOpen(true)}
							className="mt-6 flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 font-semibold text-sm text-stone-950 shadow-xl transition-transform hover:bg-amber-400 active:scale-[0.98]"
						>
							<Plus className="h-4 w-4" />
							Analyze a Game Now
						</button>
					</div>
				)}
			</main>

			{/* Uploader Modal */}
			{isUploaderOpen && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md">
					<div className="w-full max-w-xl">
						<GameUploader
							onGameLoaded={handleGameLoaded}
							onClose={() => setIsUploaderOpen(false)}
						/>
					</div>
				</div>
			)}

			{/* Games Library Drawer */}
			<GameListDrawer
				isOpen={isDrawerOpen}
				currentGameId={game?.id}
				onSelectGame={handleSelectGame}
				onNewGameClick={() => setIsUploaderOpen(true)}
				onClose={() => setIsDrawerOpen(false)}
			/>
		</div>
	);
}
