# MEDIDOSE.OS — Smart Trolley Medicine Dispenser

A futuristic medical sci-fi mobile companion app (Expo + React Native) for an IoT-enabled medicine dispenser. The app talks to a FastAPI/MongoDB backend for scheduling and adherence, and **additionally** writes drawer schedules to **Firebase Realtime Database** so an ESP32-based hardware dispenser can read them and trigger servos / LED / OLED / buzzer.

```
Mobile App
   ↓
FastAPI + MongoDB  ──┐   (canonical store · authentication · history)
                     │
Firebase RTDB  ──────┘   (IoT bridge for ESP32 — drawers 1–4 only)
   ↓
ESP32 DevKit V4
   ↓
Servo / LED / IR / Push button / SH1106 OLED
```

---

## Quick start (app)

| Role | Email | Password |
|---|---|---|
| Caregiver | `admin@trolley.health` | `Admin@123` |
| Patient   | `patient@trolley.health` | `Patient@123` |

---

## Local development setup

> If you see `Request failed with status code 404` on the login screen, the frontend is calling the wrong URL or the backend isn't running. Follow the order below exactly.

### 1. Start MongoDB
```bash
# macOS (Homebrew)
brew services start mongodb-community

# Linux (systemd)
sudo systemctl start mongod

# Or via Docker
docker run -d --name mongo -p 27017:27017 mongo:7
```
Verify it's listening on `mongodb://localhost:27017`.

### 2. Start the backend
```bash
cd backend
cp .env.example .env                         # one-time
pip install -r requirements.txt              # one-time
uvicorn server:app --reload --host 0.0.0.0 --port 8000
```
Verify it responds:
```bash
curl http://localhost:8000/api/
# → {"service":"Smart Trolley Medicine Dispenser API","status":"online"}
```

### 3. Start the frontend
```bash
cd frontend
cp .env.example .env                         # one-time — sets EXPO_PUBLIC_BACKEND_URL=http://localhost:8000
yarn install                                 # one-time
npx expo start -c                            # `-c` clears the cache (required after .env changes!)
```

### 4. Log in
Press `w` for web (or scan the QR with Expo Go on a device on the same Wi-Fi). Use:
- `admin@trolley.health` / `Admin@123`

### Troubleshooting the 404 / login failure

| Symptom | Cause | Fix |
|---|---|---|
| `Request failed with status code 404` on login | `EXPO_PUBLIC_BACKEND_URL` missing or pointing to a non-running backend | Copy `frontend/.env.example` → `frontend/.env`, restart Expo with `npx expo start -c` |
| `Network Error` / connection refused | Backend not running, or port mismatch | Verify `curl http://localhost:8000/api/` returns 200. Make sure the port in `backend` (`--port 8000`) matches `EXPO_PUBLIC_BACKEND_URL` |
| 404 on Android emulator only | `localhost` resolves to the emulator itself | Use `EXPO_PUBLIC_BACKEND_URL=http://10.0.2.2:8000` |
| 404 on physical phone via Expo Go | Phone can't reach your dev laptop | Use your laptop's LAN IP, e.g. `http://192.168.1.42:8000`, and make sure your firewall allows it |
| Wrong account error / `Invalid email or password` | Seed not run | Restart backend — the admin user is re-seeded on startup |

---

## Firebase Realtime Database setup

> The app **continues to work without Firebase** — if credentials are left as placeholders, the ESP32 sync is silently skipped and the medicine is still saved to the backend.

### 1. Create a Firebase project

1. Go to <https://console.firebase.google.com> → **Add project**.
2. Once created, click the `</>` icon to **Add a Web App** — note down the `firebaseConfig` values.
3. In the left nav: **Build → Realtime Database → Create Database**. Pick any region. Start in **Test mode** for the prototype.

### 2. Paste credentials into the app

Edit `frontend/src/firebase/firebaseConfig.ts` and replace the `REPLACE_WITH_*` placeholder values with your real config:

```ts
const firebaseConfig = {
  apiKey: 'AIzaSy...',
  authDomain: 'your-project.firebaseapp.com',
  databaseURL: 'https://your-project-default-rtdb.firebaseio.com',
  projectId: 'your-project',
  storageBucket: 'your-project.appspot.com',
  messagingSenderId: '1234567890',
  appId: '1:1234567890:web:abc123',
};
```

### 3. Database security rules (PROTOTYPE ONLY!)

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

> ⚠️ **WARNING — these rules let anyone read/write your database.** Use them only for local demos. Before deploying, tighten the rules to require Firebase Auth or a custom claim, and scope reads/writes to `devices/$device_id`.

### 4. Expected data structure

The app **writes** to:

```
devices/dispenser_001/schedule/drawer1
devices/dispenser_001/schedule/drawer2
devices/dispenser_001/schedule/drawer3
devices/dispenser_001/schedule/drawer4
```

The ESP32 **writes** to:

```
devices/dispenser_001/state
```

Example full document:

```json
{
  "devices": {
    "dispenser_001": {
      "schedule": {
        "drawer1": { "enabled": true, "medicine": "Paracetamol",  "hour": 8,  "minute": 30, "updatedAt": 1715600000000 },
        "drawer2": { "enabled": true, "medicine": "Vitamin D",    "hour": 13, "minute": 0,  "updatedAt": 1715600000000 },
        "drawer3": { "enabled": true, "medicine": "BP Tablet",    "hour": 18, "minute": 30, "updatedAt": 1715600000000 },
        "drawer4": { "enabled": true, "medicine": "Night Tablet", "hour": 22, "minute": 0,  "updatedAt": 1715600000000 }
      },
      "state": {
        "online": true,
        "lastSeen": 1715600005000,
        "currentStatus": "idle",
        "lastDispensedDrawer": 0,
        "lastScheduleUpdate": 1715600000000
      }
    }
  }
}
```

### 5. Single-drawer ESP32 read shape

The ESP32 firmware should read each `devices/dispenser_001/schedule/drawerN` path and expect a JSON object like:

```json
{ "enabled": true, "medicine": "Test Tablet", "hour": 18, "minute": 45 }
```

- `hour` — integer, **24-hour format** (`0..23`). e.g. 8:30 AM → `8`, 6:45 PM → `18`.
- `minute` — integer (`0..59`).
- `enabled` — boolean. If `false`, skip this drawer.

---

## How the in-app flow works

1. Caregiver adds a medicine on the **Schedule → +** screen (`app/add-medicine.tsx`).
2. The app posts to the existing FastAPI backend (`POST /api/medicines`) — primary store, **unchanged**.
3. If the selected compartment is **1–4**, the app also calls `saveDrawerSchedule(...)` which writes to Firebase RTDB at `devices/dispenser_001/schedule/drawerN` using the **first** scheduled time of the medicine.
4. Compartments 5–6 (if used) stay app-only — the UI shows a hint.
5. The dashboard subscribes to `devices/dispenser_001/state` and shows the ESP32 status pill (online flag, currentStatus, last dispensed drawer) inside the Trolley card. The pill is hidden when Firebase is not configured.

### Sync status feedback (Add Medicine screen)

After save, the screen displays one of:

- ✅ `Synced to dispenser · drawer N` — Firebase write succeeded.
- ⚠️ `Saved locally · dispenser sync skipped (reason)` — Firebase not configured / compartment > 4.
- ❌ `Saved locally · Firebase sync failed (reason)` — network or rules issue. The backend save still succeeded.

---

## ESP32 firmware (separate folder)

The firmware lives at `firmware/esp32_dispenser/` (reference only — not built by the app pipeline). See [`firmware/esp32_dispenser/README.md`](firmware/esp32_dispenser/README.md) for hardware wiring and a sketch outline.

---

## Project layout

```
app/
├── backend/                       FastAPI · MongoDB · TTS (UNCHANGED by Firebase work)
│   ├── server.py
│   └── ...
├── frontend/
│   ├── app/                       Expo Router screens
│   │   ├── (tabs)/dashboard.tsx   shows ESP32 status pill
│   │   ├── add-medicine.tsx       calls saveDrawerSchedule after backend save
│   │   └── ...
│   └── src/
│       ├── firebase/
│       │   ├── firebaseConfig.ts  ← paste credentials here
│       │   └── dispenserService.ts
│       └── ...
└── firmware/
    └── esp32_dispenser/           Reference only
        └── README.md
```

---

## What this integration does **not** do

- Does not replace the existing MongoDB/FastAPI scheduling logic.
- Does not change app auth, navigation, or any other screen.
- Does not implement Firebase Auth (deliberately kept simple for the prototype).
- Does not flash the ESP32 from the app — the firmware is a separate sketch you upload via Arduino IDE / PlatformIO.
