import { useAuth } from '../auth/AuthContext.jsx';
import BrandMark from './BrandMark.jsx';
import { fmtDate } from '../lib/format.js';

// Full-page block shown to tenant users when the subscription is read-only.
// Data is preserved; the client contacts the platform owner to renew (Phase 3
// has no self-serve billing — that's Phase 6).
export function ExpiredScreen() {
  const { subscription, user, logout } = useAuth();
  const cancelled = subscription?.state === 'CANCELLED';
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div className="card card-pad" style={{ maxWidth: 460, textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}><BrandMark size={48} /></div>
        <div style={{ fontSize: 40, marginBottom: 6 }}>{cancelled ? '🚫' : '⏳'}</div>
        <h2 style={{ margin: '0 0 8px' }}>Subscription {cancelled ? 'cancelled' : 'expired'}</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          {user?.name ? `Hi ${user.name.split(' ')[0]}, ` : ''}your organization's subscription has {cancelled ? 'been cancelled' : 'expired'}.
          Your data is safe and nothing has been deleted. Please contact your account manager to renew and restore full access.
        </p>
        <div className="row-gap" style={{ justifyContent: 'center', marginTop: 16, gap: 8 }}>
          <button className="btn" onClick={() => location.reload()}>Refresh</button>
          <button className="btn primary" onClick={logout}>Log out</button>
        </div>
      </div>
    </div>
  );
}

// Thin banner shown across the app while in the grace period.
export function GraceBanner() {
  const { subscription } = useAuth();
  if (!subscription?.inGrace) return null;
  return (
    <div className="grace-banner">
      ⚠️ Your subscription period has ended{subscription.endsAt ? ` — grace period until ${fmtDate(subscription.endsAt)}` : ''}. Please renew to avoid interruption.
    </div>
  );
}
