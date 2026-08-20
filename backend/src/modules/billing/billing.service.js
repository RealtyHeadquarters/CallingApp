import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { planPeriodFields } from '../subscriptions/subscription.service.js';

export function isBillingConfigured() {
  return !!(env.razorpayKeyId && env.razorpayKeySecret);
}

let client = null;
function rzp() {
  if (!isBillingConfigured()) return null;
  if (!client) client = new Razorpay({ key_id: env.razorpayKeyId, key_secret: env.razorpayKeySecret });
  return client;
}

// Price (paise) for a plan on a billing cycle.
export function planAmount(plan, cycle) {
  return cycle === 'YEARLY' ? plan.priceYearly : plan.priceMonthly;
}

// Create a Razorpay order + a CREATED Payment row (scoped to the tenant).
export async function createOrder({ tenantId, plan, billingCycle }) {
  const amount = planAmount(plan, billingCycle);
  if (amount <= 0) throw new Error('This plan has no price set');
  const order = await rzp().orders.create({
    amount,
    currency: 'INR',
    notes: { tenantId, planId: plan.id, billingCycle },
  });
  const payment = await prisma.payment.create({
    data: {
      tenantId, planId: plan.id, amount, currency: 'INR', status: 'CREATED',
      provider: 'razorpay', providerOrderId: order.id, billingCycle,
    },
  });
  return { order, payment };
}

// Verify a Razorpay Checkout signature: HMAC_SHA256("orderId|paymentId", key_secret).
export function verifyCheckoutSignature({ orderId, paymentId, signature }, secret = env.razorpayKeySecret) {
  if (!secret || !signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Verify a Razorpay webhook: HMAC_SHA256(rawBody, webhook_secret).
export function verifyWebhookSignature(rawBody, signature, secret = env.razorpayWebhookSecret) {
  if (!secret || !signature || !rawBody) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Mark a payment CAPTURED and activate/renew the subscription. Idempotent by order.
export async function applyCapturedPayment({ providerOrderId, providerPaymentId }) {
  const existing = await prisma.payment.findFirst({ where: { providerOrderId }, include: { plan: true } });
  if (!existing) return { applied: false, reason: 'order-not-found' };
  if (existing.status === 'CAPTURED') return { applied: true, alreadyDone: true, payment: existing };

  const payment = await prisma.payment.update({
    where: { id: existing.id },
    data: { status: 'CAPTURED', providerPaymentId: providerPaymentId ?? existing.providerPaymentId, paidAt: new Date() },
    include: { plan: true },
  });

  if (payment.plan) {
    const fields = planPeriodFields(payment.plan, payment.billingCycle);
    await prisma.subscription.upsert({
      where: { tenantId: payment.tenantId },
      create: { tenantId: payment.tenantId, planId: payment.plan.id, ...fields },
      update: { planId: payment.plan.id, ...fields },
    });
  }
  return { applied: true, payment };
}
