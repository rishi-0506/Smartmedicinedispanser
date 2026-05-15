// ============================================================================
// esp32_dispenser.ino — Smart Medicine Dispenser Firmware
//
// Tested pinout:
//   Servo signal   → GPIO 18
//   IR sensor      → GPIO 34  (input-only ADC pin)
//   LED (alert)    → GPIO 25
//   Push button    → GPIO 26  (INPUT_PULLUP — active LOW)
//   OLED SDA       → GPIO 21  (I²C default)
//   OLED SCL       → GPIO 22  (I²C default)
//
// Firebase RTDB paths:
//   READ  → devices/dispenser_001/drawers/drawer{1..4}
//   WRITE → devices/dispenser_001/state
//
// Required libraries (install via Arduino Library Manager):
//   - ESP32Servo          (Kevin Harrington)
//   - Firebase ESP Client (Mobizt)  https://github.com/mobizt/Firebase-ESP-Client
//   - U8g2                (Oliver Kraus)
//
// IMPORTANT: Fill in your credentials below before flashing.
// ============================================================================

#include <WiFi.h>
#include <time.h>
#include <Firebase_ESP_Client.h>
#include <addons/TokenHelper.h>
#include <addons/RTDBHelper.h>
#include <ESP32Servo.h>
#include <U8g2lib.h>
#include <Wire.h>
#include <ArduinoJson.h>

// ---- User credentials (replace before flashing) ----------------------------
#define WIFI_SSID       "YOUR_WIFI_SSID"
#define WIFI_PASSWORD   "YOUR_WIFI_PASSWORD"

// Firebase project settings
#define FB_API_KEY      "YOUR_FIREBASE_WEB_API_KEY"
#define FB_DATABASE_URL "https://YOUR-PROJECT-default-rtdb.firebaseio.com"

// Anonymous / legacy secret approach — use the Database Secret from
// Firebase Console → Project Settings → Service Accounts → Database secrets
#define FB_DB_SECRET    "YOUR_FIREBASE_DATABASE_SECRET"

#define DEVICE_ID       "dispenser_001"
#define NTP_SERVER      "pool.ntp.org"
#define GMT_OFFSET_SEC  19800   // IST = UTC+5:30 → 5*3600+30*60

// ---- Pin definitions -------------------------------------------------------
#define PIN_SERVO   18
#define PIN_IR      34   // input-only; do NOT use pinMode OUTPUT
#define PIN_LED     25
#define PIN_BUTTON  26   // INPUT_PULLUP; LOW = pressed

// ---- Constants -------------------------------------------------------------
#define NUM_DRAWERS        4
#define POLL_INTERVAL_MS   5000   // poll RTDB every 5 s
#define HEARTBEAT_MS       10000  // write heartbeat every 10 s
#define SERVO_OPEN_MS      600    // ms to run servo forward
#define SERVO_CLOSE_MS     600    // ms to run servo backward
#define ACK_TIMEOUT_MS     60000  // 60 s before declaring "missed"
#define SERVO_STOP_PWM     90     // neutral / stopped (continuous rotation)
#define SERVO_FORWARD_PWM  0      // full forward
#define SERVO_BACKWARD_PWM 180    // full backward

// ---- Types -----------------------------------------------------------------
struct DrawerSchedule {
  bool   enabled;
  String medicine;
  int    hour;
  int    minute;
  bool   triggeredToday;
};

// ---- Globals ---------------------------------------------------------------
Servo servo;
U8G2_SH1106_128X64_NONAME_F_HW_I2C oled(U8G2_R0, U8X8_PIN_NONE);

FirebaseData  fbdo;
FirebaseAuth  fbAuth;
FirebaseConfig fbConfig;

DrawerSchedule drawers[NUM_DRAWERS];

unsigned long lastPoll      = 0;
unsigned long lastHeartbeat = 0;
bool          fbReady       = false;

// ============================================================================
// Wi-Fi
// ============================================================================
void connectWiFi() {
  Serial.print("[WiFi] Connecting to ");
  Serial.println(WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries < 30) {
    delay(500);
    Serial.print('.');
    tries++;
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("[WiFi] Connected, IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("[WiFi] FAILED — running offline");
  }
}

// ============================================================================
// NTP time
// ============================================================================
void setupTime() {
  configTime(GMT_OFFSET_SEC, 0, NTP_SERVER);
  Serial.print("[NTP] Syncing time");
  struct tm t;
  int tries = 0;
  while (!getLocalTime(&t) && tries < 20) {
    delay(500);
    Serial.print('.');
    tries++;
  }
  Serial.println();
  if (tries < 20) {
    char buf[32];
    strftime(buf, sizeof(buf), "%Y-%m-%d %H:%M:%S", &t);
    Serial.print("[NTP] Time: ");
    Serial.println(buf);
  } else {
    Serial.println("[NTP] Sync failed — time unreliable");
  }
}

// ============================================================================
// Firebase init
// ============================================================================
void setupFirebase() {
  fbConfig.api_key     = FB_API_KEY;
  fbConfig.database_url = FB_DATABASE_URL;
  fbConfig.signer.tokens.legacy_token = FB_DB_SECRET;

  fbConfig.token_status_callback = tokenStatusCallback;

  Firebase.begin(&fbConfig, &fbAuth);
  Firebase.reconnectWiFi(true);
  fbReady = true;
  Serial.println("[Firebase] Initialized");
}

// ============================================================================
// RTDB helpers
// ============================================================================
void writeState(const char* status, int lastDrawer = 0) {
  if (!fbReady || !Firebase.ready()) return;
  String path = String("/devices/") + DEVICE_ID + "/state";
  FirebaseJson json;
  json.set("online",              true);
  json.set("lastSeen",            (long long)millis());
  json.set("currentStatus",       status);
  json.set("lastDispensedDrawer", lastDrawer);
  Firebase.RTDB.setJSON(&fbdo, path, &json);
}

void writeOffline() {
  if (!fbReady || !Firebase.ready()) return;
  String path = String("/devices/") + DEVICE_ID + "/state/online";
  Firebase.RTDB.setBool(&fbdo, path, false);
}

void pollSchedule() {
  if (!fbReady || !Firebase.ready()) return;
  for (int i = 0; i < NUM_DRAWERS; i++) {
    String drawerKey = String("drawer") + String(i + 1);
    String path = String("/devices/") + DEVICE_ID + "/drawers/" + drawerKey;

    if (Firebase.RTDB.getJSON(&fbdo, path)) {
      FirebaseJson& json = fbdo.jsonObject();
      FirebaseJsonData data;

      json.get(data, "enabled");
      drawers[i].enabled = data.boolValue;

      json.get(data, "medicine");
      drawers[i].medicine = data.stringValue;

      // times is an array; we take the first entry for simplicity
      // (the app may send multiple times — handle multi-dose properly if needed)
      json.get(data, "times/[0]/hour");
      int h = data.intValue;
      json.get(data, "times/[0]/minute");
      int m = data.intValue;

      // Reset triggeredToday if the stored schedule changed
      if (drawers[i].hour != h || drawers[i].minute != m) {
        drawers[i].triggeredToday = false;
      }
      drawers[i].hour   = h;
      drawers[i].minute = m;

      Serial.printf("[RTDB] drawer%d: %s %02d:%02d enabled=%d\n",
                    i + 1, drawers[i].medicine.c_str(), h, m, drawers[i].enabled);
    }
  }
}

// ============================================================================
// OLED display helper
// ============================================================================
void showOLED(const char* line1, const char* line2 = "") {
  oled.clearBuffer();
  oled.setFont(u8g2_font_6x10_tf);
  oled.drawStr(0, 12, line1);
  oled.setFont(u8g2_font_5x8_tf);
  oled.drawStr(0, 26, line2);
  oled.sendBuffer();
}

// ============================================================================
// Dispense routine
// ============================================================================
void dispense(int drawerIndex) {
  int drawerNum = drawerIndex + 1;
  String medName = drawers[drawerIndex].medicine;

  Serial.printf("[Dispense] Drawer %d: %s\n", drawerNum, medName.c_str());
  writeState("dispensing", drawerNum);

  // -- Open: rotate servo forward --
  servo.write(SERVO_FORWARD_PWM);
  delay(SERVO_OPEN_MS);
  servo.write(SERVO_STOP_PWM);

  // -- Alert: LED on --
  digitalWrite(PIN_LED, HIGH);
  showOLED(medName.c_str(), "Take medicine now");

  // -- Wait for acknowledgement: IR or button, up to ACK_TIMEOUT_MS --
  writeState("awaiting_ack", drawerNum);
  unsigned long start = millis();
  bool acknowledged = false;

  while (millis() - start < ACK_TIMEOUT_MS) {
    // IR sensor: LOW = object detected (drawer opened / medicine taken)
    if (digitalRead(PIN_IR) == LOW) {
      acknowledged = true;
      break;
    }
    // Button: LOW = pressed (INPUT_PULLUP)
    if (digitalRead(PIN_BUTTON) == LOW) {
      acknowledged = true;
      break;
    }
    delay(100);
  }

  // -- Close: rotate servo backward --
  servo.write(SERVO_BACKWARD_PWM);
  delay(SERVO_CLOSE_MS);
  servo.write(SERVO_STOP_PWM);

  // -- LED off --
  digitalWrite(PIN_LED, LOW);

  if (acknowledged) {
    Serial.println("[Dispense] Acknowledged");
    showOLED("Dose taken!", "");
    writeState("idle", drawerNum);
  } else {
    Serial.println("[Dispense] MISSED (timeout)");
    showOLED("MISSED DOSE", medName.c_str());
    writeState("missed", drawerNum);
  }

  drawers[drawerIndex].triggeredToday = true;
  delay(2000);
  showOLED("MEDIDOSE.OS", "Smart Dispenser");
}

// ============================================================================
// Midnight reset
// ============================================================================
void resetIfMidnight(struct tm& now) {
  static int lastDay = -1;
  if (lastDay != now.tm_mday) {
    lastDay = now.tm_mday;
    for (int i = 0; i < NUM_DRAWERS; i++) {
      drawers[i].triggeredToday = false;
    }
    Serial.println("[Reset] Daily trigger flags cleared");
  }
}

// ============================================================================
// setup()
// ============================================================================
void setup() {
  Serial.begin(115200);
  delay(500);

  // Pin setup
  servo.attach(PIN_SERVO);
  servo.write(SERVO_STOP_PWM);

  // PIN_IR is input-only (GPIO34); no explicit pinMode needed on most cores
  // but it is harmless to set it:
  pinMode(PIN_IR, INPUT);
  pinMode(PIN_LED, OUTPUT);
  digitalWrite(PIN_LED, LOW);
  pinMode(PIN_BUTTON, INPUT_PULLUP);

  // OLED
  Wire.begin(21, 22);
  oled.begin();
  oled.setFont(u8g2_font_6x10_tf);
  showOLED("MEDIDOSE.OS", "Booting...");

  connectWiFi();
  setupTime();
  setupFirebase();

  showOLED("MEDIDOSE.OS", "Ready");
  writeState("idle");

  Serial.println("[Setup] Complete");
}

// ============================================================================
// loop()
// ============================================================================
void loop() {
  unsigned long now_ms = millis();

  // Poll schedule
  if (now_ms - lastPoll >= POLL_INTERVAL_MS) {
    lastPoll = now_ms;
    pollSchedule();
  }

  // Heartbeat
  if (now_ms - lastHeartbeat >= HEARTBEAT_MS) {
    lastHeartbeat = now_ms;
    writeState("idle");
  }

  // Check time and trigger doses
  struct tm t;
  if (getLocalTime(&t)) {
    resetIfMidnight(t);
    for (int i = 0; i < NUM_DRAWERS; i++) {
      if (drawers[i].enabled &&
          !drawers[i].triggeredToday &&
          t.tm_hour == drawers[i].hour &&
          t.tm_min  == drawers[i].minute) {
        dispense(i);
      }
    }

    // Update OLED clock every second
    char timeBuf[16];
    snprintf(timeBuf, sizeof(timeBuf), "%02d:%02d:%02d", t.tm_hour, t.tm_min, t.tm_sec);
    showOLED("MEDIDOSE.OS", timeBuf);
  }

  delay(1000);
}
