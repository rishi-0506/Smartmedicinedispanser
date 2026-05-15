from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import json
import logging
import uuid
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal
from functools import partial
import asyncio

import firebase_admin
from firebase_admin import credentials, firestore

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, EmailStr

# --------- Logging ---------
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("trolley")

# --------- Firebase Init ---------
_firebase_cred_path = os.environ.get("FIREBASE_SERVICE_ACCOUNT_KEY")
_firebase_cred_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")

if not firebase_admin._apps:
    if _firebase_cred_json:
        cred_dict = json.loads(_firebase_cred_json)
        cred = credentials.Certificate(cred_dict)
    elif _firebase_cred_path:
        cred = credentials.Certificate(_firebase_cred_path)
    else:
        raise RuntimeError(
            "Firebase credentials not set. "
            "Set FIREBASE_SERVICE_ACCOUNT_KEY (path to JSON file) or "
            "FIREBASE_SERVICE_ACCOUNT_JSON (JSON string) in .env"
        )
    firebase_admin.initialize_app(cred)

_fs = firestore.client()

# --------- Firestore helpers ---------
# Wrap synchronous Firestore calls so they don't block the async event loop.

async def _run(func, *args, **kwargs):
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, partial(func, *args, **kwargs))


def _col(name: str):
    return _fs.collection(name)


def _strip(doc_snap) -> Optional[dict]:
    """Convert a Firestore DocumentSnapshot to a plain dict (or None)."""
    if doc_snap and doc_snap.exists:
        return doc_snap.to_dict()
    return None


async def _find_one(collection: str, field: str, value) -> Optional[dict]:
    col = _col(collection)
    def _query():
        results = col.where(field, "==", value).limit(1).get()
        return results[0] if results else None
    snap = await _run(_query)
    return _strip(snap)


async def _find_one_multi(collection: str, filters: dict) -> Optional[dict]:
    """Filter by multiple equality conditions."""
    col = _col(collection)
    def _query():
        q = col
        for k, v in filters.items():
            q = q.where(k, "==", v)
        results = q.limit(1).get()
        return results[0] if results else None
    snap = await _run(_query)
    return _strip(snap)


async def _find_many(collection: str, filters: dict = None, order_by: str = None, limit: int = 500) -> List[dict]:
    col = _col(collection)
    def _query():
        q = col
        if filters:
            for k, v in filters.items():
                q = q.where(k, "==", v)
        if order_by:
            q = q.order_by(order_by)
        return [s.to_dict() for s in q.limit(limit).get()]
    return await _run(_query)


async def _find_many_gte(collection: str, field: str, value, extra_filters: dict = None, order_by: str = None, limit: int = 500) -> List[dict]:
    col = _col(collection)
    def _query():
        q = col.where(field, ">=", value)
        if extra_filters:
            for k, v in extra_filters.items():
                q = q.where(k, "==", v)
        if order_by:
            q = q.order_by(order_by)
        return [s.to_dict() for s in q.limit(limit).get()]
    return await _run(_query)


async def _find_many_range(collection: str, field: str, gte, lt, extra_filters: dict = None, order_by: str = None, limit: int = 200) -> List[dict]:
    col = _col(collection)
    def _query():
        q = col.where(field, ">=", gte).where(field, "<", lt)
        if extra_filters:
            for k, v in extra_filters.items():
                q = q.where(k, "==", v)
        if order_by:
            q = q.order_by(order_by)
        return [s.to_dict() for s in q.limit(limit).get()]
    return await _run(_query)


async def _insert(collection: str, doc: dict):
    doc_id = doc.get("id", str(uuid.uuid4()))
    await _run(_col(collection).document(doc_id).set, doc)


async def _update(collection: str, doc_id: str, data: dict):
    await _run(_col(collection).document(doc_id).update, data)


async def _delete(collection: str, doc_id: str):
    await _run(_col(collection).document(doc_id).delete)


async def _delete_many(collection: str, field: str, value):
    col = _col(collection)
    def _do():
        snaps = col.where(field, "==", value).get()
        for s in snaps:
            s.reference.delete()
    await _run(_do)


async def _count_where(collection: str, field: str, value) -> int:
    col = _col(collection)
    def _do():
        return len(col.where(field, "==", value).get())
    return await _run(_do)


async def _get_doc(collection: str, doc_id: str) -> Optional[dict]:
    snap = await _run(_col(collection).document(doc_id).get)
    return _strip(snap)


# --------- App ---------
app = FastAPI(title="Smart Trolley Medicine Dispenser API")
api = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)

JWT_ALGORITHM = "HS256"
JWT_SECRET = os.environ["JWT_SECRET"]


# ------------- Helpers -------------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_current_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> dict:
    if not creds or not creds.credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = creds.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await _find_one("users", "id", payload["sub"])
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    user.pop("password_hash", None)
    return user


# ------------- Models -------------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str
    role: Literal["caregiver", "patient"] = "caregiver"


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class AuthOut(BaseModel):
    access_token: str
    user: dict


class PatientIn(BaseModel):
    name: str
    age: int
    condition: Optional[str] = ""
    avatar: Optional[str] = ""
    language: str = "en"


class MedicineIn(BaseModel):
    patient_id: str
    name: str
    dosage: str
    compartment: int
    times: List[str]
    notes: Optional[str] = ""
    color: Optional[str] = "#00F0FF"


class DoseUpdate(BaseModel):
    status: Literal["taken", "missed", "skipped", "snoozed"]


# ------------- Auth Endpoints -------------
@api.post("/auth/register", response_model=AuthOut)
async def register(body: RegisterIn):
    email = body.email.lower()
    existing = await _find_one("users", "email", email)
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id,
        "email": email,
        "name": body.name,
        "role": body.role,
        "password_hash": hash_password(body.password),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await _insert("users", user_doc)

    if body.role == "patient":
        await _create_patient_profile_for_user(user_id, body.name)

    token = create_access_token(user_id, email, body.role)
    user_doc.pop("password_hash", None)
    return {"access_token": token, "user": user_doc}


async def _create_patient_profile_for_user(user_id: str, name: str):
    pid = str(uuid.uuid4())
    await _insert("patients", {
        "id": pid,
        "user_id": user_id,
        "caregiver_id": None,
        "name": name,
        "age": 65,
        "condition": "—",
        "avatar": "",
        "language": "en",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    await _insert("trolley_status", {
        "id": pid,
        "patient_id": pid,
        "battery": 92,
        "wifi": True,
        "online": True,
        "compartments": [{"id": i, "loaded": False, "medicine_id": None} for i in range(1, 7)],
        "last_sync": datetime.now(timezone.utc).isoformat(),
    })
    return pid


@api.post("/auth/login", response_model=AuthOut)
async def login(body: LoginIn):
    email = body.email.lower()
    user = await _find_one("users", "email", email)
    if not user or not verify_password(body.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(user["id"], email, user["role"])
    user.pop("password_hash", None)
    user.pop("_id", None)
    return {"access_token": token, "user": user}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


# ------------- Patients -------------
@api.get("/patients")
async def list_patients(user: dict = Depends(get_current_user)):
    if user["role"] == "caregiver":
        patients = await _find_many("patients", {"caregiver_id": user["id"]})
    else:
        patients = await _find_many("patients", {"user_id": user["id"]})
    return patients


@api.get("/patients/me")
async def my_patient(user: dict = Depends(get_current_user)):
    if user["role"] != "patient":
        raise HTTPException(403, "Only patients can fetch their own profile")
    p = await _find_one("patients", "user_id", user["id"])
    if not p:
        await _create_patient_profile_for_user(user["id"], user.get("name", "Patient"))
        p = await _find_one("patients", "user_id", user["id"])
    return p


@api.post("/patients")
async def create_patient(body: PatientIn, user: dict = Depends(get_current_user)):
    if user["role"] != "caregiver":
        raise HTTPException(403, "Only caregivers can add patients")
    pid = str(uuid.uuid4())
    doc = {
        "id": pid,
        "caregiver_id": user["id"],
        "user_id": None,
        "name": body.name,
        "age": body.age,
        "condition": body.condition,
        "avatar": body.avatar,
        "language": body.language,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await _insert("patients", doc)
    await _insert("trolley_status", {
        "id": pid,
        "patient_id": pid,
        "battery": 87,
        "wifi": True,
        "online": True,
        "compartments": [{"id": i, "loaded": False, "medicine_id": None} for i in range(1, 7)],
        "last_sync": datetime.now(timezone.utc).isoformat(),
    })
    return doc


@api.get("/patients/{patient_id}")
async def get_patient(patient_id: str, user: dict = Depends(get_current_user)):
    p = await _find_one("patients", "id", patient_id)
    if not p:
        raise HTTPException(404, "Patient not found")
    return p


# ------------- Medicines -------------
@api.get("/medicines")
async def list_medicines(patient_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    filters = {"patient_id": patient_id} if patient_id else {}
    return await _find_many("medicines", filters, limit=200)


@api.post("/medicines")
async def create_medicine(body: MedicineIn, user: dict = Depends(get_current_user)):
    mid = str(uuid.uuid4())
    doc = body.model_dump()
    doc["id"] = mid
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await _insert("medicines", doc)

    # Mark compartment as loaded in trolley_status
    trolley = await _find_one("trolley_status", "patient_id", body.patient_id)
    if trolley:
        compartments = trolley.get("compartments", [])
        for c in compartments:
            if c["id"] == body.compartment:
                c["loaded"] = True
                c["medicine_id"] = mid
        await _update("trolley_status", trolley["id"], {"compartments": compartments})

    await _generate_doses_for_medicine(doc)
    return doc


@api.delete("/medicines/{medicine_id}")
async def delete_medicine(medicine_id: str, user: dict = Depends(get_current_user)):
    med = await _find_one("medicines", "id", medicine_id)
    if not med:
        raise HTTPException(404, "Medicine not found")
    await _delete("medicines", medicine_id)

    # Unload compartment
    trolley = await _find_one("trolley_status", "patient_id", med["patient_id"])
    if trolley:
        compartments = trolley.get("compartments", [])
        for c in compartments:
            if c.get("medicine_id") == medicine_id:
                c["loaded"] = False
                c["medicine_id"] = None
        await _update("trolley_status", trolley["id"], {"compartments": compartments})

    await _delete_many("doses", "medicine_id", medicine_id)
    return {"ok": True}


async def _generate_doses_for_medicine(med: dict):
    today = datetime.now(timezone.utc).date()
    for t in med["times"]:
        try:
            hh, mm = [int(x) for x in t.split(":")]
        except Exception:
            continue
        scheduled = datetime(today.year, today.month, today.day, hh, mm, tzinfo=timezone.utc)
        existing = await _find_one_multi("doses", {
            "medicine_id": med["id"],
            "scheduled_at": scheduled.isoformat()
        })
        if not existing:
            await _insert("doses", {
                "id": str(uuid.uuid4()),
                "medicine_id": med["id"],
                "patient_id": med["patient_id"],
                "medicine_name": med["name"],
                "dosage": med["dosage"],
                "compartment": med["compartment"],
                "scheduled_at": scheduled.isoformat(),
                "status": "pending",
                "taken_at": None,
            })


# ------------- Doses -------------
@api.get("/doses")
async def list_doses(patient_id: Optional[str] = None, days: int = 7, user: dict = Depends(get_current_user)):
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    extra = {"patient_id": patient_id} if patient_id else None
    doses = await _find_many_gte("doses", "scheduled_at", since, extra_filters=extra, order_by="scheduled_at")
    return doses


@api.get("/doses/today")
async def doses_today(patient_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    today = datetime.now(timezone.utc).date()
    start = datetime(today.year, today.month, today.day, tzinfo=timezone.utc).isoformat()
    end = (datetime(today.year, today.month, today.day, tzinfo=timezone.utc) + timedelta(days=1)).isoformat()
    extra = {"patient_id": patient_id} if patient_id else None
    doses = await _find_many_range("doses", "scheduled_at", start, end, extra_filters=extra, order_by="scheduled_at")
    return doses


@api.patch("/doses/{dose_id}")
async def update_dose(dose_id: str, body: DoseUpdate, user: dict = Depends(get_current_user)):
    dose = await _find_one("doses", "id", dose_id)
    if not dose:
        raise HTTPException(404, "Dose not found")
    update_data = {"status": body.status}
    if body.status == "taken":
        update_data["taken_at"] = datetime.now(timezone.utc).isoformat()
    await _update("doses", dose_id, update_data)
    return {"ok": True}


@api.get("/doses/stats")
async def adherence_stats(patient_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    since = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    extra = {"patient_id": patient_id} if patient_id else None
    all_doses = await _find_many_gte("doses", "scheduled_at", since, extra_filters=extra)
    total = len(all_doses)
    taken = sum(1 for d in all_doses if d["status"] == "taken")
    missed = sum(1 for d in all_doses if d["status"] == "missed")
    skipped = sum(1 for d in all_doses if d["status"] == "skipped")
    pending = sum(1 for d in all_doses if d["status"] == "pending")
    adherence = round((taken / total) * 100) if total else 0
    return {
        "total": total,
        "taken": taken,
        "missed": missed,
        "skipped": skipped,
        "pending": pending,
        "adherence": adherence,
    }


# ------------- Trolley -------------
@api.get("/trolley/{patient_id}")
async def get_trolley(patient_id: str, user: dict = Depends(get_current_user)):
    status = await _find_one("trolley_status", "patient_id", patient_id)
    if not status:
        raise HTTPException(404, "Trolley not found")
    return status


@api.post("/trolley/{patient_id}/dispense/{compartment}")
async def dispense(patient_id: str, compartment: int, user: dict = Depends(get_current_user)):
    status = await _find_one("trolley_status", "patient_id", patient_id)
    if not status:
        raise HTTPException(404, "Trolley not found")
    return {"ok": True, "compartment": compartment, "message": f"Compartment {compartment} dispensed"}


@api.get("/")
async def root():
    return {"service": "Smart Trolley Medicine Dispenser API", "status": "online"}


# ------------- Seed -------------
async def seed_data():
    admin_email = os.environ["ADMIN_EMAIL"].lower()
    admin_password = os.environ["ADMIN_PASSWORD"]
    existing = await _find_one("users", "email", admin_email)
    if not existing:
        admin_id = str(uuid.uuid4())
        await _insert("users", {
            "id": admin_id,
            "email": admin_email,
            "name": "Dr. Aria Voss",
            "role": "caregiver",
            "password_hash": hash_password(admin_password),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    else:
        admin_id = existing["id"]
        if not verify_password(admin_password, existing["password_hash"]):
            await _update("users", admin_id, {"password_hash": hash_password(admin_password)})

    patient_email = "patient@trolley.health"
    pu = await _find_one("users", "email", patient_email)
    if not pu:
        patient_user_id = str(uuid.uuid4())
        await _insert("users", {
            "id": patient_user_id,
            "email": patient_email,
            "name": "Aarav Sharma",
            "role": "patient",
            "password_hash": hash_password("Patient@123"),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    else:
        patient_user_id = pu["id"]

    p = await _find_one_multi("patients", {"caregiver_id": admin_id, "name": "Aarav Sharma"})
    if not p:
        pid = str(uuid.uuid4())
        await _insert("patients", {
            "id": pid,
            "caregiver_id": admin_id,
            "user_id": patient_user_id,
            "name": "Aarav Sharma",
            "age": 72,
            "condition": "Hypertension, Mild Alzheimer's",
            "avatar": "",
            "language": "hi",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        await _insert("trolley_status", {
            "id": pid,
            "patient_id": pid,
            "battery": 87,
            "wifi": True,
            "online": True,
            "compartments": [{"id": i, "loaded": False, "medicine_id": None} for i in range(1, 7)],
            "last_sync": datetime.now(timezone.utc).isoformat(),
        })

        meds = [
            {"name": "Amlodipine", "dosage": "5mg", "compartment": 1, "times": ["08:00", "20:00"], "color": "#00F0FF"},
            {"name": "Donepezil", "dosage": "10mg", "compartment": 2, "times": ["09:00"], "color": "#00FF9D"},
            {"name": "Vitamin D3", "dosage": "1000 IU", "compartment": 3, "times": ["13:00"], "color": "#FFB800"},
        ]
        for m in meds:
            mid = str(uuid.uuid4())
            doc = {
                "id": mid,
                "patient_id": pid,
                "name": m["name"],
                "dosage": m["dosage"],
                "compartment": m["compartment"],
                "times": m["times"],
                "notes": "",
                "color": m["color"],
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await _insert("medicines", doc)
            trolley = await _find_one("trolley_status", "patient_id", pid)
            if trolley:
                compartments = trolley.get("compartments", [])
                for c in compartments:
                    if c["id"] == m["compartment"]:
                        c["loaded"] = True
                        c["medicine_id"] = mid
                await _update("trolley_status", pid, {"compartments": compartments})
            await _generate_doses_for_medicine(doc)

        yest = datetime.now(timezone.utc).date() - timedelta(days=1)
        for hh in [8, 9, 13, 20]:
            await _insert("doses", {
                "id": str(uuid.uuid4()),
                "medicine_id": "history",
                "patient_id": pid,
                "medicine_name": "Past Dose",
                "dosage": "—",
                "compartment": 1,
                "scheduled_at": datetime(yest.year, yest.month, yest.day, hh, 0, tzinfo=timezone.utc).isoformat(),
                "status": "taken" if hh != 13 else "missed",
                "taken_at": datetime.now(timezone.utc).isoformat() if hh != 13 else None,
            })
    else:
        if not p.get("user_id"):
            await _update("patients", p["id"], {"user_id": patient_user_id})


@app.on_event("startup")
async def on_startup():
    try:
        await seed_data()
        logger.info("Startup complete; seed data ensured.")
    except Exception as e:
        logger.error(f"Startup error: {e}")


# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api)
