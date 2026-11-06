import { MongoClient } from 'mongodb';
const client=new MongoClient(process.env.MONGODB_URI||'mongodb://127.0.0.1:27019/?replicaSet=smartwall');
try{await client.connect();const db=client.db(process.env.MONGODB_DATABASE||'smartwall');const feedback=await db.collection('feedback').find().sort({createdAt:-1}).toArray();console.log(JSON.stringify({responses:feedback.length,averageEase:feedback.length?feedback.reduce((n,f)=>n+f.ease,0)/feedback.length:null,averageAccuracy:feedback.length?feedback.reduce((n,f)=>n+f.accuracy,0)/feedback.length:null,feedback},null,2));}finally{await client.close();}
