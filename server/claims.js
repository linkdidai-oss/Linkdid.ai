const DAY=86400000;
const activeClaimsSQL=`SELECT p.id,p.name,p.headline,p.url,p.category,p.location,p.photo,p.created,c.id AS sequence,c.started,c.expires,c.streak FROM claims c JOIN profiles p ON p.id=c.profile WHERE c.expires>? ORDER BY c.id ASC`;
async function freeRoutes(request,env,path,method){
 if(path==='/api/bid'&&method==='POST')return json({error:'Bidding has been replaced by free 24-hour claims.'},410);
 if(path==='/api/crypto/orders'&&method==='POST')return json({error:'Linkdid is free. New paid placements are disabled.'},410);
 if(path==='/api/crypto/config')return json({enabled:false,currencies:[],terms:null,provider:null});
 if(path==='/api/me'&&method==='GET'){const u=user(request);return json({user:u?{email:u.email}:null,admin:!!u&&!!env.ADMIN_USER_ID&&u.id===env.ADMIN_USER_ID,mode:'free',payments:false,linkedin:false});}
 const now=Date.now();
 if(path==='/api/profiles'&&method==='GET'){const rows=(await database(env).prepare(activeClaimsSQL).bind(now).all()).results;return json({profiles:rows.map((p,i)=>({...p,rank:i+1})),serverNow:now,mode:'free'});}
 if(path==='/api/account'&&method==='GET'){
  const u=requireUser(request),db=database(env),p=await mine(db,u.id);
  const notifications=(await db.prepare('SELECT id,message,created,read FROM notifications WHERE owner=? ORDER BY created DESC LIMIT 100').bind(u.id).all()).results;
  if(!p)return json({profile:null,claim:null,history:[],notifications,stats:{views:0,clicks:0},rank:null,serverNow:now});
  const history=(await db.prepare('SELECT id,started,expires,streak FROM claims WHERE profile=? ORDER BY id DESC LIMIT 30').bind(p.id).all()).results;
  const latest=history[0]||null,claim=latest?.expires>now?latest:null;
  const before=claim?await db.prepare('SELECT COUNT(*) AS n FROM claims WHERE expires>? AND id<?').bind(now,claim.id).first():null;
  const stats=(await db.prepare('SELECT kind,COUNT(*) AS total FROM metrics WHERE profile=? GROUP BY kind').bind(p.id).all()).results;
  return json({profile:{...p,owner:undefined},claim,history,notifications,rank:claim?before.n+1:null,serverNow:now,stats:{views:stats.find(x=>x.kind==='view')?.total||0,clicks:stats.find(x=>x.kind==='click')?.total||0}});
 }
 if(path==='/api/claim'&&method==='POST'){
  const u=requireUser(request),db=database(env),p=await mine(db,u.id);if(!p)fail('Save your profile first, then fill your gas.');
  const b=await input(request);if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(b.id||''))fail('Invalid claim request.');
  const existing=await db.prepare('SELECT profile FROM claims WHERE request=?').bind(b.id).first();if(existing&&existing.profile!==p.id)fail('Claim request already used.',409);
  // One SQLite statement serializes the eligibility check and insertion. Repeated
  // clicks cannot extend an active claim; monotonically increasing IDs break ties.
  await db.prepare(`INSERT OR IGNORE INTO claims (request,profile,started,expires,streak)
   SELECT ?,?,?,?,COALESCE((SELECT CASE WHEN expires>=? THEN streak+1 ELSE 1 END FROM claims WHERE profile=? ORDER BY id DESC LIMIT 1),1)
   WHERE NOT EXISTS (SELECT 1 FROM claims WHERE profile=? AND expires>?)`).bind(b.id,p.id,now,now+DAY,now-DAY,p.id,p.id,now).run();
  const c=await db.prepare('SELECT id,started,expires,streak FROM claims WHERE profile=? ORDER BY id DESC LIMIT 1').bind(p.id).first();
  return json({claim:c,active:c.expires>now,serverNow:now});
 }
 const match=path.match(/^\/api\/profile\/([0-9a-f-]{36})$/i);
 if(match&&method==='GET'){
  const db=database(env),p=await db.prepare('SELECT id,name,headline,url,category,location,photo,created FROM profiles WHERE id=?').bind(match[1]).first();if(!p)fail('Profile not found.',404);
  const c=await db.prepare('SELECT id,started,expires,streak FROM claims WHERE profile=? AND expires>? ORDER BY id DESC LIMIT 1').bind(p.id,now).first();
  const rank=c?(await db.prepare('SELECT COUNT(*) AS n FROM claims WHERE expires>? AND id<?').bind(now,c.id).first()).n+1:null;
  return json({profile:p,claim:c,rank,serverNow:now});
 }
 return null;
}
