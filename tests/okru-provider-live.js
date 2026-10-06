const fs=require("node:fs"),vm=require("node:vm");
const id="16386530740872",timeout=12000;
const src=fs.readFileSync("nuvio/providers/okru-authorized.js","utf8");
const ctx={module:{exports:{}},fetch,console,Promise,URL,setTimeout,clearTimeout};
vm.runInNewContext(src,ctx);
(async()=>{
 const streams=await ctx.module.exports.getStreams(id);
 const out=[];
 for(const s of streams||[]){
  const c=new AbortController(),t=setTimeout(()=>c.abort(),timeout);
  try{
   const r=await fetch(s.url,{headers:{Range:"bytes=0-1023",Accept:"application/vnd.apple.mpegurl,*/*"},signal:c.signal});
   const b=await r.text();
   out.push({url:s.url,status:r.status,contentType:r.headers.get("content-type"),bytes:b.length,hls:/#EXTM3U/.test(b)});
  }catch(e){out.push({url:s.url,error:String(e.message||e)})} finally{clearTimeout(t)}
 }
 const report={generatedAt:new Date().toISOString(),videoId:id,returned:(streams||[]).length,streams:out};
 fs.mkdirSync("migration/reports",{recursive:true});
 fs.writeFileSync("migration/reports/okru-provider-live.json",JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify(report));
 if(!out.some(x=>x.status>=200&&x.status<400&&x.hls))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
