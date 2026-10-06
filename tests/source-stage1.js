// Stage-1 public source technical audit: accessibility/metadata only.
// This does not infer ownership, authorization, or redistribution rights.
const fs=require("node:fs");
const urls=[
"https://lacajalgbt.site/","https://b4watch.com/","https://ok.ru/gaythemed.cinema",
"https://ok.ru/video/16386530740872","https://ok.ru/profile/599185626416/video",
"https://ok.ru/profile/909983019986","https://ok.ru/profile/563768470265",
"https://ok.ru/profile/910092089708","https://ok.ru/profile/588321533769",
"https://vk.ru/id690916702","https://vk.ru/gogogox","https://vk.ru/lemandim",
"https://vk.ru/thekurono","https://vk.ru/gaymovies","https://vk.ru/gayfilmsss",
"https://vk.ru/gstorylines","https://ok.ru/profile/573805820588"
];
const timeout=12000;
async function get(url){
 const c=new AbortController(),t=setTimeout(()=>c.abort(),timeout);
 try{
  const r=await fetch(url,{redirect:"follow",signal:c.signal,headers:{"User-Agent":"VN-REPO-stage1-audit/1.0","Accept":"text/html,application/xhtml+xml,*/*"}});
  const body=await r.text();
  return {url,status:r.status,ok:r.ok,finalUrl:r.url,contentType:r.headers.get("content-type")||"",bytes:Buffer.byteLength(body),hasVideoEmbed:/videoembed|hls|m3u8|mp4|player/i.test(body)};
 }catch(e){return {url,status:0,ok:false,error:String(e.message||e)}}
 finally{clearTimeout(t)}
}
(async()=>{
 const report={generatedAt:new Date().toISOString(),scope:"Stage-1 technical accessibility only; no authorization inference",results:[]};
 for(const u of urls) report.results.push(await get(u));
 fs.mkdirSync("migration/reports",{recursive:true});
 fs.writeFileSync("migration/reports/stage1-public-sources.json",JSON.stringify(report,null,2)+"\n");
 for(const x of report.results) console.log(x.status,x.ok,x.url,x.hasVideoEmbed?"player/media-marker":"");
})().catch(e=>{console.error(e);process.exitCode=1});
