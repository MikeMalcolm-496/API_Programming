// Marks every v1 response as deprecated (RFC 8594 Sunset + Deprecation headers).
const SUNSET = process.env.V1_SUNSET || 'Fri, 30 Jan 2027 23:59:59 GMT'; // change to your real date

function deprecate(req, res, next) {
  res.set('Deprecation', 'true');
  res.set('Sunset', SUNSET);
  res.set('Link', '</api/v2>; rel="successor-version"');
  next();
}

module.exports = deprecate;
