from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from core.storage import ensure_bucket
from modules.ais.router import router as ais_router
from modules.cases.router import router as cases_router
from modules.reports.router import router as reports_router
from modules.satellite.router import router as satellite_router
from modules.spill_detection.router import router as spill_detection_router


def create_app() -> FastAPI:
    app = FastAPI(
        title="PS26143 SpillGuard",
        description="AI-assisted maritime pollution forensic-intelligence scaffold.",
        version="0.1.0",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):
        if isinstance(exc.detail, dict) and {"code", "message", "details"} <= set(exc.detail):
            payload = exc.detail
        else:
            payload = {"code": "http_error", "message": str(exc.detail), "details": {}}
        return JSONResponse(status_code=exc.status_code, content={"error": payload})

    @app.on_event("startup")
    def startup() -> None:
        try:
            ensure_bucket()
        except Exception:
            pass

    @app.get("/health")
    def health():
        return {"ok": True}

    app.include_router(cases_router)
    app.include_router(satellite_router)
    app.include_router(spill_detection_router)
    app.include_router(ais_router)
    app.include_router(reports_router)
    return app


app = create_app()
