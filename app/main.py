import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, text
from .database import Base, engine
from .routers import auth_router, equipment_router, checkout_router, admin_router

Base.metadata.create_all(bind=engine)

# Incremental schema migrations for SQLite (no Alembic needed for simple additions)
_inspector = inspect(engine)
_eq_cols = {c["name"] for c in _inspector.get_columns("equipment")}
with engine.begin() as _conn:
    if "image_filename" not in _eq_cols:
        _conn.execute(text("ALTER TABLE equipment ADD COLUMN image_filename TEXT"))

# Ensure upload directory exists
os.makedirs("static/uploads/equipment", exist_ok=True)

app = FastAPI(title="Lab Equipment Checkout", version="1.0.0")

app.include_router(auth_router.router)
app.include_router(equipment_router.router)
app.include_router(checkout_router.router)
app.include_router(admin_router.router)

app.mount("/", StaticFiles(directory="static", html=True), name="static")
