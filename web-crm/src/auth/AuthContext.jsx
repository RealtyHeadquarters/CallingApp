import { createContext, useContext, useEffect, useState } from 'react';
import api from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [features, setFeatures] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);

  function applyAuth(data) {
    setUser(data.user);
    setSubscription(data.subscription || null);
    setFeatures(data.features || []);
    setPermissions(data.permissions || []);
  }

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { setLoading(false); return; }
    api
      .get('/auth/me')
      .then((res) => applyAuth(res.data))
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setLoading(false));
  }, []);

  async function login(identifier, password) {
    const res = await api.post('/auth/login', { identifier, password });
    localStorage.setItem('token', res.data.token);
    applyAuth(res.data);
    return res.data.user;
  }

  function logout() {
    localStorage.removeItem('token');
    setUser(null); setSubscription(null); setFeatures([]); setPermissions([]);
    location.href = '/login';
  }

  // UI gating helpers (server still enforces; these just hide what's unavailable).
  const can = (perm) => permissions.includes(perm);
  const hasFeature = (f) => features.includes(f);

  return (
    <AuthContext.Provider value={{ user, subscription, features, permissions, loading, login, logout, can, hasFeature }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
