import { useShop } from '../context/ShopContext';
import { MoreVertical, ArrowRight, Clock, MapPin, CheckCircle } from 'lucide-react';

export default function WorkshopBoard({ searchTerm = '' }) {
  const { vehicles, updateVehicleStatus, removeVehicle } = useShop();

  const filteredVehicles = vehicles.filter(v => 
    v.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    v.colorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    v.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (v.status || 'ENTERED').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const columns = [
    { id: 'WAITING', title: 'Waiting', icon: <Clock size={16} /> },
    { id: 'ENTERED', title: 'Entered / Workshop', icon: <MapPin size={16} /> },
    { id: 'TEMP_OUT', title: 'Temp Out', icon: <ArrowRight size={16} /> },
    { id: 'EXITED', title: 'Exited', icon: <CheckCircle size={16} /> }
  ];

  return (
    <div className="kanban-board">
      {columns.map(col => (
        <div key={col.id} className="kanban-column">
          <div className="column-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ 
                color: col.id === 'WAITING' ? 'var(--yellow-accent)' : 
                       col.id === 'ENTERED' ? 'var(--green-accent)' : 
                       col.id === 'TEMP_OUT' ? 'var(--orange-accent)' : 'var(--blue-accent)'
              }}>
                {col.icon}
              </span>
              <span className="column-title">{col.title}</span>
            </div>
            <div style={{ 
              fontSize: '0.7rem', 
              fontWeight: '800',
              background: 'rgba(255,255,255,0.05)',
              padding: '2px 8px',
              borderRadius: '9999px',
              color: 'var(--text-secondary)'
            }}>
              {filteredVehicles.filter(v => (v.status === col.id || (!v.status && col.id === 'ENTERED'))).length}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filteredVehicles
              .filter(v => v.status === col.id || (!v.status && col.id === 'ENTERED'))
              .map(vehicle => (
                <div key={vehicle.id} className="vehicle-card" style={{ 
                  borderTopColor: col.id === 'WAITING' ? 'var(--yellow-accent)' : 
                                 col.id === 'ENTERED' ? 'var(--green-accent)' : 
                                 col.id === 'TEMP_OUT' ? 'var(--orange-accent)' : 'var(--blue-accent)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                    <div>
                      <div className="card-ve-id" style={{ 
                         color: col.id === 'WAITING' ? 'var(--yellow-accent)' : 
                                col.id === 'ENTERED' ? 'var(--green-accent)' : 
                                col.id === 'TEMP_OUT' ? 'var(--orange-accent)' : 'var(--blue-accent)'
                      }}>
                        #{vehicle.id.split('-')[1]}
                      </div>
                      <div style={{ fontSize: '0.95rem', fontWeight: '900', color: 'white', marginTop: '2px' }}>
                        {vehicle.colorName} {vehicle.type}
                      </div>
                    </div>
                    <div className="status-pill" style={{ 
                      color: col.id === 'WAITING' ? 'var(--yellow-accent)' : 
                             col.id === 'ENTERED' ? 'var(--green-accent)' : 
                             col.id === 'TEMP_OUT' ? 'var(--orange-accent)' : 'var(--blue-accent)',
                      background: 'rgba(255,255,255,0.03)',
                      padding: '2px 8px'
                    }}>
                      <div className="dot"></div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '6px', marginTop: '16px' }}>
                    {col.id !== 'WAITING' && (
                      <button 
                        onClick={() => updateVehicleStatus(vehicle.id, 'WAITING')}
                        className="btn" style={{ fontSize: '0.65rem', padding: '6px', flex: 1 }}
                        title="Move to Waiting"
                      >
                        Wait
                      </button>
                    )}
                    {col.id !== 'ENTERED' && (
                      <button 
                        onClick={() => updateVehicleStatus(vehicle.id, 'ENTERED')}
                        className="btn primary" style={{ fontSize: '0.65rem', padding: '6px', flex: 1 }}
                        title="Move to Workshop"
                      >
                        Workshop
                      </button>
                    )}
                    {col.id !== 'TEMP_OUT' && (
                      <button 
                        onClick={() => updateVehicleStatus(vehicle.id, 'TEMP_OUT')}
                        className="btn" style={{ fontSize: '0.65rem', padding: '6px', flex: 1 }}
                        title="Temp Exit"
                      >
                        Out
                      </button>
                    )}
                    {col.id !== 'EXITED' && (
                      <button 
                        onClick={() => updateVehicleStatus(vehicle.id, 'EXITED')}
                        className="btn" style={{ fontSize: '0.65rem', padding: '6px', color: 'var(--danger-color)', borderColor: 'rgba(239, 68, 68, 0.2)' }}
                        title="Delivered"
                      >
                        Exit
                      </button>
                    )}
                  </div>
                  
                  <div style={{ 
                    marginTop: '12px', 
                    paddingTop: '12px', 
                    borderTop: '1px solid rgba(255,255,255,0.03)', 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    fontSize: '0.65rem', 
                    color: 'var(--text-secondary)',
                    fontWeight: '600'
                  }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                       <Clock size={10} /> {new Date(vehicle.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <button 
                      onClick={() => removeVehicle(vehicle.id)} 
                      style={{ background: 'none', border: 'none', color: 'var(--danger-color)', cursor: 'pointer', fontSize: '0.6rem', opacity: 0.6 }}
                      className="hover-opacity-100"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
