FROM python:3.13-slim

WORKDIR /app

# Install Python dependencies in a separate layer so they are cached
# as long as requirements.txt has not changed.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source (code changes do not bust the dependency cache)
COPY app/     ./app/
COPY static/  ./static/
COPY seed.py  .

# Create the uploads directory; it is bind-mountable for persistent photo storage.
# The app also creates this at startup, but pre-creating it here ensures correct
# ownership when the directory is mounted as a volume.
RUN mkdir -p static/uploads/equipment

# Run as a non-root user
RUN adduser --disabled-password --gecos "" --uid 1000 appuser \
    && chown -R appuser:appuser /app
USER appuser

# ── Runtime configuration ────────────────────────────────────────────────────
# SECRET_KEY   — JWT signing secret (required in production; set via -e or secrets)
# DATABASE_URL — defaults to sqlite:///./lab_equipment.db if not set

EXPOSE 8000

# Health check: GET /api/auth/me returns 401 (Not authenticated) when the server
# is running and routing correctly — this is the intended liveness signal.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD python -c \
        "import urllib.request; \
         try: urllib.request.urlopen('http://localhost:8000/api/auth/me') \
         except urllib.error.HTTPError as e: \
             exit(0 if e.code == 401 else 1)" \
    || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
