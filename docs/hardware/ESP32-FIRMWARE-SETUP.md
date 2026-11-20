# ESP32 firmware setup (Explorer Bot)

The firmware is in `firmware/esp32-explorer-bot/`. It turns the ESP32 into a small, fixed command interpreter for the Explorer Bot reference hardware. It does **not** run your JavaScript, Python or Blockly programs. Those keep running in the browser, which sends short, expiring motion commands.

> **Status:** the protocol and safety core (`lib/robot_core`) is tested on a PC with `npm run test:firmware`. The Arduino glue (`src/main.cpp`) has **not** been compiled or run on an ESP32 by AutoBotAI, because the ESP32 toolchain could not be installed in the build environment. Build it yourself, read any compiler warnings, and test with the wheels off the ground.

## 1. Install the tools

1. Install [Visual Studio Code](https://code.visualstudio.com/).
2. In VS Code, open **Extensions** and install **PlatformIO IDE**.
3. Install the USB-to-UART driver for your DevKitC if your computer does not see the board (DevKitC V4 boards use a Silicon Labs CP210x or a similar bridge; check the chip on your board).

## 2. Open and build

1. In VS Code: **File → Open Folder** → `firmware/esp32-explorer-bot`.
2. PlatformIO reads `platformio.ini` (environment `esp32dev`, Arduino framework, library `pololu/VL53L0X@^1.3.1`) and downloads what it needs the first time.
3. Click the **✓ Build** button in the PlatformIO toolbar (or run `pio run -e esp32dev`).

## 3. Upload

1. **Switch the motor power OFF.**
2. Connect the DevKitC with USB.
3. Click **→ Upload** (or `pio run -e esp32dev -t upload`). If the upload does not start, hold the board's BOOT button while it connects.
4. Close any serial monitor before you connect from AutoBotAI: only one program can use the port.

## 4. First check without AutoBotAI (optional)

Open the serial monitor at 115200 baud (`pio device monitor -b 115200`). After a reset you should see a line starting with `BOOT`. Type `HELLO 1` and press Enter: the reply starts with `HELLO_OK proto=1 fw=0.1.0 device=explorer-bot-esp32 board=esp32-devkitc-v4`. The motors stay disabled. Close the monitor afterwards.

## 5. Connect from AutoBotAI

1. Use Chrome or Edge on a computer (Web Serial is not available in Firefox, Safari or on phones).
2. Open the robot → **Blueprint → Hardware**, finish the validation, then choose **USB serial (Web Serial)** and click **Connect**.
3. Pick the board's port in the browser's dialog. The app shows **Connected** only after the firmware handshake.

## What the firmware accepts (protocol v1)

One text line per command, 115200 baud, newline-terminated, at most 120 characters. Anything else is rejected with `ERR code=...`.

Every command except `HELLO` and `ESTOP` is refused until a `HELLO` has opened a session, and `ARM` must repeat the current session number, so a stale or second program cannot arm the robot.

| Command | Purpose |
|---|---|
| `HELLO 1` | Identify the firmware and open a session (new session number each time) |
| `PING <seq>` | Heartbeat. The browser sends it every 250 ms |
| `STATUS` | Report the state |
| `ARM <session>` | Enable the motors (refused in fault or emergency stop, or with the wrong session) |
| `DISARM` / `STOP` | Disable / stop the motors |
| `DRIVE <seq> <left> <right> <ms>` | Motor duty in per-mille (−1000…1000) for at most 500 ms (a lease) |
| `ESTOP` | Latched emergency stop, accepted in any state |
| `RESET_ESTOP` / `CLEAR_FAULT` | Explicit recovery; the robot stays disarmed |
| `CONFIG max=… accel=… invl=… invr=… hz=…` | Speed limit, acceleration, motor inversion, telemetry rate (refused while armed) |
| `PROGRAM <hash>` / `PROGRAM clear` | Records which prepared program is deployed (an 8-digit hash, not code) |

There is no command for arbitrary GPIO, memory, Wi-Fi, file or code access.

## Safety behavior in the firmware

- Boot: STBY is driven LOW first, PWM at 0, state `idle`. The motors are never enabled at boot.
- Arming is always an explicit command from the user's click.
- Each `DRIVE` is a lease of at most 500 ms. If no new command arrives, the motors stop (`LEASE_EXPIRED`).
- No `PING` for 1 s → the motors stop and a **fault** is latched (`heartbeat_timeout`). It never resumes by itself; the user must clear the fault and arm again.
- Task watchdog (2 s). A watchdog reset boots into a latched `watchdog_reset` fault.
- Emergency stop (from the app or the optional button on GPIO18) is latched until `RESET_ESTOP`.
- Acceleration is ramped and the speed limit is enforced in the firmware, not only in the browser.

## Host tests (no board needed)

From the repository root: `npm run test:firmware`. It compiles `lib/robot_core` with g++ and runs the shared protocol vectors (`test/vectors/protocol-v1.txt`, also run by the browser's TypeScript copy of the core) plus extra safety checks.
