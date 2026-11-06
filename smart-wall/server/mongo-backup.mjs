import { BSON } from 'mongodb';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

/** Consistent logical snapshot, including GridFS chunks. Designed for the internship dataset. */
export async function backupMongo(store, directory) {
  mkdirSync(directory, { recursive: true });
  const name = `mongo-${Date.now()}-${randomUUID()}`;
  const partial = join(directory,name+'.partial'), target=join(directory,name);
  mkdirSync(partial, { mode: 0o700 });
  const collections = (await store.db.listCollections({}, {nameOnly:true}).toArray()).map(c=>c.name).filter(n=>!n.startsWith('system.'));
  const manifest = { version:1, createdAt:Date.now(), database:store.db.databaseName, collections:[] };
  await store.transaction(async session=>{
    // Callback can be retried: overwrite each collection file rather than append.
    manifest.collections=[];
    for(const collection of collections){
      const documents=await store.db.collection(collection).find({}, {session}).toArray();
      const bytes=Buffer.concat(documents.map(d=>BSON.serialize(d)));
      const file=Buffer.from(collection).toString('hex')+'.bson';
      writeFileSync(join(partial,file),bytes,{mode:0o600});
      manifest.collections.push({name:collection,file,count:documents.length,sha256:createHash('sha256').update(bytes).digest('hex')});
    }
  });
  writeFileSync(join(partial,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600});
  verifyBackup(partial);renameSync(partial,target);return target;
}
export function verifyBackup(directory){
  const manifest=JSON.parse(readFileSync(join(directory,'manifest.json'),'utf8'));
  if(manifest.version!==1 || !Array.isArray(manifest.collections))throw new Error('Invalid backup manifest.');
  for(const c of manifest.collections){
    if(typeof c.name!=='string'|| !/^[0-9a-f]+\.bson$/.test(c.file))throw new Error('Invalid backup collection.');
    const bytes=readFileSync(join(directory,c.file));
    if(createHash('sha256').update(bytes).digest('hex')!==c.sha256)throw new Error('Backup checksum failed.');
    let offset=0,count=0;
    while(offset<bytes.length){const length=bytes.readInt32LE(offset);if(length<5||length>16777216||offset+length>bytes.length)throw new Error('Invalid BSON backup.');BSON.deserialize(bytes.subarray(offset,offset+length));offset+=length;count++;}
    if(count!==c.count)throw new Error('Backup count mismatch.');
  }
  return manifest;
}
export async function restoreMongo(store,directory){
  const manifest=verifyBackup(directory);
  // Refuse overwrite, including a partially restored database. Retry with another empty name.
  if((await store.db.listCollections().toArray()).length)throw new Error('Restore requires an empty destination database.');
  for(const c of manifest.collections){
    const bytes=readFileSync(join(directory,c.file));const documents=[];let offset=0;
    while(offset<bytes.length){const length=bytes.readInt32LE(offset);documents.push(BSON.deserialize(bytes.subarray(offset,offset+length)));offset+=length;}
    await store.db.createCollection(c.name);
    if(documents.length)await store.db.collection(c.name).insertMany(documents);
  }
}
export function scheduledMongoBackups(store,directory,{hours=24,retain=7}={}){
  if(!Number.isFinite(hours)||hours<1||hours>168||!Number.isInteger(retain)||retain<1||retain>90)throw new Error('Invalid backup interval/retention.');
  let active,stopped=false;
  const run=()=>active||(active=(async()=>{
    if(stopped)return;
    await backupMongo(store,directory);
    const snapshots=readdirSync(directory).filter(n=>/^mongo-\d+-[0-9a-f-]{36}$/.test(n)).sort((a,b)=>Number(b.split('-')[1])-Number(a.split('-')[1]));
    for(const name of snapshots.slice(retain)){const path=resolve(directory,name);if(!path.startsWith(resolve(directory)+ (process.platform==='win32'?'\\':'/')))throw new Error('Unsafe backup path.');rmSync(path,{recursive:true});}
  })().finally(()=>{active=null;}));
  const timer=setInterval(()=>{void run().catch(e=>console.error('MongoDB backup failed:',e.message));},hours*3600000);timer.unref();
  return {run,async stop(){stopped=true;clearInterval(timer);if(active)await active;}};
}
