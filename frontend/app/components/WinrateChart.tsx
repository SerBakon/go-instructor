"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MoveWithAnalysis } from "../lib/types";

interface WinrateChartProps {
	moves: MoveWithAnalysis[];
	currentMoveNumber: number;
	onSelectMove: (moveNumber: number) => void;
}

export default function WinrateChart({
	moves,
	currentMoveNumber,
	onSelectMove,
}: WinrateChartProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [containerWidth, setContainerWidth] = useState<number>(800);
	const [hoveredMove, setHoveredMove] = useState<{
		moveNum: number;
		bWinrate: number;
		x: number;
		y: number;
	} | null>(null);

	// Dynamically measure container width for true 1:1 aspect ratio
	useEffect(() => {
		if (!containerRef.current) return;
		const el = containerRef.current;
		const updateWidth = () => {
			if (el.clientWidth > 0) {
				setContainerWidth(el.clientWidth);
			}
		};
		updateWidth();

		const ro = new ResizeObserver((entries) => {
			for (const entry of entries) {
				if (entry.contentRect.width > 0) {
					setContainerWidth(Math.round(entry.contentRect.width));
				}
			}
		});

		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	const chartWidth = Math.max(320, containerWidth);
	const chartHeight = 140;
	const padX = 24;
	const padY = 18;
	const plotWidth = chartWidth - padX * 2;
	const plotHeight = chartHeight - padY * 2;

	// Calculate points for Black's winrate (0 to 100)
	const points = useMemo(() => {
		if (moves.length === 0) return [];

		const pts: {
			moveNum: number;
			bWinrate: number;
			verdict: string | null;
			x: number;
			y: number;
		}[] = [];

		const totalSteps = Math.max(1, moves.length);

		// Add starting point (Move 0 = 50% even)
		pts.push({
			moveNum: 0,
			bWinrate: 50,
			verdict: null,
			x: padX,
			y: padY + plotHeight * 0.5,
		});

		for (let i = 0; i < moves.length; i++) {
			const m = moves[i];
			const analysis = m.analysis;
			let bWinrate = 50;

			if (analysis?.winrate != null) {
				const wr = analysis.winrate;
				if (m.player.toUpperCase() === "B") {
					bWinrate = Math.round(wr * 100);
				} else {
					bWinrate = Math.round((1 - wr) * 100);
				}
			}

			const x = padX + ((i + 1) / totalSteps) * plotWidth;
			const y = padY + plotHeight * (1 - bWinrate / 100);

			pts.push({
				moveNum: m.move_number,
				bWinrate,
				verdict: analysis?.verdict ?? null,
				x,
				y,
			});
		}

		return pts;
	}, [moves, plotWidth, plotHeight]);

	// Build SVG path
	const pathData = useMemo(() => {
		if (points.length === 0) return "";
		return points.reduce((acc, pt, idx) => {
			return idx === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`;
		}, "");
	}, [points]);

	// Build filled area under the line to center line (50%)
	const areaData = useMemo(() => {
		if (points.length === 0) return "";
		const startX = points[0].x;
		const endX = points[points.length - 1].x;
		const midY = padY + plotHeight * 0.5;

		return `${pathData} L ${endX} ${midY} L ${startX} ${midY} Z`;
	}, [pathData, points, plotHeight]);

	// Find the coordinates of the currently active move
	const currentPoint = useMemo(() => {
		return points.find((p) => p.moveNum === currentMoveNumber) ?? null;
	}, [points, currentMoveNumber]);

	const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
		const rect = e.currentTarget.getBoundingClientRect();
		const clickX = e.clientX - rect.left;
		const ratio = Math.max(0, Math.min(1, (clickX - padX) / plotWidth));
		const moveIndex = Math.round(ratio * moves.length);
		const pt = points.find((p) => p.moveNum === moveIndex);
		if (pt) {
			setHoveredMove(pt);
		}
	};

	const handleMouseLeave = () => {
		setHoveredMove(null);
	};

	return (
		<div className="flex w-full flex-col rounded-xl border border-stone-800 bg-stone-900/90 p-4 shadow-xl backdrop-blur-sm">
			{/* Header */}
			<div className="mb-2 flex items-center justify-between text-xs">
				<div className="flex items-center gap-2">
					<span className="font-semibold text-stone-200">Winrate Timeline</span>
					<span className="text-stone-400">(Black % advantage)</span>
				</div>
				<div className="flex items-center gap-4 text-[11px]">
					<div className="flex items-center gap-1.5">
						<span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-400" />
						<span className="text-stone-400">Mistake</span>
					</div>
					<div className="flex items-center gap-1.5">
						<span className="inline-block h-2.5 w-2.5 rounded-full bg-rose-500" />
						<span className="text-stone-400">Blunder</span>
					</div>
				</div>
			</div>

			{/* Interactive Timeline Container */}
			<div
				ref={containerRef}
				className="relative w-full cursor-pointer select-none overflow-hidden rounded-lg bg-stone-950/80 p-1 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
				onClick={(e) => {
					const rect = e.currentTarget.getBoundingClientRect();
					const clickX = e.clientX - rect.left;
					const ratio = Math.max(0, Math.min(1, (clickX - padX) / plotWidth));
					const targetMove = Math.round(ratio * moves.length);
					onSelectMove(targetMove);
				}}
				onMouseMove={handleMouseMove}
				onMouseLeave={handleMouseLeave}
				onKeyDown={(e) => {
					if (e.key === "ArrowLeft") {
						onSelectMove(Math.max(0, currentMoveNumber - 1));
					} else if (e.key === "ArrowRight") {
						onSelectMove(Math.min(moves.length, currentMoveNumber + 1));
					}
				}}
				tabIndex={0}
				role="slider"
				aria-label="Winrate chart timeline scrubber"
				aria-valuemin={0}
				aria-valuemax={moves.length}
				aria-valuenow={currentMoveNumber}
			>
				<svg
					viewBox={`0 0 ${chartWidth} ${chartHeight}`}
					className="h-[140px] w-full"
					aria-hidden="true"
				>
					<title>Winrate chart</title>
					<defs>
						<linearGradient id="winrateGradient" x1="0" y1="0" x2="0" y2="1">
							<stop offset="0%" stopColor="#38bdf8" stopOpacity="0.35" />
							<stop offset="50%" stopColor="#38bdf8" stopOpacity="0.05" />
							<stop offset="100%" stopColor="#f43f5e" stopOpacity="0.3" />
						</linearGradient>
					</defs>

					{/* 50% Center guide line */}
					<line
						x1={padX}
						y1={padY + plotHeight * 0.5}
						x2={chartWidth - padX}
						y2={padY + plotHeight * 0.5}
						stroke="#44403c"
						strokeWidth="1"
						strokeDasharray="4 4"
					/>

					{/* 50% Text Label */}
					<text
						x={padX + 4}
						y={padY + plotHeight * 0.5 - 5}
						className="fill-stone-500 font-mono text-[10px]"
					>
						50% Even
					</text>

					{/* Area Fill */}
					{areaData && <path d={areaData} fill="url(#winrateGradient)" />}

					{/* Winrate Polyline */}
					{pathData && (
						<path
							d={pathData}
							fill="none"
							stroke="#38bdf8"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					)}

					{/* Mistake & Blunder Marker Points (true 1:1 circles) */}
					{points.map((pt) => {
						if (pt.verdict === "blunder") {
							return (
								<circle
									key={`blunder-${pt.moveNum}`}
									cx={pt.x}
									cy={pt.y}
									r="4.5"
									fill="#f43f5e"
									stroke="#ffe4e6"
									strokeWidth="1.5"
								/>
							);
						}
						if (pt.verdict === "mistake") {
							return (
								<circle
									key={`mistake-${pt.moveNum}`}
									cx={pt.x}
									cy={pt.y}
									r="4"
									fill="#f59e0b"
									stroke="#fef3c7"
									strokeWidth="1.5"
								/>
							);
						}
						return null;
					})}

					{/* Hover guide indicator */}
					{hoveredMove && hoveredMove.moveNum !== currentMoveNumber && (
						<g>
							<line
								x1={hoveredMove.x}
								y1={padY}
								x2={hoveredMove.x}
								y2={chartHeight - padY}
								stroke="#78716c"
								strokeWidth="1"
								strokeDasharray="2 2"
							/>
							<circle
								cx={hoveredMove.x}
								cy={hoveredMove.y}
								r="3.5"
								fill="#a8a29e"
								opacity="0.8"
							/>
						</g>
					)}

					{/* Current move vertical scrubber indicator (true 1:1 circle) */}
					{currentPoint && (
						<g>
							<line
								x1={currentPoint.x}
								y1={padY}
								x2={currentPoint.x}
								y2={chartHeight - padY}
								stroke="#fbbf24"
								strokeWidth="2"
							/>
							<circle
								cx={currentPoint.x}
								cy={currentPoint.y}
								r="5.5"
								fill="#fbbf24"
								stroke="#451a03"
								strokeWidth="2"
							/>
						</g>
					)}
				</svg>
			</div>

			{/* Chart footer stats */}
			{currentPoint && (
				<div className="mt-2 flex items-center justify-between text-[11px] text-stone-400">
					<span>
						Move {currentPoint.moveNum}:{" "}
						<strong className="text-stone-200">
							{currentPoint.bWinrate}% Black
						</strong>{" "}
						/ {100 - currentPoint.bWinrate}% White
					</span>
					<span>Click or scrub to jump to any move</span>
				</div>
			)}
		</div>
	);
}
