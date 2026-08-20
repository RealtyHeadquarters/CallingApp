import { useEffect, useRef, useState } from 'react';
import { titleCase } from '../lib/format.js';
import { statusColor } from '../lib/constants.js';

export function Badge({ status, children }) {
  const cls = status ? statusColor(status) : '';
  return <span className={`badge ${cls}`}>{children ?? titleCase(status || '')}</span>;
}

// Animated number that counts up on mount / value change — for a premium KPI feel.
export function CountUp({ value, duration = 900, format = (n) => n }) {
  const [display, setDisplay] = useState(0);
  const raf = useRef();
  const from = useRef(0);
  useEffect(() => {
    const start = performance.now();
    const startVal = from.current;
    const end = Number(value) || 0;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setDisplay(startVal + (end - startVal) * eased);
      if (t < 1) raf.current = requestAnimationFrame(tick);
      else from.current = end;
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value, duration]);
  return <>{format(Math.round(display))}</>;
}

export function Loading({ label = 'Loading…', skeleton = false, rows = 6 }) {
  if (skeleton) {
    return (
      <div style={{ padding: '8px 0' }}>
        {Array.from({ length: rows }).map((_, i) => <span key={i} className="skeleton skeleton-row" />)}
      </div>
    );
  }
  return (
    <div className="center-state">
      <span className="spinner" />
      <span>{label}</span>
    </div>
  );
}

export function Empty({ label = 'Nothing here yet.', icon = '📭' }) {
  return (
    <div className="center-state">
      <div style={{ fontSize: 40, opacity: 0.55 }}>{icon}</div>
      <span style={{ fontSize: 14 }}>{label}</span>
    </div>
  );
}

export function Modal({ title, onClose, children, footer }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="close-x" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Pagination({ pagination, onPage }) {
  if (!pagination) return null;
  const { page, totalPages, total } = pagination;
  return (
    <div className="pagination">
      <span>{total} record{total === 1 ? '' : 's'}</span>
      <div className="pages">
        <button className="btn sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Prev</button>
        <span className="btn sm" style={{ cursor: 'default' }}>{page} / {totalPages}</span>
        <button className="btn sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}
