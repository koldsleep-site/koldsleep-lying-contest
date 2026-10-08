// koldsleep Lying Contest · Cloudflare Workers
// Private credentials must be configured as runtime variables/secrets only.
const DEADLINE = Date.parse('2026-10-26T00:00:00+09:00');
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_FIELD_LENGTH = 49000;
const MAX_REQUEST_BYTES = 512 * 1024; // Same limit as the original Flask server.

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...SECURITY_HEADERS
    }
  });
}

export function parseContact(input) {
  const original = typeof input === 'string' ? input.trim() : '';
  if (!original) return { ok: false, phone: '', email: '', original };

  const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  const emails = [...new Set((original.match(emailRegex) || []).map(email => email.toLowerCase()))];
  let remainder = original.replace(emailRegex, ' ');
  const phoneRegex = /(?:\+82[\s.-]?\(?0?\)?[\s.-]?|0)1[016789][\s().-]?\d{3,4}[\s.-]?\d{4}/g;
  const matches = remainder.match(phoneRegex) || [];
  const phones = [];

  for (const match of matches) {
    let digits = match.replace(/\D/g, '');
    if (digits.startsWith('82')) digits = `0${digits.slice(2)}`;
    if (!/^01[016789]\d{7,8}$/.test(digits)) return { ok: false, phone: '', email: '', original };
    const formatted = digits.length === 11
      ? digits.replace(/^(\d{3})(\d{4})(\d{4})$/, '$1-$2-$3')
      : digits.replace(/^(\d{3})(\d{3})(\d{4})$/, '$1-$2-$3');
    if (!phones.includes(formatted)) phones.push(formatted);
  }
  remainder = remainder.replace(phoneRegex, ' ');
  remainder = remainder
    .replace(/휴대전화번호|휴대전화|휴대폰번호|휴대폰|전화번호|전화|이메일주소|이메일|메일주소|메일|contact|mobile|phone|email|e-mail/gi, ' ')
    .replace(/[\s,;/|:()[\]{}<>·，、]+/g, '')
    .trim();
  const ok = remainder === '' && (phones.length > 0 || emails.length > 0);
  return { ok, phone: ok ? phones.join(', ') : '', email: ok ? emails.join(', ') : '', original };
}

export function isClosed(now = Date.now()) {
  return now >= DEADLINE;
}

function scriptUrl(env) {
  const raw = String(env?.GOOGLE_SCRIPT_URL || '').trim();
  try {
    const url = new URL(raw);
    if (url.protocol === 'https:' && url.hostname === 'script.google.com' &&
        /^\/macros\/s\/[^/]+\/exec$/.test(url.pathname) && !url.search && !url.hash) {
      return url.href;
    }
  } catch (_) {}
  throw new Error('Google Apps Script deployment URL is not configured');
}

async function callSheet(env, payload) {
  // Log only fixed codes and HTTP status; never payload, URL, secret or raw body.
  const fail = (code, status) => {
    console.error(JSON.stringify({ event: 'sheet_failure', code, ...(status ? { status } : {}) }));
    throw new Error(code);
  };
  let endpoint;
  try { endpoint = scriptUrl(env); }
  catch (_) { fail('SCRIPT_URL_INVALID'); }
  const secret = String(env?.GOOGLE_SCRIPT_SECRET || '').trim();
  if (!secret) fail('SCRIPT_SECRET_MISSING');
  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST', redirect: 'manual',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, secret })
    });
  } catch (_) { fail('SCRIPT_NETWORK_ERROR'); }
  if ([301, 302, 303].includes(response.status)) {
    let target;
    try { target = new URL(response.headers.get('Location'), endpoint); }
    catch (_) { fail('SCRIPT_REDIRECT_INVALID'); }
    if (target.protocol !== 'https:' || target.hostname !== 'script.googleusercontent.com') {
      fail('SCRIPT_REDIRECT_UNEXPECTED');
    }
    try {
      response = await fetch(target.href, { method: 'GET', redirect: 'manual' });
    } catch (_) { fail('SCRIPT_RESULT_NETWORK_ERROR'); }
    if (!response.ok) fail('SCRIPT_RESULT_HTTP_ERROR', response.status);
  }
  if (!response.ok) fail('SCRIPT_HTTP_ERROR', response.status);
  let result;
  try { result = await response.json(); }
  catch (_) { fail('SCRIPT_NON_JSON', response.status); }
  if (!result || typeof result !== 'object' || result.ok !== true) {
    if (result?.error === 'invalid contact') return { ok: false, error: 'invalid contact' };
    if (result?.error === 'closed') return { ok: false, error: 'closed' };
    const codes = {
      'unauthorized': 'SCRIPT_UNAUTHORIZED',
      'storage error': 'SCRIPT_STORAGE_ERROR',
      'invalid action': 'SCRIPT_INVALID_ACTION',
      'invalid submission': 'SCRIPT_INVALID_SUBMISSION',
      'invalid fields': 'SCRIPT_INVALID_FIELDS'
    };
    fail(codes[result?.error] || 'SCRIPT_INVALID_RESPONSE', response.status);
  }
  return result;
}

function config(env) {
  const value = String(env?.RECOMMENDATION_FORM_URL || '').trim()
    || 'https://docs.google.com/forms/d/e/1FAIpQLSezyQQMstLIopMKnQJDIxbZlt2gX9w_RXVR1ztR180_GURK2g/viewform?usp=header';
  try {
    const url = new URL(value);
    return json({ recommendation_url: url.protocol === 'https:' ? url.href : '' });
  } catch (_) {
    return json({ recommendation_url: '' });
  }
}

async function submit(request, env) {
  if (isClosed()) return json({ ok: false, error: '제출 기간이 종료되었습니다. (2026.10.26. 00:00)' }, 410);
  if (!/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get('Content-Type') || '')) {
    return json({ ok: false, error: '입력 형식을 확인해 주세요.' }, 400);
  }
  if (Number(request.headers.get('Content-Length') || '0') > MAX_REQUEST_BYTES) {
    return json({ ok: false, error: '요청 크기가 너무 큽니다.' }, 413);
  }
  let data;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_REQUEST_BYTES) return json({ ok: false, error: '요청 크기가 너무 큽니다.' }, 413);
    data = JSON.parse(raw);
  } catch (_) {
    return json({ ok: false, error: '입력 형식을 확인해 주세요.' }, 400);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return json({ ok: false, error: '입력 형식을 확인해 주세요.' }, 400);
  if (data.consent !== true || !['lie_text', 'liar_name', 'contact'].every(key => typeof data[key] === 'string' && data[key].trim())) {
    return json({ ok: false, error: '모든 항목을 입력하고 참가 동의에 체크해 주세요.' }, 400);
  }
  const fields = Object.fromEntries(['lie_text', 'liar_name', 'contact'].map(key => [key, data[key].trim()]));
  if (!UUID_PATTERN.test(data.id || '')) return json({ ok: false, error: '페이지를 새로 열어 다시 제출해 주세요.' }, 400);
  if (Object.values(fields).some(value => value.length > MAX_FIELD_LENGTH)) {
    return json({ ok: false, error: '시트의 기술적 저장 한도를 초과했습니다. 공고에 안내된 이메일로 제출해 주세요.' }, 400);
  }
 // 연락처에 이메일 또는 11자리 휴대전화번호가 하나라도 있으면 허용
const contactText = fields.contact;

const hasEmail =
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(contactText);

const hasMobile =
  /(?:^|[^\d])01[016789](?:[\s.-]?\d){8}(?!\d)/.test(contactText);

if (!hasEmail && !hasMobile) {
  return json({
    ok: false,
    error: '휴대전화번호 11자리 또는 이메일 주소를 입력해 주세요.'
  }, 400);
}
  try {
    const result = await callSheet(env, { action: 'submit', id: data.id, ...fields, consent: true });
    if (!result.ok && result.error === 'invalid contact') return json({ ok: false, error: '연락처 형식을 확인해 주세요.' }, 400);
    if (!result.ok && result.error === 'closed') return json({ ok: false, error: '제출 기간이 종료되었습니다. (2026.10.26. 00:00)' }, 410);
    return json({ ok: true, id: result.id });
  } catch (_) {
    return json({ ok: false, error: '제출을 확인하지 못했습니다. 입력은 유지됩니다. 같은 내용으로 다시 누르면 중복 저장 없이 확인합니다.' }, 503);
  }
}

async function randomLie(env) {
  try {
    const result = await callSheet(env, { action: 'random' });
    return json({ ok: true, lie_text: typeof result.lie_text === 'string' ? result.lie_text : '' });
  } catch (_) {
    return json({ ok: false }, 503);
  }
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path.startsWith('/api/')) {
      if (path === '/api/config' && request.method === 'GET') return config(env);
      if (path === '/api/random' && request.method === 'GET') return randomLie(env);
      if (path === '/api/submit' && request.method === 'POST') return submit(request, env);
      return json({ ok: false, error: 'not found' }, 404);
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') return json({ ok: false, error: 'method not allowed' }, 405);
    // Cloudflare static assets binding. No private files are placed in public/.
    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    Object.entries(SECURITY_HEADERS).forEach(([key, value]) => headers.set(key, value));
    if (path === '/' || path === '/index.html') headers.set('Cache-Control', 'no-cache');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
};
