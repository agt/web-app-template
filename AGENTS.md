This file documents development standards for AI coding agents (Claude Code, Codex, etc.).
Read this alongside `CLAUDE.md` for full context.

## Critical rule: virtual environment

Every shell command that invokes Python must be prefixed with:

```bash
source .venv/bin/activate &&
```

This applies to `python`, `uvicorn`, `pip`, `uv pip`, and any CLI tool installed into the venv.
Failure to do so will import system packages instead of project dependencies and produce confusing import errors.

If a virtual environment does not exist, execute `uv venv` to create one, then activate.

## Starting / restarting the server

```bash
source .venv/bin/activate && pkill -f "uvicorn app.main:app"; sleep 1
source .venv/bin/activate && nohup uvicorn app.main:app --reload --port 8000 &
```

The server auto-reloads on code changes when `--reload` is passed. After restarting, wait ~2 s and verify with:

```bash
curl -s http://localhost:8000/api/auth/me
# expect: {"detail":"Not authenticated"} (401) — server is up
```

## SQLite auto-migration

`app/main.py` inspects the live database on every startup and adds any missing columns via `ALTER TABLE … ADD COLUMN`. When adding a new column to a model:

1. Add the column to the SQLAlchemy model in `app/models.py`.
2. Add the migration guard in `app/main.py` (copy the existing `image_filename` pattern).
3. Restart the server — the column will be added automatically.

Do **not** delete or recreate `lab_equipment.db` unless you also re-run `seed.py`; production data lives in that file.

## File uploads

Equipment photos land in `static/uploads/equipment/`. This directory is created by `app/main.py` at startup (`os.makedirs(..., exist_ok=True)`). It is gitignored — do not commit uploaded files.

When writing router code that handles uploads:

- Validate `file.content_type.startswith("image/")` and reject anything else with 422.
- Delete the old file (if any) before writing a new one to avoid orphaned files.
- Store only the bare filename in the database; construct the URL at serialization time.

## Modal / accessibility patterns

All dialogs must use the shared `openModal(modalId, triggerEl)` / `closeModal(modalId)` helpers from `static/js/api.js`. These handle:

- Adding/removing the `hidden` class
- Moving focus to the first focusable element inside the modal
- Tab / Shift-Tab focus trapping within the modal
- Escape key closes the modal
- Returning focus to `triggerEl` on close

Every modal element needs: `role="dialog" aria-modal="true" aria-labelledby="<heading-id>"`.

## WCAG 2.1 AA checklist (must pass before shipping UI changes)

- [ ] All icon-only interactive elements have a descriptive `aria-label`.
- [ ] All decorative icons have `aria-hidden="true"`.
- [ ] Required fields have `aria-required="true"`; visible `*` markers have `aria-hidden="true"`.
- [ ] Checkbox/radio groups are wrapped in `<fieldset>/<legend>`.
- [ ] Error/status messages use `role="alert"` or `aria-live="polite"`.
- [ ] New modals use `openModal`/`closeModal`; focus trap and Escape key work.
- [ ] Text contrast ≥ 4.5:1 (normal text) and ≥ 3:1 (large text / non-text UI).
- [ ] All interactive elements have a visible `:focus-visible` ring.

## Admin checkout on behalf of a user

The `POST /api/checkouts` endpoint accepts an optional `user_id` field (admin only). When present:

- The server verifies the caller is an admin (403 otherwise).
- The checkout is attributed to the target user, not the admin.
- Day-of-week and allowed-user policy restrictions are **skipped** (admin authority).
- Duration limits are still enforced.

If you add new policy restrictions, apply them inside the `if not admin_override:` block in `checkout_router.py` to maintain consistent behavior.

## What not to do

- Do not add `__pycache__`, `*.pyc`, `lab_equipment.db`, `.secret_key`, or `static/uploads/` to version control — they are gitignored.
- Do not install packages with bare `pip install`; always use `uv pip install` inside the activated venv.
- Do not use `git add -A` or `git add .` — stage files explicitly to avoid committing the database or uploaded photos.
- Do not bypass the focus-trap / `openModal` pattern with raw `element.classList.remove('hidden')` calls.
