import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { initials, titleCase } from '../lib/format.js';
import NotificationBell from './NotificationBell.jsx';
import BrandMark from './BrandMark.jsx';

// Sidebar navigation (spec §43). Some items are admin/manager only.
const NAV = [
  { to: '/', label: 'Dashboard', ico: '▧', end: true },
  { to: '/leads', label: 'Leads / Clients', ico: '☰' },
  { to: '/calls', label: 'Calls', ico: '☎' },
  { to: '/follow-ups', label: 'Follow-ups', ico: '⏰' },
  { to: '/analytics', label: 'Analytics', ico: '📊', roles: ['ADMIN', 'MANAGER'] },
  { to: '/users', label: 'Users', ico: '👥', roles: ['ADMIN', 'MANAGER'] },
  { to: '/teams', label: 'Teams', ico: '🏢', roles: ['ADMIN', 'MANAGER'] },
];

const TITLES = {
  '/': 'Dashboard', '/leads': 'Leads / Clients', '/calls': 'Call Report',
  '/follow-ups': 'Follow-ups', '/analytics': 'Analytics', '/users': 'Users', '/teams': 'Teams',
};

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const loc = useLocation();
  const title = TITLES[loc.pathname] || (loc.pathname.startsWith('/leads/') ? 'Lead Profile' : 'ProCallAi');

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="logo">
          <BrandMark size={36} />
          <span className="wordmark">ProCall<span className="ai">Ai</span></span>
        </div>
        {NAV.filter((n) => !n.roles || n.roles.includes(user?.role)).map((n) => (
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
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
