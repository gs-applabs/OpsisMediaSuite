'use strict';
// On-demand, memory-only Electron process metrics; excludes separately spawned
// FFmpeg/native hosts. CPU percent is Electron's per-process metric.
function summarizeMetrics(metrics){
 const rows=[];
 for(const raw of Array.isArray(metrics)?metrics.slice(0,64):[]){
  if(!raw||!Number.isSafeInteger(raw.pid)||raw.pid<=0)continue;
  const cpu=raw.cpu?.percentCPUUsage,working=raw.memory?.workingSetSize,peak=raw.memory?.peakWorkingSetSize;
  rows.push({pid:raw.pid,type:typeof raw.type==='string'?raw.type.slice(0,40):'unknown',
    cpuPercent:Number.isFinite(cpu)&&cpu>=0?Math.round(cpu*100)/100:null,
    workingSetKiB:Number.isFinite(working)&&working>=0?Math.round(working):null,
    peakWorkingSetKiB:Number.isFinite(peak)&&peak>=0?Math.round(peak):null});
 }
 return {rows,workingSetKiB:rows.every(r=>r.workingSetKiB!==null)?rows.reduce((n,r)=>n+r.workingSetKiB,0):null};
}
function aggregateSamples(samples){
 const good=samples.filter(s=>s&&Array.isArray(s.rows)&&s.rows.length);
 const memory=good.map(s=>s.workingSetKiB).filter(Number.isFinite);
 const cpu=good.map(s=>s.rows.every(r=>Number.isFinite(r.cpuPercent))?s.rows.reduce((sum,r)=>sum+r.cpuPercent,0):null).filter(Number.isFinite);
 const average=a=>a.length?Math.round(a.reduce((n,x)=>n+x,0)/a.length*100)/100:null;
 return {samples:good.length,workingSetKiBMean:average(memory),workingSetKiBMax:memory.length?Math.max(...memory):null,cpuPercentMean:average(cpu),cpuPercentMax:cpu.length?Math.max(...cpu):null};
}
module.exports={summarizeMetrics,aggregateSamples};
