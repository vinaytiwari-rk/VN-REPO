// Repository discovery only. Never represents a CloudStream extension as a playable Nuvio plugin.
const fs = require("fs");
const https = require("https");
const sources = JSON.parse(fs.readFileSync("migration/cloudstream-sources.json","utf8")).sources;
function get(url) {
  return new Promise((resolve,reject)=>{
    const req=https.get(url,{headers:{"User-Agent":"VN-REPO-source-audit","Accept":"application/vnd.github+json"}},r=>{
      let body="";r.on("data",chunk=>body+=chunk);
      r.on("end",()=>{try{resolve({status:r.statusCode,data:JSON.parse(body)})}catch(e){resolve({status:r.statusCode})}});
    });
    req.setTimeout(8000,()=>req.destroy(Error("timeout")));
    req.on("error",reject);
  });
}
async function main(){
  const report=[];
  for(const source of sources){
    const parsed=new URL(source.url);
    const path=parsed.pathname.split("/").filter(Boolean);
    const item={url:source.url,portStatus:source.portStatus,verifiedPlayable:false};
    if(parsed.hostname==="github.com"&&path.length>=2){
      try{
        const r=await get("https://api.github.com/repos/"+encodeURIComponent(path[0])+"/"+encodeURIComponent(path[1]));
        item.httpStatus=r.status;
        if(r.status===200){
          item.defaultBranch=r.data.default_branch;
          item.primaryLanguage=r.data.language;
          item.archived=r.data.archived;
          item.license=r.data.license&&r.data.license.spdx_id||"NOASSERTION";
          item.lastPushed=r.data.pushed_at;
        }
      }catch(e){item.error=String(e.message||e);}
    }else{item.audit="manual review: non-GitHub source";}
    report.push(item);
  }
  fs.mkdirSync("migration/reports",{recursive:true});
  fs.writeFileSync("migration/reports/source-audit.json",JSON.stringify({generatedAt:new Date().toISOString(),sources:report},null,2)+"\n");
  console.log("Audited",report.length,"sources. No Kotlin providers automatically converted or playback verified.");
}
main().catch(e=>{console.error(e);process.exitCode=1;});
