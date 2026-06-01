'use client';

import { useReducer, useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
  dropReducer,
  INITIAL_STATE,
  pad16,
  getOledTitle,
  SystemState,
  DropState
} from '@/lib/dropboxStateMachine';
import {
  playInputBeep,
  playSuccessBeep,
  playErrorBeep,
  playBootBeep,
  startSiren,
  stopSiren
} from '@/lib/audio';
import { QRCodeSVG } from 'qrcode.react';
import {
  Tv,
  Lock,
  Unlock,
  Sliders,
  Camera,
  FileText,
  RefreshCw,
  Plus,
  Smartphone,
  Laptop,
  ExternalLink,
  Info,
  ShieldAlert,
  Settings,
  BellRing,
  Trash2,
  Radio,
  Eye,
  X
} from 'lucide-react';

interface Camera {
  id: string;
  active: boolean;
  lastSeen: number | null;   // timestamp (ms)
  label: string;             // user-friendly name
}

export default function SimulationPage() {
  const [state, dispatch] = useReducer(dropReducer, INITIAL_STATE);

  // Camera management state
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [cameraMode, setCameraMode] = useState<'single' | 'multi'>('single');
  const [primaryCameraId, setPrimaryCameraId] = useState<string | null>(null);
  const [newCameraId, setNewCameraId] = useState('');
  const [webcamFallback, setWebcamFallback] = useState(false);
  const [showQRForCamera, setShowQRForCamera] = useState<string | null>(null);
  const [cameraUrlHost, setCameraUrlHost] = useState('');
  const [lastCapturedImage, setLastCapturedImage] = useState<string | null>(null);

  // PIN change states
  const [ownerPinInput, setOwnerPinInput] = useState('');
  const [riderPinInput, setRiderPinInput] = useState('');
  const [showPinSettings, setShowPinSettings] = useState(false);

  // Log list
  const [eventsList, setEventsList] = useState<any[]>([]);
  const [isDbConnected, setIsDbConnected] = useState(true);

  // References
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Audio Context lock
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  // WebRTC Live View state
  const [liveCameraId, setLiveCameraId] = useState<string | null>(null);
  const [liveStream, setLiveStream] = useState<MediaStream | null>(null);
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const signalingChannelRef = useRef<any>(null);

  // Helper: persist camera settings to localStorage
  const persistCameras = (cams: Camera[], mode: string, primary: string | null) => {
    localStorage.setItem('dropCameras', JSON.stringify(cams));
    localStorage.setItem('dropCameraMode', mode);
    if (primary) localStorage.setItem('dropPrimaryCamera', primary);
    else localStorage.removeItem('dropPrimaryCamera');
  };

  // WebRTC: start live view
  const startLiveView = async (cameraId: string) => {
    // Close any existing connection
    stopLiveView();

    setLiveCameraId(cameraId);
    setLiveStream(null);

    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      peerConnectionRef.current = pc;

      pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          setLiveStream(event.streams[0]);
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          supabase.from('webrtc_signaling').insert({
            room_id: cameraId,
            sender_id: 'dashboard',
            receiver_id: cameraId,
            type: 'ice-candidate',
            payload: event.candidate.toJSON()
          }).then();
        }
      };

      // Subscribe to signaling answers and ICE candidates
      const channel = supabase
        .channel(`webrtc-${cameraId}`)
        .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'webrtc_signaling', filter: `room_id=eq.${cameraId}` },
          async (payload: any) => {
            const row = payload.new;
            if (row.receiver_id !== 'dashboard') return;

            if (row.type === 'answer') {
              const remoteDesc = new RTCSessionDescription(row.payload);
              await pc.setRemoteDescription(remoteDesc);
            } else if (row.type === 'ice-candidate') {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(row.payload));
              } catch (e) { console.warn('ICE candidate error', e); }
            }
          }
        )
        .subscribe();
      signalingChannelRef.current = channel;

      // Create offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await supabase.from('webrtc_signaling').insert({
        room_id: cameraId,
        sender_id: 'dashboard',
        receiver_id: cameraId,
        type: 'offer',
        payload: { type: offer.type, sdp: offer.sdp }
      });
    } catch (e) {
      console.error('Failed to start live view:', e);
    }
  };

  // WebRTC: stop live view
  const stopLiveView = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (signalingChannelRef.current) {
      signalingChannelRef.current.unsubscribe();
      signalingChannelRef.current = null;
    }
    if (liveStream) {
      liveStream.getTracks().forEach(t => t.stop());
    }
    setLiveCameraId(null);
    setLiveStream(null);
  };

  // 1. Initial Load
  useEffect(() => {
    playBootBeep();
    setCameraUrlHost(window.location.origin);

    try {
      const savedState = localStorage.getItem('drop_system_state');
      if (savedState) {
        const parsed = JSON.parse(savedState);
        let inCooldown = parsed.inCooldown ?? false;
        let lockoutTimer = parsed.lockoutTimer ?? null;
        if (inCooldown && lockoutTimer && Date.now() >= lockoutTimer) {
          inCooldown = false;
          lockoutTimer = null;
        }
        dispatch({
          type: 'SET_STATE', state: {
            currentState: parsed.currentState ?? 'STATE_IDLE',
            primedAmount: parsed.primedAmount ?? 0,
            ownerPin: parsed.ownerPin ?? '1234',
            riderPin: parsed.riderPin ?? '5678',
            isLocked: parsed.isLocked ?? true,
            lcdLine1: inCooldown ? parsed.lcdLine1 : (parsed.lcdLine1 ?? 'SYSTEM LOCKED'),
            lcdLine2: inCooldown ? parsed.lcdLine2 : (parsed.lcdLine2 ?? 'PIN: '),
            oledFace: inCooldown ? parsed.oledFace : (parsed.oledFace ?? '(-_-)'),
            failedAttempts: parsed.failedAttempts ?? 0,
            inCooldown: inCooldown,
            lockoutTimer: lockoutTimer,
            remainingCountdown: inCooldown ? Math.max(0, Math.ceil(((lockoutTimer ?? Date.now()) - Date.now()) / 1000)) : 0,
            lastTamperAlert: parsed.lastTamperAlert ?? null,
            lastWrongPinAlert: parsed.lastWrongPinAlert ?? null,
          }
        });
        setOwnerPinInput(parsed.ownerPin ?? '1234');
        setRiderPinInput(parsed.riderPin ?? '5678');
      } else {
        setOwnerPinInput('1234');
        setRiderPinInput('5678');
      }

      const savedCameras = localStorage.getItem('dropCameras');
      const savedMode = localStorage.getItem('dropCameraMode');
      const savedPrimary = localStorage.getItem('dropPrimaryCamera');
      if (savedCameras) {
        const parsed: Camera[] = JSON.parse(savedCameras);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setCameras(parsed);
          if (savedMode === 'single' || savedMode === 'multi') setCameraMode(savedMode);
          if (savedPrimary && parsed.find(c => c.id === savedPrimary)) setPrimaryCameraId(savedPrimary);
          else {
            const firstActive = parsed.find(c => c.active);
            if (firstActive) setPrimaryCameraId(firstActive.id);
          }
        }
      } else {
        const oldCameras = localStorage.getItem('drop_camera_ids');
        if (oldCameras) {
          const parsed = JSON.parse(oldCameras);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const migrated: Camera[] = parsed.map((id: string) => ({ id, active: true, lastSeen: null, label: `Camera ${id}` }));
            setCameras(migrated);
            setPrimaryCameraId(migrated[0].id);
            persistCameras(migrated, 'single', migrated[0].id);
          }
        }
      }
    } catch (e) { console.error('Failed to load local storage state:', e); }

    const fetchEvents = async () => {
      try {
        const { data, error } = await supabase.from('events').select('*').order('timestamp', { ascending: false }).limit(15);
        if (error) throw error;
        if (data) {
          setEventsList(data);
          const latestImg = data.find(e => e.image_url);
          if (latestImg) setLastCapturedImage(latestImg.image_url);
        }
      } catch (e) {
        console.warn('Could not connect to Supabase events table.', e);
        setIsDbConnected(false);
      }
    };
    fetchEvents();

    const eventsChannel = supabase
      .channel('public:events')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events' }, (payload: any) => {
        setEventsList(prev => [payload.new, ...prev]);
        if (payload.new.image_url) setLastCapturedImage(payload.new.image_url);
      })
      .subscribe();

    return () => { supabase.removeChannel(eventsChannel); };
  }, []);

  // 2. Persist state to localStorage
  useEffect(() => {
    if (state !== INITIAL_STATE) {
      localStorage.setItem('drop_system_state', JSON.stringify({
        currentState: state.currentState, primedAmount: state.primedAmount,
        ownerPin: state.ownerPin, riderPin: state.riderPin, isLocked: state.isLocked,
        lcdLine1: state.lcdLine1, lcdLine2: state.lcdLine2, oledFace: state.oledFace,
        failedAttempts: state.failedAttempts, inCooldown: state.inCooldown,
        lockoutTimer: state.lockoutTimer, lastTamperAlert: state.lastTamperAlert,
        lastWrongPinAlert: state.lastWrongPinAlert,
      }));
    }
  }, [state]);

  // 2b. TICK_COOLDOWN
  useEffect(() => {
    if (!state.inCooldown) return;
    const interval = setInterval(() => dispatch({ type: 'TICK_COOLDOWN' }), 1000);
    return () => clearInterval(interval);
  }, [state.inCooldown]);

  // 3. Audio feedback
  const prevLcdLine1 = useRef(state.lcdLine1);
  const prevLcdLine2 = useRef(state.lcdLine2);
  const prevIsTampering = useRef(state.isTampering);

  useEffect(() => {
    if (state.isTampering !== prevIsTampering.current) {
      if (state.isTampering) startSiren(); else stopSiren();
      prevIsTampering.current = state.isTampering;
    }
    if (state.lcdLine1 !== prevLcdLine1.current || state.lcdLine2 !== prevLcdLine2.current) {
      const isError = state.lcdLine1.includes('ERROR') || state.lcdLine2.includes('Wrong PIN');
      const isSuccess = state.lcdLine1.includes('OWNER OK') || state.lcdLine1.includes('RIDER OK') ||
        state.lcdLine1.includes('Saved') || state.lcdLine1.includes('OPEN') ||
        state.lcdLine1.includes('LOCKED') || state.lcdLine1.includes('READY');
      if (isError) playErrorBeep();
      else if (isSuccess && !state.isTampering) playSuccessBeep();
      prevLcdLine1.current = state.lcdLine1;
      prevLcdLine2.current = state.lcdLine2;
    }
  }, [state.lcdLine1, state.lcdLine2, state.isTampering]);

  // 4. Tilt sensor
  useEffect(() => {
    let timer: any = null;
    if (state.tiltDetected && (state.currentState === 'STATE_IDLE' || state.currentState === 'STATE_READY')) {
      timer = setTimeout(() => dispatch({ type: 'TRIGGER_TAMPER' }), 200);
    } else if (state.isTampering && !state.tiltDetected) {
      dispatch({ type: 'CLEAR_TAMPER' });
    }
    return () => { if (timer) clearTimeout(timer); };
  }, [state.tiltDetected, state.currentState, state.isTampering]);

  // Live video stream binding
  useEffect(() => {
    if (liveVideoRef.current && liveStream) {
      liveVideoRef.current.srcObject = liveStream;
      liveVideoRef.current.play().catch(() => { });
    }
  }, [liveStream]);

  // 5. Webcam setup
  useEffect(() => {
    async function setupWebcam() {
      if (webcamFallback) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
          streamRef.current = stream;
          if (videoRef.current) videoRef.current.srcObject = stream;
        } catch (e) {
          console.error('Webcam access error:', e);
          alert('Could not access webcam. Fallback deactivated.');
          setWebcamFallback(false);
        }
      } else {
        if (streamRef.current) { streamRef.current.getTracks().forEach(track => track.stop()); streamRef.current = null; }
        if (videoRef.current) videoRef.current.srcObject = null;
      }
    }
    setupWebcam();
    return () => { if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop()); };
  }, [webcamFallback]);

  // 6. Trigger event handler
  useEffect(() => {
    if (state.lastTriggerEvent) {
      const trigger = { ...state.lastTriggerEvent };
      dispatch({ type: 'RESET_TRIGGER_EVENT' });
      if (trigger.type) handleCaptureAndNotify(trigger.type, trigger.notes || '');
    }
  }, [state.lastTriggerEvent]);

  // 7. Core Capture and Notify Engine
  const handleCaptureAndNotify = async (triggerType: string, notes: string) => {
    const correlationId = crypto.randomUUID();
    const timestamp = Date.now();
    console.log(`[TRIGGER: ${triggerType}] Correlation: ${correlationId}`);

    if (webcamFallback) {
      await captureLocalWebcam(correlationId, triggerType, notes);
      return;
    }

    const activeCameras = cameras.filter(c => c.active);
    let targetCameraIds: string[] = [];

    if (cameraMode === 'single') {
      const primary = activeCameras.find(c => c.id === primaryCameraId);
      if (primary) targetCameraIds = [primary.id];
      else { await notifyDiscordSingle(triggerType, null, timestamp, `${notes} (No primary camera active)`, null); return; }
    } else {
      targetCameraIds = activeCameras.map(c => c.id);
    }

    if (targetCameraIds.length === 0) {
      await notifyDiscordSingle(triggerType, null, timestamp, `${notes} (No cameras linked)`, null);
      return;
    }

    try {
      setEventsList(prev => [{ id: correlationId, trigger_type: triggerType, timestamp: new Date(timestamp).toISOString(), notes: `${notes} (Waiting for photos...)`, image_url: null }, ...prev]);

      const respondedImages: { camId: string; imageUrl: string; label: string }[] = [];
      const respondedCameras = new Set<string>();
      let photoResolved = false;

      const photoTimeout = setTimeout(async () => {
        if (photoResolved) return;
        photoResolved = true;
        supabase.removeChannel(photoChannel);
        if (respondedImages.length > 0) {
          if (cameraMode === 'multi') await notifyDiscordMulti(triggerType, timestamp, notes, respondedImages);
          else {
            const img = respondedImages[0];
            await notifyDiscordSingle(triggerType, img.imageUrl, timestamp, notes, img.label);
            setLastCapturedImage(img.imageUrl);
          }
        } else {
          const offlineMsg = cameraMode === 'single' ? `${notes} (Primary camera offline)` : `${notes} (All cameras offline)`;
          await notifyDiscordSingle(triggerType, null, timestamp, offlineMsg, null);
        }
      }, 6000);

      const photoChannel = supabase
        .channel(`wait-photo:${correlationId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events', filter: `correlation_id=eq.${correlationId}` },
          async (payload: any) => {
            if (photoResolved) return;
            const resolvedEvent = payload.new;
            let detectedCamId = '';
            const match = resolvedEvent.notes?.match(/Remote photo uploaded by ([a-zA-Z0-9_-]+)/i);
            if (match && match[1]) detectedCamId = match[1];
            if (!detectedCamId) return;

            respondedCameras.add(detectedCamId);
            const camObj = cameras.find(c => c.id === detectedCamId);
            const camLabel = camObj?.label || detectedCamId;
            respondedImages.push({ camId: detectedCamId, imageUrl: resolvedEvent.image_url, label: camLabel });
            setLastCapturedImage(resolvedEvent.image_url);
            setCameras(prev => prev.map(c => c.id === detectedCamId ? { ...c, lastSeen: Date.now() } : c));

            if (cameraMode === 'single' && detectedCamId === primaryCameraId) {
              clearTimeout(photoTimeout); photoResolved = true; supabase.removeChannel(photoChannel);
              await notifyDiscordSingle(triggerType, resolvedEvent.image_url, timestamp, notes, camLabel);
            }
            if (cameraMode === 'multi' && respondedCameras.size >= targetCameraIds.length) {
              clearTimeout(photoTimeout); photoResolved = true; supabase.removeChannel(photoChannel);
              await notifyDiscordMulti(triggerType, timestamp, notes, respondedImages);
            }
          })
        .subscribe();

      const { error: cmdError } = await supabase.from('camera_commands').insert(
        targetCameraIds.map(camId => ({ camera_id: camId, command: 'capture', status: 'pending', correlation_id: correlationId, trigger_type: triggerType, notes }))
      );
      if (cmdError) throw cmdError;
      console.log(`Dispatched commands to cameras: ${targetCameraIds.join(', ')}`);
    } catch (e) {
      console.error('Failed to trigger remote cameras:', e);
      await notifyDiscordSingle(triggerType, null, timestamp, `${notes} (Error dispatching camera commands: ${e})`, null);
    }
  };

  const captureLocalWebcam = async (correlationId: string, triggerType: string, notes: string) => {
    if (!videoRef.current || !canvasRef.current) return;
    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      canvas.width = video.videoWidth || 640; canvas.height = video.videoHeight || 480;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        const filePath = `local-webcam/${Date.now()}.jpg`;
        const { error: uploadError } = await supabase.storage.from('drop-captures').upload(filePath, blob, { contentType: 'image/jpeg' });
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from('drop-captures').getPublicUrl(filePath);
        const imageUrl = urlData.publicUrl;
        setLastCapturedImage(imageUrl);
        const fullNotes = `${notes} (Captured via local webcam)`;
        await supabase.from('events').insert({ trigger_type: triggerType, image_url: imageUrl, notes: fullNotes, correlation_id: correlationId });
        await notifyDiscordSingle(triggerType, imageUrl, Date.now(), fullNotes, 'Laptop Webcam');
      }, 'image/jpeg', 0.85);
    } catch (e) {
      console.error('Failed capturing local webcam:', e);
      await notifyDiscordSingle(triggerType, null, Date.now(), `${notes} (Local webcam capture failed)`, null);
    }
  };

  const notifyDiscordSingle = async (triggerType: string, imageUrl: string | null, timestamp: number, notes: string, cameraLabel?: string | null) => {
    try {
      const response = await fetch('/api/notify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trigger_type: triggerType, image_url: imageUrl, timestamp, notes, camera_id: cameraLabel || undefined }),
      });
      if (!response.ok) console.error('Discord notification failed:', await response.text());
    } catch (e) { console.error('Failed sending notification fetch:', e); }
  };

  const notifyDiscordMulti = async (triggerType: string, timestamp: number, notes: string, images: { camId: string; imageUrl: string; label: string }[]) => {
    try {
      const embedPayloads = images.map(img => ({ label: img.label, image_url: img.imageUrl }));
      const response = await fetch('/api/notify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trigger_type: triggerType, timestamp, notes, embeds: embedPayloads }),
      });
      if (!response.ok) console.error('Multi-camera Discord notification failed:', await response.text());
    } catch (e) { console.error('Failed sending multi-camera notification:', e); }
  };

  // 8. Keypad and Switch Handlers
  const handleKeyPress = (key: string) => {
    if (state.inCooldown) return;
    if (!audioUnlocked) { playInputBeep(); setAudioUnlocked(true); } else playInputBeep();
    if (key === '#') dispatch({ type: 'KEY_HASH' });
    else if (key === '*') dispatch({ type: 'KEY_STAR' });
    else dispatch({ type: 'KEY_DIGIT', digit: key });
  };

  const handleLidToggle = (e: React.ChangeEvent<HTMLInputElement>) => dispatch({ type: 'SET_LID', closed: e.target.checked });
  const handleWeightToggle = (e: React.ChangeEvent<HTMLInputElement>) => dispatch({ type: 'SET_WEIGHT', present: e.target.checked });
  const handleTiltToggle = (e: React.ChangeEvent<HTMLInputElement>) => dispatch({ type: 'SET_TILT', detected: e.target.checked });
  const handleRemoteUnlock = () => { playSuccessBeep(); dispatch({ type: 'REMOTE_UNLOCK' }); };
  const handleRemoteLock = () => { playSuccessBeep(); dispatch({ type: 'REMOTE_LOCK' }); };
  const handleManualTestNotification = () => { playSuccessBeep(); dispatch({ type: 'FIRE_MANUAL_TEST' }); };

  // Camera management
  const handleAddCamera = () => {
    if (!newCameraId || cameras.find(c => c.id === newCameraId)) return;
    const updated: Camera[] = [...cameras, { id: newCameraId, active: true, lastSeen: null, label: `Camera ${newCameraId}` }];
    setCameras(updated);
    if (!primaryCameraId) setPrimaryCameraId(newCameraId);
    setNewCameraId('');
    persistCameras(updated, cameraMode, primaryCameraId || newCameraId);
  };

  const handleRemoveCamera = (id: string) => {
    const updated = cameras.filter(c => c.id !== id);
    setCameras(updated);
    if (primaryCameraId === id) setPrimaryCameraId(updated.find(c => c.active)?.id || null);
    persistCameras(updated, cameraMode, primaryCameraId === id ? (updated.find(c => c.active)?.id || null) : primaryCameraId);
    if (showQRForCamera === id) setShowQRForCamera(null);
  };

  const handleToggleCameraActive = (id: string) => {
    const updated = cameras.map(c => c.id === id ? { ...c, active: !c.active } : c);
    setCameras(updated);
    if (id === primaryCameraId && !updated.find(c => c.id === id)?.active) {
      const next = updated.find(c => c.active);
      setPrimaryCameraId(next ? next.id : null);
      persistCameras(updated, cameraMode, next ? next.id : null);
    } else persistCameras(updated, cameraMode, primaryCameraId);
  };

  const handleSetPrimary = (id: string) => { setPrimaryCameraId(id); persistCameras(cameras, cameraMode, id); };
  const handleLabelChange = (id: string, newLabel: string) => {
    const updated = cameras.map(c => c.id === id ? { ...c, label: newLabel } : c);
    setCameras(updated);
    persistCameras(updated, cameraMode, primaryCameraId);
  };
  const handleModeChange = (mode: 'single' | 'multi') => { setCameraMode(mode); persistCameras(cameras, mode, primaryCameraId); };

  const handleRemoveOffline = () => {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    const updated = cameras.filter(c => c.active && c.lastSeen !== null && c.lastSeen >= fiveMinutesAgo);
    setCameras(updated);
    if (primaryCameraId && !updated.find(c => c.id === primaryCameraId)) {
      const next = updated.find(c => c.active);
      setPrimaryCameraId(next ? next.id : null);
      persistCameras(updated, cameraMode, next ? next.id : null);
    } else persistCameras(updated, cameraMode, primaryCameraId);
  };

  const getCamStatusDot = (cam: Camera) => {
    if (!cam.active) return 'inactive';
    if (cam.lastSeen === null) return 'unknown';
    return Date.now() - cam.lastSeen < 5 * 60 * 1000 ? 'active' : 'unknown';
  };

  const handleUpdatePins = () => {
    dispatch({ type: 'SET_PINS', ownerPin: ownerPinInput, riderPin: riderPinInput });
    alert('Beeper PIN configurations updated successfully!');
    setShowPinSettings(false);
  };

  return (
    <div className="min-h-screen pb-12">
      {state.isTampering && <div className="tamper-strobe" />}

      <div className="dashboard-container">
        {/* Header */}
        <header className="header-bar">
          <div className="logo-section">
            <span className="logo-badge">D.R.O.P</span>
            <div className="header-title">
              <h1>Box Digital Twin</h1>
              <p>ESP32 Firmware FSM Simulator & CCTV Controller</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-slate-900 border border-white/5 px-3 py-1.5 rounded-lg text-xs">
              <span className={`status-dot ${isDbConnected ? 'active' : 'inactive'}`} />
              <span className="text-gray-400">Database:</span>
              <span className="font-bold text-white">{isDbConnected ? 'CONNECTED' : 'OFFLINE'}</span>
            </div>
            <button onClick={() => setShowPinSettings(!showPinSettings)} className="btn btn-secondary !py-1.5 !px-3">
              <Settings size={14} /><span>PINs</span>
            </button>
          </div>
        </header>

        {showPinSettings && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="glass-card max-w-md w-full p-6 border border-white/10">
              <h3 className="card-title text-white"><Settings size={18} className="text-amber-500" /> Configure Box Pins</h3>
              <div className="grid grid-cols-2 gap-4 mt-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Owner PIN</label>
                  <input type="text" value={ownerPinInput} onChange={e => setOwnerPinInput(e.target.value)} className="bg-slate-900 border border-white/10 rounded p-2 text-center text-white font-mono text-lg focus:outline-none focus:border-amber-500" maxLength={8} placeholder="1234" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Rider PIN</label>
                  <input type="text" value={riderPinInput} onChange={e => setRiderPinInput(e.target.value)} className="bg-slate-900 border border-white/10 rounded p-2 text-center text-white font-mono text-lg focus:outline-none focus:border-amber-500" maxLength={8} placeholder="5678" />
                </div>
              </div>
              <div className="flex gap-3 justify-end mt-4">
                <button onClick={() => setShowPinSettings(false)} className="btn btn-secondary">Cancel</button>
                <button onClick={handleUpdatePins} className="btn btn-primary">Save PINs</button>
              </div>
            </div>
          </div>
        )}

        <div className="twin-grid">
          {/* Column 1: Hardware */}
          <section className={`glass-card ${state.isTampering ? 'tamper-alarm' : ''}`}>
            <h2 className="card-title text-amber-500"><Tv size={18} /> Virtual DROP Box Hardware</h2>
            <div className="flex flex-col gap-4">
              <div className="lcd-container">
                <div className="text-[10px] text-gray-500 mb-1 font-mono uppercase tracking-wider">LiquidCrystal I2C 16x2</div>
                <div className="lcd-screen"><div className="lcd-line">{state.lcdLine1}</div><div className="lcd-line">{state.lcdLine2}</div></div>
              </div>
              <div className="oled-container">
                <div className="text-[10px] text-gray-500 mb-1 font-mono uppercase tracking-wider">SSD1306 OLED 128x64</div>
                <div className="oled-screen">
                  <div className="flex justify-between items-center border-b border-white/5 pb-1">
                    <span className="oled-text-sm">{state.inCooldown ? 'SECURITY:' : 'SYSTEM STATE:'}</span>
                    <span className={`oled-text-sm px-1.5 py-0.5 rounded bg-white/10 font-bold ${state.inCooldown ? 'text-red-400' : ''}`}>{state.inCooldown ? 'COOLDOWN' : getOledTitle(state.currentState)}</span>
                  </div>
                  <div className="oled-face">{state.oledFace}</div>
                  <div className="flex justify-between items-center text-[8px] text-white/50 pt-1 border-t border-white/5">
                    <span>BUF: {state.inputBuffer || 'EMPTY'}</span>
                    <span>BAL: ${state.primedAmount}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-2 mt-2">
              <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">Lock Servo Position (Pin 18)</span>
              <div className="lock-visualizer">
                <div className="status-indicator">
                  <span className={`status-dot ${state.isLocked ? 'inactive' : 'active'}`} />
                  <span className="text-xs font-mono">{state.isLocked ? 'LOCKED' : 'UNLOCKED'}</span>
                </div>
                <div className="lock-servo-bar"><div className={`lock-servo-latch ${state.isLocked ? '' : 'unlocked'}`} /></div>
              </div>
            </div>
            <div className="flex flex-col gap-2 mt-2">
              <span className="text-xs text-gray-400 font-bold uppercase tracking-wider text-center">Hardware Matrix Keypad</span>
              <div className="keypad-grid">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((key) => (
                  <button key={key} onClick={() => handleKeyPress(key)} className={`keypad-button ${key === '*' || key === '#' ? 'action-btn' : ''} ${state.inCooldown ? 'cooldown' : ''}`} disabled={state.isTampering || state.inCooldown}>{key}</button>
                ))}
              </div>
            </div>
          </section>

          {/* Column 2: Sensors & Controls */}
          <section className="glass-card">
            <h2 className="card-title text-cyan-500"><Sliders size={18} /> Sensors & Overrides</h2>
            <div className="flex flex-col gap-4">
              <h3 className="text-xs text-gray-400 font-bold uppercase tracking-wider">GPIO Pin Simulator</h3>
              <div className="switch-control">
                <div className="switch-label"><span className="switch-label-title">Lid Limit Switch (GPIO 13)</span><span className="switch-label-desc">Simulates physical drop box lid open/close</span></div>
                <label className="toggle-switch"><input type="checkbox" checked={state.lidClosed} onChange={handleLidToggle} /><span className="toggle-slider" /></label>
              </div>
              <div className="switch-control">
                <div className="switch-label"><span className="switch-label-title">Parcel Weight Sensor</span><span className="switch-label-desc">Detects if a package is loaded inside</span></div>
                <label className="toggle-switch"><input type="checkbox" checked={state.parcelPresent} onChange={handleWeightToggle} /><span className="toggle-slider" /></label>
              </div>
              <div className="switch-control">
                <div className="switch-label"><span className="switch-label-title">Tilt Tamper Sensor (GPIO 12)</span><span className="switch-label-desc">Shaking triggers tamper alarm in >200ms</span></div>
                <label className="toggle-switch"><input type="checkbox" checked={state.tiltDetected} onChange={handleTiltToggle} /><span className="toggle-slider danger-slider" /></label>
              </div>
            </div>
            {state.inCooldown && (
              <div className="flex flex-col gap-2 mt-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">SECURITY COOLDOWN</span>
                  <span className="text-xs font-mono text-red-400">{state.remainingCountdown}s</span>
                </div>
                <div className="cooldown-bar-bg"><div className="cooldown-bar-fill" style={{ width: `${(state.remainingCountdown / 30) * 100}%` }} /></div>
              </div>
            )}
            <div className="flex flex-col gap-3 mt-4 border-t border-white/5 pt-4">
              <h3 className="text-xs text-gray-400 font-bold uppercase tracking-wider">Remote Owner Actions</h3>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={handleRemoteUnlock} className="btn btn-secondary flex-1" disabled={state.isTampering}><Unlock size={14} className="text-emerald-500" /> Remote Unlock</button>
                <button onClick={handleRemoteLock} className="btn btn-secondary flex-1" disabled={state.isTampering}><Lock size={14} className="text-rose-500" /> Remote Lock</button>
              </div>
              <button onClick={handleManualTestNotification} className="btn btn-primary w-full mt-2" disabled={state.isTampering}><BellRing size={16} /> Send Manual Test Alert</button>
            </div>
            <div className="bg-slate-900/60 border border-white/5 rounded-lg p-3 text-[11px] text-gray-400 mt-auto flex gap-2">
              <Info size={16} className="text-amber-500 shrink-0" />
              <p>Beeps require a user click on the page to unlock browser audio. Click any keypad key to activate audio.</p>
            </div>
          </section>

          {/* Column 3: Cameras & CCTV */}
          <section className="glass-card">
            <h2 className="card-title text-purple-500"><Camera size={18} /> CCTV Camera Control</h2>

            <div className="switch-control">
              <div className="switch-label"><span className="switch-label-title">Laptop Webcam Fallback</span><span className="switch-label-desc">Use this machine's camera as the CCTV</span></div>
              <label className="toggle-switch"><input type="checkbox" checked={webcamFallback} onChange={e => setWebcamFallback(e.target.checked)} /><span className="toggle-slider" /></label>
            </div>

            {webcamFallback && (
              <div className="camera-preview-container flex items-center justify-center">
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
                <div className="absolute top-2 left-2 bg-emerald-500 text-black font-extrabold text-[9px] px-2 py-0.5 rounded tracking-wide animate-pulse uppercase">Local Live CCTV</div>
              </div>
            )}

            {!webcamFallback && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 bg-slate-900/60 border border-white/5 rounded-lg p-2">
                  <span className="text-xs text-gray-400 font-bold uppercase tracking-wider mr-1 shrink-0">Mode:</span>
                  <button onClick={() => handleModeChange('single')} className={`text-xs px-3 py-1.5 rounded font-semibold transition-all flex-1 text-center ${cameraMode === 'single' ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20' : 'bg-slate-800 text-gray-400 hover:text-white'}`}><Radio size={12} className="inline mr-1" /> Single</button>
                  <button onClick={() => handleModeChange('multi')} className={`text-xs px-3 py-1.5 rounded font-semibold transition-all flex-1 text-center ${cameraMode === 'multi' ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20' : 'bg-slate-800 text-gray-400 hover:text-white'}`}><Camera size={12} className="inline mr-1" /> Multi-Angle</button>
                </div>

                {cameraMode === 'single' && cameras.filter(c => c.active).length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 font-bold uppercase">Primary:</span>
                    <select value={primaryCameraId || ''} onChange={e => handleSetPrimary(e.target.value)} className="bg-slate-900 border border-white/10 rounded p-1.5 text-xs text-white grow focus:outline-none focus:border-purple-500">
                      {cameras.filter(c => c.active).map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                  </div>
                )}

                <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
                  {cameras.length === 0 && <div className="text-xs text-gray-500 text-center py-2">No cameras linked. Add one below.</div>}
                  {cameras.map(cam => (
                    <div key={cam.id} className={`flex flex-col p-2 rounded-lg text-sm border ${primaryCameraId === cam.id && cameraMode === 'single' ? 'border-purple-500/50 bg-purple-500/10' : 'border-white/5 bg-white/2'}`}>
                      <div className="flex items-center gap-2">
                        <span className={`camera-status-dot ${getCamStatusDot(cam)}`} />
                        <input type="text" value={cam.label} onChange={e => handleLabelChange(cam.id, e.target.value)} className="bg-transparent border-none text-gray-200 font-bold text-xs grow focus:outline-none focus:text-purple-300" maxLength={24} />
                        <span className="text-[9px] text-gray-600 font-mono">{cam.id}</span>
                      </div>
                      <div className="flex items-center gap-1 mt-1">
                        <label className="toggle-switch-sm">
                          <input type="checkbox" checked={cam.active} onChange={() => handleToggleCameraActive(cam.id)} />
                          <span className="toggle-slider-sm" />
                        </label>
                        <span className="text-[9px] text-gray-500 mr-2">{cam.active ? 'ON' : 'OFF'}</span>

                        {cameraMode === 'single' && cam.active && (
                          <button onClick={() => handleSetPrimary(cam.id)} className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${primaryCameraId === cam.id ? 'bg-purple-700 text-white' : 'bg-slate-800 text-gray-400 hover:text-white'}`}>
                            {primaryCameraId === cam.id ? 'PRIMARY' : 'SET'}
                          </button>
                        )}

                        {/* Live View button */}
                        {cam.active && (
                          <button
                            onClick={() => liveCameraId === cam.id ? stopLiveView() : startLiveView(cam.id)}
                            className={`p-1 rounded ${liveCameraId === cam.id ? 'bg-emerald-700 text-white' : 'bg-slate-800 text-gray-400 hover:text-emerald-300'}`}
                            title={liveCameraId === cam.id ? 'Close live view' : 'Live View'}
                          >
                            {liveCameraId === cam.id ? <X size={10} /> : <Eye size={10} />}
                          </button>
                        )}

                        <button onClick={() => setShowQRForCamera(showQRForCamera === cam.id ? null : cam.id)} className="bg-slate-800 hover:bg-slate-700 text-gray-300 p-1 rounded" title="Generate QR / Link"><ExternalLink size={10} /></button>
                        <button onClick={() => handleRemoveCamera(cam.id)} className="bg-slate-800 hover:bg-red-900 text-gray-400 hover:text-red-300 p-1 rounded" title="Remove camera"><Trash2 size={10} /></button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <input type="text" value={newCameraId} onChange={e => setNewCameraId(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))} placeholder="e.g. phone1" className="bg-slate-900 border border-white/10 rounded p-1.5 text-xs text-white grow" />
                  <button onClick={handleAddCamera} className="btn btn-secondary !p-1.5"><Plus size={14} /></button>
                </div>

                {cameras.some(c => !c.active || c.lastSeen === null) && (
                  <button onClick={handleRemoveOffline} className="text-[10px] text-red-400 hover:text-red-300 underline self-end">Remove offline cameras</button>
                )}

                {showQRForCamera && (
                  <div className="qr-container">
                    <span className="text-xs text-gray-300 font-bold uppercase">Connect {cameras.find(c => c.id === showQRForCamera)?.label || showQRForCamera}</span>
                    <div className="qr-placeholder"><QRCodeSVG value={`${cameraUrlHost}/camera?camera_id=${showQRForCamera}`} size={120} level="M" /></div>
                    <a href={`/camera?camera_id=${showQRForCamera}`} target="_blank" rel="noreferrer" className="text-xs text-purple-400 hover:underline inline-flex items-center gap-1">Open Camera Link Directly <ExternalLink size={10} /></a>
                  </div>
                )}
              </div>
            )}

            {/* Live View Modal */}
            {liveCameraId && liveStream && (
              <div className="live-view-modal">
                <div className="live-view-header">
                  <span className="text-xs font-bold uppercase text-emerald-400 flex items-center gap-1">
                    <Eye size={12} /> Live: {cameras.find(c => c.id === liveCameraId)?.label || liveCameraId}
                  </span>
                  <button onClick={stopLiveView} className="live-view-close"><X size={14} /></button>
                </div>
                <video ref={liveVideoRef} autoPlay playsInline muted className="live-view-video" />
              </div>
            )}

            <div className="flex flex-col gap-2 border-t border-white/5 pt-4">
              <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">CCTV Capture Frame</span>
              <div className="camera-preview-container">
                {lastCapturedImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={lastCapturedImage} alt="Last CCTV Capture" className="camera-preview-img" />
                ) : (
                  <div className="w-full h-full flex flex-col justify-center items-center gap-2 text-gray-500 text-xs p-4 text-center">
                    <Camera size={24} className="text-gray-600" />
                    {(!webcamFallback && cameras.filter(c => c.active).length === 0) ? (
                      <span className="text-[11px] leading-relaxed">No cameras active. Add a camera below & pair via QR code, or enable Laptop Webcam Fallback.</span>
                    ) : <span>No snapshots captured yet</span>}
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>

        {/* Row 2: Event Logs */}
        <section className="glass-card">
          <h2 className="card-title text-slate-400"><FileText size={18} /> System Event Log & Audit Trail</h2>
          <div className="event-log-container">
            {eventsList.length === 0 ? (
              <div className="text-center text-xs text-gray-500 py-6">No event logs registered yet. Trigger actions to log data.</div>
            ) : eventsList.map((evt) => {
              let severity = '';
              if (evt.trigger_type.includes('TAMPER') || evt.trigger_type.includes('WRONG_PIN')) severity = 'severity-danger';
              else if (evt.trigger_type.includes('DELIVERY') || evt.trigger_type.includes('OWNER') || evt.trigger_type.includes('UNLOCK')) severity = 'severity-success';
              else if (evt.trigger_type.includes('ARMED') || evt.trigger_type.includes('MANUAL')) severity = 'severity-accent';
              return (
                <div key={evt.id} className={`event-log-item ${severity}`}>
                  <div className="event-log-meta">
                    <span className="event-log-type">{evt.trigger_type.replace(/_/g, ' ')}</span>
                    <span>{new Date(evt.timestamp).toLocaleString()}</span>
                  </div>
                  <p className="text-gray-300 font-light mt-0.5">{evt.notes}</p>
                  {evt.image_url && <a href={evt.image_url} target="_blank" rel="noreferrer" className="text-[10px] text-purple-400 hover:underline mt-1 inline-flex items-center gap-1 w-fit">View Full Screen Snapshot <ExternalLink size={8} /></a>}
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}