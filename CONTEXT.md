# Project Context: D.R.O.P. System

## What is this project?
The Digital Receptacle Online Parcel (D.R.O.P.) system was originally designed as physical ESP32 C++ firmware for a smart package delivery box. It used an I2C LCD, an OLED screen, a matrix keypad, a servo lock, and multiple limit/weight/tilt sensors to manage a secure PIN-based drop-off transaction between an Owner and a Rider.

This web project is the **Digital Twin Dashboard** of that physical box. Instead of C++, it uses a pure React reducer state machine. Instead of physical hardware, it renders glowing CSS representations. It bridges the virtual box with **real physical cameras** by pairing smartphones over the web via Supabase Realtime messaging.

## Architecture

1. **Dashboard (`/simulation`)**:
   - Manages the state machine (Locked -> Priming -> Armed -> Rider Drop -> Open -> Locked).
   - Simulates physical inputs via HTML buttons and toggle switches.
   - Upon a state transition that requires security logging (e.g., Wrong PIN, Delivery Success, Tampering), it generates a `correlation_id` and fires a command into Supabase.

2. **CCTV Camera Client (`/camera`)**:
   - A mobile-first Next.js page.
   - Uses `navigator.mediaDevices.getUserMedia` to activate the phone's rear camera.
   - Listens to the `camera_commands` table via Supabase Realtime CDC.
   - When commanded, snaps a JPEG frame, uploads it to the Supabase `drop-captures` storage bucket, and inserts an audit log into the `events` table with the matching `correlation_id`.

3. **Discord Notification Engine (`/api/notify`)**:
   - The Dashboard listens to the `events` table. When the phone uploads the snapshot, the Dashboard fetches the public image URL.
   - It then POSTs to the server-side Next.js `/api/notify` route.
   - The Next.js backend parses the event type, maps it to specific colors and emojis, and fires a rich Discord Webhook embed containing the image and the event notes.

## Current Implementations
- **Fully Pure Reducer (`dropboxStateMachine.ts`)**: Mirrors `processLogic()` from the firmware exactly.
- **Web Audio (`audio.ts`)**: Synthetic square-wave oscillators to mimic piezoelectric buzzers and a two-tone alarm siren.
- **Supabase Integration**: Two tables (`camera_commands` and `events`), configured with Replica Identity Full and Realtime broadcasts.
- **Responsive UI**: Custom CSS (`globals.css`) ensuring high-contrast visibility on both desktop (Dashboard) and mobile (CCTV client).
- **Webcam Fallback**: The dashboard falls back to the local laptop webcam if no mobile device is paired.

## Future Goals
1. **IoT Integration / MQTT**: Replace the simulation buttons with real-time hardware data from the actual ESP32 running over MQTT or Supabase Edge Functions.
2. **Facial Recognition**: Pass the CCTV snapshots through an AI vision API (like AWS Rekognition or OpenAI Vision) to determine if a human face is present during tampering events.
3. **Dynamic PIN Generation**: Allow the Owner to generate one-time-use Rider PINs linked to specific delivery tracking numbers.
4. **Push Notifications**: Move away from Discord webhooks to native Web Push notifications directly to the owner's phone.
5. **Battery Status**: Monitor the ESP32's LiPo battery voltage via a voltage divider and display it on the OLED dashboard component.
