from fastapi import FastAPI
from app.routers import games

app = FastAPI(
    title="Go Instructor API",
    description="Backend API for Go (baduk) game analysis and teaching explanations",
    version="0.1.0",
)

app.include_router(games.router)


@app.get("/health")
def health():
    return {"status": "ok"}