'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const vm = require('node:vm');
const { once } = require('node:events');

const source = fs.readFileSync(path.join(__dirname, 'main.cjs'), 'utf8');
const start = source.indexOf('  syncServer = http.createServer((req, res) => {');
const end = source.indexOf('\n  wss = new WebSocketServer', start);
assert.ok(start >= 0 && end > start, 'Sync-HTTP-Handler nicht gefunden');

function request(port, url, headers = {}) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: url, headers }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject);
  });
}

test('sync broadcasts never reach unauthenticated clients', () => {
  const begin = source.indexOf('function broadcast(msg, excludeWs = null) {');
  const finish = source.indexOf('\nfunction startSyncServer()', begin);
  assert.ok(begin >= 0 && finish > begin);
  const received = [];
  const authorized = { readyState: 1, isAuthorized: true, send: (data) => received.push(data) };
  const unauthorized = { readyState: 1, isAuthorized: false, send: () => assert.fail('Unauthenticated client received an event') };
  const context = { wss: { clients: [authorized, unauthorized] } };
  vm.runInNewContext(`${source.slice(begin, finish)}\nbroadcast({ type: 'test' });`, context);
  assert.deepEqual(received, ['{"type":"test"}']);
});

test('sync server requires a token for media and confines static files to dist', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fancycode-sync-test-'));
  const dist = path.join(dir, 'dist');
  fs.mkdirSync(dist);
  fs.mkdirSync(path.join(dir, 'electron'));
  fs.writeFileSync(path.join(dist, 'index.html'), 'public');
  fs.writeFileSync(path.join(dir, 'secret.txt'), 'private');
  let hasSymlink = true;
  try {
    fs.symlinkSync(path.join(dir, 'secret.txt'), path.join(dist, 'escape.txt'));
  } catch (error) {
    if (process.platform !== 'win32' || !['EPERM', 'EACCES'].includes(error.code)) throw error;
    hasSymlink = false;
  }
  const context = { http, fs, path, URL, syncToken: 'test-token', syncServer: null, __dirname: path.join(dir, 'electron') };
  vm.runInNewContext(source.slice(start, end), context);
  const server = context.syncServer;
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const port = server.address().port;
    const media = `/media?path=${encodeURIComponent(path.join(dir, 'secret.txt'))}`;
    assert.equal((await request(port, media)).status, 401);
    assert.equal((await request(port, `${media}&token=wrong`)).status, 401);
    assert.equal((await request(port, `${media}&token=test-token`)).body, 'private');
    assert.equal((await request(port, media, { authorization: 'Bearer test-token' })).body, 'private');
    assert.equal((await request(port, '/../secret.txt')).status, 403);
    if (hasSymlink) assert.equal((await request(port, '/escape.txt')).status, 403);
    assert.equal((await request(port, '/')).body, 'public');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
