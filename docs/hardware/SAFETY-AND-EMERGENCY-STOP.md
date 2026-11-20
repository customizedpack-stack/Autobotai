# Safety and emergency stop

AutoBotAI's safety features reduce risk; they do **not** make the robot safe on their own. AutoBotAI is **not** certified to any safety standard, and the software emergency stop is not a certified emergency-stop device. A small hobby robot can still pinch fingers, fall off a table, or overheat a driver or battery.

## Before every session

1. Read the warnings in **Blueprint → Hardware → Validation**. Blockers must be fixed. Each warning must be read and accepted.
2. Lift the wheels off the ground for the first tests, or use a clear floor area away from edges and stairs.
3. Keep your hands away from the wheels and keep the **motor-power switch** within reach.
4. Tick **"The robot is safely positioned…"** only when it is true.

## Layers of protection

| Layer | Where | What it does |
|---|---|---|
| Motor-power switch | On the robot (hardware) | Cuts motor power without any software. **This is the real last resort.** |
| Emergency stop | Top bar (every mode) and the optional button on GPIO18 | Firmware disables the driver (STBY LOW, PWM 0) and latches. Cleared only by **Reset emergency stop**; the robot stays disarmed |
| Arming interlock | App + firmware | Motors can only be enabled after validation, a supported device, no fault or e-stop, and the user's explicit confirmation |
| Motion lease | Firmware | Every motion command expires after at most 500 ms (the app sends 300 ms leases every 100 ms) |
| Heartbeat | App + firmware | The app pings every 250 ms. The firmware stops and latches a fault after 1 s of silence; the app reports the link lost after 1.5 s |
| Watchdog | Firmware | A hung firmware is reset after 2 s and boots into a latched fault |
| Limits | App + firmware | Maximum speed and acceleration from the hardware profile, enforced in the firmware; manual jog is capped at 25 % of the limit |
| Run-time limit | App | A physical program run stops after the configured maximum time |
| Program check | App | Programs that use features the physical robot does not have (encoders, IMU, cameras, joints) are refused before deployment |

## Rules the software follows

- Unknown counts as unsafe: missing data blocks arming instead of passing.
- Nothing moves automatically: connecting, deploying, reconnecting and clearing a fault never start motion.
- After any fault, reset or reconnection the robot is disarmed. You must arm again.
- "Connected" is shown only after the firmware handshake, never when a port is merely open.
- The simulated device is always labeled **Simulated device (no hardware)**.

## If something goes wrong

1. Press **E-STOP** in the top bar, or switch the motor power off.
2. Read the fault in **Hardware → Monitor** and the log.
3. Fix the cause (cable, battery, stalled wheel).
4. **Reset emergency stop** or **Clear fault**, confirm the robot is safely positioned, and arm again.

## Electrical cautions

- Never feed a 5 V signal into an ESP32 GPIO.
- Power the ESP32 from one source only (USB in the reference configuration).
- Use a common ground between the battery, the driver and the ESP32.
- A stalled motor can draw 1.6 A, more than the driver's 1 A continuous rating. Do not hold the wheels while the motors are driven.
- Charge and store batteries as their manufacturer instructs.
