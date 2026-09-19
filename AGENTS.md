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
— do not hoist dependencies to the repo root. `backend/venv` is a standalone
Python virtual environment.

Note: `frontend/` may have its own auto-generated `AGENTS.md` (Next.js
tooling sometimes creates one). That file is scoped to Next.js-specific
conventions only — do not edit it or treat it as a substitute for this file.
This root `AGENTS.md` is the source of truth for the project as a whole.

## Setup

```bash
bun i        # from repo root — installs frontend deps AND sets up backend venv + pip deps via postinstall
```

Backend only:
```bash
cd backend
venv\Scripts\Activate.ps1   # Windows PowerShell
venv\Scripts\activate.bat   # Windows cmd.exe
source venv/bin/activate    # Mac/Linux, or Git Bash/WSL on Windows
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

## Code style

- **Frontend**: Biome (not ESLint/Prettier — do not add either back). Tabs,
  double quotes, Tailwind class sorting on via `useSortedClasses` (nursery
  rule). Run `bun run lint` before considering frontend work done.
- **Backend**: standard PEP 8-ish style. Keep Pydantic models in `app/schemas/`,
  SQLAlchemy models in `app/models/`, business logic in `app/services/`,
  routes thin in `app/routers/`.

Expected backend structure (build out files as they're needed — not all of
these exist yet, this is the target shape):

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py          FastAPI app instance + route registration (app.main:app)
│   ├── config.py         Settings loaded from .env via pydantic-settings
│   ├── database.py       SQLAlchemy engine/session setup
│   ├── models/           SQLAlchemy models (users, games, moves, analysis)
│   ├── schemas/           Pydantic request/response models
│   ├── routers/           FastAPI route handlers
│   ├── services/          KataGo wrapper, LLM prompt building, SGF parsing
│   └── workers/           Background job logic for full-game analysis
├── alembic/               Migrations
├── venv/                  Python virtual environment (gitignored)
├── requirements.txt
└── .env                   Local secrets (gitignored)
```

If `app/main.py` doesn't exist yet when you're picking up a task, that means
the backend is still being scaffolded — check with the person before assuming
routes/models referenced elsewhere in this file already exist.
- Prefer explicit, typed code on both sides (TypeScript strict, Python type
  hints) over clever/implicit patterns.

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
- Backend: install into the activated venv, then re-run
  `pip freeze > requirements.txt` from `backend/` so it stays in sync.

## Testing changes

Before declaring a task done:
- Frontend: `bun run lint` passes, `bun run dev` boots without errors.
- Backend: `uvicorn app.main:app --reload` boots, relevant endpoint(s)
  manually verified via `/docs` (FastAPI's Swagger UI) or a quick curl.

No automated test suite exists yet. Once one is added (likely `pytest` for
backend, `vitest`/`playwright` for frontend), update this section with the
actual run commands (e.g. `cd backend && pytest`) and treat a passing suite
as a requirement before marking a task done — this note is a placeholder
until that happens.