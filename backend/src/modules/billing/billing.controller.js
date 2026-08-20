import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/apiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { recordAudit } from '../../utils/audit.js';
import { serializeSubscription } from '../subscriptions/subscription.service.js';
import {
  isBillingConfigured, createOrder, verifyCheckoutSignature, applyCapturedPayment, verifyWebhookSignature,
} from './billing.service.js';

export function serializePayment(p) {
  return {
    id: p.id, amount: p.amount, currency: p.currency, status: p.status,
    planName: p.plan?.name || null, billingCycle: p.billingCycle, paidAt: p.paidAt, createdAt: p.createdAt,
  };
}

// Whether checkout is available + the public key for Razorpay Checkout.
export const billingConfig = (_req, res) => {
  const configured = isBillingConfigured();
  res.json({ configured, keyId: configured ? env.razorpayKeyId : null });
};

// Create a Razorpay order for a plan purchase/renewal.
export const createOrderSchema = z.object({
  planId: z.string().min(1),
  billingCycle: z.enum(['MONTHLY', 'YEARLY']).default('MONTHLY'),
});
export const createOrderHandler = asyncHandler(async (req, res) => {
  if (!isBillingConfigured()) throw new ApiError(503, 'Online billing is not enabled yet. Please contact support.', { code: 'BILLING_NOT_CONFIGURED' });
  const plan = await prisma.subscriptionPlan.findUnique({ where: { id: req.body.planId } });
  if (!plan || !plan.isActive) throw ApiError.badRequest('Plan not available');
  const { order, payment } = await createOrder({ tenantId: req.tenantId, plan, billingCycle: req.body.billingCycle });
  res.status(201).json({
    orderId: order.id, amount: order.amount, currency: order.currency,
    keyId: env.razorpayKeyId, paymentId: payment.id, planName: plan.name,
  });
});

// Verify the checkout callback + activate the subscription.
export const verifyPaymentSchema = z.object({
  razorpay_order_id: z.string(),
  razorpay_payment_id: z.string(),
  razorpay_signature: z.string(),
});
export const verifyPaymentHandler = asyncHandler(async (req, res) => {
  const b = req.body;
  const ok = verifyCheckoutSignature({ orderId: b.razorpay_order_id, paymentId: b.razorpay_payment_id, signature: b.razorpay_signature });
  if (!ok) {
    await prisma.payment.updateMany({ where: { providerOrderId: b.razorpay_order_id }, data: { status: 'FAILED' } });
    throw ApiError.badRequest('Payment verification failed');
  }
  const r = await applyCapturedPayment({ providerOrderId: b.razorpay_order_id, providerPaymentId: b.razorpay_payment_id });
  recordAudit(req, { action: 'PAYMENT_CAPTURED', entityType: 'Payment', entityId: r.payment?.id, description: 'Payment captured; subscription activated' });
  const sub = await prisma.subscription.findFirst({ include: { plan: true } });
  res.json({ success: true, subscription: serializeSubscription(sub) });
});

// The tenant's payment history.
export const listMyPayments = asyncHandler(async (_req, res) => {
  const payments = await prisma.payment.findMany({ orderBy: { createdAt: 'desc' }, take: 50, include: { plan: { select: { name: true } } } });
  res.json({ data: payments.map(serializePayment) });
});

// ── Razorpay webhook (public; verified by HMAC signature, not JWT) ───────────
export const razorpayWebhook = asyncHandler(async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  if (!verifyWebhookSignature(req.rawBody, signature)) throw ApiError.unauthorized('Invalid webhook signature');
  const event = req.body?.event;
  if (event === 'payment.captured' || event === 'order.paid') {
    const entity = req.body?.payload?.payment?.entity || {};
    if (entity.order_id) await applyCapturedPayment({ providerOrderId: entity.order_id, providerPaymentId: entity.id });
  }
  res.json({ received: true });
});
