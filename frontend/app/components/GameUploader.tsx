"use client";

import { Code2, FileUp, PlayCircle, Sparkles, Upload, X } from "lucide-react";
import { type DragEvent, useState } from "react";
import { createGameFromRawSgf, uploadSgfFile } from "../lib/api";
import { SAMPLE_GAMES, type SampleGame } from "../lib/sample-games";
import type { GameAnalysis } from "../lib/types";

interface GameUploaderProps {
	onGameLoaded: (game: GameAnalysis) => void;
	onClose?: () => void;
}

export default function GameUploader({
	onGameLoaded,
	onClose,
}: GameUploaderProps) {
	const [activeTab, setActiveTab] = useState<"upload" | "paste" | "samples">(
		"upload",
	);
	const [isDragging, setIsDragging] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [rawSgf, setRawSgf] = useState("");
	const [customTitle, setCustomTitle] = useState("");
	const [error, setError] = useState<string | null>(null);

	const handleFile = async (file: File) => {
		if (
			!file.name.toLowerCase().endsWith(".sgf") &&
			!file.name.toLowerCase().endsWith(".txt")
		) {
			setError("Please select a file with .sgf or .txt extension");
			return;
		}

		setIsSubmitting(true);
		setError(null);
		try {
			const game = await uploadSgfFile(file, customTitle);
			onGameLoaded(game);
		} catch (err: unknown) {
			setError(
				err instanceof Error ? err.message : "Failed to upload SGF file",
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleDrop = (e: DragEvent<HTMLElement>) => {
		e.preventDefault();
		setIsDragging(false);
		const file = e.dataTransfer.files[0];
		if (file) {
			handleFile(file);
		}
	};

	const handlePasteSubmit = async () => {
		if (!rawSgf.trim()) {
			setError("Please paste SGF text");
			return;
		}

		setIsSubmitting(true);
		setError(null);
		try {
			const game = await createGameFromRawSgf(rawSgf, customTitle);
			onGameLoaded(game);
		} catch (err: unknown) {
			setError(
				err instanceof Error ? err.message : "Failed to process SGF text",
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleSampleSelect = async (sample: SampleGame) => {
		setIsSubmitting(true);
		setError(null);
		try {
			const game = await createGameFromRawSgf(sample.sgf, sample.title);
			onGameLoaded(game);
		} catch (err: unknown) {
			setError(
				err instanceof Error ? err.message : "Failed to load sample game",
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div className="flex w-full flex-col rounded-2xl border border-stone-800 bg-stone-900/95 p-6 shadow-2xl backdrop-blur-xl">
			{/* Header */}
			<div className="mb-4 flex items-center justify-between border-stone-800 border-b pb-3">
				<div>
					<h2 className="font-bold text-lg text-stone-100">
						Analyze a Go Game
					</h2>
					<p className="text-stone-400 text-xs">
						Upload an SGF, paste game text, or test with classic games
					</p>
				</div>
				{onClose && (
					<button
						type="button"
						onClick={onClose}
						className="rounded-lg p-1 text-stone-400 transition-colors hover:bg-stone-800 hover:text-stone-200"
					>
						<X className="h-5 w-5" />
					</button>
				)}
			</div>

			{/* Tabs */}
			<div className="mb-4 flex gap-1 rounded-xl bg-stone-950 p-1 text-xs">
				<button
					type="button"
					onClick={() => setActiveTab("upload")}
					className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 font-medium transition-colors ${
						activeTab === "upload"
							? "bg-amber-500/20 text-amber-300 shadow-sm"
							: "text-stone-400 hover:text-stone-200"
					}`}
				>
					<Upload className="h-3.5 w-3.5" />
					Upload File
				</button>
				<button
					type="button"
					onClick={() => setActiveTab("paste")}
					className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 font-medium transition-colors ${
						activeTab === "paste"
							? "bg-amber-500/20 text-amber-300 shadow-sm"
							: "text-stone-400 hover:text-stone-200"
					}`}
				>
					<Code2 className="h-3.5 w-3.5" />
					Paste SGF
				</button>
				<button
					type="button"
					onClick={() => setActiveTab("samples")}
					className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 font-medium transition-colors ${
						activeTab === "samples"
							? "bg-amber-500/20 text-amber-300 shadow-sm"
							: "text-stone-400 hover:text-stone-200"
					}`}
				>
					<Sparkles className="h-3.5 w-3.5 text-amber-400" />
					Sample Games
				</button>
			</div>

			{/* Optional Custom Title Field */}
			<div className="mb-4">
				<label
					htmlFor="custom-title-input"
					className="mb-1 block font-medium text-stone-400 text-xs"
				>
					Custom Game Title (Optional)
				</label>
				<input
					id="custom-title-input"
					type="text"
					value={customTitle}
					onChange={(e) => setCustomTitle(e.target.value)}
					placeholder="e.g. My OGS Ranked Game #42"
					className="w-full rounded-lg border border-stone-800 bg-stone-950 px-3 py-2 text-stone-200 text-xs placeholder-stone-600 focus:border-amber-500/60 focus:outline-none"
				/>
			</div>

			{/* Error Alert */}
			{error && (
				<div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-rose-300 text-xs">
					{error}
				</div>
			)}

			{/* Tab 1: File Upload */}
			{activeTab === "upload" && (
				<label
					htmlFor="sgf-file-input"
					onDragOver={(e) => {
						e.preventDefault();
						setIsDragging(true);
					}}
					onDragLeave={() => setIsDragging(false)}
					onDrop={handleDrop}
					className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
						isDragging
							? "border-amber-400 bg-amber-500/10"
							: "border-stone-800 bg-stone-950/60 hover:border-stone-700"
					}`}
				>
					<FileUp className="mb-3 h-10 w-10 text-stone-400" />
					<h3 className="font-semibold text-sm text-stone-200">
						Drag & drop your SGF file here
					</h3>
					<p className="mt-1 text-stone-500 text-xs">
						Supports standard .sgf files from OGS, Fox, KGS, Tygem
					</p>

					<span className="mt-4 inline-block rounded-lg border border-stone-700 bg-stone-800 px-4 py-2 font-medium text-stone-200 text-xs transition-colors hover:border-stone-600 hover:bg-stone-700">
						Browse Files
					</span>
					<input
						id="sgf-file-input"
						type="file"
						accept=".sgf,.txt"
						className="hidden"
						onChange={(e) => {
							const file = e.target.files?.[0];
							if (file) handleFile(file);
						}}
					/>
				</label>
			)}

			{/* Tab 2: Paste Raw SGF */}
			{activeTab === "paste" && (
				<div className="flex flex-col gap-3">
					<textarea
						rows={6}
						value={rawSgf}
						onChange={(e) => setRawSgf(e.target.value)}
						placeholder="(;GM[1]FF[4]CA[UTF-8]KM[6.5]RU[Japanese]PB[Black]PW[White];B[pd];W[dp]...)"
						className="w-full resize-none rounded-xl border border-stone-800 bg-stone-950 p-3 font-mono text-stone-300 text-xs placeholder-stone-600 focus:border-amber-500/60 focus:outline-none"
					/>
					<button
						type="button"
						onClick={handlePasteSubmit}
						disabled={isSubmitting || !rawSgf.trim()}
						className="flex items-center justify-center gap-2 rounded-xl bg-amber-500 py-2.5 font-semibold text-stone-950 text-xs shadow-lg transition-transform hover:bg-amber-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
					>
						{isSubmitting ? "Processing..." : "Analyze SGF"}
					</button>
				</div>
			)}

			{/* Tab 3: Sample Games */}
			{activeTab === "samples" && (
				<div className="flex flex-col gap-2.5">
					{SAMPLE_GAMES.map((sample) => (
						<div
							key={sample.id}
							className="flex items-center justify-between rounded-xl border border-stone-800 bg-stone-950/80 p-3.5 transition-colors hover:border-stone-700 hover:bg-stone-950"
						>
							<div className="pr-3">
								<h3 className="font-semibold text-stone-200 text-xs">
									{sample.title}
								</h3>
								<p className="mt-0.5 line-clamp-1 text-[11px] text-stone-400">
									{sample.description}
								</p>
								<div className="mt-1 flex items-center gap-2 font-mono text-[10px] text-stone-500">
									<span>
										{sample.blackPlayer} vs {sample.whitePlayer}
									</span>
									<span>•</span>
									<span>{sample.moveCount} moves</span>
								</div>
							</div>

							<button
								type="button"
								onClick={() => handleSampleSelect(sample)}
								disabled={isSubmitting}
								className="flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 font-medium text-amber-300 text-xs transition-colors hover:bg-amber-500/25 disabled:opacity-50"
							>
								<PlayCircle className="h-3.5 w-3.5" />
								Load & Analyze
							</button>
						</div>
					))}
				</div>
			)}

			{isSubmitting && (
				<div className="mt-4 flex items-center justify-center gap-2 text-amber-400 text-xs">
					<span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
					<span>Uploading game and initiating KataGo analysis...</span>
				</div>
			)}
		</div>
	);
}
