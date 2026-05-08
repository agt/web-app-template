import json
from datetime import datetime, timezone
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(512), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="user")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )

    checkouts: Mapped[list["Checkout"]] = relationship("Checkout", back_populates="user")


class Equipment(Base):
    __tablename__ = "equipment"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    location: Mapped[str] = mapped_column(String(255), default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    image_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )

    policy: Mapped["CheckoutPolicy | None"] = relationship(
        "CheckoutPolicy", back_populates="equipment", uselist=False
    )
    checkouts: Mapped[list["Checkout"]] = relationship(
        "Checkout", back_populates="equipment"
    )


class CheckoutPolicy(Base):
    """
    days_of_week: JSON array of ints 0–6 (Mon–Sun); empty list means all days allowed.
    allowed_users: JSON array of user IDs, or the string "all".
    """

    __tablename__ = "checkout_policies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    equipment_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("equipment.id"), unique=True, nullable=False
    )
    days_of_week: Mapped[str] = mapped_column(
        Text, default="[0,1,2,3,4,5,6]"
    )
    max_checkout_days: Mapped[int] = mapped_column(Integer, default=7)
    allowed_users: Mapped[str] = mapped_column(Text, default='"all"')

    equipment: Mapped["Equipment"] = relationship("Equipment", back_populates="policy")

    def get_days(self) -> list[int]:
        return json.loads(self.days_of_week)

    def get_allowed_users(self) -> str | list[int]:
        val = json.loads(self.allowed_users)
        return val


class Checkout(Base):
    __tablename__ = "checkouts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    equipment_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("equipment.id"), nullable=False
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False
    )
    checkout_date: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )
    due_date: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    return_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")

    equipment: Mapped["Equipment"] = relationship("Equipment", back_populates="checkouts")
    user: Mapped["User"] = relationship("User", back_populates="checkouts")

    @property
    def status(self) -> str:
        if self.return_date is not None:
            return "returned"
        now = datetime.now(timezone.utc)
        due = self.due_date.replace(tzinfo=timezone.utc) if self.due_date.tzinfo is None else self.due_date
        return "overdue" if now > due else "active"
