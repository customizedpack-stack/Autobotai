# Explorer Bot reference hardware (Phase 10)

This is the **only** physical configuration AutoBotAI Phase 10 supports. The app does not assume that a "similar" part is interchangeable: any other controller, driver, motor, wheel or distance sensor blocks arming in **Blueprint → Hardware**.

**Overall status: conditionally compatible.** The parts below work together on paper, with the warnings listed in this document. Three values are not known to AutoBotAI and must come from you: the battery's maximum current, the motor-power switch, and the ground clearance of your assembled robot. Nothing in this configuration has been tested on physical hardware by AutoBotAI (see `docs/PHASE-10-REPORT.md`).

## Parts

| Role | Part | Manufacturer page | Verification |
|---|---|---|---|
| Controller | Espressif ESP32-DevKitC V4 | [Espressif user guide](https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32/esp32-devkitc/user_guide.html) | Partial (no board dimensions or price from Espressif) |
| Motor driver | Pololu 713, TB6612FNG Dual Motor Driver Carrier | [pololu.com/product/713](https://www.pololu.com/product/713) | Verified |
| Motors (×2) | Pololu 1101, 100:1 Micro Metal Gearmotor HP 6V | [pololu.com/product/1101](https://www.pololu.com/product/1101) | Verified |
| Wheels (1 pair) | Pololu 1429, Pololu Wheel 70×8mm Pair | [pololu.com/product/1429](https://www.pololu.com/product/1429) | Verified |
| Motor brackets (1 pair, recommended) | Pololu 989, Micro Metal Gearmotor Bracket Pair | [pololu.com/product/989](https://www.pololu.com/product/989) | Verified |
| Distance sensor | Pololu 2490, VL53L0X Time-of-Flight Distance Sensor Carrier | [pololu.com/product/2490](https://www.pololu.com/product/2490) | Verified |
| Motor power | User-supplied battery pack (for example 4 × AA NiMH, 4.8 V nominal) | — | **You enter voltage and maximum current** |
| Motor-power switch | User-supplied switch in the motor supply line | — | **You add it to the BOM and confirm it** |
| Local stop button (optional) | Momentary button from GPIO18 to GND | — | User-supplied |
| Pull-down resistor | 10 kΩ from STBY (GPIO23) to GND | — | User-supplied |

The catalog entries, with the exact quoted values and the date they were checked, are in `src/features/blueprint/catalog/parts.ts`.

## Specification checks

| Check | Source values | Result |
|---|---|---|
| Driver motor voltage vs. supply | TB6612FNG carrier VM 4.5–13.5 V; 4 × AA NiMH = 4.8 V nominal | Compatible, but close to the 4.5 V minimum as the pack discharges |
| Motor voltage vs. supply | Motor rated 6 V; supply 4.8 V | **Warning**: the motors run slower and weaker than rated (no damage risk from under-voltage) |
| Driver current vs. motor stall | Driver 1 A continuous, 3 A peak per channel; motor stall 1.6 A at 6 V | **Warning**: a stalled motor exceeds the continuous rating. The firmware limits the duty cycle and the lease stops the motors, but a mechanical stall can still overheat the driver |
| Driver logic voltage | Driver VCC 2.7–5.5 V; ESP32 3.3 V | Compatible (VCC from the ESP32 3V3 pin) |
| Driver inputs vs. ESP32 outputs | ESP32 GPIO 3.3 V; driver logic powered at 3.3 V | Compatible |
| Distance sensor supply | Carrier VIN 2.6–5.5 V, 20 mA typical | Compatible (VIN from 3V3) |
| Distance sensor interface | I²C; ESP32 has two I²C interfaces | Compatible (GPIO21 SDA, GPIO22 SCL) |
| Wheels vs. motor shaft | Wheel bore 3 mm D; motor shaft 3 mm D | Compatible |
| Driver channels | 2 channels for 2 motors | Compatible |
| ESP32 power | Espressif: power the board with "one and only one" of USB, 5V or 3V3 | Powered from **USB only** in this configuration |
| 5 V regulator for the ESP32 from the pack | Pololu D24V10F5 needs a higher input than 4.8 V | **Not used**: incompatible with a 4.8 V pack, so the ESP32 stays on USB |
| Battery maximum current | Not known to AutoBotAI | **You must enter it**; until then arming is blocked. It must cover 2 × 1.6 A stall plus margin |
| Ground clearance | Not modeled | **Unknown**: measure it on the assembled robot before floor tests |
| Encoders | The 1101 motor has no encoder | No closed-loop speed or odometry. The firmware reports `enc=0` and the app never invents encoder data |

## Wiring (fixed firmware pin map)

Motor A is the **left** motor and motor B is the **right** motor.

| TB6612FNG carrier | ESP32-DevKitC V4 |
|---|---|
| PWMA | GPIO26 |
| AIN1 | GPIO27 |
| AIN2 | GPIO4 |
| PWMB | GPIO32 |
| BIN1 | GPIO33 |
| BIN2 | GPIO25 |
| STBY | GPIO23, plus 10 kΩ to GND |
| VCC | 3V3 |
| GND | GND (common ground with the battery negative) |
| VM | Battery positive **through the motor-power switch** |
| AO1/AO2 | Left motor |
| BO1/BO2 | Right motor |

| VL53L0X carrier | ESP32-DevKitC V4 |
|---|---|
| VIN | 3V3 |
| GND | GND |
| SDA | GPIO21 |
| SCL | GPIO22 |

Optional local stop button: GPIO18 to GND (the firmware uses the internal pull-up; pressing it latches the emergency stop).

Why these pins: they avoid the ESP32 strapping pins (GPIO0, GPIO2, GPIO5, GPIO12/MTDI, GPIO15/MTDO, from the ESP32 datasheet), the flash pins GPIO6–11, the input-only pins GPIO34–39 and the USB-UART pins GPIO1 and GPIO3. Check them against the module fitted on your DevKitC (some modules use more pins for PSRAM).

The 10 kΩ pull-down on STBY keeps the driver in standby while the ESP32 is booting or reset, before the firmware drives STBY LOW itself.

**Blueprint → Hardware → Apply firmware pin map** sets the project wiring to this table. Any difference blocks arming.

## Power layout

- Motors: battery → motor-power switch → driver VM. The switch must cut motor power on its own, without the app.
- ESP32: USB from the computer (this is also the data link).
- Common ground: battery negative, driver GND and ESP32 GND must be connected.
- Do not connect the battery to the ESP32 5V or 3V3 pins in this configuration.

## Not supported in Phase 10

- Any other board (Arduino Uno, ESP32-S3, ESP32-C3, Raspberry Pi Pico, Raspberry Pi), even if it looks similar.
- Any other motor driver (L298N, DRV8833, DRV8871 and so on) or motor (including encoder motors: the firmware has no encoder support).
- Other distance sensors (VL53L1X, ultrasonic HC-SR04), IMUs, cameras, servos and arms.
- Wi-Fi, Bluetooth, network or cloud control. The only link is the USB cable.
- Humanoid, legged or industrial robots.
- Running JavaScript, Python or Blockly programs on the ESP32. Programs always run in the browser.

## Browser requirements

Web Serial works in Chrome and Edge on Windows, macOS, Linux and ChromeOS, on a secure page (https or localhost). It is not available in Firefox, Safari or mobile browsers; the Hardware tab says so and offers only the simulated device there.

## What you must check yourself

1. Enter the battery's real voltage and maximum continuous current in **Blueprint → Hardware → Power supply**.
2. Fit the motor-power switch, add it to the BOM, and confirm it in the app.
3. Measure wheel diameter, track width and ground clearance on the assembled robot and enter them under **Calibration**.
4. Run the first tests with the wheels off the ground.
