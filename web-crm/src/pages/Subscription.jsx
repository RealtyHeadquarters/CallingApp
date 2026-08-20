import { useEffect, useState } from 'react';
import api, { apiError } from '../api/client.js';
import { Loading } from '../components/ui.jsx';
import { fmtDate } from '../lib/format.js';

const STATE = {
  TRIAL: { label: 'Trial', color: '#2f6bff' },
  ACTIVE: { label: 'Active', color: '#0f9d6e' },
  GRACE: { label: 'Grace period', color: '#ea580c' },
  EXPIRED: { label: 'Expired', color: '#e11d48' },
  CANCELLED: { label: 'Cancelled', color: '#e11d48' },
  NONE: { label: 'No plan', color: '#64748b' },
};
export const money = (paise) => '₹' + Math.round((paise || 0) / 100).toLocaleString('en-IN');
const limit = (n) => (n == null ? 'Unlimited' : n.toLocaleString('en-IN'));

export default function Subscription() {
  const [sub, setSub] = useState(undefined);
  const [plans, setPlans] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.get('/subscription'), api.get('/subscription/plans')])
      .then(([s, p]) => { setSub(s.data.subscription); setPlans(p.data.data); })
      .catch((e) => setError(apiError(e)));
  }, []);

  if (error) return <div className="card card-pad error-text">{error}</div>;
  if (sub === undefined) return <Loading />;

  const st = STATE[sub?.state] || STATE.NONE;

  return (
    <>
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div className="muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.06em' }}>Current plan</div>
            <div style={{ fontSize: 24, fontWeight: 700, marginTop: 2 }}>{sub?.plan?.name || 'No plan assigned'}</div>
          </div>
          <span style={{ padding: '5px 14px', borderRadius: 999, fontWeight: 600, color: st.color, background: `${st.color}18`, border: `1px solid ${st.color}55` }}>
            {st.label}{sub?.daysLeft != null && (sub.state === 'TRIAL' || sub.state === 'ACTIVE' || sub.state === 'GRACE') ? ` · ${sub.daysLeft} day${sub.daysLeft === 1 ? '' : 's'} left` : ''}
          </span>
        </div>

        {sub && (
          <div className="kgrid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', marginTop: 16 }}>
            <Info label="Users" value={limit(sub.limits?.users)} />
            <Info label="Calls / period" value={limit(sub.limits?.calls)} />
            <Info label="Storage" value={sub.limits?.storageMb == null ? 'Unlimited' : `${sub.limits.storageMb} MB`} />
            <Info label="Billing" value={sub.billingCycle ? sub.billingCycle[0] + sub.billingCycle.slice(1).toLowerCase() : '—'} />
            <Info label={sub.state === 'TRIAL' ? 'Trial ends' : 'Renews / ends'} value={sub.endsAt ? fmtDate(sub.endsAt) : '—'} />
          </div>
        )}

        {sub?.readOnly && (
          <div className="grace-banner" style={{ marginTop: 16 }}>
            Your subscription is {sub.state === 'CANCELLED' ? 'cancelled' : 'expired'} — the app is read-only. Contact your account manager to renew.
          </div>
        )}
      </div>

      <div className="section-head"><h2>Available Plans</h2></div>
      <div className="kgrid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
        {plans.map((p) => (
          <div key={p.id} className="card card-pad" style={{ border: sub?.plan?.id === p.id ? '2px solid var(--brand-500)' : undefined }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <strong style={{ fontSize: 17 }}>{p.name}</strong>
              {sub?.plan?.id === p.id && <span className="badge green">Current</span>}
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, margin: '8px 0 2px' }}>{money(p.priceMonthly)}<span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>/mo</span></div>
            <div className="muted" style={{ fontSize: 12 }}>{money(p.priceYearly)}/yr</div>
            <ul style={{ margin: '12px 0 0', paddingLeft: 18, fontSize: 13.5, lineHeight: 1.9 }}>
              <li>{limit(p.userLimit)} users</li>
              <li>{limit(p.callLimit)} calls / period</li>
              <li>{p.storageLimitMb == null ? 'Unlimited' : `${p.storageLimitMb} MB`} storage</li>
            </ul>
          </div>
        ))}
      </div>
      <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>To change your plan, contact your account manager.</p>
    </>
  );
}

function Info({ label, value }) {
  return (
    <div className="kcard"><div className="kbody"><div className="klabel">{label}</div><div className="kvalue" style={{ fontSize: 18 }}>{value}</div></div></div>
  );
}
