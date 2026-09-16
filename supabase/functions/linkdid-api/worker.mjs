const assets={};
const coins={btc:'Bitcoin · Bitcoin network',eth:'Ethereum · Ethereum network',usdttrc20:'USDT · TRON (TRC20)'};
const paidSQL=`SELECT p.id,p.name,p.headline,p.category,p.photo,p.created,COALESCE(SUM(b.amount),0) AS bid FROM profiles p JOIN paid_bids b ON b.profile=p.id GROUP BY p.id ORDER BY bid DESC,p.created,p.id`;
function paymentConfig(env){return env.CRYPTO_PAYMENTS_ENABLED==='true'&&!!env.NOWPAYMENTS_API_KEY&&!!termsURL(env);}
function termsURL(env){try{const u=new URL(env.PURCHASE_TERMS_URL);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null}catch{return null}}
async function providerAPI(env,path,body){
 if(!env.NOWPAYMENTS_API_KEY)fail('Crypto payments are not connected yet.',503);
 let response;try{response=await fetch('https://api.nowpayments.io/v1'+path,{method:body?'POST':'GET',headers:{'x-api-key':env.NOWPAYMENTS_API_KEY,'content-type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});}catch{fail('Payment service did not respond. Check your payment history before trying again.',503)}
 if(!response.ok)fail('Payment service could not process this request. Check the amount and try later.',502);
 try{return await response.json()}catch{fail('Payment service returned an invalid response.',502)}
}
function publicOrder(o){const d=o.details?JSON.parse(o.details):{};return {id:o.id,amount:o.amount,litres:o.gas_litres||0,currency:o.currency,network:coins[o.currency],status:o.status,created:o.created,paymentId:o.provider,payAmount:d.payAmount,address:d.address,extraId:d.extraId,expires:d.expires};}
async function paymentRoutes(request,env,path,method){
 if(path==='/api/admin/support'){
  const u=requireUser(request);if(!env.ADMIN_USER_ID||u.id!==env.ADMIN_USER_ID)fail('Administrator access required.',403);
  const db=database(env);
  if(method==='GET')return json({tickets:(await db.prepare('SELECT id,subject,message,status,created FROM tickets ORDER BY created DESC LIMIT 200').all()).results});
  if(method==='POST'){
   const b=await input(request);if(!['open','in_review','resolved'].includes(b.status)||! /^[0-9a-f-]{36}$/i.test(b.id||''))fail('Invalid support update.');
   const t=await db.prepare('SELECT * FROM tickets WHERE id=?').bind(b.id).first();if(!t)fail('Request not found.',404);
   await db.batch([db.prepare('UPDATE tickets SET status=? WHERE id=?').bind(b.status,b.id),db.prepare('INSERT INTO notifications (id,owner,message,created,read) VALUES (?,?,?,?,0)').bind(crypto.randomUUID(),t.owner,'Support request “'+t.subject+'” is now '+b.status.replace('_',' ')+'.',Date.now())]);return json({ok:true});
  }
 }
 if(path==='/api/crypto/config'&&method==='GET'){
  const enabled=paymentConfig(env);let currencies=[];
  if(enabled){const d=await providerAPI(env,'/currencies');currencies=Object.entries(coins).filter(([id])=>d.currencies?.includes(id)).map(([id,label])=>({id,label}));}
  return json({enabled,currencies,terms:termsURL(env),provider:'NOWPayments'});
 }
 if(path==='/api/paid'&&method==='GET')return json({profiles:(await database(env).prepare(paidSQL).all()).results});
 if(!path.startsWith('/api/crypto/')&&!path.startsWith('/api/support'))return null;
 const u=requireUser(request),db=database(env);
 if(path==='/api/support'&&method==='GET')return json({tickets:(await db.prepare('SELECT id,subject,message,status,created FROM tickets WHERE owner=? ORDER BY created DESC LIMIT 50').bind(u.id).all()).results});
 if(path==='/api/support'&&method==='POST'){
  const b=await input(request),subject=field(b.subject,100,'subject'),message=field(b.message,2000,'message');
  const count=await db.prepare('SELECT COUNT(*) AS n FROM tickets WHERE owner=? AND created>?').bind(u.id,Date.now()-86400000).first();if(count.n>=5)fail('You can submit up to five requests per day.',429);
  await db.prepare('INSERT INTO tickets (id,owner,subject,message,created) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),u.id,subject,message,Date.now()).run();return json({ok:true});
 }
 if(path==='/api/crypto/orders'&&method==='GET')return json({orders:(await db.prepare('SELECT * FROM orders WHERE owner=? ORDER BY created DESC LIMIT 100').bind(u.id).all()).results.map(publicOrder)});
 if(path==='/api/crypto/orders'&&method==='POST'){
  if(!paymentConfig(env))fail('Crypto checkout is not activated. No payment has been created.',503);
  const b=await input(request),p=await mine(db,u.id);if(!p)fail('Save your profile first.');
  if(!Number.isSafeInteger(b.litres)||b.litres<1||b.litres>5000||!coins[b.currency]||b.accepted!==true||! /^[0-9a-f-]{36}$/i.test(b.id||''))fail('Choose 1–5,000 litres, a supported network, and accept the purchase terms.');b.amount=b.litres;
  const old=await db.prepare('SELECT * FROM orders WHERE id=?').bind(b.id).first();
  if(old){if(old.owner!==u.id||old.currency!==b.currency||old.gas_litres!==b.litres)fail('Order identifier already used.',409);return json({order:publicOrder(old)})}
  const count=await db.prepare('SELECT COUNT(*) AS n FROM orders WHERE owner=? AND created>?').bind(u.id,Date.now()-86400000).first();if(count.n>=10)fail('Daily checkout limit reached.',429);
  const available=await providerAPI(env,'/currencies');if(!available.currencies?.includes(b.currency))fail('This currency is currently unavailable.');
  // Persist before the external POST. A retry must never create a second charge.
  try{await db.prepare('INSERT INTO orders (id,owner,profile,amount,currency,created,gas_litres) VALUES (?,?,?,?,?,?,?)').bind(b.id,u.id,p.id,b.amount,b.currency,Date.now(),b.litres).run()}catch{fail('This checkout is already being created. Refresh payment history.',409)}
  try{
   const pay=await providerAPI(env,'/payment',{price_amount:b.amount,price_currency:'usd',pay_currency:b.currency,order_id:b.id,order_description:'Linkdid paid gas: '+b.litres+' litres at $1/L'});
   if(!/^\d+$/.test(String(pay.payment_id))||typeof pay.pay_address!=='string'||!Number.isFinite(Number(pay.pay_amount))||Number(pay.pay_amount)<=0||pay.pay_currency!==b.currency)fail('Payment details are incomplete. Contact support with your order ID.',502);
   const details=JSON.stringify({payAmount:String(pay.pay_amount),address:pay.pay_address,extraId:pay.payin_extra_id||'',expires:pay.expiration_estimate_date||null});
   await db.prepare('UPDATE orders SET provider=?,details=?,status=? WHERE id=?').bind(String(pay.payment_id),details,'waiting',b.id).run();
  }catch(e){await db.prepare("UPDATE orders SET status='review' WHERE id=?").bind(b.id).run();throw e}
  return json({order:publicOrder(await db.prepare('SELECT * FROM orders WHERE id=?').bind(b.id).first())});
 }
 const match=path.match(/^\/api\/crypto\/orders\/([0-9a-f-]{36})\/(check|receipt)$/i);
 if(match){
  const o=await db.prepare('SELECT * FROM orders WHERE id=? AND owner=?').bind(match[1],u.id).first();if(!o)fail('Payment not found.',404);
  if(match[2]==='receipt'&&method==='GET'){
   if(o.status!=='credited')fail('A receipt is available after payment verification.',409);
   return new Response(['LINKDID PAYMENT RECEIPT','Order: '+o.id,'Provider: NOWPayments','Payment ID: '+o.provider,(o.gas_litres?'Gas: '+o.gas_litres+' L · USD '+o.amount:'Historical placement: USD '+o.amount),'Currency/network: '+coins[o.currency],'Created: '+new Date(o.created).toISOString(),'Status: Payment verified and credited','This is a payment confirmation, not a tax invoice.'].join('\n'),{headers:{'content-type':'text/plain; charset=utf-8','content-disposition':'attachment; filename="linkdid-receipt-'+o.id+'.txt"','cache-control':'no-store'}});
  }
  if(match[2]==='check'&&method==='POST'){
   if(o.status==='credited')return json({order:publicOrder(o)});
   if(!o.provider)fail('Payment creation needs review. Contact support with order '+o.id,409);
   if(Date.now()-o.checked<10000)return json({order:publicOrder(o)});
   await db.prepare('UPDATE orders SET checked=? WHERE id=?').bind(Date.now(),o.id).run();
   const pay=await providerAPI(env,'/payment/'+encodeURIComponent(o.provider));
   if(String(pay.payment_id)!==o.provider||pay.order_id!==o.id||pay.price_currency!=='usd'||Number(pay.price_amount)!==o.amount||pay.pay_currency!==o.currency)fail('Payment details do not match this order. Contact support.',409);
   if(pay.payment_status==='finished'){
    if(!Number.isFinite(Number(pay.actually_paid))||!Number.isFinite(Number(pay.pay_amount))||Number(pay.pay_amount)<=0||Number(pay.actually_paid)<Number(pay.pay_amount))fail('Full payment has not been verified. Contact support.',409);
    const now=Date.now();
    if(o.gas_litres>0){
     await db.batch([
      db.prepare('INSERT OR IGNORE INTO gas_tanks (profile,updated) VALUES (?,?)').bind(o.profile,now),
      db.prepare(`UPDATE gas_tanks SET free=MAX(0,free-MAX(0,?-updated)*24),paid=MAX(0,paid-MAX(0,?-updated))+?,updated=MAX(updated,?) WHERE profile=? AND EXISTS (SELECT 1 FROM orders WHERE id=? AND status!='credited')`).bind(now,now,o.gas_litres*86400000,now,o.profile,o.id),
      db.prepare("UPDATE orders SET status='credited' WHERE id=?").bind(o.id)
     ]);
    }else await db.batch([
     db.prepare(`INSERT OR IGNORE INTO notifications (id,owner,message,created,read) SELECT ? || ':' || p.id,p.owner,?, ?,0 FROM profiles p WHERE p.id!=? AND NOT EXISTS (SELECT 1 FROM paid_bids WHERE id=?) AND COALESCE((SELECT SUM(amount) FROM paid_bids WHERE profile=p.id),0)>=COALESCE((SELECT SUM(amount) FROM paid_bids WHERE profile=?),0) AND COALESCE((SELECT SUM(amount) FROM paid_bids WHERE profile=p.id),0)<COALESCE((SELECT SUM(amount) FROM paid_bids WHERE profile=?),0)+?`).bind(o.id,'Another profile moved ahead of you on the paid leaderboard.',now,o.profile,o.id,o.profile,o.profile,o.amount),
     db.prepare('INSERT OR IGNORE INTO paid_bids (id,profile,amount,created) VALUES (?,?,?,?)').bind(o.id,o.profile,o.amount,now),
     db.prepare("UPDATE orders SET status='credited' WHERE id=?").bind(o.id)
    ]);
   }else{
    const states=['waiting','confirming','confirmed','sending','partially_paid','failed','refunded','expired'];
    const status=states.includes(pay.payment_status)?pay.payment_status:'review';
    await db.prepare("UPDATE orders SET status=? WHERE id=? AND status!='credited'").bind(status,o.id).run();
   }
   return json({order:publicOrder(await db.prepare('SELECT * FROM orders WHERE id=?').bind(o.id).first())});
  }
 }
 return json({error:'Not found.'},404);
}

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
