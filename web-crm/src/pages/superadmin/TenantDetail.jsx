import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api, { apiError } from '../../api/client.js';
import { Loading, Modal } from '../../components/ui.jsx';
import TenantStatusBadge from '../../components/TenantStatusBadge.jsx';
import UsageBar from '../../components/UsageBar.jsx';
import { fmtDate, titleCase } from '../../lib/format.js';

const money = (paise) => '₹' + Math.round((paise || 0) / 100).toLocaleString('en-IN');
const limit = (n) => (n == null ? 'Unlimited' : Number(n).toLocaleString('en-IN'));
const SUB_STATE = {
  TRIAL: '#2f6bff', ACTIVE: '#0f9d6e', GRACE: '#ea580c', EXPIRED: '#e11d48', CANCELLED: '#e11d48', NONE: '#64748b',
};

export default function TenantDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [plans, setPlans] = useState([]);
  const [error, setError] = useState('');
  const [showAddUser, setShowAddUser] = useState(false);
  const [resetUser, setResetUser] = useState(null);
  const [showSub, setShowSub] = useState(false);
  const [showFeatures, setShowFeatures] = useState(false);
  const [featureCatalog, setFeatureCatalog] = useState([]);

  const load = useCallback(() => {
    api.get(`/admin/tenants/${id}`).then((r) => setData(r.data)).catch((e) => setError(apiError(e)));
  }, [id]);
  const [payments, setPayments] = useState([]);
  const [audit, setAudit] = useState([]);
  const [showBranding, setShowBranding] = useState(false);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get('/admin/plans').then((r) => setPlans(r.data.data)).catch(() => {}); }, []);
  useEffect(() => { api.get('/admin/features').then((r) => setFeatureCatalog(r.data.features)).catch(() => {}); }, []);
  useEffect(() => { api.get(`/admin/tenants/${id}/payments`).then((r) => setPayments(r.data.data)).catch(() => {}); }, [id]);
  useEffect(() => { api.get(`/admin/tenants/${id}/audit`).then((r) => setAudit(r.data.data)).catch(() => {}); }, [id]);

  async function setStatus(next) {
    const verb = next === 'SUSPENDED' ? 'Suspend' : 'Activate';
    if (!window.confirm(`${verb} "${data.tenant.name}"?`)) return;
    try { await api.patch(`/admin/tenants/${id}/status`, { status: next }); load(); }
    catch (e) { setError(apiError(e)); }
  }

  if (error) return <div className="card card-pad error-text">{error}</div>;
  if (!data) return <Loading />;
  const t = data.tenant;

  return (
    <>
      <button className="btn sm" onClick={() => navigate('/admin/tenants')} style={{ marginBottom: 14 }}>← All clients</button>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <h2 style={{ margin: 0 }}>{t.name}</h2>
              <TenantStatusBadge status={t.status} />
            </div>
            <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
              {t.slug} · {t.contactEmail || 'no contact email'} · {t.contactPhone || 'no phone'} · onboarded {fmtDate(t.createdAt)}
            </div>
          </div>
          <div className="row-gap" style={{ gap: 8 }}>
            <button className="btn" onClick={() => setShowBranding(true)}>Branding</button>
            {t.status === 'SUSPENDED'
              ? <button className="btn primary" onClick={() => setStatus('ACTIVE')}>Activate</button>
              : <button className="btn" style={{ color: 'var(--red)' }} onClick={() => setStatus('SUSPENDED')}>Suspend</button>}
          </div>
        </div>
      </div>

      <div className="kgrid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
        <div className="kcard"><div className="tile">👥</div><div className="kbody"><div className="klabel">Users</div><div className="kvalue">{t.users}</div></div></div>
        <div className="kcard"><div className="tile">📞</div><div className="kbody"><div className="klabel">Calls</div><div className="kvalue">{t.calls}</div></div></div>
        <div className="kcard"><div className="tile">🎯</div><div className="kbody"><div className="klabel">Leads</div><div className="kvalue">{t.leads}</div></div></div>
        <div className="kcard orange"><div className="tile">⏰</div><div className="kbody"><div className="klabel">Follow-ups</div><div className="kvalue">{t.followUps}</div></div></div>
      </div>

      {/* Subscription */}
      <div className="section-head" style={{ marginTop: 22 }}>
        <h2>Subscription</h2>
        <button className="btn primary sm" onClick={() => setShowSub(true)}>Manage</button>
      </div>
      <div className="card card-pad">
        {data.subscription ? (() => {
          const s = data.subscription;
          const color = SUB_STATE[s.state] || SUB_STATE.NONE;
          return (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center' }}>
              <div>
                <div className="muted" style={{ fontSize: 12 }}>Plan</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{s.plan?.name || 'No plan'}</div>
              </div>
              <span style={{ padding: '4px 12px', borderRadius: 999, fontWeight: 600, color, background: `${color}18`, border: `1px solid ${color}55` }}>
                {s.state}{s.daysLeft != null && ['TRIAL', 'ACTIVE', 'GRACE'].includes(s.state) ? ` · ${s.daysLeft}d left` : ''}
              </span>
              <div><div className="muted" style={{ fontSize: 12 }}>Ends</div><div>{s.endsAt ? fmtDate(s.endsAt) : '—'}</div></div>
              <div><div className="muted" style={{ fontSize: 12 }}>Billing</div><div>{titleCase(s.billingCycle || '—')}</div></div>
              <div><div className="muted" style={{ fontSize: 12 }}>Limits</div><div>{limit(s.limits?.users)} users · {limit(s.limits?.calls)} calls</div></div>
            </div>
          );
        })() : <div className="muted">No subscription. Click Manage to assign a plan or trial.</div>}
      </div>

      {/* Usage */}
      {data.usage && (
        <>
          <div className="section-head" style={{ marginTop: 22 }}><h2>Usage this period</h2></div>
          <div className="card card-pad">
            <UsageBar label="Users" used={data.usage.users.used} limit={data.usage.users.limit} percent={data.usage.users.percent} />
            <UsageBar label="Calls" used={data.usage.calls.used} limit={data.usage.calls.limit} percent={data.usage.calls.percent} />
            <UsageBar label="Leads" used={data.usage.leads.used} limit={data.usage.leads.limit} percent={data.usage.leads.percent} />
          </div>
        </>
      )}

      {/* Features */}
      <div className="section-head" style={{ marginTop: 22 }}>
        <h2>Features</h2>
        <button className="btn sm" onClick={() => setShowFeatures(true)}>Manage features</button>
      </div>
      <div className="card card-pad">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {(data.features || []).length === 0 ? <span className="muted">No features enabled.</span> : (data.features || []).map((f) => (
            <span key={f} className="badge green">{(featureCatalog.find((c) => c.key === f)?.label) || f}</span>
          ))}
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Effective features = plan features ± tenant overrides.</div>
      </div>

      <div className="section-head" style={{ marginTop: 22 }}>
        <h2>Users</h2>
        <button className="btn primary sm" onClick={() => setShowAddUser(true)}>+ Add User</button>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Name</th><th>Email</th><th>Mobile</th><th>Role</th><th>Status</th><th>Joined</th><th></th></tr></thead>
            <tbody>
              {data.users.map((u) => (
                <tr key={u.id}>
                  <td><strong style={{ fontWeight: 600 }}>{u.name}</strong></td>
                  <td>{u.email}</td>
                  <td className="muted">{u.mobile}</td>
                  <td>{titleCase(u.role)}</td>
                  <td>{titleCase(u.status)}</td>
                  <td className="muted">{fmtDate(u.createdAt)}</td>
                  <td><button className="btn sm" onClick={() => setResetUser(u)}>Reset password</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payments */}
      {payments.length > 0 && (
        <>
          <div className="section-head" style={{ marginTop: 22 }}><h2>Payments</h2></div>
          <div className="card"><div className="table-wrap"><table className="data">
            <thead><tr><th>Date</th><th>Plan</th><th>Amount</th><th>Status</th></tr></thead>
            <tbody>
              {payments.map((pm) => (
                <tr key={pm.id}>
                  <td className="muted">{fmtDate(pm.paidAt || pm.createdAt)}</td>
                  <td>{pm.planName || '—'}</td>
                  <td>₹{Math.round((pm.amount || 0) / 100).toLocaleString('en-IN')}</td>
                  <td>{titleCase(pm.status)}</td>
                </tr>
              ))}
            </tbody>
          </table></div></div>
        </>
      )}

      {/* Audit */}
      {audit.length > 0 && (
        <>
          <div className="section-head" style={{ marginTop: 22 }}><h2>Recent Activity</h2></div>
          <div className="card"><div className="table-wrap"><table className="data">
            <thead><tr><th>When</th><th>User</th><th>Action</th><th>Details</th></tr></thead>
            <tbody>
              {audit.map((a) => (
                <tr key={a.id}>
                  <td className="muted" style={{ whiteSpace: 'nowrap' }}>{fmtDate(a.createdAt)}</td>
                  <td>{a.user?.name || '—'}</td>
                  <td>{titleCase(a.action)}</td>
                  <td className="muted">{a.description || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table></div></div>
        </>
      )}

      {showBranding && <BrandingModal tenantId={id} tenant={t} onClose={() => setShowBranding(false)} onSaved={() => { setShowBranding(false); load(); }} />}
      {showAddUser && <AddUserModal tenantId={id} onClose={() => setShowAddUser(false)} onSaved={() => { setShowAddUser(false); load(); }} />}
      {resetUser && <ResetPasswordModal tenantId={id} user={resetUser} onClose={() => setResetUser(null)} onSaved={() => setResetUser(null)} />}
      {showSub && <ManageSubscriptionModal tenantId={id} plans={plans} current={data.subscription} onClose={() => setShowSub(false)} onSaved={() => { setShowSub(false); load(); }} />}
      {showFeatures && <FeatureModal tenantId={id} catalog={featureCatalog} effective={data.features || []} onClose={() => setShowFeatures(false)} onSaved={() => { setShowFeatures(false); load(); }} />}
    </>
  );
}

function BrandingModal({ tenantId, tenant, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: tenant.name || '', logoUrl: tenant.logoUrl || '',
    primaryColor: tenant.primaryColor || '#2f6bff', secondaryColor: tenant.secondaryColor || '#f97316',
    customDomain: tenant.customDomain || '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function save() {
    setBusy(true); setError('');
    try {
      await api.patch(`/admin/tenants/${tenantId}`, {
        name: form.name,
        logoUrl: form.logoUrl || null,
        primaryColor: form.primaryColor || null,
        secondaryColor: form.secondaryColor || null,
        customDomain: form.customDomain || null,
      });
      onSaved();
    } catch (err) { setError(apiError(err)); } finally { setBusy(false); }
  }

  return (
    <Modal title="Branding (white-label)" onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn primary" onClick={save} disabled={busy || form.name.length < 2}>Save</button>
    </>}>
      {error && <div className="error-text">{error}</div>}
      <div className="field"><label>Company name</label><input className="input" value={form.name} onChange={set('name')} /></div>
      <div className="field"><label>Logo URL</label><input className="input" value={form.logoUrl} onChange={set('logoUrl')} placeholder="https://…/logo.png" /></div>
      <div className="row-gap" style={{ gap: 12 }}>
        <div className="field" style={{ flex: 1 }}>
          <label>Primary colour</label>
          <div className="row-gap" style={{ gap: 8, alignItems: 'center' }}>
            <input type="color" value={form.primaryColor} onChange={set('primaryColor')} style={{ width: 40, height: 34, border: 'none', background: 'none' }} />
            <input className="input" value={form.primaryColor} onChange={set('primaryColor')} />
          </div>
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Accent colour</label>
          <div className="row-gap" style={{ gap: 8, alignItems: 'center' }}>
            <input type="color" value={form.secondaryColor} onChange={set('secondaryColor')} style={{ width: 40, height: 34, border: 'none', background: 'none' }} />
            <input className="input" value={form.secondaryColor} onChange={set('secondaryColor')} />
          </div>
        </div>
      </div>
      <div className="field" style={{ marginBottom: 0 }}><label>Custom domain (optional)</label><input className="input" value={form.customDomain} onChange={set('customDomain')} placeholder="crm.client.com" /></div>
    </Modal>
  );
}

function FeatureModal({ tenantId, catalog, effective, onClose, onSaved }) {
  const [enabled, setEnabled] = useState(() => new Set(effective));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const toggle = (key) => setEnabled((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });

  async function save(reset) {
    setBusy(true); setError('');
    try {
      // reset → clear overrides (inherit plan). Otherwise pin every feature explicitly.
      const overrides = reset ? {} : Object.fromEntries(catalog.map((f) => [f.key, enabled.has(f.key)]));
      await api.patch(`/admin/tenants/${tenantId}/features`, { overrides });
      onSaved();
    } catch (err) { setError(apiError(err)); } finally { setBusy(false); }
  }

  return (
    <Modal title="Feature access" onClose={onClose} footer={<>
      <button className="btn" onClick={() => save(true)} disabled={busy}>Reset to plan</button>
      <button className="btn primary" onClick={() => save(false)} disabled={busy}>Save overrides</button>
    </>}>
      {error && <div className="error-text">{error}</div>}
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>Toggle features for this client. Saving pins these values (overrides the plan); Reset returns to plan defaults.</p>
      <div style={{ display: 'grid', gap: 8 }}>
        {catalog.map((f) => (
          <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={enabled.has(f.key)} onChange={() => toggle(f.key)} /> {f.label}
          </label>
        ))}
      </div>
    </Modal>
  );
}

function ManageSubscriptionModal({ tenantId, plans, current, onClose, onSaved }) {
  const [planId, setPlanId] = useState(current?.plan?.id || plans[0]?.id || '');
  const [cycle, setCycle] = useState(current?.billingCycle || 'MONTHLY');
  const [trialDays, setTrialDays] = useState(14);
  const [extendDays, setExtendDays] = useState(30);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function act(fn) {
    setBusy(true); setError('');
    try { await fn(); onSaved(); }
    catch (err) { setError(apiError(err)); } finally { setBusy(false); }
  }

  return (
    <Modal title="Manage Subscription" onClose={onClose} footer={<button className="btn" onClick={onClose}>Close</button>}>
      {error && <div className="error-text">{error}</div>}

      <div className="section-head" style={{ marginTop: 0 }}><h2 style={{ fontSize: 14 }}>Assign / renew plan</h2></div>
      <div className="row-gap" style={{ gap: 12 }}>
        <div className="field" style={{ flex: 2 }}>
          <label>Plan</label>
          <select className="select" value={planId} onChange={(e) => setPlanId(e.target.value)}>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Billing</label>
          <select className="select" value={cycle} onChange={(e) => setCycle(e.target.value)}>
            <option value="MONTHLY">Monthly</option><option value="YEARLY">Yearly</option>
          </select>
        </div>
      </div>
      <button className="btn primary" disabled={busy || !planId} onClick={() => act(() => api.put(`/admin/tenants/${tenantId}/subscription`, { planId, billingCycle: cycle }))}>Assign plan (Active)</button>

      <div className="section-head"><h2 style={{ fontSize: 14 }}>Trial</h2></div>
      <div className="row-gap" style={{ gap: 12, alignItems: 'flex-end' }}>
        <div className="field" style={{ flex: 1 }}><label>Trial days</label><input className="input" type="number" min="1" value={trialDays} onChange={(e) => setTrialDays(e.target.value)} /></div>
        <button className="btn" disabled={busy} onClick={() => act(() => api.post(`/admin/tenants/${tenantId}/subscription/trial`, { trialDays: Number(trialDays), planId: planId || undefined }))}>Start trial</button>
      </div>

      <div className="section-head"><h2 style={{ fontSize: 14 }}>Extend</h2></div>
      <div className="row-gap" style={{ gap: 12, alignItems: 'flex-end' }}>
        <div className="field" style={{ flex: 1 }}><label>Extra days</label><input className="input" type="number" min="1" value={extendDays} onChange={(e) => setExtendDays(e.target.value)} /></div>
        <button className="btn" disabled={busy} onClick={() => act(() => api.post(`/admin/tenants/${tenantId}/subscription/extend`, { days: Number(extendDays) }))}>Extend period</button>
      </div>

      <div className="section-head"><h2 style={{ fontSize: 14 }}>Danger</h2></div>
      <button className="btn" style={{ color: 'var(--red)' }} disabled={busy}
        onClick={() => { if (window.confirm('Cancel this subscription? The tenant becomes read-only (data preserved).')) act(() => api.post(`/admin/tenants/${tenantId}/subscription/cancel`)); }}>
        Cancel subscription
      </button>
    </Modal>
  );
}

function AddUserModal({ tenantId, onClose, onSaved }) {
  const [form, setForm] = useState({ name: '', email: '', mobile: '', password: '', role: 'AGENT' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function save() {
    setBusy(true); setError('');
    try { await api.post(`/admin/tenants/${tenantId}/users`, form); onSaved(); }
    catch (err) { setError(apiError(err)); } finally { setBusy(false); }
  }
  const valid = form.name.length >= 2 && /.+@.+\..+/.test(form.email) && form.mobile.length >= 6 && form.password.length >= 8;

  return (
    <Modal title="Add User" onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn primary" onClick={save} disabled={busy || !valid}>Create</button>
    </>}>
      {error && <div className="error-text">{error}</div>}
      <div className="field"><label>Name *</label><input className="input" value={form.name} onChange={set('name')} /></div>
      <div className="field"><label>Email *</label><input className="input" value={form.email} onChange={set('email')} /></div>
      <div className="field"><label>Mobile *</label><input className="input" value={form.mobile} onChange={set('mobile')} /></div>
      <div className="field"><label>Password * (min 8)</label><input className="input" type="text" value={form.password} onChange={set('password')} /></div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label>Role</label>
        <select className="select" value={form.role} onChange={set('role')}>
          <option value="ADMIN">Admin</option>
          <option value="MANAGER">Manager</option>
          <option value="AGENT">Agent</option>
        </select>
      </div>
    </Modal>
  );
}

function ResetPasswordModal({ tenantId, user, onClose, onSaved }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true); setError('');
    try { await api.patch(`/admin/tenants/${tenantId}/users/${user.id}/password`, { password }); alert('Password reset.'); onSaved(); }
    catch (err) { setError(apiError(err)); } finally { setBusy(false); }
  }

  return (
    <Modal title={`Reset password — ${user.name}`} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn primary" onClick={save} disabled={busy || password.length < 8}>Set password</button>
    </>}>
      {error && <div className="error-text">{error}</div>}
      <div className="field" style={{ marginBottom: 0 }}><label>New password (min 8)</label><input className="input" type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Share with the user" /></div>
    </Modal>
  );
}
