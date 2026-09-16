import {linkedProject,backendURL} from '../portable/supabase-project.mjs';
// Vercel is a same-origin gateway only. Database/auth/storage run in Supabase.
export default {async fetch(request){
 try{
  const url=new URL(request.url),routed=url.searchParams.get('__path');
  if(routed){if(!/^\/(api|photos|go)\//.test(routed))return new Response('Not found',{status:404});url.pathname=routed;url.searchParams.delete('__path')}
  if(!/^\/(api|photos|go)\//.test(url.pathname))return new Response('Not found',{status:404});
  if(!['GET','HEAD','POST','OPTIONS'].includes(request.method))return new Response('Method not allowed',{status:405});
  if(!['GET','HEAD','OPTIONS'].includes(request.method)&&request.headers.get('origin')!==url.origin)return Response.json({error:'This action must be made from Linkdid.'},{status:403});
  if(url.pathname==='/api/auth-config'&&request.method==='GET')return Response.json(linkedProject,{headers:{'cache-control':'no-store'}});
  if(Number(request.headers.get('content-length')||0)>2100000)return Response.json({error:'File too large.'},{status:413});
  const headers=new Headers({apikey:linkedProject.key});
  for(const name of ['authorization','content-type','origin']){const value=request.headers.get(name);if(value)headers.set(name,value)}
  const response=await fetch(backendURL+url.pathname+url.search,{method:request.method,headers,body:['GET','HEAD'].includes(request.method)?undefined:request.body,duplex:'half',redirect:'manual',signal:AbortSignal.timeout(25000)});
  const output=new Headers(response.headers);output.delete('content-encoding');output.delete('content-length');output.set('cache-control','no-store');
  return new Response(response.body,{status:response.status,headers:output});
 }catch{return Response.json({error:'The service is temporarily unavailable. Please try again.'},{status:503,headers:{'cache-control':'no-store'}})}
}};
