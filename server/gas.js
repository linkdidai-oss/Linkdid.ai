// One litre = 86,400,000 integer units. Free burns 24 units/ms;
// purchased gas burns 1 unit/ms. Both tanks drain independently while nonempty.
const LITRE=86400000;
function tankView(t,now){const dt=Math.max(0,now-(t?.updated??now)),free=Math.max(0,(t?.free||0)-dt*24)/LITRE,paid=Math.max(0,(t?.paid||0)-dt)/LITRE;return {free,paid,total:free+paid,progress:t?.progress||0,sequence:t?.sequence||0};}
async function gasBoard(db,now){return (await db.prepare(`SELECT p.id,p.name,p.headline,p.url,p.category,p.location,p.photo,p.created,g.updated AS activityAt,(SELECT COUNT(*) FROM metrics m WHERE m.profile=p.id AND m.kind='click') AS clicks,
 MAX(0,g.free-MAX(0,?-g.updated)*24)/86400000.0 AS free,
 MAX(0,g.paid-MAX(0,?-g.updated))/86400000.0 AS paid
 FROM gas_tanks g JOIN profiles p ON p.id=g.profile
 WHERE g.free>MAX(0,?-g.updated)*24 OR g.paid>MAX(0,?-g.updated)
 ORDER BY (MAX(0,g.free-MAX(0,?-g.updated)*24)+MAX(0,g.paid-MAX(0,?-g.updated))) DESC,p.created,p.id`).bind(now,now,now,now,now,now).all()).results.map((p,i)=>({...p,total:p.free+p.paid,rank:i+1}));}
async function gasRoutes(request,env,path,method){
 if(path==='/api/me'&&method==='GET'){const u=user(request);return json({user:u?{email:u.email}:null,admin:!!u&&!!env.ADMIN_USER_ID&&u.id===env.ADMIN_USER_ID,mode:'gas',payments:paymentConfig(env),linkedin:false});}
 if(path==='/api/claim'||path==='/api/bid')return json({error:'Use the pump to earn gas. Ranking now follows your remaining gas balance.'},410);
 const now=Date.now();
 if(path==='/api/bootstrap'&&method==='GET'){
  const u=user(request),db=database(env);
  const [profiles,stats,accountResponse]=await Promise.all([gasBoard(db,now),db.prepare("SELECT (SELECT COUNT(*) FROM profiles) AS profiles,(SELECT COUNT(*) FROM metrics WHERE kind='click') AS clicks,(SELECT COUNT(*) FROM metrics WHERE kind='view') AS views").first(),u?gasRoutes(request,env,'/api/account','GET'):null]);
  return json({session:{user:u?{email:u.email}:null,admin:!!u&&!!env.ADMIN_USER_ID&&u.id===env.ADMIN_USER_ID,mode:'gas',payments:paymentConfig(env),linkedin:false},profiles,stats,account:accountResponse?await accountResponse.json():null,serverNow:now});
 }
 if(path==='/api/profiles'&&method==='GET'){const db=database(env),profiles=await gasBoard(db,now),stats=await db.prepare("SELECT (SELECT COUNT(*) FROM profiles) AS profiles,(SELECT COUNT(*) FROM metrics WHERE kind='click') AS clicks,(SELECT COUNT(*) FROM metrics WHERE kind='view') AS views").first();return json({profiles,stats,serverNow:now,mode:'gas'});}
 if(path==='/api/account'&&method==='GET'){
  const u=requireUser(request),db=database(env),p=await mine(db,u.id),notifications=(await db.prepare('SELECT id,message,created,read FROM notifications WHERE owner=? ORDER BY created DESC LIMIT 100').bind(u.id).all()).results;
  if(!p)return json({profile:null,gas:tankView(null,now),rank:null,history:[],notifications,stats:{views:0,clicks:0},serverNow:now});
  const t=await db.prepare('SELECT * FROM gas_tanks WHERE profile=?').bind(p.id).first(),board=await gasBoard(db,now),stats=(await db.prepare('SELECT kind,COUNT(*) AS total FROM metrics WHERE profile=? GROUP BY kind').bind(p.id).all()).results;
  return json({profile:{...p,owner:undefined},gas:tankView(t,now),rank:board.find(x=>x.id===p.id)?.rank||null,history:[],notifications,stats:{views:stats.find(x=>x.kind==='view')?.total||0,clicks:stats.find(x=>x.kind==='click')?.total||0},serverNow:now});
 }
 if(path==='/api/gas/start'&&method==='POST'){
  const u=requireUser(request),db=database(env),p=await mine(db,u.id);if(!p)fail('Save your profile before pumping.');
  const id=crypto.randomUUID();await db.batch([db.prepare('INSERT OR IGNORE INTO gas_tanks (profile,updated) VALUES (?,?)').bind(p.id,now),db.prepare('UPDATE gas_tanks SET session=?,pulse=?,sequence=0 WHERE profile=?').bind(id,now,p.id)]);
  return json({session:id,gas:tankView(await db.prepare('SELECT * FROM gas_tanks WHERE profile=?').bind(p.id).first(),now),serverNow:now});
 }
 if(path==='/api/gas/pulse'&&method==='POST'){
  const u=requireUser(request),db=database(env),p=await mine(db,u.id);if(!p)fail('Save your profile first.');const b=await input(request);
  const t=await db.prepare('SELECT * FROM gas_tanks WHERE profile=?').bind(p.id).first();if(!t||t.session!==b.session)fail('This pump session ended. Tap again to start a new one.',409);
  if(!Number.isSafeInteger(b.sequence)||b.sequence<1)fail('Invalid pump sequence.');
  if(t.pulse<=0)return json({gas:tankView(t,now),earned:0,stopped:true,complete:t.pulse===-1,serverNow:now});
  if(b.heldMs!==undefined&&(!Number.isSafeInteger(b.heldMs)||b.heldMs<0||b.heldMs>3000))fail('Invalid hold duration.');
  if(b.stop!==undefined&&typeof b.stop!=='boolean')fail('Invalid pump state.');
  if(b.sequence<=t.sequence)return json({gas:tankView(t,now),earned:0,serverNow:now});
  if(b.sequence!==t.sequence+1)fail('Pump needs to reconnect. Tap again.',409);
  const gap=Math.max(0,now-t.pulse),elapsed=b.heldMs!==undefined?(gap<=5000?Math.min(gap,b.heldMs,3000):0):(gap>=1000&&gap<=5000?Math.min(gap,3000):0),progress=t.progress+elapsed,earned=progress>=60000?1:0;
  const stopped=earned>0||b.stop===true,nextPulse=earned>0?-1:b.stop===true?0:now;
  // Compare-and-swap prevents parallel tabs or replayed pulses from minting twice.
  await db.prepare(`UPDATE gas_tanks SET free=MAX(0,free-MAX(0,?-updated)*24)+?,paid=MAX(0,paid-MAX(0,?-updated)),updated=MAX(updated,?),progress=?,pulse=?,sequence=? WHERE profile=? AND session=? AND sequence=?`).bind(now,earned*LITRE,now,now,earned?0:progress,nextPulse,b.sequence,p.id,b.session,t.sequence).run();
  return json({gas:tankView(await db.prepare('SELECT * FROM gas_tanks WHERE profile=?').bind(p.id).first(),now),earned,stopped,complete:earned>0,serverNow:now});
 }
 const m=path.match(/^\/api\/profile\/([0-9a-f-]{36})$/i);if(m&&method==='GET'){
  const db=database(env),p=await db.prepare('SELECT id,name,headline,url,category,location,photo,created FROM profiles WHERE id=?').bind(m[1]).first();if(!p)fail('Profile not found.',404);
  return json({profile:p,gas:tankView(await db.prepare('SELECT * FROM gas_tanks WHERE profile=?').bind(p.id).first(),now),rank:(await gasBoard(db,now)).find(x=>x.id===p.id)?.rank||null,serverNow:now});
 }
 return null;
}
