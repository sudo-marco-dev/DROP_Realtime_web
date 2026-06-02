'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { ExternalLink, Camera, Tv, ShieldAlert, Wifi, Activity } from 'lucide-react';

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

export default function MonitorPage() {
    const [latest, setLatest] = useState<DropState | null>(null);
    const [events, setEvents] = useState<any[]>([]);
    const [connected, setConnected] = useState(false);

    useEffect(() => {
        // Fetch latest state
        const fetchState = async () => {
            const { data } = await supabase
                .from('dropbox_state')
                .select('*')
                .order('id', { ascending: false })
                .limit(1);
            if (data && data.length > 0) setLatest(data[0]);
        };
        fetchState();

        // Fetch events
        const fetchEvents = async () => {
            const { data } = await supabase
                .from('events')
                .select('*')
                .order('timestamp', { ascending: false })
                .limit(10);
            if (data) setEvents(data);
        };
        fetchEvents();

        // Subscribe to state changes
        const stateChannel = supabase
            .channel('live-monitor')
            .on('postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'dropbox_state' },
                (payload: any) => { setLatest(payload.new); setConnected(true); }
            )
            .subscribe();

        // Subscribe to events
        const eventChannel = supabase
            .channel('live-events')
            .on('postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'events' },
                (payload: any) => { setEvents(prev => [payload.new, ...prev].slice(0, 20)); }
            )
            .subscribe();

        setConnected(true);

        return () => {
            supabase.removeChannel(stateChannel);
            supabase.removeChannel(eventChannel);
        };
    }, []);

    const stateColors: Record<string, string> = {
        'Locked': '#10b981',
        'Priming': '#f59e0b',
        'ReadyArm': '#8b5cf6',
        'Ready': '#3b82f6',
        'Drop': '#ec4899',
        'Open': '#f97316',
    };

    const getBadge = (st: string) => {
        const color = stateColors[st] || '#6b7280';
        return { backgroundColor: color, color: '#000', padding: '2px 10px', borderRadius: '4px', fontWeight: 700 as const, fontSize: '13px' };
    };

    const sensorRow = (label: string, value: boolean, trueLabel: string, falseLabel: string) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: value ? '#10b981' : '#ef4444', boxShadow: value ? '0 0 6px rgba(16,185,129,0.6)' : '0 0 6px rgba(239,68,68,0.6)' }} />
            <span style={{ color: '#9ca3af', fontSize: '12px', minWidth: 60 }}>{label}</span>
            <span style={{ color: '#f0f2f5', fontWeight: 700, fontSize: '13px' }}>{value ? trueLabel : falseLabel}</span>
        </div>
    );

    return (
        <main style={{
            minHeight: '100vh', background: '#0a0c10', color: '#f0f2f5',
            fontFamily: 'monospace', padding: '16px', maxWidth: 600, margin: 'auto'
        }}>
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
            <div style={{
                background: '#050505', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: 16, marginBottom: 16
            }}>
                {latest ? (
                    <>
                        {/* Header bar replica */}
                        <div style={{ background: '#fff', color: '#000', padding: '2px 8px', borderRadius: 2, marginBottom: 8, display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700 }}>
                            <span>DROP {latest.state.toUpperCase()}</span>
                            <span>{latest.in_cooldown ? 'COOLDOWN' : latest.is_tampering ? 'TAMPER!' : latest.state}</span>
                        </div>

                        {/* State-specific content */}
                        <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                            {latest.in_cooldown ? (
                                <div style={{ textAlign: 'center', padding: 8 }}>
                                    <div style={{ fontSize: 16, fontWeight: 700 }}>⏳ COOLDOWN</div>
                                    <div style={{ color: '#ef4444', fontSize: 12 }}>Too many attempts</div>
                                    <div style={{ background: '#1a222f', borderRadius: 4, height: 8, margin: '8px 0', overflow: 'hidden' }}>
                                        <div style={{ background: '#ef4444', height: '100%', width: '50%', borderRadius: 4 }} />
                                    </div>
                                </div>
                            ) : latest.is_tampering ? (
                                <div style={{ textAlign: 'center', padding: 8, animation: 'pulse 0.5s infinite' }}>
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
                ) : (
                    <div style={{ textAlign: 'center', padding: 20, color: '#6b7280' }}>Waiting for hardware data...</div>
                )}
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
                ) : (
                    <div style={{ color: '#6b7280', fontSize: 12 }}>No sensor data yet</div>
                )}
            </div>

            {/* Event History */}
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 16 }}>
                <h2 style={{ fontSize: 13, margin: '0 0 8px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Event History</h2>
                <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {events.length === 0 ? (
                        <div style={{ color: '#6b7280', fontSize: 12, padding: 16, textAlign: 'center' }}>No events yet</div>
                    ) : events.map((evt: any) => {
                        let color = '#566a85';
                        let icon = '•';
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
                                {evt.image_url && (
                                    <a href={evt.image_url} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: '#c084fc', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                                        View Snapshot <ExternalLink size={8} />
                                    </a>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Footer */}
            <div style={{ marginTop: 24, textAlign: 'center', fontSize: 10, color: '#6b7280' }}>
                D.R.O.P. Live Monitor — Updates via Supabase Realtime
            </div>
        </main>
    );
}