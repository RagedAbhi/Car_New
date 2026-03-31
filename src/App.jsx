import { useState } from 'react';
import Detector from './components/Detector';
import DetectionGallery from './components/DetectionGallery';
import { ShieldCheck } from 'lucide-react';
import './index.css';

function App() {
  const [detections, setDetections] = useState([]);

  const handleDetection = (detection) => {
    setDetections((prev) => {
      // Keep only recent detections to somewhat manage memory
      const newDetections = [detection, ...prev];
      if (newDetections.length > 50) {
        return newDetections.slice(0, 50);
      }
      return newDetections;
    });
  };

  return (
    <div className="app-container">
      <header>
        <div style={{ padding: '8px', background: 'var(--accent-color)', borderRadius: '8px', color: '#000' }}>
          <ShieldCheck size={28} />
        </div>
        <div>
          <h1>AutoSense</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>AI-Powered Vehicle Detection</p>
        </div>
      </header>

      <main className="main-content">
        <Detector onDetection={handleDetection} />
        <DetectionGallery detections={detections} />
      </main>
    </div>
  );
}

export default App;
