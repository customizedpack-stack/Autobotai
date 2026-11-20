// AutoBotAI Explorer Bot firmware for the ESP32-DevKitC V4 (Arduino framework).
//
// Hardware glue only: serial lines in and out, TB6612FNG pins, VL53L0X over I2C,
// the task watchdog and the optional local emergency-stop button.
// All protocol and safety decisions are made by abot::RobotCore (lib/robot_core),
// which is unit-tested on a PC (test/host).
//
// STATUS: this file was written for the ESP32 Arduino core (2.x and 3.x) and the
// Pololu VL53L0X library, but it has NOT been compiled or run on a device in the
// AutoBotAI build environment (the ESP32 toolchain was not available there).
// Build it with PlatformIO (see platformio.ini) and test it with the wheels off
// the ground before any use. See docs/hardware/ESP32-FIRMWARE-SETUP.md.
#include <Arduino.h>
#include <Wire.h>
#include <VL53L0X.h>
#include <esp_system.h>
#include <esp_task_wdt.h>
#include <string.h>

#include "robot_core.h"

// ── Pin map (must match docs/hardware/EXPLORER-BOT-REFERENCE-HARDWARE.md) ──
// Chosen to avoid the ESP32 strapping pins (0, 2, 5, 12, 15), the input-only pins (34–39),
// the flash pins (6–11) and the USB-UART pins (1, 3). Check them against your module.
constexpr int PIN_PWMA = 26;
constexpr int PIN_AIN1 = 27;
constexpr int PIN_AIN2 = 4;
constexpr int PIN_PWMB = 32;
constexpr int PIN_BIN1 = 33;
constexpr int PIN_BIN2 = 25;
constexpr int PIN_STBY = 23;   // LOW = driver standby (motors disabled). Add a 10 kΩ pull-down to GND.
constexpr int PIN_SDA = 21;
constexpr int PIN_SCL = 22;
constexpr int PIN_ESTOP = 18;  // optional local stop button to GND (INPUT_PULLUP, active LOW)

constexpr uint32_t PWM_FREQ_HZ = 20000;  // TB6612FNG accepts up to 100 kHz
constexpr uint8_t PWM_BITS = 10;
constexpr uint32_t WDT_TIMEOUT_S = 2;

static VL53L0X tof;
static bool tofReady = false;
static uint32_t lastTofPoll = 0;

static void writeLine(void*, const char* line) {
  Serial.print(line);
  Serial.print('\n');
}

static abot::RobotCore core(&writeLine, nullptr);

static void pwmSetup(int pin) {
#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
  ledcAttach(pin, PWM_FREQ_HZ, PWM_BITS);
#else
  static int channel = 0;
  ledcSetup(channel, PWM_FREQ_HZ, PWM_BITS);
  ledcAttachPin(pin, channel);
  ++channel;
#endif
}

static void pwmWrite(int pin, int channel, uint32_t duty) {
#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
  (void)channel;
  ledcWrite(pin, duty);
#else
  (void)pin;
  ledcWrite(channel, duty);
#endif
}

static void applyMotor(int pinIn1, int pinIn2, int pinPwm, int channel, int permille) {
  uint32_t duty = static_cast<uint32_t>(abs(permille)) * ((1u << PWM_BITS) - 1) / 1000u;
  if (permille > 0) {
    digitalWrite(pinIn1, HIGH);
    digitalWrite(pinIn2, LOW);
  } else if (permille < 0) {
    digitalWrite(pinIn1, LOW);
    digitalWrite(pinIn2, HIGH);
  } else {
    // Short brake with zero duty: both inputs LOW = stop (coast) on the TB6612FNG.
    digitalWrite(pinIn1, LOW);
    digitalWrite(pinIn2, LOW);
    duty = 0;
  }
  pwmWrite(pinPwm, channel, duty);
}

static void applyOutputs() {
  abot::Outputs o = core.outputs();
  if (!o.enabled) {
    // Hardware-level disable first, then zero the bridges.
    digitalWrite(PIN_STBY, LOW);
    applyMotor(PIN_AIN1, PIN_AIN2, PIN_PWMA, 0, 0);
    applyMotor(PIN_BIN1, PIN_BIN2, PIN_PWMB, 1, 0);
    return;
  }
  applyMotor(PIN_AIN1, PIN_AIN2, PIN_PWMA, 0, o.left);
  applyMotor(PIN_BIN1, PIN_BIN2, PIN_PWMB, 1, o.right);
  digitalWrite(PIN_STBY, HIGH);
}

static abot::ResetReason resetReason() {
  esp_reset_reason_t r = esp_reset_reason();
  if (r == ESP_RST_TASK_WDT || r == ESP_RST_INT_WDT || r == ESP_RST_WDT) return abot::ResetReason::Watchdog;
  if (r == ESP_RST_POWERON) return abot::ResetReason::PowerOn;
  return abot::ResetReason::Other;
}

static void watchdogSetup() {
#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
  esp_task_wdt_config_t cfg = {};
  cfg.timeout_ms = WDT_TIMEOUT_S * 1000;
  cfg.idle_core_mask = 0;
  cfg.trigger_panic = true;
  esp_task_wdt_reconfigure(&cfg);
#else
  esp_task_wdt_init(WDT_TIMEOUT_S, true);
#endif
  esp_task_wdt_add(nullptr);
}

void setup() {
  // Safe boot: standby LOW before anything else, so the motors cannot move.
  pinMode(PIN_STBY, OUTPUT);
  digitalWrite(PIN_STBY, LOW);
  for (int pin : {PIN_AIN1, PIN_AIN2, PIN_BIN1, PIN_BIN2}) {
    pinMode(pin, OUTPUT);
    digitalWrite(pin, LOW);
  }
  pwmSetup(PIN_PWMA);
  pwmSetup(PIN_PWMB);
  pinMode(PIN_ESTOP, INPUT_PULLUP);

  Serial.begin(115200);
  Wire.begin(PIN_SDA, PIN_SCL);
  tof.setTimeout(100);
  tofReady = tof.init();
  if (tofReady) tof.startContinuous(50);

  core.begin(millis(), resetReason(), esp_random());
  if (!tofReady) Serial.print("SENSOR id=distance code=init_failed\n");
  applyOutputs();
  watchdogSetup();
}

static char rx[abot::MAX_LINE + 2];
static size_t rxLen = 0;
static bool rxOverflow = false;

static void readSerial(uint32_t now) {
  while (Serial.available() > 0) {
    int c = Serial.read();
    if (c < 0) break;
    if (c == '\r') continue;
    if (c == '\n') {
      if (rxOverflow) {
        static char tooLong[abot::MAX_LINE + 2];
        memset(tooLong, 'X', abot::MAX_LINE + 1);
        tooLong[abot::MAX_LINE + 1] = '\0';
        core.onLine(tooLong, now);  // the core reports ERR code=too_long
      }
      else {
        rx[rxLen] = '\0';
        core.onLine(rx, now);
      }
      rxLen = 0;
      rxOverflow = false;
      continue;
    }
    if (rxLen < abot::MAX_LINE + 1) rx[rxLen++] = static_cast<char>(c);
    else rxOverflow = true;
  }
}

static void pollDistance(uint32_t now) {
  if (!tofReady) {
    core.setDistance(0, abot::DistStatus::Error, now);
    return;
  }
  if (now - lastTofPoll < 50) return;
  lastTofPoll = now;
  uint16_t mm = tof.readRangeContinuousMillimeters();
  if (tof.timeoutOccurred()) core.setDistance(0, abot::DistStatus::Error, now);
  else if (mm >= 8190) core.setDistance(0, abot::DistStatus::OutOfRange, now);  // no target in range
  else core.setDistance(mm, abot::DistStatus::Ok, now);
}

void loop() {
  uint32_t now = millis();
  readSerial(now);
  if (digitalRead(PIN_ESTOP) == LOW) core.localEStop(now);
  pollDistance(now);
  core.tick(now);
  applyOutputs();
  esp_task_wdt_reset();
  delay(2);
}
