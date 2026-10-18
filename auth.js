/* Zero trust: every administrative request must contain a fully verified Access JWT. */
import { fail } from './shared.js';
let cache = { at:0, keys:[] };
function decodeB64Url(s) {
  const v = s.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(v + '='.repeat((4 - v.length % 4) % 4)), c => c.charCodeAt(0));
}
export async function authenticate(request, env) {
  const team = String(env.ACCESS_TEAM_DOMAIN || '').trim().replace(/\/$/, '');
  const aud = String(env.ACCESS_AUD || '').trim();
  const email = String(env.ADMIN_EMAIL || '').trim().toLowerCase();
  if (!team.startsWith('https://') || !team.endsWith('.cloudflareaccess.com') || !aud || !email) return null;
  const jwt = request.headers.get('Cf-Access-Jwt-Assertion') || '';
  const pieces = jwt.split('.');
  if (pieces.length !== 3 || jwt.length > 10000) return null;
  try {
    const header = JSON.parse(new TextDecoder().decode(decodeB64Url(pieces[0])));
    const payload = JSON.parse(new TextDecoder().decode(decodeB64Url(pieces[1])));
    const now = Math.floor(Date.now()/1000);
    if (header.alg !== 'RS256' || !header.kid || payload.iss !== team ||
      !([].concat(payload.aud || [])).includes(aud) || payload.exp <= now ||
      (payload.nbf && payload.nbf > now) || payload.email?.toLowerCase() !== email) return null;
    if (Date.now() - cache.at > 600000) {
      const res = await fetch(`${team}/cdn-cgi/access/certs`, { signal:AbortSignal.timeout(5000) });
      if (!res.ok) return null;
      const certs = await res.json();
      cache = { at:Date.now(), keys:certs.keys || [] };
    }
    let key = cache.keys.find(k => k.kid === header.kid && k.kty === 'RSA');
    if (!key) { cache.at = 0; return null; }
    const cryptoKey = await crypto.subtle.importKey('jwk', key, { name:'RSASSA-PKCS1-v1_5', hash:'SHA-256' }, false, ['verify']);
    const data = new TextEncoder().encode(`${pieces[0]}.${pieces[1]}`);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', cryptoKey, decodeB64Url(pieces[2]), data);
    return ok ? { email } : null;
  } catch { return null; }
}
export const deny = () => fail('管理者認証が必要です。Cloudflare Accessの設定を確認してください。', 403);
