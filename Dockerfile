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

# Run as a non-root user
RUN adduser --disabled-password --gecos "" --uid 1000 appuser \
    && chown -R appuser:appuser /app
USER appuser

# ── Runtime configuration ────────────────────────────────────────────────────
# ....

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD python -c \
        "import urllib.request; urllib.request.urlopen('http://localhost:8000/login.html')" \
    || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
