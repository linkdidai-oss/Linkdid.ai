import {createClient} from '@libsql/client';
import {readFileSync} from 'node:fs';
const db=createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});
await db.execute('CREATE TABLE IF NOT EXISTS linkdid_migrations (name TEXT PRIMARY KEY, applied INTEGER NOT NULL)');
const journal=JSON.parse(readFileSync('drizzle/meta/_journal.json','utf8'));
for(const entry of journal.entries){
 if((await db.execute({sql:'SELECT name FROM linkdid_migrations WHERE name=?',args:[entry.tag]})).rows.length)continue;
 const sql=readFileSync('drizzle/'+entry.tag+'.sql','utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean);
 await db.batch([...sql,{sql:'INSERT INTO linkdid_migrations VALUES (?,?)',args:[entry.tag,Date.now()]}],'write');
 console.log('Applied',entry.tag);
}
db.close();
