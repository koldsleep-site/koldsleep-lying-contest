import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parseContact as workerParser } from '../src/index.js';
const code = readFileSync(new URL('../google_apps_script.gs', import.meta.url), 'utf8');

const inputs = [
  '01012345678', 'ABC@gmail.com', '010 1234 5678, abc@gmail.com',
  '전화: 010-1234-5678 / 이메일: CAT@GMAIL.COM',
  'Cat@Example.com, +82 10 1234 5678',
  'garbage', '010-1234-5678 extra', '02-555-1234', 'abc@@gmail.com'
];

test('Workers and Apps Script contact parsers agree', () => {
  const context = vm.createContext({});
  vm.runInContext(code, context);
  for (const input of inputs) {
    const actual = vm.runInContext(`parseContact_(${JSON.stringify(input)})`, context);
    const expected = workerParser(input);
    assert.equal(actual.ok, expected.ok, input);
    assert.equal(actual.phone, expected.phone, input);
    assert.equal(actual.email, expected.email, input);
  }
});

test('Apps Script indexes public in column I, keeps contacts in E-G', () => {
  assert.match(code, /'contact',\s*'phone',\s*'email',\s*'consent',\s*'public'/);
  assert.match(code, /s\.getRange\(row, 1, 1, 9\)/);
  assert.match(code, /row\[6\] === true/);
  assert.match(code, /s\.getRange\(row, 9\)/);
});
