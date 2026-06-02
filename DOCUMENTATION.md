# Digital Receptacle Online Parcel (D.R.O.P)

**A Smart Secure Delivery Drop Box System for Unattended Parcel and Payment Transactions**

*An Embedded System Project presented by:*
- Marco Rye S. Dela Serna
- Maverick Miguel A. Torres
- Jun Mark A. Brilliantes
- Jude Michael R. Gigante
- John Paolo R. Narvasa

---

## Table of Contents

1. [Abstract](#abstract)
2. [Statement of the Problem](#statement-of-the-problem)
3. [Objectives](#objectives)
4. [Significance of the Study](#significance-of-the-study)
5. [System Versions Overview](#system-versions-overview)
6. [Standalone Version (Midterms)](#standalone-version-midterms)
7. [Realtime Version (Finals)](#realtime-version-finals)
8. [Feature Comparison Table](#feature-comparison-table)
9. [System Architecture](#system-architecture)
10. [State Machine Flow](#state-machine-flow)
11. [Schematic Diagram](#schematic-diagram)
12. [Logic Flowchart](#logic-flowchart)
13. [Standard Operating Procedure (SOP)](#standard-operating-procedure-sop)
14. [Consumer Setup Guide (README)](#consumer-setup-guide-readme)
15. [Future Improvements](#future-improvements)

---

## Abstract

Missed deliveries remain a common problem in residential areas where homeowners are not always available to receive parcels or complete cash-on-delivery (COD) transactions. Failed deliveries result in inconvenience for both customers and delivery personnel and may lead to repeated delivery attempts, delays, or returned packages. Additionally, unattended parcels left outside homes are vulnerable to theft and environmental damage.

The Digital Receptacle Online Parcel (D.R.O.P.) is a smart secure delivery drop box system that enables secure parcel delivery and payment transactions even when the homeowner is absent. The system integrates a PIN-based access mechanism, dual authentication security, and a secure compartment for cash transactions. It includes OLED display for user instructions, keypad for input, servo motor for locking, and a buzzer alarm for security notifications. An enhanced version features remote CCTV camera monitoring, Discord notifications, and real-time web-based control via Supabase cloud infrastructure.

---

## Statement of the Problem

### General Problem
Parcel deliveries often fail when recipients are unavailable to receive items or complete payment transactions. This causes inconvenience for customers and delivery personnel and may result in delays or returned parcels. Furthermore, parcels left outside homes are exposed to theft and unauthorized access.

### Specific Problems
1. Delivery drivers cannot complete deliveries when no one is home.
2. Parcels may be returned due to failed delivery attempts.
3. Cash-on-delivery payments cannot be completed without a receiver.
4. Parcels left outside are vulnerable to theft.
5. Unauthorized access may occur without proper security.
6. Homeowners have no way to monitor their drop box remotely.

---

## Objectives

### General Objective
The main objective of this study is to develop a secure and automated parcel drop box system that allows deliveries to be completed without requiring the homeowner's presence, with an enhanced realtime monitoring and control capability for the finals version.

### Specific Objectives
1. Develop a secure drop box for unattended deliveries.
2. Implement a PIN-based unlocking system.
3. Create a secure cash compartment for COD transactions.
4. Implement security cooldown (3 failed attempts → 30-second lockout).
5. Provide user instructions through OLED display.
6. Implement an alarm system for tamper detection.
7. **(Finals)** Integrate remote CCTV camera monitoring via phone camera.
8. **(Finals)** Enable remote realtime monitoring through a web dashboard.
9. **(Finals)** Implement automatic Discord notifications for security events.
10. **(Finals)** Enable WiFi configuration via AP web interface.

---

## Significance of the Study

**Homeowners** benefit from a secure and convenient method of receiving parcels without needing to be physically present. The realtime version adds remote monitoring and instant alerts.

**Delivery personnel** benefit from a system that allows them to complete deliveries efficiently without requiring multiple delivery attempts.

**Businesses and delivery services** benefit from increased delivery success rates and improved customer satisfaction.

---

## System Versions Overview

### Standalone Version (Midterms)

The standalone version is a **self-contained drop box** that operates entirely offline. It functions as an independent unit that can be left at home without any internet connection or remote monitoring.

**Key Characteristics:**
- Fully offline operation
- No WiFi, no internet required
- OLED display for user instructions
- Keypad for PIN entry
- Servo-controlled lock
- Buzzer for beeps and siren
- Tamper sensor with siren alarm
- Security cooldown (3 wrong PINs → 30s lockout)
- Lid and parcel sensors for state verification
- All logic runs on the ESP32 microcontroller

**What happens in each state:**
- **LOCKED**: Box is locked, waiting for PIN. Lid closed, safe.
- **PRIMING**: Owner entered correct PIN. Enter the amount of cash to collect.
- **ARMING**: Confirm amount and press * to arm the box for delivery.
- **READY**: Box is ready. Rider can enter their PIN to deliver.
- **DROP**: Rider's PIN accepted. Enter the delivery cost.
- **OPEN**: Delivery complete. Box is open. Close lid with parcel inside and press * to lock.

### Realtime Version (Finals)

The realtime version builds on the standalone hardware and adds **cloud connectivity, remote monitoring, CCTV camera capture, and instant alerts**.

**Additional Capabilities:**
- ESP32 connects to home WiFi (or creates its own AP)
- Sends events to Supabase cloud database
- Phone cameras capture photos of delivery/pickup events
- Discord notifications with embedded photos
- Web dashboard for live monitoring and camera management
- WebRTC live video streaming from phone cameras
- WiFi configuration via AP web UI
- Remote lock/unlock commands
- Event log with full audit trail
- Daily PIN generation for temporary rider access

---

## Feature Comparison Table

| Feature | Standalone (Midterms) | Realtime (Finals) |
|---------|:---------------------:|:-----------------:|
| **Core Drop Box Operation** | ✅ Yes | ✅ Yes |
| **PIN-based Locking** | ✅ Yes | ✅ Yes |
| **Owner & Rider PINs** | ✅ Yes | ✅ Yes |
| **Security Cooldown (3 strikes)** | ✅ Yes | ✅ Yes |
| **OLED Display Screen** | ✅ Yes | ✅ Yes |
| **Keypad Input** | ✅ Yes | ✅ Yes |
| **Servo Lock Mechanism** | ✅ Yes | ✅ Yes |
| **Buzzer / Siren Alarm** | ✅ Yes | ✅ Yes |
| **Tilt Tamper Detection** | ✅ Yes | ✅ Yes |
| **Lid Limit Switch** | ✅ Yes | ✅ Yes |
| **Parcel Presence Sensor** | ✅ Yes | ✅ Yes |
| **Offline Self-Contained** | ✅ Yes | ❌ *Requires WiFi* |
| **Internet / WiFi Connectivity** | ❌ No | ✅ Yes (Station + AP) |
| **Supabase Cloud Integration** | ❌ No | ✅ Yes |
| **Phone CCTV Camera Capture** | ❌ No | ✅ Yes |
| **Discord Notifications** | ❌ No | ✅ Yes |
| **Real-time Web Dashboard** | ❌ No | ✅ Yes |
| **CCTV Live Stream (WebRTC)** | ❌ No | ✅ Yes |
| **Remote Lock / Unlock** | ❌ No | ✅ Yes |
| **Event History & Audit Log** | ❌ No | ✅ Yes |
| **WiFi Config via AP (Web UI)** | ❌ No | ✅ Yes |
| **Multi-camera support** | ❌ No | ✅ Yes |
| **Monitor Page** | ❌ No | ✅ Yes |
| **Daily PIN Generator** | ❌ No | ✅ Yes |
| **Manual Photo Capture** | ❌ No | ✅ Yes |

---

## System Architecture

### Standalone Version (Midterms)

```
┌──────────────────────────────────────────────────┐
│                  ESP32-S3 N16R8                    │
│                                                    │
│  ┌─────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ Keypad  │  │  OLED    │  │  Servo Lock      │  │
│  │ 4x3     │  │  SH1106  │  │  (GPIO 18)      │  │
│  │ GPIO4-7 │  │ I2C SDA  │  └──────────────────┘  │
│  │ GPIO15- │  │  =8 SCL  │                         │
│  │ 17      │  │  =9      │  ┌──────────────────┐  │
│  └─────────┘  └──────────┘  │  Buzzer (GPIO 10) │  │
│                              └──────────────────┘  │
│  ┌──────────────────────────────────────────────┐  │
│  │ Sensors                                       │  │
│  │ GPIO13 = Lid Limit Switch                     │  │
│  │ GPIO11 = Parcel Presence Switch               │  │
│  │ GPIO12 = Tilt Tamper Sensor                   │  │
│  └──────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

### Realtime Version (Finals)

```
                         ┌──────────────────┐
                         │  Supabase Cloud   │
                         │  (Database +      │
                         │   Storage +       │
                         │   Realtime)       │
                         └───────┬──────────┘
                                 │ REST API / Realtime
                    ┌────────────┼────────────┐
                    │            │            │
                    ▼            ▼            ▼
           ┌────────────┐ ┌──────────┐ ┌──────────────┐
           │ ESP32-S3   │ │ Phone    │ │ Vercel       │
           │ Drop Box   │ │ Camera   │ │ Web Dashboard│
           │ (Hardware) │ │ Client   │ │ (Next.js)    │
           └────────────┘ └──────────┘ └──────────────┘
                │                               │
                │ WiFi                          │ Discord
                ▼                               ▼
           ┌────────────┐                 ┌──────────────┐
           │ Home WiFi  │                 │ Discord      │
           │ + DROP_BOX │                 │ Webhook      │
           │ AP (Debug) │                 │ Notifications│
           └────────────┘                 └──────────────┘
```

---

## State Machine Flow

```
                  ┌─────────────┐
                  │  STATE_IDLE  │  (LOCKED)
                  │  "BOX LOCKED"│
                  │  PIN: ____   │
                  └──────┬──────┘
                         │ Enter Owner PIN + Press #
                    ┌────┴────┐
                    │ Correct │  Wrong → fails++
                    └────┬────┘  (3 fails → COOLDOWN 30s)
                         ▼
                  ┌─────────────┐
                  │ STATE_PRIMING│  (PRIMING)
                  │ "OWNER OK"   │
                  │ "Amount: 0"  │
                  └──────┬──────┘
                         │ Enter amount + Press #
                         ▼
                  ┌──────────────┐
                  │STATE_READY_TO │  (ARMING)
                  │    _ARM      │
                  │ "Saved: 10"  │
                  │ "Press *"    │
                  └──────┬──────┘
                         │ Press *
                         ▼
                  ┌─────────────┐
                  │ STATE_READY  │  (READY)
                  │"READY FOR    │
                  │   DROP"      │
                  │"Rider PIN:"  │
                  └──────┬──────┘
                         │ Enter Rider PIN + Press #
                    ┌────┴────┐
                    │ Correct │  Wrong → fails++
                    └────┬────┘  (3 fails → COOLDOWN)
                         ▼
                  ┌─────────────┐
                  │STATE_RIDER_  │  (DROP)
                  │   DROP      │
                  │ "RIDER OK"  │
                  │ "Cost: 0"   │
                  └──────┬──────┘
                         │ Enter cost + Press #
                         ▼
                  ┌─────────────┐
                  │  STATE_OPEN  │  (OPEN)
                  │ "BOX OPEN"   │
                  │"Close+Ld *"  │
                  └──────┬──────┘
                         │ Close lid + Parcel present + Press *
                         ▼
                  ┌─────────────┐
                  │  STATE_IDLE  │  (Back to start)
                  │ "LOCKED"     │
                  │"Thank You"   │
                  └─────────────┘
```

### Cooldown State
Triggered by 3 incorrect PIN attempts. Box locks keypad for 30 seconds. OLED shows countdown timer. No keys accepted until cooldown expires.

### Tamper State
When tilt sensor is triggered for >200ms (debounced to 3 consecutive reads) while in IDLE or READY state, the system activates the siren (alternating 3500/2500Hz tone) and displays "TAMPER!" / "ALARM ACTIVE" on the OLED.

---

## Schematic Diagram

**Note:** A detailed circuit diagram image will be attached separately. Below is the pin connection table.

### ESP32-S3 Pin Connections

| ESP32 GPIO | Component | Notes |
|-----------|-----------|-------|
| **GPIO 4** | Keypad Row 1 | Matrix keypad row 1 |
| **GPIO 5** | Keypad Row 2 | Matrix keypad row 2 |
| **GPIO 6** | Keypad Row 3 | Matrix keypad row 3 |
| **GPIO 7** | Keypad Row 4 | Matrix keypad row 4 |
| **GPIO 15** | Keypad Col 1 | Matrix keypad column 1 |
| **GPIO 16** | Keypad Col 2 | Matrix keypad column 2 |
| **GPIO 17** | Keypad Col 3 | Matrix keypad column 3 |
| **GPIO 8 (SDA)** | OLED I2C Data | SH1106 1.3" OLED |
| **GPIO 9 (SCL)** | OLED I2C Clock | SH1106 1.3" OLED |
| **GPIO 18** | Servo Motor (PWM) | Lock servo, 50Hz |
| **GPIO 10** | Buzzer (PWM) | Piezo buzzer, 2000Hz |
| **GPIO 13** | Lid Limit Switch | INPUT_PULLUP, LOW=closed |
| **GPIO 11** | Parcel Presence Switch | INPUT_PULLUP, LOW=present |
| **GPIO 12** | Tilt Tamper Sensor | INPUT_PULLUP, HIGH=tilted |
| **3.3V** | OLED VCC, Keypad pull-up | Power |
| **5V** | Servo VCC, Buzzer VCC | External power |
| **GND** | Common Ground | All components |

### Power Supply
- **Input**: 5V DC, 2A minimum
- **Regulation**: Built-in ESP32-S3 voltage regulator
- **Servo**: Direct 5V supply (can draw up to 500mA peak)

---

## Logic Flowchart

```
┌──────────────────────┐
│      POWER ON        │
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│   Initialize System   │
│ - Pin Modes           │
│ - OLED Display        │
│ - Load Preferences    │
│ - Servo to LOCKED     │
│ - WiFi (if configured)│
│ - Web Server          │
│ - Play Boot Beep      │
└──────────┬───────────┘
           ▼
     ┌─────┴─────┐
     │   LOOP()   │◄──────────────────────────┐
     └─────┬─────┘                             │
           │                                    │
           ▼                                    │
     ┌──────────────────┐                       │
     │ Read Sensors      │                       │
     │ - Lid Switch      │                       │
     │ - Parcel Switch   │                       │
     │ - Tilt Sensor     │                       │
     └──────────┬───────┘                       │
                │                                │
                ▼                                │
     ┌──────────────────┐   YES   ┌──────────┐   │
     │ Tilt HIGH + 3x   ├────────►│ Activate  │   │
     │ consecutive?     │        │ Siren     │   │
     └────────┬─────────┘        │ + Alarm   │   │
              │ NO               └──────────┘   │
              ▼                                  │
     ┌──────────────────┐   YES   ┌──────────┐   │
     │ Cooldown active?  ├────────►│ Show     │   │
     │ & expired?        │        │ Cooldown  │   │
     └────────┬─────────┘        │ Countdown │   │
              │ NO               └──────────┘   │
              ▼                                  │
     ┌──────────────────┐                       │
     │ Keypad Pressed?   │──── YES ───┐          │
     └────────┬─────────┘ NO          │          │
              │                      ▼          │
              │              ┌──────────────┐   │
              │              │ Process Key   │   │
              │              │ - Digit: add  │   │
              │              │   to buffer   │   │
              │              │ - #: execute  │   │
              │              │   FSM action  │   │
              │              │ - *: arm/lock │   │
              │              └──────┬───────┘   │
              │                     │            │
              │                     ▼            │
              │              ┌────────────────┐  │
              │              │ FSM Transition  │  │
              │              │ - Update state  │  │
              │              │ - Update OLED   │  │
              │              │ - Play beep     │  │
              │              │ - Fire trigger  │  │
              │              │   (if WiFi)     │  │
              │              └────────────────┘  │
              │                                   │
              ▼                                   │
     ┌──────────────────┐                        │
     │ Flush Triggers    │                        │
     │ (HTTP to Supabase │                        │
     │  if pending)      │                        │
     └──────────┬───────┘                        │
                │                                 │
                ▼                                 │
     ┌──────────────────┐                        │
     │ Refresh OLED      ├────────────────────────┘
     │ (every 50ms)     │
     └──────────────────┘
```

---

## Standard Operating Procedure (SOP)

### Owner Setup Procedure

1. **Approach the box** — Ensure the lid is fully closed.
2. **Enter Owner PIN** — Input your 4-digit owner PIN (default: `1234`).
3. **Press #** — The servo unlocks and the OLED shows "OWNER OK".
4. **Enter Amount** — Type the amount of cash you expect to collect for the parcel (e.g., `500`).
5. **Press #** — The amount is saved. OLED shows "Saved: 500".
6. **Press *** — The servo locks. The box is now READY for delivery. OLED shows "READY FOR DROP".
7. **(Standalone)** Leave the box at your door. You may leave now.

### Rider Delivery Procedure

1. **Enter Rider PIN** — Input the 4-digit rider PIN (default: `5678`, or new generated PIN).
2. **Press #** — PIN accepted. OLED shows "RIDER OK".
3. **Enter Cost** — Type the delivery cost (must be ≤ owner's primed amount).
4. **Press #** — Successful: servo unlocks, box opens. If cost > primed amount, OLED shows "ERROR Insufficient".
5. **Place parcel** inside the box. Close the lid fully.
6. **Press *** — If lid is closed AND parcel is detected, the servo locks. OLED shows "LOCKED Thank You".

### Security Procedures

- **Wrong PIN**: Three incorrect PIN attempts trigger a 30-second cooldown. OLED shows countdown. Keypad is disabled during cooldown.
- **Tamper Detection**: If the box is tilted/shaken for more than 200ms while in IDLE or READY state, the buzzer activates a siren (alternating 3500/2500Hz tone). The siren stops when the box is returned to a stable position.
- **Forced Opening**: Opening the lid while locked does not trigger an alarm directly, but the system detects the lid state and will not allow locking unless lid is closed.
- **(Finals)** Each security event sends a camera command — phones capture photos and Discord receives notifications with images.

---

## Consumer Setup Guide (README)

### What's in the Box
- D.R.O.P. Drop Box unit (assembled)
- 5V DC 2A power adapter
- This documentation

### Hardware Requirements
| Component | Specification |
|-----------|-------------|
| Microcontroller | ESP32-S3 N16R8 (built-in) |
| Display | 1.3" OLED SH1106 (128x64) |
| Keypad | 4×3 Matrix Membrane Keypad |
| Lock Mechanism | Servo Motor (SG90 or equivalent) |
| Sensors | Tilt sensor, 2× Limit switches |
| Buzzer | Piezo buzzer 5V |
| Power | 5V DC, 2A adapter |
| Enclosure | Plywood or 3D-printed box |

### Software Requirements
- **Arduino IDE** (for firmware uploads, optional for end users)
- Required Libraries: `Adafruit_GFX`, `Adafruit_SH110X`, `Keypad`, `Preferences`, `WiFi`, `WebServer`

### Step-by-Step Setup

#### 1. Physical Setup
1. Place the D.R.O.P. box in a secure, flat location near your front door.
2. Connect the 5V DC power adapter to the box.
3. The OLED will light up showing "DROP v2.4" then "BOX LOCKED".

#### 2. Initial Configuration (Standalone)
The box works out of the box with default PINs:
- Owner PIN: `1234`
- Rider PIN: `5678`

To change PINs, connect to the DROP_BOX WiFi network and visit `192.168.4.1`.

#### 3. WiFi Configuration (Finals - Optional)
1. Power on the box. It will create a WiFi network called **DROP_BOX** (password: `toblerone`).
2. Connect your phone or laptop to **DROP_BOX** WiFi.
3. Open a browser and go to **192.168.4.1**.
4. Click **Scan Networks** and select your home WiFi.
5. Enter your home WiFi password and click **Connect**.
6. The box will reboot and connect to your home WiFi.
7. The OLED will show `WiFi:OK` followed by the IP address.

#### 4. Setting Up Phone Cameras (Finals)
1. Open the URL `https://drop-realtime-web.vercel.app/monitor` on your browser.
2. Add camera IDs (e.g., "phone1", "phone2").
3. Open the camera link on each phone that will monitor the box.
4. Place phones facing the drop box.

#### 5. Testing
1. Enter Owner PIN (`1234`) + `#` → box unlocks.
2. Enter `100` + `#` → amount saved.
3. Press `*` → box locks, ready for delivery.
4. Enter Rider PIN (`5678`) + `#` → rider accepted.
5. Enter `50` + `#` → box opens.
6. Place a parcel inside, close lid, press `*` → box locks.

### Normal Operation
1. Owner primes the box (PIN → amount → arm).
2. Rider delivers parcel (PIN → cost → drop).
3. Box locks automatically after successful delivery.
4. **(Finals)** Discord sends notification with photo.

### Troubleshooting

| Problem | Solution |
|---------|----------|
| OLED not lighting up | Check power adapter and I2C connections |
| Keypad not responding | Check ribbon cable connection. Try pressing firmly. |
| Cooldown active | Wait 30 seconds for countdown to expire |
| Servo not moving | Check servo connection to GPIO 18 and 5V power |
| Can't connect to DROP_BOX | Password is `toblerone`. Ensure box is powered. |
| Discord no notifications | Verify `DISCORD_WEBHOOK_URL` on Vercel env vars |
| Phones not capturing | Open camera page on each phone. Check camera permissions. |

### Default Credentials
| Credential | Default Value |
|-----------|--------------|
| Owner PIN | `1234` |
| Rider PIN | `5678` |
| AP SSID | `DROP_BOX` |
| AP Password | `toblerone` |

---

## Future Improvements

1. **Mobile Application** — Native Android/iOS app for easier monitoring and control.
2. **QR Code Access** — One-time QR codes for rider delivery, eliminating PIN sharing.
3. **Online Payment Integration** — Direct GCash/PayMaya integration for COD cashless transactions.
4. **Battery Backup** — Rechargeable battery with low-battery alerts via Discord.
5. **GPS Tracking** — Built-in GPS for boxes deployed in multiple locations.
6. **Temperature/Humidity Sensor** — Monitor environmental conditions for sensitive parcels.
7. **Voice Prompts** — Text-to-speech for visually impaired users.
8. **Solar Power Option** — Solar charging for outdoor deployment without mains power.
9. **Facial Recognition** — Camera-based identity verification for extra security.
10. **Multi-User Support** — Multiple owners and riders with individual permissions.

---

*Document Version: 1.0 — June 2026*