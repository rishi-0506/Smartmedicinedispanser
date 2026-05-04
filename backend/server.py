from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import logging
import uuid
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr

# --------- LLM TTS ---------
try:
    from emergentintegrations.llm.openai import OpenAITextToSpeech
    _tts_client = OpenAITextToSpeech(api_key=os.environ.get("EMERGENT_LLM_KEY"))
except Exception as _e:
    _tts_client = None

# --------- Logging ---------
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("trolley")

# --------- DB ---------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

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
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
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
    dosage: str  # e.g. "500mg"
    compartment: int  # 1-6
    times: List[str]  # ["08:00","14:00","20:00"]
    notes: Optional[str] = ""
    color: Optional[str] = "#00F0FF"


class DoseUpdate(BaseModel):
    status: Literal["taken", "missed", "skipped", "snoozed"]


class TTSIn(BaseModel):
    text: str
    voice: str = "nova"
    language: str = "en"


# ------------- Auth Endpoints -------------
@api.post("/auth/register", response_model=AuthOut)
async def register(body: RegisterIn):
    email = body.email.lower()
    existing = await db.users.find_one({"email": email})
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
    await db.users.insert_one(user_doc)
    token = create_access_token(user_id, email, body.role)
    user_doc.pop("password_hash", None)
    user_doc.pop("_id", None)
    return {"access_token": token, "user": user_doc}


@api.post("/auth/login", response_model=AuthOut)
async def login(body: LoginIn):
    email = body.email.lower()
    user = await db.users.find_one({"email": email})
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
        patients = await db.patients.find({"caregiver_id": user["id"]}, {"_id": 0}).to_list(100)
    else:
        # patient role: view their own profile
        patients = await db.patients.find({"user_id": user["id"]}, {"_id": 0}).to_list(10)
    return patients


@api.post("/patients")
async def create_patient(body: PatientIn, user: dict = Depends(get_current_user)):
    pid = str(uuid.uuid4())
    doc = {
        "id": pid,
        "caregiver_id": user["id"],
        "name": body.name,
        "age": body.age,
        "condition": body.condition,
        "avatar": body.avatar,
        "language": body.language,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.patients.insert_one(doc)
    # initialize trolley status
    await db.trolley_status.insert_one({
        "patient_id": pid,
        "battery": 87,
        "wifi": True,
        "online": True,
        "compartments": [{"id": i, "loaded": False, "medicine_id": None} for i in range(1, 7)],
        "last_sync": datetime.now(timezone.utc).isoformat(),
    })
    doc.pop("_id", None)
    return doc


@api.get("/patients/{patient_id}")
async def get_patient(patient_id: str, user: dict = Depends(get_current_user)):
    p = await db.patients.find_one({"id": patient_id}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Patient not found")
    return p


# ------------- Medicines -------------
@api.get("/medicines")
async def list_medicines(patient_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {}
    if patient_id:
        q["patient_id"] = patient_id
    meds = await db.medicines.find(q, {"_id": 0}).to_list(200)
    return meds


@api.post("/medicines")
async def create_medicine(body: MedicineIn, user: dict = Depends(get_current_user)):
    mid = str(uuid.uuid4())
    doc = body.dict()
    doc["id"] = mid
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.medicines.insert_one(doc)
    # mark compartment loaded
    await db.trolley_status.update_one(
        {"patient_id": body.patient_id, "compartments.id": body.compartment},
        {"$set": {"compartments.$.loaded": True, "compartments.$.medicine_id": mid}}
    )
    # generate today's doses
    await _generate_doses_for_medicine(doc)
    doc.pop("_id", None)
    return doc


@api.delete("/medicines/{medicine_id}")
async def delete_medicine(medicine_id: str, user: dict = Depends(get_current_user)):
    med = await db.medicines.find_one({"id": medicine_id})
    if not med:
        raise HTTPException(404, "Medicine not found")
    await db.medicines.delete_one({"id": medicine_id})
    await db.trolley_status.update_one(
        {"patient_id": med["patient_id"], "compartments.medicine_id": medicine_id},
        {"$set": {"compartments.$.loaded": False, "compartments.$.medicine_id": None}}
    )
    await db.doses.delete_many({"medicine_id": medicine_id, "status": "pending"})
    return {"ok": True}


async def _generate_doses_for_medicine(med: dict):
    """Create pending dose entries for today for the given medicine."""
    today = datetime.now(timezone.utc).date()
    for t in med["times"]:
        try:
            hh, mm = [int(x) for x in t.split(":")]
        except Exception:
            continue
        scheduled = datetime(today.year, today.month, today.day, hh, mm, tzinfo=timezone.utc)
        existing = await db.doses.find_one({
            "medicine_id": med["id"],
            "scheduled_at": scheduled.isoformat()
        })
        if not existing:
            await db.doses.insert_one({
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
    q = {"scheduled_at": {"$gte": since}}
    if patient_id:
        q["patient_id"] = patient_id
    doses = await db.doses.find(q, {"_id": 0}).sort("scheduled_at", 1).to_list(500)
    return doses


@api.get("/doses/today")
async def doses_today(patient_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    today = datetime.now(timezone.utc).date()
    start = datetime(today.year, today.month, today.day, tzinfo=timezone.utc).isoformat()
    end = (datetime(today.year, today.month, today.day, tzinfo=timezone.utc) + timedelta(days=1)).isoformat()
    q = {"scheduled_at": {"$gte": start, "$lt": end}}
    if patient_id:
        q["patient_id"] = patient_id
    doses = await db.doses.find(q, {"_id": 0}).sort("scheduled_at", 1).to_list(200)
    return doses


@api.patch("/doses/{dose_id}")
async def update_dose(dose_id: str, body: DoseUpdate, user: dict = Depends(get_current_user)):
    update = {"status": body.status}
    if body.status == "taken":
        update["taken_at"] = datetime.now(timezone.utc).isoformat()
    res = await db.doses.update_one({"id": dose_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(404, "Dose not found")
    return {"ok": True}


@api.get("/doses/stats")
async def adherence_stats(patient_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    since = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    q = {"scheduled_at": {"$gte": since}}
    if patient_id:
        q["patient_id"] = patient_id
    all_doses = await db.doses.find(q, {"_id": 0}).to_list(500)
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
    status = await db.trolley_status.find_one({"patient_id": patient_id}, {"_id": 0})
    if not status:
        raise HTTPException(404, "Trolley not found")
    return status


@api.post("/trolley/{patient_id}/dispense/{compartment}")
async def dispense(patient_id: str, compartment: int, user: dict = Depends(get_current_user)):
    """Simulated dispense action."""
    status = await db.trolley_status.find_one({"patient_id": patient_id})
    if not status:
        raise HTTPException(404, "Trolley not found")
    return {"ok": True, "compartment": compartment, "message": f"Compartment {compartment} dispensed"}


# ------------- TTS -------------
@api.post("/tts")
async def tts(body: TTSIn, user: dict = Depends(get_current_user)):
    if _tts_client is None:
        raise HTTPException(500, "TTS service unavailable")
    text = body.text[:500]
    try:
        audio_b64 = await _tts_client.generate_speech_base64(
            text=text, model="tts-1", voice=body.voice
        )
        return {"audio_base64": audio_b64, "mime": "audio/mp3"}
    except Exception as e:
        logger.error(f"TTS failed: {e}")
        raise HTTPException(500, f"TTS failed: {str(e)}")


@api.get("/")
async def root():
    return {"service": "Smart Trolley Medicine Dispenser API", "status": "online"}


# ------------- Seed -------------
async def seed_data():
    # Admin caregiver
    admin_email = os.environ["ADMIN_EMAIL"].lower()
    admin_password = os.environ["ADMIN_PASSWORD"]
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        admin_id = str(uuid.uuid4())
        await db.users.insert_one({
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
            await db.users.update_one(
                {"id": admin_id},
                {"$set": {"password_hash": hash_password(admin_password)}}
            )

    # Demo patient user
    patient_email = "patient@trolley.health"
    pu = await db.users.find_one({"email": patient_email})
    if not pu:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": patient_email,
            "name": "Aarav Sharma",
            "role": "patient",
            "password_hash": hash_password("Patient@123"),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

    # Demo patient profile
    p = await db.patients.find_one({"caregiver_id": admin_id, "name": "Aarav Sharma"})
    if not p:
        pid = str(uuid.uuid4())
        await db.patients.insert_one({
            "id": pid,
            "caregiver_id": admin_id,
            "name": "Aarav Sharma",
            "age": 72,
            "condition": "Hypertension, Mild Alzheimer's",
            "avatar": "",
            "language": "hi",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        await db.trolley_status.insert_one({
            "patient_id": pid,
            "battery": 87,
            "wifi": True,
            "online": True,
            "compartments": [{"id": i, "loaded": False, "medicine_id": None} for i in range(1, 7)],
            "last_sync": datetime.now(timezone.utc).isoformat(),
        })

        # Sample medicines
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
            await db.medicines.insert_one(doc)
            await db.trolley_status.update_one(
                {"patient_id": pid, "compartments.id": m["compartment"]},
                {"$set": {"compartments.$.loaded": True, "compartments.$.medicine_id": mid}}
            )
            # Generate doses for today
            await _generate_doses_for_medicine(doc)

        # Mark some past doses (yesterday) for adherence chart
        yest = datetime.now(timezone.utc).date() - timedelta(days=1)
        for hh in [8, 9, 13, 20]:
            await db.doses.insert_one({
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


@app.on_event("startup")
async def on_startup():
    try:
        await db.users.create_index("email", unique=True)
        await db.patients.create_index("caregiver_id")
        await db.medicines.create_index("patient_id")
        await db.doses.create_index("patient_id")
        await seed_data()
        logger.info("Startup complete; seed data ensured.")
    except Exception as e:
        logger.error(f"Startup error: {e}")


@app.on_event("shutdown")
async def on_shutdown():
    client.close()


# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api)
