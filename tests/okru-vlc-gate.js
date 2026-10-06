const fs=require("node:fs"),vm=require("node:vm"),{spawnSync}=require("node:child_process");
(async()=>{
 const src=fs.readFileSync("nuvio/providers/okru-authorized.js","utf8"),ctx={module:{exports:{}},fetch,console,Promise,URL,setTimeout,clearTimeout};
 vm.runInNewContext(src,ctx);
 const streams=await ctx.module.exports.getStreams("16386530740872");
 if(!streams.length) throw Error("provider returned no stream");
 const url=streams[0].url;
 const p=spawnSync("cvlc",["--intf","dummy","--vout","dummy","--aout","dummy","--play-and-exit","--run-time=8",url],{encoding:"utf8",timeout:20000});
 const report={generatedAt:new Date().toISOString(),url,status:p.status,signal:p.signal,stdout:p.stdout,stderr:p.stderr};
 fs.mkdirSync("migration/reports",{recursive:true});
 fs.writeFileSync("migration/reports/okru-vlc-gate.json",JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify(report));
 if(p.status!==0) process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
