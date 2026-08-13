import { useEffect, useRef, useState, useCallback } from 'react';
import api from '../api/client.js';
import { fmtDateTime } from '../lib/format.js';

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef(null);

  const loadCount = useCallback(() => {
    api.get('/notifications/unread-count').then((r) => setUnread(r.data.unreadCount)).catch(() => {});
  }, []);

  const loadList = useCallback(() => {
    api.get('/notifications', { params: { pageSize: 12 } })
      .then((r) => { setItems(r.data.data); setUnread(r.data.unreadCount); })
      .catch(() => {});
  }, []);

  // Poll the unread count periodically.
  useEffect(() => {
    loadCount();
    const t = setInterval(loadCount, 30000);
    return () => clearInterval(t);
  }, [loadCount]);

  // Close on outside click.
  useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) loadList();
  }

  async function markAll() {
    await api.post('/notifications/read-all').catch(() => {});
    setUnread(0);
    setItems((xs) => xs.map((x) => ({ ...x, read: true })));
  }

  async function openItem(n) {
    if (!n.read) {
      await api.patch(`/notifications/${n.id}/read`).catch(() => {});
      setUnread((u) => Math.max(0, u - 1));
      setItems((xs) => xs.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    }
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="btn sm" onClick={toggle} style={{ position: 'relative' }} aria-label="Notifications">
        🔔
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: -6, right: -6, background: 'var(--red)', color: '#fff',
            borderRadius: 999, fontSize: 10, fontWeight: 700, minWidth: 16, height: 16,
            display: 'grid', placeItems: 'center', padding: '0 4px',
          }}>{unread > 99 ? '99+' : unread}</span>
        )}
      </button>

      {open && (
        <div className="card" style={{
          position: 'absolute', right: 0, top: 40, width: 340, maxHeight: 420,
          overflowY: 'auto', zIndex: 40, boxShadow: 'var(--shadow)',
        }}>
          <div className="row-gap" style={{ justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
            <strong>Notifications</strong>
            {unread > 0 && <span className="link" onClick={markAll}>Mark all read</span>}
          </div>
          {items.length === 0 ? (
            <div className="center-state" style={{ padding: 30 }}>No notifications</div>
          ) : items.map((n) => (
            <div
              key={n.id}
              onClick={() => openItem(n)}
              style={{
                padding: '11px 14px', borderBottom: '1px solid var(--border)', cursor: 'pointer',
                background: n.read ? 'transparent' : 'var(--surface-2)',
              }}
            >
              <div className="row-gap" style={{ justifyContent: 'space-between' }}>
                <strong style={{ fontSize: 13.5, fontWeight: 600 }}>{n.title}</strong>
                {!n.read && <span style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--brand-500)' }} />}
              </div>
              {n.body && <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{n.body}</div>}
              <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>{fmtDateTime(n.createdAt)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
