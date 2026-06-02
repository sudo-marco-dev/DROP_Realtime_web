'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { ExternalLink, Tv, Copy, Camera, Bell } from 'lucide-react';

interface SnapWithCam {
    id: string;
    image_url: string;
    camera_id: string;
    trigger_type: string;
    timestamp: string;
    notes: string;
}

export default function MonitorPage() {
    const [events, setEvents] = useState<any[]>([]);
    const [capturing, setCapturing] = useState(false);
    const [address, setAddress] = useState('');
    const [pin, setPin] = useState('');
    const [copied, setCopied] = useState(false);
    const [soundEnabled, setSoundEnabled] = useState(true);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const prevSnapId = useRef<string | null>(null);

    // Multi-camera snaps
    const [snaps, setSnaps] = useState<SnapWithCam[]>([]);
    const [activeSnapIdx, setActiveSnapIdx] = useState(0);

    // Load saved address + pin
    useEffect(() => {
        const saved = localStorage.getItem('drop_address');
        if (saved) setAddress(saved);
        const savedPin = localStorage.getItem('drop_pin');
        if (savedPin) setPin(savedPin);
    }, []);

    // Save address and pin to localStorage
    useEffect(() => { localStorage.setItem('drop_address', address); }, [address]);
    useEffect(() => { localStorage.setItem('drop_pin', pin); }, [pin]);

    // Notification sound
    const playNotify = () => {
        if (!soundEnabled) return;
        try {
            if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
            const ctx = audioCtxRef.current;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, ctx.currentTime);
            gain.gain.setValueAtTime(0.15, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
            osc.connect(gain).connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.3);
        } catch { }
    };

    // Fetch events + track captures by camera
    useEffect(() => {
        const fetchEvents = async () => {
            const { data } = await supabase.from('events').select('*').order('timestamp', { ascending: false }).limit(20);
            if (data) {
                setEvents(data);
                const snapList: SnapWithCam[] = data
                    .filter(e => e.image_url)
                    .map(e => ({
                        id: e.id,
                        image_url: e.image_url,
                        camera_id: extractCamId(e.notes) || 'unknown',
                        trigger_type: e.trigger_type,
                        timestamp: e.timestamp,
                        notes: e.notes
                    }));
                setSnaps(snapList);
                if (snapList.length > 0) setActiveSnapIdx(0);
            }
        };
        fetchEvents();
        const ec = supabase.channel('m-events').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events' }, (p: any) => {
            const evt = p.new;
            setEvents((prev: any[]) => [evt, ...prev].slice(0, 20));
            if (evt.image_url) {
                if (prevSnapId.current !== evt.id) {
                    prevSnapId.current = evt.id;
                    playNotify();
                    const newSnap: SnapWithCam = {
                        id: evt.id,
                        image_url: evt.image_url,
                        camera_id: extractCamId(evt.notes) || 'unknown',
                        trigger_type: evt.trigger_type,
                        timestamp: evt.timestamp,
                        notes: evt.notes
                    };
                    setSnaps(prev => [newSnap, ...prev]);
                    setActiveSnapIdx(0);
                    // Send Discord notification
                    fetch('/api/notify', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            trigger_type: evt.trigger_type,
                            image_url: evt.image_url,
                            timestamp: evt.timestamp || Date.now(),
                            notes: evt.notes,
                            camera_id: extractCamId(evt.notes) || 'camera'
                        })
                    }).catch(() => { });
                }
            }
        }).subscribe();
        return () => { supabase.removeChannel(ec); };
    }, [soundEnabled]);

    const extractCamId = (notes: string) => {
        const m = notes?.match(/uploaded by ([a-zA-Z0-9_-]+)/i);
        return m ? m[1] : null;
    };

    const captureNow = async () => {
        setCapturing(true);
        for (const cam of ['phone1', 'phone2']) {
            await supabase.from('camera_commands').insert({
                camera_id: cam, command: 'capture', status: 'pending',
                trigger_type: 'MANUAL_TEST', notes: 'Manual trigger from monitor'
            });
        }
        setTimeout(() => setCapturing(false), 2000);
    };

    const getMessage = () => {
        const addr = address || '[address]';
        const p = pin || '[PIN]';
        return `Maayong araw po! Wala po ako sa bahay ngayon pero may DROP BOX po kami sa labas. Pwede niyo po gamitin para i-deliver yung parcel.

📍 Address: ${addr}
🔑 PIN: ${p}
⏰ Valid: 24 hours

Paano gamitin:
1. I-input ang PIN ${p} sa keypad
2. Pindutin ang #
3. Ilagay ang parcel sa loob
4. Isara ang lid at pindutin ang *

Maraming salamat po!`;
    };

    const copyMessage = () => {
        navigator.clipboard.writeText(getMessage());
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const parseSensors = (notes: string) => {
        const s: Record<string, string> = {};
        notes?.split('|').forEach(part => {
            const trimmed = part.trim();
            const pairs = trimmed.split(' ');
            pairs.forEach(p => {
                const [k, v] = p.split(':');
                if (k && v) s[k.trim()] = v.trim();
            });
        });
        return s;
    };

    const sensorDot = (val: string, yesLabel: string, noLabel: string) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginRight: 12, fontSize: 11 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: val === 'Y' ? '#10b981' : '#6b7280', display: 'inline-block' }} />
            {val === 'Y' ? yesLabel : noLabel}
        </span>
    );

    const activeSnap = snaps[activeSnapIdx] || null;

    return (
        <main style={{ minHeight: '100vh', background: '#0a0c10', color: '#f0f2f5', fontFamily: 'monospace', padding: 16, maxWidth: 600, margin: 'auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 12, marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Tv size={20} color="#ffaa00" />
                    <h1 style={{ fontSize: 18, margin: 0 }}>D.R.O.P. <span style={{ color: '#ffaa00' }}>Monitor</span></h1>
                </div>
                <button onClick={() => setSoundEnabled(!soundEnabled)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, color: soundEnabled ? '#10b981' : '#6b7280' }} title="Toggle notification sound">
                    <Bell size={16} />
                </button>
            </div>

            {/* Rider Message Generator */}
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
                <h2 style={{ fontSize: 13, margin: '0 0 12px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    📨 Rider Message
                </h2>

                <input type="text" value={address} onChange={e => setAddress(e.target.value)}
                    placeholder="Delivery address"
                    style={{ background: '#131720', color: '#f0f2f5', border: '1px solid rgba(255,255,255,0.1)', padding: 10, borderRadius: 6, width: '100%', fontSize: 13, marginBottom: 8, boxSizing: 'border-box' }} />

                <input type="text" value={pin} onChange={e => setPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                    placeholder="PIN (e.g., 2222)"
                    style={{ background: '#131720', color: '#10b981', border: '1px solid rgba(255,255,255,0.1)', padding: 10, borderRadius: 6, width: '100%', fontSize: 13, marginBottom: 8, boxSizing: 'border-box', fontWeight: 700, letterSpacing: '0.2em' }} />

                <div style={{ background: '#050505', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: 12, fontSize: 12, color: '#d1d5db', whiteSpace: 'pre-wrap', marginBottom: 8, maxHeight: 160, overflowY: 'auto', lineHeight: 1.6 }}>
                    {getMessage()}
                </div>

                <button onClick={copyMessage} style={{ background: copied ? '#10b981' : '#1f293d', color: copied ? '#000' : '#f0f2f5', border: '1px solid rgba(255,255,255,0.1)', padding: '10px', fontWeight: 600, borderRadius: 6, cursor: 'pointer', width: '100%', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <Copy size={12} /> {copied ? 'Copied!' : 'Copy Message'}
                </button>
            </div>

            {/* Last Capture with Camera Toggle */}
            {snaps.length > 0 && activeSnap && (
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <h2 style={{ fontSize: 13, margin: 0, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Camera size={14} /> Last Capture
                        </h2>
                        {/* Camera Toggle */}
                        {snaps.length > 1 && (
                            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                <button onClick={() => setActiveSnapIdx(i => i - 1)}
                                    disabled={activeSnapIdx <= 0}
                                    style={{ background: '#1f293d', border: '1px solid rgba(255,255,255,0.1)', color: '#f0f2f5', padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>◀</button>
                                <span style={{ fontSize: 11, color: '#9ca3af', minWidth: 40, textAlign: 'center' }}>
                                    {activeSnap.camera_id}
                                </span>
                                <button onClick={() => setActiveSnapIdx(i => i + 1)}
                                    disabled={activeSnapIdx >= snaps.length - 1}
                                    style={{ background: '#1f293d', border: '1px solid rgba(255,255,255,0.1)', color: '#f0f2f5', padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>▶</button>
                            </div>
                        )}
                    </div>

                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={activeSnap.image_url} alt={`Capture from ${activeSnap.camera_id}`} style={{ width: '100%', borderRadius: 6, marginBottom: 8, border: '1px solid rgba(255,255,255,0.05)' }} />

                    {activeSnap.notes && (
                        <div style={{ background: '#131720', borderRadius: 6, padding: '8px 12px', fontSize: 12, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            <span style={{ color: '#9ca3af', marginRight: 4 }}>Sensors:</span>
                            {(() => {
                                const s = parseSensors(activeSnap.notes);
                                return (
                                    <>
                                        {sensorDot(s['Lid'], 'Lid:Closed', 'Lid:Open')}
                                        {sensorDot(s['Pcl'], 'Parcel:Yes', 'Parcel:No')}
                                        {sensorDot(s['Tlt'], 'Tilt:Yes!', 'Tilt:No')}
                                        {sensorDot(s['Tamper'], 'Alarm:ON', 'Alarm:OFF')}
                                        {sensorDot(s['Cooldown'], 'Cooldown:ON', 'Cooldown:OFF')}
                                        {s['Bal'] !== undefined && <span style={{ color: '#9ca3af', marginRight: 4 }}>Bal:{s['Bal']}</span>}
                                    </>
                                );
                            })()}
                        </div>
                    )}

                    <div style={{ fontSize: 10, color: '#6b7280', marginTop: 4, textAlign: 'right' }}>
                        {new Date(activeSnap.timestamp).toLocaleString()} — {activeSnap.trigger_type?.replace(/_/g, ' ')}
                    </div>
                </div>
            )}

            {/* Capture Button */}
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
                <button onClick={captureNow} disabled={capturing} style={{ background: '#8b5cf6', color: '#fff', border: 'none', padding: '12px 16px', fontWeight: 700, borderRadius: 6, cursor: 'pointer', width: '100%', fontSize: 14 }}>
                    {capturing ? 'Capturing...' : '📸 Capture Photo Now'}
                </button>
            </div>

            {/* Event History */}
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 16 }}>
                <h2 style={{ fontSize: 13, margin: '0 0 8px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Event History</h2>
                <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {events.length === 0 ? <div style={{ color: '#6b7280', fontSize: 12, padding: 16, textAlign: 'center' }}>No events yet</div>
                        : events.slice(0, 15).map((evt: any) => {
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
            <div style={{ marginTop: 24, textAlign: 'center', fontSize: 10, color: '#6b7280' }}>D.R.O.P. Monitor — v2.4</div>
        </main>
    );
}