// Cloudflare Worker: deploy this as your own proxy, then paste the worker URL into the app's Proxy setting.
// Example: https://your-worker.workers.dev/klines?url=<encoded-BingX-URL>
export default {
  async fetch(request) {
    const origin = new URL(request.url).origin;
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Cache-Control': 'no-store'
    };
    if (request.method === 'OPTIONS') return new Response(null,{headers:cors});
    const u = new URL(request.url);
    const target = u.searchParams.get('url');
    if (!target) return new Response(JSON.stringify({code:400,msg:'missing url'}),{status:400,headers:{...cors,'content-type':'application/json'}});
    let parsed;
    try { parsed=new URL(target); } catch { return new Response(JSON.stringify({code:400,msg:'bad url'}),{status:400,headers:{...cors,'content-type':'application/json'}}); }
    if (!['open-api.bingx.com','open-api.bingx.pro'].includes(parsed.hostname)) return new Response(JSON.stringify({code:403,msg:'host not allowed'}),{status:403,headers:{...cors,'content-type':'application/json'}});
    try {
      const r=await fetch(parsed.toString(),{headers:{'X-SOURCE-KEY':'BX-AI-SKILL','Accept':'application/json'}});
      return new Response(r.body,{status:r.status,headers:{...cors,'content-type':r.headers.get('content-type')||'application/json'}});
    } catch(e) { return new Response(JSON.stringify({code:502,msg:String(e)}),{status:502,headers:{...cors,'content-type':'application/json'}}); }
  }
};
