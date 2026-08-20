import { useEffect, useState } from 'react';
import api, { apiError } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { Loading, CountUp } from '../components/ui.jsx';

function Kpi({ label, value, sub, accent, icon }) {
  return (
    <div className="card kpi">
      <div className="row-gap" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div className="label">{label}</div>
        {icon && (
          <div style={{
            width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center',
            fontSize: 16, background: 'linear-gradient(135deg, rgba(91,96,240,0.14), rgba(16,197,192,0.14))',
          }}>{icon}</div>
        )}
      </div>
      <div className={`value ${accent ? 'accent' : ''}`}>{typeof value === 'number' ? <CountUp value={value} /> : value}</div>
      {sub != null && <div className="sub">{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get(isAdmin ? '/dashboard/admin' : '/dashboard/agent')
      .then((res) => setData(res.data))
      .catch((err) => setError(apiError(err)));
  }, [isAdmin]);

  if (error) return <div className="card card-pad error-text">{error}</div>;
  if (!data) return <Loading />;

  if (isAdmin) {
    const o = data.organization;
    return (
      <>
        <div className="kpi-grid">
          <Kpi label="Total Leads" value={o.totalLeads} icon="🎯" />
          <Kpi label="Total Calls" value={o.totalCalls} icon="📞" />
          <Kpi label="Incoming" value={o.incomingCalls ?? 0} icon="↙️" />
          <Kpi label="Outgoing" value={o.outgoingCalls ?? 0} icon="↗️" />
          <Kpi label="Answered" value={o.answeredCalls} icon="✅" />
          <Kpi label="Unanswered" value={o.unansweredCalls} icon="📵" />
          <Kpi label="Answer Rate" value={`${o.answerRate}%`} accent icon="📈" />
          <Kpi label="Total Talk Time" value={o.totalTalkTime} icon="⏱️" />
          <Kpi label="Avg Talk Time" value={o.avgTalkTime} icon="🕐" />
          <Kpi label="Converted Leads" value={o.convertedLeads} accent icon="🏆" />
          <Kpi label="Active Users" value={`${o.activeUsers} / ${o.totalUsers}`} icon="👥" />
        </div>
        <div className="section-head"><h2>Follow-ups</h2></div>
        <div className="kpi-grid">
          <Kpi label="Today" value={data.followUps.today} />
          <Kpi label="Pending" value={data.followUps.pending} />
          <Kpi label="Overdue" value={data.followUps.overdue} sub="need attention" />
        </div>
      </>
    );
  }

  // Agent dashboard (spec §5)
  const k = data.kpis;
  return (
    <>
      <div className="kpi-grid">
        <Kpi label="Total Calls" value={k.totalCalls} sub="today" icon="📞" />
        <Kpi label="Answered" value={k.answeredCalls} icon="✅" />
        <Kpi label="Unanswered" value={k.unansweredCalls} icon="📵" />
        <Kpi label="Answer Rate" value={`${k.answerRate}%`} accent icon="📈" />
        <Kpi label="Talk Time" value={k.totalTalkTime} icon="⏱️" />
        <Kpi label="Avg Talk Time" value={k.avgTalkTime} icon="🕐" />
        <Kpi label="Today's Follow-ups" value={data.followUps.today} icon="🔔" />
        <Kpi label="Pending Follow-ups" value={data.followUps.pending} icon="⏳" />
      </div>
      {data.targets && (
        <>
          <div className="section-head"><h2>Today's Targets</h2></div>
          <div className="kpi-grid">
            {data.targets.calls && (
              <Kpi label="Calls" value={`${data.targets.calls.done} / ${data.targets.calls.target}`} />
            )}
            {data.targets.talkTime && (
              <Kpi label="Talk Time" value={`${data.targets.talkTime.done} / ${data.targets.talkTime.target}`} />
            )}
          </div>
        </>
      )}
    </>
  );
}
