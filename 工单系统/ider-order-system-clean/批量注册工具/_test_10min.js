const fetch = require('node-fetch');

async function test() {
  const r = await fetch('https://10minutemail.one/zh', {
    timeout: 15000,
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0' }
  });
  const text = await r.text();

  const nuxtMatch = text.match(/__NUXT_DATA__[^>]*>([^<]+)/);
  if (nuxtMatch) {
    try {
      const data = JSON.parse(nuxtMatch[1]);
      const flat = JSON.stringify(data);
      const jwtRegex = /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
      const jwts = flat.match(jwtRegex);
      console.log('Found JWTs:', jwts ? jwts.length : 0);
      if (jwts) {
        jwts.forEach((j, i) => console.log('  JWT[' + i + ']:', j.substring(0, 60) + '...'));
      }
    } catch(e) {
      console.log('Parse error:', e.message);
    }
  }

  // Also look for API base
  const apiMatch = text.match(/apiBaseUrl[^:]+:"([^"]+)"/);
  if (apiMatch) console.log('API Base:', apiMatch[1]);

  // Try the API with the JWT
  const configText = text.match(/window.__NUXT__\.config[^<]*/);
  if (configText) {
    const apiUrl = configText[0].match(/apiBaseUrl[^:]+:"([^"]+)"/);
    if (apiUrl) console.log('Config API URL:', apiUrl[1]);
  }
}

test().catch(e => console.error('Error:', e.message));
