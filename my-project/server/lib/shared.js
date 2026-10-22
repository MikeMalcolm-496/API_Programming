// Shared constants/helpers for the new (non-contract) routes.
// Values mirror the existing contract: do NOT add statuses or categories here
// that openapi.yaml / the contract tests do not allow.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CATEGORIES = ['electronics', 'personal-items', 'documents', 'clothing', 'keys', 'other'];
const ITEM_STATUSES = ['unclaimed', 'claimed', 'pending-verification'];

const fail = (res, status, error, message) => res.status(status).json({ error, message });
const serverError = (res, err) => {
  console.error(err);
  return fail(res, 500, 'internal_error', 'Failed to process the request.');
};
const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;

// Same shape as the contract's FoundItem, plus `title` (staff-facing routes only).
const ITEM_COLUMNS = `
  fi.id AS "itemId",
  fi.title,
  fi.status,
  fi.location_found AS location,
  to_char(fi.date_found, 'YYYY-MM-DD"T"00:00:00"Z"') AS "dateFound",
  fi.description,
  fi.category`;

module.exports = { UUID_RE, CATEGORIES, ITEM_STATUSES, fail, serverError, isNonEmptyString, ITEM_COLUMNS };
