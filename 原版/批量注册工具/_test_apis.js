const fetch = require('node-fetch');

async function test() {
  console.log('=== 测试各个免费邮箱API ===\n');

  // 1. Tempy.email
  try {
    const r = await fetch('https://tempy.email/api/v1/mailbox', { method: 'POST', timeout: 15000 });
    const text = await r.text();
    console.log('1. Tempy.email:');
    console.log('   Status:', r.status);
    console.log('   Response:', text.substring(0, 300));
    console.log('');
  } catch(e) { console.log('1. Tempy.email FAIL:', e.message + '\n'); }

  // 2. Mail.tm - create inbox test
  try {
    const dr = await fetch('https://api.mail.tm/domains', { timeout: 10000 });
    const domains = await dr.json();
    const domain = domains['hydra:member']?.[0]?.domain || 'unknown';
    console.log('2. Mail.tm:');
    console.log('   Domain:', domain);
    const local = 'test' + Date.now().toString(36);
    const cr = await fetch('https://api.mail.tm/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: local + '@' + domain, password: 'Test1234!' }),
      timeout: 15000,
    });
    if (cr.ok) {
      const ar = await fetch('https://api.mail.tm/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: local + '@' + domain, password: 'Test1234!' }),
        timeout: 10000,
      });
      const auth = await ar.json();
      console.log('   Inbox created:', local + '@' + domain);
      console.log('   Token:', (auth.token || 'ok').substring(0, 30));
    } else {
      const errText = await cr.text();
      console.log('   Create failed:', cr.status, errText.substring(0, 100));
    }
    console.log('');
  } catch(e) { console.log('2. Mail.tm FAIL:', e.message + '\n'); }

  // 3. 10minutemail.one - check if we can get the page and API
  try {
    const r = await fetch('https://10minutemail.one/zh', {
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0' }
    });
    const text = await r.text();
    const jwtRegex = /mailServiceToken[^}]+}[^"]*"([^"]+)"/;
    const jwtMatch = text.match(jwtRegex);
    const apiRegex = /apiBaseUrl[^:]+:"([^"]+)"/;
    const apiMatch = text.match(apiRegex);
    console.log('3. 10minutemail.one:');
    console.log('   Status:', r.status);
    console.log('   Has JWT:', !!jwtMatch);
    if (jwtMatch) console.log('   JWT:', jwtMatch[1].substring(0, 50) + '...');
    if (apiMatch) console.log('   API:', apiMatch[1]);

    if (jwtMatch) {
      const token = jwtMatch[1];
      const apiBase = apiMatch ? apiMatch[1] : 'https://web.10minutemail.one/api/v1';
      // Try to create/get mailbox
      const mbr = await fetch(apiBase + '/mailbox', {
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });
      const mbText = await mbr.text();
      console.log('   Mailbox API status:', mbr.status);
      console.log('   Mailbox response:', mbText.substring(0, 200));
    }
    console.log('');
  } catch(e) { console.log('3. 10minutemail.one FAIL:', e.message + '\n'); }

  // 4. fumail.co
  try {
    const r = await fetch('https://www.fumail.co/zh', {
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0' }
    });
    const text = await r.text();
    // Look for CSRF and BASE_PATH
    const csrfRegex = /meta[^>]*name=["']csrf[^>]*content=["']([^"']+)/i;
    const csrfMatch = text.match(csrfRegex);
    const basePathRegex = /BASE_PATH\s*=\s*["']([^"']+)/;
    const basePathMatch = text.match(basePathRegex);
    // Find email on page
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const emails = text.match(emailRegex);
    const filteredEmails = emails ? emails.filter(e => !e.includes('@example') && e.length < 40) : [];

    console.log('4. fumail.co:');
    console.log('   Status:', r.status);
    console.log('   CSRF:', csrfMatch ? csrfMatch[1] : 'not found');
    console.log('   BASE_PATH:', basePathMatch ? basePathMatch[1] : 'not found');
    console.log('   Emails on page:', filteredEmails.slice(0, 5));
    console.log('');
  } catch(e) { console.log('4. fumail.co FAIL:', e.message + '\n'); }

  // 5. beeinbox.com
  try {
    const r = await fetch('https://beeinbox.com/zh-CN', {
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0' }
    });
    const text = await r.text();
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const emails = text.match(emailRegex);
    const filteredEmails = emails ? emails.filter(e => !e.includes('@example') && e.length < 40) : [];

    console.log('5. beeinbox.com:');
    console.log('   Status:', r.status);
    console.log('   Length:', text.length);
    console.log('   Emails:', filteredEmails.slice(0, 5));
    console.log('');
  } catch(e) { console.log('5. beeinbox.com FAIL:', e.message + '\n'); }

  console.log('=== 测试完成 ===');
}

test().catch(e => console.error('Error:', e.message));
