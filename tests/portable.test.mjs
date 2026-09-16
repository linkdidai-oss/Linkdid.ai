import test from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@libsql/client';
import {readFileSync} from 'node:fs';
import {d1Adapter,verifiedRequest} from '../portable/adapters.mjs';
import worker from '../portable/generated-worker.mjs';
test('portable SQLite adapter preserves atomic batches and the gas/profile flow',async()=>{
 const client=createClient({url:'file::memory:'}),DB=d1Adapter(client);
 try{
  const journal=JSON.parse(readFileSync('drizzle/meta/_journal.json'));
  for(const entry of journal.entries)await client.batch(readFileSync('drizzle/'+entry.tag+'.sql','utf8').split('--> statement-breakpoint').filter(s=>s.trim()),'write');
  const auth={getUser:async()=>({data:{user:{id:'alice',email:'alice@example.test'}}})};
  const invoke=async(path,body)=>worker.fetch(await verifiedRequest(new Request('https://test'+path,{method:body?'POST':'GET',headers:{authorization:'Bearer verified',origin:'https://test','content-type':'application/json'},body:body?JSON.stringify(body):undefined}),auth),{DB});
  assert.equal((await invoke('/api/profile',{name:'Alice',headline:'Developer',url:'https://www.linkedin.com/in/alice',category:'Developer'})).status,200);
  const state=await (await invoke('/api/bootstrap')).json();assert.equal(state.account.profile.name,'Alice');assert.equal(state.session.user.email,'alice@example.test');
  const start=await (await invoke('/api/gas/start',{})).json();assert.ok(start.session);assert.equal(start.gas.free,0);
  const id=state.account.profile.id;
  await assert.rejects(DB.batch([DB.prepare('UPDATE profiles SET name=? WHERE id=?').bind('Wrong',id),DB.prepare('INSERT INTO table_that_does_not_exist VALUES (1)')]));
  assert.equal((await DB.prepare('SELECT name FROM profiles WHERE id=?').bind(id).first()).name,'Alice');
 }finally{client.close()}
});
test('Vercel strips spoofed dispatcher identities and rejects invalid access tokens',async()=>{
 const request=new Request('https://test/api/account',{headers:{'oai-authenticated-user-id':'victim','oai-authenticated-user-email':'victim@example.test','x-dispatched-app':'site---configure-your-sites-project'}});
 const clean=await verifiedRequest(request,{getUser:()=>{throw Error('must not verify missing token')}});assert.equal(clean.headers.has('oai-authenticated-user-id'),false);assert.equal(clean.headers.has('x-dispatched-app'),false);
 await assert.rejects(verifiedRequest(new Request('https://test/api/account',{headers:{authorization:'Bearer invalid'}}),{getUser:async()=>({data:{user:null},error:Error('invalid')})}),error=>error.status===401);
});
