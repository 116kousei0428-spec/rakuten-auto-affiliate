// Cloudflare Workers entry point. Reuse the Pages-compatible API implementation
// while serving ONLY ./public as static assets.
import { onRequest as handleApi } from '../functions/api/[[path]].js';

export default {
  async fetch(request, env, context) {
    const pathname = new URL(request.url).pathname;
    if (pathname.startsWith('/api/')) {
      return handleApi({
        request,
        env,
        waitUntil: context.waitUntil.bind(context)
      });
    }
    return env.ASSETS.fetch(request);
  }
};
