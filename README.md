# D.R.O.P. Web Simulation Dashboard

**Digital Receptacle Online Parcel (D.R.O.P.)** is a smart drop-box system. This project is a **high-fidelity digital twin dashboard** built with Next.js 14. It emulates the ESP32 hardware state machine and provides a remote CCTV client for real mobile phones, integrated via Supabase Realtime and Discord Webhooks.

## 🚀 Features
- **Hardware Emulation**: 16x2 LCD, SSD1306 OLED, Matrix Keypad, Servo Lock Latch, and GPIO Sensor Switches (Lid, Weight, Tilt).
- **Pure State Machine**: A TypeScript port of the C++ ESP32 lock/unlock logic (`dropboxStateMachine.ts`).
- **Remote CCTV Node**: A dedicated `/camera` client designed for mobile phones. Uses `navigator.mediaDevices` and connects to the dashboard via Supabase CDC (Change Data Capture).
- **Discord Integration**: Automated event logs with embedded snapshots delivered to a Discord channel.
- **Web Audio API**: Retro piezo buzzer feedback and dual-tone (3500Hz/2500Hz) tamper siren.

## 🛠️ Tech Stack
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Database / Realtime**: Supabase (PostgreSQL, Storage, Realtime subscriptions)
- **Styling**: Custom vanilla CSS (`globals.css`) with glassmorphism and retro terminal aesthetics
- **Deployment**: Ready for Vercel

## 📦 Setup & Deployment

### 1. Supabase Configuration
Run the `setup.sql` script in your Supabase SQL Editor. This will:
- Create the `events` and `camera_commands` tables.
- Enable full Realtime replication on both tables.
- Enable RLS policies for public access (suitable for this simulation context).
- *Make sure to create a public storage bucket named `drop-captures`.*

### 2. Environment Variables
You need to set up the following environment variables (locally in `.env.local` or in your Vercel project settings):

```env
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

### 3. Local Development
```bash
npm install
npm run dev
```

### 4. Deploying to Vercel
1. Push this repository to GitHub.
2. Log into [Vercel](https://vercel.com/) and click **Add New Project**.
3. Import your GitHub repository.
4. Open the **Environment Variables** section and add the 3 variables listed above.
5. Click **Deploy**. Vercel will automatically build the Next.js project.
6. Once deployed, open your Vercel URL on your PC for the Dashboard, and on your Phone for the CCTV client!
