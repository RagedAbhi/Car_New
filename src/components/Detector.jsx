import { useEffect, useRef, useState } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import { PlayCircle, Upload, AlertCircle, RefreshCw, Download } from 'lucide-react';
import { getDominantColors, getColorName } from '../utils/colorUtils';
import { useShop } from '../context/ShopContext';

export default function Detector({ onDetection }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [model, setModel] = useState(null);
  const [error, setError] = useState(null);
  const bestCaptureRef = useRef(null);
  const lastSeenTimeRef = useRef(Date.now());
  const frameCountRef = useRef(0);
  const activeTrackersRef = useRef([]);
  const colorCacheRef = useRef({}); 
  const colorHistoryRef = useRef({}); 
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const fileInputRef = useRef(null);
  const requestRef = useRef(null);
  const { addVehicle, vehicles, updateVehicleStatus } = useShop();
  
  const [gateMode, setGateMode] = useState('INGRESS'); // 'INGRESS' or 'EGRESS'
  const [selectedExitVehicleId, setSelectedExitVehicleId] = useState('');
  
  // Triage State
  const [currentMatch, setCurrentMatch] = useState(null); // The car waiting for triage
  const [isPrinting, setIsPrinting] = useState(false);


  // Initialize model
  useEffect(() => {
    let isMounted = true;

    async function loadModel() {
      try {
        await tf.ready();
        const loadedModel = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
        if (isMounted) setModel(loadedModel);
      } catch (err) {
        if (isMounted) setError('Failed to load TFJS model');
      }
    }

    loadModel();

    return () => {
      isMounted = false;
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, []);

  function handleFileChange(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('video/')) {
      setError('Please select a valid video file (MP4, WebM, etc.)');
      return;
    }

    const videoUrl = URL.createObjectURL(file);
    if (videoRef.current) {
      videoRef.current.src = videoUrl;
      videoRef.current.onloadedmetadata = () => {
        setIsMonitoring(true);
        videoRef.current.play();
      };
    }
  }

  function toggleMonitoring() {
    if (isMonitoring) {
      setIsMonitoring(false);
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.src = "";
      }
    } else {
      fileInputRef.current.click();
    }
  }

  // Detection Loop
  useEffect(() => {
    if (!isMonitoring || !model) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    let isDetecting = false;

    async function detectFrame() {
      if (!isDetecting) {
        isDetecting = true;
        
        try {
          const predictions = await model.detect(video);
          
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          // 1. Filter for vehicles and calculate area
          let vehicles = predictions
            .filter(p => ['car', 'truck', 'bus'].includes(p.class))
            .map(p => ({
              ...p,
              area: p.bbox[2] * p.bbox[3],
              cx: p.bbox[0] + p.bbox[2] / 2, // Center X
              cy: p.bbox[1] + p.bbox[3] / 2  // Center Y
            }))
            // 2. Ignore tiny 'background' cars (less than 5% of width/height area proportional)
            .filter(p => p.area > (canvas.width * canvas.height * 0.015));

          // --- MOTION TRACKER: Ignore Parked Cars ---
          const currentTrackers = [];
          vehicles = vehicles.filter(car => {
            let closestTracker = null;
            let minDist = Infinity;
            
            for (const tracker of activeTrackersRef.current) {
               const dist = Math.hypot(car.cx - tracker.cx, car.cy - tracker.cy);
               if (dist < 50 && dist < minDist) {
                  minDist = dist;
                  closestTracker = tracker;
               }
            }
            
            let stationaryCount = 0;
            if (closestTracker) {
               if (minDist < 5) { // Shifted less than 5 pixels
                  stationaryCount = closestTracker.stationaryCount + 1;
               } else {
                  stationaryCount = 0; // Car is actively moving
               }
            }
            
            currentTrackers.push({ cx: car.cx, cy: car.cy, stationaryCount });
            
            // Exclude cars that have been stationary for > 15 frames (~0.5 sec)
            return stationaryCount < 15; 
          });
          
          activeTrackersRef.current = currentTrackers;

          // 3. Select only the "Primary" car (Center-Weighted largest area)
          const bestCar = vehicles
            .map(p => {
              const [x, y, w, h] = p.bbox;
              const centerX = x + w / 2;
              const centerY = y + h / 2;
              const canvasCenterX = canvas.width / 2;
              const canvasCenterY = canvas.height / 2;
              
              // Distance from center factor (lower is better)
              const distFromCenter = Math.sqrt(
                Math.pow(centerX - canvasCenterX, 2) + 
                Math.pow(centerY - canvasCenterY, 2)
              );
              
              // Score based on area + center proximity
              // A car 100px from center gets a 0.85x penalty to its area
              const centerWeight = Math.max(0.2, 1 - (distFromCenter / (canvas.width / 2)));
              return { ...p, rankScore: p.area * centerWeight };
            })
            .sort((a, b) => b.rankScore - a.rankScore)[0];

          if (bestCar) {
            const [x, y, width, height] = bestCar.bbox;
            
            // --- Elite Color Analysis Engine (Every 5 frames) ---
            const predId = `${bestCar.class}-primary`;
            if (frameCountRef.current % 5 === 0) {
              const tempCanvas = document.createElement('canvas');
              // Increased resolution (60x60) for low-res noise reduction 
              tempCanvas.width = 60; tempCanvas.height = 60;
              const tCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
              
              // 9-Point "H" Grid:
              // Focuses on Hood, Doors, and Rear Panels while avoiding Tires, Ground, and Windows.
              const gridOffset = [
                { rx:0.5, ry:0.25, rw:0.2, rh:0.2 }, // Front Center (Hood)
                { rx:0.2, ry:0.4, rw:0.15, rh:0.2 }, // Left Front (Front Door)
                { rx:0.8, ry:0.4, rw:0.15, rh:0.2 }, // Right Front (Front Door)
                { rx:0.3, ry:0.55, rw:0.15, rh:0.2 },// Left Mid (Body)
                { rx:0.7, ry:0.55, rw:0.15, rh:0.2 },// Right Mid (Body)
                { rx:0.5, ry:0.55, rw:0.15, rh:0.15},// Center Logic (Body)
                { rx:0.3, ry:0.75, rw:0.15, rh:0.15},// Left Rear (Quarter)
                { rx:0.7, ry:0.75, rw:0.15, rh:0.15},// Right Rear (Quarter)
                { rx:0.5, ry:0.8, rw:0.1, rh:0.1 }   // Rear Trunk Panel
              ];
              
              // Draw the samples into the high-res analysis canvas
              gridOffset.forEach((roi, idx) => {
                tCtx.drawImage(
                  video, 
                  x + width * roi.rx, y + height * roi.ry, width * roi.rw, height * roi.rh,
                  (idx % 2) * 30, Math.floor(idx / 2) * 30, 30, 30
                );
              });

              const iData = tCtx.getImageData(0, 0, 60, 60);
              const foundColors = getDominantColors(iData, 4); // Multi-color detector
              const joinedName = foundColors.join(' & ');
              
              // Update Consensus (History of 10 for better stability)
              if (!colorHistoryRef.current[predId]) colorHistoryRef.current[predId] = [];
              colorHistoryRef.current[predId].push(joinedName);
              if (colorHistoryRef.current[predId].length > 10) colorHistoryRef.current[predId].shift();
              
              const votes = colorHistoryRef.current[predId].reduce((acc, curr) => {
                acc[curr] = (acc[curr] || 0) + 1;
                return acc;
              }, {});
              colorCacheRef.current[predId] = Object.keys(votes).sort((a, b) => votes[b] - votes[a])[0];
            }

            const liveColor = colorCacheRef.current[predId] || "Scanning...";
            const label = `${liveColor} ${bestCar.class} (${Math.round(bestCar.score * 100)}%)`;
            
            ctx.strokeStyle = '#f5a623'; // Golden Orange for visibility
            ctx.lineWidth = 3;
            ctx.strokeRect(x, y, width, height);

            ctx.fillStyle = '#f5a623';
            ctx.font = 'bold 16px -apple-system, sans-serif';
            ctx.fillText(label, x, y > 25 ? y - 10 : y + 25);

            // 4. Peak-Capture Memory
            lastSeenTimeRef.current = Date.now();
            if (bestCar.score > 0.5) {
              const isBetter = !bestCaptureRef.current || 
                               (bestCar.score > bestCaptureRef.current.confidence + 0.1) || 
                               (bestCar.area > bestCaptureRef.current.area * 1.5);
              
              if (isBetter && !currentMatch) { // Only update if a triage wasn't already triggered manually
                const captureCanvas = document.createElement('canvas');
                captureCanvas.width = video.videoWidth;
                captureCanvas.height = video.videoHeight;
                const captureCtx = captureCanvas.getContext('2d');
                captureCtx.drawImage(video, 0, 0);
                const imageUrl = captureCanvas.toDataURL('image/jpeg', 0.8);
                
                const newId = `VEH-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
                bestCaptureRef.current = {
                  id: newId,
                  qrCodeUrl: `https://chart.googleapis.com/chart?chs=150x150&cht=qr&chl=${newId}&choe=UTF-8`,
                  imageUrl,
                  colorName: colorCacheRef.current[predId] || "Analyzing...",
                  type: bestCar.class,
                  confidence: bestCar.score,
                  area: bestCar.area,
                  timestamp: new Date().toISOString()
                };
              }
            }
          } else {
             // No car in this frame
             // Silently wait for the video to end.
          }
        } catch (e) {
          console.error("Detection error:", e);
        }
        
        
        frameCountRef.current++;
        isDetecting = false;
      }
      
      requestRef.current = requestAnimationFrame(detectFrame);
    }

    detectFrame();

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isMonitoring, model, currentMatch, onDetection]);

  const handleManualVideoEnd = () => {
    if (bestCaptureRef.current && !currentMatch) {
      setCurrentMatch(bestCaptureRef.current);
      if (onDetection) onDetection(bestCaptureRef.current);
      bestCaptureRef.current = null;
    }
  };

  useEffect(() => {
    if (gateMode === 'EGRESS' && currentMatch) {
      const enteredVehicles = vehicles.filter(v => v.status === 'ENTERED');
      if (enteredVehicles.length > 0) {
        // Try to auto-match
        const match = enteredVehicles.find(v => v.colorName === currentMatch.colorName && v.type === currentMatch.type);
        setSelectedExitVehicleId(match ? match.id : enteredVehicles[0].id);
      }
    }
  }, [currentMatch, gateMode, vehicles]);

  const handleAccept = (print = false) => {
    if (!currentMatch) return;
    
    addVehicle({ ...currentMatch, status: 'ENTERED' });
    
    if (print) {
      window.print(); // Triggers the thermal print media query
    }
    
    setCurrentMatch(null);
  };

  const handleEgressUpdate = (newStatus) => {
    if (selectedExitVehicleId) {
      updateVehicleStatus(selectedExitVehicleId, newStatus);
    }
    setCurrentMatch(null);
  };

  const handleReject = () => {
    setCurrentMatch(null);
  };

  return (
    <div className="detector-section panel">
      <div className="card-top-border" style={{ backgroundColor: 'var(--accent-color)' }}></div>
      <div className="camera-controls">
        <h2 className="flex items-center gap-2" style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '12px',
          fontSize: '1rem',
          fontWeight: '900',
          letterSpacing: '0.05em',
          textTransform: 'uppercase'
        }}>
          <PlayCircle size={20} color="var(--accent-color)" />
          <span>Stream Analysis</span>
        </h2>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          
          {/* Gate Mode Toggle */}
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '4px' }}>
            <button 
              onClick={() => setGateMode('INGRESS')}
              style={{
                padding: '4px 12px', fontSize: '0.75rem', fontWeight: 800, borderRadius: '4px', border: 'none', cursor: 'pointer',
                background: gateMode === 'INGRESS' ? 'var(--accent-color)' : 'transparent',
                color: gateMode === 'INGRESS' ? '#000' : 'var(--text-secondary)'
              }}
            >ENTRY</button>
            <button 
              onClick={() => setGateMode('EGRESS')}
              style={{
                padding: '4px 12px', fontSize: '0.75rem', fontWeight: 800, borderRadius: '4px', border: 'none', cursor: 'pointer',
                background: gateMode === 'EGRESS' ? '#a855f7' : 'transparent',
                color: gateMode === 'EGRESS' ? '#fff' : 'var(--text-secondary)'
              }}
            >EXIT</button>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', cursor: 'pointer', color: 'var(--text-secondary)', fontWeight: '600' }}>
            <input 
              type="checkbox" 
              checked={isLooping} 
              onChange={(e) => setIsLooping(e.target.checked)} 
              style={{ accentColor: 'var(--accent-color)' }}
            />
            Loop Footage
          </label>
          
          {error ? (
            <div className="status-pill" style={{ color: 'var(--danger-color)', background: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.2)' }}>
              <div className="dot"></div>
              {error}
            </div>
          ) : (
            <div className="live-indicator">
              {isMonitoring && <div className="pulse-dot"></div>}
              {isMonitoring ? 'Live Feed' : (model ? 'System Ready' : 'Initializing AI...')}
            </div>
          )}
        </div>
      </div>

      <div className="video-container">
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileChange} 
          accept="video/*" 
          style={{ display: 'none' }} 
        />
        
        {!isMonitoring && (
          <div className="monitoring-overlay animate-fade-in">
            <div className="monitoring-content">
              <Upload size={48} className="monitoring-icon" />
              <h3>Ready to Process</h3>
              <p>Upload a video clip of traffic or cars to start the AI analysis.</p>
              
              <button 
                onClick={toggleMonitoring}
                className="start-btn"
                style={{ marginTop: '24px', padding: '12px 32px', background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '1rem', fontWeight: '600' }}
              >
                {model ? "Choose Video File" : "Loading Model..."}
              </button>
            </div>
          </div>
        )}
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          muted 
          loop={isLooping}
          onEnded={handleManualVideoEnd}
          style={{ display: isMonitoring ? 'block' : 'none' }}
        />
        <canvas ref={canvasRef} className="overlay" style={{ display: (isMonitoring && !currentMatch) ? 'block' : 'none' }} />
        
        {/* Triage Match Card */}
        {currentMatch && (
          <div className="triage-overlay animate-fade-in">
            <div className="triage-card panel animate-scale-in">
              <div style={{ position: 'relative', height: '200px' }}>
                <img src={currentMatch.imageUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Capture" />
                <div className="triage-badge">DETECTION MATCH</div>
              </div>
              
              <div className="triage-content">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                  <div>
                    <h3 style={{ color: 'white', marginBottom: '4px', fontWeight: '900', fontSize: '1.25rem' }}>{currentMatch.colorName} {currentMatch.type}</h3>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: '600' }}>ID: {currentMatch.id} • {Math.round(currentMatch.confidence * 100)}% Confidence</p>
                  </div>
                  <div className="color-swatch-large" style={{ backgroundColor: currentMatch.colorName.toLowerCase() }}></div>
                </div>

                <div className="triage-actions">
                  {gateMode === 'INGRESS' ? (
                    <>
                      <button onClick={() => handleAccept(true)} className="btn primary print-action">
                        <Download size={18} /> Print & Accept
                      </button>
                      <button onClick={() => handleAccept(false)} className="btn">
                        Wait & Accept
                      </button>
                      <button onClick={handleReject} className="btn danger-variant" style={{ color: 'var(--danger-color)', borderColor: 'rgba(239, 68, 68, 0.2)' }}>
                        Decline / Reject
                      </button>
                    </>
                  ) : (
                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <select 
                        value={selectedExitVehicleId} 
                        onChange={e => setSelectedExitVehicleId(e.target.value)}
                        style={{ width: '100%', padding: '10px', background: '#111316', color: 'white', border: '1px solid var(--border-color)', borderRadius: '6px' }}
                      >
                        <option value="" disabled>Select Vehicle in Workshop...</option>
                        {vehicles.filter(v => v.status === 'ENTERED').map(v => (
                          <option key={v.id} value={v.id}>
                            {v.id} - {v.colorName} {v.type}
                          </option>
                        ))}
                      </select>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button onClick={() => handleEgressUpdate('TEMP_OUT')} className="btn" style={{ flex: 1, borderColor: '#f472b6', color: '#f472b6' }}>
                          Mark Temp Out
                        </button>
                        <button onClick={() => handleEgressUpdate('EXITED')} className="btn" style={{ flex: 1, borderColor: '#a855f7', color: '#a855f7' }}>
                          Mark Exited
                        </button>
                        <button onClick={handleReject} className="btn" style={{ color: 'var(--text-secondary)' }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Hidden Print Content (58mm Thermal) */}
            <div className="thermal-print-container">
              <div className="thermal-ticket">
                <h2>AUTOTRACK GATE</h2>
                <hr/>
                <div style={{ fontSize: '24px', fontWeight: 'bold', margin: '10px 0' }}>{currentMatch.id}</div>
                <p>{currentMatch.colorName} {currentMatch.type}</p>
                <p>Entry: {new Date(currentMatch.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                <div style={{ margin: '15px 0' }}>
                  <img src={currentMatch.qrCodeUrl} alt="QR Code" style={{ width: '120px' }} />
                </div>
                <p style={{ fontSize: '10px' }}>Place on Dashboard</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
