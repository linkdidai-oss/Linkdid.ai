// Only SQL authored by the application reaches this adapter; never user SQL.
export function postgresSQL(source){
 let sql=source.replace(/\b(FROM|JOIN|INTO|UPDATE)\s+(profiles|gas_tanks|metrics|notifications|orders|paid_bids|bids|tickets|claims)\b/gi,'$1 linkdid.$2');
 const ignore=/^INSERT OR IGNORE\b/i.test(sql);sql=sql.replace(/^INSERT OR IGNORE/i,'INSERT');
 sql=sql.replace(/\bMAX\(0,/g,'GREATEST(0,').replace(/\bMAX\(updated,/g,'GREATEST(updated,').replace(/\bAS activityAt\b/g,'AS "activityAt"');
 let index=0,inQuote=false,result='';
 for(let i=0;i<sql.length;i++){
  const c=sql[i];if(c==="'"){if(inQuote&&sql[i+1]==="'"){result+="''";i++;continue}inQuote=!inQuote}
  result+=c==='?'&&!inQuote?'$'+(++index):c;
 }
 return result.replace(/;\s*$/,'')+(ignore?' ON CONFLICT DO NOTHING':'');
}
export function postgresAdapter(client){
 const normalize=rows=>({results:[...rows],success:true,meta:{changes:rows.count||0}});
 const prepare=(source,args=[])=>({source,args,bind(...values){return prepare(source,values)},async first(column){const row=(await client.unsafe(postgresSQL(source),args))[0];return column?row?.[column]??null:row??null},async all(){return normalize(await client.unsafe(postgresSQL(source),args))},async run(){return normalize(await client.unsafe(postgresSQL(source),args))}});
 return {prepare,async batch(statements){
  // SQLite serialized writers. Preserve that guarantee for payment credits on Postgres.
  for(let attempt=0;;attempt++)try{return await client.begin('isolation level serializable',async tx=>{const results=[];for(const s of statements)results.push(normalize(await tx.unsafe(postgresSQL(s.source),s.args)));return results})}catch(error){if(!['40001','40P01'].includes(error.code)||attempt>=2)throw error}
 }};
}
