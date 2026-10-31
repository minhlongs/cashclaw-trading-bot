import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
const base=process.env.PR35_BASE_URL??'http://127.0.0.1:8787',config=process.env.PR35_WRANGLER_CONFIG??'.wrangler/pr35-local.jsonc',persist=process.env.PR35_D1_PERSIST??'.wrangler/verification/pr35-d1-worker';
const database=process.env.PR35_D1_NAME??'pr35-isolated-local';
const resultsFile=process.env.PR35_RESULTS_FILE??'.wrangler/verification/pr35-worker-runtime-results.json';
const restartResultsFile=process.env.PR35_RESTART_RESULTS_FILE??'.wrangler/verification/pr35-worker-restart-results.json';
assert.ok(['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname),'Refusing to send synthetic test traffic to a non-loopback host');
const state=JSON.parse(readFileSync(resultsFile,'utf8'));
const secret=readFileSync(process.env.PR35_SECRET_FILE??'.wrangler/verification/pr35-worker.dev.vars','utf8').match(/^NOWPAYMENTS_IPN_SECRET=(.+)$/m)?.[1];
assert.ok(secret,'ephemeral local callback secret must exist');
const checks=[];function record(name,details={}){checks.push({name,...details});console.log(`PASS ${name}`)}
function query(sql){const r=spawnSync('npx',['wrangler','d1','execute',database,'--config',config,'--local','--persist-to',persist,'--command',sql,'--json'],{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);return JSON.parse(r.stdout).flatMap(x=>x.results??[])}
async function req(path,{method='GET',cookie,headers={},body}={}){const r=await fetch(base+path,{method,headers:{...(cookie?{cookie}:{}),...(body!==undefined?{'content-type':'application/json'}:{}),...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})});const text=await r.text();let data;try{data=JSON.parse(text)}catch{}return{status:r.status,text,data,headers:r.headers}}
async function login(email,passcode){const r=await req('/api/auth/login',{method:'POST',body:{email,passcode}});assert.equal(r.status,200);return r.headers.getSetCookie().map(x=>x.split(';')[0]).find(x=>x.startsWith('session_id='))}
const health=await req('/api/health');assert.equal(health.status,200);assert.equal(health.data.checks.db,'ok');
const a=await login('pr35-a@example.test',process.env.PR35_USER_A_PASSCODE??'Temporary-A-Only-2026');const b=await login('pr35-b@example.test',process.env.PR35_USER_B_PASSCODE??'Temporary-B-Only-2026');
const opsId=state.operationsItemId,botId=state.winningBotId;
const opsA=await req('/api/ops/work-items',{cookie:a});const opsB=await req('/api/ops/work-items',{cookie:b});
const item=opsA.data.items.find(x=>x.id===opsId);assert.ok(item);assert.equal(item.version,2);assert.ok(!opsB.data.items.some(x=>x.id===opsId));
const history=await req(`/api/ops/work-items/${opsId}`,{cookie:a});assert.equal(history.status,200);assert.equal(history.data.events.length,3);
const botsA=await req('/api/bots',{cookie:a});const botsB=await req('/api/bots',{cookie:b});assert.equal(botsA.status,200);assert.equal(botsB.status,200);assert.ok(botsA.data.data.some(x=>x.id===botId));assert.equal(botsB.data.data.length,0);
const aEnt=await req('/api/ee/billing/nowpayments-ipn?workspaceId=personal%3Apr35-user-a',{cookie:a});const bEnt=await req('/api/ee/billing/nowpayments-ipn?workspaceId=personal%3Apr35-user-b',{cookie:b});assert.equal(aEnt.data.tier,'BASIC');assert.equal(bEnt.data.tier,'ENTERPRISE');
const botRows=query("SELECT id,status,workspace_id FROM bots WHERE user_id IN ('pr35-user-a','pr35-user-b')");assert.equal(botRows.length,1);
const reserved=query("SELECT COUNT(*) AS n FROM saas_bot_create_reservations WHERE status='reserved'")[0].n;assert.equal(reserved,0);
record('restart retained work item/history, exactly one persisted PAPER bot, workspace isolation, empty reservation set and entitlement readback',{itemVersion:item.version,historyEvents:history.data.events.length,persistedBots:botRows.length,reserved});
const orderId=state.syntheticOrderIds[0];const p={payment_id:'pr35-payment-seq-a',payment_status:'finished',order_id:orderId,price_amount:29,price_currency:'USD',pay_amount:0.0005,pay_currency:'BTC'};
const canonical=JSON.stringify(Object.fromEntries(Object.entries(p).sort(([x],[y])=>x.localeCompare(y))));const signature=createHmac('sha512',secret).update(canonical).digest('hex');
const duplicate=await req('/api/ee/billing/nowpayments-ipn',{method:'POST',headers:{'x-nowpayments-sig':signature},body:p});assert.equal(duplicate.status,200);assert.equal(duplicate.data.idempotentReplay,true);assert.equal(duplicate.data.activated,false);assert.equal(duplicate.data.paymentStatus,'refunded');
const order=query(`SELECT status,provider_payment_id FROM saas_payment_orders WHERE order_id='${orderId}'`)[0];assert.equal(order.status,'refunded');
record('after restart same signed callback is an idempotent replay; refunded order remains terminal',{status:duplicate.data.paymentStatus,replay:duplicate.data.idempotentReplay});
const output={generatedAt:new Date().toISOString(),check:'restart/readback after terminating and relaunching local OpenNext Worker',checks};writeFileSync(restartResultsFile,JSON.stringify(output,null,2));
