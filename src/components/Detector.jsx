import { useEffect, useRef, useState } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import { Camera, Monitor, AlertCircle } from 'lucide-react';
import { getDominantColor, getColorName } from '../utils/colorUtils';

export default function Detector({ onDetection }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [model, setModel] = useState(null);
  const [error, setError] = useState(null);
  const lastCaptureTimeRef = useRef(0);
  const frameCountRef = useRef(0);
  const colorCacheRef = useRef({}); // Cache colors to prevent flickering
  const [isMonitoring, setIsMonitoring] = useState(false);
  const requestRef = useRef(null);

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

  async function startMonitoring() {
    setError(null);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      setError('Browser API navigator.mediaDevices.getDisplayMedia not available');
      return;
    }
    
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' },
        audio: false
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          setIsMonitoring(true);
        };
        
        // Listen for user clicking "Stop Sharing" in browser
        stream.getVideoTracks()[0].onended = () => {
          stopMonitoring();
        };
      }
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setError('Screen capture permission was denied.');
      } else {
        setError(err.message || 'Error accessing screen');
      }
    }
  }

  function stopMonitoring() {
    setIsMonitoring(false);
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach(t => t.stop());
      videoRef.current.srcObject = null;
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
          
          let carDetected = false;
          let bestCar = null;

          predictions.forEach(prediction => {
            // Check for car or truck
            if (prediction.class === 'car' || prediction.class === 'truck' || prediction.class === 'bus') {
              // Draw bounding box
              const [x, y, width, height] = prediction.bbox;
              ctx.strokeStyle = '#58a6ff';
              ctx.lineWidth = 3;
              ctx.strokeRect(x, y, width, height);

              // --- Live Color Labeling (Every 5 frames) ---
              let label = `${prediction.class} (${Math.round(prediction.score * 100)}%)`;
              const predId = `${prediction.class}-${Math.round(x)}-${Math.round(y)}`;
              
              if (frameCountRef.current % 5 === 0) {
                // Perform quick color scan on tiny crop
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = 30; tempCanvas.height = 30;
                const tCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
                tCtx.drawImage(video, x + width*0.2, y + height*0.2, width*0.6, height*0.4, 0, 0, 30, 30);
                const iData = tCtx.getImageData(0, 0, 30, 30);
                const rgb = getDominantColor(iData, 3);
                const name = getColorName(rgb[0], rgb[1], rgb[2]);
                colorCacheRef.current[predId] = name;
              }

              const liveColor = colorCacheRef.current[predId] || "Scanning...";
              label = `${liveColor} ${prediction.class} (${Math.round(prediction.score * 100)}%)`;

              ctx.fillText(label, x, y > 20 ? y - 5 : y + 20);

              // Capture snapshot if score > 60%
              if (prediction.score > 0.6) {
                carDetected = true;
                if (!bestCar || prediction.score > bestCar.score) {
                  bestCar = prediction;
                }
              }
            }
          });

          // Check cooldown (capture max once per 3.5 seconds)
          const now = Date.now();
          if (carDetected && (now - lastCaptureTimeRef.current > 3500)) {
            lastCaptureTimeRef.current = now;
            captureSnapshot(bestCar);
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
  }, [isMonitoring, model, onDetection]);

  const captureSnapshot = (bestCar) => {
    if (!videoRef.current || !bestCar) return;
    
    // Create an offscreen canvas to capture the pure video frame without bounding boxes
    const captureCanvas = document.createElement('canvas');
    captureCanvas.width = videoRef.current.videoWidth;
    captureCanvas.height = videoRef.current.videoHeight;
    const captureCtx = captureCanvas.getContext('2d');
    captureCtx.drawImage(videoRef.current, 0, 0);
    
    const imageUrl = captureCanvas.toDataURL('image/jpeg', 0.8);
    
    // --- Color Detection ---
    let dominantColorRgb = [0, 0, 0];
    let colorName = "Unknown";

    try {
      const [bx, by, bw, bh] = bestCar.bbox;
      
      // Create a small canvas for fast color clustering
      const colorCanvas = document.createElement('canvas');
      const colorSize = 50; 
      colorCanvas.width = colorSize;
      colorCanvas.height = colorSize;
      const colorCtx = colorCanvas.getContext('2d', { willReadFrequently: true });
      
      // Draw only the bounding box region, scaled down to 50x50
      colorCtx.drawImage(
        captureCanvas, 
        Math.max(0, bx), Math.max(0, by), 
        Math.min(captureCanvas.width - Math.max(0, bx), bw), 
        Math.min(captureCanvas.height - Math.max(0, by), bh),
        0, 0, colorSize, colorSize
      );

      const imageData = colorCtx.getImageData(0, 0, colorSize, colorSize);
      dominantColorRgb = getDominantColor(imageData, 4); // k=4 clusters
      colorName = getColorName(dominantColorRgb[0], dominantColorRgb[1], dominantColorRgb[2]);
    } catch (e) {
      console.error("Color detection failed:", e);
    }
    
    // Process Plate detection async then fire onDetection
    captureCanvas.toBlob(async (blob) => {
      const payload = {
        id: crypto.randomUUID(),
        imageUrl,
        timestamp: new Date().toISOString(),
        confidence: bestCar.score,
        dominantColorRgb,
        colorName,
        plate: null
      };

      try {
        const formData = new FormData();
        formData.append("file", blob, "snapshot.jpg");
        const res = await fetch("http://localhost:8000/detect-plate", {
          method: "POST",
          body: formData
        });
        
        if (res.ok) {
          const data = await res.json();
          if (data.found && data.image_b64) {
            payload.plate = {
              image_b64: data.image_b64,
              confidence: data.confidence
            };
          }
        }
      } catch (err) {
        console.error("Backend plate detection failed:", err);
      }

      onDetection(payload);
    }, 'image/jpeg', 0.8);
  };

  return (
    <div className="detector-section panel">
      <div className="camera-controls">
        <h2 className="flex items-center gap-2" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Monitor size={20} />
          <span>Screen Analysis</span>
        </h2>
        {error ? (
          <div className="status-badge" style={{ color: 'var(--danger-color)', backgroundImage: 'none', borderColor: 'var(--danger-color)' }}>
            <AlertCircle size={14} />
            {error}
          </div>
        ) : (
          <div className={`status-badge ${isMonitoring ? 'detecting' : ''}`}>
            {isMonitoring && <div className="pulse"></div>}
            {isMonitoring ? 'Active Analysis' : (model ? 'Ready to Monitor' : 'Loading Model...')}
          </div>
        )}
      </div>
      <div className="video-container">
        {!isMonitoring && (
          <div className="monitoring-overlay">
            <div className="monitoring-content">
              <Monitor size={48} className="monitoring-icon" />
              <h3>Ready to Monitor</h3>
              <p>Click the button below to select a screen, window, or tab for car analysis.</p>
              
              <div className="hall-mirrors-tip" style={{ marginTop: '20px', padding: '12px', background: 'rgba(255,165,0,0.1)', borderLeft: '3px solid orange', borderRadius: '4px', fontSize: '0.85rem', color: '#ffcc00' }}>
                <strong>Tip for Better Accuracy:</strong> To avoid the "Hall of Mirrors" effect, select a <strong>Window</strong> or <strong>Chrome Tab</strong> specifically (e.g. YouTube traffic cam) instead of your Entire Screen.
              </div>

              <button 
                onClick={startMonitoring}
                className="start-btn"
                style={{ marginTop: '24px', padding: '12px 32px', background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '1rem', fontWeight: '600' }}
              >
                {model ? "Start Analyzing Screen" : "Loading Model..."}
              </button>
            </div>
          </div>
        )}
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          muted 
          style={{ display: isMonitoring ? 'block' : 'none' }}
        />
        <canvas ref={canvasRef} className="overlay" style={{ display: isMonitoring ? 'block' : 'none' }} />
      </div>
    </div>
  );
}
