import { createContext, useContext, useState, useEffect } from 'react';

const ShopContext = createContext();

export function ShopProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('autosense_user');
    return saved ? JSON.parse(saved) : null;
  });

  const [vehicles, setVehicles] = useState(() => {
    const saved = localStorage.getItem('autosense_vehicles');
    return saved ? JSON.parse(saved) : [];
  });

  const [shopName, setShopName] = useState('My Workshop');

  // Persist data
  useEffect(() => {
    localStorage.setItem('autosense_vehicles', JSON.stringify(vehicles));
  }, [vehicles]);

  useEffect(() => {
    if (user) localStorage.setItem('autosense_user', JSON.stringify(user));
    else localStorage.removeItem('autosense_user');
  }, [user]);

  const login = (email, password) => {
    // Mock authentication
    const mockUser = { id: 'u1', email, name: email.split('@')[0], shopName };
    setUser(mockUser);
    return true;
  };

  const logout = () => {
    setUser(null);
  };

  const addVehicle = (vehicleData) => {
    const newVehicle = {
      ...vehicleData,
      status: 'ENTERED', // Default status when accepted
      tenantId: user?.id || 'default'
    };
    setVehicles(prev => [newVehicle, ...prev]);
  };

  const updateVehicleStatus = (id, newStatus) => {
    setVehicles(prev => prev.map(v => 
      v.id === id ? { ...v, status: newStatus, lastUpdate: new Date().toISOString() } : v
    ));
  };

  const removeVehicle = (id) => {
    setVehicles(prev => prev.filter(v => v.id !== id));
  };

  return (
    <ShopContext.Provider value={{ 
      user, 
      login, 
      logout, 
      vehicles, 
      addVehicle, 
      updateVehicleStatus, 
      removeVehicle,
      shopName 
    }}>
      {children}
    </ShopContext.Provider>
  );
}

export function useShop() {
  return useContext(ShopContext);
}
