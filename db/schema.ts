import {sqliteTable,text,integer,index,uniqueIndex} from 'drizzle-orm/sqlite-core';
export const gasTanks=sqliteTable('gas_tanks',{
 profile:text('profile').primaryKey().references(()=>profiles.id),free:integer('free').notNull().default(0),paid:integer('paid').notNull().default(0),updated:integer('updated').notNull(),progress:integer('progress').notNull().default(0),pulse:integer('pulse').notNull().default(0),session:text('session'),sequence:integer('sequence').notNull().default(0)
});
export const claims=sqliteTable('claims',{
 id:integer('id').primaryKey({autoIncrement:true}),request:text('request').notNull().unique(),profile:text('profile').notNull().references(()=>profiles.id),started:integer('started').notNull(),expires:integer('expires').notNull(),streak:integer('streak').notNull().default(1)
},t=>[index('claims_profile_id').on(t.profile,t.id),index('claims_expires_id').on(t.expires,t.id)]);
export const profiles=sqliteTable('profiles',{
 id:text('id').primaryKey(),owner:text('owner').notNull(),name:text('name').notNull(),headline:text('headline').notNull(),url:text('url').notNull(),category:text('category').notNull(),location:text('location').notNull().default(''),photo:text('photo'),created:integer('created').notNull()
},t=>[uniqueIndex('profiles_owner').on(t.owner),uniqueIndex('profiles_url').on(t.url)]);
export const bids=sqliteTable('bids',{
 id:text('id').primaryKey(),profile:text('profile').notNull().references(()=>profiles.id),owner:text('owner').notNull(),amount:integer('amount').notNull(),created:integer('created').notNull(),mode:text('mode').notNull().default('sandbox')
},t=>[index('bids_profile').on(t.profile),index('bids_created').on(t.created)]);
export const notifications=sqliteTable('notifications',{
 id:text('id').primaryKey(),owner:text('owner').notNull(),message:text('message').notNull(),created:integer('created').notNull(),read:integer('read').notNull().default(0)
},t=>[index('notifications_owner_created').on(t.owner,t.created)]);
export const metrics=sqliteTable('metrics',{
 id:text('id').primaryKey(),profile:text('profile').notNull().references(()=>profiles.id),viewer:text('viewer').notNull(),kind:text('kind').notNull(),day:text('day').notNull()
},t=>[uniqueIndex('metrics_daily_viewer').on(t.profile,t.viewer,t.kind,t.day)]);
export const orders=sqliteTable('orders',{
 id:text('id').primaryKey(),owner:text('owner').notNull(),profile:text('profile').notNull().references(()=>profiles.id),amount:integer('amount').notNull(),gasLitres:integer('gas_litres').notNull().default(0),currency:text('currency').notNull(),provider:text('provider').unique(),status:text('status').notNull().default('creating'),details:text('details'),created:integer('created').notNull(),checked:integer('checked').notNull().default(0)
},t=>[index('orders_owner_created').on(t.owner,t.created)]);
export const paidBids=sqliteTable('paid_bids',{
 id:text('id').primaryKey().references(()=>orders.id),profile:text('profile').notNull().references(()=>profiles.id),amount:integer('amount').notNull(),created:integer('created').notNull()
},t=>[index('paid_bids_profile').on(t.profile)]);
export const tickets=sqliteTable('tickets',{
 id:text('id').primaryKey(),owner:text('owner').notNull(),subject:text('subject').notNull(),message:text('message').notNull(),status:text('status').notNull().default('open'),created:integer('created').notNull()
},t=>[index('tickets_owner_created').on(t.owner,t.created)]);
