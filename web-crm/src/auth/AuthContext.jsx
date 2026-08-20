import { createContext, useContext, useEffect, useState } from 'react';
import api from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get('/auth/me')
      .then((res) => { setUser(res.data.user); setSubscription(res.data.subscription || null); })
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setLoading(false));
  }, []);

  async function login(identifier, password) {
    const res = await api.post('/auth/login', { identifier, password });
    localStorage.setItem('token', res.data.token);
    setUser(res.data.user);
    setSubscription(res.data.subscription || null);
    return res.data.user;
  }

  function logout() {
    localStorage.removeItem('token');
    setUser(null);
    setSubscription(null);
    location.href = '/login';
  }

  return (
    <AuthContext.Provider value={{ user, subscription, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
