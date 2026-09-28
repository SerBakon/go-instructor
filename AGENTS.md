# AGENTS.md

This file gives coding agents (OpenCode, etc.) the context they need to work
in this repo without re-deriving it from scratch every session.

## Project

A tool that analyzes user-submitted Go (baduk) games: KataGo scores each move
objectively (winrate/score loss), then an LLM turns the flagged moves into
natural-language teaching explanations. KataGo judges; the LLM explains — the
LLM is never asked to evaluate move quality on its own.

## Repo layout

```
/
├── frontend/          Next.js + React (Bun, TypeScript, Tailwind, Biome)
├── backend/           FastAPI (Python), Postgres via SQLAlchemy + Alembic
├── scripts/           Cross-platform setup scripts (install-backend.js, etc.)
├── package.json       Root script runner only — NOT a Bun workspace root.
│                      Do not add a "workspaces" field; frontend and backend
│                      are installed independently (see below).
└── AGENTS.md
```

There are two independent projects living in one repo, not a JS monorepo.
`frontend/node_modules` and `frontend/bun.lock` must stay inside `frontend/`
— do not hoist dependencies to the repo root. `backend/.venv` is a standalone
Python virtual environment.

Note: `frontend/` may have its own auto-generated `AGENTS.md` (Next.js
tooling sometimes creates one). That file is scoped to Next.js-specific
conventions only — do not edit it or treat it as a substitute for this file.
This root `AGENTS.md` is the source of truth for the project as a whole.

## Setup

```bash
bun i        # from repo root — installs frontend deps AND sets up backend .venv + pip deps via postinstall
```

Backend only:
```bash
cd backend
.venv\Scripts\Activate.ps1   # Windows PowerShell
.venv\Scripts\activate.bat   # Windows cmd.exe
source .venv/bin/activate    # Mac/Linux, or Git Bash/WSL on Windows
pip install -r requirements.txt
```

Frontend only:
```bash
cd frontend
bun install
```

Postgres (local dev):
```bash
docker run --name go-postgres -e POSTGRES_PASSWORD=password -e POSTGRES_DB=godb -p 5432:5432 -d postgres
```

## Commands

| Task              | Command                                      |
|-------------------|-----------------------------------------------|
| Install everything| `bun i` (from repo root)                      |
| Frontend dev      | `cd frontend && bun run dev`                  |
| Frontend lint     | `cd frontend && bun run lint`                 |
| Frontend lint fix | `cd frontend && bun run lint:fix`             |
| Backend dev       | `cd backend && uvicorn app.main:app --reload` |
| DB migration      | `cd backend && alembic revision --autogenerate -m "..."` |
| DB upgrade        | `cd backend && alembic upgrade head`          |
| Backend tests     | `cd backend && .venv/bin/python tests/test_katago.py` |
| Analyze custom SGF| `cd backend && .venv/bin/python tests/test_katago.py <path/to/game.sgf>` |

## Code style

- **Frontend**: Biome (not ESLint/Prettier — do not add either back). Tabs,
  double quotes, Tailwind class sorting on via `useSortedClasses` (nursery
  rule). Run `bun run lint` before considering frontend work done.
- **Backend**: standard PEP 8-ish style. Keep Pydantic models in `app/schemas/`,
  SQLAlchemy models in `app/models/`, business logic in `app/services/`,
  routes thin in `app/routers/`.

Current backend structure:

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py          FastAPI app instance + route registration (app.main:app)
│   ├── config.py         Settings loaded from .env via pydantic-settings
│   ├── database.py       SQLAlchemy engine/session setup
│   ├── models/           SQLAlchemy models
│   │   ├── __init__.py
│   │   └── game.py       User, Game, Move, AnalysisResult models + cascade rules
│   ├── schemas/          Pydantic request/response models
│   │   ├── __init__.py
│   │   ├── game.py       GameCreate, GameResponse, GameSummaryResponse
│   │   └── move.py       MoveBase, MoveCreate, MoveResponse
│   ├── routers/          FastAPI route handlers
│   │   ├── __init__.py
│   │   └── games.py      POST /games, POST /games/upload, GET /games, GET /games/{id}, DELETE /games/{id}
│   ├── services/         Business logic
│   │   ├── __init__.py
│   │   ├── sgf_service.py     SGF parsing, encoding fallbacks, GTP coordinate formatting
│   │   └── katago_service.py  KataGo wrapper, whole-game batching, pure-code threshold logic
│   └── workers/          Background job logic for full-game analysis (Phase 4)
├── katago/               KataGo engine assets
│   ├── analysis.cfg      Hardware-tuned CPU analysis config (2 threads, batch size 4, 100 max visits)
│   ├── bin/              KataGo executable (gitignored)
│   ├── models/           Neural network weights (e.g. net_b6c96.bin.gz, gitignored)
│   └── logs/             KataGo engine runtime logs (gitignored)
├── tests/                Test suite and testing helpers
│   ├── test_katago.py    Integration tests (verdicts, mock engine, real KataGo, SGF pipeline)
│   └── custom_sgfs/      Drop custom .sgf files here for manual testing (gitignored, .gitkeep tracked)
├── alembic/              Migrations (94848062fa97_initial_tables.py applied)
├── .venv/                Python virtual environment (gitignored)
├── requirements.txt
└── .env                  Local secrets (gitignored)
```

- Prefer explicit, typed code on both sides (TypeScript strict, Python type
  hints) over clever/implicit patterns.

## Current Project Status & Completed Modules

1. **Phase 1: Database & Migrations (Complete)**
   - PostgreSQL runs via Docker (`go-postgres` container) on port 5432.
   - Dynamic `.env` parsing in `scripts/db-up.js` and absolute path resolution in `app/config.py`.
   - Models: `User`, `Game`, `Move`, `AnalysisResult`.
   - Cascading deletion verified at Postgres DDL level (`ondelete="CASCADE"`) and SQLAlchemy level (`cascade="all, delete-orphan"`).
   - Migration `94848062fa97_initial_tables.py` applied; zero drift.

2. **Phase 2: SGF Ingestion & API Endpoints (Complete)**
   - `app/services/sgf_service.py`: Multi-encoding decoder (UTF-8, UTF-8-SIG, GBK, Shift-JIS, ISO-8859-1), metadata extraction, board size detection (`board_size`), and GTP coordinate formatting.
   - `app/routers/games.py`: JSON game creation (`POST /games`), multipart file upload (`POST /games/upload`), list games with move counts (`GET /games`), game details (`GET /games/{id}`), and delete (`DELETE /games/{id}`).

3. **Phase 3: KataGo Analysis Wrapper (Complete)**
   - `app/services/katago_service.py`:
     - Protocol/ABC `KataGoEngine` with `MockKataGoEngine` (instant zero-CPU tests) and `RealKataGoEngine`.
     - Subprocess management communicating with `katago analysis` over JSON lines via stdin/stdout.
     - **Whole-game batching** (`analyzeTurns: [0..N]`) for single-roundtrip MCTS tree reuse.
     - **Pure-code verdict calculation** (`calculate_verdict`): thresholds for `good`, `neutral`, `mistake`, `blunder` purely from `score_loss` and `winrate_loss`. KataGo is ground truth — LLM never assigns verdicts.
     - Tuned for low-power/mobile multi-core CPUs (e.g. Surface laptop): 2 threads, batch size 4, 100 max visits, `net_b6c96` neural net (~3.7 MB).
     - Factory function `get_katago_engine()` with automatic graceful fallback to mock mode if binary/model is absent.
   - `tests/test_katago.py`: Full integration test suite + custom SGF testing runner (`tests/custom_sgfs/`).

4. **Next Phase: Phase 4 — Job Orchestration / Background Worker**
   - Asynchronous worker to analyze uploaded games in the background.
   - State machine transition: `Game.status`: `pending` -> `analyzing` -> `completed` / `failed`.
   - Persist move evaluations into the `analysis_results` table.

## Architecture rules an agent should not violate

1. **KataGo output is ground truth for move quality.** Score loss / winrate
   delta determines verdicts (good/neutral/mistake/blunder) via pure code
   logic in `app/services/` — never ask the LLM to assign a verdict.
2. **The LLM is only called for flagged moves**, not every move in a game.
   Don't remove the filtering step to "simplify" — it's a deliberate cost and
   quality control.
3. **Long-running analysis (KataGo pass + LLM calls) runs as a background
   job**, not inline in a request/response cycle. Don't add a synchronous
   endpoint that blocks on a full game analysis.
4. **Never commit `.env`, API keys, or DB credentials.** Each project keeps
   its own env file (`backend/.env`, and `frontend/.env.local` if ever
   needed) — there is no shared root `.env`. If you introduce a new secret,
   add a documented, no-real-values entry to that project's `.env.example`
   (e.g. `backend/.env.example`), creating that file if it doesn't exist yet.

## Database

- Tables: `users`, `games`, `moves`, `analysis_results`.
- All schema changes go through Alembic migrations — never hand-edit the DB
  or use `Base.metadata.create_all()` outside of local scratch scripts.

## When adding dependencies

- Frontend: `cd frontend && bun add <pkg>` — never install into the repo root.
- Backend: install into the activated .venv, then re-run
  `pip freeze > requirements.txt` from `backend/` so it stays in sync.

## Testing changes

Before declaring a task done:
- Frontend: `bun run lint` passes, `bun run dev` boots without errors.
- Backend: `uvicorn app.main:app --reload` boots, relevant endpoint(s)
  manually verified via `/docs` (FastAPI's Swagger UI) or a quick curl.
- Run the backend test suite:
  ```bash
  cd backend && .venv/bin/python tests/test_katago.py
  ```
  All tests must pass. When adding new engine or parsing capabilities, add
  corresponding unit/integration tests to `backend/tests/`.