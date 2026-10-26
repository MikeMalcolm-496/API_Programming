const WINDOW_MS = 60 * 1000;
const DEFAULT_LIMIT = 60;

function limitPerMinute() {
  const n = Number(process.env.RATE_LIMIT_PER_MINUTE);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_LIMIT;
}

const windows = new Map();

function rateLimitPerKey(req, res, next) {
  if (!req.apiKey) return next();

  const now = Date.now();
  const id = req.apiKey.id;
  let w = windows.get(id);

  if (!w || now - w.start >= WINDOW_MS) {
    w = { start: now, count: 0 };
    windows.set(id, w);
  }
  w.count += 1;

    const limit = limitPerMinute();
  const resetIn = Math.max(1, Math.ceil((w.start + WINDOW_MS - now) / 1000));

  res.set('X-RateLimit-Limit', String(limit));
  res.set('X-RateLimit-Remaining', String(Math.max(0, limit - w.count)));

  if (w.count > limit) {
    res.set('Retry-After', String(resetIn));
    return res.status(429).json({
      error: 'rate_limited',
      message: `Too many requests for this API key. Limit is ${limit} per minute. Try again in ${resetIn} seconds.`,
    });
  }

  return next();
}

module.exports = { rateLimitPerKey };