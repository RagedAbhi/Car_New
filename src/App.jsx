import { useState } from 'react';
import { ShopProvider, useShop } from './context/ShopContext';
import Detector from './components/Detector';
import WorkshopBoard from './components/WorkshopBoard';
import DetectionGallery from './components/DetectionGallery';
import { 
  ShieldCheck, LayoutDashboard, Car, LogOut, ArrowRight, User, Lock, Search, 
  Download, QrCode, Wrench, RefreshCw, CheckCircle, Clock 
} from 'lucide-react';
import './index.css';

function MainApp() {
  const { user, logout, vehicles, shopName, addVehicle, updateVehicleStatus } = useShop();
  const [view, setView] = useState('dashboard'); // 'dashboard', 'board', 'qr-scanner'
  const [searchTerm, setSearchTerm] = useState('');
  const [detections, setDetections] = useState([]);

  const handleDetection = (newDetection) => {
    setDetections(prev => [newDetection, ...prev].slice(0, 20)); // Keep last 20
  };

  const handleExport = () => {
    const headers = ['ID', 'Type', 'Color', 'Status', 'Timestamp'];
    const rows = vehicles.map(v => [
      v.id, v.type, v.colorName, v.status || 'ENTERED', v.timestamp
    ]);
    
    const csvContent = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Workshop_Report_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  if (!user) {
    return <LoginPortal />;
  }

  return (
    <div className="app-container">
      <header>
        <div style={{ display: 'flex', alignItems: 'center', gap: '3rem', flex: 1 }}>
          <h1 style={{ 
            fontSize: '1.5rem', 
            fontWeight: '900', 
            letterSpacing: '0.2em', 
            color: 'var(--accent-color)',
            margin: 0
          }}>
            AUTOTRACK
          </h1>
          
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search size={14} style={{ position: 'absolute', left: '14px', color: '#6b7280' }} />
            <input 
              type="text" 
              placeholder="Search vehicles, ID, color..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ 
                padding: '0.65rem 1.5rem 0.65rem 2.5rem', 
                background: '#1c1e24', 
                border: '1px solid #374151', 
                borderRadius: '9999px', 
                color: 'white', 
                fontSize: '0.85rem',
                width: '320px',
                outline: 'none'
              }}
            />
          </div>
        </div>

        <nav style={{ padding: 0 }}>
          <button 
            onClick={() => setView('dashboard')}
            className={`nav-item ${view === 'dashboard' ? 'active' : ''}`}
          >
            Gate Monitor
          </button>
          <button 
            onClick={() => setView('board')}
            className={`nav-item ${view === 'board' ? 'active' : ''}`}
          >
            Workshop Board
          </button>
          <button onClick={() => setView('qr-scanner')} className={`nav-item ${view === 'qr-scanner' ? 'active' : ''}`}>
            Scan QR
          </button>
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', borderLeft: '1px solid var(--border-color)', paddingLeft: '2rem' }}>
          <button onClick={handleExport} className="btn" style={{ padding: '0.5rem 1rem', fontSize: '0.75rem', borderRadius: '0.5rem' }}>
            <Download size={14} /> Daily Report
          </button>
          <div style={{ 
            width: '40px', 
            height: '40px', 
            borderRadius: '50%', 
            background: '#d35400', 
            color: 'white', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            fontWeight: '900',
            fontSize: '0.8rem',
            cursor: 'pointer',
            border: '2px solid transparent'
          }}
          title="Profile"
          onClick={logout}
          >
            AW
          </div>
        </div>
      </header>

      <main className="main-content">
        {view === 'dashboard' ? (
          <div className="dashboard-grid">
            {/* Today's Overview */}
            <section>
              <h2 className="table-title" style={{ marginBottom: '1.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Today's Overview</h2>
              <div className="overview-row">
                <div className="stat-card">
                  <div>
                    <div className="label">Total Today</div>
                    <div className="value stat-total">{vehicles.length}</div>
                  </div>
                  <div className="stat-icon-box"><Car size={20} color="#00d2ff" /></div>
                </div>
                <div className="stat-card">
                  <div>
                    <div className="label">Inside Workshop</div>
                    <div className="value stat-workshop">{vehicles.filter(v => v.status === 'ENTERED').length}</div>
                  </div>
                  <div className="stat-icon-box"><Wrench size={20} color="#10b981" /></div>
                </div>
                <div className="stat-card">
                  <div>
                    <div className="label">Temp Out</div>
                    <div className="value stat-temp-out">{vehicles.filter(v => v.status === 'TEMP_OUT').length}</div>
                  </div>
                  <div className="stat-icon-box"><RefreshCw size={20} color="#f472b6" /></div>
                </div>
                <div className="stat-card">
                  <div>
                    <div className="label">Delivered</div>
                    <div className="value stat-delivered">{vehicles.filter(v => v.status === 'EXITED').length}</div>
                  </div>
                  <div className="stat-icon-box"><CheckCircle size={20} color="#a855f7" /></div>
                </div>
                <div className="stat-card">
                  <div>
                    <div className="label">Waiting List</div>
                    <div className="value stat-waiting">{vehicles.filter(v => v.status === 'WAITING').length}</div>
                  </div>
                  <div className="stat-icon-box"><Clock size={20} color="#94a3b8" /></div>
                </div>
              </div>
            </section>

            {/* Live Vehicle Status */}
            <section className="panel table-section">
              <div className="table-header">
                <h2 className="table-title">Live Vehicle Status</h2>
                <div className="live-badge">
                  <div className="pulse-dot"></div>
                  Live
                </div>
              </div>
              <table className="workshop-table">
                <thead>
                  <tr>
                    <th>QR Code</th>
                    <th>Car Model</th>
                    <th>Owner</th>
                    <th>Entry Time</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {vehicles.filter(v => 
                    v.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    v.colorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    v.type.toLowerCase().includes(searchTerm.toLowerCase())
                  ).slice(0, 10).map(v => (
                    <tr key={v.id} className="animate-fade-in">
                      <td className="table-ve-id">#{v.id.split('-')[1]}</td>
                      <td style={{ fontWeight: 600 }}>{v.colorName} {v.type}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>Guest Customer</td>
                      <td style={{ color: 'var(--text-secondary)' }}>
                        {new Date(v.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}, {new Date(v.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td>
                        <div className="table-status-pill" style={{ 
                          color: v.status === 'WAITING' ? 'var(--yellow-accent)' : 
                                 v.status === 'ENTERED' ? 'var(--green-accent)' : 
                                 v.status === 'TEMP_OUT' ? 'var(--orange-accent)' : 'var(--blue-accent)'
                        }}>
                          <div className="dot" style={{ 
                            background: v.status === 'WAITING' ? 'var(--yellow-accent)' : 
                                       v.status === 'ENTERED' ? 'var(--green-accent)' : 
                                       v.status === 'TEMP_OUT' ? 'var(--orange-accent)' : 'var(--blue-accent)'
                          }}></div>
                          {v.status || 'ENTERED'}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {vehicles.length === 0 && (
                    <tr>
                      <td colSpan="5" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>No vehicles currently in the system</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              <Detector onDetection={handleDetection} />
              <DetectionGallery detections={detections} />
            </div>
          </div>
        ) : view === 'board' ? (
          <WorkshopBoard searchTerm={searchTerm} />
        ) : (
          <div className="panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}>
            <div style={{ padding: '24px', background: 'rgba(255,255,255,0.02)', borderRadius: '50%', marginBottom: '20px' }}>
              <QrCode size={64} color="var(--accent-color)" />
            </div>
            <h2>Scan Vehicle QR</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>Point your camera at the dashboard tag</p>
            <div style={{ width: '280px', height: '280px', border: '2px dashed var(--accent-color)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
               <div style={{ width: '100%', height: '2px', background: 'var(--accent-color)', position: 'absolute', top: '50%', animation: 'scan 2s infinite' }}></div>
               <span style={{ fontSize: '0.8rem' }}>Searching for QR...</span>
            </div>
            <button onClick={() => setView('board')} className="btn" style={{ marginTop: '24px' }}>Cancel</button>
          </div>
        )}
      </main>
      
      <style>{`
        @keyframes scan {
          0% { top: 10%; }
          50% { top: 90%; }
          100% { top: 10%; }
        }
      `}</style>
    </div>
  );
}

function LoginPortal() {
  const { login } = useShop();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    login(email, password);
  };

  return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-color)' }}>
      <div className="panel" style={{ width: '100%', maxWidth: '400px', padding: '2.5rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ display: 'inline-flex', padding: '12px', background: 'var(--accent-color)', borderRadius: '12px', color: '#000', marginBottom: '1rem' }}>
            <ShieldCheck size={32} />
          </div>
          <h2 style={{ fontSize: '1.75rem', fontWeight: '700' }}>Workshop Login</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Secure portal for workshop mechanics</p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="form-group">
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Email Address</label>
            <div style={{ position: 'relative' }}>
              <User size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input 
                type="email" 
                required 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ width: '100%', padding: '10px 10px 10px 38px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'white' }}
                placeholder="mechanic@workshop.com"
              />
            </div>
          </div>

          <div className="form-group">
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Password</label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input 
                type="password" 
                required 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ width: '100%', padding: '10px 10px 10px 38px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'white' }}
                placeholder="••••••••"
              />
            </div>
          </div>

          <button type="submit" className="btn primary" style={{ width: '100%', padding: '12px', marginTop: '1rem', justifyContent: 'center' }}>
            Access Workshop <ArrowRight size={18} />
          </button>
        </form>

        <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          System ID: WS-M-2024 • Protected by AutoSense
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <ShopProvider>
      <MainApp />
    </ShopProvider>
  );
}


export default App;
