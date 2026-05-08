import json
import os
import uuid
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session
from .. import models, schemas
from ..auth import get_current_user, require_admin
from ..database import get_db

router = APIRouter(prefix="/api/equipment", tags=["equipment"])

DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
DEFAULT_MAX_DAYS = 7
UPLOAD_DIR = "static/uploads/equipment"
ALLOWED_MIME = {"image/jpeg", "image/png", "image/gif", "image/webp"}


def _build_equipment_out(eq: models.Equipment) -> schemas.EquipmentOut:
    active = next(
        (c for c in eq.checkouts if c.return_date is None),
        None,
    )
    max_days = eq.policy.max_checkout_days if eq.policy else DEFAULT_MAX_DAYS
    image_url = f"/uploads/equipment/{eq.image_filename}" if eq.image_filename else None
    return schemas.EquipmentOut(
        id=eq.id,
        name=eq.name,
        description=eq.description,
        location=eq.location,
        is_active=eq.is_active,
        image_url=image_url,
        max_checkout_days=max_days,
        created_at=eq.created_at,
        is_available=active is None,
        active_checkout_id=active.id if active else None,
        active_checkout_user=active.user.email if active else None,
    )


@router.get("", response_model=list[schemas.EquipmentOut])
def list_equipment(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    items = db.query(models.Equipment).filter(models.Equipment.is_active == True).all()
    return [_build_equipment_out(eq) for eq in items]


@router.post("", response_model=schemas.EquipmentOut, status_code=201)
def create_equipment(
    body: schemas.EquipmentCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    eq = models.Equipment(**body.model_dump())
    db.add(eq)
    db.flush()
    policy = models.CheckoutPolicy(
        equipment_id=eq.id,
        days_of_week=json.dumps(list(range(7))),
        max_checkout_days=DEFAULT_MAX_DAYS,
        allowed_users=json.dumps("all"),
    )
    db.add(policy)
    db.commit()
    db.refresh(eq)
    return _build_equipment_out(eq)


@router.put("/{equipment_id}", response_model=schemas.EquipmentOut)
def update_equipment(
    equipment_id: int,
    body: schemas.EquipmentUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    eq = db.get(models.Equipment, equipment_id)
    if eq is None:
        raise HTTPException(status_code=404, detail="Equipment not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(eq, field, value)
    db.commit()
    db.refresh(eq)
    return _build_equipment_out(eq)


@router.get("/{equipment_id}/policy", response_model=schemas.PolicyOut)
def get_policy(
    equipment_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    policy = (
        db.query(models.CheckoutPolicy)
        .filter(models.CheckoutPolicy.equipment_id == equipment_id)
        .first()
    )
    if policy is None:
        raise HTTPException(status_code=404, detail="Policy not found")
    return policy


@router.put("/{equipment_id}/policy", response_model=schemas.PolicyOut)
def set_policy(
    equipment_id: int,
    body: schemas.PolicyIn,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    eq = db.get(models.Equipment, equipment_id)
    if eq is None:
        raise HTTPException(status_code=404, detail="Equipment not found")

    policy = (
        db.query(models.CheckoutPolicy)
        .filter(models.CheckoutPolicy.equipment_id == equipment_id)
        .first()
    )
    if policy is None:
        policy = models.CheckoutPolicy(equipment_id=equipment_id)
        db.add(policy)

    policy.days_of_week = json.dumps(body.days_of_week)
    policy.max_checkout_days = body.max_checkout_days
    allowed = body.allowed_users
    policy.allowed_users = json.dumps(allowed if allowed == "all" else list(allowed))

    db.commit()
    db.refresh(policy)
    return policy


@router.post("/{equipment_id}/photo", response_model=schemas.EquipmentOut)
async def upload_photo(
    equipment_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    eq = db.get(models.Equipment, equipment_id)
    if eq is None:
        raise HTTPException(status_code=404, detail="Equipment not found")
    if file.content_type not in ALLOWED_MIME:
        raise HTTPException(status_code=422, detail="File must be JPEG, PNG, GIF, or WEBP")

    ext = file.filename.rsplit(".", 1)[-1].lower() if file.filename and "." in file.filename else "jpg"
    new_filename = f"eq_{equipment_id}_{uuid.uuid4().hex[:10]}.{ext}"

    # Remove previous photo file if present
    if eq.image_filename:
        old_path = os.path.join(UPLOAD_DIR, eq.image_filename)
        if os.path.exists(old_path):
            os.remove(old_path)

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    dest = os.path.join(UPLOAD_DIR, new_filename)
    contents = await file.read()
    with open(dest, "wb") as fh:
        fh.write(contents)

    eq.image_filename = new_filename
    db.commit()
    db.refresh(eq)
    return _build_equipment_out(eq)


@router.delete("/{equipment_id}/photo", response_model=schemas.EquipmentOut)
def delete_photo(
    equipment_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    eq = db.get(models.Equipment, equipment_id)
    if eq is None:
        raise HTTPException(status_code=404, detail="Equipment not found")
    if eq.image_filename:
        old_path = os.path.join(UPLOAD_DIR, eq.image_filename)
        if os.path.exists(old_path):
            os.remove(old_path)
        eq.image_filename = None
        db.commit()
        db.refresh(eq)
    return _build_equipment_out(eq)
