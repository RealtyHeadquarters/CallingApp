import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { apiError } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { Badge, Loading, Empty, Modal, Pagination } from '../components/ui.jsx';
import { ROLES } from '../lib/constants.js';
import { titleCase } from '../lib/format.js';

export default function Users() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'ADMIN';
  const [state, setState] = useState({ loading: true, rows: [], pagination: null });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ACTIVE');
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [teams, setTeams] = useState([]);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    api
      .get('/users', { params: { page, pageSize: 15, search: search || undefined, status: statusFilter || undefined } })
      .then((res) => setState({ loading: false, rows: res.data.data, pagination: res.data.pagination }))
      .catch((err) => { setError(apiError(err)); setState((s) => ({ ...s, loading: false })); });
  }, [page, search, statusFilter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get('/teams').then((r) => setTeams(r.data.data)).catch(() => {}); }, []);

  async function deactivate(u) {
    if (!window.confirm(`Delete "${u.name}"? They will be deactivated and can no longer log in. Their call history stays intact for reports.`)) return;
    try { await api.delete(`/users/${u.id}`); load(); }
    catch (err) { setError(apiError(err)); }
  }

  async function reactivate(u) {
    try { await api.patch(`/users/${u.id}`, { status: 'ACTIVE' }); load(); }
    catch (err) { setError(apiError(err)); }
  }

  return (
    <>
      <div className="toolbar">
        <input className="input grow" placeholder="Search users…" value={search} onChange={(e) => { setPage(1); setSearch(e.target.value); }} />
        <select className="select" value={statusFilter} onChange={(e) => { setPage(1); setStatusFilter(e.target.value); }}>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive (deleted)</option>
          <option value="">All</option>
        </select>
        {isAdmin && <button className="btn primary" onClick={() => setShowCreate(true)}>+ New User</button>}
      </div>

      {error && <div className="card card-pad error-text">{error}</div>}

      <div className="card">
        {state.loading ? <Loading /> : state.rows.length === 0 ? <Empty label="No users." /> : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th>Name</th><th>Email</th><th>Role</th><th>Team</th><th>Targets (calls/talk)</th><th>Presence</th><th>Status</th>{isAdmin && <th></th>}</tr>
              </thead>
              <tbody>
                {state.rows.map((u) => (
                  <tr key={u.id}>
                    <td><span className="link" onClick={() => navigate(`/users/${u.id}`)}>{u.name}</span><div className="muted" style={{ fontSize: 12 }}>{u.mobile}</div></td>
                    <td>{u.email}</td>
                    <td>{titleCase(u.role)}</td>
                    <td>{u.team?.name || '—'}</td>
                    <td className="muted">
                      {u.dailyCallTarget || u.dailyTalktimeTarget
                        ? `${u.dailyCallTarget ?? '—'} / ${u.dailyTalktimeTarget ? `${Math.round(u.dailyTalktimeTarget / 3600 * 10) / 10}h` : '—'}`
                        : 'Not set'}
                    </td>
                    <td><Badge>{titleCase(u.agentStatus)}</Badge></td>
                    <td><Badge status={u.status === 'ACTIVE' ? 'ANSWERED' : 'FAILED'}>{titleCase(u.status)}</Badge></td>
                    {isAdmin && (
                      <td>
                        <div className="row-gap" style={{ gap: 6 }}>
                          <button className="btn sm" onClick={() => setEditUser(u)}>Edit</button>
                          {u.status === 'ACTIVE'
                            ? <button className="btn sm" style={{ color: 'var(--red)' }} disabled={u.id === user.id} title={u.id === user.id ? "You can't delete yourself" : 'Deactivate user'} onClick={() => deactivate(u)}>Delete</button>
                            : <button className="btn sm" style={{ color: 'var(--green)' }} onClick={() => reactivate(u)}>Reactivate</button>}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Pagination pagination={state.pagination} onPage={setPage} />

      {showCreate && <CreateUserModal teams={teams} onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); load(); }} />}
      {editUser && <EditUserModal user={editUser} teams={teams} onClose={() => setEditUser(null)} onSaved={() => { setEditUser(null); load(); }} />}
    </>
  );
}

function CreateUserModal({ teams, onClose, onSaved }) {
  const [form, setForm] = useState({ name: '', email: '', mobile: '', password: '', role: 'AGENT', teamId: '', callTarget: '', talkHours: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function save() {
    setBusy(true); setError('');
    try {
      await api.post('/users', {
        name: form.name, email: form.email, mobile: form.mobile, password: form.password,
        role: form.role, teamId: form.teamId || null,
        dailyCallTarget: form.callTarget ? Number(form.callTarget) : null,
        dailyTalktimeTarget: form.talkHours ? Math.round(Number(form.talkHours) * 3600) : null,
      });
      onSaved();
    } catch (err) { setError(apiError(err)); } finally { setBusy(false); }
  }

  const valid = form.name && form.email && form.mobile && form.password.length >= 8;

  return (
    <Modal
      title="New User"
      onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save} disabled={busy || !valid}>Create</button>
      </>}
    >
      {error && <div className="error-text">{error}</div>}
      <div className="field"><label>Name *</label><input className="input" value={form.name} onChange={set('name')} /></div>
      <div className="field"><label>Email *</label><input className="input" value={form.email} onChange={set('email')} /></div>
      <div className="field"><label>Mobile *</label><input className="input" value={form.mobile} onChange={set('mobile')} /></div>
      <div className="field"><label>Password * (min 8)</label><input className="input" type="password" value={form.password} onChange={set('password')} /></div>
      <div className="field">
        <label>Role</label>
        <select className="select" value={form.role} onChange={set('role')}>
          {ROLES.map((r) => <option key={r} value={r}>{titleCase(r)}</option>)}
        </select>
      </div>
      <div className="field">
        <label>Team</label>
        <select className="select" value={form.teamId} onChange={set('teamId')}>
          <option value="">No team</option>
          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      <div className="row-gap" style={{ gap: 12 }}>
        <div className="field" style={{ flex: 1 }}><label>Daily Call Target</label><input className="input" type="number" min="0" value={form.callTarget} onChange={set('callTarget')} placeholder="e.g. 100" /></div>
        <div className="field" style={{ flex: 1 }}><label>Talk Time Target (hrs)</label><input className="input" type="number" min="0" step="0.5" value={form.talkHours} onChange={set('talkHours')} placeholder="e.g. 3" /></div>
      </div>
    </Modal>
  );
}

function EditUserModal({ user, teams, onClose, onSaved }) {
  const [form, setForm] = useState({
    role: user.role,
    status: user.status,
    teamId: user.teamId || '',
    callTarget: user.dailyCallTarget ?? '',
    talkHours: user.dailyTalktimeTarget ? Math.round(user.dailyTalktimeTarget / 3600 * 10) / 10 : '',
    password: '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function save() {
    setBusy(true); setError('');
    try {
      const payload = {
        role: form.role,
        status: form.status,
        teamId: form.teamId || null,
        dailyCallTarget: form.callTarget === '' ? null : Number(form.callTarget),
        dailyTalktimeTarget: form.talkHours === '' ? null : Math.round(Number(form.talkHours) * 3600),
      };
      if (form.password) payload.password = form.password;
      await api.patch(`/users/${user.id}`, payload);
      onSaved();
    } catch (err) { setError(apiError(err)); } finally { setBusy(false); }
  }

  return (
    <Modal
      title={`Edit ${user.name}`}
      onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save} disabled={busy}>Save</button>
      </>}
    >
      {error && <div className="error-text">{error}</div>}
      <div className="row-gap" style={{ gap: 12 }}>
        <div className="field" style={{ flex: 1 }}>
          <label>Role</label>
          <select className="select" value={form.role} onChange={set('role')}>
            {ROLES.map((r) => <option key={r} value={r}>{titleCase(r)}</option>)}
          </select>
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Status</label>
          <select className="select" value={form.status} onChange={set('status')}>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>
      </div>
      <div className="field">
        <label>Team</label>
        <select className="select" value={form.teamId} onChange={set('teamId')}>
          <option value="">No team</option>
          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      <div className="row-gap" style={{ gap: 12 }}>
        <div className="field" style={{ flex: 1 }}><label>Daily Call Target</label><input className="input" type="number" min="0" value={form.callTarget} onChange={set('callTarget')} /></div>
        <div className="field" style={{ flex: 1 }}><label>Talk Time Target (hrs)</label><input className="input" type="number" min="0" step="0.5" value={form.talkHours} onChange={set('talkHours')} /></div>
      </div>
      <div className="field"><label>Reset Password (optional, min 8)</label><input className="input" type="password" value={form.password} onChange={set('password')} placeholder="Leave blank to keep" /></div>
    </Modal>
  );
}
