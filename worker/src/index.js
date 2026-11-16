// Worker: sirve la app (web/) y hace de puente seguro hacia la API de Wallet.
//
// Seguridad:
//  - El token de Wallet vive solo aquí (secreto WALLET_TOKEN); el navegador no lo ve.
//  - /api/* exige un JWT válido de Cloudflare Access (firma, audiencia y expiración).
//    Sin ACCESS_TEAM_DOMAIN y ACCESS_AUD configurados, falla cerrado (403).
//  - Lista blanca mínima: solo lectura de cuentas/categorías/etiquetas/registros
//    y creación de registros. No se puede borrar, editar ni tocar otros recursos.

const WALLET_BASE = 'https://rest.budgetbakers.com/wallet/v1/api/';

export function isAllowed(method, name) {
  if (method === 'GET') return ['accounts', 'categories', 'labels', 'records'].includes(name);
  if (method === 'POST') return name === 'records';
  return false;
}

const b64urlToBytes = (s) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '='));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};
const b64urlToJson = (s) => JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));

let jwksCache = { at: 0, keys: null, team: null };

async function getJwks(team) {
  if (jwksCache.keys && jwksCache.team === team && Date.now() - jwksCache.at < 3600_000) return jwksCache.keys;
  const res = await fetch(`https://${team}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error('No se pudieron obtener las claves de Access');
  const { keys } = await res.json();
  jwksCache = { at: Date.now(), keys, team };
  return keys;
}

/** Verifica el JWT de Cloudflare Access. Devuelve el payload o lanza error. */
export async function verifyAccess(request, env) {
  if (env.DEV_ALLOW_NO_ACCESS === '1') return { dev: true };
  // Acepta los nombres de Cloudflare (TEAM_DOMAIN, POLICY_AUD) y los propios.
  const team = env.ACCESS_TEAM_DOMAIN || env.TEAM_DOMAIN;
  const aud = env.ACCESS_AUD || env.POLICY_AUD;
  if (!team || !aud) throw new Error('Access no configurado');
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) throw new Error('Falta el JWT de Access');
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) throw new Error('JWT malformado');
  const header = b64urlToJson(h);
  if (header.alg !== 'RS256') throw new Error('Algoritmo no permitido');
  const jwk = (await getJwks(team)).find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('Clave desconocida');
  const key = await crypto.subtle.importKey(
    'jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'],
  );
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5', key, b64urlToBytes(s), new TextEncoder().encode(`${h}.${p}`),
  );
  if (!ok) throw new Error('Firma inválida');
  const payload = b64urlToJson(p);
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!auds.includes(aud)) throw new Error('Audiencia incorrecta');
  if (payload.iss !== `https://${team}`) throw new Error('Emisor incorrecto');
  if (!payload.exp || payload.exp * 1000 < Date.now()) throw new Error('JWT expirado');
  return payload;
}

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

async function handleApi(request, env, url) {
  try {
    await verifyAccess(request, env);
  } catch (e) {
    return json({ error: 'No autorizado', detail: e.message }, 403);
  }

  if (url.pathname === '/api/me') return json({ ok: true, walletConfigured: Boolean(env.WALLET_TOKEN) });

  const m = url.pathname.match(/^\/api\/wallet\/([a-z-]+)$/);
  if (!m || !isAllowed(request.method, m[1])) return json({ error: 'Ruta no permitida' }, 403);
  if (!env.WALLET_TOKEN) return json({ error: 'WALLET_TOKEN no configurado' }, 500);

  const upstream = await fetch(WALLET_BASE + m[1] + url.search, {
    method: request.method,
    headers: {
      Authorization: `Bearer ${env.WALLET_TOKEN}`,
      ...(request.method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
    },
    body: request.method === 'POST' ? await request.text() : undefined,
  });

  const headers = new Headers({ 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json', 'Cache-Control': 'no-store' });
  for (const [k, v] of upstream.headers) if (k.toLowerCase().startsWith('x-ratelimit') || k.toLowerCase() === 'retry-after') headers.set(k, v);
  return new Response(upstream.body, { status: upstream.status, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return handleApi(request, env, url);
    return env.ASSETS.fetch(request);
  },
};
