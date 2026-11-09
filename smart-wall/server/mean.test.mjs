import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { connectMongo, migrateSqlite } from './mongo.mjs';
import { createMeanApi } from './mean-api.mjs';
import { backupMongo, restoreMongo, verifyBackup } from './mongo-backup.mjs';
import { openDatabase } from './database.mjs';
import { tokenHash, passwordHash } from './security.mjs';
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWP4////fwAJ+wP9CNHoHgAAAABJRU5ErkJggg==';
const pattern={name:'Test stripes',author:'Spoof',style:'Stripes',base:'#ffffff',ink:'#713343',scale:32};
const room=()=>({id:randomUUID(),name:'Trial room',fileName:'room.png',color:'#713343',strength:90,tolerance:32,photo:png,preview:png,boundary:'/w==',safety:'/w==',protectedAreas:'AA==',seeds:[],polygons:[],appearance:{mode:'pattern',secondary:'#000000',split:50,direction:'horizontal',finish:'Satin',pattern:{...pattern,id:'test'}}});
test('MEAN integration: real MongoDB, JWT, roles, photos, catalogues, analytics and recovery',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'smartwall-mean-'));
  const store=await connectMongo({uri:process.env.TEST_MONGODB_URI,name:'test_'+randomUUID().replaceAll('-',''),directory,local:!process.env.TEST_MONGODB_URI,localPort:0});
  const messages=[]; let server,base;
  const start=async(emailEnabled=true,proxyHops=0)=>{server=await createMeanApi({store,emailEnabled,proxyHops,secret:'test-secret-which-is-longer-than-thirty-two',transport:async m=>messages.push(m)});await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;};
  const close=async()=>{await new Promise(r=>server.close(r));await server.resourcesClosed;};
  const call=(path,method='GET',body,cookie='',headers={})=>fetch(base+path,{method,headers:{'Content-Type':'application/json','X-SmartWall-Request':'1',Cookie:cookie,...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
  let alice,bob,ac,bc; const design=room(); design.appearance.patternSource='upload'; design.appearance.texture={name:'custom.png',width:1,height:1,scale:160,pixels:Buffer.from([255,0,0,255]).toString('base64')}; let pid;
  const compress = value => deflateSync(Buffer.from(value, 'base64')).toString('base64');
  design.walls = { active: 1, others: [{
    color: '#8eafa0', strength: 75, tolerance: 30, seeds: [], polygons: [],
    boundary: compress('/w=='), safety: compress('/w=='), protectedAreas: compress('AA=='),
  }] };
  try {
    await start();
    await t.test('rejects anonymous admin, forged signup roles and cross-origin writes',async()=>{
      assert.equal((await call('/api/admin/overview')).status,401);
      assert.equal((await call('/api/auth/signup','POST',{},'',{Origin:'https://evil.test'})).status,403);
      const r=await call('/api/auth/signup','POST',{name:'Alice',email:'alice@example.test',password:'test-password-123',role:'admin'});assert.equal(r.status,201);ac=r.headers.get('set-cookie').split(';')[0];alice=(await r.json()).user;assert.equal(alice.role,'user');assert.equal(ac.split('=')[1].split('.').length,3);assert.match(r.headers.get('set-cookie'),/HttpOnly/);
      const r2=await call('/api/auth/signup','POST',{name:'Bob',email:'bob@example.test',password:'test-password-456'});bc=r2.headers.get('set-cookie').split(';')[0];bob=(await r2.json()).user;
      assert.equal((await call('/api/admin/users','GET',undefined,ac)).status,403);
      const fake=ac.slice(0,-4)+'aaaa';assert.equal((await (await call('/api/auth/me','GET',undefined,fake)).json()).user,null);
    });
    await t.test('requires email verification; encrypted queue issues single-use links',async()=>{
      assert.equal((await call('/api/designs','POST',design,ac)).status,403);
      const job=await store.db.collection('outbox').findOne({userId:alice.id});assert.equal(job.payload.includes('alice@'),false);
      await server.mail.drain();for(const u of [alice,bob]){const token=messages.find(m=>m.to===u.email).text.match(/#verify=([A-Za-z0-9_-]{43})/)[1];assert.equal((await call('/api/auth/verify-email','POST',{token})).status,200);assert.equal((await call('/api/auth/verify-email','POST',{token})).status,400);}
    });
    await t.test('rejects corrupt image content before creating project media',async()=>{
      const before=await store.db.collection('media.files').countDocuments();
      for(const change of [{photo:'iVBORw0KGgo='},{preview:Buffer.from('89504e470d0a1a0a0000000d494844520000000100000001','hex').toString('base64')}]) assert.equal((await call('/api/designs','POST',{...room(),...change},ac)).status,400);
      assert.equal(await store.db.collection('media.files').countDocuments(),before);
    });
    await t.test('stores GridFS photos and style metadata, enforces owner isolation and retry safety',async()=>{
      assert.equal((await call('/api/designs','POST',design,ac)).status,201);assert.equal((await call('/api/designs','POST',design,ac)).status,200);
      assert.equal(await store.db.collection('projects').countDocuments({userId:alice.id}),1);
      const result=await (await call('/api/designs/'+design.id,'GET',undefined,ac)).json();assert.equal(result.photo,png);assert.equal(result.appearance.mode,'pattern');assert.equal(result.appearance.finish,'Satin');assert.deepEqual(result.appearance.texture,design.appearance.texture);assert.equal(result.appearance.patternSource,'upload');
      assert.deepEqual(result.walls, design.walls);
      const corruptWall = { ...design.walls.others[0], safety: '/w==' };
      assert.equal((await call('/api/designs', 'POST', { ...room(), walls: { active: 1, others: [corruptWall] } }, ac)).status, 400);
      assert.equal((await call('/api/designs/'+design.id+'/photo','GET',undefined,bc)).status,404);
      assert.equal((await call('/api/designs/'+design.id+'/preview')).status,401);
      assert.equal((await call('/api/designs','POST',{...room(),appearance:{mode:'invalid'}},ac)).status,400);
      assert.equal((await call('/api/designs','POST',{...room(),appearance:{...design.appearance,texture:{...design.appearance.texture,width:500}}},ac)).status,400);
    });
    await t.test('publishes patterns, persists favourites and rejects non-owner deletion',async()=>{
      const p=await (await call('/api/patterns','POST',pattern,ac)).json();pid=p.id;assert.equal(p.author,'Alice');
      assert.equal((await call('/api/patterns/'+pid,'DELETE',{},bc)).status,404);
      assert.equal((await call('/api/account/favourites','POST',{kind:'pattern',id:pid,selected:true},ac)).status,200);
      assert.deepEqual(await (await call('/api/account/favourites','GET',undefined,ac)).json(),['pattern:'+pid]);
    });
    await t.test('grants admin only through operator access, manages catalogue and audits private review',async()=>{
      await store.db.collection('users').updateOne({_id:alice.id},{$set:{role:'admin'}});
      assert.equal((await call('/api/admin/colours','POST',{id:'test-shade',name:'Test blue',hex:'#112233',family:'Blues',brand:'Test palette',finishes:['Matte']},ac)).status,200);
      let catalog=await (await call('/api/catalog')).json();assert.ok(catalog.colours.find(c=>c.id==='test-shade'));
      assert.equal((await call('/api/admin/colours/test-shade','DELETE',{},ac)).status,200);catalog=await (await call('/api/catalog')).json();assert.equal(catalog.colours.some(c=>c.id==='test-shade'),false);
      assert.equal((await call('/api/admin/projects/'+alice.id+'/'+design.id+'/review','POST',{},ac)).status,400);
      const reviewed=await (await call('/api/admin/projects/'+alice.id+'/'+design.id+'/review','POST',{reason:'Synthetic support test'},ac)).json();assert.equal(reviewed.photo,png);
      assert.ok(await store.db.collection('audit').findOne({action:'review-private-design'}));
      assert.equal((await call('/api/admin/settings','POST',{siteName:'SmartWall Test',maintenance:true,allowPublishing:false},ac)).status,200);
      assert.equal((await call('/api/patterns','POST',pattern,bc)).status,409);
    });
    await t.test('records metrics, private feedback and account disabling revokes sessions',async()=>{
      assert.equal((await call('/api/activity','POST',{type:'upload',visit:randomUUID()},bc)).status,200);
      assert.equal((await call('/api/trial/feedback','POST',{ease:4,accuracy:3,device:'tablet',tasks:{upload:true,select:true,save:true,reopen:true,delete:false},comment:'Synthetic test only'})).status,201);
      const metrics=await (await call('/api/admin/overview','GET',undefined,ac)).json();assert.equal(metrics.uploads,1);assert.equal(metrics.saves,1);assert.equal(metrics.feedback.count,1);
      assert.equal((await call('/api/admin/feedback','GET',undefined,bc)).status,403);
      assert.equal((await call('/api/admin/users/'+bob.id,'POST',{disabled:true},ac)).status,200);
      assert.equal((await (await call('/api/auth/me','GET',undefined,bc)).json()).user,null);
    });
    await t.test('backs up and restores original photos, styles and account credentials',async()=>{
      const snapshot=await backupMongo(store,join(directory,'backups'));assert.ok(verifyBackup(snapshot).collections.length>0);
      const restored=store.client.db('restore_'+randomUUID().replaceAll('-',''));
      try{await restoreMongo({db:restored},snapshot);const project=await restored.collection('projects').findOne({userId:alice.id});assert.equal(project.state.appearance.mode,'pattern');assert.deepEqual(project.state.appearance.texture,design.appearance.texture);assert.equal((await restored.collection('users').findOne({_id:alice.id})).email,alice.email);assert.ok(await restored.collection('media.chunks').countDocuments({files_id:project.photoId}));await assert.rejects(()=>restoreMongo({db:restored},snapshot),/empty/);}finally{await restored.dropDatabase();}
    });
    await t.test('survives API restart then resets password and revokes old JWTs',async()=>{
      await close();await start();assert.equal((await (await call('/api/designs','GET',undefined,ac)).json()).length,1);assert.deepEqual((await (await call('/api/designs/'+design.id,'GET',undefined,ac)).json()).appearance.texture,design.appearance.texture);
      await call('/api/auth/forgot-password','POST',{email:alice.email});await server.mail.drain();
      const token=messages.find(m=>m.subject.includes('Reset')).text.match(/#reset=([A-Za-z0-9_-]{43})/)[1];
      assert.equal((await call('/api/auth/reset-password','POST',{token,password:'new-password-123'})).status,200);
      assert.equal((await call('/api/auth/reset-password','POST',{token,password:'new-password-456'})).status,400);
      assert.equal((await (await call('/api/auth/me','GET',undefined,ac)).json()).user,null);
      assert.equal((await call('/api/auth/login','POST',{email:alice.email,password:'test-password-123'})).status,401);
      assert.equal((await call('/api/auth/login','POST',{email:alice.email,password:'new-password-123'})).status,200);
    });
    await t.test('a nominated admin activates only after email proof',async()=>{
      await store.db.collection('admin_invitations').insertOne({_id:'nominee@example.test',approvedAt:Date.now()});
      const created=await call('/api/auth/signup','POST',{name:'Nominee',email:'nominee@example.test',password:'nominee-password-123'});const cookie=created.headers.get('set-cookie').split(';')[0];assert.equal((await created.json()).user.role,'user');
      assert.equal((await call('/api/admin/overview','GET',undefined,cookie)).status,403);await server.mail.drain();const token=messages.find(m=>m.to==='nominee@example.test').text.match(/#verify=([A-Za-z0-9_-]{43})/)[1];
      assert.equal((await (await call('/api/auth/verify-email','POST',{token},cookie)).json()).role,'admin');assert.equal((await call('/api/admin/overview','GET',undefined,cookie)).status,200);
    });
    await t.test('imports a legacy account/session/photo without changing its SQLite source',async()=>{
      const file=join(directory,'legacy.sqlite'),legacy=openDatabase(file),uid=randomUUID(),password=await passwordHash('legacy-password-123');
      legacy.prepare('INSERT INTO users(id,email,name,password,created_at,email_verified_at) VALUES(?,?,?,?,?,?)').run(uid,'legacy@example.test','Legacy',password,1,1);
      legacy.prepare('INSERT INTO sessions VALUES(?,?,?)').run(tokenHash('legacy-token'),uid,Date.now()+600000);
      const d=room();legacy.prepare('INSERT INTO designs VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(d.id,uid,d.name,1,d.fileName,d.color,'image/png',Buffer.from(png,'base64'),Buffer.from(png,'base64'),JSON.stringify(d),1000);legacy.close();
      await migrateSqlite(store,file);await migrateSqlite(store,file);assert.equal(await store.db.collection('projects').countDocuments({userId:uid}),1);
      const imported=await store.db.collection('users').findOne({_id:uid});assert.equal(imported.password,password);assert.equal(imported.projectCount,1);
      assert.equal((await (await call('/api/auth/me','GET',undefined,'smartwall_session=legacy-token')).json()).user.id,uid);
    });
    await t.test('internship mode saves and publishes without email while keeping roles and ownership secure',async()=>{
      await close(); await start(false);
      await store.db.collection('settings').updateOne({_id:'system'},{$set:{allowPublishing:true}});
      const result=await call('/api/auth/signup','POST',{name:'Internship user',email:'internship@example.test',password:'demo-password-123',role:'admin'});
      assert.equal(result.status,201); const cookie=result.headers.get('set-cookie').split(';')[0]; const body=await result.json();
      assert.equal(body.user.role,'user');assert.equal(body.user.emailVerified,false);assert.ok(!body.message.includes('email has been queued'));
      assert.equal((await (await call('/api/auth/me','GET',undefined,cookie)).json()).emailEnabled,false);
      assert.equal(await store.db.collection('tokens').countDocuments({userId:body.user.id}),0);
      assert.equal(await store.db.collection('outbox').countDocuments({userId:body.user.id}),0);
      const d=room();assert.equal((await call('/api/designs','POST',d,cookie)).status,201);
      assert.equal((await call('/api/patterns','POST',pattern,cookie)).status,201);
      assert.equal((await call('/api/designs/'+d.id,'GET',undefined,bc)).status,401);
      assert.equal((await call('/api/admin/overview','GET',undefined,cookie)).status,403);
      for(const path of ['forgot-password','resend-verification','verify-email','reset-password']) assert.equal((await call('/api/auth/'+path,'POST',{},cookie)).status,404);
    });
    await t.test('trusted single-proxy clients have independent limits; spoofed leftmost headers cannot bypass them',async()=>{
      await close();await start(false,1);
      const invalid={email:'invalid',password:'12345678'};
      for(let i=0;i<30;i++) assert.equal((await call('/api/auth/login','POST',invalid,'',{'X-Forwarded-For':'203.0.113.'+(i+1)+', 192.0.2.10'})).status,400);
      assert.equal((await call('/api/auth/login','POST',invalid,'',{'X-Forwarded-For':'203.0.113.99, 192.0.2.10'})).status,429);
      assert.equal((await call('/api/auth/login','POST',invalid,'',{'X-Forwarded-For':'192.0.2.11'})).status,400);
    });
  } finally { if(server?.listening)await close();await store.db.dropDatabase();await store.close(); }
});
