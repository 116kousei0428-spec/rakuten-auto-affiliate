export function onRequestGet() {
  return Response.json({ ok: true, service: "rakuten-affiliate-starter", mode: "starter" });
}
