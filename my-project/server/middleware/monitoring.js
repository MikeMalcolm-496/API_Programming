const round = n => Math.round(n * 10) / 10;

// Who called, without ever writing the key itself.
function who(req) {
  if (!req.apiKey) return 'none';
  return req.apiKey.name;
}

function monitor(req, res, next) {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;

    console.log(JSON.stringify({
      time: new Date().toISOString(),
      method: req.method,
      path: req.path,
      status: res.statusCode,
      ms: round(ms),
      caller: who(req),
    }));
  });

  next();
}

module.exports = { monitor };