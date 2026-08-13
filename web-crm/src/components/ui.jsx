import { titleCase } from '../lib/format.js';
import { statusColor } from '../lib/constants.js';

export function Badge({ status, children }) {
  const cls = status ? statusColor(status) : '';
  return <span className={`badge ${cls}`}>{children ?? titleCase(status || '')}</span>;
}

export function Loading({ label = 'Loading…' }) {
  return (
    <div className="center-state">
      <span className="spinner" />
      <span>{label}</span>
    </div>
  );
}

export function Empty({ label = 'Nothing here yet.' }) {
  return <div className="center-state">{label}</div>;
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
