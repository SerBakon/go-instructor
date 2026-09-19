from fastapi import FastAPI

app = FastAPI(title="Go Analysis API")

@app.get("/health")
def health():
    return {"status": "ok"}