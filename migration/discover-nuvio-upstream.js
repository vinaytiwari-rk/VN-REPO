// Discover third-party Nuvio repositories without copying their code or claiming playback.
const fs=require("node:fs");
const sources=[
 {name:"Yoru's Repo",manifest:"https://raw.githubusercontent.com/yoruix/nuvio-providers/refs/heads/main/manifest.json"},
 {name:"Tapframe's Repo",manifest:"https://raw.githubusercontent.com/iberiaimm/nuvio-providers/refs/heads/main/manifest.json"}
];
async function fetchJson(url){
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),15000);
 try{const r=await fetch(url,{signal:controller.signal});if(!r.ok)throw Error("HTTP "+r.status);return await r.json();}
 finally{clearTimeout(timer);}
}
(async()=>{
 const report={generatedAt:new Date().toISOString(),scope:"Upstream manifest discovery only; enabled does not imply working or licensed playback",repositories:[]};
 for(const source of sources){
  const entry={...source,providers:[],error:null};
  try{
   const data=await fetchJson(source.manifest);
   const providers=Array.isArray(data)?data:data.scrapers;
   if(!Array.isArray(providers))throw Error("No provider array");
   const base=new URL(source.manifest);
   entry.providers=providers.map(p=>({
    id:p.id,name:p.name,enabled:!!p.enabled,formats:p.formats||[],
    filename:p.filename,codeUrl:new URL(p.filename,base).href,
    status:"upstream-listed; playback unverified"
   }));
   entry.enabledCount=entry.providers.filter(p=>p.enabled).length;
  }catch(e){entry.error=String(e.message||e);}
  report.repositories.push(entry);
  console.log(source.name,entry.providers.length,"listed",entry.enabledCount||0,"upstream enabled",entry.error||"");
 }
 fs.mkdirSync("migration/reports",{recursive:true});
 fs.writeFileSync("migration/reports/nuvio-upstream-discovery.json",JSON.stringify(report,null,2)+"\n");
 if(report.repositories.every(x=>x.error))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
