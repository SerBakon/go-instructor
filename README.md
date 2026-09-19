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

## Setup

Clone the repo, then from the root:

```bash
bun setup
```

This installs frontend dependencies, creates the backend Python virtual
environment and installs its dependencies, and starts a local Postgres
container.

Then create `backend/.env` (not committed — see `backend/.env.example` if
present):

```
DATABASE_URL=postgresql://postgres:1234@localhost:5432/go_instructor
ANTHROPIC_API_KEY=sk-your-key-here
KATAGO_PATH=/path/to/katago
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
```

Frontend-specific (run from `frontend/`):

```bash
bun run lint       # check code style (Biome)
bun run lint:fix    # auto-fix what Biome can
```

## Architecture notes

1. A submitted game (SGF) is parsed and run through KataGo's analysis engine,
   producing a win-rate and score-loss for every move.
2. Score loss is used, in plain code (no LLM), to flag which moves are worth
   explaining (mistakes, blunders, and a few standout good moves).
3. Only flagged moves are sent to the LLM, with structured context (board
   state, move played, KataGo's top alternative, score delta), to generate a
   natural-language explanation.
4. Full-game analysis runs as a background job, not inline in a request —
   it's too slow to hold an HTTP connection open for.

See `AGENTS.md` for more detailed conventions and rules for anyone (human or
AI agent) working in this codebase.

## Status

Early development — backend scaffolding and Postgres are set up; SGF
ingestion, the KataGo wrapper, and the LLM explanation pipeline are still
being built.