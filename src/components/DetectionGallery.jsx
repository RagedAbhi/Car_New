import { Images } from 'lucide-react';

export default function DetectionGallery({ detections }) {
  const formatTime = (isoString) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div className="gallery-section panel">
      <div className="gallery-header">
        <span>Detection History</span>
        <span className="count">{detections.length}</span>
      </div>
      
      {detections.length === 0 ? (
        <div className="empty-state">
          <Images size={48} className="empty-icon" />
          <p>No cars detected yet.<br/>Ensure camera is pointing at vehicles.</p>
        </div>
      ) : (
        <div className="gallery-grid">
          {detections.map(det => (
            <div key={det.id} className="image-card">
              <img src={det.imageUrl} alt="Detected car" />
              {det.plate && (
                <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 10, background: 'rgba(0,0,0,0.6)', padding: '4px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.2)' }}>
                  <img src={det.plate.image_b64} alt="License Plate" style={{ height: '30px', width: 'auto', borderRadius: '2px', display: 'block' }} />
                  <div style={{ fontSize: '0.6rem', color: '#fff', textAlign: 'center', marginTop: '2px' }}>Plate ({Math.round(det.plate.confidence * 100)}%)</div>
                </div>
              )}
              <div className="image-info">
                <span className="time">{formatTime(det.timestamp)}</span>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                  <span className="confidence">
                    {Math.round(det.confidence * 100)}% Match
                  </span>
                  {det.colorName && (
                    <div className="color-badge" title={`RGB: ${det.dominantColorRgb?.join(', ')}`}>
                      <span 
                        className="color-swatch" 
                        style={{ backgroundColor: `rgb(${det.dominantColorRgb?.join(',')})` }}
                      ></span>
                      <span className="color-name">{det.colorName}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
