# ESP32 Dispenser — Firmware reference

Hardware: ESP32 DevKit V4, continuous-rotation servo, IR sensor (drawer-closed), LED alert, push button (acknowledge), SH1106 128x64 I²C OLED (U8g2).

No RTC — the ESP32 keeps time via **Wi-Fi + NTP**.

## Wiring (default pinout — adjust to your board)

| Component                    | ESP32 pin    |
|------------------------------|--------------|
| Servo signal                 | GPIO 13      |
| LED (alert)                  | GPIO 2       |
| Push button (acknowledge)    | GPIO 4 (with `INPUT_PULLUP`) |
| IR sensor (drawer closed)    | GPIO 5       |
| OLED SDA                     | GPIO 21      |
| OLED SCL                     | GPIO 22      |

## Firebase paths used

Read (every ~5 s):
```
devices/dispenser_001/schedule/drawer1
devices/dispenser_001/schedule/drawer2
devices/dispenser_001/schedule/drawer3
devices/dispenser_001/schedule/drawer4
```

Write (heartbeat + status):
```
devices/dispenser_001/state
{
  "online": true,
  "lastSeen": <epoch_ms>,
  "currentStatus": "idle" | "dispensing" | "awaiting_ack" | "missed",
  "lastDispensedDrawer": <1-4>,
  "lastScheduleUpdate": <copied from server>
}
```

## Required libraries (Arduino IDE)

- `WiFi.h` (built-in)
- `time.h` (built-in NTP)
- [`Firebase-ESP-Client`](https://github.com/mobizt/Firebase-ESP-Client) by Mobizt
- [`U8g2`](https://github.com/olikraus/u8g2) for the SH1106 OLED
- `ESP32Servo`

## Sketch outline (pseudo-Arduino)

```cpp
#include <WiFi.h>
#include <time.h>
#include <Firebase_ESP_Client.h>
#include <ESP32Servo.h>
#include <U8g2lib.h>

#define WIFI_SSID     "YOUR_WIFI"
#define WIFI_PASSWORD "YOUR_PASS"
#define FB_HOST       "https://your-project-default-rtdb.firebaseio.com"
#define FB_KEY        "YOUR_FIREBASE_DATABASE_SECRET"  // legacy secret for test-mode demo

#define DEVICE_ID     "dispenser_001"

Servo servo;
U8G2_SH1106_128X64_NONAME_F_HW_I2C oled(U8G2_R0);
FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;

struct DrawerSchedule {
  bool enabled;
  String medicine;
  int hour;
  int minute;
  bool triggeredToday;
};
DrawerSchedule drawers[4];

void connectWiFi() { /* WiFi.begin + wait */ }

void setupTime() {
  configTime(/*gmtOffset*/ 19800, /*dst*/ 0, "pool.ntp.org");
}

void pollSchedule() {
  for (int i = 1; i <= 4; ++i) {
    String path = String("/devices/") + DEVICE_ID + "/schedule/drawer" + i;
    if (Firebase.RTDB.getJSON(&fbdo, path)) {
      // parse enabled / medicine / hour / minute
    }
  }
}

void dispense(int drawerIdx) {
  // 1. Set state.currentStatus = "dispensing"
  // 2. Rotate servo: forward 600ms, stop, wait, reverse 600ms, stop
  // 3. Turn on LED
  // 4. OLED: "Take <medicine>"
  // 5. Wait for IR (drawer opened) OR button press; timeout after 60s → "missed"
  // 6. state.lastDispensedDrawer = drawerIdx; currentStatus = "idle"
}

void heartbeat() {
  // Every 10s, write state.online=true, lastSeen=now()
}

void loop() {
  pollSchedule();          // every ~5 s
  struct tm now; getLocalTime(&now);
  for (int i = 0; i < 4; ++i) {
    if (drawers[i].enabled && !drawers[i].triggeredToday
        && now.tm_hour == drawers[i].hour
        && now.tm_min  == drawers[i].minute) {
      dispense(i + 1);
      drawers[i].triggeredToday = true;
    }
  }
  // reset triggeredToday at local midnight
  heartbeat();
  delay(1000);
}
```

> Use the **legacy database secret** (Project Settings → Service Accounts → Database secrets) for the quickest test-mode auth on ESP32. Replace with proper authentication before any real deployment.
