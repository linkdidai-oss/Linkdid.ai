import {assets} from './assets.js';
const CATEGORIES=["Leaderboards", "SEO", "Marketing", "Productivity", "Agents", "Crypto", "Other", "Developer", "Health", "Business", "Games", "Ecommerce", "Travel", "Directories", "Agencies", "AI Media", "Social", "Education", "People", "Design", "Hiring", "Domains", "Security", "Sales", "News", "Real Estate", "Writing", "Audio", "Analytics", "Development", "Founders", "Consulting"];
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})};
function database(env){if(!env.DB)fail('Storage is not available yet. Please try again later.',503);return env.DB;}
function user(request){
 const id=request.headers.get('oai-authenticated-user-id');
 const email=request.headers.get('oai-authenticated-user-email')?.trim()||'';
 if(id)return {id,email};
 // The live private Sites dispatcher currently forwards authenticated email
 // without a user ID. Accept that verified identity only on this Site's dispatch.
 // Never use a form field, query parameter, cookie, or arbitrary email header.
 const dispatched=request.headers.get('x-dispatched-app')==='site---configure-your-sites-project';
 if(dispatched&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return {id:'dispatch-email:'+email.toLowerCase(),email};
 return null;
}
function requireUser(request){const u=user(request);if(!u)fail('Sign in to continue.',401);return u;}
async function preserveLegacyIdentity(request,env){
 // Some Sites dispatch sessions now supply a stable ID, while earlier sessions
 // supplied only authenticated email. Resolve the existing account using ONLY
 // this Site's trusted dispatch headers; never claim profiles by their URL.
 if(request.headers.get('x-dispatched-app')!=='site---configure-your-sites-project'||!env.DB)return request;
 const id=request.headers.get('oai-authenticated-user-id'),email=request.headers.get('oai-authenticated-user-email')?.trim().toLowerCase();
 if(!id||!email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return request;
 const legacy='dispatch-email:'+email;
 const old=await env.DB.prepare('SELECT id FROM profiles WHERE owner=?').bind(legacy).first();
 if(!old)return request;
 const current=await env.DB.prepare('SELECT id FROM profiles WHERE owner=?').bind(id).first();
 if(current&&current.id!==old.id)fail('Two profiles are linked to this sign-in. Contact support to review them.',409);
 const headers=new Headers(request.headers);headers.set('oai-authenticated-user-id',legacy);
 return new Request(request,{headers});
}
async function input(request){if(!request.headers.get('content-type')?.startsWith('application/json'))fail('Send JSON.',415);const text=await request.text();if(text.length>12000)fail('Request too large.',413);try{return JSON.parse(text)}catch{fail('Invalid request.')}}
function field(value,max,label,optional=false){if(typeof value!=='string'||value.trim().length>max||(!optional&&!value.trim()))fail('Please check '+label+'.');return value.trim();}
function profileInput(b){let url;try{url=new URL(b.url);if(url.protocol!=='https:'||!['linkedin.com','www.linkedin.com'].includes(url.hostname)||!/^\/in\/[^/]+\/?$/.test(url.pathname)||url.username||url.password)throw Error()}catch{fail('Enter a LinkedIn profile URL such as https://www.linkedin.com/in/your-name.')}if(!CATEGORIES.includes(b.category))fail('Choose a valid category.');return {name:field(b.name,60,'your name'),headline:field(b.headline,160,'your introduction'),url:'https://www.linkedin.com'+url.pathname.replace(/\/$/,'').toLowerCase(),category:b.category,location:field(b.location??'',80,'your location',true)};}
const rankingSQL=`SELECT p.id,p.name,p.headline,p.url,p.category,p.location,p.photo,p.created,COALESCE(SUM(b.amount),0) AS bid,COALESCE(MAX(b.created),p.created) AS last_bid FROM profiles p LEFT JOIN bids b ON b.profile=p.id GROUP BY p.id ORDER BY bid DESC,p.created ASC,p.id ASC`;
async function mine(db,id){return db.prepare('SELECT * FROM profiles WHERE owner=?').bind(id).first();}
async function metric(db,p,u,kind){if(!u||p.owner===u.id)return;await db.prepare('INSERT OR IGNORE INTO metrics (id,profile,viewer,kind,day) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),p.id,u.id,kind,new Date().toISOString().slice(0,10)).run();}
export default {async fetch(request,env){try{
 const url=new URL(request.url),path=url.pathname,method=request.method;
 if(method!=='GET'&&method!=='HEAD'){if(request.headers.get('origin')!==url.origin)fail('This action must be made from Linkdid.',403);if(Number(request.headers.get('content-length')||0)>2100000)fail('File too large.',413);}
 if(path.startsWith('/api/')||path.startsWith('/go/'))request=await preserveLegacyIdentity(request,env);
 const gas=await gasRoutes(request,env,path,method);if(gas)return gas;
 const commerce=await paymentRoutes(request,env,path,method);if(commerce)return commerce;
 if(path==='/api/profiles'&&method==='GET'){
  const db=database(env);const rows=(await db.prepare(rankingSQL).all()).results;const today=new Date().toISOString().slice(0,10);const daily=(await db.prepare('SELECT profile,SUM(amount) AS total FROM bids WHERE created>=? GROUP BY profile').bind(Date.parse(today+'T00:00:00Z')).all()).results;const totals=Object.fromEntries(daily.map(b=>[b.profile,b.total]));return json({profiles:rows.map((p,i)=>({...p,rank:i+1,today:totals[p.id]||0})),mode:'sandbox'});
 }
 if(path==='/api/account'&&method==='GET'){
  const u=requireUser(request),db=database(env),p=await mine(db,u.id);const notifications=(await db.prepare('SELECT id,message,created,read FROM notifications WHERE owner=? ORDER BY created DESC LIMIT 100').bind(u.id).all()).results;
  if(!p)return json({profile:null,bids:[],notifications,stats:{views:0,clicks:0},rank:null});
  const bids=(await db.prepare('SELECT id,amount,created,mode FROM bids WHERE profile=? ORDER BY created DESC LIMIT 200').bind(p.id).all()).results;const stats=(await db.prepare('SELECT kind,COUNT(*) AS total FROM metrics WHERE profile=? GROUP BY kind').bind(p.id).all()).results;const ranks=(await db.prepare(rankingSQL).all()).results;const ranked=ranks.find(x=>x.id===p.id);return json({profile:{...p,owner:undefined,bid:ranked?.bid||0},bids,notifications,rank:ranks.findIndex(x=>x.id===p.id)+1,stats:{views:stats.find(s=>s.kind==='view')?.total||0,clicks:stats.find(s=>s.kind==='click')?.total||0}});
 }
 if(path==='/api/profile'&&method==='POST'){
  const u=requireUser(request),db=database(env),b=profileInput(await input(request)),p=await mine(db,u.id);const duplicate=await db.prepare('SELECT id FROM profiles WHERE url=? AND owner!=?').bind(b.url,u.id).first();if(duplicate)fail('This LinkedIn URL is already listed. Contact the site owner if it belongs to you.',409);
  try{if(p)await db.prepare('UPDATE profiles SET name=?,headline=?,url=?,category=?,location=? WHERE owner=?').bind(b.name,b.headline,b.url,b.category,b.location,u.id).run();else await db.prepare('INSERT INTO profiles (id,owner,name,headline,url,category,location,created) VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),u.id,b.name,b.headline,b.url,b.category,b.location,Date.now()).run();}catch(e){if(String(e).includes('UNIQUE'))fail('This profile has already been saved. Refresh and try again.',409);throw e}return json({ok:true});
 }
 if(path==='/api/bid'&&method==='POST'){
  const u=requireUser(request),db=database(env),b=await input(request),p=await mine(db,u.id);if(!p)fail('Save your profile before bidding.');if(!Number.isSafeInteger(b.amount)||b.amount<1||b.amount>1000000)fail('Use a whole-dollar sandbox bid from 1 to 1,000,000.');if(typeof b.id!=='string'||! /^[0-9a-f-]{36}$/i.test(b.id))fail('Invalid bid identifier.');
  const existing=await db.prepare('SELECT owner,amount FROM bids WHERE id=?').bind(b.id).first();if(existing){if(existing.owner!==u.id||existing.amount!==b.amount)fail('Bid identifier already used.',409);return json({ok:true,replayed:true})}
  const count=await db.prepare('SELECT COUNT(*) AS n FROM bids WHERE owner=? AND created>?').bind(u.id,Date.now()-86400000).first();if(count.n>=100)fail('Daily sandbox limit reached. Try again tomorrow.',429);
  const now=Date.now();
  // D1 batch commits the crossing notifications and bid together; the unique bid ID makes retries safe.
  await db.batch([
   db.prepare(`INSERT OR IGNORE INTO notifications (id,owner,message,created,read) SELECT ? || ':' || p.id,p.owner,?, ?,0 FROM profiles p WHERE p.id!=? AND NOT EXISTS (SELECT 1 FROM bids WHERE id=?) AND COALESCE((SELECT SUM(amount) FROM bids WHERE profile=p.id),0)>=COALESCE((SELECT SUM(amount) FROM bids WHERE profile=?),0) AND COALESCE((SELECT SUM(amount) FROM bids WHERE profile=p.id),0)<COALESCE((SELECT SUM(amount) FROM bids WHERE profile=?),0)+?`).bind(b.id,p.name+' moved ahead of your profile with a sandbox bid.',now,p.id,b.id,p.id,p.id,b.amount),
   db.prepare('INSERT OR IGNORE INTO bids (id,profile,owner,amount,created,mode) VALUES (?,?,?,?,?,?)').bind(b.id,p.id,u.id,b.amount,now,'sandbox')
  ]);return json({ok:true});
 }
 if(path==='/api/notifications/read'&&method==='POST'){const u=requireUser(request);await database(env).prepare('UPDATE notifications SET read=1 WHERE owner=?').bind(u.id).run();return json({ok:true});}
 if(path==='/api/photo'&&method==='POST'){
  const u=requireUser(request),db=database(env),p=await mine(db,u.id);if(!p)fail('Save your profile first.');if(!env.BUCKET)fail('Photo storage is unavailable.',503);const bytes=new Uint8Array(await request.arrayBuffer());if(bytes.length>2*1024*1024||bytes.length<12)fail('Choose a PNG, JPEG, or WebP image under 2 MB.');const png=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71,jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255,webp=String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';if(!png&&!jpeg&&!webp)fail('Only PNG, JPEG, and WebP photos are accepted.');const type=png?'image/png':jpeg?'image/jpeg':'image/webp';await env.BUCKET.put('photos/'+p.id,bytes,{httpMetadata:{contentType:type}});await db.prepare('UPDATE profiles SET photo=? WHERE owner=?').bind('/photos/'+p.id+'?v='+Date.now(),u.id).run();return json({ok:true});
 }
 if(path.startsWith('/photos/')&&method==='GET'){if(!/^\/photos\/[0-9a-f-]{36}$/.test(path))fail('Not found.',404);const obj=await env.BUCKET?.get(path.slice(1));if(!obj)fail('Not found.',404);return new Response(obj.body,{headers:{'content-type':obj.httpMetadata?.contentType||'image/png','x-content-type-options':'nosniff','cache-control':'no-cache'}});}
 if(path.startsWith('/api/view/')&&method==='POST'){const db=database(env),p=await db.prepare('SELECT id,owner FROM profiles WHERE id=?').bind(path.slice(10)).first();if(!p)fail('Profile not found.',404);await metric(db,p,user(request),'view');return json({ok:true});}
 if(path.startsWith('/go/')&&method==='GET'){const db=database(env),p=await db.prepare('SELECT id,owner,url FROM profiles WHERE id=?').bind(path.slice(4)).first();if(!p)fail('Profile not found.',404);await metric(db,p,user(request),'click');return new Response(null,{status:302,headers:{location:p.url,'cache-control':'no-store','referrer-policy':'no-referrer'}});}
 if(path.startsWith('/api/'))return json({error:'Not found.'},404);
 if(method!=='GET'&&method!=='HEAD')return json({error:'Method not allowed.'},405);
 const asset=assets[path==='/'||['/daily','/categories','/rules','/faq','/stats','/claim','/account','/billing','/paid','/support','/about','/admin'].includes(path)||/^\/profile\/[0-9a-f-]{36}$/.test(path)?'/index.html':path];if(!asset)return new Response('Not found',{status:404});const headers={'content-type':asset.type,'cache-control':asset.immutable?'public, max-age=31536000, immutable':'no-cache','x-content-type-options':'nosniff','referrer-policy':'strict-origin-when-cross-origin','vary':'Accept-Encoding'};if(asset.etag)headers.etag=asset.etag;
 if(asset.etag&&request.headers.get('if-none-match')===asset.etag)return new Response(null,{status:304,headers});
 const gzip=asset.gzip&&/\bgzip\b/.test(request.headers.get('accept-encoding')||'');if(gzip)headers['content-encoding']='gzip';
 return new Response(method==='HEAD'?null:gzip?Uint8Array.from(atob(asset.gzip),c=>c.charCodeAt(0)):asset.base64?Uint8Array.from(atob(asset.body),c=>c.charCodeAt(0)):asset.body,{headers});
 }catch(e){if(!e.status)console.error('Linkdid request failed:',String(e));return json({error:e.status?e.message:'We could not complete this request. Your input has been kept; please try again.'},e.status||503)}}};
