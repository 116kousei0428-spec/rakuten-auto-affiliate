// Model-selected product among verified, non-duplicate candidates. No model-supplied URL or product.
export async function selectWithJoker(env,candidates,context={}){
 if(!env.JOKER_STRATEGY?.fetch||!env.JOKER_STRATEGY_TOKEN)throw Error("JOKER_STRATEGY_NOT_CONNECTED");
 const pool=candidates.slice(0,30);
 const data=pool.map((p,index)=>({index,name:String(p.name).slice(0,160),price:p.price,rank:Number.isFinite(p.rank)?p.rank:null,caption:String(p.caption||"").slice(0,240)}));
 const res=await env.JOKER_STRATEGY.fetch("https://joker.internal/api/strategy/product",{method:"POST",headers:{"content-type":"application/json",Authorization:"Bearer "+env.JOKER_STRATEGY_TOKEN},body:JSON.stringify({candidates:data,context})});
 if(!res.ok)throw Error("JOKER_STRATEGY_HTTP_"+res.status);
 const answer=await res.json();
 if(!Number.isInteger(answer.index)||answer.index<0||answer.index>=pool.length||typeof answer.reason!=="string"||!answer.reason.trim())throw Error("JOKER_STRATEGY_INVALID");
 return {product:pool[answer.index],reason:answer.reason.slice(0,500)};
}
