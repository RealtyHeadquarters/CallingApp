import { useEffect, useState, useCallback } from 'react';
import api, { apiError } from '../api/client.js';
import { Loading, Empty, Pagination, Badge } from '../components/ui.jsx';
import { fmtDateTime, titleCase } from '../lib/format.js';

// Tenant activity / audit trail (admin only).
export default function Activity() {
  const [state, setState] = useState({ loading: true, rows: [], pagination: null });
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    api.get('/audit', { params: { page, pageSize: 25 } })
      .then((res) => setState({ loading: false, rows: res.data.data, pagination: res.data.pagination }))
      .catch((err) => { setError(apiError(err)); setState((s) => ({ ...s, loading: false })); });
  }, [page]);
  useEffect(() => { load(); }, [load]);

  if (error) return <div className="card card-pad error-text">{error}</div>;

  return (
    <>
      <div className="card">
        {state.loading ? <Loading skeleton /> : state.rows.length === 0 ? <Empty label="No activity yet." icon="📋" /> : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>When</th><th>User</th><th>Action</th><th>Entity</th><th>Details</th><th>IP</th></tr></thead>
              <tbody>
                {state.rows.map((a) => (
                  <tr key={a.id}>
                    <td className="muted" style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(a.createdAt)}</td>
                    <td>{a.user?.name || '—'}</td>
                    <td><Badge>{titleCase(a.action)}</Badge></td>
                    <td className="muted">{a.entityType || '—'}</td>
                    <td>{a.description || '—'}</td>
                    <td className="muted" style={{ fontSize: 12 }}>{a.ipAddress || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Pagination pagination={state.pagination} onPage={setPage} />
    </>
  );
}
