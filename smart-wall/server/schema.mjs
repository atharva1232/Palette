const stable = value => JSON.stringify(normalize(value));
function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, normalize(value[key])]));
  return value;
}
/** Database-level guards complement route validation and unique indexes. */
export async function applySchemas(db) {
  const schemas={
    users:{required:['_id','email','password','role','createdAt'],properties:{_id:{bsonType:'string'},email:{bsonType:'string'},password:{bsonType:'string'},role:{enum:['user','admin']},disabled:{bsonType:'bool'},favourites:{bsonType:'array',items:{bsonType:'string'}}}},
    projects:{required:['_id','id','userId','photoId','previewId','state'],properties:{_id:{bsonType:'string'},id:{bsonType:'string'},userId:{bsonType:'string'},photoId:{bsonType:'string'},previewId:{bsonType:'string'},state:{bsonType:'object'}}},
    colours:{required:['_id','name','hex','family','brand','finishes'],properties:{hex:{bsonType:'string',pattern:'^#[0-9a-fA-F]{6}$'},finishes:{bsonType:'array',items:{enum:['Matte','Satin','Gloss']}}}},
    patterns:{required:['_id','name','style','base','ink','scale'],properties:{name:{bsonType:'string'},base:{bsonType:'string',pattern:'^#[0-9a-fA-F]{6}$'},ink:{bsonType:'string',pattern:'^#[0-9a-fA-F]{6}$'}}},
  };
  const existing=new Map((await db.listCollections().toArray()).map(c=>[c.name,c.options || {}]));
  for(const [name,schema] of Object.entries(schemas)) {
    const validator={$jsonSchema:{bsonType:'object',...schema}};
    if(existing.has(name)) {
      const options=existing.get(name);
      // readWrite accounts can reuse established schemas without a collMod privilege.
      // Genuine schema changes still require an operator migration; never silently omit guards.
      if(stable(options.validator) !== stable(validator) || (options.validationLevel || 'strict') !== 'strict' || (options.validationAction || 'error') !== 'error') await db.command({collMod:name,validator,validationLevel:'strict',validationAction:'error'});
    } else await db.createCollection(name,{validator});
  }
}
