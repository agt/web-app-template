
This file documents development standards for AI coding agents (Claude Code, Codex, etc.).  
Read this alongside `CLAUDE.md` for full context.

## Critical rule: virtual environment

Every shell command that invokes Python must be prefixed with:

```bash
source .venv/bin/activate &&
```

This applies to `python`, `uvicorn`, `pip`, `uv pip`, and any CLI tool installed into the venv.  
Failure to do so will import system packages instead of project dependencies and produce confusing import errors.

If a virtual environment does not exist, execute 'uv venv' to create one, then activate.

## What not to do

- Do not add `__pycache__`, `*.pyc`, `lab_equipment.db`, or `.secret_key` to version control — they are gitignored.
- Do not install packages with bare `pip install`; always use `uv pip install` inside the activated venv.
