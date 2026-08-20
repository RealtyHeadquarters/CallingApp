// A labelled usage bar. Green < 80%, orange 80–99%, red at 100%. Unlimited → no bar.
export default function UsageBar({ label, used = 0, limit = null, percent = null }) {
  const unlimited = limit == null;
  const pct = unlimited ? 0 : (percent ?? Math.min(100, Math.round((used / limit) * 100)));
  const color = pct >= 100 ? '#e11d48' : pct >= 80 ? '#ea580c' : '#0f9d6e';
  const n = (v) => Number(v || 0).toLocaleString('en-IN');
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
        <span style={{ fontWeight: 500 }}>{label}</span>
        <span className="muted">{n(used)}{unlimited ? ' · Unlimited' : ` / ${n(limit)} · ${pct}%`}</span>
      </div>
      {!unlimited && (
        <div style={{ height: 8, borderRadius: 999, background: 'rgba(15,23,42,.08)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 999, transition: 'width .4s ease' }} />
        </div>
      )}
    </div>
  );
}
