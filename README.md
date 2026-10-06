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
- Google Gemini API (`gemini-3.8-flash` for move explanations)

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
- A KataGo binary + neural net weights (see [KataGo Setup](#katago-setup-binary--neural-net))
- A Google Gemini API key

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
- [x] **Background Job Orchestration (Phase 4)**: Asynchronous worker (`process_game_analysis`) that executes KataGo evaluations, handles state transitions (`pending` -> `analyzing` -> `completed` / `failed`), and performs idempotent upserts into `analysis_results`.
  - `POST /games/{id}/analyze`: Trigger or re-run background analysis (202 Accepted).
  - `GET /games/{id}/analysis`: Retrieve full move-by-move evaluations with verdicts, score leads, losses, and best moves.
- [x] **LLM Teaching Explanations (Phase 6)**: Google Gemini API (`gemini-3.8-flash`) integration with structured JSON generation.
  - Strictly called for flagged moves (`mistake` and `blunder` only) to explain why the move was faulty and why the engine's suggested move is better.
  - Unflagged moves (`good` and `neutral`) remain `None`.
  - Graceful degradation: API failure or missing keys populate `"There was an error with the LLM response. Please try again later."` without breaking engine evaluations.
- [ ] **User Authentication & Game Ownership (Phase 7)**:
  - Add `hashed_password` to `users` table via Alembic migration.
  - Auth endpoints: `POST /auth/register`, `POST /auth/login`, `GET /auth/me` using JWT and bcrypt.
  - Multi-tenant game scoping: users can only view, analyze, and delete their own games.
- [ ] **Frontend UI (Phase 8)**: Next.js 15 interactive Go board viewer, evaluation graphs, auth forms, and teaching explanation sidebar.

## Setup

Clone the repo, then from the root:

```bash
bun setup
```

This installs frontend dependencies, creates the backend Python virtual
environment and installs its dependencies, and starts a local Postgres
container.

### KataGo Setup (Binary & Neural Net)

KataGo requires the engine binary and neural network weights:

1. **KataGo Binary**: We use **KataGo v1.18.1** (CPU/Eigen build with AVX2 instruction support for fast CPU inference). Place the executable in `backend/katago/bin/katago`:

   **Linux (x64)**:
   ```bash
   mkdir -p backend/katago/bin
   curl -L -o /tmp/katago.zip https://github.com/lightvector/KataGo/releases/download/v1.18.1/katago-v1.18.1-eigenavx2-linux-x64.zip
   unzip -j /tmp/katago.zip katago -d backend/katago/bin/
   chmod +x backend/katago/bin/katago
   rm /tmp/katago.zip
   ```

   **Windows (x64)**:
   Download [`katago-v1.18.1-eigenavx2-windows-x64.zip`](https://github.com/lightvector/KataGo/releases/download/v1.18.1/katago-v1.18.1-eigenavx2-windows-x64.zip), extract `katago.exe`, and place it in `backend/katago/bin/katago.exe`.

   **macOS / Other**:
   Install via Homebrew (`brew install katago`) or download the corresponding release build from [KataGo Releases](https://github.com/lightvector/KataGo/releases). If installed via package manager, update `KATAGO_PATH` in `backend/.env`.

2. **Neural Network Model**: We use the lightweight `b6c96` network (`g170-b6c96-s175395328-d26788732`, ~3.7 MB), tuned for CPU-based evaluation. Download and place it at `backend/katago/models/net_b6c96.bin.gz`:
   ```bash
   mkdir -p backend/katago/models
   curl -L -o backend/katago/models/net_b6c96.bin.gz \
     https://katagoarchive.org/g170/neuralnets/g170-b6c96-s175395328-d26788732.bin.gz
   ```
   *(Direct link: [g170-b6c96-s175395328-d26788732.bin.gz](https://katagoarchive.org/g170/neuralnets/g170-b6c96-s175395328-d26788732.bin.gz) from [katagoarchive.org](https://katagoarchive.org/g170/neuralnets/index.html). If binary or model files are missing, the backend gracefully falls back to `MockKataGoEngine` for offline development and testing.)*

Then create `backend/.env` (see `backend/.env.example`):

```bash
DATABASE_URL=postgresql://postgres:1234@localhost:5432/go_instructor
GEMINI_API_KEY=your-gemini-api-key-here
GEMINI_MODEL=gemini-3.8-flash

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

Run the backend test suites:

```bash
cd backend
# 1. Engine & SGF tests
.venv/bin/python tests/test_katago.py

# 2. Worker & DB persistence tests
.venv/bin/python tests/test_worker.py

# 3. LLM explanation & Gemini fallback tests
.venv/bin/python tests/test_llm.py
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