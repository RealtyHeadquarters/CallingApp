import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api, { apiError } from '../../api/client.js';
import { Loading, Modal } from '../../components/ui.jsx';
import TenantStatusBadge from '../../components/TenantStatusBadge.jsx';
import { fmtDate, titleCase } from '../../lib/format.js';

export default function TenantDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [showAddUser, setShowAddUser] = useState(false);
  const [resetUser, setResetUser] = useState(null);

  const load = useCallback(() => {
    api.get(`/admin/tenants/${id}`).then((r) => setData(r.data)).catch((e) => setError(apiError(e)));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function setStatus(next) {
    const verb = next === 'SUSPENDED' ? 'Suspend' : 'Activate';
    if (!window.confirm(`${verb} "${data.tenant.name}"?`)) return;
    try { await api.patch(`/admin/tenants/${id}/status`, { status: next }); load(); }
    catch (e) { setError(apiError(e)); }
  }

  if (error) return <div className="card card-pad error-text">{error}</div>;
  if (!data) return <Loading />;
  const t = data.tenant;

  return (
    <>
      <button className="btn sm" onClick={() => navigate('/admin/tenants')} style={{ marginBottom: 14 }}>← All clients</button>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <h2 style={{ margin: 0 }}>{t.name}</h2>
              <TenantStatusBadge status={t.status} />
            </div>
            <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
              {t.slug} · {t.contactEmail || 'no contact email'} · {t.contactPhone || 'no phone'} · onboarded {fmtDate(t.createdAt)}
            </div>
          </div>
          <div className="row-gap" style={{ gap: 8 }}>
            {t.status === 'SUSPENDED'
              ? <button className="btn primary" onClick={() => setStatus('ACTIVE')}>Activate</button>
              : <button className="btn" style={{ color: 'var(--red)' }} onClick={() => setStatus('SUSPENDED')}>Suspend</button>}
          </div>
        </div>
      </div>

      <div className="kgrid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
        <div className="kcard"><div className="tile">👥</div><div className="kbody"><div className="klabel">Users</div><div className="kvalue">{t.users}</div></div></div>
        <div className="kcard"><div className="tile">📞</div><div className="kbody"><div className="klabel">Calls</div><div className="kvalue">{t.calls}</div></div></div>
        <div className="kcard"><div className="tile">🎯</div><div className="kbody"><div className="klabel">Leads</div><div className="kvalue">{t.leads}</div></div></div>
        <div className="kcard orange"><div className="tile">⏰</div><div className="kbody"><div className="klabel">Follow-ups</div><div className="kvalue">{t.followUps}</div></div></div>
      </div>

      <div className="section-head" style={{ marginTop: 22 }}>
        <h2>Users</h2>
        <button className="btn primary sm" onClick={() => setShowAddUser(true)}>+ Add User</button>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Name</th><th>Email</th><th>Mobile</th><th>Role</th><th>Status</th><th>Joined</th><th></th></tr></thead>
            <tbody>
              {data.users.map((u) => (
                <tr key={u.id}>
                  <td><strong style={{ fontWeight: 600 }}>{u.name}</strong></td>
                  <td>{u.email}</td>
                  <td className="muted">{u.mobile}</td>
                  <td>{titleCase(u.role)}</td>
                  <td>{titleCase(u.status)}</td>
                  <td className="muted">{fmtDate(u.createdAt)}</td>
                  <td><button className="btn sm" onClick={() => setResetUser(u)}>Reset password</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showAddUser && <AddUserModal tenantId={id} onClose={() => setShowAddUser(false)} onSaved={() => { setShowAddUser(false); load(); }} />}
      {resetUser && <ResetPasswordModal tenantId={id} user={resetUser} onClose={() => setResetUser(null)} onSaved={() => setResetUser(null)} />}
    </>
  );
}

function AddUserModal({ tenantId, onClose, onSaved }) {
  const [form, setForm] = useState({ name: '', email: '', mobile: '', password: '', role: 'AGENT' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function save() {
    setBusy(true); setError('');
    try { await api.post(`/admin/tenants/${tenantId}/users`, form); onSaved(); }
    catch (err) { setError(apiError(err)); } finally { setBusy(false); }
  }
  const valid = form.name.length >= 2 && /.+@.+\..+/.test(form.email) && form.mobile.length >= 6 && form.password.length >= 8;

  return (
    <Modal title="Add User" onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn primary" onClick={save} disabled={busy || !valid}>Create</button>
    </>}>
      {error && <div className="error-text">{error}</div>}
      <div className="field"><label>Name *</label><input className="input" value={form.name} onChange={set('name')} /></div>
      <div className="field"><label>Email *</label><input className="input" value={form.email} onChange={set('email')} /></div>
      <div className="field"><label>Mobile *</label><input className="input" value={form.mobile} onChange={set('mobile')} /></div>
      <div className="field"><label>Password * (min 8)</label><input className="input" type="text" value={form.password} onChange={set('password')} /></div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label>Role</label>
        <select className="select" value={form.role} onChange={set('role')}>
          <option value="ADMIN">Admin</option>
          <option value="MANAGER">Manager</option>
          <option value="AGENT">Agent</option>
        </select>
      </div>
    </Modal>
  );
}

function ResetPasswordModal({ tenantId, user, onClose, onSaved }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true); setError('');
    try { await api.patch(`/admin/tenants/${tenantId}/users/${user.id}/password`, { password }); alert('Password reset.'); onSaved(); }
    catch (err) { setError(apiError(err)); } finally { setBusy(false); }
  }

  return (
    <Modal title={`Reset password — ${user.name}`} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn primary" onClick={save} disabled={busy || password.length < 8}>Set password</button>
    </>}>
      {error && <div className="error-text">{error}</div>}
      <div className="field" style={{ marginBottom: 0 }}><label>New password (min 8)</label><input className="input" type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Share with the user" /></div>
    </Modal>
  );
}
