// Cloudflare Workers entrypoint. Static files are served using the ASSETS binding.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') {
      return Response.json({ ok: true, service: 'rakuten-affiliate', mode: 'demo' }, {
        headers: { 'cache-control': 'no-store' }
      });
    }
    if (!env.ASSETS) return new Response('Static ASSETS binding is not configured', { status: 503 });
    return env.ASSETS.fetch(request);
  }
};
