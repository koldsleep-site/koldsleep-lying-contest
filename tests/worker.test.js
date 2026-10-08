import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { parseContact, isClosed } from '../src/index.js';

const URL = 'https://lying.koldsleep.com';
const ID = '12345678-1234-4234-9234-123456789012';
const BASE = { id: ID, lie_text: '콜드슬립 <script>x</script>', liar_name: '익명', contact: '010-1234-5678 / test@GMAIL.com', consent: true };
const ENV = {
  GOOGLE_SCRIPT_URL: 'https://script.google.com/macros/s/FAKE_DEPLOYMENT_ID/exec',
  GOOGLE_SCRIPT_SECRET: 'server-only-placeholder',
  RECOMMENDATION_FORM_URL: 'https://docs.google.com/forms/d/e/example/viewform',
  ASSETS: { fetch: async () => new Response('<html>OK</html>', { headers: { 'Content-Type': 'text/html' } }) }
};

function request(path, data, method = 'POST') {
  return new Request(`${URL}${path}`, data === undefined ? { method } : {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}

function withMockFetch(fn, cb) {
  const old = globalThis.fetch;
  globalThis.fetch = fn;
  return Promise.resolve().then(cb).finally(() => { globalThis.fetch = old; });
}

test('contact parser accepts telephone, email, both in any order', () => {
  const cases = [
    ['01012345678', '010-1234-5678', ''],
    ['abc@GMAIL.COM', '', 'abc@gmail.com'],
    ['010-1234-5678, Cat@Example.com', '010-1234-5678', 'cat@example.com'],
    ['email: Cat@Example.com / 휴대전화: +82 10 1234 5678', '010-1234-5678', 'cat@example.com'],
    ['010 1234 5678 hello@gmail.com', '010-1234-5678', 'hello@gmail.com']
  ];
  for (const [value, phone, email] of cases) {
    const parsed = parseContact(value);
    assert.equal(parsed.ok, true, value);
    assert.equal(parsed.phone, phone, value);
    assert.equal(parsed.email, email, value);
  }
});

test('contact parser rejects unknown input and invalid numbers', () => {
  for (const invalid of ['', 'abc', '02-123-4567', '010-1234-5678 extra', 'wrong@@email.com', '010-1234-5678?']) {
    assert.equal(parseContact(invalid).ok, false, invalid);
  }
});

test('deadline is based on Korean absolute instant', () => {
  assert.equal(isClosed(Date.parse('2026-10-25T23:59:59+09:00')), false);
  assert.equal(isClosed(Date.parse('2026-10-26T00:00:00+09:00')), true);
});

test('POST submits both contacts without leaking secret to browser', async () => {
  let upstreamPayload;
  await withMockFetch(async (url, options) => {
    assert.match(String(url), /^https:\/\/script\.google\.com\/macros\/s\//);
    upstreamPayload = JSON.parse(options.body);
    return Response.json({ ok: true, id: ID });
  }, async () => {
    const res = await worker.fetch(request('/api/submit', BASE), ENV);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, { ok: true, id: ID });
    assert.equal(res.headers.get('Cache-Control'), 'no-store');
    assert.ok(!JSON.stringify(body).includes(ENV.GOOGLE_SCRIPT_SECRET));
    assert.equal(upstreamPayload.contact, BASE.contact);
    assert.equal(upstreamPayload.secret, ENV.GOOGLE_SCRIPT_SECRET);
  });
});

test('POST rejects malformed form before contacting Google', async () => {
  await withMockFetch(() => { throw Error('Should not call Google'); }, async () => {
    for (const data of [{ ...BASE, contact: 'text-only' }, { ...BASE, consent: false }, { ...BASE, id: 'oops' }, { ...BASE, lie_text: '' }]) {
      const response = await worker.fetch(request('/api/submit', data), ENV);
      assert.equal(response.status, 400);
    }
    assert.equal((await worker.fetch(request('/api/submit', []), ENV)).status, 400);
  });
});

test('POST returns 503 on Google error and preserves retry semantics', async () => {
  await withMockFetch(async () => Response.json({ ok: false, error: 'storage error' }), async () => {
    const res = await worker.fetch(request('/api/submit', BASE), ENV);
    assert.equal(res.status, 503);
    assert.match((await res.json()).error, /같은 내용으로 다시/);
  });
});

test('GET random returns only approved public text from upstream response', async () => {
  await withMockFetch(async () => Response.json({ ok: true, lie_text: '공개된 거짓말', contact: 'PRIVATE', liar_name: 'PRIVATE' }), async () => {
    const res = await worker.fetch(new Request(`${URL}/api/random`), ENV);
    assert.deepEqual(await res.json(), { ok: true, lie_text: '공개된 거짓말' });
  });
});

test('GET config exposes only the recommendation link', async () => {
  const res = await worker.fetch(new Request(`${URL}/api/config`), ENV);
  assert.deepEqual(await res.json(), { recommendation_url: ENV.RECOMMENDATION_FORM_URL });
});

test('static assets are served with security headers', async () => {
  const res = await worker.fetch(new Request(`${URL}/`), ENV);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /OK/);
  assert.equal(res.headers.get('X-Frame-Options'), 'DENY');
});
