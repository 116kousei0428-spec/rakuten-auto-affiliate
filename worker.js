// Cloudflare Workers GitHub deployment entry point.
export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/health') {
      return Response.json({ ok: true, service: 'rakuten-affiliate', status: 'demo' }, { headers: { 'cache-control': 'no-store' } });
    }
    return env.ASSETS.fetch(request);
  }
};
