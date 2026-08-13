import { useEffect, useState, useCallback } from 'react';
import api, { apiError } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { Loading, Empty, Modal } from '../components/ui.jsx';
import { fmtDate } from '../lib/format.js';

export default function Teams() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [teams, setTeams] = useState(null);
  const [managers, setManagers] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.get('/teams').then((r) => setTeams(r.data.data)).catch((e) => setError(apiError(e)));
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get('/users', { params: { role: 'MANAGER', pageSize: 200 } })
      .then((r) => setManagers(r.data.data)).catch(() => {});
  }, []);

  if (error) return <div className="card card-pad error-text">{error}</div>;
  if (!teams) return <Loading />;

  return (
    <>
      <div className="toolbar">
        <div style={{ flex: 1 }} />
        {isAdmin && <button className="btn primary" onClick={() => setShowCreate(true)}>+ New Team</button>}
      </div>

      <div className="card">
        {teams.length === 0 ? <Empty label="No teams yet." /> : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th>Team</th><th>Manager</th><th>Agents</th><th>Leads</th><th>Status</th><th>Created</th></tr>
              </thead>
              <tbody>
                {teams.map((t) => (
                  <tr key={t.id}>
                    <td><strong style={{ fontWeight: 600 }}>{t.name}</strong></td>
                    <td>{t.manager?.name || <span className="muted">—</span>}</td>
                    <td>{t._count?.members ?? 0}</td>
                    <td>{t._count?.clients ?? 0}</td>
                    <td><span className={`badge ${t.status === 'ACTIVE' ? 'green' : 'red'}`}>{t.status}</span></td>
                    <td className="muted">{fmtDate(t.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreate && <CreateTeamModal managers={managers} onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); load(); }} />}
    </>
  );
}

function CreateTeamModal({ managers, onClose, onSaved }) {
  const [name, setName] = useState('');
  const [managerId, setManagerId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setBusy(true); setError('');
    try {
      await api.post('/teams', { name, managerId: managerId || null });
      onSaved();
    } catch (e) { setError(apiError(e)); } finally { setBusy(false); }
  }

  return (
    <Modal
      title="New Team"
      onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save} disabled={busy || !name}>Create</button>
      </>}
    >
      {error && <div className="error-text">{error}</div>}
      <div className="field"><label>Team Name *</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="field">
        <label>Manager</label>
        <select className="select" value={managerId} onChange={(e) => setManagerId(e.target.value)}>
          <option value="">No manager</option>
          {managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>
    </Modal>
  );
}
