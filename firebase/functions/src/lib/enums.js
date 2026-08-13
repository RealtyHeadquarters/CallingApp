export const ROLES = ['ADMIN', 'MANAGER', 'AGENT'];
export const ACCOUNT_STATUSES = ['ACTIVE', 'INACTIVE'];
export const AGENT_STATUSES = ['AVAILABLE', 'ON_CALL', 'AWAY', 'OFFLINE'];
export const LEAD_STATUSES = [
  'NEW', 'ASSIGNED', 'CONTACTED', 'INTERESTED', 'FOLLOW_UP',
  'MEETING_SCHEDULED', 'CONVERTED', 'NOT_INTERESTED', 'LOST',
];
export const CALL_STATUSES = ['ANSWERED', 'NO_ANSWER', 'BUSY', 'REJECTED', 'FAILED', 'CANCELLED'];
export const DISPOSITIONS = [
  'INTERESTED', 'NOT_INTERESTED', 'FOLLOW_UP_REQUIRED', 'CALL_BACK_LATER',
  'MEETING_REQUIRED', 'PRICE_DISCUSSION', 'DETAILS_SHARED', 'CONVERTED',
  'WRONG_NUMBER', 'BUSY', 'NO_RESPONSE', 'OTHER',
];
export const FOLLOWUP_TYPES = ['CALL', 'MEETING', 'WHATSAPP', 'EMAIL', 'OTHER'];
export const FOLLOWUP_STATUSES = ['PENDING', 'COMPLETED', 'MISSED', 'CANCELLED'];
export const TEAM_STATUSES = ['ACTIVE', 'INACTIVE'];
export const NOTIFICATION_TYPES = [
  'FOLLOWUP_REMINDER', 'FOLLOWUP_OVERDUE', 'LEAD_ASSIGNED',
  'DAILY_TARGET', 'DAILY_SUMMARY', 'MISSED_FOLLOWUPS',
];

export function titleCaseEnum(value) {
  if (!value) return '';
  return String(value).toLowerCase().split('_')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');
}
