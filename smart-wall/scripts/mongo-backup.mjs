import { MongoClient } from 'mongodb';
import { backupMongo,restoreMongo } from '../server/mongo-backup.mjs';
const restoring=process.argv[2]==='restore';
const name=process.env.MONGODB_DATABASE || 'smartwall';
const client=new MongoClient(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27019/?replicaSet=smartwall');
await client.connect();const db=client.db(name);
const store={db,async transaction(callback){const session=client.startSession();try{return await session.withTransaction(()=>callback(session),{readConcern:{level:'snapshot'}});}finally{await session.endSession();}}};
try{
  if(restoring){if(!process.argv[3]||!process.env.MONGODB_DATABASE)throw new Error('Set MONGODB_DATABASE to a new empty database and supply the backup directory.');await restoreMongo(store,process.argv[3]);console.log('Restored to the named empty database. Start the app to recreate indexes.');}
  else console.log('Verified backup:',await backupMongo(store,process.argv[2]||'.backups'));
}finally{await client.close();}
