import { useEffect, useRef, useState } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import { Camera, AlertCircle } from 'lucide-react';
import { getDominantColor, getColorName } from '../utils/colorUtils';

export default function Detector({ onDetection }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [model, setModel] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState(null);
  const lastCaptureTimeRef = useRef(0);
  const requestRef = useRef(null);

  // Initialize webcam and model
  useEffect(() => {
    let isMounted = true;

    async function setupCamera() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Browser API navigator.mediaDevices.getUserMedia not available');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'environment' }
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        return new Promise((resolve) => {
          videoRef.current.onloadedmetadata = () => {
            resolve(videoRef.current);
          };
        });
      }
    }

    async function loadModel() {
      try {
        await tf.ready();
        const loadedModel = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
        if (isMounted) setModel(loadedModel);
      } catch (err) {
        if (isMounted) setError('Failed to load TFJS model');
      }
    }

    Promise.all([setupCamera(), loadModel()])
      .then(() => {
        if (isMounted) setIsReady(true);
      })
      .catch((err) => {
        if (isMounted) setError(err.message || 'Error accessing camera');
      });

    return () => {
      isMounted = false;
      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = videoRef.current.srcObject.getTracks();
        tracks.forEach(t => t.stop());
      }
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, []);

  // Detection Loop
  useEffect(() => {
    if (!isReady || !model) return;

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

              // Draw label
              ctx.fillStyle = '#58a6ff';
              ctx.font = '16px -apple-system, sans-serif';
              ctx.fillText(
                `${prediction.class} (${Math.round(prediction.score * 100)}%)`, 
                x, 
                y > 20 ? y - 5 : y + 20
              );

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
        
        isDetecting = false;
      }
      
      requestRef.current = requestAnimationFrame(detectFrame);
    }

    detectFrame();

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isReady, model, onDetection]);

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
          <Camera size={20} />
          <span>Live Feed</span>
        </h2>
        {error ? (
          <div className="status-badge" style={{ color: 'var(--danger-color)', backgroundImage: 'none', borderColor: 'var(--danger-color)' }}>
            <AlertCircle size={14} />
            {error}
          </div>
        ) : (
          <div className={`status-badge ${isReady ? 'detecting' : ''}`}>
            {isReady && <div className="pulse"></div>}
            {isReady ? 'Active Analysis' : 'Loading Model...'}
          </div>
        )}
      </div>
      <div className="video-container">
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          muted 
        />
        <canvas ref={canvasRef} className="overlay" />
      </div>
    </div>
  );
}
