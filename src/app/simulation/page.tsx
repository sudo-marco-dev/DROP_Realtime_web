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
  BellRing
} from 'lucide-react';

export default function SimulationPage() {
  const [state, dispatch] = useReducer(dropReducer, INITIAL_STATE);
  
  // Custom camera management state
  const [cameraIds, setCameraIds] = useState<string[]>(['phone1']);
  const [newCameraId, setNewCameraId] = useState('');
  const [activeCameraId, setActiveCameraId] = useState('phone1');
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

  // 1. Initial Load: Restore settings, play boot beep, and pull event logs
  useEffect(() => {
    playBootBeep();
    setCameraUrlHost(window.location.origin);
    
    // Restore state from localStorage if exists
    try {
      const savedState = localStorage.getItem('drop_system_state');
      if (savedState) {
        const parsed = JSON.parse(savedState);
        dispatch({ type: 'SET_STATE', state: {
          currentState: parsed.currentState ?? 'STATE_IDLE',
          primedAmount: parsed.primedAmount ?? 0,
          ownerPin: parsed.ownerPin ?? '1234',
          riderPin: parsed.riderPin ?? '5678',
          isLocked: parsed.isLocked ?? true,
          lcdLine1: parsed.lcdLine1 ?? 'SYSTEM LOCKED',
          lcdLine2: parsed.lcdLine2 ?? 'PIN: ',
          oledFace: parsed.oledFace ?? '(-_-)',
        }});
        setOwnerPinInput(parsed.ownerPin ?? '1234');
        setRiderPinInput(parsed.riderPin ?? '5678');
      } else {
        setOwnerPinInput('1234');
        setRiderPinInput('5678');
      }
    } catch (e) {
      console.error('Failed to load local storage state:', e);
    }

    // Load initial events from DB
    const fetchEvents = async () => {
      try {
        const { data, error } = await supabase
          .from('events')
          .select('*')
          .order('timestamp', { ascending: false })
          .limit(15);
        
        if (error) throw error;
        if (data) {
          setEventsList(data);
          // Find latest image
          const latestImg = data.find(e => e.image_url);
          if (latestImg) setLastCapturedImage(latestImg.image_url);
        }
      } catch (e) {
        console.warn('Could not connect to Supabase events table. Working in offline mode.', e);
        setIsDbConnected(false);
      }
    };
    fetchEvents();

    // Subscribe to DB inserts for realtime events feed
    const eventsChannel = supabase
      .channel('public:events')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events' }, (payload) => {
        setEventsList(prev => [payload.new, ...prev]);
        if (payload.new.image_url) {
          setLastCapturedImage(payload.new.image_url);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(eventsChannel);
    };
  }, []);

  // 2. Persist state to localStorage on state changes
  useEffect(() => {
    if (state !== INITIAL_STATE) {
      localStorage.setItem('drop_system_state', JSON.stringify({
        currentState: state.currentState,
        primedAmount: state.primedAmount,
        ownerPin: state.ownerPin,
        riderPin: state.riderPin,
        isLocked: state.isLocked,
        lcdLine1: state.lcdLine1,
        lcdLine2: state.lcdLine2,
        oledFace: state.oledFace,
      }));
    }
  }, [state]);

  // 3. Audio & Key Click feedback
  // Simple check on state variables to play sounds
  const prevLcdLine1 = useRef(state.lcdLine1);
  const prevLcdLine2 = useRef(state.lcdLine2);
  const prevIsTampering = useRef(state.isTampering);

  useEffect(() => {
    // Check for Tamper Alarm Siren
    if (state.isTampering !== prevIsTampering.current) {
      if (state.isTampering) {
        startSiren();
      } else {
        stopSiren();
      }
      prevIsTampering.current = state.isTampering;
    }

    // Check for errors shown on LCD
    if (state.lcdLine1 !== prevLcdLine1.current || state.lcdLine2 !== prevLcdLine2.current) {
      const isError = state.lcdLine1.includes('ERROR') || state.lcdLine2.includes('Wrong PIN');
      const isSuccess = state.lcdLine1.includes('OWNER OK') || 
                        state.lcdLine1.includes('RIDER OK') || 
                        state.lcdLine1.includes('Saved') || 
                        state.lcdLine1.includes('OPEN') || 
                        state.lcdLine1.includes('LOCKED') ||
                        state.lcdLine1.includes('READY');
      
      if (isError) {
        playErrorBeep();
      } else if (isSuccess && !state.isTampering) {
        playSuccessBeep();
      }
      prevLcdLine1.current = state.lcdLine1;
      prevLcdLine2.current = state.lcdLine2;
    }
  }, [state.lcdLine1, state.lcdLine2, state.isTampering]);

  // 4. Tilt sensor 200ms timer
  useEffect(() => {
    let timer: any = null;
    if (state.tiltDetected && (state.currentState === 'STATE_IDLE' || state.currentState === 'STATE_READY')) {
      timer = setTimeout(() => {
        dispatch({ type: 'TRIGGER_TAMPER' });
      }, 200);
    } else {
      if (state.isTampering && !state.tiltDetected) {
        dispatch({ type: 'CLEAR_TAMPER' });
      }
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [state.tiltDetected, state.currentState, state.isTampering]);

  // 5. Initialize or stop local webcam stream when fallback changes
  useEffect(() => {
    async function setupWebcam() {
      if (webcamFallback) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        } catch (e) {
          console.error('Webcam access error:', e);
          alert('Could not access webcam. Fallback deactivated.');
          setWebcamFallback(false);
        }
      } else {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
      }
    }

    setupWebcam();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [webcamFallback]);

  // 6. Handle Side Effects when a state transition triggers a security event
  useEffect(() => {
    if (state.lastTriggerEvent) {
      const trigger = { ...state.lastTriggerEvent };
      // Immediately reset so we only process this event once
      dispatch({ type: 'RESET_TRIGGER_EVENT' });

      // Run async capture and notification flow
      if (trigger.type) {
        handleCaptureAndNotify(trigger.type, trigger.notes || '');
      }
    }
  }, [state.lastTriggerEvent]);

  // 7. Core Capture and Notify Engine
  const handleCaptureAndNotify = async (triggerType: string, notes: string) => {
    const correlationId = crypto.randomUUID();
    const timestamp = Date.now();

    console.log(`[TRIGGER: ${triggerType}] Correlation: ${correlationId}`);

    // If local fallback is active
    if (webcamFallback) {
      await captureLocalWebcam(correlationId, triggerType, notes);
    } else {
      // Trigger remote phone camera via camera_commands for ALL connected cameras
      try {
        const camerasToTrigger = [...cameraIds];
        if (camerasToTrigger.length === 0) {
          // No cameras linked, just notify Discord without image
          await notifyDiscord(triggerType, null, timestamp, `${notes} (No cameras linked)`);
          return;
        }

        // Insert pending event logs locally
        const pendingEvent = {
          id: correlationId,
          trigger_type: triggerType,
          timestamp: new Date(timestamp).toISOString(),
          notes: `${notes} (Waiting for photos from: ${camerasToTrigger.join(', ')}...)`,
          image_url: null
        };
        setEventsList(prev => [pendingEvent, ...prev]);

        // Keep track of which cameras have responded
        const respondedCameras = new Set<string>();

        // Set up timeout for offline cameras
        const photoTimeout = setTimeout(async () => {
          // Find which cameras didn't respond
          const unresponsive = camerasToTrigger.filter(cam => !respondedCameras.has(cam));
          
          for (const offlineCam of unresponsive) {
            console.warn(`Camera "${offlineCam}" capture timed out`);
            const errorNotes = `${notes} (Camera command timed out - camera offline)`;
            
            // Send Discord notification for this offline camera
            await notifyDiscord(triggerType, null, timestamp, errorNotes, offlineCam);
            
            // Insert fallback offline event in DB
            await supabase.from('events').insert({
              trigger_type: triggerType,
              notes: errorNotes,
              correlation_id: correlationId
            });
          }
          
          supabase.removeChannel(photoChannel);
        }, 6000);

        // Listen for photo uploads for this correlationId
        const photoChannel = supabase
          .channel(`wait-photo:${correlationId}`)
          .on('postgres_changes', { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'events',
            filter: `correlation_id=eq.${correlationId}`
          }, async (payload) => {
            const resolvedEvent = payload.new;
            console.log('Received uploaded photo:', resolvedEvent.image_url, resolvedEvent.notes);
            
            // Extract camera ID from notes
            let detectedCamId = '';
            const match = resolvedEvent.notes?.match(/Remote photo uploaded by ([a-zA-Z0-9_-]+)/i);
            if (match && match[1]) {
              detectedCamId = match[1];
              respondedCameras.add(detectedCamId);
            }

            setLastCapturedImage(resolvedEvent.image_url);

            // Notify Discord with image URL and camera label
            await notifyDiscord(triggerType, resolvedEvent.image_url, timestamp, notes, detectedCamId || activeCameraId);

            // If all cameras have responded, we can clear the timeout early
            if (respondedCameras.size === camerasToTrigger.length) {
              clearTimeout(photoTimeout);
              supabase.removeChannel(photoChannel);
            }
          })
          .subscribe();

        // Dispatch commands to all cameras in bulk
        const commands = camerasToTrigger.map(camId => ({
          camera_id: camId,
          command: 'capture',
          status: 'pending',
          correlation_id: correlationId,
          trigger_type: triggerType,
          notes: notes
        }));

        const { error: cmdError } = await supabase
          .from('camera_commands')
          .insert(commands);

        if (cmdError) throw cmdError;

        console.log(`Dispatched commands to cameras: ${camerasToTrigger.join(', ')}`);

      } catch (e) {
        console.error('Failed to trigger remote cameras:', e);
        // Fallback to notify Discord immediately without picture
        await notifyDiscord(triggerType, null, timestamp, `${notes} (Error dispatching camera commands: ${e})`);
      }
    }
  };

  // Helper to capture frame from local webcam and upload
  const captureLocalWebcam = async (correlationId: string, triggerType: string, notes: string) => {
    if (!videoRef.current || !canvasRef.current) return;

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Draw current video frame
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Convert to JPEG Blob
      canvas.toBlob(async (blob) => {
        if (!blob) return;

        const timestampStr = Date.now();
        const filePath = `local-webcam/${timestampStr}.jpg`;

        // Upload to Supabase Storage
        const { error: uploadError } = await supabase.storage
          .from('drop-captures')
          .upload(filePath, blob, { contentType: 'image/jpeg' });

        if (uploadError) throw uploadError;

        // Get Public URL
        const { data: urlData } = supabase.storage
          .from('drop-captures')
          .getPublicUrl(filePath);

        const imageUrl = urlData.publicUrl;
        console.log('Local webcam frame uploaded successfully:', imageUrl);
        setLastCapturedImage(imageUrl);

        const fullNotes = `${notes} (Captured via local webcam)`;

        // Insert into Events DB
        const { error: eventError } = await supabase
          .from('events')
          .insert({
            trigger_type: triggerType,
            image_url: imageUrl,
            notes: fullNotes,
            correlation_id: correlationId
          });

        if (eventError) throw eventError;

        // Send Discord Webhook
        await notifyDiscord(triggerType, imageUrl, Date.now(), fullNotes, 'Laptop Webcam');

      }, 'image/jpeg', 0.85);

    } catch (e) {
      console.error('Failed capturing local webcam:', e);
      await notifyDiscord(triggerType, null, Date.now(), `${notes} (Local webcam capture failed)`);
    }
  };

  // Helper to call local Next.js secure API route to deliver Discord notification
  const notifyDiscord = async (triggerType: string, imageUrl: string | null, timestamp: number, notes: string, cameraId?: string) => {
    try {
      const response = await fetch('/api/notify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          trigger_type: triggerType,
          image_url: imageUrl,
          timestamp: timestamp,
          notes: notes,
          camera_id: cameraId
        }),
      });

      if (!response.ok) {
        console.error('Discord notification failed:', await response.text());
      } else {
        console.log('Discord notification sent successfully.');
      }
    } catch (e) {
      console.error('Failed sending notification fetch:', e);
    }
  };

  // 8. Keypad and Switch Handlers
  const handleKeyPress = (key: string) => {
    if (!audioUnlocked) {
      // Unlocks browser audio policy
      playInputBeep();
      setAudioUnlocked(true);
    } else {
      playInputBeep();
    }

    if (key === '#') {
      dispatch({ type: 'KEY_HASH' });
    } else if (key === '*') {
      dispatch({ type: 'KEY_STAR' });
    } else {
      dispatch({ type: 'KEY_DIGIT', digit: key });
    }
  };

  const handleLidToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    dispatch({ type: 'SET_LID', closed: e.target.checked });
  };

  const handleWeightToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    dispatch({ type: 'SET_WEIGHT', present: e.target.checked });
  };

  const handleTiltToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    dispatch({ type: 'SET_TILT', detected: e.target.checked });
  };

  // 9. Manual triggers & Commands
  const handleRemoteUnlock = () => {
    playSuccessBeep();
    dispatch({ type: 'REMOTE_UNLOCK' });
  };

  const handleRemoteLock = () => {
    playSuccessBeep();
    dispatch({ type: 'REMOTE_LOCK' });
  };

  const handleManualTestNotification = () => {
    playSuccessBeep();
    dispatch({ type: 'FIRE_MANUAL_TEST' });
  };

  const handleAddCamera = () => {
    if (newCameraId && !cameraIds.includes(newCameraId)) {
      setCameraIds([...cameraIds, newCameraId]);
      setActiveCameraId(newCameraId);
      setNewCameraId('');
    }
  };

  const handleUpdatePins = () => {
    dispatch({
      type: 'SET_PINS',
      ownerPin: ownerPinInput,
      riderPin: riderPinInput
    });
    alert('Beeper PIN configurations updated successfully!');
    setShowPinSettings(false);
  };

  return (
    <div className="min-h-screen pb-12">
      {state.isTampering && <div className="tamper-strobe" />}
      
      <div className="dashboard-container">
        
        {/* Header section */}
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
            
            <button 
              onClick={() => setShowPinSettings(!showPinSettings)} 
              className="btn btn-secondary !py-1.5 !px-3"
            >
              <Settings size={14} />
              <span>PINs</span>
            </button>
          </div>
        </header>

        {/* PIN settings modal overlay */}
        {showPinSettings && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="glass-card max-w-md w-full p-6 border border-white/10">
              <h3 className="card-title text-white">
                <Settings size={18} className="text-amber-500" />
                Configure Box Pins
              </h3>
              
              <div className="flex flex-col gap-4 mt-2">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-gray-400 font-bold uppercase">Owner PIN (Default: 1234)</label>
                  <input 
                    type="text" 
                    value={ownerPinInput} 
                    onChange={e => setOwnerPinInput(e.target.value)}
                    className="bg-slate-900 border border-white/10 rounded p-2 text-white font-mono text-lg focus:outline-none focus:border-amber-500"
                    maxLength={8}
                  />
                </div>
                
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-gray-400 font-bold uppercase">Rider PIN (Default: 5678)</label>
                  <input 
                    type="text" 
                    value={riderPinInput} 
                    onChange={e => setRiderPinInput(e.target.value)}
                    className="bg-slate-900 border border-white/10 rounded p-2 text-white font-mono text-lg focus:outline-none focus:border-amber-500"
                    maxLength={8}
                  />
                </div>
              </div>
              
              <div className="flex gap-3 justify-end mt-4">
                <button 
                  onClick={() => setShowPinSettings(false)} 
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleUpdatePins} 
                  className="btn btn-primary"
                >
                  Save PINs
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 3-column layout */}
        <div className="twin-grid">
          
          {/* Column 1: Smart Box Hardware Interface */}
          <section className={`glass-card ${state.isTampering ? 'tamper-alarm' : ''}`}>
            <h2 className="card-title text-amber-500">
              <Tv size={18} />
              Virtual DROP Box Hardware
            </h2>
            
            {/* Displays Row */}
            <div className="flex flex-col gap-4">
              
              {/* LCD 16x2 Emulation */}
              <div className="lcd-container">
                <div className="text-[10px] text-gray-500 mb-1 font-mono uppercase tracking-wider">LiquidCrystal I2C 16x2</div>
                <div className="lcd-screen">
                  <div className="lcd-line">{state.lcdLine1}</div>
                  <div className="lcd-line">{state.lcdLine2}</div>
                </div>
              </div>

              {/* SSD1306 OLED Emulation */}
              <div className="oled-container">
                <div className="text-[10px] text-gray-500 mb-1 font-mono uppercase tracking-wider">SSD1306 OLED 128x64</div>
                <div className="oled-screen">
                  <div className="flex justify-between items-center border-b border-white/5 pb-1">
                    <span className="oled-text-sm">SYSTEM STATE:</span>
                    <span className="oled-text-sm px-1.5 py-0.5 rounded bg-white/10 font-bold">
                      {getOledTitle(state.currentState)}
                    </span>
                  </div>
                  <div className="oled-face">{state.oledFace}</div>
                  <div className="flex justify-between items-center text-[8px] text-white/50 pt-1 border-t border-white/5">
                    <span>BUF: {state.inputBuffer || 'EMPTY'}</span>
                    <span>BAL: ${state.primedAmount}</span>
                  </div>
                </div>
              </div>

            </div>

            {/* Lock Latch Visualizer */}
            <div className="flex flex-col gap-2 mt-2">
              <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">Lock Servo Position (Pin 18)</span>
              <div className="lock-visualizer">
                <div className="status-indicator">
                  <span className={`status-dot ${state.isLocked ? 'inactive' : 'active'}`} />
                  <span className="text-xs font-mono">{state.isLocked ? 'LOCKED' : 'UNLOCKED'}</span>
                </div>
                <div className="lock-servo-bar">
                  <div className={`lock-servo-latch ${state.isLocked ? '' : 'unlocked'}`} />
                </div>
              </div>
            </div>

            {/* 3x4 Keypad Grid */}
            <div className="flex flex-col gap-2 mt-2">
              <span className="text-xs text-gray-400 font-bold uppercase tracking-wider text-center">Hardware Matrix Keypad</span>
              <div className="keypad-grid">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((key) => (
                  <button 
                    key={key} 
                    onClick={() => handleKeyPress(key)}
                    className={`keypad-button ${key === '*' || key === '#' ? 'action-btn' : ''}`}
                    disabled={state.isTampering}
                  >
                    {key}
                  </button>
                ))}
              </div>
            </div>

          </section>

          {/* Column 2: Physical Hardware Sensors & Remote Controls */}
          <section className="glass-card">
            <h2 className="card-title text-cyan-500">
              <Sliders size={18} />
              Sensors & Overrides
            </h2>
            
            {/* Sensor switches */}
            <div className="flex flex-col gap-4">
              <h3 className="text-xs text-gray-400 font-bold uppercase tracking-wider">GPIO Pin Simulator</h3>
              
              {/* Lid Switch */}
              <div className="switch-control">
                <div className="switch-label">
                  <span className="switch-label-title">Lid Limit Switch (GPIO 13)</span>
                  <span className="switch-label-desc">Simulates physical drop box lid open/close</span>
                </div>
                <label className="toggle-switch">
                  <input 
                    type="checkbox" 
                    checked={state.lidClosed} 
                    onChange={handleLidToggle} 
                  />
                  <span className="toggle-slider" />
                </label>
              </div>

              {/* Weight Switch */}
              <div className="switch-control">
                <div className="switch-label">
                  <span className="switch-label-title">Parcel Weight Sensor</span>
                  <span className="switch-label-desc">Detects if a package is loaded inside</span>
                </div>
                <label className="toggle-switch">
                  <input 
                    type="checkbox" 
                    checked={state.parcelPresent} 
                    onChange={handleWeightToggle} 
                  />
                  <span className="toggle-slider" />
                </label>
              </div>

              {/* Tilt Switch */}
              <div className="switch-control">
                <div className="switch-label">
                  <span className="switch-label-title">Tilt Tamper Sensor (GPIO 12)</span>
                  <span className="switch-label-desc">Shaking triggers tamper alarm in &gt;200ms</span>
                </div>
                <label className="toggle-switch">
                  <input 
                    type="checkbox" 
                    checked={state.tiltDetected} 
                    onChange={handleTiltToggle} 
                  />
                  <span className="toggle-slider danger-slider" />
                </label>
              </div>
            </div>

            {/* Remote Commands Section */}
            <div className="flex flex-col gap-3 mt-4 border-t border-white/5 pt-4">
              <h3 className="text-xs text-gray-400 font-bold uppercase tracking-wider">Remote Owner Actions</h3>
              
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={handleRemoteUnlock} 
                  className="btn btn-secondary flex-1"
                  disabled={state.isTampering}
                >
                  <Unlock size={14} className="text-emerald-500" />
                  Remote Unlock
                </button>
                <button 
                  onClick={handleRemoteLock} 
                  className="btn btn-secondary flex-1"
                  disabled={state.isTampering}
                >
                  <Lock size={14} className="text-rose-500" />
                  Remote Lock
                </button>
              </div>

              <button 
                onClick={handleManualTestNotification} 
                className="btn btn-primary w-full mt-2"
                disabled={state.isTampering}
              >
                <BellRing size={16} />
                Send Manual Test Alert
              </button>
            </div>

            {/* Sound notification info */}
            <div className="bg-slate-900/60 border border-white/5 rounded-lg p-3 text-[11px] text-gray-400 mt-auto flex gap-2">
              <Info size={16} className="text-amber-500 shrink-0" />
              <p>
                Beeps require a user click on the page to unlock browser audio. Click any keypad key to activate audio.
              </p>
            </div>

          </section>

          {/* Column 3: Cameras & CCTV Management */}
          <section className="glass-card">
            <h2 className="card-title text-purple-500">
              <Camera size={18} />
              CCTV Camera Control
            </h2>

            {/* Webcam fallback toggle */}
            <div className="switch-control">
              <div className="switch-label">
                <span className="switch-label-title">Laptop Webcam Fallback</span>
                <span className="switch-label-desc">Use this machine's camera as the CCTV</span>
              </div>
              <label className="toggle-switch">
                <input 
                  type="checkbox" 
                  checked={webcamFallback} 
                  onChange={e => setWebcamFallback(e.target.checked)} 
                />
                <span className="toggle-slider" />
              </label>
            </div>

            {/* Webcam Video Viewfinder */}
            {webcamFallback && (
              <div className="camera-preview-container flex items-center justify-center">
                <video 
                  ref={videoRef} 
                  autoPlay 
                  playsInline 
                  muted 
                  className="w-full h-full object-cover scale-x-[-1]"
                />
                <div className="absolute top-2 left-2 bg-emerald-500 text-black font-extrabold text-[9px] px-2 py-0.5 rounded tracking-wide animate-pulse uppercase">
                  Local Live CCTV
                </div>
              </div>
            )}

            {/* Phone Cameras List */}
            {!webcamFallback && (
              <div className="flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">Linked Phone Cameras</span>
                </div>

                <div className="flex flex-col gap-2">
                  {cameraIds.map(camId => (
                    <div 
                      key={camId} 
                      className={`flex justify-between items-center p-2 rounded-lg text-sm border ${
                        activeCameraId === camId 
                          ? 'border-purple-500/50 bg-purple-500/5' 
                          : 'border-white/5 bg-white/2'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Smartphone size={14} className={activeCameraId === camId ? 'text-purple-400' : 'text-gray-400'} />
                        <span className="font-bold text-gray-200">{camId}</span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => setActiveCameraId(camId)}
                          className={`text-xs px-2 py-1 rounded font-semibold ${
                            activeCameraId === camId
                              ? 'bg-purple-600 text-white'
                              : 'bg-slate-800 text-gray-400 hover:text-white'
                          }`}
                        >
                          Select
                        </button>
                        
                        <button 
                          onClick={() => setShowQRForCamera(showQRForCamera === camId ? null : camId)}
                          className="bg-slate-800 hover:bg-slate-700 text-gray-300 p-1 rounded"
                          title="Generate QR / Link"
                        >
                          <ExternalLink size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add new camera ID */}
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={newCameraId} 
                    onChange={e => setNewCameraId(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                    placeholder="e.g. phone2"
                    className="bg-slate-900 border border-white/10 rounded p-1.5 text-xs text-white grow"
                  />
                  <button 
                    onClick={handleAddCamera} 
                    className="btn btn-secondary !p-1.5"
                  >
                    <Plus size={14} />
                  </button>
                </div>

                {/* QR Code Popup */}
                {showQRForCamera && (
                  <div className="qr-container">
                    <span className="text-xs text-gray-300 font-bold uppercase">Scan to connect {showQRForCamera}</span>
                    <div className="qr-placeholder">
                      <QRCodeSVG 
                        value={`${cameraUrlHost}/camera?camera_id=${showQRForCamera}`} 
                        size={120} 
                        level="M"
                      />
                    </div>
                    <a 
                      href={`/camera?camera_id=${showQRForCamera}`} 
                      target="_blank" 
                      rel="noreferrer"
                      className="text-xs text-purple-400 hover:underline inline-flex items-center gap-1"
                    >
                      Open Camera Link Directly
                      <ExternalLink size={10} />
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* Last Captured Image Preview */}
            <div className="flex flex-col gap-2 border-t border-white/5 pt-4">
              <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">CCTV Capture Frame</span>
              
              <div className="camera-preview-container">
                {lastCapturedImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img 
                    src={lastCapturedImage} 
                    alt="Last CCTV Capture" 
                    className="camera-preview-img" 
                  />
                ) : (
                  <div className="w-full h-full flex flex-col justify-center items-center gap-2 text-gray-500 text-xs">
                    <Camera size={24} />
                    <span>No snapshots captured yet</span>
                  </div>
                )}
              </div>
            </div>

          </section>

        </div>

        {/* Row 2: Event Logs */}
        <section className="glass-card">
          <h2 className="card-title text-slate-400">
            <FileText size={18} />
            System Event Log & Audit Trail
          </h2>
          
          <div className="event-log-container">
            {eventsList.length === 0 ? (
              <div className="text-center text-xs text-gray-500 py-6">No event logs registered yet. Trigger actions to log data.</div>
            ) : (
              eventsList.map((evt) => {
                let severity = '';
                if (evt.trigger_type.includes('TAMPER') || evt.trigger_type.includes('WRONG_PIN')) {
                  severity = 'severity-danger';
                } else if (evt.trigger_type.includes('DELIVERY') || evt.trigger_type.includes('OWNER') || evt.trigger_type.includes('UNLOCK')) {
                  severity = 'severity-success';
                } else if (evt.trigger_type.includes('ARMED') || evt.trigger_type.includes('MANUAL')) {
                  severity = 'severity-accent';
                }
                
                return (
                  <div key={evt.id} className={`event-log-item ${severity}`}>
                    <div className="event-log-meta">
                      <span className="event-log-type">{evt.trigger_type.replace(/_/g, ' ')}</span>
                      <span>{new Date(evt.timestamp).toLocaleString()}</span>
                    </div>
                    <p className="text-gray-300 font-light mt-0.5">{evt.notes}</p>
                    {evt.image_url && (
                      <a 
                        href={evt.image_url} 
                        target="_blank" 
                        rel="noreferrer"
                        className="text-[10px] text-purple-400 hover:underline mt-1 inline-flex items-center gap-1 w-fit"
                      >
                        View Full Screen Snapshot
                        <ExternalLink size={8} />
                      </a>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>

      </div>
      
      {/* Hidden canvas for webcam capture */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
