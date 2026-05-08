from __future__ import annotations
import json
from datetime import datetime
from typing import Literal
from pydantic import BaseModel, EmailStr, field_validator, model_validator


# ── Auth ─────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ── User ─────────────────────────────────────────────────────────────────────

class UserBase(BaseModel):
    email: str
    full_name: str
    role: Literal["admin", "user"] = "user"
    is_active: bool = True


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    full_name: str | None = None
    role: Literal["admin", "user"] | None = None
    is_active: bool | None = None
    password: str | None = None


class UserOut(UserBase):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Equipment ─────────────────────────────────────────────────────────────────

class EquipmentCreate(BaseModel):
    name: str
    description: str = ""
    location: str = ""


class EquipmentUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    location: str | None = None
    is_active: bool | None = None


class EquipmentOut(BaseModel):
    id: int
    name: str
    description: str
    location: str
    is_active: bool
    image_url: str | None = None
    max_checkout_days: int = 7
    created_at: datetime
    is_available: bool = True
    active_checkout_id: int | None = None
    active_checkout_user: str | None = None

    model_config = {"from_attributes": True}


# ── Checkout Policy ───────────────────────────────────────────────────────────

class PolicyIn(BaseModel):
    days_of_week: list[int]
    max_checkout_days: int
    allowed_users: list[int] | Literal["all"]

    @field_validator("days_of_week")
    @classmethod
    def validate_days(cls, v: list[int]) -> list[int]:
        if not all(0 <= d <= 6 for d in v):
            raise ValueError("days_of_week values must be 0–6")
        return sorted(set(v))

    @field_validator("max_checkout_days")
    @classmethod
    def validate_days_positive(cls, v: int) -> int:
        if v < 1:
            raise ValueError("max_checkout_days must be at least 1")
        return v


class PolicyOut(BaseModel):
    equipment_id: int
    days_of_week: list[int]
    max_checkout_days: int
    allowed_users: list[int] | Literal["all"]

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def parse_json_fields(cls, data):
        if hasattr(data, "days_of_week"):
            raw_days = data.days_of_week
            raw_users = data.allowed_users
            return {
                "equipment_id": data.equipment_id,
                "days_of_week": json.loads(raw_days) if isinstance(raw_days, str) else raw_days,
                "max_checkout_days": data.max_checkout_days,
                "allowed_users": json.loads(raw_users) if isinstance(raw_users, str) else raw_users,
            }
        return data


# ── Checkout ──────────────────────────────────────────────────────────────────

class CheckoutCreate(BaseModel):
    equipment_id: int
    notes: str = ""
    duration_days: int | None = None      # None → use policy max
    user_id: int | None = None            # admin only — checkout on behalf of this user


class CheckoutOut(BaseModel):
    id: int
    equipment_id: int
    equipment_name: str
    user_id: int
    user_email: str
    user_full_name: str
    checkout_date: datetime
    due_date: datetime
    return_date: datetime | None
    notes: str
    status: str

    model_config = {"from_attributes": True}
