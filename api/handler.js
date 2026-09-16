import {createClient as createDatabase} from '@libsql/client/web';
import {createClient as createSupabase} from '@supabase/supabase-js';
import worker from '../portable/generated-worker.mjs';
import {d1Adapter,bucketAdapter,verifiedRequest} from '../portable/adapters.mjs';
let services;
function getServices(){
 if(services)return services;
 const e=process.env;
 for(const key of ['TURSO_DATABASE_URL','TURSO_AUTH_TOKEN','SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SUPABASE_SERVICE_ROLE_KEY'])if(!e[key])throw Object.assign(Error('The operator needs to finish database and sign-in setup.'),{status:503});
 const options={auth:{persistSession:false,autoRefreshToken:false}};
 const publicAuth=createSupabase(e.SUPABASE_URL,e.SUPABASE_PUBLISHABLE_KEY,options);
 const admin=createSupabase(e.SUPABASE_URL,e.SUPABASE_SERVICE_ROLE_KEY,options);
 services={auth:publicAuth.auth,env:{DB:d1Adapter(createDatabase({url:e.TURSO_DATABASE_URL,authToken:e.TURSO_AUTH_TOKEN})),BUCKET:bucketAdapter(admin.storage,e.SUPABASE_PHOTO_BUCKET||'profile-photos'),ADMIN_USER_ID:e.ADMIN_USER_ID,CRYPTO_PAYMENTS_ENABLED:e.CRYPTO_PAYMENTS_ENABLED,NOWPAYMENTS_API_KEY:e.NOWPAYMENTS_API_KEY,PURCHASE_TERMS_URL:e.PURCHASE_TERMS_URL}};
 return services;
}
export default {async fetch(request){
 try{
  const url=new URL(request.url),routed=url.searchParams.get('__path');
  if(routed){if(!/^\/(api|photos|go)\//.test(routed))return new Response('Not found',{status:404});url.pathname=routed;url.searchParams.delete('__path');request=new Request(url,request)}
  const s=getServices();return await worker.fetch(await verifiedRequest(request,s.auth),s.env);
 }catch(error){return Response.json({error:error.status?error.message:'The service is temporarily unavailable.'},{status:error.status||503,headers:{'cache-control':'no-store'}})}
}};
