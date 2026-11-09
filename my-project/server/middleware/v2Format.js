// v2 response shape, applied on top of the existing v1 routes:
//   success: { data: <old body>, meta: { version: "v2" } }
//   error:   { error: { code, message } }
// This is the "breaking change" that justifies a v2. Describe it in VERSIONING_NOTES.md.
function v2Format(req, res, next) {
  const original = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 400) {
      const raw = body && (body.error || body.message);
      const message = typeof raw === 'string' ? raw : 'Request failed';
      return original({ error: { code: res.statusCode, message } });
    }
    return original({ data: body, meta: { version: 'v2' } });
  };
  next();
}

module.exports = v2Format;
