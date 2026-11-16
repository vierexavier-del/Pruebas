import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { isAllowed } from '../worker/src/index.js';

const b64url = (buf) => Buffer.from(buf).toString('base64url');

test('lista blanca: solo lectura y creación de registros', () => {
  assert.equal(isAllowed('GET', 'accounts'), true);
  assert.equal(isAllowed('POST', 'records'), true);
  assert.equal(isAllowed('DELETE', 'records'), false);
  assert.equal(isAllowed('PATCH', 'records'), false);
  assert.equal(isAllowed('POST', 'accounts'), false);
  assert.equal(isAllowed('GET', 'budgets'), false);
});

async function setup() {
  const { publicKey, privateKey } = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'],
  );
  const jwk = { ...(await crypto.subtle.exportKey('jwk', publicKey)), kid: 'k1', alg: 'RS256' };
  const sign = async (payload, kid = 'k1') => {
    const h = b64url(JSON.stringify({ alg: 'RS256', kid }));
    const p = b64url(JSON.stringify(payload));
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(`${h}.${p}`));
    return `${h}.${p}.${b64url(sig)}`;
  };
  return { jwk, sign };
}

const env = { ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com', ACCESS_AUD: 'aud123', WALLET_TOKEN: 'secret-token', ASSETS: { fetch: () => new Response('asset') } };

test('API: exige JWT de Access válido y reenvía con el token del servidor', async (t) => {
  const { jwk, sign } = await setup();
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('/cdn-cgi/access/certs')) return Response.json({ keys: [jwk] });
    return Response.json({ accounts: [] }, { headers: { 'X-RateLimit-Remaining-Hour': '400' } });
  };
  t.after(() => { globalThis.fetch = realFetch; });

  const now = Math.floor(Date.now() / 1000);
  const good = await sign({ aud: ['aud123'], iss: 'https://team.cloudflareaccess.com', exp: now + 600 });
  const req = (path, token, init = {}) => new Request('https://app.test' + path, { ...init, headers: token ? { 'Cf-Access-Jwt-Assertion': token } : {} });

  // sin JWT
  assert.equal((await worker.fetch(req('/api/wallet/accounts'), env)).status, 403);
  // audiencia incorrecta
  const badAud = await sign({ aud: ['otra'], iss: 'https://team.cloudflareaccess.com', exp: now + 600 });
  assert.equal((await worker.fetch(req('/api/wallet/accounts', badAud), env)).status, 403);
  // expirado
  const old = await sign({ aud: ['aud123'], iss: 'https://team.cloudflareaccess.com', exp: now - 10 });
  assert.equal((await worker.fetch(req('/api/wallet/accounts', old), env)).status, 403);
  // firma manipulada
  const tampered = good.slice(0, -4) + 'AAAA';
  assert.equal((await worker.fetch(req('/api/wallet/accounts', tampered), env)).status, 403);
  // sin configurar Access: falla cerrado
  assert.equal((await worker.fetch(req('/api/wallet/accounts', good), { ...env, ACCESS_AUD: '' })).status, 403);
  assert.equal(calls.filter((c) => c.url.includes('rest.budgetbakers')).length, 0, 'nada llegó a Wallet sin autorización');

  // válido
  const ok = await worker.fetch(req('/api/wallet/accounts?limit=20', good), env);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('X-RateLimit-Remaining-Hour'), '400');
  const up = calls.find((c) => c.url.includes('rest.budgetbakers'));
  assert.equal(up.url, 'https://rest.budgetbakers.com/wallet/v1/api/accounts?limit=20');
  assert.equal(up.init.headers.Authorization, 'Bearer secret-token');

  // métodos y rutas fuera de la lista blanca
  assert.equal((await worker.fetch(req('/api/wallet/records', good, { method: 'DELETE' }), env)).status, 403);
  assert.equal((await worker.fetch(req('/api/wallet/budgets', good), env)).status, 403);
  assert.equal((await worker.fetch(req('/api/wallet/records/extra', good), env)).status, 403);

  // el token jamás aparece en la respuesta
  assert.ok(!(await ok.clone().text()).includes('secret-token'));

  // estáticos pasan al binding de assets
  assert.equal(await (await worker.fetch(new Request('https://app.test/'), env)).text(), 'asset');
});
