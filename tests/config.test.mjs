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
test('anonymous session endpoint works without database or photo-storage credentials',async()=>{
 const {default:handler}=await import('../api/handler.js');
 const r=await handler.fetch(new Request('https://test/api/me'));
 assert.equal(r.status,200);assert.equal((await r.json()).user,null);
 const privateRoute=await handler.fetch(new Request('https://test/api/account'));
 assert.equal(privateRoute.status,401);
 const configResponse=await handler.fetch(new Request('https://test/api/auth-config'));
 assert.equal(configResponse.status,200);assert.deepEqual(Object.keys(await configResponse.json()).sort(),['key','url']);
});
