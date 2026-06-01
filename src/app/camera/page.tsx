'use client';

import { Suspense, useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { Camera, Smartphone, Activity, ShieldAlert, CheckCircle } from 'lucide-react';

function CameraClient() {
  const searchParams = useSearchParams();
  const cameraId = searchParams.get('camera_id') || 'phone1';
  
  const [streamActive, setStreamActive] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [logs, setLogs] = useState<string[]>([]);
  const [lastCapturedImage, setLastCapturedImage] = useState<string | null>(null);
  const [flashActive, setFlashActive] = useState(false);
  const [dbConnected, setDbConnected] = useState(true);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [`[${time}] ${msg}`, ...prev.slice(0, 19)]);
  };

  // 1. Initial Load & Camera Toggle: Request video stream permission
  useEffect(() => {
    addLog(`Initializing camera node "${cameraId}" (${facingMode} facing)...`);
    
    // Stop any existing streams before requesting a new one
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: facingMode,
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        });

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setStreamActive(true);
        addLog(`CCTV Video Feed Active (Facing: ${facingMode})`);
      } catch (err: any) {
        addLog(`Camera Access Error: ${err.message || err}`);
        // Fallback to basic video request if preferred mode fails
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
          setStreamActive(true);
          addLog('CCTV Video Feed Active (Fallback Standard)');
        } catch (fallbackErr: any) {
          addLog(`CCTV Hard Failure: ${fallbackErr.message || fallbackErr}`);
        }
      }
    }

    startCamera();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [cameraId, facingMode]);

  // 2. Subscribe to Supabase Realtime Commands
  useEffect(() => {
    addLog(`Joining realtime commands channel for camera "${cameraId}"`);
    
    // Connect to Supabase Realtime channel
    const commandChannel = supabase
      .channel(`cctv-commands:${cameraId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'camera_commands',
          filter: `camera_id=eq.${cameraId}`
        },
        async (payload) => {
          const cmd = payload.new;
          addLog(`Realtime Command Received: ID ${cmd.id}, status: ${cmd.status}`);
          
          if (cmd.status === 'pending') {
            await handleCapture(cmd);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          addLog('Realtime replication channel connected & listening');
          setDbConnected(true);
        } else {
          setDbConnected(false);
        }
      });

    return () => {
      supabase.removeChannel(commandChannel);
    };
  }, [cameraId]);

  // 3. Frame capture and Supabase upload handler
  const handleCapture = async (cmd: any) => {
    if (!videoRef.current || !canvasRef.current) {
      addLog('Capture failed: video/canvas stream elements not ready');
      return;
    }

    addLog(`Capturing frame for command correlation: ${cmd.correlation_id}`);
    
    // Flash effect
    setFlashActive(true);
    setTimeout(() => setFlashActive(false), 150);

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Draw current video frame to canvas
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Convert to blob and upload
      canvas.toBlob(async (blob) => {
        if (!blob) {
          addLog('Failed to generate image blob from canvas');
          return;
        }

        const timestampStr = Date.now();
        const filePath = `${cameraId}/${timestampStr}.jpg`;

        addLog('Uploading photo to Supabase storage bucket "drop-captures"...');

        // Upload image to Supabase Storage
        const { error: uploadError } = await supabase.storage
          .from('drop-captures')
          .upload(filePath, blob, {
            contentType: 'image/jpeg',
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) {
          addLog(`Upload error: ${uploadError.message}`);
          throw uploadError;
        }

        // Get public URL
        const { data: urlData } = supabase.storage
          .from('drop-captures')
          .getPublicUrl(filePath);

        const imageUrl = urlData.publicUrl;
        setLastCapturedImage(imageUrl);
        addLog(`Photo upload success! Public URL: ${imageUrl}`);

        // Update command status to 'done'
        addLog(`Updating command status to "done" for command ID: ${cmd.id}...`);
        const { error: updateError } = await supabase
          .from('camera_commands')
          .update({ status: 'done' })
          .eq('id', cmd.id);

        if (updateError) {
          addLog(`Status update warning: ${updateError.message}`);
        }

        // Insert new row in events table to register the capture
        addLog('Inserting audit log event in "events" table...');
        const triggerNotes = cmd.notes 
          ? `${cmd.notes} (Remote photo uploaded by ${cameraId})`
          : `Remote photo uploaded by ${cameraId}`;

        const { error: eventError } = await supabase
          .from('events')
          .insert({
            trigger_type: cmd.trigger_type || 'REMOTE_TRIGGER',
            image_url: imageUrl,
            notes: triggerNotes,
            correlation_id: cmd.correlation_id
          });

        if (eventError) {
          addLog(`Event log insert error: ${eventError.message}`);
          throw eventError;
        }

        addLog(`Transaction completed for correlation: ${cmd.correlation_id}`);
      }, 'image/jpeg', 0.85);

    } catch (e: any) {
      addLog(`Execution error during capture transaction: ${e.message || e}`);
    }
  };

  const toggleCamera = () => {
    setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
  };

  return (
    <main style={{
      minHeight: '100vh',
      background: '#020617',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'flex-start',
      padding: '8px',
      overflowY: 'auto',
      boxSizing: 'border-box',
    }}>
      {flashActive && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'white',
          zIndex: 50,
          pointerEvents: 'none',
          animation: 'ping 0.15s ease-out',
        }} />
      )}

      <div className="glass-card" style={{
        maxWidth: '420px',
        width: '100%',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        position: 'relative',
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.05)',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.6)',
      }}>
        
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingBottom: '12px',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Smartphone style={{ color: '#a78bfa' }} size={20} />
            <div>
              <h1 style={{
                fontWeight: 800,
                color: 'white',
                lineHeight: 1,
                fontSize: '16px',
                margin: 0,
              }}>CCTV Remote</h1>
              <span style={{
                fontSize: '10px',
                color: '#6b7280',
                fontFamily: "'Share Tech Mono', monospace",
              }}>NODE ID: {cameraId}</span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: '#0f172a',
              border: '1px solid rgba(255,255,255,0.05)',
              padding: '4px 10px',
              borderRadius: '4px',
              fontSize: '10px',
            }}>
              <span className={`status-dot ${dbConnected ? 'active' : 'inactive'}`} />
              <span style={{ color: '#9ca3af', fontFamily: "'Share Tech Mono', monospace" }}>
                {dbConnected ? 'CONNECTED' : 'DISCONNECTED'}
              </span>
            </div>
            <button 
              onClick={toggleCamera}
              style={{
                fontSize: '10px',
                background: '#9333ea',
                color: 'white',
                padding: '4px 8px',
                borderRadius: '4px',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Flip Camera
            </button>
          </div>
        </div>

        {/* Viewfinder */}
        <div style={{
          position: 'relative',
          aspectRatio: '4 / 3',
          width: '100%',
          background: '#000',
          borderRadius: '8px',
          overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.05)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {streamActive ? (
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted 
              onLoadedMetadata={() => videoRef.current?.play()}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transform: facingMode === 'user' ? 'scaleX(-1)' : 'none',
              }}
            />
          ) : (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
              color: '#6b7280',
              fontSize: '14px',
            }}>
              <Camera size={24} style={{ opacity: 0.6 }} />
              <span>Requesting camera feed permissions...</span>
            </div>
          )}

          {/* LIVE Badge Overlay */}
          <div style={{
            position: 'absolute',
            top: '8px',
            left: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'rgba(220, 38, 38, 0.9)',
            color: 'white',
            fontWeight: 800,
            fontSize: '9px',
            padding: '3px 8px',
            borderRadius: '4px',
            letterSpacing: '0.1em',
            textTransform: 'uppercase' as const,
          }}>
            <Activity size={10} />
            LIVE CCTV
          </div>
        </div>

        {/* Last Snapshot Preview */}
        {lastCapturedImage && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.05)',
            padding: '12px',
            borderRadius: '8px',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              color: '#34d399',
              fontWeight: 700,
              textTransform: 'uppercase' as const,
            }}>
              <CheckCircle size={12} />
              <span>Snapshot Uploaded</span>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img 
              src={lastCapturedImage} 
              alt="Last Captured frame" 
              style={{
                width: '100%',
                height: '80px',
                objectFit: 'cover',
                borderRadius: '4px',
                border: '1px solid rgba(255,255,255,0.05)',
              }}
            />
          </div>
        )}

        {/* Logs Console Feed */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{
            fontSize: '10px',
            color: '#6b7280',
            fontWeight: 700,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.05em',
          }}>CCTV Device Console Logs</span>
          <div style={{
            background: 'rgba(0,0,0,0.8)',
            border: '1px solid rgba(255,255,255,0.05)',
            fontFamily: "'Share Tech Mono', monospace",
            fontSize: '10px',
            color: '#c4b5fd',
            padding: '12px',
            borderRadius: '8px',
            height: '80px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}>
            {logs.length === 0 ? (
              <span style={{ color: '#4b5563' }}>Awaiting commands...</span>
            ) : (
              logs.map((log, idx) => <span key={idx}>{log}</span>)
            )}
          </div>
        </div>

      </div>

      {/* Hidden canvas for video framing */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </main>
  );
}

export default function CameraPage() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: '100vh',
        background: '#020617',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#9ca3af',
        fontFamily: "'Share Tech Mono', monospace",
        fontSize: '14px',
      }}>
        Loading CCTV Camera module...
      </div>
    }>
      <CameraClient />
    </Suspense>
  );
}
