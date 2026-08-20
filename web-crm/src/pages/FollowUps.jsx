import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { apiError } from '../api/client.js';
import { Badge, Loading, Empty, Pagination } from '../components/ui.jsx';
import AgentFilter from '../components/AgentFilter.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { fmtDateTime, titleCase } from '../lib/format.js';

const SCOPES = [
  { value: 'today', label: 'Today' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'completed', label: 'Completed' },
  { value: 'missed', label: 'Missed' },
  { value: 'all', label: 'All' },
];

export default function FollowUps() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManage = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const [scope, setScope] = useState('today');
  const [userId, setUserId] = useState('');
  const [state, setState] = useState({ loading: true, rows: [], pagination: null });
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    api
      .get('/follow-ups', { params: { scope, page, pageSize: 20, userId: userId || undefined } })
      .then((res) => setState({ loading: false, rows: res.data.data, pagination: res.data.pagination }))
      .catch((err) => { setError(apiError(err)); setState((s) => ({ ...s, loading: false })); });
  }, [scope, page, userId]);

  useEffect(() => { load(); }, [load]);

  async function complete(id) {
    try { await api.patch(`/follow-ups/${id}`, { status: 'COMPLETED' }); load(); }
    catch (err) { setError(apiError(err)); }
  }

  return (
    <>
      <div className="toolbar">
        {SCOPES.map((s) => (
          <button
            key={s.value}
            className={`btn sm ${scope === s.value ? 'primary' : ''}`}
            onClick={() => { setPage(1); setScope(s.value); }}
          >
            {s.label}
          </button>
        ))}
        {canManage && (
          <div style={{ marginLeft: 'auto' }}>
            <AgentFilter value={userId} onChange={(v) => { setPage(1); setUserId(v); }} />
          </div>
        )}
      </div>

      {error && <div className="card card-pad error-text">{error}</div>}

      <div className="card">
        {state.loading ? <Loading skeleton /> : state.rows.length === 0 ? <Empty label="No follow-ups." /> : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Client</th><th>Agent</th><th>When</th><th>Type</th>
                  <th>Note</th><th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {state.rows.map((f) => (
                  <tr key={f.id}>
                    <td><span className="link" onClick={() => navigate(`/leads/${f.client.id}`)}>{f.client.name}</span></td>
                    <td>{f.user?.name}</td>
                    <td>{fmtDateTime(f.followupAt)}</td>
                    <td>{titleCase(f.followupType)}</td>
                    <td className="muted">{f.note || '—'}</td>
                    <td><Badge status={f.status} /></td>
                    <td>
                      {f.status === 'PENDING' && (
                        <button className="btn sm" onClick={() => complete(f.id)}>Mark done</button>
                      )}
                    </td>
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
