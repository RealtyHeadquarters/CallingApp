import { useEffect, useState } from 'react';
import api, { apiError } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { Loading } from '../components/ui.jsx';

function Kpi({ label, value, sub, accent }) {
  return (
    <div className="card kpi">
      <div className="label">{label}</div>
      <div className={`value ${accent ? 'accent' : ''}`}>{value}</div>
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
          <Kpi label="Total Leads" value={o.totalLeads} />
          <Kpi label="Total Calls" value={o.totalCalls} />
          <Kpi label="Answered" value={o.answeredCalls} />
          <Kpi label="Unanswered" value={o.unansweredCalls} />
          <Kpi label="Answer Rate" value={`${o.answerRate}%`} accent />
          <Kpi label="Total Talk Time" value={o.totalTalkTime} />
          <Kpi label="Avg Talk Time" value={o.avgTalkTime} />
          <Kpi label="Converted Leads" value={o.convertedLeads} accent />
          <Kpi label="Active Users" value={`${o.activeUsers} / ${o.totalUsers}`} />
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
        <Kpi label="Total Calls" value={k.totalCalls} sub="today" />
        <Kpi label="Answered" value={k.answeredCalls} />
        <Kpi label="Unanswered" value={k.unansweredCalls} />
        <Kpi label="Answer Rate" value={`${k.answerRate}%`} accent />
        <Kpi label="Talk Time" value={k.totalTalkTime} />
        <Kpi label="Avg Talk Time" value={k.avgTalkTime} />
        <Kpi label="Today's Follow-ups" value={data.followUps.today} />
        <Kpi label="Pending Follow-ups" value={data.followUps.pending} />
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
