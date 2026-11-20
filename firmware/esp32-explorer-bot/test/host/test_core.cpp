// Host-side tests of the firmware core (no ESP32 needed).
// Runs every case in test/vectors/protocol-v1.txt plus a few direct checks.
// Build and run: npm run test:firmware  (g++ -std=c++17)
#include <cstdio>
#include <cstdlib>
#include <deque>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

#include "../../lib/robot_core/robot_core.h"

using abot::DistStatus;
using abot::ResetReason;
using abot::RobotCore;

struct Harness {
  std::deque<std::string> lines;  // device lines except TEL
  std::string lastTel;
  std::string session;
  static void write(void* ctx, const char* line) {
    auto* h = static_cast<Harness*>(ctx);
    std::string s(line);
    if (s.rfind("TEL ", 0) == 0) {
      h->lastTel = s;
      return;
    }
    if (s.rfind("HELLO_OK", 0) == 0) {
      auto p = s.find("session=");
      if (p != std::string::npos) h->session = s.substr(p + 8, 8);
    }
    h->lines.push_back(s);
  }
};

static int failures = 0;
static int checks = 0;

static void fail(const std::string& kase, int lineNo, const std::string& msg) {
  ++failures;
  std::fprintf(stderr, "  FAIL [%s] line %d: %s\n", kase.c_str(), lineNo, msg.c_str());
}

static std::vector<std::string> split(const std::string& s) {
  std::vector<std::string> out;
  std::istringstream in(s);
  std::string t;
  while (in >> t) out.push_back(t);
  return out;
}

static bool hasToken(const std::string& line, const std::string& token) {
  for (auto& t : split(line))
    if (t == token) return true;
  return false;
}

static std::string stateName(abot::State s) {
  switch (s) {
    case abot::State::Idle: return "idle";
    case abot::State::Connected: return "connected";
    case abot::State::Armed: return "armed";
    case abot::State::Fault: return "fault";
    case abot::State::EStop: return "estop";
  }
  return "?";
}

static int runVectors(const char* path) {
  std::ifstream file(path);
  if (!file) {
    std::fprintf(stderr, "Cannot open %s\n", path);
    return 1;
  }
  Harness h;
  RobotCore* core = nullptr;
  uint32_t now = 0;
  std::string kase = "(none)";
  int cases = 0;
  std::string raw;
  int lineNo = 0;
  while (std::getline(file, raw)) {
    ++lineNo;
    if (raw.empty() || raw[0] == '#') continue;
    if (raw.rfind("=== ", 0) == 0) {
      delete core;
      h = Harness();
      core = new RobotCore(&Harness::write, &h);
      kase = raw.substr(4);
      now = 0;
      ++cases;
      continue;
    }
    if (!core) continue;
    auto tok = split(raw);
    const std::string& op = tok[0];
    std::string rest = raw.size() > op.size() + 1 ? raw.substr(op.size() + 1) : "";
    ++checks;
    if (op == "BOOT") {
      now = static_cast<uint32_t>(std::stoul(tok[1]));
      ResetReason r = tok[2] == "watchdog" ? ResetReason::Watchdog : tok[2] == "poweron" ? ResetReason::PowerOn : ResetReason::Other;
      core->begin(now, r, static_cast<uint32_t>(std::stoul(tok[3])));
    } else if (op == "@") {
      now = static_cast<uint32_t>(std::stoul(tok[1]));
      core->tick(now);
    } else if (op == "~" || op == "~p") {
      uint32_t to = static_cast<uint32_t>(std::stoul(tok[1]));
      uint32_t step = static_cast<uint32_t>(std::stoul(tok[2]));
      int n = 1000;
      while (now + step <= to) {
        now += step;
        if (op == "~p") {
          core->onLine(("PING " + std::to_string(n++)).c_str(), now);
          if (!h.lines.empty() && h.lines.back().rfind("PONG", 0) == 0) h.lines.pop_back();
        }
        core->tick(now);
      }
    } else if (op == ">") {
      std::string line = rest;
      auto p = line.find("$S");
      if (p != std::string::npos) line.replace(p, 2, h.session);
      core->onLine(line.c_str(), now);
    } else if (op == "<") {
      if (h.lines.empty()) fail(kase, lineNo, "expected \"" + rest + "\" but no line was sent");
      else {
        std::string got = h.lines.front();
        h.lines.pop_front();
        if (got.rfind(rest, 0) != 0) fail(kase, lineNo, "expected prefix \"" + rest + "\", got \"" + got + "\"");
      }
    } else if (op == "<!") {
      if (!h.lines.empty()) fail(kase, lineNo, "unexpected line \"" + h.lines.front() + "\"");
    } else if (op == "CLEAR") {
      h.lines.clear();
    } else if (op == "D") {
      DistStatus st = tok[2] == "ok" ? DistStatus::Ok : tok[2] == "range" ? DistStatus::OutOfRange : tok[2] == "err" ? DistStatus::Error : DistStatus::None;
      core->setDistance(std::stoi(tok[1]), st, now);
    } else if (op == "?") {
      auto o = core->outputs();
      for (size_t i = 1; i < tok.size(); ++i) {
        auto eq = tok[i].find('=');
        std::string k = tok[i].substr(0, eq), v = tok[i].substr(eq + 1);
        std::string actual = k == "st" ? stateName(core->state()) : k == "en" ? std::to_string(o.enabled ? 1 : 0) : k == "l" ? std::to_string(o.left) : k == "r" ? std::to_string(o.right) : "?";
        if (actual != v) fail(kase, lineNo, k + " expected " + v + ", got " + actual);
      }
    } else if (op == "T") {
      for (size_t i = 1; i < tok.size(); ++i)
        if (!hasToken(h.lastTel, tok[i])) fail(kase, lineNo, "telemetry \"" + h.lastTel + "\" lacks " + tok[i]);
    } else {
      fail(kase, lineNo, "unknown vector instruction " + op);
    }
  }
  delete core;
  std::printf("  %d vector cases, %d instructions\n", cases, checks);
  return 0;
}

// Direct checks that are easier to write in code than as vectors.
static void directChecks() {
  Harness h;
  RobotCore core(&Harness::write, &h);
  core.begin(0, ResetReason::PowerOn, 42);
  // Overlong and binary input are rejected without changing state.
  std::string longLine(121, 'A');
  core.onLine(longLine.c_str(), 0);
  ++checks;
  if (h.lines.back() != "ERR code=too_long") fail("direct", 0, "too_long not reported: " + h.lines.back());
  core.onLine("HELLO\x01 1", 0);
  ++checks;
  if (h.lines.back() != "ERR code=bad_chars") fail("direct", 0, "bad_chars not reported: " + h.lines.back());
  // Session ids differ between handshakes.
  core.onLine("HELLO 1", 0);
  std::string s1 = h.session;
  core.onLine("HELLO 1", 0);
  ++checks;
  if (s1 == h.session || s1.size() != 8) fail("direct", 0, "session id did not change");
  // millis() wrap-around: the heartbeat still works across 2^32.
  RobotCore wrap(&Harness::write, &h);
  wrap.begin(0xFFFFFF00u, ResetReason::PowerOn, 7);
  wrap.onLine("HELLO 1", 0xFFFFFF00u);
  wrap.onLine(("ARM " + h.session).c_str(), 0xFFFFFF00u);
  wrap.tick(0xFFFFFF00u + 500u);  // wraps past zero
  ++checks;
  if (wrap.state() != abot::State::Armed) fail("direct", 0, "heartbeat fired early across wrap-around");
  wrap.tick(0xFFFFFF00u + 1200u);
  ++checks;
  if (wrap.state() != abot::State::Fault || wrap.outputs().enabled) fail("direct", 0, "heartbeat did not fire across wrap-around");
  // Local emergency-stop button: immediate, latched, reported once.
  RobotCore btn(&Harness::write, &h);
  btn.begin(0, ResetReason::PowerOn, 9);
  btn.onLine("HELLO 1", 0);
  btn.onLine(("ARM " + h.session).c_str(), 0);
  btn.onLine("DRIVE 1 200 200 500", 0);
  btn.tick(100);
  btn.localEStop(100);
  ++checks;
  if (btn.state() != abot::State::EStop || btn.outputs().enabled || btn.outputs().left != 0) fail("direct", 0, "local e-stop did not disable the motors");
  ++checks;
  if (h.lines.back() != "ESTOP_ACTIVE source=button") fail("direct", 0, "local e-stop not reported: " + h.lines.back());
}

int main(int argc, char** argv) {
  const char* path = argc > 1 ? argv[1] : "test/vectors/protocol-v1.txt";
  std::printf("Firmware core host tests\n");
  if (runVectors(path) != 0) return 1;
  directChecks();
  if (failures > 0) {
    std::printf("FAILED: %d of %d checks\n", failures, checks);
    return 1;
  }
  std::printf("PASSED: %d checks\n", checks);
  return 0;
}
