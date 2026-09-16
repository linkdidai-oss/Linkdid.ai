// Preserve the existing SQLite queries and atomic D1-style batch semantics.
export function d1Adapter(client){
 const normalize=r=>({results:r.rows.map(row=>Object.fromEntries(Object.entries(row))),success:true,meta:{changes:r.rowsAffected}});
 const prepare=(sql,args=[])=>({sql,args,bind(...values){return prepare(sql,values)},async first(column){const row=normalize(await client.execute({sql,args})).results[0];return column?row?.[column]??null:row??null},async all(){return normalize(await client.execute({sql,args}))},async run(){return normalize(await client.execute({sql,args}))}});
 return {prepare,batch:async statements=>(await client.batch(statements.map(({sql,args})=>({sql,args})),'write')).map(normalize)};
}
export function bucketAdapter(storage,bucket='profile-photos'){
 return {async put(key,bytes,options){const {error}=await storage.from(bucket).upload(key,bytes,{contentType:options.httpMetadata.contentType,upsert:true});if(error)throw error},async get(key){const {data,error}=await storage.from(bucket).download(key);if(error){if(String(error.statusCode)==='404')return null;throw error}return {body:data.stream(),httpMetadata:{contentType:data.type}}}};
}
export async function verifiedRequest(request,auth){
 const headers=new Headers(request.headers);
 for(const name of [...headers.keys()])if(name.startsWith('oai-')||name==='x-dispatched-app')headers.delete(name);
 const token=request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
 if(token){const {data,error}=await auth.getUser(token);if(error||!data?.user)throw Object.assign(Error('Your session expired. Please sign in again.'),{status:401});headers.set('oai-authenticated-user-id','supabase:'+data.user.id);headers.set('oai-authenticated-user-email',data.user.email||'')}
 return new Request(request,{headers});
}
