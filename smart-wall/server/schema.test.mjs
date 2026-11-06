import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applySchemas} from './schema.mjs';
test('existing validators are reused without collMod; schema changes still require a migration',async()=>{
 const collections=new Map();let changes=0;
 const db={listCollections:()=>({toArray:async()=>[...collections].map(([name,options])=>({name,options}))}),createCollection:async(name,options)=>collections.set(name,structuredClone(options)),command:async command=>{changes++;collections.set(command.collMod,{validator:command.validator,validationLevel:command.validationLevel,validationAction:command.validationAction});}};
 await applySchemas(db);assert.equal(collections.size,4);assert.equal(changes,0);
 await applySchemas(db);assert.equal(changes,0,'restart must not need schema administration privileges');
 collections.get('users').validator={};await applySchemas(db);assert.equal(changes,1);
 collections.get('users').validationAction='warn';await applySchemas(db);assert.equal(changes,2);
 collections.get('users').validationLevel='moderate';await applySchemas(db);assert.equal(changes,3);
});
test('schema migration permission errors are not silently ignored',async()=>{
 const db={listCollections:()=>({toArray:async()=>[{name:'users',options:{}}]}),command:async()=>{throw new Error('operator migration required');}};
 await assert.rejects(()=>applySchemas(db),/operator migration/);
});
