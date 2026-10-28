'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const vm = require('node:vm');
const host = require('../resources/fancycode/fancycode-host.cjs');

test('Desktop account login and guest login both wait for harness session sync', async () => {
  const source = fs.readFileSync(path.join(__dirname, 'main.cjs'), 'utf8');
  const begin = source.indexOf("  ipcMain.handle('fancy:login'");
  const end = source.indexOf("  ipcMain.handle('fancy:check-invite'", begin);
  assert.ok(begin >= 0 && end > begin);
  const handles = new Map();
  const events = [];
  const context = {
    ipcMain: { handle: (name, fn) => handles.set(name, fn) },
    fancyAccount: {
      login: async () => { events.push('login'); return 'login-result'; },
      guest: async () => { events.push('guest'); return 'guest-result'; },
    },
    fancycodeHarness: { syncSession: async () => { await Promise.resolve(); events.push('sync'); } },
  };
  vm.runInNewContext(source.slice(begin, end), context);
  assert.equal(await handles.get('fancy:login')({}, 'github', ''), 'login-result');
  assert.equal(await handles.get('fancy:guest')({}, 'invite'), 'guest-result');
  assert.deepEqual(events, ['login', 'sync', 'guest', 'sync']);
});

test('Desktop harness handles project trust and starts its bundled SDK', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fancycode-desktop-test-'));
  const cwd = path.join(dir, 'project');
  fs.mkdirSync(cwd);
  fs.writeFileSync(path.join(cwd, '.mcp.json'), JSON.stringify({ mcpServers: { demo: { command: 'does-not-run' } } }));
  const previousHome = process.env.FANCYCODE_HOME;
  const previousToken = process.env.FANCYCODE_TOKEN;
  process.env.FANCYCODE_HOME = path.join(dir, 'home');
  delete process.env.FANCYCODE_TOKEN;
  const handles = new Map();
  const listeners = new Map();
  const ipcMain = {
    handle: (name, fn) => handles.set(name, fn),
    on: (name, fn) => listeners.set(name, fn),
  };
  const sender = new EventEmitter();
  sender.isDestroyed = () => false;
  sender.send = (channel, id, event) => sender.emit(channel, id, event);
  const ipc = host.registerIpc({ ipcMain, bundle: path.resolve(__dirname, '../resources/fancycode/fancycode.mjs'), runtime: { node: 'node' }, allow: () => true });
  let ready = false;
  const timeout = setTimeout(() => sender.emit('failure', new Error('SDK-Start abgelaufen')), 5000);
  try {
    const event = { sender };
    const id = handles.get('fancycode:start')(event, { cwd });
    const completed = new Promise((resolve, reject) => {
      sender.once('failure', reject);
      sender.on('fancycode:event', (receivedId, message) => {
        if (receivedId !== id) return;
        if (message.type === 'permission_request') listeners.get('fancycode:send')(event, id, { type: 'permission', id: message.id, answer: 'no' });
        if (message.type === 'error') reject(new Error(message.message));
        if (message.type === 'ready') { ready = true; resolve(); }
      });
    });
    await completed;
    assert.equal(ready, true);
    listeners.get('fancycode:stop')(event, id);
  } finally {
    clearTimeout(timeout);
    ipc.stopAll();
    if (previousHome === undefined) delete process.env.FANCYCODE_HOME; else process.env.FANCYCODE_HOME = previousHome;
    if (previousToken === undefined) delete process.env.FANCYCODE_TOKEN; else process.env.FANCYCODE_TOKEN = previousToken;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
