// Optional JOKER service binding. Never accepts an invented product or bypasses local filters.
export function jokerStrategyConfigured(env){
 return env.JOKER_STRATEGY_ENABLED==="true"&&typeof env.JOKER_STRATEGY_TOKEN==="string"&&env.JOKER_STRATEGY_TOKEN.length>=32&&typeof env.JOKER_CORE?.fetch==="function";
}
export async function selectWithJoker(env,available,context={}){
 const fallback={product:available[0],source:"local"};
 if(!fallback.product||available.length<2||!jokerStrategyConfigured(env))return fallback;
 const items=[],seen=new Set();
 for(const p of available){
  const key=String(p?.code||p?.url||"");if(!key||seen.has(key)||typeof p.name!=="string"||!p.name.trim()||p.name.length>160||!Number.isFinite(p.price)||p.price<=0)continue;
  seen.add(key);items.push(p);if(items.length===30)break;
 }
 if(items.length<2)return fallback;
 const candidates=items.map((p,index)=>({index,name:p.name,price:p.price,rank:Number.isFinite(p.rank)?p.rank:null,caption:typeof p.caption==="string"?p.caption.slice(0,240):""}));
 try{
  const request=new Request("https://joker.internal/api/strategy/product",{method:"POST",headers:{Authorization:"Bearer "+env.JOKER_STRATEGY_TOKEN,"Content-Type":"application/json"},body:JSON.stringify({candidates,context:{category:String(context.category||"").slice(0,80),trend:String(context.trend||"").slice(0,80),date:String(context.date||"").slice(0,10)}}),signal:AbortSignal.timeout(15000)});
  const r=await env.JOKER_CORE.fetch(request);
  if(!r.ok)return fallback;
  const raw=await r.text();if(raw.length>4000)return fallback;
  const decision=JSON.parse(raw);
  if(!Number.isInteger(decision.index)||decision.index<0||decision.index>=items.length||typeof decision.reason!=="string"||!decision.reason.trim()||decision.reason.length>500)return fallback;
  return {product:items[decision.index],source:"joker"};
 }catch{return fallback}
}
