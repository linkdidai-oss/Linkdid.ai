import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import worker from '../dist/server/index.js';
function ui(path='/claim',search='') {
  const c=createContext({document:{visibilityState:'visible',querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){}},location:{pathname:path,search,href:''},performance:{now:()=>10000},Date,crypto,URL,URLSearchParams,setInterval(){},setTimeout(){},clearTimeout(){}});
  for(const f of ['free.js','gas-ui.js','claim-flow.js','directory.js'])runInContext(readFileSync(new URL('../dist/'+f,import.meta.url),'utf8'),c);
  runInContext("session={user:null};toast=()=>{};shell=html=>globalThis.rendered=html",c);
  return c;
}
test('Claim opens a separate choice screen without starting a pump or a purchase',async()=>{
  const c=ui('/');await runInContext('fill()',c);assert.equal(c.location.href,'/claim');
  c.location.pathname='/claim';await runInContext('claimPage()',c);
  assert.match(c.rendered,/Fill Gas — Free/);assert.match(c.rendered,/Purchase Gas/);
  assert.match(c.rendered,/href="\/claim\?mode=free"/);assert.match(c.rendered,/href="\/claim\?mode=purchase"/);
  assert.equal(runInContext('pumpSession',c),null);
});
test('LinkedIn link and category survive mode selection and profile setup',()=>{
  const c=ui('/claim','?profileLink=https%3A%2F%2Fwww.linkedin.com%2Fin%2Falice&specialty=Design');
  let u=new URL(runInContext("flowHref('free')",c),'https://test');
  assert.equal(u.pathname,'/claim');assert.equal(u.searchParams.get('mode'),'free');assert.equal(u.searchParams.get('profileLink'),'https://www.linkedin.com/in/alice');
  u=new URL(runInContext('flowHref(null,true)',c),'https://test');
  assert.equal(u.pathname,'/account');assert.equal(u.searchParams.get('next'),'/claim');assert.equal(u.searchParams.get('specialty'),'Design');
});
test('Free choice requires saved profile and earns no gas until server-confirmed pumping',async()=>{
  const c=ui('/claim','?mode=free');await runInContext('claimPage()',c);assert.match(c.rendered,/Sign in &amp; create profile|Sign in & create profile/);
  await runInContext('fill()',c);assert.match(c.location.href,/^\/account\?next=/);
  runInContext("session={user:{}};account={profile:{id:'mine'},gas:{free:0,paid:0,progress:0}};api=async()=>({session:'session',gas:{free:0,paid:0,total:0,progress:0,sequence:0},serverNow:Date.now()})",c);
  await runInContext('fill()',c);assert.equal(runInContext('pumpSession',c),'session');assert.equal(runInContext('account.gas.total',c),0);
});
test('Worker serves claim route and bundled choice assets',async()=>{
  for(const path of ['/daily','/categories','/rules','/faq','/stats','/directory.js','/directory.css','/claim','/claim?mode=free','/claim?mode=purchase','/claim-flow.js','/claim-flow.css']){
    const r=await worker.fetch(new Request('https://test'+path),{},{});
    assert.equal(r.status,200,path);const body=await r.text();assert.ok(body.length>100);
    if(path.startsWith('/claim?')||path==='/claim')assert.match(body,/assets\/app\.[a-f0-9]+\.js/);
  }
});
test('full category list, legacy mappings and UTC Today filtering are consistent',()=>{
  const c=ui();runInContext("serverBase=Date.parse('2026-09-11T12:00:00Z');clockBase=performance.now();peopleAt=serverBase;people=[{id:'a',name:'A',category:'SEO',created:1,activityAt:Date.parse('2026-09-10T23:59:59Z'),free:0,paid:10},{id:'b',name:'B',category:'Development',created:2,activityAt:Date.parse('2026-09-11T00:00:00Z'),free:0,paid:5}];",c);
  assert.equal(runInContext('cats.length',c),29);
  assert.match(runInContext('categoryRail()',c),/Real Estate/);
  assert.match(runInContext('categoryRail()',c),/Leaderboards/);
  assert.equal(runInContext('dailyPeople().length',c),1);
  runInContext("boardPeriod='today';filter='Developer'",c);
  assert.equal(runInContext('directoryList()[0].id',c),'b');
  assert.equal(runInContext('directoryList()[0].rank',c),1);
});
