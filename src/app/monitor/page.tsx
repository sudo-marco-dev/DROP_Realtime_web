'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { ExternalLink, Tv } from 'lucide-react';

export default function MonitorPage() {
    const [events, setEvents] = useState<any[]>([]);
    const [capturing, setCapturing] = useState(false);

    useEffect(() => {
        const fetchEvents = async () => {
            const { data } = await supabase.from('events').select('*').order('timestamp', { ascending: false }).limit(10);
            if (data) setEvents(data);
        };
        fetchEvents();
        const ec = supabase.channel('m-events').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events' }, (p: any) => setEvents((prev: any[]) => [p.new, ...prev].slice(0, 20))).subscribe();
        return () => { supabase.removeChannel(ec); };
    }, []);

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

    return (
        <main style={{ minHeight: '100vh', background: '#0a0c10', color: '#f0f2f5', fontFamily: 'monospace', padding: 16, maxWidth: 600, margin: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 12, marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Tv size={20} color="#ffaa00" />
                    <h1 style={{ fontSize: 18, margin: 0 }}>D.R.O.P. <span style={{ color: '#ffaa00' }}>Monitor</span></h1>
                </div>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
                <button onClick={captureNow} disabled={capturing} style={{ background: '#8b5cf6', color: '#fff', border: 'none', padding: '12px 16px', fontWeight: 700, borderRadius: 6, cursor: 'pointer', width: '100%', fontSize: 14 }}>
                    {capturing ? 'Capturing...' : '📸 Capture Photo Now'}
                </button>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 16 }}>
                <h2 style={{ fontSize: 13, margin: '0 0 8px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Event History</h2>
                <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {events.length === 0 ? <div style={{ color: '#6b7280', fontSize: 12, padding: 16, textAlign: 'center' }}>No events</div>
                        : events.map((evt: any) => {
                            let color = '#566a85', icon = '•';
                            if (evt.trigger_type?.includes('TAMPER') || evt.trigger_type?.includes('WRONG_PIN')) { color = '#ef4444'; icon = '🚨'; }
                            else if (evt.trigger_type?.includes('DELIVERY') || evt.trigger_type?.includes('OWNER')) { color = '#10b981'; icon = '✅'; }
                            else if (evt.trigger_type?.includes('ARMED')) { color = '#f59e0b'; icon = '🔒'; }
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