import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './auth/AuthContext.jsx';
import { Loading } from './components/ui.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Leads from './pages/Leads.jsx';
import LeadDetail from './pages/LeadDetail.jsx';
import Calls from './pages/Calls.jsx';
import FollowUps from './pages/FollowUps.jsx';
import Analytics from './pages/Analytics.jsx';
import Users from './pages/Users.jsx';
import Teams from './pages/Teams.jsx';

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading label="Starting CallingApp CRM…" />;
  if (!user) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Protected><Dashboard /></Protected>} />
      <Route path="/leads" element={<Protected><Leads /></Protected>} />
      <Route path="/leads/:id" element={<Protected><LeadDetail /></Protected>} />
      <Route path="/calls" element={<Protected><Calls /></Protected>} />
      <Route path="/follow-ups" element={<Protected><FollowUps /></Protected>} />
      <Route path="/analytics" element={<Protected><Analytics /></Protected>} />
      <Route path="/users" element={<Protected><Users /></Protected>} />
      <Route path="/teams" element={<Protected><Teams /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
