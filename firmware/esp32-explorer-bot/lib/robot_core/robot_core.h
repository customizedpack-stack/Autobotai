// AutoBotAI Explorer Bot firmware — portable safety and protocol core.
//
// This file has NO Arduino or ESP-IDF dependency, so the same logic is compiled
// for the ESP32 (src/main.cpp) and for the host unit tests (test/host).
//
// Protocol v1: ASCII lines terminated by '\n', at most 120 characters.
// The host may only use the commands in the allowlist below. There is no
// command that runs code, reads or writes arbitrary GPIO, or changes pins.
//
// Safety rules implemented here:
//  - Safe boot: motors disabled (driver standby), state IDLE, nothing moves.
//  - Motion needs: HELLO (session) -> ARM <session> -> DRIVE commands.
//  - Every DRIVE has a lease (max 500 ms). When it runs out, the motors stop.
//  - Heartbeat: if nothing is received for HEARTBEAT_TIMEOUT_MS while armed,
//    the motors stop and the core enters FAULT (latched; needs CLEAR_FAULT, then ARM).
//  - ESTOP is latched: motors disabled until RESET_ESTOP, then ARM again.
//  - A watchdog reset (reported by the platform at boot) starts in FAULT.
//  - Nothing ever re-arms or resumes motion by itself.
#pragma once
#include <stdint.h>

namespace abot {

constexpr int PROTOCOL_VERSION = 1;
constexpr const char* FIRMWARE_VERSION = "0.1.0";
constexpr const char* DEVICE_NAME = "explorer-bot-esp32";
constexpr const char* BOARD_NAME = "esp32-devkitc-v4";
constexpr int MAX_LINE = 120;
constexpr int MAX_PERMILLE = 1000;
constexpr uint32_t MAX_DRIVE_MS = 500;
constexpr uint32_t HEARTBEAT_TIMEOUT_MS = 1000;

enum class State : uint8_t { Idle, Connected, Armed, Fault, EStop };
enum class DistStatus : uint8_t { None, Ok, OutOfRange, Error };
enum class ResetReason : uint8_t { PowerOn, Watchdog, Other };

struct Config {
  int maxPermille = 300;        // speed limit (0..1000), default 30 %
  int accelPermillePerS = 1500; // ramp rate for normal speed changes
  bool invertLeft = false;
  bool invertRight = false;
  int telemetryHz = 10;         // 1..20
};

struct Outputs {
  bool enabled;  // false = driver in standby (hardware-level motor disable)
  int left;      // signed duty, permille, after limits, ramp and inversion
  int right;
};

class RobotCore {
 public:
  using Writer = void (*)(void* ctx, const char* line);

  RobotCore(Writer writer, void* ctx);

  /** Safe boot. `seed` makes session ids unpredictable on the device (deterministic in tests). */
  void begin(uint32_t now, ResetReason reason, uint32_t seed);
  /** One complete line from the host (without the newline). */
  void onLine(const char* line, uint32_t now);
  /** Call often (every few ms): ramps, leases, heartbeat and telemetry. */
  void tick(uint32_t now);
  /** Local emergency-stop input (button on the robot): same effect as the ESTOP command. */
  void localEStop(uint32_t now);
  /** Latest distance sample from the sensor driver. */
  void setDistance(int mm, DistStatus status, uint32_t now);

  Outputs outputs() const { return out_; }
  State state() const { return state_; }
  const Config& config() const { return cfg_; }
  const char* stateName() const;

 private:
  void send(const char* line);
  void sendf(const char* fmt, ...);
  void err(const char* code, long seq = -1);
  void stopNow();
  void disableNow();
  void enterFault(const char* code);
  bool parseInt(const char* s, long lo, long hi, long* out) const;
  int clampPermille(long v) const;

  Writer writer_;
  void* ctx_;
  State state_ = State::Idle;
  Config cfg_;
  Outputs out_ = {false, 0, 0};
  int targetLeft_ = 0;
  int curLeft_ = 0;
  int curRight_ = 0;
  int targetRight_ = 0;
  uint32_t leaseUntil_ = 0;
  bool leaseActive_ = false;
  uint32_t lastRx_ = 0;
  uint32_t lastTick_ = 0;
  uint32_t lastTelemetry_ = 0;
  uint32_t session_ = 0;
  uint32_t seed_ = 0;
  char program_[9] = {0};
  char fault_[32] = {0};
  int distMm_ = -1;
  DistStatus distStatus_ = DistStatus::None;
  uint32_t distAt_ = 0;
};

}  // namespace abot
