// v2 response shape, applied on top of the existing v1 routes:
//   success: { data: <old body>, meta: { version: "v2" } }
//   error:   { error: { code, message }, meta: { version: "v2" } }
// This is the "breaking change" that justifies a v2. Describe it in VERSIONING_NOTES.md.
function v2Format(req, res, next) {
  const original = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 400) {
      const error = body && body.error;
      const code = typeof error === 'string' && /^[a-z][a-z0-9_]*$/i.test(error)
        ? error
        : error && typeof error.code === 'string'
          ? error.code
          : `http_${res.statusCode}`;
      const message = body && typeof body.message === 'string'
        ? body.message
        : error && typeof error.message === 'string'
          ? error.message
          : typeof error === 'string' && error !== code
            ? error
            : 'Request failed';
      return original({ error: { code, message }, meta: { version: 'v2' } });
    }
    return original({ data: body, meta: { version: 'v2' } });
  };
  next();
}

module.exports = v2Format;
