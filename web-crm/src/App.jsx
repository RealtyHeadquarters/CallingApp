import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './auth/AuthContext.jsx';
import { Loading } from './components/ui.jsx';
import Layout from './components/Layout.jsx';
import SuperAdminLayout from './components/SuperAdminLayout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Leads from './pages/Leads.jsx';
import LeadDetail from './pages/LeadDetail.jsx';
import Calls from './pages/Calls.jsx';
import FollowUps from './pages/FollowUps.jsx';
import Analytics from './pages/Analytics.jsx';
import Users from './pages/Users.jsx';
import UserDetail from './pages/UserDetail.jsx';
import Teams from './pages/Teams.jsx';
import PlatformDashboard from './pages/superadmin/PlatformDashboard.jsx';
import Tenants from './pages/superadmin/Tenants.jsx';
import TenantDetail from './pages/superadmin/TenantDetail.jsx';
import Plans from './pages/superadmin/Plans.jsx';
import Subscription from './pages/Subscription.jsx';
import Activity from './pages/Activity.jsx';
import { ExpiredScreen } from './components/SubscriptionGate.jsx';

// `superAdmin` gates the platform-owner area. The two worlds never mix:
// a super admin is redirected into /admin; a tenant user is redirected out of it.
// `allowExpired` lets a page stay reachable (billing / logout) when read-only.
function Protected({ children, superAdmin = false, allowExpired = false }) {
  const { user, subscription, loading } = useAuth();
  if (loading) return <Loading label="Starting ProCallingApp…" />;
  if (!user) return <Navigate to="/login" replace />;
  const isSA = user.role === 'SUPER_ADMIN';
  if (isSA && !superAdmin) return <Navigate to="/admin" replace />;
  if (!isSA && superAdmin) return <Navigate to="/" replace />;
  // Read-only (expired/cancelled) tenants get the block screen instead of the app.
  if (!isSA && subscription?.readOnly && !allowExpired) return <ExpiredScreen />;
  return superAdmin ? <SuperAdminLayout>{children}</SuperAdminLayout> : <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Tenant app */}
      <Route path="/" element={<Protected><Dashboard /></Protected>} />
      <Route path="/leads" element={<Protected><Leads /></Protected>} />
      <Route path="/leads/:id" element={<Protected><LeadDetail /></Protected>} />
      <Route path="/calls" element={<Protected><Calls /></Protected>} />
      <Route path="/follow-ups" element={<Protected><FollowUps /></Protected>} />
      <Route path="/analytics" element={<Protected><Analytics /></Protected>} />
      <Route path="/users" element={<Protected><Users /></Protected>} />
      <Route path="/users/:id" element={<Protected><UserDetail /></Protected>} />
      <Route path="/teams" element={<Protected><Teams /></Protected>} />
      <Route path="/activity" element={<Protected><Activity /></Protected>} />
      {/* Reachable even when read-only, so the client can review billing */}
      <Route path="/subscription" element={<Protected allowExpired><Subscription /></Protected>} />

      {/* Super Admin console */}
      <Route path="/admin" element={<Protected superAdmin><PlatformDashboard /></Protected>} />
      <Route path="/admin/tenants" element={<Protected superAdmin><Tenants /></Protected>} />
      <Route path="/admin/tenants/:id" element={<Protected superAdmin><TenantDetail /></Protected>} />
      <Route path="/admin/plans" element={<Protected superAdmin><Plans /></Protected>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
