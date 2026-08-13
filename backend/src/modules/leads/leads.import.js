import { z } from 'zod';
import { parse } from 'csv-parse/sync';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../utils/apiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { recordAudit } from '../../utils/audit.js';
import { generateLeadId } from '../../utils/ids.js';
import { LEAD_STATUSES } from '../../utils/enums.js';

// A single importable row (spec §23 fields).
const rowSchema = z.object({
  name: z.string().min(1),
  mobile: z.string().min(6),
  email: z.string().email().optional().or(z.literal('')).optional(),
  company: z.string().optional(),
  source: z.string().optional(),
  leadStatus: z.enum(LEAD_STATUSES).optional(),
  assignedUserId: z.string().optional(),
});

// Normalize a raw CSV/JSON record's keys to our field names.
function normalize(raw) {
  const get = (...keys) => {
    for (const k of keys) {
      const found = Object.keys(raw).find((rk) => rk.trim().toLowerCase() === k);
      if (found && String(raw[found]).trim() !== '') return String(raw[found]).trim();
    }
    return undefined;
  };
  return {
    name: get('name', 'client name', 'full name'),
    mobile: get('mobile', 'phone', 'phone number', 'mobile number'),
    email: get('email', 'e-mail'),
    company: get('company', 'organization'),
    source: get('source', 'lead source'),
    leadStatus: get('lead status', 'status', 'leadstatus')?.toUpperCase().replace(/\s+/g, '_'),
    assignedUserId: get('assigned user', 'assigned user id', 'assigneduserid', 'agent id'),
  };
}

// Accepts either an uploaded CSV file (multipart 'file') or a JSON { rows: [...] } body.
export const importLeads = asyncHandler(async (req, res) => {
  let rawRows = [];
  if (req.file) {
    const text = req.file.buffer.toString('utf8');
    rawRows = parse(text, { columns: true, skip_empty_lines: true, trim: true });
  } else if (Array.isArray(req.body?.rows)) {
    rawRows = req.body.rows;
  } else {
    throw ApiError.badRequest('Provide a CSV file (field "file") or JSON { rows: [...] }');
  }

  if (rawRows.length === 0) throw ApiError.badRequest('No rows found to import');
  if (rawRows.length > 10000) throw ApiError.badRequest('Import is limited to 10,000 rows per file');

  const results = { total: rawRows.length, imported: 0, skipped: 0, errors: [] };
  const seenInFile = new Set();

  // Preload existing mobiles to validate duplicates (spec §23).
  const normalized = rawRows.map(normalize);
  const mobiles = normalized.map((r) => r.mobile).filter(Boolean);
  const existing = await prisma.client.findMany({
    where: { mobile: { in: mobiles } },
    select: { mobile: true },
  });
  const existingMobiles = new Set(existing.map((e) => e.mobile));

  for (let i = 0; i < normalized.length; i++) {
    const parsed = rowSchema.safeParse(normalized[i]);
    if (!parsed.success) {
      results.skipped++;
      results.errors.push({ row: i + 1, reason: parsed.error.issues[0]?.message || 'invalid row' });
      continue;
    }
    const row = parsed.data;
    if (existingMobiles.has(row.mobile) || seenInFile.has(row.mobile)) {
      results.skipped++;
      results.errors.push({ row: i + 1, reason: `Duplicate mobile ${row.mobile}` });
      continue;
    }
    seenInFile.add(row.mobile);

    try {
      const leadId = await generateLeadId();
      await prisma.client.create({
        data: {
          leadId,
          name: row.name,
          mobile: row.mobile,
          email: row.email || null,
          company: row.company || null,
          source: row.source || 'Import',
          leadStatus: row.leadStatus || (row.assignedUserId ? 'ASSIGNED' : 'NEW'),
          assignedUserId: row.assignedUserId || null,
        },
      });
      results.imported++;
    } catch (e) {
      results.skipped++;
      results.errors.push({ row: i + 1, reason: e.message });
    }
  }

  recordAudit(req, {
    action: 'IMPORT',
    entityType: 'Client',
    description: `Imported ${results.imported}/${results.total} leads`,
  });
  res.json(results);
});
