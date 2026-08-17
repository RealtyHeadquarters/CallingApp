import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api, { apiError } from '../api/client.js';
import { Badge, Loading } from '../components/ui.jsx';
import { fmtDate, fmtDateTime, titleCase } from '../lib/format.js';

function Kpi({ label, value, accent }) {
  return (
    <div className="card kpi">
      <div className="label">{label}</div>
      <div className={`value ${accent ? 'accent' : ''}`}>{value}</div>
    </div>
  );
}

// Per-agent detail: profile + performance KPIs + recent calls + assigned leads.
export default function UserDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState(null);
  const [calls, setCalls] = useState([]);
  const [leadCount, setLeadCount] = useState(0);
  const [followCount, setFollowCount] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/users/${id}`).then((r) => setUser(r.data.user)).catch((e) => setError(apiError(e)));
    api.get('/reports/user-performance').then((r) => setStats(r.data.data.find((u) => u.userId === id) || null)).catch(() => {});
    api.get('/calls', { params: { userId: id, pageSize: 10 } }).then((r) => setCalls(r.data.data)).catch(() => {});
    api.get('/leads', { params: { assignedUserId: id, pageSize: 1 } }).then((r) => setLeadCount(r.data.pagination.total)).catch(() => {});
    api.get('/follow-ups', { params: { userId: id, scope: 'all', pageSize: 1 } }).then((r) => setFollowCount(r.data.pagination.total)).catch(() => {});
  }, [id]);

  if (error) return <div className="card card-pad error-text">{error}</div>;
  if (!user) return <Loading />;

  return (
    <>
      <div className="row-gap" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
        <button className="btn sm" onClick={() => navigate('/users')}>← Back to users</button>
        <Badge>{titleCase(user.agentStatus)}</Badge>
      </div>

      {/* Profile */}
      <div className="card card-pad" style={{ marginBottom: 20 }}>
        <div className="row-gap" style={{ gap: 16 }}>
          <div className="avatar" style={{ width: 56, height: 56, fontSize: 20 }}>
            {user.name.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase()}
          </div>
          <div className="stack" style={{ gap: 4 }}>
            <h2 style={{ fontSize: 20 }}>{user.name}</h2>
            <span className="muted">{titleCase(user.role)} · {user.team?.name || 'No team'}</span>
            <span className="muted" style={{ fontSize: 13 }}>{user.email} · {user.mobile}</span>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div className="muted" style={{ fontSize: 12 }}>Targets</div>
            <div style={{ fontWeight: 600 }}>
              {user.dailyCallTarget || user.dailyTalktimeTarget
                ? `${user.dailyCallTarget ?? '—'} calls · ${user.dailyTalktimeTarget ? `${Math.round(user.dailyTalktimeTarget / 3600 * 10) / 10}h` : '—'}`
                : 'Not set'}
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Joined {fmtDate(user.createdAt)}</div>
          </div>
        </div>
      </div>

      {/* Performance KPIs (all-time) */}
      <div className="section-head"><h2>Performance</h2></div>
      <div className="kpi-grid">
        <Kpi label="Total Calls" value={stats?.totalCalls ?? 0} />
        <Kpi label="Answered" value={stats?.answeredCalls ?? 0} />
        <Kpi label="Unanswered" value={stats?.unansweredCalls ?? 0} />
        <Kpi label="Answer Rate" value={`${stats?.answerRate ?? 0}%`} accent />
        <Kpi label="Talk Time" value={stats?.totalTalkTime ?? '00:00:00'} />
        <Kpi label="Avg Talk Time" value={stats?.avgTalkTime ?? '00:00:00'} />
        <Kpi label="Assigned Leads" value={leadCount} />
        <Kpi label="Follow-ups" value={followCount} />
      </div>

      {/* Recent calls */}
      <div className="section-head" style={{ marginTop: 22 }}>
        <h2>Recent Calls</h2>
        <span className="link" onClick={() => navigate(`/calls`)}>View all →</span>
      </div>
      <div className="card">
        {calls.length === 0 ? <div className="center-state">No calls yet.</div> : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Date / Time</th><th>Client</th><th>Phone</th><th>Status</th><th>Duration</th><th>Disposition</th></tr></thead>
              <tbody>
                {calls.map((c) => (
                  <tr key={c.id}>
                    <td>{fmtDateTime(c.createdAt)}</td>
                    <td>{c.client?.name || c.customerName || <span className="muted">Unknown</span>}</td>
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
    </>
  );
}
