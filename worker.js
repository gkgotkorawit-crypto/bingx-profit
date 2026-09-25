/* BingX Secure K-line Proxy for GitHub Pages
 * Deploy this file as a Cloudflare Worker.
 * Add Worker secrets:
 *   BINGX_API_KEY
 *   BINGX_API_SECRET
 * Optional variable:
 *   ALLOWED_ORIGIN = https://YOUR-USERNAME.github.io
 */
const PATH = '/openApi/swap/v3/quote/klines';
const BASES = ['https://open-api.bingx.com', 'https://open-api.bingx.pro'];

function corsHeaders(origin, allowed) {
  const allow = allowed === '*' || !allowed ? '*' : (origin === allowed ? origin : allowed);
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
  };
}

function validate(params) {
  const symbol = String(params.get('symbol') || '').toUpperCase();
  const interval = String(params.get('interval') || '1m');
  const startTime = Number(params.get('startTime'));
  const endTime = Number(params.get('endTime'));
  const limit = Number(params.get('limit') || 1440);
  if (!/^[A-Z0-9]{2,30}-USDT$/.test(symbol)) throw new Error('Invalid symbol');
  if (interval !== '1m') throw new Error('Only 1m is supported');
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || startTime >= endTime) throw new Error('Invalid time range');
  if (endTime - startTime > 1440 * 60 * 1000) throw new Error('Time range too large');
  if (!Number.isInteger(limit) || limit < 1 || limit > 1440) throw new Error('Invalid limit');
  return { symbol, interval, startTime, endTime, limit };
}

function canonical(params) {
  return Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&');
}

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function callBingX(params, env) {
  const all = { ...params, timestamp: Date.now() };
  const qs = canonical(all);
  const signature = await hmacHex(env.BINGX_API_SECRET, qs);
  const query = `${qs}&signature=${signature}`;
  let last = null;
  for (const base of BASES) {
    try {
      const r = await fetch(`${base}${PATH}?${query}`, {
        headers: {
          'X-BX-APIKEY': env.BINGX_API_KEY,
          'X-SOURCE-KEY': 'BX-AI-SKILL',
        },
      });
      const text = await r.text();
      let j;
      try { j = JSON.parse(text); } catch { throw new Error(`Invalid BingX JSON (${r.status})`); }
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${j?.msg || text.slice(0,160)}`);
      if (Number(j?.code) !== 0) throw new Error(`BingX ${j?.code}: ${j?.msg || 'API error'}`);
      return j;
    } catch (e) { last = e; }
  }
  throw last || new Error('BingX unavailable');
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = env.ALLOWED_ORIGIN || '*';
    const headers = corsHeaders(origin, allowed);
    if (request.method === 'OPTIONS') return new Response('', { status: 204, headers });
    if (request.method !== 'GET') return new Response(JSON.stringify({code:-1,msg:'GET only'}), {status:405,headers:{...headers,'Content-Type':'application/json'}});
    if (!env.BINGX_API_KEY || !env.BINGX_API_SECRET) return new Response(JSON.stringify({code:-1,msg:'Worker secrets are not configured'}), {status:500,headers:{...headers,'Content-Type':'application/json'}});
    try {
      const url = new URL(request.url);
      const params = validate(url.searchParams);
      const j = await callBingX(params, env);
      return new Response(JSON.stringify(j), {status:200,headers:{...headers,'Content-Type':'application/json'}});
    } catch (e) {
      return new Response(JSON.stringify({code:-1,msg:e?.message || 'Proxy error'}), {status:502,headers:{...headers,'Content-Type':'application/json'}});
    }
  }
};
