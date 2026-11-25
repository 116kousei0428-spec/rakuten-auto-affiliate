import {test} from "node:test";
import assert from "node:assert/strict";
import {selectWithJoker} from "../joker-strategy.js";
test("selects only an actual supplied product",async()=>{const pool=[{name:"A",price:10},{name:"B",price:20}];const env={JOKER_STRATEGY_TOKEN:"test",JOKER_STRATEGY:{fetch:async(url,init)=>{assert.equal(init.headers.Authorization,"Bearer test");return Response.json({index:1,reason:"比較結果"})}}};assert.equal((await selectWithJoker(env,pool)).product,pool[1]);env.JOKER_STRATEGY.fetch=async()=>Response.json({index:9,reason:"invalid"});await assert.rejects(()=>selectWithJoker(env,pool),/INVALID/);await assert.rejects(()=>selectWithJoker({},pool),/NOT_CONNECTED/)});
