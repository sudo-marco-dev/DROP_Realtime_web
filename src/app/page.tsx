'use client';

import Link from 'next/link';
import { ShieldAlert, Smartphone, Tv, Monitor, Activity } from 'lucide-react';

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col justify-center items-center p-6 bg-gradient-to-br from-slate-950 to-slate-900">
      <div className="max-w-xl w-full text-center flex flex-col gap-8">

        {/* Logo Header */}
        <div className="flex flex-col items-center gap-4">
          <div className="logo-badge text-2xl tracking-widest px-4 py-2">D.R.O.P.</div>
          <h1 className="text-4xl font-extrabold tracking-tight mt-2 text-white">
            Digital Receptacle Online Parcel
          </h1>
          <p className="text-gray-400 font-light max-w-md mx-auto">
            Smart drop box system with real-time monitoring, CCTV integration, and security alerts.
          </p>
        </div>

        {/* Navigation Options */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-4">

          <Link href="/simulation" className="glass-card hover:scale-[1.02] cursor-pointer text-left p-6 flex flex-col justify-between h-48 border border-white/5 transition-transform duration-300">
            <div className="flex justify-between items-start">
              <div className="p-3 bg-amber-500/10 rounded-lg text-amber-500">
                <Tv size={24} />
              </div>
              <span className="text-[10px] text-amber-500 font-bold uppercase tracking-wider bg-amber-500/10 px-2 py-0.5 rounded">Twin</span>
            </div>
            <div>
              <h3 className="text-lg font-bold text-white mt-4">Digital Twin</h3>
              <p className="text-xs text-gray-400 mt-1">
                Virtual ESP32 controls, state machine, buzzer, keypad, and event logger.
              </p>
            </div>
          </Link>

          <Link href="/monitor" className="glass-card hover:scale-[1.02] cursor-pointer text-left p-6 flex flex-col justify-between h-48 border border-white/5 transition-transform duration-300">
            <div className="flex justify-between items-start">
              <div className="p-3 bg-emerald-500/10 rounded-lg text-emerald-500">
                <Monitor size={24} />
              </div>
              <span className="text-[10px] text-emerald-500 font-bold uppercase tracking-wider bg-emerald-500/10 px-2 py-0.5 rounded">Live</span>
            </div>
            <div>
              <h3 className="text-lg font-bold text-white mt-4">Live Monitor</h3>
              <p className="text-xs text-gray-400 mt-1">
                Real-time event feed, last camera capture with sensor data, and rider message generator.
              </p>
            </div>
          </Link>

          <Link href="/camera?camera_id=phone1" className="glass-card hover:scale-[1.02] cursor-pointer text-left p-6 flex flex-col justify-between h-48 border border-white/5 transition-transform duration-300">
            <div className="flex justify-between items-start">
              <div className="p-3 bg-cyan-500/10 rounded-lg text-cyan-500">
                <Smartphone size={24} />
              </div>
              <span className="text-[10px] text-cyan-500 font-bold uppercase tracking-wider bg-cyan-500/10 px-2 py-0.5 rounded">CCTV</span>
            </div>
            <div>
              <h3 className="text-lg font-bold text-white mt-4">CCTV Camera</h3>
              <p className="text-xs text-gray-400 mt-1">
                Phone-based camera client for photo captures and WebRTC live streaming.
              </p>
            </div>
          </Link>

        </div>

        {/* Footer Stats */}
        <div className="flex items-center justify-center gap-6 text-xs text-gray-500 mt-8 border-t border-white/5 pt-6">
          <div className="flex items-center gap-1.5">
            <Activity size={12} className="text-emerald-500 animate-pulse" />
            <span>Supabase Realtime</span>
          </div>
          <span>•</span>
          <div className="flex items-center gap-1.5">
            <ShieldAlert size={12} className="text-amber-500" />
            <span>Discord Webhook</span>
          </div>
        </div>

      </div>
    </main>
  );
}