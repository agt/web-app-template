"""
One-shot database seeder.
Run: python seed.py
"""
import json
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from app.database import SessionLocal, engine
from app.models import Base, User, Equipment, CheckoutPolicy
from app.auth import hash_password

Base.metadata.create_all(bind=engine)

db = SessionLocal()

if db.query(User).first():
    print("Database already seeded — skipping.")
    db.close()
    sys.exit(0)

admin = User(
    email="admin@lab.local",
    full_name="Lab Administrator",
    role="admin",
    password_hash=hash_password("admin1234"),
)
user1 = User(
    email="alice@lab.local",
    full_name="Alice Researcher",
    role="user",
    password_hash=hash_password("user1234"),
)
user2 = User(
    email="bob@lab.local",
    full_name="Bob Scientist",
    role="user",
    password_hash=hash_password("user1234"),
)
db.add_all([admin, user1, user2])
db.flush()

equipment_data = [
    ("Oscilloscope (Rigol DS1054Z)", "4-channel, 50 MHz digital oscilloscope", "Bench 1"),
    ("Function Generator (Keysight 33500B)", "2-channel, 20 MHz waveform generator", "Bench 2"),
    ("Multimeter (Fluke 87V)", "True-RMS industrial multimeter", "Tool Cabinet A"),
    ("3D Printer (Bambu Lab X1C)", "High-speed multi-material FDM printer", "Fab Room"),
    ("Soldering Station (Hakko FX-951)", "Temperature-controlled SMD rework station", "Bench 3"),
    ("Spectrum Analyzer (TinySA Ultra)", "Portable RF spectrum analyzer 100 kHz–5.3 GHz", "Shelf B2"),
]

for name, desc, loc in equipment_data:
    eq = Equipment(name=name, description=desc, location=loc)
    db.add(eq)
    db.flush()
    policy = CheckoutPolicy(
        equipment_id=eq.id,
        days_of_week=json.dumps(list(range(5))),   # Mon–Fri
        max_checkout_days=7,
        allowed_users=json.dumps("all"),
    )
    db.add(policy)

db.commit()
db.close()

print("Seeded:")
print("  admin@lab.local   / admin1234  (Admin)")
print("  alice@lab.local   / user1234   (User)")
print("  bob@lab.local     / user1234   (User)")
print(f"  {len(equipment_data)} equipment items with Mon–Fri, 7-day checkout policies")
