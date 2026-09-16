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
