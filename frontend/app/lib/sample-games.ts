export interface SampleGame {
	id: string;
	title: string;
	description: string;
	blackPlayer: string;
	whitePlayer: string;
	moveCount: number;
	sgf: string;
}

export const SAMPLE_GAMES: SampleGame[] = [
	{
		id: "quick-demo",
		title: "Tactical Blunder Demo (Quick Test)",
		description:
			"A fast 7-move demo with deliberate blunders. Analyzes in under 2 seconds on CPU.",
		blackPlayer: "Player Black",
		whitePlayer: "Player White",
		moveCount: 7,
		sgf: `(;GM[1]FF[4]CA[UTF-8]KM[6.5]RU[Japanese]PB[Player Black]PW[Player White]EV[Tactical Blunder Demo];B[pd];W[dp];B[pp];W[dd];B[cf];W[];B[cc])`,
	},
	{
		id: "shusaku-opening",
		title: "Honinbo Shusaku vs Gennan Inseki (Opening)",
		description:
			"The famous 1846 Ear-Reddening game opening. Features classic 19th-century Japanese Go strategy.",
		blackPlayer: "Honinbo Shusaku",
		whitePlayer: "Gennan Inseki",
		moveCount: 22,
		sgf: `(;GM[1]FF[4]CA[UTF-8]KM[0.0]RU[Japanese]PB[Honinbo Shusaku]PW[Gennan Inseki]EV[Castle Game 1846]
;B[qd];W[dc];B[pq];W[oc];B[cp];W[po];B[pe];W[md];B[qo];W[qn];B[qp];W[pn];B[nq];W[qj];B[eq];W[ce];B[jc];W[qg];B[kc];W[le];B[je];W[og])`,
	},
	{
		id: "alphago-lee-sedol",
		title: "Lee Sedol vs AlphaGo (Game 4 Opening)",
		description:
			"The historic 2016 match where Lee Sedol scored humanity's victory against AlphaGo.",
		blackPlayer: "AlphaGo",
		whitePlayer: "Lee Sedol (9p)",
		moveCount: 24,
		sgf: `(;GM[1]FF[4]CA[UTF-8]KM[7.5]RU[Chinese]PB[AlphaGo]PW[Lee Sedol]EV[Google DeepMind Challenge Match 2016]
;B[pd];W[dp];B[cd];W[qp];B[op];W[oq];B[nq];W[pq];B[cn];W[fq];B[mp];W[po];B[iq];W[ed];B[ec];W[fc];B[dc];W[fd];B[cf];W[jd];B[pc];W[qf];B[nc];W[ne])`,
	},
];
