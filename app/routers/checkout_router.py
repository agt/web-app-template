import json
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from .. import models, schemas
from ..auth import get_current_user, require_admin
from ..database import get_db

router = APIRouter(prefix="/api/checkouts", tags=["checkouts"])


def _checkout_to_out(c: models.Checkout) -> schemas.CheckoutOut:
    return schemas.CheckoutOut(
        id=c.id,
        equipment_id=c.equipment_id,
        equipment_name=c.equipment.name,
        user_id=c.user_id,
        user_email=c.user.email,
        user_full_name=c.user.full_name,
        checkout_date=c.checkout_date,
        due_date=c.due_date,
        return_date=c.return_date,
        notes=c.notes,
        status=c.status,
    )


def _get_active_checkout(db: Session, equipment_id: int) -> models.Checkout | None:
    return (
        db.query(models.Checkout)
        .filter(
            models.Checkout.equipment_id == equipment_id,
            models.Checkout.return_date.is_(None),
        )
        .first()
    )


@router.post("", response_model=schemas.CheckoutOut, status_code=201)
def create_checkout(
    body: schemas.CheckoutCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    eq = db.get(models.Equipment, body.equipment_id)
    if eq is None or not eq.is_active:
        raise HTTPException(status_code=404, detail="Equipment not found")

    if _get_active_checkout(db, body.equipment_id):
        raise HTTPException(status_code=409, detail="Equipment is currently checked out")

    # Resolve effective user — admin may check out on behalf of someone else
    admin_override = False
    if body.user_id is not None:
        if user.role != "admin":
            raise HTTPException(status_code=403, detail="Only admins may check out on behalf of another user")
        target = db.get(models.User, body.user_id)
        if target is None or not target.is_active:
            raise HTTPException(status_code=404, detail="Target user not found or inactive")
        effective_user = target
        admin_override = True
    else:
        effective_user = user

    policy = eq.policy
    max_days = policy.max_checkout_days if policy else 7

    # Policy restrictions are enforced for regular users; admins acting on behalf
    # of someone bypass day-of-week and allowed-user gates (they have authority).
    if not admin_override:
        days_allowed: list[int] = json.loads(policy.days_of_week) if policy else list(range(7))
        now_check = datetime.now(timezone.utc)
        if days_allowed and now_check.weekday() not in days_allowed:
            from ..routers.equipment_router import DAY_NAMES
            allowed_names = [DAY_NAMES[d] for d in sorted(days_allowed)]
            raise HTTPException(
                status_code=422,
                detail=f"Checkouts for this equipment are only allowed on: {', '.join(allowed_names)}",
            )
        if policy:
            allowed_users = json.loads(policy.allowed_users)
            if allowed_users != "all" and effective_user.id not in allowed_users:
                raise HTTPException(status_code=403, detail="You are not authorized to check out this equipment")

    # Validate duration
    if body.duration_days is not None:
        if body.duration_days < 1 or body.duration_days > max_days:
            raise HTTPException(
                status_code=422,
                detail=f"Duration must be between 1 and {max_days} day(s)",
            )
        duration = body.duration_days
    else:
        duration = max_days

    now = datetime.now(timezone.utc)
    checkout = models.Checkout(
        equipment_id=body.equipment_id,
        user_id=effective_user.id,
        checkout_date=now,
        due_date=now + timedelta(days=duration),
        notes=body.notes,
    )
    db.add(checkout)
    db.commit()
    db.refresh(checkout)
    return _checkout_to_out(checkout)


@router.post("/{checkout_id}/return", response_model=schemas.CheckoutOut)
def return_equipment(
    checkout_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    checkout = db.get(models.Checkout, checkout_id)
    if checkout is None:
        raise HTTPException(status_code=404, detail="Checkout not found")
    if checkout.return_date is not None:
        raise HTTPException(status_code=409, detail="Equipment already returned")
    if checkout.user_id != user.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to return this checkout")

    checkout.return_date = datetime.now(timezone.utc)
    db.commit()
    db.refresh(checkout)
    return _checkout_to_out(checkout)


@router.get("/me", response_model=list[schemas.CheckoutOut])
def my_checkouts(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    rows = (
        db.query(models.Checkout)
        .filter(models.Checkout.user_id == user.id)
        .order_by(models.Checkout.checkout_date.desc())
        .all()
    )
    return [_checkout_to_out(c) for c in rows]


@router.get("", response_model=list[schemas.CheckoutOut])
def all_checkouts(
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    rows = (
        db.query(models.Checkout)
        .order_by(models.Checkout.checkout_date.desc())
        .all()
    )
    return [_checkout_to_out(c) for c in rows]
