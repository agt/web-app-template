## Technology choices

The following core technologies should be used unless the user expressly requests otherwise.

### Backend

| Choice | Rationale |
|--------|-----------|
| **FastAPI** | Async-capable, automatic OpenAPI docs, Pydantic validation built in |
| **SQLAlchemy 2 ORM** | Declarative models, relationship loading, portable across databases |
| **SQLite** | Zero-configuration, file-based, sufficient for single-lab concurrency |
| **Argon2id** (argon2-cffi) | OWASP #1 recommendation for new applications; memory-hard, resists GPU/ASIC attacks; parameters: m=19456 KiB, t=2, p=1 |
| **python-jose** | JWT creation and validation; HS256 algorithm; 8-hour token lifetime |
| **python-multipart** | Multipart form / file upload support for FastAPI |

### Frontend

| Choice | Rationale |
|--------|-----------|
| **Vanilla HTML/CSS/JS** | No build step, no bundler, no framework dependency — easy to modify and audit |
| **CSS custom properties** | Consistent theming without a preprocessor |
| **Font Awesome 6 (CDN)** | Icon set without adding a build pipeline |
| **localStorage JWT** | Simple for a same-origin SPA; tokens expire after 8 hours |

## Architecture

The following general architecture should be followed for all apps:

```
my-new-thing/
├── app/                        Python package — FastAPI application
│   ├── main.py                 App entry point; mounts routers + static files;
│   │                           runs SQLite auto-migrations on startup
│   ├── database.py             SQLAlchemy engine, SessionLocal, Base, get_db
│   ├── models.py               ORM models: User, Equipment, CheckoutPolicy, Checkout
│   ├── schemas.py              Pydantic request/response models
│   ├── auth.py                 Argon2id hashing, JWT creation/validation,
│   │                           get_current_user / require_admin dependencies
│   └── routers/
│       ├── auth_router.py      POST /api/auth/login, GET /api/auth/me
│       ├── equipment_router.py CRUD + photo upload/delete for equipment
│       ├── checkout_router.py  Checkout create/return, /me, admin list
│       └── admin_router.py     User management, aggregate stats
├── static/                     Served as-is by FastAPI StaticFiles
│   ├── index.html              Redirect shim (→ login or dashboard)
│   ├── login.html
│   ├── dashboard.html          User-facing equipment browser & checkout UI
│   ├── admin.html              Admin dashboard (equipment, checkouts, users)
│   ├── css/
│   │   └── app.css             Single stylesheet; CSS custom properties for theming;
│   │                           WCAG 2.1 AA compliant contrast + focus styles
│   ├── js/
│   │   ├── api.js              fetch wrapper, auth helpers, openModal/closeModal
│   │   │                       focus-trap utility
│   │   ├── dashboard.js        User dashboard logic
│   │   ├── admin.js            Admin dashboard logic
│   │   └── login.js            Login page logic
│   └── uploads/
│       └── equipment/          User-uploaded equipment photos (gitignored)
├── seed.py                     One-shot database seeding script
├── requirements.txt
├── Dockerfile
├── CLAUDE.md
├── AGENTS.md
└── .gitignore
```

FastAPI serves both the REST API (under `/api/`) and the static frontend from the same process on the same origin, so no CORS configuration is required.

### Key implementation patterns

**SQLite auto-migration**: `app/main.py` uses `inspect(engine)` on startup to detect missing columns and issues `ALTER TABLE … ADD COLUMN` statements so existing databases are updated without data loss.

**File uploads**: Equipment photos are stored in `static/uploads/equipment/` and served as static files. The router validates MIME type (image/*), replaces old files on update, and deletes orphaned files on remove. The `image_url` field on `EquipmentOut` is a full path suitable for use in `<img src>`.

**Staged photo upload** (Add Equipment flow): The JS stores a selected file in `pendingPhotoFile` and shows a `URL.createObjectURL()` preview before the equipment record exists. After the create API call returns an `id`, the photo is uploaded in a second request, then `pendingPhotoFile` is cleared.

**Modal accessibility**: `api.js` exports `openModal(modalId, triggerEl)` and `closeModal(modalId)` that manage `aria-modal`, focus movement to the first focusable element, Tab/Shift-Tab focus trapping, Escape-to-close, and focus return to `triggerEl` on close.

**Admin checkout on behalf of a user**: `CheckoutCreate` accepts an optional `user_id`. When an admin provides it, the backend sets `admin_override = True`, uses the target user as `effective_user`, and skips day-of-week and allowed-user policy checks (duration limits still apply). Regular users cannot set `user_id` (403).

**WCAG 2.1 AA compliance**: All modals use `role="dialog" aria-modal="true" aria-labelledby`. Icon-only buttons carry `aria-label`. Decorative icons carry `aria-hidden="true"`. Required fields use `aria-required="true"` and visually-hidden `*` spans with `aria-hidden="true"`. Day-of-week checkboxes and radio groups are wrapped in `<fieldset>/<legend>`. Sidebar nav uses `<button>` elements. Skip links and responsive hamburger navigation are included. All foreground/background color pairs meet 4.5:1 (text) or 3:1 (non-text) contrast ratios.

## Configuration

Runtime configuration should be accomplished through environment variables whenever feasible.

## Deployment

Update the initial Dockerfile to reflect application-specific build or deployment steps.

Include an appropriate API health check (`GET /api/auth/me` returns 401, which is a valid liveness signal — the server is up and routing correctly).


