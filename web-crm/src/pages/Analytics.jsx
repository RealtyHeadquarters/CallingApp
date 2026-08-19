import { useEffect, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import api, { apiError } from '../api/client.js';
import { Loading } from '../components/ui.jsx';
import ExportMenu from '../components/ExportMenu.jsx';
import { DATE_PRESETS } from '../lib/constants.js';
import { titleCase } from '../lib/format.js';

// Categorical palette — brand-derived, distinguishable.
const COLORS = ['#4f56c4', '#0ea5a4', '#d97706', '#2563eb', '#16a34a', '#dc2626', '#8b5cf6', '#db2777'];

export default function Analytics() {
  const [datePreset, setDatePreset] = useState('last30');
  const [data, setData] = useState(null);
  const [perf, setPerf] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null);
    const params = datePreset ? { datePreset } : {};
    Promise.all([
      api.get('/reports/analytics', { params }),
      api.get('/reports/user-performance', { params }),
    ])
      .then(([a, p]) => { setData(a.data); setPerf(p.data.data); })
      .catch((err) => setError(apiError(err)));
  }, [datePreset]);

  if (error) return <div className="card card-pad error-text">{error}</div>;

  return (
    <>
      <div className="toolbar">
        <select className="select" value={datePreset} onChange={(e) => setDatePreset(e.target.value)}>
          {DATE_PRESETS.filter((p) => p.value).map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </div>

      {!data ? <Loading /> : (
        <>
          <div className="grid-2">
            <div className="card card-pad">
              <div className="section-head"><h2>Call Volume</h2></div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.volumeSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef0f5" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => d.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="totalCalls" name="Total" fill="#4f56c4" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="answeredCalls" name="Answered" fill="#0ea5a4" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="card card-pad">
              <div className="section-head"><h2>Answer Rate (%)</h2></div>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={data.volumeSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef0f5" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => d.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
                  <Tooltip />
                  <Line type="monotone" dataKey="answerRate" name="Answer Rate" stroke="#0ea5a4" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="card card-pad">
              <div className="section-head"><h2>Disposition Breakdown</h2></div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.disposition.filter((d) => d.count > 0)} layout="vertical" margin={{ left: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef0f5" />
                  <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="disposition" tick={{ fontSize: 10 }} tickFormatter={titleCase} width={120} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#4f56c4" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="card card-pad">
              <div className="section-head">
                <h2>Lead Conversion</h2>
                <span className="badge green">
                  {data.leadConversion.totalLeads > 0
                    ? Math.round((data.leadConversion.converted / data.leadConversion.totalLeads) * 100)
                    : 0}% converted
                </span>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={data.leadConversion.byStatus}
                    dataKey="count"
                    nameKey="leadStatus"
                    cx="50%" cy="50%"
                    outerRadius={95}
                    label={(e) => titleCase(e.leadStatus)}
                  >
                    {data.leadConversion.byStatus.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v, n) => [v, titleCase(n)]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Agent-wise charts (from the performance data) */}
          <div className="section-head" style={{ marginTop: 22 }}><h2>By Agent</h2></div>
          <div className="grid-2">
            <div className="card card-pad">
              <div className="section-head"><h2>Calls by Agent (Incoming / Outgoing)</h2></div>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={perf} margin={{ bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef0f5" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} tickFormatter={(n) => (n || '').split(' ')[0]} interval={0} angle={-20} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="incoming" name="Incoming" stackId="a" fill="#10c5c0" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="outgoing" name="Outgoing" stackId="a" fill="#5b60f0" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="card card-pad">
              <div className="section-head"><h2>Answer Rate by Agent (%)</h2></div>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={perf} margin={{ bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef0f5" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} tickFormatter={(n) => (n || '').split(' ')[0]} interval={0} angle={-20} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
                  <Tooltip formatter={(v) => [`${v}%`, 'Answer Rate']} />
                  <Bar dataKey="answerRate" name="Answer Rate" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="card card-pad">
              <div className="section-head"><h2>Answered vs Unanswered by Agent</h2></div>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={perf} margin={{ bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef0f5" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} tickFormatter={(n) => (n || '').split(' ')[0]} interval={0} angle={-20} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="answeredCalls" name="Answered" stackId="b" fill="#16a34a" />
                  <Bar dataKey="unansweredCalls" name="Unanswered" stackId="b" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="card card-pad">
              <div className="section-head"><h2>Total Talk Time by Agent (min)</h2></div>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={perf.map((u) => ({ ...u, talkMin: Math.round((u.totalTalkTimeSeconds || 0) / 60) }))} margin={{ bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef0f5" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} tickFormatter={(n) => (n || '').split(' ')[0]} interval={0} angle={-20} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip formatter={(v) => [`${v} min`, 'Talk Time']} />
                  <Bar dataKey="talkMin" name="Talk Time (min)" fill="#0ea5a4" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* User performance (spec §27) */}
          <div className="section-head" style={{ marginTop: 22 }}>
            <h2>Agent Performance</h2>
            <ExportMenu path="/exports/user-performance" params={{ datePreset }} name="agent-performance" />
          </div>
          <div className="card">
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr><th>Agent</th><th>Team</th><th>Calls</th><th>↙ Incoming</th><th>↗ Outgoing</th><th>Answered</th><th>Unanswered</th><th>Answer Rate</th><th>Talk Time</th><th>Avg Talk</th></tr>
                </thead>
                <tbody>
                  {perf.map((u) => (
                    <tr key={u.userId}>
                      <td><strong style={{ fontWeight: 600 }}>{u.name}</strong></td>
                      <td className="muted">{u.team || '—'}</td>
                      <td>{u.totalCalls}</td>
                      <td style={{ color: 'var(--accent-500)', fontWeight: 600 }}>{u.incoming ?? 0}</td>
                      <td style={{ color: 'var(--brand-500)', fontWeight: 600 }}>{u.outgoing ?? 0}</td>
                      <td>{u.answeredCalls}</td>
                      <td>{u.unansweredCalls}</td>
                      <td>{u.answerRate}%</td>
                      <td>{u.totalTalkTime}</td>
                      <td>{u.avgTalkTime}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}
