import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { apiError } from '../../api/client.js';
import { Loading, Empty, Modal, Pagination } from '../../components/ui.jsx';
import TenantStatusBadge from '../../components/TenantStatusBadge.jsx';
import { fmtDate } from '../../lib/format.js';

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'TRIAL', label: 'Trial' },
  { value: 'SUSPENDED', label: 'Suspended' },
  { value: 'EXPIRED', label: 'Expired' },
];

export default function Tenants() {
  const navigate = useNavigate();
  const [state, setState] = useState({ loading: true, rows: [], pagination: null });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    api
      .get('/admin/tenants', { params: { page, pageSize: 15, search: search || undefined, status: status || undefined } })
      .then((res) => setState({ loading: false, rows: res.data.data, pagination: res.data.pagination }))
      .catch((err) => { setError(apiError(err)); setState((s) => ({ ...s, loading: false })); });
  }, [page, search, status]);

  useEffect(() => { load(); }, [load]);

  async function setTenantStatus(t, next) {
    const verb = next === 'SUSPENDED' ? 'Suspend' : 'Activate';
    if (!window.confirm(`${verb} "${t.name}"?${next === 'SUSPENDED' ? '\n\nIts users will be locked out until reactivated. Data is preserved.' : ''}`)) return;
    try { await api.patch(`/admin/tenants/${t.id}/status`, { status: next }); load(); }
    catch (err) { setError(apiError(err)); }
  }

  return (
    <>
      <div className="toolbar">
        <input className="input grow" placeholder="Search clients…" value={search} onChange={(e) => { setPage(1); setSearch(e.target.value); }} />
        <select className="select" value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}>
          {STATUS_FILTERS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <button className="btn primary" onClick={() => setShowCreate(true)}>+ Add Client</button>
      </div>

      {error && <div className="card card-pad error-text">{error}</div>}

      <div className="card">
        {state.loading ? <Loading skeleton /> : state.rows.length === 0 ? <Empty label="No client organizations yet." icon="🏢" /> : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th>Company</th><th>Contact</th><th>Users</th><th>Calls</th><th>Leads</th><th>Status</th><th>Onboarded</th><th></th></tr>
              </thead>
              <tbody>
                {state.rows.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <span className="link" onClick={() => navigate(`/admin/tenants/${t.id}`)}>{t.name}</span>
                      <div className="muted" style={{ fontSize: 12 }}>{t.slug}</div>
                    </td>
                    <td className="muted">{t.contactEmail || '—'}</td>
                    <td>{t.users}</td>
                    <td>{t.calls}</td>
                    <td>{t.leads}</td>
                    <td><TenantStatusBadge status={t.status} /></td>
                    <td className="muted">{fmtDate(t.createdAt)}</td>
                    <td>
                      <div className="row-gap" style={{ gap: 6 }}>
                        <button className="btn sm" onClick={() => navigate(`/admin/tenants/${t.id}`)}>Manage</button>
                        {t.status === 'SUSPENDED'
                          ? <button className="btn sm" style={{ color: 'var(--green)' }} onClick={() => setTenantStatus(t, 'ACTIVE')}>Activate</button>
                          : <button className="btn sm" style={{ color: 'var(--red)' }} onClick={() => setTenantStatus(t, 'SUSPENDED')}>Suspend</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Pagination pagination={state.pagination} onPage={setPage} />

      {showCreate && <OnboardModal onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); setPage(1); load(); }} />}
    </>
  );
}

// Onboard a client: company info + first admin → credentials to hand over.
function OnboardModal({ onClose, onSaved }) {
  const [form, setForm] = useState({
    companyName: '', trial: false,
    adminName: '', adminEmail: '', adminMobile: '', adminPassword: '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null); // { email, password }
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function save() {
    setBusy(true); setError('');
    try {
      await api.post('/admin/tenants', {
        company: { name: form.companyName, status: form.trial ? 'TRIAL' : 'ACTIVE' },
        admin: { name: form.adminName, email: form.adminEmail, mobile: form.adminMobile, password: form.adminPassword },
      });
      setDone({ email: form.adminEmail, password: form.adminPassword });
    } catch (err) { setError(apiError(err)); } finally { setBusy(false); }
  }

  const valid = form.companyName.length >= 2 && form.adminName.length >= 2
    && /.+@.+\..+/.test(form.adminEmail) && form.adminMobile.length >= 6 && form.adminPassword.length >= 8;

  if (done) {
    return (
      <Modal title="Client created 🎉" onClose={onSaved} footer={<button className="btn primary" onClick={onSaved}>Done</button>}>
        <p className="muted" style={{ marginTop: 0 }}>Share these login details with the client admin. They can change the password after first login.</p>
        <div className="card card-pad" style={{ background: 'rgba(47,107,255,.06)' }}>
          <div className="field"><label>Login email</label><div><strong>{done.email}</strong></div></div>
          <div className="field" style={{ marginBottom: 0 }}><label>Temporary password</label><div><strong>{done.password}</strong></div></div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title="Add Client Organization"
      onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save} disabled={busy || !valid}>Create client</button>
      </>}
    >
      {error && <div className="error-text">{error}</div>}
      <div className="section-head" style={{ marginTop: 0 }}><h2 style={{ fontSize: 14 }}>Company</h2></div>
      <div className="field"><label>Company name *</label><input className="input" value={form.companyName} onChange={set('companyName')} placeholder="Acme Realty Pvt Ltd" /></div>
      <div className="field">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={form.trial} onChange={(e) => setForm({ ...form, trial: e.target.checked })} />
          Start as trial
        </label>
      </div>

      <div className="section-head"><h2 style={{ fontSize: 14 }}>Client Admin (first login)</h2></div>
      <div className="field"><label>Admin name *</label><input className="input" value={form.adminName} onChange={set('adminName')} /></div>
      <div className="field"><label>Admin email *</label><input className="input" value={form.adminEmail} onChange={set('adminEmail')} placeholder="admin@acme.com" /></div>
      <div className="field"><label>Admin mobile *</label><input className="input" value={form.adminMobile} onChange={set('adminMobile')} /></div>
      <div className="field" style={{ marginBottom: 0 }}><label>Temporary password * (min 8)</label><input className="input" type="text" value={form.adminPassword} onChange={set('adminPassword')} placeholder="Share with the client" /></div>
    </Modal>
  );
}
