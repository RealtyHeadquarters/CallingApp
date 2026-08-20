import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { apiError } from '../../api/client.js';
import { Loading, CountUp } from '../../components/ui.jsx';
import TenantStatusBadge from '../../components/TenantStatusBadge.jsx';
import { fmtDate } from '../../lib/format.js';

function KCard({ label, value, icon, orange, grad }) {
  return (
    <div className={`kcard ${orange ? 'orange' : ''}`}>
      <div className="tile">{icon}</div>
      <div className="kbody">
        <div className="klabel">{label}</div>
        <div className={`kvalue ${grad ? 'grad' : ''}`}>
          {typeof value === 'number' ? <CountUp value={value} /> : value}
        </div>
      </div>
    </div>
  );
}

export default function PlatformDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/admin/stats').then((r) => setData(r.data)).catch((e) => setError(apiError(e)));
  }, []);

  if (error) return <div className="card card-pad error-text">{error}</div>;
  if (!data) return <Loading />;

  const s = data.tenants.byStatus;
  const money = (p) => '₹' + Math.round((p || 0) / 100).toLocaleString('en-IN');
  return (
    <>
      <div className="hero">
        <div className="hero-greeting">Platform Overview</div>
        <div className="hero-sub">All client organizations on ProCallingApp at a glance</div>
        <div className="hero-chips">
          <div className="hero-chip"><div className="hc-label">Clients</div><div className="hc-value">{data.tenants.total}</div></div>
          <div className="hero-chip"><div className="hc-label">Active</div><div className="hc-value">{s.ACTIVE}</div></div>
          <div className="hero-chip"><div className="hc-label">Trial</div><div className="hc-value">{s.TRIAL}</div></div>
          <div className="hero-chip"><div className="hc-label">Suspended</div><div className="hc-value">{s.SUSPENDED}</div></div>
        </div>
      </div>

      <div className="kgrid">
        <KCard label="Total Clients" value={data.tenants.total} icon="🏢" />
        <KCard label="Active" value={s.ACTIVE} icon="✅" />
        <KCard label="Trial" value={s.TRIAL} icon="🧪" />
        <KCard label="Suspended" value={s.SUSPENDED} icon="⛔" orange />
        <KCard label="Total Users" value={data.totals.users} icon="👥" />
        <KCard label="Total Calls" value={data.totals.calls} icon="📞" />
        <KCard label="Total Leads" value={data.totals.leads} icon="🎯" />
        <KCard label="Revenue (captured)" value={money(data.revenue)} icon="💰" grad />
      </div>

      <div className="section-head" style={{ marginTop: 22 }}>
        <h2>Recent Clients</h2>
        <button className="btn sm" onClick={() => navigate('/admin/tenants')}>View all</button>
      </div>
      <div className="card">
        {data.recentTenants.length === 0 ? (
          <div className="card-pad muted">No clients yet. Add your first client from the Clients page.</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Company</th><th>Slug</th><th>Status</th><th>Onboarded</th></tr></thead>
              <tbody>
                {data.recentTenants.map((t) => (
                  <tr key={t.id}>
                    <td><span className="link" onClick={() => navigate(`/admin/tenants/${t.id}`)}>{t.name}</span></td>
                    <td className="muted">{t.slug}</td>
                    <td><TenantStatusBadge status={t.status} /></td>
                    <td className="muted">{fmtDate(t.createdAt)}</td>
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
