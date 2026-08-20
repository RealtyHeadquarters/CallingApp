import dotenv from 'dotenv';

dotenv.config();

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET', 'dev-insecure-secret-change-me'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  telephonyWebhookSecret: process.env.TELEPHONY_WEBHOOK_SECRET || '',
  // Billing (Razorpay). When unset, billing endpoints report "not configured".
  razorpayKeyId: process.env.RAZORPAY_KEY_ID || '',
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || '',
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
};

export const isProd = env.nodeEnv === 'production';

// This repo is public: if it ever ran in production with the built-in dev secret,
// anyone could forge a token for any user (incl. super admin). Refuse to boot.
if (isProd && env.jwtSecret === 'dev-insecure-secret-change-me') {
  throw new Error('JWT_SECRET must be set in production — refusing to start with the insecure default secret.');
}
