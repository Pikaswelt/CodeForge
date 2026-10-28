'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const Module = require('node:module');

const removed = [];
const fakeSftp = {
  realpath(target, cb) {
    cb(null, target === '/home/user/link' ? '/' : target);
  },
  lstat(target, cb) {
    cb(null, { isDirectory: () => false });
  },
  unlink(target, cb) {
    removed.push(target);
    cb(null);
  },
};
class FakeClient extends EventEmitter {
  connect() { process.nextTick(() => this.emit('ready')); }
  sftp(cb) { cb(null, fakeSftp); }
  end() {}
}
const originalLoad = Module._load;
let sftp;
try {
  Module._load = function (request, ...args) {
    return request === 'ssh2' ? { Client: FakeClient } : originalLoad.call(this, request, ...args);
  };
  sftp = require('./sftp.cjs');
} finally {
  Module._load = originalLoad;
}

const server = { id: 'test', host: 'example.test', user: 'test' };
test('SFTP deletion rejects disguised root and top-level paths', async () => {
  for (const target of ['/', '//', '/tmp/..', '/tmp/../etc/', '/home/user/link/../file', '/etc', '/etc/./']) {
    await assert.rejects(sftp.remove(server, target), /Sicherheitsgruenden/, target);
  }
});
test('SFTP deletion resolves symlinked parents before checking and deletes safe paths', async () => {
  await sftp.connect(server, 'test-password');
  try {
    await assert.rejects(sftp.remove(server, '/home/user/link/etc'), /Sicherheitsgruenden/);
    await sftp.remove(server, '/home/user/project/file.txt');
    assert.deepEqual(removed, ['/home/user/project/file.txt']);
  } finally {
    sftp.disconnectAll();
  }
});
