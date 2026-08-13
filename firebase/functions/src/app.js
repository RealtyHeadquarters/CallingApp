import express from 'express';
import cors from 'cors';
import { ApiError } from './lib/framework.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import teamRoutes from './routes/teams.js';
import leadRoutes from './routes/leads.js';
import callRoutes from './routes/calls.js';
import followUpRoutes from './routes/followups.js';
import dashboardRoutes from './routes/dashboard.js';
import reportRoutes from './routes/reports.js';
import notificationRoutes from './routes/notifications.js';
import exportRoutes from './routes/exports.js';
import webhookRoutes from './routes/webhooks.js';
import setupRoutes from './routes/setup.js';

export function createApp() {
  const app = express();
  app.use(cors({ origin: true }));
  app.use(express.json({ limit: '2mb', verify: (req, _res, buf) => { req.rawBody = buf; } }));
  app.use(express.urlencoded({ extended: true }));

  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'callingapp-functions' }));

  app.use('/auth', authRoutes);
  app.use('/users', userRoutes);
  app.use('/teams', teamRoutes);
  app.use('/leads', leadRoutes);
  app.use('/calls', callRoutes);
  app.use('/follow-ups', followUpRoutes);
  app.use('/dashboard', dashboardRoutes);
  app.use('/reports', reportRoutes);
  app.use('/notifications', notificationRoutes);
  app.use('/exports', exportRoutes);
  app.use('/webhooks', webhookRoutes);
  app.use('/setup', setupRoutes);

  app.use((_req, res) => res.status(404).json({ error: { message: 'Route not found' } }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof ApiError) {
      return res.status(err.statusCode).json({ error: { message: err.message, ...(err.details ? { details: err.details } : {}) } });
    }
    // eslint-disable-next-line no-console
    console.error(err);
    res.status(500).json({ error: { message: err.message || 'Internal server error' } });
  });

  return app;
}
