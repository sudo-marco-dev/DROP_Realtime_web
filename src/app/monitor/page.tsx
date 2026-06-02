'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { ExternalLink, Camera, Tv, ShieldAlert, Wifi, Activity, Key, Copy, MessageSquare, Clock } from 'lucide-react';

interface DropState {
    id: number;
    state: string;
    lid_closed: boolean;
    parcel_present: boolean;
    tilt_detected: boolean;
    is_tampering: boolean;
    in_cooldown: boolean;
    primed_amount: number;
    wifi_connected: boolean;
    ip: string;
    created_at: string;
}

interface TempPin {
    id: number;
    pin: string;
    purpose: string;
    created_at: string;
    expires_at: string;
    used: boolean;
}

export default function MonitorPage() {
    const [latest, setLatest] = useState<DropState | null>(null);
    const [events, setEvents] = useState<any[]>([]);
    const [connected, setConnected] = useState(false);

    // Daily PIN state
    const [tempPin, setTempPin] = useState<TempPin | null>(null);
    const [pinCountdown, setPinCountdown] = useState('');
    const [generating, setGenerating] = useState(false);

    // Message generator state
    const [address, setAddress] = useState('');
    const [scenario, setScenario] = useState<'dropoff' | 'pickup' | 'both'>('dropoff');
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        // Load saved address
        const saved = localStorage.getItem('drop_address');
        if (saved) setAddress(saved);
    }, []);

    // Fetch active temp pin
    const fetchTempPin = async () => {
        const now = new Date().toISOString();
        const { data } = await supabase
            .from('temp_pins')
            .select('*')
            .gte('expires_at', now)
            .eq('used', false)
            .order('created_at', { ascending: false })
            .limit(1);
        if (data && data.length > 0) setTempPin(data[0]);
        else setTempPin(null);
    };

    // Generate new daily PIN
    const generatePin = async () => {
        setGenerating(true);
        const pin = String(Math.floor(1000 + Math.random() * 9000));
        const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

        const { data, error } = await supabase
            .from('temp_pins')
            .insert({
                pin,
                purpose: 'rider_access',
                created_at: new Date().toISOString(),
                expires_at: expires,
                used: false
            })
            .select()
            .single();

        if (data) setTempPin(data);
        setGenerating(false);
    };

    // Pin countdown timer
    useEffect(() => {
        if (!tempPin) return;
        const tick = () => {
            const now = Date.now();
            const exp = new Date(tempPin.expires_at).getTime();
            const diff = exp - now;
            if (diff <= 0) { setPinCountdown('Expired'); setTempPin(null); return; }
            const h = Math.floor(diff / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            setPinCountdown(`${h}h ${m}m`);
        };
        tick();
        const interval = setInterval(tick, 30000);
        return () => clearInterval(interval);
    }, [tempPin]);

    // Generate message text
    const getMessage = () => {
        const pinText = tempPin ? `🔑 PIN: ${tempPin.pin}` : '';
        const pinExp = tempPin ? `⏰ Valid: ${pinCountdown}` : '';
        const addr = address ? `📍 ${address}` : '';

        const templates: Record<string, string> = {
            dropoff: `Hi! I'm away but you can use my D.R.O.P. smart box to drop off a package.\n\n${addr ? addr + '\n' : ''}${pinText}\n${pinExp}\n\nSteps:\n1. Enter the PIN\n2. Enter the delivery cost\n3. Place package inside\n4. Close lid + press * on keypad\n\nI'll get notified when it's done!`,
            pickup: `Hi! You can pick up your package from my D.R.O.P. smart box.\n\n${addr ? addr + '\n' : ''}${pinText}\n${pinExp}\n\nSteps:\n1. Enter the PIN\n2. Box will unlock\n3. Take your package\n4. Close lid + press *\n\nYou have ${pinCountdown || '24h'} to pick it up.`,
            both: `Hi! You can use my D.R.O.P. smart box for a swap.\n\n${addr ? addr + '\n' : ''}${pinText}\n${pinExp}\n\nSteps:\n1. Enter the PIN\n2. Drop off + pick up\n3. Close lid + press *\n\nI'll be notified!`
        };
        return templates[scenario] || templates.dropoff;
    };

    const copyMessage = () => {
        navigator.clipboard.writeText(getMessage());
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const shareWhatsApp = () => {
        window.open(`https://wa.me/?text=${encodeURIComponent(getMessage())}`, '_blank');
    };

    // State monitoring (existing)
    useEffect(() => {
        const fetchState = async () => {
            const { data } = await supabase.from('dropbox_state').select('*').order('id', { ascending: false }).limit(1);
            if (data && data.length > 0) setLatest(data[0]);
        };
        fetchState();

        const fetchEvents = async () => {
            const { data } = await supabase.from('events').select('*').order('timestamp', { ascending: false }).limit(10);
            if (data) setEvents(data);
        };
        fetchEvents();
        fetchTempPin();

        const stateChannel = supabase.channel('live-monitor').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dropbox_state' }, (payload: any) => { setLatest(payload.new); setConnected(true); }).subscribe();
        const eventChannel = supabase.channel('live-events').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events' }, (payload: any) => { setEvents(prev => [payload.new, ...prev].slice(0, 20)); }).subscribe();
        const pinChannel = supabase.channel('live-pins').on('postgres_changes', { event: '*', schema: 'public', table: 'temp_pins' }, () => { fetchTempPin(); }).subscribe();

        setConnected(true);
        return () => { supabase.removeChannel(stateChannel); supabase.removeChannel(eventChannel); supabase.removeChannel(pinChannel); };
    }, []);

    const stateColors: Record<string, string> = { 'Locked': '#10b981', 'Priming': '#f59e0b', 'ReadyArm': '#8b5cf6', 'Ready': '#3b82f6', 'Drop': '#ec4899', 'Open': '#f97316' };

    const sensorRow = (label: string, value: boolean, trueLabel: string, falseLabel: string) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: value ? '#10b981' : '#ef4444', boxShadow: value ? '0 0 6px rgba(16,185,129,0.6)' : '0 0 6px rgba(239,68,68,0.6)' }} />
            <span style={{ color: '#9ca3af', fontSize: 12, minWidth: 60 }}>{label}</span>
            <span style={{ color: '#f0f2f5', fontWeight: 700, fontSize: 13 }}>{value ? trueLabel : falseLabel}</span>
        </div>
    );

    return (
        <main style={{ minHeight: '100vh', background: '#0a0c10', color: '#f0f2f5', fontFamily: 'monospace', padding: 16, maxWidth: 600, margin: 'auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 12, marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Tv size={20} color="#ffaa00" />
                    <h1 style={{ fontSize: 18, margin: 0 }}>D.R.O.P. <span style={{ color: '#ffaa00' }}>Live Monitor</span></h1>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#131720', padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.05)' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: connected ? '#10b981' : '#ef4444' }} />
                    <span style={{ fontSize: 11, color: '#9ca3af' }}>{connected ? 'LIVE' : 'OFFLINE'}</span>
                </div>
            </div>

            {/* OLED Replica */}
            <div style={{ background: '#050505', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
                {latest ? (
                    <>
                        <div style={{ background: '#fff', color: '#000', padding: '2px 8px', borderRadius: 2, marginBottom: 8, display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700 }}>
                            <span>DROP {latest.state.toUpperCase()}</span>
                            <span>{latest.in_cooldown ? 'COOLDOWN' : latest.is_tampering ? 'TAMPER!' : latest.state}</span>
                        </div>
                        <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                            {latest.in_cooldown ? (
                                <div style={{ textAlign: 'center', padding: 8 }}>
                                    <div style={{ fontSize: 16, fontWeight: 700 }}>⏳ COOLDOWN</div>
                                    <div style={{ color: '#ef4444', fontSize: 12 }}>Too many attempts</div>
                                    <div style={{ background: '#1a222f', borderRadius: 4, height: 8, margin: '8px 0', overflow: 'hidden' }}><div style={{ background: '#ef4444', height: '100%', width: '50%', borderRadius: 4 }} /></div>
                                </div>
                            ) : latest.is_tampering ? (
                                <div style={{ textAlign: 'center', padding: 8 }}>
                                    <ShieldAlert size={24} color="#ef4444" style={{ display: 'block', margin: '0 auto 4px' }} />
                                    <div style={{ color: '#ef4444', fontWeight: 700 }}>⚠ ALARM ACTIVE</div>
                                    <div style={{ fontSize: 11, color: '#9ca3af' }}>Tilt detected!</div>
                                </div>
                            ) : (
                                <>
                                    <div style={{ fontWeight: 700 }}>{latest.state === 'Locked' ? 'BOX LOCKED' : latest.state === 'Priming' ? 'OWNER OK' : latest.state === 'ReadyArm' ? 'ARMING' : latest.state === 'Ready' ? 'READY FOR DROP' : latest.state === 'Drop' ? 'RIDER OK' : 'BOX OPEN'}</div>
                                    <div style={{ color: '#9ca3af', fontSize: 11 }}>Balance: ${latest.primed_amount}</div>
                                </>
                            )}
                        </div>
                    </>
                ) : <div style={{ textAlign: 'center', padding: 20, color: '#6b7280' }}>Waiting for hardware data...</div>}
            </div>

            {/* DAILY PIN GENERATOR */}
            <div style={{ background: 'rgba(255,255,255,0.02)', border: tempPin ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
                <h2 style={{ fontSize: 13, margin: '0 0 12px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Key size={14} color="#f59e0b" /> Daily Rider PIN
                </h2>
                {tempPin ? (
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                            <span style={{ fontSize: 28, fontWeight: 900, color: '#10b981', letterSpacing: '0.2em', fontFamily: 'monospace' }}>{tempPin.pin}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', padding: '4px 10px', borderRadius: 4, fontSize: 12, fontWeight: 700 }}>
                                <Clock size={12} /> {pinCountdown}
                            </div>
                        </div>
                        <div style={{ fontSize: 11, color: '#6b7280' }}>
                            Expires: {new Date(tempPin.expires_at).toLocaleString()}
                            <span style={{ marginLeft: 12 }}>ID: {tempPin.id}</span>
                        </div>
                    </div>
                ) : (
                    <div style={{ marginBottom: 8, color: '#6b7280', fontSize: 12 }}>No active PIN. Generate one for 24-hour rider access.</div>
                )}
                <button onClick={generatePin} disabled={generating} style={{ background: tempPin ? '#1f293d' : '#f59e0b', color: tempPin ? '#9ca3af' : '#000', border: 'none', padding: '10px 16px', fontWeight: 700, borderRadius: 6, cursor: 'pointer', width: '100%', marginTop: 8 }}>
                    {tempPin ? '🔄 Regenerate PIN' : generating ? 'Generating...' : '🔑 Generate Daily PIN'}
                </button>
            </div>

            {/* MESSAGE GENERATOR */}
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
                <h2 style={{ fontSize: 13, margin: '0 0 12px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <MessageSquare size={14} color="#8b5cf6" /> Rider Message Generator
                </h2>

                {/* Address */}
                <input
                    type="text"
                    value={address}
                    onChange={e => { setAddress(e.target.value); localStorage.setItem('drop_address', e.target.value); }}
                    placeholder="Delivery address (e.g. 123 Main St)"
                    style={{ background: '#131720', color: '#f0f2f5', border: '1px solid rgba(255,255,255,0.1)', padding: '10px', borderRadius: 6, width: '100%', fontSize: 13, marginBottom: 8, boxSizing: 'border-box' }}
                />

                {/* Scenario selector */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                    {(['dropoff', 'pickup', 'both'] as const).map(s => (
                        <button key={s} onClick={() => setScenario(s)}
                            style={{ flex: 1, background: scenario === s ? '#8b5cf6' : '#1f293d', color: scenario === s ? '#fff' : '#9ca3af', border: 'none', padding: '8px 12px', fontWeight: 600, borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                            {s === 'dropoff' ? '📦 Drop Off' : s === 'pickup' ? '📬 Pick Up' : '🔄 Swap'}
                        </button>
                    ))}
                </div>

                {/* Message preview */}
                <div style={{ background: '#050505', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: 12, fontSize: 12, color: '#d1d5db', whiteSpace: 'pre-wrap', marginBottom: 8, maxHeight: 160, overflowY: 'auto', lineHeight: 1.6 }}>
                    {getMessage()}
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={copyMessage} style={{ flex: 1, background: copied ? '#10b981' : '#1f293d', color: copied ? '#000' : '#f0f2f5', border: '1px solid rgba(255,255,255,0.1)', padding: '10px', fontWeight: 600, borderRadius: 6, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        <Copy size={12} /> {copied ? 'Copied!' : 'Copy Message'}
                    </button>
                    <button onClick={shareWhatsApp} style={{ flex: 1, background: '#25d366', color: '#000', border: 'none', padding: '10px', fontWeight: 600, borderRadius: 6, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        <MessageSquare size={12} /> Share via WhatsApp
                    </button>
                </div>
            </div>

            {/* Sensor Panel */}
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
                <h2 style={{ fontSize: 13, margin: '0 0 8px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Hardware Sensors</h2>
                {latest ? (
                    <>
                        {sensorRow('Lid', latest.lid_closed, 'CLOSED', 'OPEN')}
                        {sensorRow('Parcel', latest.parcel_present, 'PRESENT', 'EMPTY')}
                        {sensorRow('Tilt', latest.tilt_detected, 'DETECTED!', 'SAFE')}
                        {sensorRow('Tamper', latest.is_tampering, 'ACTIVE!', 'INACTIVE')}
                        {sensorRow('Cooldown', latest.in_cooldown, 'LOCKED', 'CLEAR')}
                        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Wifi size={14} color={latest.wifi_connected ? '#10b981' : '#ef4444'} />
                            <span style={{ fontSize: 12, color: '#9ca3af' }}>{latest.wifi_connected ? `Connected – ${latest.ip}` : 'AP Mode'}</span>
                        </div>
                    </>
                ) : <div style={{ color: '#6b7280', fontSize: 12 }}>No sensor data yet</div>}
            </div>

            {/* Event History */}
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
                <h2 style={{ fontSize: 13, margin: '0 0 8px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Event History</h2>
                <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {events.length === 0 ? <div style={{ color: '#6b7280', fontSize: 12, padding: 16, textAlign: 'center' }}>No events yet</div>
                        : events.map((evt: any) => {
                            let color = '#566a85', icon = '•';
                            if (evt.trigger_type?.includes('TAMPER') || evt.trigger_type?.includes('WRONG_PIN')) { color = '#ef4444'; icon = '🚨'; }
                            else if (evt.trigger_type?.includes('DELIVERY') || evt.trigger_type?.includes('OWNER')) { color = '#10b981'; icon = '✅'; }
                            else if (evt.trigger_type?.includes('ARMED')) { color = '#f59e0b'; icon = '🔒'; }
                            else if (evt.trigger_type?.includes('HEARTBEAT')) { color = '#3b82f6'; icon = '💓'; }
                            return (
                                <div key={evt.id} style={{ borderLeft: `3px solid ${color}`, padding: '6px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: '0 4px 4px 0' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#9ca3af' }}>
                                        <span style={{ fontWeight: 700, color: '#f0f2f5' }}>{icon} {evt.trigger_type?.replace(/_/g, ' ') || 'EVENT'}</span>
                                        <span>{evt.timestamp ? new Date(evt.timestamp).toLocaleTimeString() : ''}</span>
                                    </div>
                                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{evt.notes}</div>
                                    {evt.image_url && <a href={evt.image_url} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: '#c084fc', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 2 }}>View Snapshot <ExternalLink size={8} /></a>}
                                </div>
                            );
                        })}
                </div>
            </div>

            <div style={{ marginTop: 24, textAlign: 'center', fontSize: 10, color: '#6b7280' }}>D.R.O.P. Live Monitor — v2.2</div>
        </main>
    );
}