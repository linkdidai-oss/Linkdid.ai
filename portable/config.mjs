// Normalize names emitted by Supabase's Vercel integrations.
export function publicConfig(env){
 const url=env.SUPABASE_URL||env.NEXT_PUBLIC_SUPABASE_URL||'';
 const key=env.SUPABASE_PUBLISHABLE_KEY||env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_ANON_KEY||env.NEXT_PUBLIC_SUPABASE_ANON_KEY||'';
 // Never serialize a secret/service-role key, even if a variable is misconfigured.
 let publishable=key.startsWith('sb_publishable_');
 if(!publishable){try{publishable=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString()).role==='anon'}catch{}}
 return {url,key:publishable?key:''};
}
export function createServices(env,{createDatabase,createSupabase,d1Adapter,bucketAdapter}){
 const config=publicConfig(env),options={auth:{persistSession:false,autoRefreshToken:false}};
 let auth,db,bucket;
 const runtime={ADMIN_USER_ID:env.ADMIN_USER_ID,CRYPTO_PAYMENTS_ENABLED:env.CRYPTO_PAYMENTS_ENABLED,NOWPAYMENTS_API_KEY:env.NOWPAYMENTS_API_KEY,PURCHASE_TERMS_URL:env.PURCHASE_TERMS_URL};
 Object.defineProperty(runtime,'DB',{get(){
  if(!env.TURSO_DATABASE_URL||!env.TURSO_AUTH_TOKEN)throw Object.assign(Error('The database is not connected. Please try again later.'),{status:503});
  return db||(db=d1Adapter(createDatabase({url:env.TURSO_DATABASE_URL,authToken:env.TURSO_AUTH_TOKEN})));
 }});
 Object.defineProperty(runtime,'BUCKET',{get(){
  const secret=env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY;
  if(!config.url||!secret)return undefined;
  return bucket||(bucket=bucketAdapter(createSupabase(config.url,secret,options).storage,env.SUPABASE_PHOTO_BUCKET||'profile-photos'));
 }});
 return {config,env:runtime,get auth(){
  if(!config.url||!config.key)throw Object.assign(Error('Sign-in is temporarily unavailable. Please try again later.'),{status:503});
  return auth||(auth=createSupabase(config.url,config.key,options).auth);
 }};
}
