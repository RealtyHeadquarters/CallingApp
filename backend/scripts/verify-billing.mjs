// Phase 6 verification: billing degrades gracefully when unconfigured; signature
// verification (checkout + webhook) is correct; a captured payment activates the
// subscription and is idempotent. (Live Razorpay order creation needs real keys and
// is not exercised here.)
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import {
  verifyCheckoutSignature, verifyWebhookSignature, applyCapturedPayment, isBillingConfigured,
} from '../src/modules/billing/billing.service.js';

const BASE = process.env.BASE || 'http://localhost:4055/api';
const SA_PASSWORD = process.env.SA_PASSWORD;
const SA_EMAIL = process.env.SA_EMAIL || 'superadmin@procallingapp.com';
if (!SA_PASSWORD) { console.error('Set SA_PASSWORD'); process.exit(2); }

const prisma = new PrismaClient();
const results = [];
const check = (n, pass, d = '') => { results.push({ n, pass }); console.log(`${pass ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`); };
const j = async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) });
const call = (m, p, { tok, body } = {}) => fetch(BASE + p, { method: m, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined }).then(j);

async function main() {
  const sa = (await call('POST', '/auth/login', { body: { identifier: SA_EMAIL, password: SA_PASSWORD } })).body.token;
  const business = await prisma.subscriptionPlan.findFirst({ where: { code: 'BUSINESS' } });

  // ── Graceful degradation (no keys set) ─────────────────────────────────────
  const cfg = await call('GET', '/billing/config', { tok: sa });
  check('billing config reports not-configured (keys unset)', cfg.body?.configured === false, JSON.stringify(cfg.body));

  const stamp = `${Date.now()}`;
  const onboard = await call('POST', '/admin/tenants', { tok: sa, body: {
    company: { name: `Bill Srv ${stamp}` }, admin: { name: 'Bill Admin', email: `bill${stamp}@t.com`, mobile: `BL${stamp}`, password: 'bill-pass-1234' },
  } });
  const tid = onboard.body?.tenant?.id;
  const adminTok = (await call('POST', '/auth/login', { body: { identifier: `bill${stamp}@t.com`, password: 'bill-pass-1234' } })).body.token;
  const order = await call('POST', '/billing/order', { tok: adminTok, body: { planId: business.id, billingCycle: 'MONTHLY' } });
  check('order returns 503 BILLING_NOT_CONFIGURED when unset', order.status === 503 && order.body?.error?.details?.code === 'BILLING_NOT_CONFIGURED', `status ${order.status}`);
  const pays = await call('GET', '/billing/payments', { tok: adminTok });
  check('payment history endpoint works (empty)', pays.status === 200 && Array.isArray(pays.body.data), `status ${pays.status}`);
  await prisma.tenant.deleteMany({ where: { id: tid } });

  // ── Signature verification (pure) ──────────────────────────────────────────
  const secret = 'test_secret_key';
  const oid = 'order_ABC123'; const pid = 'pay_XYZ789';
  const goodSig = crypto.createHmac('sha256', secret).update(`${oid}|${pid}`).digest('hex');
  check('valid checkout signature verifies', verifyCheckoutSignature({ orderId: oid, paymentId: pid, signature: goodSig }, secret) === true);
  check('tampered checkout signature rejected', verifyCheckoutSignature({ orderId: oid, paymentId: pid, signature: 'deadbeef' }, secret) === false);
  const wbody = '{"event":"payment.captured","x":1}';
  const wsig = crypto.createHmac('sha256', secret).update(wbody).digest('hex');
  check('valid webhook signature verifies', verifyWebhookSignature(wbody, wsig, secret) === true);
  check('tampered webhook signature rejected', verifyWebhookSignature(wbody, 'nope', secret) === false);
  check('isBillingConfigured is false without keys', isBillingConfigured() === false);

  // ── Capture → activate subscription (idempotent) ───────────────────────────
  const tenant = await prisma.tenant.create({ data: { name: 'Bill Cap', slug: `__bill_cap_${stamp}`, status: 'ACTIVE' } });
  const orderId = `order_cap_${stamp}`;
  await prisma.payment.create({ data: { tenantId: tenant.id, planId: business.id, amount: business.priceMonthly, currency: 'INR', status: 'CREATED', provider: 'razorpay', providerOrderId: orderId, billingCycle: 'MONTHLY' } });

  const r = await applyCapturedPayment({ providerOrderId: orderId, providerPaymentId: `pay_cap_${stamp}` });
  check('applyCapturedPayment applied', r.applied === true);
  const paid = await prisma.payment.findFirst({ where: { providerOrderId: orderId } });
  check('payment marked CAPTURED with paymentId', paid.status === 'CAPTURED' && paid.providerPaymentId === `pay_cap_${stamp}` && paid.paidAt != null);
  const sub = await prisma.subscription.findUnique({ where: { tenantId: tenant.id } });
  check('subscription activated with the paid plan', sub && sub.status === 'ACTIVE' && sub.planId === business.id && sub.currentPeriodEnd != null, `status=${sub?.status}`);

  const r2 = await applyCapturedPayment({ providerOrderId: orderId, providerPaymentId: `pay_cap_${stamp}` });
  check('capture is idempotent (no double-apply)', r2.alreadyDone === true);

  await prisma.tenant.delete({ where: { id: tenant.id } }); // cascades payment + subscription

  const failed = results.filter((x) => !x.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length) { console.log('FAILED:', failed.map((f) => f.n)); process.exit(1); }
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error('✖', e); await prisma.$disconnect(); process.exit(1); });
