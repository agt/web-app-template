from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from .. import models, schemas
from ..auth import hash_password, require_admin
from ..database import get_db

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/users", response_model=list[schemas.UserOut])
def list_users(
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    return db.query(models.User).order_by(models.User.created_at).all()


@router.post("/users", response_model=schemas.UserOut, status_code=201)
def create_user(
    body: schemas.UserCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    if db.query(models.User).filter(models.User.email == body.email).first():
        raise HTTPException(status_code=409, detail="Email already registered")
    user = models.User(
        email=body.email,
        full_name=body.full_name,
        role=body.role,
        is_active=body.is_active,
        password_hash=hash_password(body.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.put("/users/{user_id}", response_model=schemas.UserOut)
def update_user(
    user_id: int,
    body: schemas.UserUpdate,
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_admin),
):
    user = db.get(models.User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    updates = body.model_dump(exclude_none=True)
    if "password" in updates:
        user.password_hash = hash_password(updates.pop("password"))
    for field, value in updates.items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user


@router.get("/stats")
def stats(
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    total_equipment = db.query(models.Equipment).filter(models.Equipment.is_active == True).count()
    active_checkouts = (
        db.query(models.Checkout).filter(models.Checkout.return_date.is_(None)).count()
    )
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    all_active = db.query(models.Checkout).filter(models.Checkout.return_date.is_(None)).all()
    overdue = sum(
        1 for c in all_active
        if (c.due_date.replace(tzinfo=timezone.utc) if c.due_date.tzinfo is None else c.due_date) < now
    )
    total_users = db.query(models.User).filter(models.User.role == "user").count()
    return {
        "total_equipment": total_equipment,
        "active_checkouts": active_checkouts,
        "overdue_checkouts": overdue,
        "total_users": total_users,
    }
