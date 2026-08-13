import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { apiError } from '../api/client.js';
import { Badge, Loading, Empty, Pagination } from '../components/ui.jsx';
import ExportMenu from '../components/ExportMenu.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { CALL_STATUSES, DISPOSITIONS, DATE_PRESETS } from '../lib/constants.js';
import { fmtDateTime, titleCase } from '../lib/format.js';

export default function Calls() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canExport = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const [state, setState] = useState({ loading: true, rows: [], pagination: null });
  const [filters, setFilters] = useState({ callStatus: '', disposition: '', datePreset: '', search: '' });
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');

  const setF = (k) => (e) => { setPage(1); setFilters((f) => ({ ...f, [k]: e.target.value })); };

  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    const params = { page, pageSize: 20 };
    for (const [k, v] of Object.entries(filters)) if (v) params[k] = v;
    api
      .get('/calls', { params })
      .then((res) => setState({ loading: false, rows: res.data.data, pagination: res.data.pagination }))
      .catch((err) => { setError(apiError(err)); setState((s) => ({ ...s, loading: false })); });
  }, [page, filters]);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <div className="toolbar">
        <input className="input grow" placeholder="Search phone, Call ID, client…" value={filters.search} onChange={setF('search')} />
        <select className="select" value={filters.callStatus} onChange={setF('callStatus')}>
          <option value="">All statuses</option>
          {CALL_STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
        </select>
        <select className="select" value={filters.disposition} onChange={setF('disposition')}>
          <option value="">All dispositions</option>
          {DISPOSITIONS.map((d) => <option key={d} value={d}>{titleCase(d)}</option>)}
        </select>
        <select className="select" value={filters.datePreset} onChange={setF('datePreset')}>
          {DATE_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        {canExport && (
          <div style={{ marginLeft: 'auto' }}>
            <ExportMenu
              path="/exports/calls"
              params={{ callStatus: filters.callStatus || undefined, disposition: filters.disposition || undefined, datePreset: filters.datePreset || undefined }}
              name="call-report"
            />
          </div>
        )}
      </div>

      {error && <div className="card card-pad error-text">{error}</div>}

      <div className="card">
        {state.loading ? <Loading /> : state.rows.length === 0 ? <Empty label="No calls found." /> : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Call ID</th><th>Date / Time</th><th>Agent</th><th>Client</th>
                  <th>Phone</th><th>Status</th><th>Duration</th><th>Disposition</th>
                </tr>
              </thead>
              <tbody>
                {state.rows.map((c) => (
                  <tr key={c.id}>
                    <td className="muted">{c.callId}</td>
                    <td>{fmtDateTime(c.createdAt)}</td>
                    <td>{c.user?.name}</td>
                    <td>
                      {c.client
                        ? <span className="link" onClick={() => navigate(`/leads/${c.client.id}`)}>{c.client.name}</span>
                        : <span className="muted">Unknown</span>}
                    </td>
                    <td>{c.phoneNumber}</td>
                    <td><Badge status={c.callStatus || 'CANCELLED'} /></td>
                    <td>{c.durationFormatted}</td>
                    <td>{c.disposition ? titleCase(c.disposition) : '—'}</td>
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
