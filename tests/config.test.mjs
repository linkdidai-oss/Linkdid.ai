import test from 'node:test';
import assert from 'node:assert/strict';
import {publicConfig,createServices} from '../portable/config.mjs';
const config={NEXT_PUBLIC_SUPABASE_URL:'https://project.supabase.co',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'};
const deps={createSupabase:()=>({auth:{getUser:()=>{}},storage:{}}),createDatabase:()=>({}),d1Adapter:x=>x,bucketAdapter:x=>x};
test('Vercel public Supabase names resolve without leaking service-role keys',()=>{
 assert.deepEqual(publicConfig(config),{url:config.NEXT_PUBLIC_SUPABASE_URL,key:'sb_publishable_test'});
 assert.equal(publicConfig({...config,SUPABASE_PUBLISHABLE_KEY:'sb_secret_private'}).key,'');
 const jwt='x.'+Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')+'.x';
 assert.equal(publicConfig({...config,SUPABASE_PUBLISHABLE_KEY:jwt}).key,'');
});
test('authentication is independent of unconfigured database and photo storage',()=>{
 const s=createServices(config,deps);assert.ok(s.auth.getUser);assert.equal(s.env.BUCKET,undefined);
 assert.throws(()=>s.env.DB,e=>e.status===503);
});
test('database does not require optional Supabase storage credentials',()=>{
 const s=createServices({...config,TURSO_DATABASE_URL:'libsql://test',TURSO_AUTH_TOKEN:'test'},deps);assert.ok(s.env.DB);assert.equal(s.env.BUCKET,undefined);
});
test('gateway forwards bearer tokens but strips spoofed identity',async()=>{
 const {default:handler}=await import('../api/handler.js');
 const original=globalThis.fetch;let captured;
 globalThis.fetch=async(url,options)=>{captured={url,options};return Response.json({user:null})};
 try{
 const r=await handler.fetch(new Request('https://linkdid-ai.vercel.app/api/me',{headers:{authorization:'Bearer test','oai-authenticated-user-id':'attacker'}}));
 assert.equal(r.status,200);assert.match(captured.url,/supabase.co\/functions\/v1\/linkdid-api\/api\/me$/);
 assert.equal(captured.options.headers.get('authorization'),'Bearer test');assert.equal(captured.options.headers.get('oai-authenticated-user-id'),null);
 const blocked=await handler.fetch(new Request('https://linkdid-ai.vercel.app/api/profile',{method:'POST',headers:{origin:'https://evil.test'}}));assert.equal(blocked.status,403);
 const configResponse=await handler.fetch(new Request('https://test/api/auth-config'));
 assert.equal(configResponse.status,200);assert.deepEqual(Object.keys(await configResponse.json()).sort(),['key','url']);
 }finally{globalThis.fetch=original}
});
