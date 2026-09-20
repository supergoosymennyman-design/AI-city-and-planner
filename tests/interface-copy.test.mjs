import {test} from 'node:test';
import assert from 'node:assert/strict';
import {displayName} from '../P5 Programme/buddy-kit/client/city-common/display-names.js';
import {libraryByCategory} from '../P5 Programme/buddy-kit/client/city-common/library.js';
import {CATALOG_ORDER, specialKeys} from '../P5 Programme/buddy-kit/client/city-common/catalog.js';
import {CF_KEYS} from '../P5 Programme/buddy-kit/client/city-common/champion-file.js';
import {recoveryText} from '../P5 Programme/buddy-kit/client/city-common/recovery-copy.js';

test('display resolution covers the existing drawer without mutating catalog or library entries',()=>{
 const entries=['nature','props','vehicles','scenarios'].flatMap(libraryByCategory);
 const raw=JSON.stringify(entries);
 assert.equal(specialKeys().length,18);
 for(const type of [...CATALOG_ORDER,...entries.map(item=>'lib:'+item.id)]){
  for(const lang of ['en','zh-Hant']) assert.ok(displayName(type,lang).length>0,type);
 }
 assert.equal(displayName('housing','zh-Hant'),'住宅');
 const bench=entries.find(item=>item.name==='Bench');
 assert.equal(displayName('lib:'+bench.id,'en'),'Bench');
 assert.equal(displayName('lib:'+bench.id,'zh-Hant'),'長椅');
 assert.equal(JSON.stringify(entries),raw);
 assert.equal(displayName('unknown-saved-type','zh-Hant'),'unknown-saved-type');
});
test('every Champion File section has a localized recovery label',()=>{
 for(const key of Object.keys(CF_KEYS))for(const lang of ['en','zh-Hant'])assert.notEqual(recoveryText(key,lang),key);
});
