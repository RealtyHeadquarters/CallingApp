import { titleCase } from '../lib/format.js';

// Tenant lifecycle → colour. Kept subtle (B2B), not loud.
const STYLES = {
  ACTIVE: { bg: 'rgba(16,185,129,.14)', fg: '#0f9d6e', bd: 'rgba(16,185,129,.35)' },
  TRIAL: { bg: 'rgba(47,107,255,.14)', fg: '#2f6bff', bd: 'rgba(47,107,255,.35)' },
  SUSPENDED: { bg: 'rgba(244,63,94,.14)', fg: '#e11d48', bd: 'rgba(244,63,94,.35)' },
  EXPIRED: { bg: 'rgba(249,115,22,.14)', fg: '#ea580c', bd: 'rgba(249,115,22,.35)' },
};

export default function TenantStatusBadge({ status }) {
  const s = STYLES[status] || STYLES.ACTIVE;
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600,
        color: s.fg, background: s.bg, border: `1px solid ${s.bd}`, whiteSpace: 'nowrap',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 999, background: s.fg }} />
      {titleCase(status || '')}
    </span>
  );
}
