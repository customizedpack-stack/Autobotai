#include "robot_core.h"

#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

namespace abot {

namespace {

constexpr int MAX_TOKENS = 8;

int splitTokens(char* buf, char* tokens[], int max) {
  int n = 0;
  char* p = buf;
  while (*p) {
    while (*p == ' ') ++p;
    if (!*p) break;
    if (n == max) return -1;  // too many tokens
    tokens[n++] = p;
    while (*p && *p != ' ') ++p;
    if (*p) *p++ = '\0';
  }
  return n;
}

bool isHex8(const char* s) {
  if (strlen(s) != 8) return false;
  for (int i = 0; i < 8; ++i) {
    char c = s[i];
    bool ok = (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f');
    if (!ok) return false;
  }
  return true;
}

const char* distName(DistStatus s) {
  switch (s) {
    case DistStatus::Ok: return "ok";
    case DistStatus::OutOfRange: return "range";
    case DistStatus::Error: return "err";
    default: return "none";
  }
}

// Signed difference that survives millis() wrap-around.
inline int32_t since(uint32_t now, uint32_t then) { return static_cast<int32_t>(now - then); }

}  // namespace

RobotCore::RobotCore(Writer writer, void* ctx) : writer_(writer), ctx_(ctx) {}

const char* RobotCore::stateName() const {
  switch (state_) {
    case State::Idle: return "idle";
    case State::Connected: return "connected";
    case State::Armed: return "armed";
    case State::Fault: return "fault";
    case State::EStop: return "estop";
  }
  return "?";
}

void RobotCore::send(const char* line) {
  if (writer_) writer_(ctx_, line);
}

void RobotCore::sendf(const char* fmt, ...) {
  char buf[200];
  va_list ap;
  va_start(ap, fmt);
  vsnprintf(buf, sizeof(buf), fmt, ap);
  va_end(ap);
  send(buf);
}

void RobotCore::err(const char* code, long seq) {
  if (seq >= 0) sendf("ERR seq=%ld code=%s", seq, code);
  else sendf("ERR code=%s", code);
}

void RobotCore::stopNow() {
  targetLeft_ = targetRight_ = 0;
  curLeft_ = curRight_ = 0;
  out_.left = out_.right = 0;
  leaseActive_ = false;
}

void RobotCore::disableNow() {
  stopNow();
  out_.enabled = false;
}

void RobotCore::enterFault(const char* code) {
  disableNow();
  state_ = State::Fault;
  strncpy(fault_, code, sizeof(fault_) - 1);
  fault_[sizeof(fault_) - 1] = '\0';
  sendf("FAULT code=%s", fault_);
}

bool RobotCore::parseInt(const char* s, long lo, long hi, long* out) const {
  if (!s || !*s) return false;
  const char* p = s;
  if (*p == '-') ++p;
  if (!*p) return false;
  for (const char* q = p; *q; ++q)
    if (*q < '0' || *q > '9') return false;
  if (strlen(p) > 10) return false;
  long v = strtol(s, nullptr, 10);
  if (v < lo || v > hi) return false;
  *out = v;
  return true;
}

int RobotCore::clampPermille(long v) const {
  long m = cfg_.maxPermille;
  if (v > m) return static_cast<int>(m);
  if (v < -m) return static_cast<int>(-m);
  return static_cast<int>(v);
}

void RobotCore::begin(uint32_t now, ResetReason reason, uint32_t seed) {
  // Safe boot: driver in standby, no motion, no session.
  disableNow();
  state_ = State::Idle;
  session_ = 0;
  seed_ = seed ? seed : 0x9e3779b9u;
  program_[0] = '\0';
  fault_[0] = '\0';
  lastRx_ = lastTick_ = lastTelemetry_ = now;
  const char* r = reason == ResetReason::Watchdog ? "watchdog" : reason == ResetReason::PowerOn ? "poweron" : "other";
  sendf("BOOT fw=%s proto=%d reset=%s", FIRMWARE_VERSION, PROTOCOL_VERSION, r);
  // A watchdog reset means the firmware hung: start latched in FAULT, motors disabled.
  if (reason == ResetReason::Watchdog) enterFault("watchdog_reset");
}

void RobotCore::localEStop(uint32_t now) {
  (void)now;
  if (state_ == State::EStop) return;
  disableNow();
  state_ = State::EStop;
  send("ESTOP_ACTIVE source=button");
}

void RobotCore::setDistance(int mm, DistStatus status, uint32_t now) {
  distMm_ = status == DistStatus::Ok ? mm : -1;
  distStatus_ = status;
  distAt_ = now;
}

void RobotCore::onLine(const char* raw, uint32_t now) {
  size_t len = strlen(raw);
  if (len == 0) return;
  if (len > static_cast<size_t>(MAX_LINE)) return err("too_long");
  for (size_t i = 0; i < len; ++i) {
    unsigned char c = static_cast<unsigned char>(raw[i]);
    if (c < 0x20 || c > 0x7e) return err("bad_chars");
  }
  char buf[MAX_LINE + 1];
  memcpy(buf, raw, len + 1);
  char* t[MAX_TOKENS];
  int n = splitTokens(buf, t, MAX_TOKENS);
  if (n <= 0) return err("bad_format");
  const char* cmd = t[0];

  if (strcmp(cmd, "HELLO") == 0) {
    long proto = 0;
    if (n != 2 || !parseInt(t[1], 0, 1000, &proto)) return err("bad_format");
    if (proto != PROTOCOL_VERSION) return err("proto_unsupported");
    lastRx_ = now;
    if (state_ == State::Armed) {  // a new session never inherits an armed state
      disableNow();
      state_ = State::Connected;
    }
    if (state_ == State::Idle) state_ = State::Connected;
    seed_ ^= seed_ << 13;
    seed_ ^= seed_ >> 17;
    seed_ ^= seed_ << 5;
    session_ = seed_ ? seed_ : 1;
    sendf("HELLO_OK proto=%d fw=%s device=%s board=%s session=%08lx state=%s caps=drive,distance enc=0 maxdrivems=%lu hbms=%lu fault=%s",
          PROTOCOL_VERSION, FIRMWARE_VERSION, DEVICE_NAME, BOARD_NAME, static_cast<unsigned long>(session_), stateName(),
          static_cast<unsigned long>(MAX_DRIVE_MS), static_cast<unsigned long>(HEARTBEAT_TIMEOUT_MS), fault_[0] ? fault_ : "-");
    return;
  }

  // ESTOP is accepted in every state, even before a session exists.
  if (strcmp(cmd, "ESTOP") == 0) {
    if (n != 1) return err("bad_format");
    lastRx_ = now;
    disableNow();
    state_ = State::EStop;
    send("ESTOP_ACTIVE");
    return;
  }

  if (session_ == 0) return err("no_session");

  if (strcmp(cmd, "PING") == 0) {
    long seq = 0;
    if (n != 2 || !parseInt(t[1], 0, 999999999L, &seq)) return err("bad_format");
    lastRx_ = now;
    sendf("PONG %ld", seq);
    return;
  }

  if (strcmp(cmd, "STATUS") == 0) {
    lastRx_ = now;
    sendf("STATUS st=%s en=%d fault=%s prog=%s max=%d", stateName(), out_.enabled ? 1 : 0, fault_[0] ? fault_ : "-", program_[0] ? program_ : "-", cfg_.maxPermille);
    return;
  }

  if (strcmp(cmd, "STOP") == 0) {
    if (n != 1) return err("bad_format");
    lastRx_ = now;
    stopNow();
    send("STOPPED");
    return;
  }

  if (strcmp(cmd, "DISARM") == 0) {
    if (n != 1) return err("bad_format");
    lastRx_ = now;
    if (state_ != State::Armed) return err("not_armed");
    disableNow();
    state_ = State::Connected;
    send("DISARMED");
    return;
  }

  if (strcmp(cmd, "DRIVE") == 0) {
    long seq = -1, l = 0, r = 0, ms = 0;
    if (n != 5 || !parseInt(t[1], 0, 999999999L, &seq)) return err("bad_format");
    lastRx_ = now;
    if (state_ != State::Armed) return err("not_armed", seq);
    if (!parseInt(t[2], -MAX_PERMILLE, MAX_PERMILLE, &l) || !parseInt(t[3], -MAX_PERMILLE, MAX_PERMILLE, &r) ||
        !parseInt(t[4], 1, static_cast<long>(MAX_DRIVE_MS), &ms))
      return err("range", seq);
    targetLeft_ = clampPermille(l);
    targetRight_ = clampPermille(r);
    leaseUntil_ = now + static_cast<uint32_t>(ms);
    leaseActive_ = true;
    sendf("ACK %ld", seq);
    return;
  }

  if (strcmp(cmd, "ARM") == 0) {
    if (n != 2) return err("bad_format");
    lastRx_ = now;
    if (state_ == State::EStop) return err("estop_active");
    if (state_ == State::Fault) return err("fault_active");
    if (state_ == State::Armed) return err("already_armed");
    char expect[9];
    snprintf(expect, sizeof(expect), "%08lx", static_cast<unsigned long>(session_));
    if (strcmp(t[1], expect) != 0) return err("bad_session");
    stopNow();
    out_.enabled = true;  // driver out of standby, still at zero speed
    state_ = State::Armed;
    send("ARMED");
    return;
  }

  if (strcmp(cmd, "RESET_ESTOP") == 0) {
    if (n != 1) return err("bad_format");
    lastRx_ = now;
    if (state_ != State::EStop) return err("not_in_estop");
    state_ = State::Connected;  // disarmed: motion needs a new ARM
    send("ESTOP_CLEARED");
    return;
  }

  if (strcmp(cmd, "CLEAR_FAULT") == 0) {
    if (n != 1) return err("bad_format");
    lastRx_ = now;
    if (state_ != State::Fault) return err("no_fault");
    fault_[0] = '\0';
    state_ = State::Connected;  // disarmed: motion needs a new ARM
    send("FAULT_CLEARED");
    return;
  }

  if (strcmp(cmd, "CONFIG") == 0) {
    lastRx_ = now;
    if (state_ == State::Armed) return err("not_allowed_while_armed");
    Config next = cfg_;
    if (n < 2) return err("bad_config");
    for (int i = 1; i < n; ++i) {
      char* eq = strchr(t[i], '=');
      if (!eq) return err("bad_config");
      *eq = '\0';
      const char* key = t[i];
      long v = 0;
      if (strcmp(key, "max") == 0 && parseInt(eq + 1, 0, MAX_PERMILLE, &v)) next.maxPermille = static_cast<int>(v);
      else if (strcmp(key, "accel") == 0 && parseInt(eq + 1, 100, 10000, &v)) next.accelPermillePerS = static_cast<int>(v);
      else if (strcmp(key, "invl") == 0 && parseInt(eq + 1, 0, 1, &v)) next.invertLeft = v == 1;
      else if (strcmp(key, "invr") == 0 && parseInt(eq + 1, 0, 1, &v)) next.invertRight = v == 1;
      else if (strcmp(key, "hz") == 0 && parseInt(eq + 1, 1, 20, &v)) next.telemetryHz = static_cast<int>(v);
      else return err("bad_config");
    }
    cfg_ = next;
    sendf("CONFIG_OK max=%d accel=%d invl=%d invr=%d hz=%d", cfg_.maxPermille, cfg_.accelPermillePerS, cfg_.invertLeft ? 1 : 0, cfg_.invertRight ? 1 : 0,
          cfg_.telemetryHz);
    return;
  }

  if (strcmp(cmd, "PROGRAM") == 0) {
    if (n != 2) return err("bad_format");
    lastRx_ = now;
    if (state_ == State::Armed) return err("not_allowed_while_armed");
    if (strcmp(t[1], "clear") == 0) {
      program_[0] = '\0';
      send("PROGRAM_OK hash=-");
      return;
    }
    if (!isHex8(t[1])) return err("bad_format");
    memcpy(program_, t[1], 9);
    sendf("PROGRAM_OK hash=%s", program_);
    return;
  }

  err("unknown_command");
}

void RobotCore::tick(uint32_t now) {
  int32_t dt = since(now, lastTick_);
  if (dt < 0) dt = 0;
  lastTick_ = now;

  // Heartbeat: an armed robot that stops hearing from the host stops and latches a fault.
  if ((state_ == State::Armed || state_ == State::Connected) && since(now, lastRx_) > static_cast<int32_t>(HEARTBEAT_TIMEOUT_MS)) {
    if (state_ == State::Armed) {
      enterFault("heartbeat_timeout");
    } else {
      state_ = State::Idle;
      session_ = 0;
      send("LINK_LOST");
    }
  }

  // Command lease: no renewed DRIVE in time -> stop at once (not a fault).
  if (state_ == State::Armed && leaseActive_ && since(now, leaseUntil_) >= 0) {
    stopNow();
    send("LEASE_EXPIRED");
  }

  // Ramp toward the targets (controlled acceleration and deceleration).
  if (state_ == State::Armed) {
    long step = static_cast<long>(cfg_.accelPermillePerS) * dt / 1000;
    if (step < 1 && dt > 0) step = 1;
    auto approach = [step](int cur, int target) {
      if (cur < target) return static_cast<int>(cur + step > target ? target : cur + step);
      if (cur > target) return static_cast<int>(cur - step < target ? target : cur - step);
      return cur;
    };
    curLeft_ = approach(curLeft_, targetLeft_);
    curRight_ = approach(curRight_, targetRight_);
    out_.left = cfg_.invertLeft ? -curLeft_ : curLeft_;
    out_.right = cfg_.invertRight ? -curRight_ : curRight_;
  } else {
    curLeft_ = curRight_ = 0;
    out_.left = out_.right = 0;
    out_.enabled = false;
  }

  // Telemetry while a host session exists (or a latched state must be visible).
  int period = 1000 / (cfg_.telemetryHz > 0 ? cfg_.telemetryHz : 1);
  if (state_ != State::Idle && since(now, lastTelemetry_) >= period) {
    lastTelemetry_ = now;
    DistStatus ds = distStatus_;
    if (ds == DistStatus::Ok && since(now, distAt_) > 500) ds = DistStatus::Error;  // stale sample
    sendf("TEL t=%lu st=%s en=%d l=%d r=%d tl=%d tr=%d d=%d ds=%s prog=%s", static_cast<unsigned long>(now), stateName(), out_.enabled ? 1 : 0, out_.left,
          out_.right, targetLeft_, targetRight_, ds == DistStatus::Ok ? distMm_ : -1, distName(ds), program_[0] ? program_ : "-");
  }
}

}  // namespace abot
