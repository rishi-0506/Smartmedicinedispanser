# MEDIDOSE.OS — Smart Trolley Medicine Dispenser

## Vision
Futuristic, IoT-style mobile companion app for a Smart Medicine Trolley that dispenses
pills on schedule, alerts patients via regional-language voice, and lets caregivers
monitor adherence remotely. Built for hospitals, home care, and elderly/Alzheimer's patients.

## Stack
- **Frontend:** Expo SDK 54 (React Native, expo-router file-based routing)
- **Backend:** FastAPI + Motor (MongoDB)
- **Auth:** JWT email/password (Bearer tokens, expo-secure-store on native, localStorage on web)
- **Voice:** OpenAI TTS via Emergent LLM Key (`tts-1`, voices: nova/shimmer/alloy/echo/sage)
- **Theme:** Medical sci-fi · deep teal `#020B14` + neon cyan `#00F0FF` glass cards

## Implemented Features
- **Auth flow** — register, login, role select (Caregiver / Patient)
- **Dashboard** — live next-dose countdown, trolley status (battery, wifi, loaded compartments), 6-compartment grid, adherence stats, today's dose queue
- **Schedule** — list/add/delete medicines with name, dosage, compartment, color tag, multiple times, notes; auto-generates today's dose entries
- **Dose Alert modal** — pulsing ring, voice playback (TTS), TAKEN / SKIP / SNOOZE actions with haptics
- **History & Analytics** — 14-day adherence ring + per-status counters + recent events log
- **Profile / Voice settings** — language picker (EN/HI/TA/TE/BN) + voice timbre + preview
- **Mock IoT trolley** — seeded with 1 patient (Aarav Sharma), 3 medicines, 6 compartments, simulated battery/wifi

## API Surface (`/api/*`)
- `POST /auth/register`, `POST /auth/login`, `GET /auth/me`
- `GET/POST /patients`, `GET /patients/{id}`
- `GET/POST /medicines`, `DELETE /medicines/{id}`
- `GET /doses`, `GET /doses/today`, `GET /doses/stats`, `PATCH /doses/{id}`
- `GET /trolley/{patient_id}`, `POST /trolley/{patient_id}/dispense/{compartment}`
- `POST /tts` → `{audio_base64, mime}`

## Demo Credentials
| Role | Email | Password |
|---|---|---|
| Caregiver | `admin@trolley.health` | `Admin@123` |
| Patient   | `patient@trolley.health` | `Patient@123` |

## Test Coverage
- Backend: 14/14 pytest cases pass (auth, patients, medicines, doses, trolley, TTS)
- Frontend: full e2e — login → dashboard → schedule → history → profile (voice preview live)

## Future Roadmap
- Real IoT trolley integration via WebSocket/MQTT
- Push notifications for missed doses
- Caregiver multi-patient view + invite codes
- Exportable PDF adherence reports for doctors
- In-app refill ordering with pharmacy integration (Stripe)
