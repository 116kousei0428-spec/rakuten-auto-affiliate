import test from "node:test";
import assert from "node:assert/strict";
import {automationStatus} from "../automation.js";
test("daily counts use aggregate query independently from bounded display logs",async()=>{
 let query=false;
 const env={DB:{prepare(sql){return {bind(...args){this.args=args;return this},async run(){return {meta:{changes:1}}},async all(){return {results:[{slot:"past",status:"published"}]}},async first(){if(sql.includes("COUNT(CASE")){query=true;assert.equal(this.args[1],this.args[0]+"~");return {published:18,failed:2,uncertain:1,joker:7,local:3}}if(sql.includes("mix_enabled"))return {mix_enabled:1,trivia_share:50};return {enabled:1,daily_target:20}}}}}};
 const d=await automationStatus(env);assert.equal(query,true);assert.equal(d.successToday,18);assert.equal(d.jokerPublishedToday,7);assert.equal(d.localPublishedToday,3);assert.equal(d.uncertainToday,1);assert.equal(d.countScope,"all_jst_day_jobs");assert.equal(d.logs.length,1);assert.equal(d.jokerStrategyProbe.state,"not_configured");
});
