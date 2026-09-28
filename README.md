# Go Game Instructor

Upload a recent Go (baduk) game and get move-by-move teaching: what was good,
what was a mistake, and why — powered by KataGo (objective move evaluation)
and an LLM (natural-language explanation).

KataGo judges. The LLM explains. The LLM is never asked to evaluate move
quality on its own — it only turns KataGo's numbers into a teaching
explanation for the moves KataGo flagged as significant.

## Stack

**Frontend** — `frontend/`
- Next.js + React + TypeScript
- Tailwind CSS
- Biome (linting/formatting — not ESLint/Prettier)
- Bun (package manager + runtime)

**Backend** — `backend/`
- FastAPI (Python)
- Postgres, via SQLAlchemy + Alembic migrations
- KataGo (analysis engine, run as a local process)
- Anthropic API (move explanations)

**Repo structure** — two independent projects in one repo (not a JS
monorepo/workspace):

```
/
├── frontend/       Next.js app
├── backend/        FastAPI app
├── scripts/        Cross-platform setup helpers
├── package.json    Root script runner (setup/dev commands only)
└── AGENTS.md        Context for AI coding agents working in this repo
```

## Prerequisites

- [Bun](https://bun.sh)
- Python 3.10+
- [Docker](https://www.docker.com/) (for local Postgres)
- A KataGo binary + neural net weights ([katago install guide](https://github.com/lightvector/KataGo))
- An Anthropic API key

## Features & Current Status

- [x] **PostgreSQL & Migrations**: Automated Docker container via `scripts/db-up.js`, SQLAlchemy 2.0 ORM models (`User`, `Game`, `Move`, `AnalysisResult`), cascading deletions, and Alembic migrations.
- [x] **SGF Ingestion Service**: Robust parsing with `sgfmill` supporting multi-encoding fallback (UTF-8, UTF-8-SIG, GBK, Shift-JIS, ISO-8859-1), metadata extraction, board size detection (`SZ`), and GTP coordinate translation (`Q16`, pass = `None`).
- [x] **Game API Endpoints**:
  - `POST /games`: Ingest game via raw SGF JSON.
  - `POST /games/upload`: Drag-and-drop file upload (`.sgf`, `.txt`).
  - `GET /games`: Paginated list of game summaries with move counts.
  - `GET /games/{id}`: Detailed game view with full ordered move sequence.
  - `DELETE /games/{id}`: Cascading deletion.
- [x] **KataGo Analysis Service**:
  - **Real KataGo Subprocess**: Communicates with `katago analysis` via stdin/stdout JSON lines using whole-game batching (`analyzeTurns: [0..N]`) for single-roundtrip MCTS tree reuse.
  - **Pure-Code Verdict Logic**: Deterministic threshold calculation (`good`, `neutral`, `mistake`, `blunder`) from `score_loss` and `winrate_loss`. KataGo is ground truth — the LLM never evaluates moves.
  - **CPU-Tuned Engine**: Configured for multi-core CPUs (`numAnalysisThreads = 1`, `numSearchThreadsPerAnalysisThread = 2`, `numEigenThreadsPerModel = 2`, `nnMaxBatchSize = 4`, `maxVisits = 100`) using AVX2 vector instructions and the lightweight `b6c96` neural net (~3.7 MB).
  - **Mock Engine Fallback**: Deterministic `MockKataGoEngine` for offline development, testing, and CI without CPU overhead.
- [x] **Custom SGF Testing Runner**: Drop custom `.sgf` files into `backend/tests/custom_sgfs/` (gitignored) to run standalone evaluation and view flagged mistake/blunder tables.
- [ ] **Background Job Orchestration**: Asynchronous worker to analyze uploaded games in the background and persist results to `analysis_results`.
- [ ] **LLM Teaching Explanations**: Selective explanation pass with Anthropic Claude for flagged moves (mistakes and blunders only).
- [ ] **Frontend UI**: Next.js interactive Go board viewer, evaluation graphs, and teaching explanation sidebar.

## Setup

Clone the repo, then from the root:

```bash
bun setup
```

This installs frontend dependencies, creates the backend Python virtual
environment and installs its dependencies, and starts a local Postgres
container.

Then create `backend/.env` (see `backend/.env.example`):

```bash
DATABASE_URL=postgresql://postgres:1234@localhost:5432/go_instructor
ANTHROPIC_API_KEY=sk-your-key-here

# KataGo settings (optional overrides — default to backend/katago/ paths)
KATAGO_PATH=katago/bin/katago
KATAGO_MODEL_PATH=katago/models/net_b6c96.bin.gz
KATAGO_CONFIG_PATH=katago/analysis.cfg
KATAGO_MAX_VISITS=100
FORCE_MOCK_KATAGO=false
```

## Running the app

```bash
bun dev
```

Starts Postgres (if not already running), the FastAPI backend, and the
Next.js frontend, all at once, with labeled/colored output.

- Frontend: http://localhost:3000
- Backend: http://localhost:8000
- Backend API docs (Swagger): http://localhost:8000/docs
- Health check: http://localhost:8000/health

## Testing & Analyzing SGFs

Run the backend integration test suite (verifies verdict logic, mock engine, real KataGo engine, and SGF pipeline):

```bash
cd backend
.venv/bin/python tests/test_katago.py
```

### Analyzing Custom SGF Files

You can test any `.sgf` file using the standalone KataGo runner:

1. **Auto-scan directory**: Drop any `.sgf` files into `backend/tests/custom_sgfs/` (this directory is gitignored so games stay private), then run:
   ```bash
   cd backend
   .venv/bin/python tests/test_katago.py
   ```
2. **Analyze a specific file**:
   ```bash
   cd backend
   .venv/bin/python tests/test_katago.py tests/custom_sgfs/my_game.sgf
   ```

It will print game metadata, analysis duration, speed (ms/move), and a table of all flagged mistakes and blunders with score losses and KataGo's suggested alternatives.

## Other useful commands

| Command            | What it does                                      |
|---------------------|----------------------------------------------------|
| `bun setup`         | One-time setup for a fresh clone                   |
| `bun dev`           | Run Postgres + backend + frontend together         |
| `bun frontend-i`    | Install only frontend dependencies                 |
| `bun backend-i`     | Set up .venv and install only backend dependencies  |
| `bun db-up`         | Start (or create) the local Postgres container     |
| `bun db-down`       | Stop the local Postgres container                  |
| `bun frontend-dev`  | Run only the frontend dev server                   |
| `bun backend-dev`   | Run only the backend dev server                    |

Backend-specific (run from `backend/`, with the .venv active):

```bash
source .venv/bin/activate         # Mac/Linux/WSL/Git Bash
.venv\Scripts\Activate.ps1        # Windows PowerShell
.venv\Scripts\activate.bat        # Windows cmd.exe

alembic revision --autogenerate -m "message"   # create a migration
alembic upgrade head                            # apply migrations
python tests/test_katago.py                    # run KataGo tests & custom SGFs
```

Frontend-specific (run from `frontend/`):

```bash
bun run lint       # check code style (Biome)
bun run lint:fix    # auto-fix what Biome can
```

## Architecture notes

1. **KataGo is ground truth**: Move evaluations and score losses are computed
   objectively by KataGo. Move verdicts (`good`, `neutral`, `mistake`, `blunder`)
   are assigned via pure code thresholds — never by the LLM.
2. **Selective LLM explanations**: The LLM is only called for flagged moves
   (mistakes and blunders), receiving structured board context, the move played,
   KataGo's recommended alternative, and the score delta.
3. **Asynchronous processing**: Full-game KataGo evaluation and LLM explanation passes
   run as background jobs, updating game status (`pending` -> `analyzing` -> `completed`).
4. **Independent stacks**: Next.js frontend (Bun) and FastAPI backend (Python .venv)
   live side-by-side with isolated dependencies and configurations.

See `AGENTS.md` for conventions and architectural guidelines for AI coding agents.