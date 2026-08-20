import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { initials, titleCase } from '../lib/format.js';
import NotificationBell from './NotificationBell.jsx';
import BrandMark from './BrandMark.jsx';
import { GraceBanner } from './SubscriptionGate.jsx';

// Sidebar navigation (spec §43). Gated by granular permission/feature (not roles).
const NAV = [
  { to: '/', label: 'Dashboard', ico: '▧', end: true },
  { to: '/leads', label: 'Leads / Clients', ico: '☰', perm: 'lead.view' },
  { to: '/calls', label: 'Calls', ico: '☎', perm: 'call.view' },
  { to: '/follow-ups', label: 'Follow-ups', ico: '⏰', perm: 'followup.view' },
  { to: '/analytics', label: 'Analytics', ico: '📊', perm: 'report.view', feature: 'ADVANCED_REPORTS' },
  { to: '/users', label: 'Users', ico: '👥', perm: 'user.view' },
  { to: '/teams', label: 'Teams', ico: '🏢', perm: 'team.view' },
  { to: '/activity', label: 'Activity', ico: '📋', perm: 'audit.view' },
  { to: '/subscription', label: 'Subscription', ico: '💳', roles: ['ADMIN'] },
];

const TITLES = {
  '/': 'Dashboard', '/leads': 'Leads / Clients', '/calls': 'Call Report',
  '/follow-ups': 'Follow-ups', '/analytics': 'Analytics', '/users': 'Users', '/teams': 'Teams',
  '/subscription': 'Subscription & Billing', '/activity': 'Activity Log',
};

export default function Layout({ children }) {
  const { user, logout, can, hasFeature, branding } = useAuth();
  const loc = useLocation();
  const navVisible = (n) =>
    (!n.perm || can(n.perm)) && (!n.feature || hasFeature(n.feature)) && (!n.roles || n.roles.includes(user?.role));
  const title = TITLES[loc.pathname]
    || (loc.pathname.startsWith('/leads/') ? 'Lead Profile'
      : loc.pathname.startsWith('/users/') ? 'Agent Detail'
        : 'ProCallingApp');

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="logo">
          {branding?.logoUrl
            ? <img src={branding.logoUrl} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover' }} />
            : <BrandMark size={36} />}
          <span className="wordmark">
            {branding?.name ? branding.name : <>ProCalling<span className="ai">App</span></>}
          </span>
        </div>
        {NAV.filter(navVisible).map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <span className="ico">{n.ico}</span> {n.label}
          </NavLink>
        ))}
        <div className="spacer" />
        <div className="nav-item" onClick={logout} style={{ cursor: 'pointer' }}>
          <span className="ico">⏻</span> Logout
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="page-title">{title}</div>
          <div className="user-chip" style={{ gap: 16 }}>
            <NotificationBell />
            <div className="stack" style={{ textAlign: 'right' }}>
              <strong style={{ fontSize: 13.5 }}>{user?.name}</strong>
              <span className="muted" style={{ fontSize: 12 }}>{titleCase(user?.role || '')}</span>
            </div>
            <div className="avatar">{initials(user?.name)}</div>
          </div>
        </header>
        <main className="content"><GraceBanner />{children}</main>
      </div>
    </div>
  );
}
