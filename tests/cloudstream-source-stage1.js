// Stage-1 audit for every CloudStream source in migration/cloudstream-sources.json.
// This checks repository/page reachability and records HTTP metadata only.
// It does NOT infer authorization, content rights, Nuvio compatibility, or playback.
const fs=require("node:fs");
const sources=JSON.parse(fs.readFileSync("migration/cloudstream-sources.json","utf8")).sources||[];
const timeout=15000;
async function probe(url){
  const c=new AbortController(), t=setTimeout(()=>c.abort(),timeout);
  try{
    const r=await fetch(url,{redirect:"follow",signal:c.signal,headers:{
      "User-Agent":"VN-REPO-cloudstream-source-audit/1.0",
      "Accept":"text/html,application/xhtml+xml,application/json,*/*"
    }});
    const body=await r.text();
    return {
      url,status:r.status,ok:r.ok,finalUrl:r.url,
      contentType:r.headers.get("content-type")||"",
      bytes:Buffer.byteLength(body),
      gitLike:/github\.com|codeberg\.org|gitlab\.com/i.test(r.url),
      repositoryMarker:/repository|repos|git|cloudstream|extension|provider/i.test(body)
    };
  }catch(e){return {url,status:0,ok:false,error:String(e.message||e)}}
  finally{clearTimeout(t)}
}
(async()=>{
  const started=Date.now();
  const results=[];
  for(const s of sources) results.push(await probe(s.url));
  const summary={
    total:results.length,
    http2xx:results.filter(x=>x.status>=200&&x.status<300).length,
    http3xx:results.filter(x=>x.status>=300&&x.status<400).length,
    http4xx:results.filter(x=>x.status>=400&&x.status<500).length,
    http5xx:results.filter(x=>x.status>=500).length,
    networkFailure:results.filter(x=>x.status===0).length
  };
  const report={generatedAt:new Date().toISOString(),durationMs:Date.now()-started,scope:"technical reachability only; no authorization/compatibility/playback inference",summary,results};
  fs.mkdirSync("migration/reports",{recursive:true});
  fs.writeFileSync("migration/reports/cloudstream-source-stage1.json",JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify(summary));
  if(results.length!==sources.length) process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
