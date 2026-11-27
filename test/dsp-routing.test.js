'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {selectRoute,RouteGate}=require('../renderer/dsp-routing');
test('route preference is subordinate to master and external bypass',()=>{
 const state={masterEnabled:true,externalBypass:false,preferWorklet:true,workletReady:true};
 assert.equal(selectRoute(state),'worklet');
 assert.equal(selectRoute({...state,externalBypass:true}),'dry');
 assert.equal(selectRoute({...state,masterEnabled:false}),'dry');
 assert.equal(selectRoute({...state,workletReady:false}),'web');
 assert.equal(selectRoute({...state,preferWorklet:false}),'web');
});
test('route gate has complementary weights even during interrupted transitions',()=>{
 const ctx={currentTime:0};
 const param=()=>({gain:{cancelScheduledValues(){},setValueAtTime(){},linearRampToValueAtTime(){}}});
 const gate=new RouteGate(ctx,{web:param(),dry:param(),worklet:param()});
 assert.deepEqual(gate.weights(),[1,0,0]);
 gate.select('worklet');ctx.currentTime=.01;
 assert.deepEqual(gate.weights(),[.5,0,.5]);
 gate.select('dry');ctx.currentTime=.02;
 const mid=gate.weights();
 assert.ok(Math.abs(mid.reduce((a,b)=>a+b,0)-1)<1e-10);
 assert.ok(mid.every(v=>v>=0&&v<=1));
 ctx.currentTime=.04;assert.deepEqual(gate.weights(),[0,1,0]);
 gate.select('unknown');ctx.currentTime=.1;assert.deepEqual(gate.weights(),[1,0,0]);
});
test('production gate does not select unregistered worklet',()=>{
 const ctx={currentTime:0},gain=()=>({gain:{cancelScheduledValues(){},setValueAtTime(){},linearRampToValueAtTime(){}}});
 const gate=new RouteGate(ctx,{web:gain(),dry:gain()});
 assert.equal(gate.select('worklet'),'web');
});
