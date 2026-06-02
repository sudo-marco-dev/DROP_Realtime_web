'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { ExternalLink, Camera, Tv, ShieldAlert, Wifi, Activity } from 'lucide-react';

export default function MonitorPage() {
    const [espIp, setEspIp] = useState('');
    const [espData, setEspData] = useState<any>(null);
    const [events, setEvents] = useState<any[]>([]);
    const [capturing, setCapturing] = useState(false);

    useEffect(() => {
        const saved = localStorage.getItem('esp_ip');
        if (saved) setEspIp(saved);
        fetchEvents();
        const ec = supabase.channel('m-events').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events' }, (p: any) => setEvents((prev: any[]) => [p.new, ...prev].slice(0, 20))).subscribe();
        return () => { supabase.removeChannel(ec); };
    }, []);

    const fetchEvents = async () => {
        const { data } = await supabase.from('events').select('*').order('timestamp', { ascending: false }).limit(10);
        if (data) setEvents(data);
    };

    const pollEsp = async () => {
        if (!espIp) return;
        try {
            const r = await fetch(`http://${espIp}/api/status`, { mode: 'cors' });
            const d = await r.json();
            setEspData(d);
        } catch { setEspData(null); }
    };

    const captureNow = async () => {
        setCapturing(true);
        const ids = ['phone1', 'phone2']; // or read from ESP ip config
        for (const cam of ids) {
            await supabase.from('camera_commands').insert({
                camera_id: cam, command: 'capture', status: 'pending',
                trigger_type: 'MANUAL_TEST', notes: 'Manual trigger from monitor'
            });
        }
        setTimeout(() => setCapturing(false), 2000);
    };

    // commit changes
    const saveIp = () => { localStorage.setItem('esp_ip', espIp); pollEsp(); };

    const sensorRow = (label: string, value: boolean, t: string, f: string) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: value ? '#10b981' : '#ef4444' }} />
            <span style={{ color: '#9ca3af', fontSize: 12, minWidth: 60 }}>{label}</span>
            <span style={{ color: '#f0f2f5', fontWeight: 700, fontSize: 13 }}>{value ? t : f}</span>
        </div>
    );

    return (
        <main style={{ minHeight: '100vh', background: '#0a0c10', color: '#f0f2f5', fontFamily: 'monospace', padding: 16, maxWidth: 600, margin: 'auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 12, marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Tv size={20} color="#ffaa00" />
                    <h1 style={{ fontSize: 18, margin: 0 }}>D.R.O.P. <span style={{ color: '#ffaa00' }}>Monitor</span></h1>
                </div>
            </div>

            {/* ESP32 IP + Refresh */}
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <input type="text" value={espIp} onChange={e => setEspIp(e.target.value)} placeholder="192.168.1.50" style={{ flex: 1, background: '#131720', color: '#f0f2f5', border: '1px solid rgba(255,255,255,0.1)', padding: 10, borderRadius: 6, fontSize: 13 }} />
                    <button onClick={saveIp} style={{ background: '#10b981', color: '#000', border: 'none', padding: '10px 16px', fontWeight: 700, borderRadius: 6, cursor: 'pointer' }}>Save</button>
                    <button onClick={pollEsp} style={{ background: '#1f293d', color: '#f0f2f5', border: '1px solid rgba(255,255,255,0.1)', padding: '10px 16px', fontWeight: 700, borderRadius: 6, cursor: 'pointer' }}>Refresh</button>
                </div>
                <button onClick={captureNow} disabled={capturing} style={{ background: '#8b5cf6', color: '#fff', border: 'none', padding: '10px 16px', fontWeight: 700, borderRadius: 6, cursor: 'pointer', width: '100%' }}>
                    {capturing ? 'Capturing...' : '📸 Capture Photo Now'}
                </button>
            </div>

            {/* ESP32 Status */}
            {espData && (
                <div style={{ background: '#050505', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
                    <div style={{ background: '#fff', color: '#000', padding: '2px 8px', borderRadius: 2, marginBottom: 8, fontSize: 11, fontWeight: 700 }}>DROP {espData.state}</div>
                    {sensorRow('Lid', espData.lid_closed, 'CLOSED', 'OPEN')}
                    {sensorRow('Parcel', espData.parcel_present, 'PRESENT', 'EMPTY')}
                    {sensorRow('Tilt', espData.tilt_detected, 'DETECTED!', 'SAFE')}
                    {sensorRow('Tamper', espData.is_tampering, 'ACTIVE!', 'INACTIVE')}
                    {sensorRow('Cooldown', espData.in_cooldown, 'LOCKED', 'CLEAR')}
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Wifi size={14} color={espData.wifi_connected ? '#10b981' : '#ef4444'} />
                        <span style={{ fontSize: 12, color: '#9ca3af' }}>{espData.wifi_connected ? `Connected – ${espData.ip}` : 'AP Mode'}</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>Buffer: {espData.input_buffer} | Balance: ${espData.primed_amount}</div>
                </div>
            )}
            {!espData && <div style={{ color: '#6b7280', fontSize: 12, marginBottom: 16, textAlign: 'center' }}>Enter ESP32 IP and press Save to poll.</div>}

            {/* Event History */}
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 16 }}>
                <h2 style={{ fontSize: 13, margin: '0 0 8px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Event History</h2>
                <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {events.length === 0 ? <div style={{ color: '#6b7280', fontSize: 12, padding: 16, textAlign: 'center' }}>No events</div>
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
                                    {evt.image_url && <a href={evt.image_url} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: '#c084fc', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 2 }}>Snapshot <ExternalLink size={8} /></a>}
                                </div>
                            );
                        })}
                </div>
            </div>
            <div style={{ marginTop: 24, textAlign: 'center', fontSize: 10, color: '#6b7280' }}>D.R.O.P. Monitor</div>
        </main>
    );
}