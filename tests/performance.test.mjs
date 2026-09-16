import test from 'node:test';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {createContext,runInContext} from 'node:vm';
import worker from '../dist/server/index.js';
test('optimized page uses deferred cached bundles, gzip and conditional requests',async()=>{
 const page=await (await worker.fetch(new Request('https://test/'),{})).text();assert.equal((page.match(/rel="stylesheet"/g)||[]).length,1);assert.equal((page.match(/<script defer /g)||[]).length,1);assert.doesNotMatch(page,/fonts.googleapis.com/);
 const path=page.match(/src="(\/assets\/app\.[^"]+)"/)[1];const response=await worker.fetch(new Request('https://test'+path,{headers:{'accept-encoding':'gzip'}}),{});assert.equal(response.headers.get('content-encoding'),'gzip');assert.match(response.headers.get('cache-control'),/immutable/);const text=gunzipSync(Buffer.from(await response.arrayBuffer())).toString();assert.match(text,/ensurePump/);assert.doesNotMatch(text,/class HoldPump/);const cached=await worker.fetch(new Request('https://test'+path,{headers:{'if-none-match':response.headers.get('etag')}}),{});assert.equal(cached.status,304);
 const context=createContext({window:{addEventListener(){}},document:{visibilityState:'visible',querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){}},location:{pathname:'/',search:'',href:''},performance:{now:()=>1},Date,crypto,URL,URLSearchParams,setInterval(){},setTimeout(){},clearTimeout(){}});
 runInContext(text,context);assert.equal(typeof context.window.ensurePump,'function');assert.equal(runInContext('cats.length',context),29);const pumpPath=text.match(/s\.src="([^"]+)"/)?.[1];if(pumpPath){const pump=await (await worker.fetch(new Request('https://test'+pumpPath),{})).text();runInContext(pump,context);assert.equal(runInContext('typeof HoldPump',context),'function')}
});
