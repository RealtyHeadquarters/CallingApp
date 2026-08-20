import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { apiError } from '../api/client.js';
import { Badge, Loading, Empty, Pagination, Modal } from '../components/ui.jsx';
import ExportMenu from '../components/ExportMenu.jsx';
import AgentFilter from '../components/AgentFilter.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { CALL_STATUSES, DISPOSITIONS, DATE_PRESETS, CALL_DIRECTIONS } from '../lib/constants.js';
import { fmtDateTime, titleCase } from '../lib/format.js';

export default function Calls() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canExport = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const [state, setState] = useState({ loading: true, rows: [], pagination: null });
  const [filters, setFilters] = useState({ callStatus: '', disposition: '', datePreset: '', search: '', userId: '', direction: '' });
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);

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
        {canExport && <AgentFilter value={filters.userId} onChange={(v) => { setPage(1); setFilters((f) => ({ ...f, userId: v })); }} />}
        <select className="select" value={filters.direction} onChange={setF('direction')}>
          <option value="">All calls</option>
          {CALL_DIRECTIONS.map((d) => <option key={d} value={d}>{d === 'INCOMING' ? '↙ Incoming' : '↗ Outgoing'}</option>)}
        </select>
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
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
            <ExportMenu
              path="/exports/calls"
              params={{ callStatus: filters.callStatus || undefined, disposition: filters.disposition || undefined, datePreset: filters.datePreset || undefined, userId: filters.userId || undefined }}
              name="call-report"
            />
            <button className="btn primary" onClick={() => setShowAdd(true)}>+ Add Call</button>
          </div>
        )}
      </div>

      {error && <div className="card card-pad error-text">{error}</div>}

      <div className="card">
        {state.loading ? <Loading skeleton /> : state.rows.length === 0 ? <Empty label="No calls found." /> : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Call ID</th><th>Date / Time</th><th></th><th>Agent</th><th>Client</th>
                  <th>Phone</th><th>Status</th><th>Duration</th><th>Disposition</th>
                </tr>
              </thead>
              <tbody>
                {state.rows.map((c) => (
                  <tr key={c.id}>
                    <td className="muted">{c.callId}</td>
                    <td>{fmtDateTime(c.createdAt)}</td>
                    <td title={c.direction === 'INCOMING' ? 'Incoming' : 'Outgoing'} style={{ color: c.direction === 'INCOMING' ? 'var(--accent-500)' : 'var(--brand-500)', fontWeight: 700 }}>
                      {c.direction === 'INCOMING' ? '↙' : '↗'}
                    </td>
                    <td>{c.user?.name}</td>
                    <td>
                      {c.client
                        ? <span className="link" onClick={() => navigate(`/leads/${c.client.id}`)}>{c.client.name}</span>
                        : c.customerName
                          ? c.customerName
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

      {showAdd && <AddCallModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); setPage(1); load(); }} />}
    </>
  );
}

function AddCallModal({ onClose, onSaved }) {
  const [agents, setAgents] = useState([]);
  const [form, setForm] = useState({
    userId: '', phoneNumber: '', direction: 'OUTGOING', callStatus: 'ANSWERED',
    minutes: '', seconds: '', customerName: '', disposition: '', remark: '', when: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const answered = form.callStatus === 'ANSWERED';

  useEffect(() => {
    api.get('/users', { params: { role: 'AGENT', pageSize: 200 } }).then((r) => setAgents(r.data.data)).catch(() => {});
  }, []);

  async function save() {
    setBusy(true); setError('');
    try {
      const durationSeconds = (parseInt(form.minutes, 10) || 0) * 60 + (parseInt(form.seconds, 10) || 0);
      await api.post('/calls/manual', {
        userId: form.userId,
        phoneNumber: form.phoneNumber.trim(),
        direction: form.direction,
        callStatus: form.callStatus,
        durationSeconds: answered ? durationSeconds : 0,
        customerName: form.customerName.trim() || undefined,
        disposition: form.disposition || undefined,
        remark: form.remark.trim() || undefined,
        callStartTime: form.when ? new Date(form.when).toISOString() : undefined,
      });
      onSaved();
    } catch (err) { setError(apiError(err)); } finally { setBusy(false); }
  }

  const valid = form.userId && form.phoneNumber.trim().length >= 3;

  return (
    <Modal
      title="Add Call Manually"
      onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save} disabled={busy || !valid}>{busy ? <span className="spinner" /> : 'Save Call'}</button>
      </>}
    >
      {error && <div className="error-text">{error}</div>}
      <div className="field">
        <label>Agent *</label>
        <select className="select" value={form.userId} onChange={set('userId')}>
          <option value="">Select agent…</option>
          {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>
      <div className="field"><label>Phone Number *</label><input className="input" value={form.phoneNumber} onChange={set('phoneNumber')} placeholder="9876543210" /></div>
      <div className="row-gap" style={{ gap: 12 }}>
        <div className="field" style={{ flex: 1 }}>
          <label>Direction</label>
          <select className="select" value={form.direction} onChange={set('direction')}>
            <option value="OUTGOING">↗ Outgoing</option>
            <option value="INCOMING">↙ Incoming</option>
          </select>
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Status</label>
          <select className="select" value={form.callStatus} onChange={set('callStatus')}>
            {CALL_STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
          </select>
        </div>
      </div>
      {answered && (
        <div className="row-gap" style={{ gap: 12 }}>
          <div className="field" style={{ flex: 1 }}><label>Duration — min</label><input className="input" type="number" min="0" value={form.minutes} onChange={set('minutes')} /></div>
          <div className="field" style={{ flex: 1 }}><label>sec</label><input className="input" type="number" min="0" value={form.seconds} onChange={set('seconds')} /></div>
        </div>
      )}
      <div className="field"><label>Customer Name (optional — creates a lead)</label><input className="input" value={form.customerName} onChange={set('customerName')} placeholder="Rahul Sharma" /></div>
      <div className="field">
        <label>Disposition (optional)</label>
        <select className="select" value={form.disposition} onChange={set('disposition')}>
          <option value="">None</option>
          {DISPOSITIONS.map((d) => <option key={d} value={d}>{titleCase(d)}</option>)}
        </select>
      </div>
      <div className="field"><label>Remark (optional)</label><textarea className="input" rows={2} value={form.remark} onChange={set('remark')} /></div>
      <div className="field"><label>Date & Time (optional — defaults to now)</label><input className="input" type="datetime-local" value={form.when} onChange={set('when')} /></div>
    </Modal>
  );
}
