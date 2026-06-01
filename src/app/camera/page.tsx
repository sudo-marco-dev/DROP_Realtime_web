'use client';

import { Suspense, useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { Camera, Smartphone, Activity, ShieldAlert, CheckCircle } from 'lucide-react';

function CameraClient() {
  const searchParams = useSearchParams();
  const cameraId = searchParams.get('camera_id') || 'phone1';
  
  const [streamActive, setStreamActive] = useState(false);
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

  // 1. Initial Load: Request video stream permission
  useEffect(() => {
    addLog(`Initializing camera node "${cameraId}"...`);
    
    async function startCamera() {
      try {
        // Request back-facing camera if possible for real phone usage
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
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
        addLog('CCTV Video Feed Active (Facing: Environment/Auto)');
      } catch (err: any) {
        addLog(`Camera Access Error: ${err.message || err}`);
        // Fallback to basic video request if environment fails
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
  }, [cameraId]);

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

  return (
    <main className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
      {flashActive && (
        <div className="fixed inset-0 bg-white z-50 animate-ping pointer-events-none" />
      )}

      <div className="glass-card max-w-md w-full p-6 flex flex-col gap-6 relative overflow-hidden border border-white/5 shadow-2xl">
        
        {/* Header */}
        <div className="flex justify-between items-center pb-4 border-b border-white/5">
          <div className="flex items-center gap-2">
            <Smartphone className="text-purple-400" size={20} />
            <div>
              <h1 className="font-extrabold text-white leading-none">CCTV Remote</h1>
              <span className="text-[10px] text-gray-500 font-mono">NODE ID: {cameraId}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-slate-900 border border-white/5 px-2.5 py-1 rounded text-[10px]">
            <span className={`status-dot ${dbConnected ? 'active' : 'inactive'}`} />
            <span className="text-gray-400 font-mono">{dbConnected ? 'CONNECTED' : 'DISCONNECTED'}</span>
          </div>
        </div>

        {/* Viewfinder */}
        <div className="relative aspect-[4/3] w-full bg-black rounded-lg overflow-hidden border border-white/5 flex items-center justify-center">
          {streamActive ? (
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted 
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-gray-500 text-sm">
              <Camera size={24} className="animate-pulse" />
              <span>Requesting camera feed permissions...</span>
            </div>
          )}

          {/* Overlays */}
          <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-red-600/90 text-white font-extrabold text-[9px] px-2 py-0.5 rounded tracking-widest uppercase">
            <Activity size={10} className="animate-pulse" />
            LIVE CCTV
          </div>
        </div>

        {/* Last Snapshot Preview */}
        {lastCapturedImage && (
          <div className="flex flex-col gap-2 bg-white/2 border border-white/5 p-3 rounded-lg">
            <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-bold uppercase">
              <CheckCircle size={12} />
              <span>Snapshot Uploaded</span>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img 
              src={lastCapturedImage} 
              alt="Last Captured frame" 
              className="w-full h-32 object-cover rounded border border-white/5"
            />
          </div>
        )}

        {/* Logs Console Feed */}
        <div className="flex flex-col gap-2">
          <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">CCTV Device Console Logs</span>
          <div className="bg-black/80 border border-white/5 font-mono text-[10px] text-purple-300 p-3 rounded-lg h-32 overflow-y-auto flex flex-col gap-1">
            {logs.length === 0 ? (
              <span className="text-gray-600">Awaiting commands...</span>
            ) : (
              logs.map((log, idx) => <span key={idx}>{log}</span>)
            )}
          </div>
        </div>

      </div>

      {/* Hidden canvas for video framing */}
      <canvas ref={canvasRef} className="hidden" />
    </main>
  );
}

export default function CameraPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-gray-400 font-mono text-sm">
        Loading CCTV Camera module...
      </div>
    }>
      <CameraClient />
    </Suspense>
  );
}
