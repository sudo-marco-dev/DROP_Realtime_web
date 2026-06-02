'use client';

import { Suspense, useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { Camera, Smartphone, Activity, ShieldAlert, CheckCircle, Radio } from 'lucide-react';

function CameraClient() {
  const searchParams = useSearchParams();
  const cameraId = searchParams.get('camera_id') || 'phone1';

  const [streamActive, setStreamActive] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [logs, setLogs] = useState<string[]>([]);
  const [lastCapturedImage, setLastCapturedImage] = useState<string | null>(null);
  const [flashActive, setFlashActive] = useState(false);
  const [dbConnected, setDbConnected] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false); // WebRTC live streaming active

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null); // persistent ref for WebRTC track sharing
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const signalingChannelRef = useRef<any>(null);

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
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
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
        localStreamRef.current = stream; // keep for WebRTC
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setStreamActive(true);
        addLog(`CCTV Video Feed Active (Facing: ${facingMode})`);
      } catch (err: any) {
        addLog(`Camera Access Error: ${err.message || err}`);
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          streamRef.current = stream;
          localStreamRef.current = stream;
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
      // Clean up WebRTC
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
      signalingChannelRef.current?.unsubscribe();
    };
  }, [cameraId, facingMode]);

  // 2. Subscribe to Supabase Realtime Commands (camera_commands for capture)
  useEffect(() => {
    addLog(`Joining realtime commands channel for camera "${cameraId}"`);

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

  // 3. Subscribe to WebRTC signaling for live view
  useEffect(() => {
    if (!streamActive) return;

    addLog('Joining WebRTC signaling channel for live view...');

    const webrtcChannel = supabase
      .channel(`webrtc-${cameraId}`)
      .on('postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'webrtc_signaling',
          filter: `room_id=eq.${cameraId}`
        },
        async (payload: any) => {
          const row = payload.new;
          // Only process messages addressed to this camera
          if (row.receiver_id !== cameraId) return;

          if (row.type === 'offer') {
            addLog('WebRTC offer received from dashboard. Creating answer...');
            await handleOffer(row.payload);
          } else if (row.type === 'ice-candidate') {
            if (peerConnectionRef.current) {
              try {
                await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(row.payload));
                addLog('ICE candidate added from dashboard');
              } catch (e: any) {
                addLog(`ICE candidate error: ${e.message}`);
              }
            }
          }
        }
      )
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          addLog('WebRTC signaling channel ready');
        }
      });

    signalingChannelRef.current = webrtcChannel;

    return () => {
      supabase.removeChannel(webrtcChannel);
    };
  }, [cameraId, streamActive]);

  // 4. Handle incoming WebRTC offer
  const handleOffer = async (offerPayload: any) => {
    // Close any existing peer connection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    if (!localStreamRef.current) {
      addLog('No local media stream available for WebRTC');
      return;
    }

    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      peerConnectionRef.current = pc;

      // Add local tracks
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current!);
      });

      // Send ICE candidates to signaling
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          supabase.from('webrtc_signaling').insert({
            room_id: cameraId,
            sender_id: cameraId,
            receiver_id: 'dashboard',
            type: 'ice-candidate',
            payload: event.candidate.toJSON()
          }).then();
        }
      };

      pc.onconnectionstatechange = () => {
        addLog(`WebRTC connection state: ${pc.connectionState}`);
        setIsStreaming(pc.connectionState === 'connected');
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
          setIsStreaming(false);
        }
      };

      // Set remote description (offer)
      await pc.setRemoteDescription(new RTCSessionDescription(offerPayload));
      addLog('Remote description set (offer)');

      // Create and set answer
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      addLog('Answer created and set locally');

      // Send answer via Supabase
      await supabase.from('webrtc_signaling').insert({
        room_id: cameraId,
        sender_id: cameraId,
        receiver_id: 'dashboard',
        type: 'answer',
        payload: { type: answer.type, sdp: answer.sdp }
      });
      addLog('Answer sent to signaling channel');

    } catch (e: any) {
      addLog(`WebRTC offer handling error: ${e.message}`);
    }
  };

  // 5. Frame capture and Supabase upload handler (existing)
  const handleCapture = async (cmd: any) => {
    if (!videoRef.current || !canvasRef.current) {
      addLog('Capture failed: video/canvas stream elements not ready');
      return;
    }

    addLog(`Capturing frame for command correlation: ${cmd.correlation_id}`);

    setFlashActive(true);
    setTimeout(() => setFlashActive(false), 150);

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(async (blob) => {
        if (!blob) {
          addLog('Failed to generate image blob from canvas');
          return;
        }

        const timestampStr = Date.now();
        const filePath = `${cameraId}/${timestampStr}.jpg`;

        addLog('Uploading photo to Supabase storage bucket "drop-captures"...');

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

        const { data: urlData } = supabase.storage
          .from('drop-captures')
          .getPublicUrl(filePath);

        const imageUrl = urlData.publicUrl;
        setLastCapturedImage(imageUrl);
        addLog(`Photo upload success! Public URL: ${imageUrl}`);

        addLog(`Updating command status to "done" for command ID: ${cmd.id}...`);
        const { error: updateError } = await supabase
          .from('camera_commands')
          .update({ status: 'done' })
          .eq('id', cmd.id);

        if (updateError) {
          addLog(`Status update warning: ${updateError.message}`);
        }

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

        // Send Discord notification directly from the phone
        try {
          const resp = await fetch('/api/notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              trigger_type: cmd.trigger_type || 'REMOTE_TRIGGER',
              image_url: imageUrl,
              timestamp: Date.now(),
              notes: triggerNotes,
              camera_id: cameraId
            })
          });
          if (resp.ok) addLog('Discord notification sent!');
        } catch (e) { addLog('Discord notify error'); }
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
            {isStreaming ? 'STREAMING' : 'LIVE CCTV'}
          </div>

          {/* WebRTC Streaming Badge */}
          {isStreaming && (
            <div style={{
              position: 'absolute',
              top: '8px',
              right: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              background: 'rgba(16, 185, 129, 0.9)',
              color: 'white',
              fontWeight: 800,
              fontSize: '8px',
              padding: '2px 6px',
              borderRadius: '4px',
              letterSpacing: '0.1em',
              textTransform: 'uppercase' as const,
            }}>
              <Radio size={8} />
              WEBRTC
            </div>
          )}
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