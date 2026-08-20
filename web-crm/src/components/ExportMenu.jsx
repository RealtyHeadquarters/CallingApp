import { useState, useRef, useEffect } from 'react';
import { downloadExport } from '../lib/download.js';
import { useAuth } from '../auth/AuthContext.jsx';

// Dropdown that exports the given endpoint in CSV / Excel / PDF (spec §46).
// Hidden unless the tenant's plan includes the EXPORT feature.
export default function ExportMenu({ path, params = {}, name = 'export' }) {
  const { hasFeature } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  // Hidden unless the tenant's plan includes the EXPORT feature (after hooks).
  if (!hasFeature('EXPORT')) return null;

  async function run(format) {
    setBusy(true);
    try {
      await downloadExport(path, { ...params, format }, name);
      setOpen(false);
    } catch {
      alert('Export failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="btn" onClick={() => setOpen((o) => !o)} disabled={busy}>
        {busy ? <span className="spinner" /> : '⬇ Export'}
      </button>
      {open && (
        <div className="card" style={{ position: 'absolute', right: 0, top: 42, zIndex: 40, minWidth: 150, boxShadow: 'var(--shadow)' }}>
          {[['csv', 'CSV'], ['xlsx', 'Excel (.xlsx)'], ['pdf', 'PDF']].map(([fmt, label]) => (
            <div
              key={fmt}
              onClick={() => run(fmt)}
              style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
