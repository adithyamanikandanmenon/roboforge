import {test} from 'node:test';
import assert from 'node:assert/strict';
import {waterAction,compareProbes,groupAlerts,actionAlerts} from '../src/actionPolicy.js';
import {normalizeReadings,defaultTargets} from '../src/pondData.js';
import {normalizeSensorChecks} from '../src/waterOperations.js';
import {saveReadings,readSavedReadings,removeSavedReadings} from '../src/offlineReadings.js';
const now=Date.now(),profile={name:'North pond',staleMinutes:10,targets:defaultTargets,sensorChecks:{ph:{comparePair:true,pairTolerance:.3,pairMaxSkewSeconds:60}}};
const row={id:'a',time:now,ph:7.2,ph_secondary:7.3,temperature:28,dissolved_oxygen:6,turbidity:12,tds:300};
test('probe disagreement is meaningful only for enabled, fresh, aligned numeric samples',()=>{
 assert.equal(compareProbes([row],profile,now).code,'agree');assert.equal(compareProbes([{...row,ph_secondary:8.2}],profile,now).code,'disagree');
 assert.equal(compareProbes([row],{...profile,sensorChecks:{}},now).code,'disabled');
 for(const change of [{ph_secondary:null},{ph_secondary_time:now-120000},{ph_secondary_time:null},{time:now-7200000}])assert.equal(compareProbes([{...row,...change}],profile,now).code,'unknown');
 assert.throws(()=>normalizeSensorChecks({ph:{pairTolerance:0}}),/positive pH/);
});
test('attention ordering never turns offline, cached or partial readings into healthy conditions',()=>{
 assert.equal(waterAction(profile,[row],{now}).code,'good');
 for(const options of [{connected:false},{cached:true}])assert.equal(waterAction(profile,[row],{now,...options}).code,'unknown');
 assert.equal(waterAction(profile,[{...row,dissolved_oxygen:null}],{now}).code,'unknown');
 const urgent=waterAction(profile,[{...row,dissolved_oxygen:2}],{now}),unknown=waterAction(profile,[],{now});assert.equal(urgent.code,'attention');assert.ok(urgent.rank<unknown.rank);
 assert.equal(waterAction(profile,[{...row,ph_secondary:9}],{now}).code,'verify');
});
test('repeated alert episodes are grouped while active and recovered conditions stay separate',()=>{
 const alerts=[{id:'a',kind:'ph',active:true,started:1},{id:'b',kind:'ph',active:true,started:2},{id:'c',kind:'ph',active:false,started:0,resolved:3},{id:'d',kind:'missing',active:true,started:2,title:'pH missing'},{id:'e',kind:'stale',active:true,started:2,title:'Stopped'}];
 const grouped=groupAlerts(alerts);assert.equal(grouped.length,3);assert.equal(grouped.find(g=>g.kind==='ph'&&g.active).count,2);assert.equal(grouped.find(g=>g.category==='data').count,2);assert.ok(grouped.find(g=>!g.active));
 assert.ok(actionAlerts(profile,[{...row,ph_secondary:9}],{now,connected:true}).some(g=>g.kind==='probe'));
 assert.equal(actionAlerts(profile,[{...row,ph_secondary:9}],{now,connected:false}).some(g=>g.kind==='probe'),false);
});
test('paired timestamps preserve invalid timing instead of treating it as agreement',()=>{
 const readings=normalizeReadings({timestamp:now,ph:7.2,ph_secondary:7.3,ph_secondary_timestamp:'invalid'});assert.equal(compareProbes(readings,profile,now).code,'unknown');
});
test('public reading cache is scoped per project and water body and never accepts private paths',()=>{
 const memory=new Map(),storage={getItem:key=>memory.get(key)||null,setItem:(key,value)=>memory.set(key,value)};
 const a={firebase:{projectId:'farm-a'},path:'water_quality/POND_01/readings'},b={...a,path:'water_quality/POND_02/readings'};
 assert.equal(saveReadings(a,[row],storage),true);assert.equal(readSavedReadings(a,storage).rows[0].time,now);assert.equal(readSavedReadings(b,storage),null);assert.equal(readSavedReadings({...a,firebase:{projectId:'farm-b'}},storage),null);
 assert.equal(saveReadings({...a,path:'farm_activity/POND_01'},[row],storage),false);
 saveReadings(a,[{...row,id:'b',time:now+1}],storage,true);assert.equal(readSavedReadings(a,storage).rows.length,2);
 removeSavedReadings(a,storage);assert.equal(readSavedReadings(a,storage),null);
});
test('storage errors cannot make connection processing fail',()=>{
 const storage={getItem:()=>{throw new Error('storage disabled');}};assert.equal(saveReadings({firebase:{projectId:'x'},path:'water_quality/POND_01/readings'},[row],storage),false);
});
