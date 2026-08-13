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

export const ROLES = ['ADMIN', 'MANAGER', 'AGENT'];

export const DATE_PRESETS = [
  { value: '', label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last7', label: 'Last 7 days' },
  { value: 'last30', label: 'Last 30 days' },
  { value: 'thisMonth', label: 'This month' },
];

// Map a lead/call status to a badge color class.
export function statusColor(status) {
  const map = {
    ANSWERED: 'green', CONVERTED: 'green', INTERESTED: 'green',
    NO_ANSWER: 'red', FAILED: 'red', LOST: 'red', NOT_INTERESTED: 'red', REJECTED: 'red',
    BUSY: 'amber', FOLLOW_UP: 'amber', MEETING_SCHEDULED: 'amber', CANCELLED: 'amber',
    NEW: 'blue', ASSIGNED: 'blue', CONTACTED: 'blue',
  };
  return map[status] || '';
}
