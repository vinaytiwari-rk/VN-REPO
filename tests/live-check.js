// Live network smoke checks: direct-media HTTP and MIME only, not device playback.
const fs=require("node:fs");
const vm=require("node:vm");
const manifestPath=process.env.MANIFEST_PATH||"manifest.json";
const reportPath=process.env.REPORT_PATH||"migration/reports/live-smoke.json";
const manifest=JSON.parse(fs.readFileSync(manifestPath,"utf8"));
const prefix=manifestPath.includes("/")?manifestPath.slice(0,manifestPath.lastIndexOf("/")+1):"";
const ids=(process.env.TMDB_TEST_IDS||"550").split(",").map(x=>x.trim()).filter(Boolean);
const mediaType=process.env.MEDIA_TYPE||"movie";
const season=Number(process.env.SEASON||1);
const episode=Number(process.env.EPISODE||1);
const timeout=Number(process.env.TIMEOUT_MS||12000);
const limit=Number(process.env.MAX_STREAMS||3);
const agent="VN-REPO-live-smoke/1.0";
async function checkedFetch(url,options={}){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),timeout);
 try{return await fetch(url,{...options,signal:controller.signal,headers:{"User-Agent":agent,...options.headers}});}
 finally{clearTimeout(timer);}
}
function plausibleMedia(url,contentType,body){
 const type=String(contentType||"").toLowerCase();
 if(type.includes("video/")||type.includes("application/vnd.apple.mpegurl")||type.includes("application/x-mpegurl"))return true;
 if(type.includes("application/octet-stream")&&[".mp4",".m4v",".webm"].some(ext=>new URL(url).pathname.toLowerCase().endsWith(ext)))return true;
 return /^#EXTM3U/.test(body||"")||/^.{0,16}ftyp/s.test(body||"");
}
async function probe(url){
 if(!/^https:\/\//i.test(url))return {ok:false,reason:"not_https"};
 try{
  const r=await checkedFetch(url,{headers:{Range:"bytes=0-1023",Accept:"video/*,application/vnd.apple.mpegurl,application/x-mpegurl,*/*"}});
  const type=r.headers.get("content-type")||"";
  const reader=r.body&&r.body.getReader();
  const first=reader?await reader.read():{value:new Uint8Array(),done:true};
  if(reader)await reader.cancel().catch(()=>{});
  const bytes=first.value||new Uint8Array();
  const head=Buffer.from(bytes.slice(0,256)).toString("latin1");
  return {ok:r.ok&&plausibleMedia(url,type,head),status:r.status,type,bytes:bytes.byteLength,finalUrl:r.url,reason:r.ok?"media_signature_or_mime":"http_error"};
 }catch(e){return {ok:false,reason:String(e.message||e)};}
}
(async()=>{
 const report={generatedAt:new Date().toISOString(),manifest:manifestPath,scope:"HTTP media smoke only; not Nuvio device playback",tests:[]};
 for(const p of manifest.scrapers.filter(x=>x.enabled&&!x.upstreamRepository)){
  const ctx={module:{exports:{}},fetch:checkedFetch,console,Promise,encodeURIComponent,URL,setTimeout,clearTimeout};
  vm.runInNewContext(fs.readFileSync(prefix+p.filename,"utf8"),ctx,{filename:prefix+p.filename});
  for(const id of ids){
   let streams=[],error=null;
   try{streams=await Promise.race([ctx.module.exports.getStreams(id,mediaType,season,episode),new Promise((_,reject)=>setTimeout(()=>reject(Error("provider_timeout")),timeout*4))]);}
   catch(e){error=String(e.message||e);}
   const checked=[];
   for(const s of (Array.isArray(streams)?streams:[]).slice(0,limit)){
    checked.push({title:s.title,url:s.url,probe:await probe(s.url)});
   }
   report.tests.push({provider:p.id,tmdbId:id,mediaType,season,episode,returned:Array.isArray(streams)?streams.length:0,error,checked});
  }
 }
 fs.mkdirSync("migration/reports",{recursive:true});
 fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+"\n");
 for(const t of report.tests)console.log(t.provider,t.tmdbId,"returned="+t.returned,"media_http_ok="+t.checked.filter(x=>x.probe.ok).length,t.error||"");
 if(!report.tests.some(t=>t.checked.some(x=>x.probe.ok)))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
