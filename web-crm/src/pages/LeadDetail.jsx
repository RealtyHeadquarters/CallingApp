import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api, { apiError } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { Badge, Loading, Modal } from '../components/ui.jsx';
import { LEAD_STATUSES } from '../lib/constants.js';
import { fmtDate, fmtDateTime, fmtDuration, titleCase } from '../lib/format.js';

export default function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManage = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const [data, setData] = useState(null);
  const [agents, setAgents] = useState([]);
  const [error, setError] = useState('');
  const [showAssign, setShowAssign] = useState(false);

  const load = useCallback(() => {
    api.get(`/leads/${id}`).then((res) => setData(res.data)).catch((err) => setError(apiError(err)));
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (canManage) api.get('/users', { params: { role: 'AGENT', pageSize: 200 } }).then((r) => setAgents(r.data.data)).catch(() => {});
  }, [canManage]);

  if (error) return <div className="card card-pad error-text">{error}</div>;
  if (!data) return <Loading />;

  const c = data.client;
  const s = c.stats;

  return (
    <>
      <div className="row-gap" style={{ marginBottom: 16, justifyContent: 'space-between' }}>
        <button className="btn sm" onClick={() => navigate('/leads')}>← Back to leads</button>
        {canManage && <button className="btn primary sm" onClick={() => setShowAssign(true)}>Assign / Reassign</button>}
      </div>

      <div className="grid-2">
        {/* Profile */}
        <div className="card card-pad">
          <div className="row-gap" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
            <h2>{c.name}</h2>
            <Badge status={c.leadStatus} />
          </div>
          <InfoRow label="Lead ID" value={c.leadId} />
          <InfoRow label="Mobile" value={c.mobile} />
          <InfoRow label="Alternate" value={c.alternateMobile || '—'} />
          <InfoRow label="Email" value={c.email || '—'} />
          <InfoRow label="Company" value={c.company || '—'} />
          <InfoRow label="Source" value={c.source || '—'} />
          <InfoRow label="Assigned Agent" value={c.assignedUser?.name || 'Unassigned'} />
          <InfoRow label="Created" value={fmtDate(c.createdAt)} />
        </div>

        {/* Calling info (spec §19) */}
        <div className="card card-pad">
          <h2 style={{ marginBottom: 14 }}>Calling Summary</h2>
          <div className="kpi-grid" style={{ marginBottom: 0, gridTemplateColumns: 'repeat(2, 1fr)' }}>
            <MiniStat label="Total Calls" value={s.totalCalls} />
            <MiniStat label="Answered" value={s.answeredCalls} />
            <MiniStat label="Unanswered" value={s.unansweredCalls} />
            <MiniStat label="Answer Rate" value={`${s.answerRate}%`} />
            <MiniStat label="Total Talk Time" value={s.totalTalkTime} />
            <MiniStat label="Avg Talk Time" value={s.avgTalkTime} />
          </div>
        </div>
      </div>

      {/* Timeline (spec §20) */}
      <div className="section-head" style={{ marginTop: 22 }}><h2>Client Timeline</h2></div>
      <div className="card card-pad">
        {data.timeline.length === 0 ? <span className="muted">No calls yet.</span> : (
          <div className="timeline">
            {data.timeline.map((call) => {
              const answered = call.callStatus === 'ANSWERED';
              return (
                <div key={call.id} className={`tl-item ${answered ? 'answered' : 'unanswered'}`}>
                  <div className="row-gap" style={{ justifyContent: 'space-between' }}>
                    <strong>{fmtDateTime(call.createdAt)}</strong>
                    <Badge status={call.callStatus || 'CANCELLED'} />
                  </div>
                  <div className="muted" style={{ margin: '2px 0' }}>
                    {call.user?.name} · Duration {fmtDuration(call.durationSeconds)}
                    {call.disposition && <> · {titleCase(call.disposition)}</>}
                  </div>
                  {call.remark && <div>{call.remark}</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showAssign && (
        <AssignModal
          agents={agents}
          current={c.assignedUserId}
          onClose={() => setShowAssign(false)}
          onSaved={() => { setShowAssign(false); load(); }}
          leadId={id}
        />
      )}
    </>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="row-gap" style={{ justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
      <span className="muted">{label}</span>
      <strong style={{ fontWeight: 600 }}>{value}</strong>
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div>
      <div className="muted" style={{ fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function AssignModal({ agents, current, onClose, onSaved, leadId }) {
  const [assignedUserId, setAssignedUserId] = useState(current || '');
  const [leadStatus, setLeadStatus] = useState('ASSIGNED');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setBusy(true); setError('');
    try {
      await api.patch(`/leads/${leadId}/assign`, { assignedUserId, leadStatus });
      onSaved();
    } catch (err) { setError(apiError(err)); } finally { setBusy(false); }
  }

  return (
    <Modal
      title="Assign Lead"
      onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save} disabled={busy || !assignedUserId}>Assign</button>
      </>}
    >
      {error && <div className="error-text">{error}</div>}
      <div className="field">
        <label>Agent</label>
        <select className="select" value={assignedUserId} onChange={(e) => setAssignedUserId(e.target.value)}>
          <option value="">Select agent…</option>
          {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>
      <div className="field">
        <label>Lead Status</label>
        <select className="select" value={leadStatus} onChange={(e) => setLeadStatus(e.target.value)}>
          {LEAD_STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
        </select>
      </div>
    </Modal>
  );
}
