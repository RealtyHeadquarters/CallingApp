import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { apiError } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { Badge, Loading, Empty, Modal, Pagination } from '../components/ui.jsx';
import ExportMenu from '../components/ExportMenu.jsx';
import AgentFilter from '../components/AgentFilter.jsx';
import { LEAD_STATUSES } from '../lib/constants.js';
import { fmtDate, titleCase } from '../lib/format.js';

export default function Leads() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canManage = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const [state, setState] = useState({ loading: true, rows: [], pagination: null });
  const [search, setSearch] = useState('');
  const [leadStatus, setLeadStatus] = useState('');
  const [assignedUserId, setAssignedUserId] = useState('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    api
      .get('/leads', { params: { page, pageSize: 15, search: search || undefined, leadStatus: leadStatus || undefined, assignedUserId: assignedUserId || undefined } })
      .then((res) => setState({ loading: false, rows: res.data.data, pagination: res.data.pagination }))
      .catch((err) => { setError(apiError(err)); setState((s) => ({ ...s, loading: false })); });
  }, [page, search, leadStatus, assignedUserId]);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <div className="toolbar">
        <input
          className="input grow"
          placeholder="Search name, mobile, email, lead ID, company…"
          value={search}
          onChange={(e) => { setPage(1); setSearch(e.target.value); }}
        />
        <select className="select" value={leadStatus} onChange={(e) => { setPage(1); setLeadStatus(e.target.value); }}>
          <option value="">All statuses</option>
          {LEAD_STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
        </select>
        {canManage && <AgentFilter value={assignedUserId} onChange={(v) => { setPage(1); setAssignedUserId(v); }} allLabel="All agents" />}
        {canManage && (
          <>
            <ExportMenu path="/exports/leads" params={{ leadStatus: leadStatus || undefined }} name="leads" />
            <button className="btn" onClick={() => setShowImport(true)}>⬆ Import</button>
            <button className="btn primary" onClick={() => setShowCreate(true)}>+ New Lead</button>
          </>
        )}
      </div>

      {error && <div className="card card-pad error-text">{error}</div>}

      <div className="card">
        {state.loading ? <Loading skeleton /> : state.rows.length === 0 ? <Empty label="No leads found." /> : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Lead ID</th><th>Name</th><th>Mobile</th><th>Company</th>
                  <th>Status</th><th>Assigned</th><th>Created</th>
                </tr>
              </thead>
              <tbody>
                {state.rows.map((c) => (
                  <tr key={c.id}>
                    <td className="muted">{c.leadId}</td>
                    <td><span className="link" onClick={() => navigate(`/leads/${c.id}`)}>{c.name}</span></td>
                    <td>{c.mobile}</td>
                    <td>{c.company || '—'}</td>
                    <td><Badge status={c.leadStatus} /></td>
                    <td>{c.assignedUser?.name || <span className="muted">Unassigned</span>}</td>
                    <td className="muted">{fmtDate(c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Pagination pagination={state.pagination} onPage={setPage} />

      {showCreate && <CreateLeadModal onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); load(); }} />}
      {showImport && <ImportModal onClose={() => setShowImport(false)} onDone={() => { setShowImport(false); load(); }} />}
    </>
  );
}

function CreateLeadModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ name: '', mobile: '', email: '', company: '', source: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function save() {
    setBusy(true); setError('');
    try {
      await api.post('/leads', { ...form, email: form.email || undefined });
      onSaved();
    } catch (err) { setError(apiError(err)); } finally { setBusy(false); }
  }

  return (
    <Modal
      title="New Lead"
      onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save} disabled={busy || !form.name || !form.mobile}>Save</button>
      </>}
    >
      {error && <div className="error-text">{error}</div>}
      <div className="field"><label>Name *</label><input className="input" value={form.name} onChange={set('name')} /></div>
      <div className="field"><label>Mobile *</label><input className="input" value={form.mobile} onChange={set('mobile')} /></div>
      <div className="field"><label>Email</label><input className="input" value={form.email} onChange={set('email')} /></div>
      <div className="field"><label>Company</label><input className="input" value={form.company} onChange={set('company')} /></div>
      <div className="field"><label>Source</label><input className="input" value={form.source} onChange={set('source')} /></div>
    </Modal>
  );
}

function ImportModal({ onClose, onDone }) {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function upload() {
    if (!file) return;
    setBusy(true); setError('');
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await api.post('/leads/import', fd);
      setResult(res.data);
    } catch (err) { setError(apiError(err)); } finally { setBusy(false); }
  }

  return (
    <Modal
      title="Import Leads (CSV)"
      onClose={onClose}
      footer={result
        ? <button className="btn primary" onClick={onDone}>Done</button>
        : <>
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn primary" onClick={upload} disabled={busy || !file}>Upload</button>
          </>}
    >
      {error && <div className="error-text">{error}</div>}
      {!result ? (
        <>
          <p className="muted" style={{ marginTop: 0 }}>
            CSV columns: Name, Mobile, Email, Company, Source, Lead Status. Duplicate mobiles are skipped.
          </p>
          <input type="file" accept=".csv" onChange={(e) => setFile(e.target.files[0])} />
        </>
      ) : (
        <div className="stack" style={{ gap: 8 }}>
          <div>Total rows: <strong>{result.total}</strong></div>
          <div>Imported: <strong style={{ color: 'var(--green)' }}>{result.imported}</strong></div>
          <div>Skipped: <strong style={{ color: 'var(--amber)' }}>{result.skipped}</strong></div>
          {result.errors?.length > 0 && (
            <details><summary className="muted">{result.errors.length} issues</summary>
              <ul>{result.errors.slice(0, 20).map((e, i) => <li key={i} className="muted">Row {e.row}: {e.reason}</li>)}</ul>
            </details>
          )}
        </div>
      )}
    </Modal>
  );
}
