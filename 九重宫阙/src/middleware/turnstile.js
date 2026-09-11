const https = require('https');

async function verifyTurnstile(token, ip) {
  if (!process.env.TURNSTILE_SECRET) {
    return { success: true, skip: true };
  }

  return new Promise((resolve) => {
    const postData = `secret=${encodeURIComponent(process.env.TURNSTILE_SECRET)}&response=${encodeURIComponent(token)}&remoteip=${encodeURIComponent(ip || '')}`;

    const req = https.request({
      hostname: 'challenges.cloudflare.com',
      path: '/turnstile/v0/siteverify',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ success: false, error: 'parse_error' });
        }
      });
    });

    req.on('error', () => resolve({ success: false, error: 'network_error' }));
    req.write(postData);
    req.end();
  });
}

function turnstileMiddleware(req, res, next) {
  if (!process.env.TURNSTILE_SECRET) {
    return next();
  }

  const token = req.body?.turnstileToken;
  if (!token) {
    return res.status(400).json({ error: '请完成人机验证' });
  }

  verifyTurnstile(token, req.ip).then(result => {
    if (result.success || result.skip) {
      next();
    } else {
      res.status(403).json({ error: '人机验证失败，请重试' });
    }
  });
}

module.exports = { turnstileMiddleware, verifyTurnstile };
