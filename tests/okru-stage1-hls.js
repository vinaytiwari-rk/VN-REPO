const fs=require("node:fs");
const id="16386530740872";
const urls=["https://ok.ru/video/"+id,"https://ok.ru/videoembed/"+id];
(async()=>{
 const out={generatedAt:new Date().toISOString(),videoId:id,results:[]};
 for(const url of urls){
  try{
   const r=await fetch(url,{headers:{"User-Agent":"Mozilla/5.0 VN-REPO-stage1","Accept":"text/html,application/xhtml+xml,*/*"}});
   const h=await r.text();
   const candidates=[];
   const re=/(https?:\\?\/\\?\/[^"'<\\ ]+(?:m3u8|mp4)[^"'<\\ ]*)/gi;
   let m; while((m=re.exec(h))&&candidates.length<20)candidates.push(m[1].replace(/\\\\/g,"\\").replace(/\\\//g,"/"));
   for(const key of ["hlsManifestUrl","hlsMasterUrl","ondemandHls"]){
    const i=h.indexOf(key); if(i>=0) candidates.push(h.slice(i,i+500));
   }
   out.results.push({url,status:r.status,ok:r.ok,bytes:Buffer.byteLength(h),candidateCount:candidates.length,candidates});
  }catch(e){out.results.push({url,status:0,ok:false,error:String(e.message||e)})}
 }
 fs.mkdirSync("migration/reports",{recursive:true});
 fs.writeFileSync("migration/reports/okru-stage1-hls.json",JSON.stringify(out,null,2)+"\n");
 for(const x of out.results) console.log(JSON.stringify(x));
})().catch(e=>{console.error(e);process.exitCode=1});
