import api from '../api/client.js';

let scriptPromise = null;
function loadScript() {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
  return scriptPromise;
}

// Full checkout flow: create order → open Razorpay → verify → onDone.
// Returns { ok, message }.
export async function startCheckout({ planId, billingCycle = 'MONTHLY', onDone }) {
  const loaded = await loadScript();
  if (!loaded) return { ok: false, message: 'Could not load the payment gateway.' };

  const { data } = await api.post('/billing/order', { planId, billingCycle });
  return new Promise((resolve) => {
    const rz = new window.Razorpay({
      key: data.keyId,
      order_id: data.orderId,
      amount: data.amount,
      currency: data.currency,
      name: 'ProCallingApp',
      description: `${data.planName} — ${billingCycle.toLowerCase()}`,
      theme: { color: '#2f6bff' },
      handler: async (resp) => {
        try {
          await api.post('/billing/verify', resp);
          onDone?.();
          resolve({ ok: true, message: 'Payment successful — subscription updated.' });
        } catch {
          resolve({ ok: false, message: 'Payment succeeded but verification failed. Contact support.' });
        }
      },
      modal: { ondismiss: () => resolve({ ok: false, message: '' }) },
    });
    rz.open();
  });
}
