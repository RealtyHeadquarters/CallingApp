import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { initials } from '../lib/format.js';
import BrandMark from './BrandMark.jsx';

// Super Admin (platform owner) shell — deliberately separate from the tenant app.
const NAV = [
  { to: '/admin', label: 'Platform', ico: '▧', end: true },
  { to: '/admin/tenants', label: 'Clients', ico: '🏢' },
];

const TITLES = { '/admin': 'Platform Overview', '/admin/tenants': 'Client Organizations' };

export default function SuperAdminLayout({ children }) {
  const { user, logout } = useAuth();
  const loc = useLocation();
  const title = TITLES[loc.pathname]
    || (loc.pathname.startsWith('/admin/tenants/') ? 'Client Detail' : 'Platform');

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="logo">
          <BrandMark size={36} />
          <span className="wordmark">ProCalling<span className="ai">App</span></span>
        </div>
        <div className="muted" style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', padding: '4px 14px 10px', opacity: 0.7 }}>
          Super Admin
        </div>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
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
            <div className="stack" style={{ textAlign: 'right' }}>
              <strong style={{ fontSize: 13.5 }}>{user?.name}</strong>
              <span className="muted" style={{ fontSize: 12 }}>Platform Owner</span>
            </div>
            <div className="avatar">{initials(user?.name)}</div>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
