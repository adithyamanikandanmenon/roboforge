import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../public/firebase-messaging-sw.js',import.meta.url),'utf8');
function worker(){const events={},stored=new Map();let allowNetwork=true;const cache={addAll:async paths=>{for(const path of paths)stored.set(path,new Response('cached '+path));},keys:async()=>[...stored.keys()].map(path=>({url:'https://farm.test'+path})),delete:async request=>stored.delete(new URL(request.url).pathname),put:async(key,value)=>stored.set(typeof key==='string'?key:new URL(key.url).pathname,value)};
 const context={URL,Response,Set,caches:{open:async()=>cache,match:async key=>stored.get(typeof key==='string'?key:new URL(key.url).pathname)?.clone()},fetch:async request=>{if(!allowNetwork)throw new Error('offline');if(request==='/offline-manifest.json')return Response.json({files:['/index.html','/assets/main.js','/pond-config.json','/care_reminders.json','https://outside.test/private.js']});return new Response('online');},self:{location:{href:'https://farm.test/firebase-messaging-sw.js?config=%7B%7D',origin:'https://farm.test'},addEventListener:(name,fn)=>events[name]=fn,skipWaiting:async()=>{},clients:{claim:async()=>{}}},importScripts:()=>{throw new Error('messaging script unavailable offline');}};vm.runInNewContext(source,context);return {events,stored,offline:()=>allowNetwork=false};}
test('shell cache excludes private data and registers despite unavailable messaging scripts',async()=>{
 const w=worker();let install;w.events.install({waitUntil:p=>install=p});await install;assert.ok(w.stored.has('/index.html'));assert.ok(w.stored.has('/assets/main.js'));assert.equal(w.stored.has('/care_reminders.json'),false);assert.equal(w.stored.has('https://outside.test/private.js'),false);
 w.offline();let response;w.events.fetch({request:{method:'GET',url:'https://farm.test/?section=history',mode:'navigate'},respondWith:p=>response=p});assert.match(await(await response).text(),/cached \/index.html/);
});
test('service worker does not intercept cloud sensor requests or owner writes',()=>{
 const w=worker();for(const request of [{method:'GET',url:'https://firebase.test/water_quality.json'},{method:'POST',url:'https://farm.test/care_reminders'}]){let intercepted=false;w.events.fetch({request,respondWith:()=>intercepted=true});assert.equal(intercepted,false);}
});
