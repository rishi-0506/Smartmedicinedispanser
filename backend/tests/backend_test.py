"""Smart Trolley Medicine Dispenser - Backend API Tests"""
import os
import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@trolley.health"
ADMIN_PASS = "Admin@123"

state = {}


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


# ---- Health ----
def test_health(s):
    r = s.get(f"{API}/")
    assert r.status_code == 200
    assert r.json().get("status") == "online"


# ---- Auth ----
def test_login_admin(s):
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    assert r.status_code == 200, r.text
    data = r.json()
    assert "access_token" in data
    assert data["user"]["role"] == "caregiver"
    state["token"] = data["access_token"]
    state["uid"] = data["user"]["id"]


def test_login_invalid(s):
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"})
    assert r.status_code == 401


def test_register_and_me(s):
    import uuid
    email = f"TEST_{uuid.uuid4().hex[:8]}@trolley.health"
    r = s.post(f"{API}/auth/register", json={"email": email, "password": "Test@123", "name": "Test User", "role": "caregiver"})
    assert r.status_code == 200, r.text
    tok = r.json()["access_token"]
    me = s.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {tok}"})
    assert me.status_code == 200
    assert me.json()["email"] == email.lower()


def test_me_no_token(s):
    r = s.get(f"{API}/auth/me")
    assert r.status_code == 401


def auth_headers():
    return {"Authorization": f"Bearer {state['token']}", "Content-Type": "application/json"}


# ---- Patients ----
def test_patients_list(s):
    r = s.get(f"{API}/patients", headers=auth_headers())
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    aarav = [p for p in data if p["name"] == "Aarav Sharma"]
    assert len(aarav) == 1
    state["pid"] = aarav[0]["id"]


# ---- Medicines ----
def test_medicines_list(s):
    r = s.get(f"{API}/medicines?patient_id={state['pid']}", headers=auth_headers())
    assert r.status_code == 200
    meds = r.json()
    names = {m["name"] for m in meds}
    assert {"Amlodipine", "Donepezil", "Vitamin D3"}.issubset(names)


def test_medicine_create_delete(s):
    payload = {
        "patient_id": state["pid"],
        "name": "TEST_Med",
        "dosage": "10mg",
        "compartment": 5,
        "times": ["10:00"],
        "notes": "test",
        "color": "#00F0FF",
    }
    r = s.post(f"{API}/medicines", json=payload, headers=auth_headers())
    assert r.status_code == 200, r.text
    mid = r.json()["id"]

    # Verify trolley compartment marked loaded
    tr = s.get(f"{API}/trolley/{state['pid']}", headers=auth_headers()).json()
    comp5 = next(c for c in tr["compartments"] if c["id"] == 5)
    assert comp5["loaded"] is True
    assert comp5["medicine_id"] == mid

    # Delete
    rd = s.delete(f"{API}/medicines/{mid}", headers=auth_headers())
    assert rd.status_code == 200

    tr2 = s.get(f"{API}/trolley/{state['pid']}", headers=auth_headers()).json()
    comp5b = next(c for c in tr2["compartments"] if c["id"] == 5)
    assert comp5b["loaded"] is False


# ---- Doses ----
def test_doses_today(s):
    r = s.get(f"{API}/doses/today?patient_id={state['pid']}", headers=auth_headers())
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_doses_list(s):
    r = s.get(f"{API}/doses?patient_id={state['pid']}", headers=auth_headers())
    assert r.status_code == 200
    doses = r.json()
    assert len(doses) >= 1
    state["dose_id"] = doses[0]["id"]


def test_doses_stats(s):
    r = s.get(f"{API}/doses/stats?patient_id={state['pid']}", headers=auth_headers())
    assert r.status_code == 200
    data = r.json()
    for k in ["total", "taken", "missed", "skipped", "pending", "adherence"]:
        assert k in data
    assert isinstance(data["adherence"], int)


def test_dose_patch(s):
    r = s.patch(f"{API}/doses/{state['dose_id']}", json={"status": "taken"}, headers=auth_headers())
    assert r.status_code == 200


# ---- Trolley ----
def test_trolley(s):
    r = s.get(f"{API}/trolley/{state['pid']}", headers=auth_headers())
    assert r.status_code == 200
    data = r.json()
    assert len(data["compartments"]) == 6
    assert "battery" in data and "wifi" in data


# ---- Role Separation (Iteration 2) ----
PATIENT_EMAIL = "patient@trolley.health"
PATIENT_PASS = "Patient@123"


def test_login_patient(s):
    r = s.post(f"{API}/auth/login", json={"email": PATIENT_EMAIL, "password": PATIENT_PASS})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["user"]["role"] == "patient"
    state["ptoken"] = data["access_token"]
    state["puid"] = data["user"]["id"]


def patient_headers():
    return {"Authorization": f"Bearer {state['ptoken']}", "Content-Type": "application/json"}


def test_patients_me_for_patient(s):
    r = s.get(f"{API}/patients/me", headers=patient_headers())
    assert r.status_code == 200, r.text
    p = r.json()
    assert p["name"] == "Aarav Sharma"
    assert p.get("user_id") == state["puid"], "Aarav Sharma must be linked to patient user via user_id"


def test_patients_me_forbidden_for_caregiver(s):
    r = s.get(f"{API}/patients/me", headers=auth_headers())
    assert r.status_code == 403


def test_patient_list_returns_only_own(s):
    r = s.get(f"{API}/patients", headers=patient_headers())
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["user_id"] == state["puid"]


def test_create_patient_forbidden_for_patient(s):
    payload = {"name": "TEST_X", "age": 50, "condition": "", "language": "en"}
    r = s.post(f"{API}/patients", json=payload, headers=patient_headers())
    assert r.status_code == 403


def test_create_patient_caregiver_ok(s):
    payload = {"name": "TEST_NewPatient", "age": 60, "condition": "Diabetes", "language": "en", "avatar": ""}
    r = s.post(f"{API}/patients", json=payload, headers=auth_headers())
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["name"] == "TEST_NewPatient"
    assert data["caregiver_id"] == state["uid"]
    new_pid = data["id"]
    # Verify GET reflects creation
    g = s.get(f"{API}/patients/{new_pid}", headers=auth_headers())
    assert g.status_code == 200
    assert g.json()["name"] == "TEST_NewPatient"
    # Trolley initialized
    tr = s.get(f"{API}/trolley/{new_pid}", headers=auth_headers())
    assert tr.status_code == 200
    state["new_pid"] = new_pid


def test_register_patient_auto_creates_profile(s):
    import uuid
    email = f"TEST_pt_{uuid.uuid4().hex[:8]}@trolley.health"
    r = s.post(f"{API}/auth/register", json={
        "email": email, "password": "Test@123", "name": "TEST_AutoPatient", "role": "patient"
    })
    assert r.status_code == 200, r.text
    tok = r.json()["access_token"]
    me = s.get(f"{API}/patients/me", headers={"Authorization": f"Bearer {tok}"})
    assert me.status_code == 200
    p = me.json()
    assert p["name"] == "TEST_AutoPatient"
    # Trolley auto-created
    tr = s.get(f"{API}/trolley/{p['id']}", headers={"Authorization": f"Bearer {tok}"})
    assert tr.status_code == 200


# ---- TTS ----
def test_tts(s):
    r = s.post(f"{API}/tts", json={"text": "Hello", "voice": "nova", "language": "en"}, headers=auth_headers(), timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "audio_base64" in data
    assert isinstance(data["audio_base64"], str) and len(data["audio_base64"]) > 100
