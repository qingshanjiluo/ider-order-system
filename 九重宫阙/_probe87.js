process.env.DSH_DATA_DIR = require('fs').mkdtempSync(require('os').tmpdir() + '/dsh-probe-');
const express = require('express');
const app = express();
app.use(express.json());
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/battle', require('./src/routes/battle'));
app.use((err, req, res, next) => { console.error('HANDLER THREW:', err.stack); res.status(599).end(); });
const srv = app.listen(0, '127.0.0.1', async () => {
  const base = 'http://127.0.0.1:' + srv.address().port;
  let r = await fetch(base + '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'probe9', password: 'probe-pass-1', nickname: 'probe9', faction: 'martial' }) });
  const j = await r.json();
  r = await fetch(base + '/api/battle/war/info', { headers: { Authorization: 'Bearer ' + j.token } });
  console.log('war/info status=', r.status);
  console.log((await r.text()).slice(0, 400));
  srv.close();
  process.exit(0);
});
