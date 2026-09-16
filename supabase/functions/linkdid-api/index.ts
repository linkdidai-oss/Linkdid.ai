import postgres from 'npm:postgres@3.4.7';
import {createClient} from 'npm:@supabase/supabase-js@2.116.0';
import worker from './worker.mjs';
import {postgresAdapter} from './postgres-adapter.mjs';
import {bucketAdapter,verifiedRequest} from './adapters.mjs';
const origins=new Set(['https://linkdid-ai.vercel.app','https://linkdid.ai','https://www.linkdid.ai']);
const sbURL=Deno.env.get('SUPABASE_URL')!;
const sbKey=Deno.env.get('SUPABASE_ANON_KEY')!;
const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const auth=createClient(sbURL,sbKey,{auth:{persistSession:false,autoRefreshToken:false}}).auth;
const storage=createClient(sbURL,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}}).storage;
let database;
function getDatabase(){
 if(!database){const client=postgres(Deno.env.get('SUPABASE_DB_URL')!,{prepare:false,max:1,idle_timeout:20,connect_timeout:10,types:{numeric:{to:20,from:[20,1700],serialize:String,parse:Number}}});database=postgresAdapter(client)}
 return database;
}
Deno.serve(async request=>{
 const origin=request.headers.get('origin'),url=new URL(request.url);
 const cors=origin&&origins.has(origin)?{'access-control-allow-origin':origin,'access-control-allow-headers':'authorization, apikey, content-type, x-client-info','access-control-allow-methods':'GET, HEAD, POST, OPTIONS','vary':'Origin'}:{'vary':'Origin'};
 const respond=response=>{const headers=new Headers(response.headers);for(const [k,v] of Object.entries(cors))headers.set(k,v);headers.set('cache-control','no-store');return new Response(response.body,{status:response.status,headers})};
 try{
  if(origin&&!origins.has(origin))return respond(Response.json({error:'Origin not allowed.'},{status:403}));
  if(request.method==='OPTIONS')return respond(new Response(null,{status:204}));
  let path=url.pathname.replace(/^\/functions\/v1\/linkdid-api/,'').replace(/^\/linkdid-api/,'')||'/';
  if(!/^\/(api|photos|go)\//.test(path))return respond(Response.json({error:'Not found.'},{status:404}));
  if(Number(request.headers.get('content-length')||0)>2100000)return respond(Response.json({error:'File too large.'},{status:413}));
  const headers=new Headers(request.headers);
  // The Worker enforces same-origin writes. Validate actual CORS origin above,
  // then adapt the trusted server request to the worker's internal URL.
  const internal=new URL(path+url.search,'https://linkdid.internal');
  headers.set('origin',internal.origin);
  const adapted=new Request(internal,{method:request.method,headers,body:['GET','HEAD'].includes(request.method)?undefined:request.body,duplex:'half'});
  // Always strip spoofed identity headers and verify Supabase JWTs server-side.
  const verified=await verifiedRequest(adapted,auth);
  const env={DB:getDatabase(),BUCKET:bucketAdapter(storage,'profile-photos'),ADMIN_USER_ID:Deno.env.get('ADMIN_USER_ID'),CRYPTO_PAYMENTS_ENABLED:Deno.env.get('CRYPTO_PAYMENTS_ENABLED'),NOWPAYMENTS_API_KEY:Deno.env.get('NOWPAYMENTS_API_KEY'),PURCHASE_TERMS_URL:Deno.env.get('PURCHASE_TERMS_URL')};
  return respond(await worker.fetch(verified,env));
 }catch(error){console.error('Linkdid API',error.code||error.status||'internal_error');return respond(Response.json({error:error.status?error.message:'The service is temporarily unavailable.'},{status:error.status||503}))}
});
