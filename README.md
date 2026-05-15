 # MEDIDOSE.OS — Smart Trolley Medicine Dispenser

A futuristic medical sci-fi mobile companion app (Expo + React Native) for an IoT-enabled medicine dispenser. The app is completely serverless and uses **Firebase (Auth, Firestore, Realtime Database)** for all authentication, data storage, and IoT synchronization with an ESP32-based hardware dispenser.

```
Mobile App (Expo)
   ↓
Firebase (Auth, Firestore, RTDB) 
   ↓
ESP32 DevKit V4 (reads RTDB)
   ↓
Servo / LED / IR / Push button / SH1106 OLED
```

---

## Quick start (app)

Since this app uses Firebase Auth, you need to create your own users via the Firebase Console or register via the app.
Default roles can be set in Firestore under the `users` collection.

---

## Local development setup

### 1. Firebase Setup

This app requires a Firebase project.

1. Go to <https://console.firebase.google.com> → **Add project**.
2. **Authentication**: Enable Email/Password authentication.
3. **Firestore**: Create a Firestore database. Start in **Test mode**.
4. **Realtime Database**: Create a Realtime Database. Start in **Test mode**.

### 2. Configure Credentials

Click the `</>` icon in your Firebase project to **Add a Web App** and copy the configuration.
Edit `frontend/src/firebase/firebaseConfig.ts` and replace the placeholder values:

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

### 3. Start the frontend
```bash
cd frontend
yarn install                                 
npx expo start -c                            
```

### 4. Create an Account
Use the in-app "Create operator" flow to register a new account.

---

## Database Security Rules (PROTOTYPE ONLY!)

### Realtime Database Rules
```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

### Firestore Rules
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

> ⚠️ **WARNING — these rules let anyone read/write your databases.** Use them only for local demos. Before deploying, tighten the rules to require Firebase Auth.

---

## Hardware Data Structure (Realtime Database)

The app **writes** to:

```
devices/dispenser_001/drawers/drawerX
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
      "drawers": {
        "drawer1": { 
          "enabled": true, 
          "medicine": "Paracetamol",  
          "times": [{"hour": 8, "minute": 30}], 
          "updatedAt": 1715600000000 
        }
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

---

## How the in-app flow works

1. Caregiver adds a medicine on the **Schedule → +** screen.
2. The app saves the medicine to the **Firestore** `medicines` collection.
3. If the selected compartment is **1–4**, the app also writes to **Firebase RTDB** at `devices/dispenser_001/drawers/drawerN` with the full array of `times`.
4. The dashboard subscribes to `devices/dispenser_001/state` and shows the ESP32 status.
5. Doses are generated locally based on medicine schedules and checked against the `doseLogs` Firestore collection to calculate adherence.

---

## ESP32 firmware (separate folder)

The firmware lives at `firmware/esp32_dispenser/` (reference only — not built by the app pipeline). See [`firmware/esp32_dispenser/README.md`](firmware/esp32_dispenser/README.md) for hardware wiring and a sketch outline.
