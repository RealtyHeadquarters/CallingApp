import { Router } from 'express';
import authRoutes from '../modules/auth/auth.routes.js';
import adminRoutes from '../modules/admin/admin.routes.js';
import subscriptionRoutes from '../modules/subscriptions/subscriptions.routes.js';
import userRoutes from '../modules/users/users.routes.js';
import teamRoutes from '../modules/teams/teams.routes.js';
import leadRoutes from '../modules/leads/leads.routes.js';
import callRoutes from '../modules/calls/calls.routes.js';
import followUpRoutes from '../modules/followups/followups.routes.js';
import dashboardRoutes from '../modules/dashboard/dashboard.routes.js';
import reportRoutes from '../modules/reports/reports.routes.js';
import notificationRoutes from '../modules/notifications/notifications.routes.js';
import exportRoutes from '../modules/exports/exports.routes.js';
import webhookRoutes from '../modules/webhooks/webhooks.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);
router.use('/subscription', subscriptionRoutes);
router.use('/users', userRoutes);
router.use('/teams', teamRoutes);
router.use('/leads', leadRoutes);
router.use('/calls', callRoutes);
router.use('/follow-ups', followUpRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/reports', reportRoutes);
router.use('/notifications', notificationRoutes);
router.use('/exports', exportRoutes);
router.use('/webhooks', webhookRoutes);

export default router;
