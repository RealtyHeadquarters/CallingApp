import { useEffect, useState } from 'react';
import api, { apiError } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { Loading, CountUp } from '../components/ui.jsx';

// Premium KPI card — gradient icon tile + animated value.
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

function Hero({ name, subtitle, chips }) {
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const date = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <div className="hero">
      <div className="hero-greeting">{greet}, {name} 👋</div>
      <div className="hero-sub">{date} · {subtitle}</div>
      <div className="hero-chips">
        {chips.map((c) => (
          <div className="hero-chip" key={c.label}>
            <div className="hc-label">{c.label}</div>
            <div className="hc-value">{c.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const firstName = (user?.name || 'there').split(' ')[0];

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
        <Hero
          name={firstName}
          subtitle="Here's your organization at a glance"
          chips={[
            { label: 'Total Calls', value: o.totalCalls },
            { label: 'Answer Rate', value: `${o.answerRate}%` },
            { label: 'Converted', value: o.convertedLeads },
            { label: 'Active Agents', value: `${o.activeUsers}/${o.totalUsers}` },
          ]}
        />
        <div className="kgrid">
          <KCard label="Total Leads" value={o.totalLeads} icon="🎯" />
          <KCard label="Total Calls" value={o.totalCalls} icon="📞" />
          <KCard label="Incoming" value={o.incomingCalls ?? 0} icon="↙" orange />
          <KCard label="Outgoing" value={o.outgoingCalls ?? 0} icon="↗" />
          <KCard label="Answered" value={o.answeredCalls} icon="✅" />
          <KCard label="Unanswered" value={o.unansweredCalls} icon="📵" orange />
          <KCard label="Answer Rate" value={`${o.answerRate}%`} icon="📈" grad />
          <KCard label="Talk Time" value={o.totalTalkTime} icon="⏱️" />
          <KCard label="Avg Talk Time" value={o.avgTalkTime} icon="🕐" />
          <KCard label="Converted Leads" value={o.convertedLeads} icon="🏆" orange />
        </div>

        <div className="section-head"><h2>Follow-ups</h2></div>
        <div className="kgrid">
          <KCard label="Today" value={data.followUps.today} icon="🔔" />
          <KCard label="Pending" value={data.followUps.pending} icon="⏳" />
          <KCard label="Overdue" value={data.followUps.overdue} icon="⚠️" orange />
        </div>
      </>
    );
  }

  // Agent dashboard (spec §5)
  const k = data.kpis;
  return (
    <>
      <Hero
        name={firstName}
        subtitle="Here's your performance today"
        chips={[
          { label: "Today's Calls", value: k.totalCalls },
          { label: 'Answer Rate', value: `${k.answerRate}%` },
          { label: 'Talk Time', value: k.totalTalkTime },
          { label: 'Follow-ups', value: data.followUps.today },
        ]}
      />
      <div className="kgrid">
        <KCard label="Total Calls" value={k.totalCalls} icon="📞" />
        <KCard label="Answered" value={k.answeredCalls} icon="✅" />
        <KCard label="Unanswered" value={k.unansweredCalls} icon="📵" orange />
        <KCard label="Answer Rate" value={`${k.answerRate}%`} icon="📈" grad />
        <KCard label="Talk Time" value={k.totalTalkTime} icon="⏱️" />
        <KCard label="Avg Talk Time" value={k.avgTalkTime} icon="🕐" />
        <KCard label="Today's Follow-ups" value={data.followUps.today} icon="🔔" />
        <KCard label="Pending Follow-ups" value={data.followUps.pending} icon="⏳" orange />
      </div>

      {data.targets && (
        <>
          <div className="section-head"><h2>Today's Targets</h2></div>
          <div className="kgrid">
            {data.targets.calls && <KCard label="Calls" value={`${data.targets.calls.done} / ${data.targets.calls.target}`} icon="🎯" />}
            {data.targets.talkTime && <KCard label="Talk Time" value={`${data.targets.talkTime.done} / ${data.targets.talkTime.target}`} icon="⏱️" orange />}
          </div>
        </>
      )}
    </>
  );
}
