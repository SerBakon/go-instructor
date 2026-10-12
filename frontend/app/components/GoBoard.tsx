"use client";

import { useMemo } from "react";
import { type BoardState, gtpToCoords } from "../lib/go-engine";

interface GoBoardProps {
	boardState: BoardState;
	size?: number;
	currentMoveNumber: number;
	lastMovePlayer?: "B" | "W" | null;
	lastMoveCoordinate?: string | null;
	bestMoveCoordinate?: string | null;
}

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

export default function GoBoard({
	boardState,
	size = 19,
	currentMoveNumber,
	lastMovePlayer,
	lastMoveCoordinate,
	bestMoveCoordinate,
}: GoBoardProps) {
	// Board SVG dimensions
	const viewBoxSize = 760;
	const margin = 44;
	const gridSpan = viewBoxSize - margin * 2;
	const cellSize = gridSpan / (size - 1);
	const stoneRadius = cellSize * 0.47;

	// Star points (hoshi) for 19x19 board
	const starPoints = useMemo(() => {
		if (size !== 19) return [];
		const points = [3, 9, 15];
		const result: [number, number][] = [];
		for (const x of points) {
			for (const y of points) {
				result.push([x, y]);
			}
		}
		return result;
	}, [size]);

	// Best move coordinates
	const bestMoveCoords = useMemo(() => {
		return gtpToCoords(bestMoveCoordinate, size);
	}, [bestMoveCoordinate, size]);

	const isPassMove =
		currentMoveNumber > 0 &&
		(!lastMoveCoordinate ||
			lastMoveCoordinate.toUpperCase() === "PASS" ||
			lastMoveCoordinate.toUpperCase() === "");

	return (
		<div className="relative flex w-full max-w-[620px] select-none flex-col items-center">
			<div className="relative aspect-square w-full rounded-2xl bg-gradient-to-br from-[#dfb15b] via-[#d5a44a] to-[#c59339] p-2 shadow-2xl ring-1 ring-amber-900/30">
				<svg
					viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
					className="h-full w-full"
					role="img"
					aria-label="Go Board"
				>
					<title>Go Board</title>
					<defs>
						{/* Wood subtle texture pattern */}
						<linearGradient id="woodGrain" x1="0%" y1="0%" x2="100%" y2="100%">
							<stop offset="0%" stopColor="#e3b662" />
							<stop offset="50%" stopColor="#d9a850" />
							<stop offset="100%" stopColor="#c8963e" />
						</linearGradient>

						{/* Black stone gradient */}
						<radialGradient id="blackStone" cx="35%" cy="35%" r="65%">
							<stop offset="0%" stopColor="#4a4a4a" />
							<stop offset="40%" stopColor="#222222" />
							<stop offset="100%" stopColor="#080808" />
						</radialGradient>

						{/* White stone gradient */}
						<radialGradient id="whiteStone" cx="35%" cy="35%" r="65%">
							<stop offset="0%" stopColor="#ffffff" />
							<stop offset="65%" stopColor="#e6e6e6" />
							<stop offset="100%" stopColor="#c8c8c8" />
						</radialGradient>

						{/* Drop shadows */}
						<filter
							id="stoneShadow"
							x="-20%"
							y="-20%"
							width="150%"
							height="150%"
						>
							<feDropShadow
								dx="2"
								dy="3"
								stdDeviation="2.5"
								floodColor="#1a0f05"
								floodOpacity="0.45"
							/>
						</filter>
						<filter
							id="ghostShadow"
							x="-20%"
							y="-20%"
							width="150%"
							height="150%"
						>
							<feDropShadow
								dx="0"
								dy="0"
								stdDeviation="4"
								floodColor="#38bdf8"
								floodOpacity="0.8"
							/>
						</filter>
					</defs>

					{/* Board Background */}
					<rect
						x="0"
						y="0"
						width={viewBoxSize}
						height={viewBoxSize}
						rx="16"
						fill="url(#woodGrain)"
					/>

					{/* Coordinate Labels - Columns (A..T, skipping I) */}
					{GTP_COLUMNS.slice(0, size).map((col, idx) => {
						const cx = margin + idx * cellSize;
						return (
							<g key={`col-${col}`}>
								<text
									x={cx}
									y={margin - 16}
									textAnchor="middle"
									className="fill-amber-950/70 font-semibold text-[13px] tracking-wider"
								>
									{col}
								</text>
								<text
									x={cx}
									y={viewBoxSize - margin + 26}
									textAnchor="middle"
									className="fill-amber-950/70 font-semibold text-[13px] tracking-wider"
								>
									{col}
								</text>
							</g>
						);
					})}

					{/* Coordinate Labels - Rows (19..1) */}
					{Array.from({ length: size }).map((_, idx) => {
						const rowNum = size - idx;
						const cy = margin + idx * cellSize;
						return (
							<g key={`row-${rowNum}`}>
								<text
									x={margin - 20}
									y={cy + 4}
									textAnchor="middle"
									className="fill-amber-950/70 font-semibold text-[13px] tracking-wider"
								>
									{rowNum}
								</text>
								<text
									x={viewBoxSize - margin + 20}
									y={cy + 4}
									textAnchor="middle"
									className="fill-amber-950/70 font-semibold text-[13px] tracking-wider"
								>
									{rowNum}
								</text>
							</g>
						);
					})}

					{/* Grid Lines - Horizontal */}
					{Array.from({ length: size }).map((_, idx) => {
						const y = margin + idx * cellSize;
						return (
							<line
								key={`h-${idx}`}
								x1={margin}
								y1={y}
								x2={viewBoxSize - margin}
								y2={y}
								stroke="#5c3f1f"
								strokeWidth={idx === 0 || idx === size - 1 ? "1.8" : "1.1"}
								strokeLinecap="round"
							/>
						);
					})}

					{/* Grid Lines - Vertical */}
					{Array.from({ length: size }).map((_, idx) => {
						const x = margin + idx * cellSize;
						return (
							<line
								key={`v-${idx}`}
								x1={x}
								y1={margin}
								x2={x}
								y2={viewBoxSize - margin}
								stroke="#5c3f1f"
								strokeWidth={idx === 0 || idx === size - 1 ? "1.8" : "1.1"}
								strokeLinecap="round"
							/>
						);
					})}

					{/* Star Points (Hoshi) */}
					{starPoints.map(([sx, sy]) => {
						const cx = margin + sx * cellSize;
						const cy = margin + sy * cellSize;
						return (
							<circle
								key={`star-${sx}-${sy}`}
								cx={cx}
								cy={cy}
								r="3.5"
								fill="#4a3014"
							/>
						);
					})}

					{/* Played Stones */}
					{boardState.grid.map((row, y) =>
						row.map((stone, x) => {
							if (!stone) return null;
							const cx = margin + x * cellSize;
							const cy = margin + y * cellSize;
							const isLastMove =
								boardState.lastMove?.x === x && boardState.lastMove?.y === y;

							return (
								<g key={`stone-${x}-${y}`} filter="url(#stoneShadow)">
									<circle
										cx={cx}
										cy={cy}
										r={stoneRadius}
										fill={
											stone === "B" ? "url(#blackStone)" : "url(#whiteStone)"
										}
										stroke={stone === "W" ? "#b0b0b0" : "none"}
										strokeWidth="0.8"
									/>
									{/* Last move marker ring */}
									{isLastMove && (
										<circle
											cx={cx}
											cy={cy}
											r={stoneRadius * 0.42}
											fill="none"
											stroke={stone === "B" ? "#ffffff" : "#0f172a"}
											strokeWidth="2.5"
											strokeOpacity="0.9"
										/>
									)}
								</g>
							);
						}),
					)}

					{/* KataGo Recommended Best Move (Ghost Stone / Target) */}
					{bestMoveCoords && (
						<g filter="url(#ghostShadow)" className="animate-pulse">
							{(() => {
								const bx = margin + bestMoveCoords.x * cellSize;
								const by = margin + bestMoveCoords.y * cellSize;
								const isOccupied =
									boardState.grid[bestMoveCoords.y]?.[bestMoveCoords.x] !==
									null;

								return (
									<g>
										<circle
											cx={bx}
											cy={by}
											r={stoneRadius * 0.92}
											fill={lastMovePlayer === "B" ? "#0284c7" : "#38bdf8"}
											fillOpacity={isOccupied ? "0.35" : "0.55"}
											stroke="#38bdf8"
											strokeWidth="2.5"
											strokeDasharray="4 2"
										/>
										<text
											x={bx}
											y={by + 4}
											textAnchor="middle"
											className="fill-white font-bold text-[12px]"
										>
											AI
										</text>
									</g>
								);
							})()}
						</g>
					)}
				</svg>

				{/* Floating Pass Badge */}
				{isPassMove && (
					<div className="pointer-events-none absolute inset-0 flex items-center justify-center">
						<div className="rounded-xl border border-amber-600/40 bg-amber-950/80 px-6 py-2.5 font-semibold text-amber-100 text-sm shadow-xl backdrop-blur-md">
							{lastMovePlayer === "B" ? "Black" : "White"} Passed
						</div>
					</div>
				)}
			</div>

			{/* Captures & Current Move Bar */}
			<div className="mt-3 flex w-full items-center justify-between rounded-xl border border-stone-800 bg-stone-900/90 px-4 py-2 text-stone-300 text-xs shadow-inner">
				<div className="flex items-center gap-2">
					<span className="inline-block h-3 w-3 rounded-full bg-black ring-1 ring-stone-600" />
					<span>Black Captures:</span>
					<strong className="text-stone-100">{boardState.captures.B}</strong>
				</div>

				<div className="font-mono text-stone-400">
					Move{" "}
					<span className="font-bold text-amber-400">{currentMoveNumber}</span>
				</div>

				<div className="flex items-center gap-2">
					<span className="inline-block h-3 w-3 rounded-full bg-white ring-1 ring-stone-400" />
					<span>White Captures:</span>
					<strong className="text-stone-100">{boardState.captures.W}</strong>
				</div>
			</div>
		</div>
	);
}
