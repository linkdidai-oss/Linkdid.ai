import {createClient as createDatabase} from '@libsql/client/web';
import {createClient as createSupabase} from '@supabase/supabase-js';
import worker from '../portable/generated-worker.mjs';
import {d1Adapter,bucketAdapter,verifiedRequest} from '../portable/adapters.mjs';
import {createServices} from '../portable/config.mjs';
function getServices(){return createServices(process.env,{createDatabase,createSupabase,d1Adapter,bucketAdapter})}
export default {async fetch(request){
 try{
  const url=new URL(request.url),routed=url.searchParams.get('__path');
  if(routed){if(!/^\/(api|photos|go)\//.test(routed))return new Response('Not found',{status:404});url.pathname=routed;url.searchParams.delete('__path');request=new Request(url,request)}
  const s=getServices();
  if(url.pathname==='/api/auth-config'&&request.method==='GET')return Response.json(s.config,{headers:{'cache-control':'no-store'}});
  const auth={getUser:token=>s.auth.getUser(token)};
  return await worker.fetch(await verifiedRequest(request,auth),s.env);
 }catch(error){return Response.json({error:error.status?error.message:'The service is temporarily unavailable.'},{status:error.status||503,headers:{'cache-control':'no-store'}})}
}};
