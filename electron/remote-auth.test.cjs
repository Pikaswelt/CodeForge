'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { timingSafeEqual } = require('node:crypto');

const source = fs.readFileSync(path.join(__dirname, '..', 'codeforge-remote-server.mjs'), 'utf8');
const start = source.indexOf('function equalsSecret(');
const end = source.indexOf('\nfunction tokenMatches(', start);
assert.ok(start >= 0 && end > start);
const context = { Buffer, timingSafeEqual };
vm.runInNewContext(source.slice(start, end), context);

test('remote auth compares UTF-8 byte lengths before timingSafeEqual', () => {
  assert.equal(context.equalsSecret('éa', 'ab'), false);
  assert.equal(context.equalsSecret('ä', 'ä'), true);
  assert.equal(context.equalsSecret('wrong', 'other'), false);
  assert.equal(context.equalsSecret('', ''), false);
});
