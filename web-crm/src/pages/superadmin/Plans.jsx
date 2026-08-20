import { useEffect, useState, useCallback } from 'react';
import api, { apiError } from '../../api/client.js';
import { Loading, Empty, Modal } from '../../components/ui.jsx';

const money = (paise) => '₹' + Math.round((paise || 0) / 100).toLocaleString('en-IN');
const limit = (n) => (n == null || n === '' ? 'Unlimited' : Number(n).toLocaleString('en-IN'));
const CODES = ['STARTER', 'BUSINESS', 'ENTERPRISE', 'CUSTOM'];

export default function Plans() {
  const [plans, setPlans] = useState(null);
  const [error, setError] = useState('');
  const [edit, setEdit] = useState(null); // plan object or {} for new

  const load = useCallback(() => {
    api.get('/admin/plans').then((r) => setPlans(r.data.data)).catch((e) => setError(apiError(e)));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (error) return <div className="card card-pad error-text">{error}</div>;
  if (!plans) return <Loading />;

  return (
    <>
      <div className="toolbar">
        <div style={{ marginLeft: 'auto' }}>
          <button className="btn primary" onClick={() => setEdit({})}>+ New Plan</button>
        </div>
      </div>

      <div className="card">
        {plans.length === 0 ? <Empty label="No plans yet." icon="📦" /> : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th>Plan</th><th>Code</th><th>Monthly</th><th>Yearly</th><th>Users</th><th>Calls</th><th>Storage</th><th>Active</th><th></th></tr>
              </thead>
              <tbody>
                {plans.map((p) => (
                  <tr key={p.id}>
                    <td><strong style={{ fontWeight: 600 }}>{p.name}</strong></td>
                    <td className="muted">{p.code}</td>
                    <td>{money(p.priceMonthly)}</td>
                    <td>{money(p.priceYearly)}</td>
                    <td>{limit(p.userLimit)}</td>
                    <td>{limit(p.callLimit)}</td>
                    <td>{p.storageLimitMb == null ? 'Unlimited' : `${p.storageLimitMb} MB`}</td>
                    <td>{p.isActive ? '✅' : '—'}</td>
                    <td><button className="btn sm" onClick={() => setEdit(p)}>Edit</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {edit && <PlanModal plan={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </>
  );
}

function PlanModal({ plan, onClose, onSaved }) {
  const isNew = !plan.id;
  const [form, setForm] = useState({
    name: plan.name || '', code: plan.code || 'CUSTOM',
    priceMonthly: plan.priceMonthly != null ? plan.priceMonthly / 100 : '',
    priceYearly: plan.priceYearly != null ? plan.priceYearly / 100 : '',
    userLimit: plan.userLimit ?? '', callLimit: plan.callLimit ?? '', storageLimitMb: plan.storageLimitMb ?? '',
    isActive: plan.isActive ?? true, sortOrder: plan.sortOrder ?? 0,
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const num = (v) => (v === '' ? null : Number(v));

  async function save() {
    setBusy(true); setError('');
    try {
      const payload = {
        name: form.name, code: form.code,
        priceMonthly: Math.round(Number(form.priceMonthly || 0) * 100),
        priceYearly: Math.round(Number(form.priceYearly || 0) * 100),
        userLimit: num(form.userLimit), callLimit: num(form.callLimit), storageLimitMb: num(form.storageLimitMb),
        isActive: !!form.isActive, sortOrder: Number(form.sortOrder || 0),
      };
      if (isNew) await api.post('/admin/plans', payload);
      else await api.patch(`/admin/plans/${plan.id}`, payload);
      onSaved();
    } catch (err) { setError(apiError(err)); } finally { setBusy(false); }
  }

  return (
    <Modal title={isNew ? 'New Plan' : `Edit ${plan.name}`} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn primary" onClick={save} disabled={busy || form.name.length < 2}>Save</button>
    </>}>
      {error && <div className="error-text">{error}</div>}
      <div className="row-gap" style={{ gap: 12 }}>
        <div className="field" style={{ flex: 2 }}><label>Name *</label><input className="input" value={form.name} onChange={set('name')} /></div>
        <div className="field" style={{ flex: 1 }}>
          <label>Code</label>
          <select className="select" value={form.code} onChange={set('code')}>{CODES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        </div>
      </div>
      <div className="row-gap" style={{ gap: 12 }}>
        <div className="field" style={{ flex: 1 }}><label>Price / month (₹)</label><input className="input" type="number" min="0" value={form.priceMonthly} onChange={set('priceMonthly')} /></div>
        <div className="field" style={{ flex: 1 }}><label>Price / year (₹)</label><input className="input" type="number" min="0" value={form.priceYearly} onChange={set('priceYearly')} /></div>
      </div>
      <div className="row-gap" style={{ gap: 12 }}>
        <div className="field" style={{ flex: 1 }}><label>User limit</label><input className="input" type="number" min="1" value={form.userLimit} onChange={set('userLimit')} placeholder="∞" /></div>
        <div className="field" style={{ flex: 1 }}><label>Call limit</label><input className="input" type="number" min="1" value={form.callLimit} onChange={set('callLimit')} placeholder="∞" /></div>
        <div className="field" style={{ flex: 1 }}><label>Storage (MB)</label><input className="input" type="number" min="1" value={form.storageLimitMb} onChange={set('storageLimitMb')} placeholder="∞" /></div>
      </div>
      <div className="row-gap" style={{ gap: 12, alignItems: 'center' }}>
        <div className="field" style={{ flex: 1 }}><label>Sort order</label><input className="input" type="number" value={form.sortOrder} onChange={set('sortOrder')} /></div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 18, cursor: 'pointer' }}>
          <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Active (offered to clients)
        </label>
      </div>
      <p className="muted" style={{ fontSize: 12 }}>Leave a limit blank for unlimited.</p>
    </Modal>
  );
}
