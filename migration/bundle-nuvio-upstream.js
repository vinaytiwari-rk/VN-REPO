// Build a single Nuvio manifest from VN and GPL-3.0 upstream provider repositories.
// Generated provider code remains attributed to its original authors.
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
const upstream=[
 {key:"yoru",repo:"yoruix/nuvio-providers",branch:"main"},
 {key:"tapframe",repo:"iberiaimm/nuvio-providers",branch:"main"}
];
async function download(url){
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),20000);
 try{const r=await fetch(url,{signal:ctrl.signal,headers:{"User-Agent":"VN-REPO-bundler"}});
 if(!r.ok)throw Error(r.status+" "+url);return await r.text();}
 finally{clearTimeout(timer);}
}
function safeFile(name){return typeof name==="string"&&/^providers\/[a-zA-Z0-9_.-]+\.js$/.test(name);}
async function main(){
 const base=JSON.parse(fs.readFileSync("manifest.json","utf8"));
 const local=base.scrapers.filter(p=>!p.upstreamRepository);
 const seen=new Set(local.map(p=>p.id));
 const canonicalName=p=>String(p.name||p.id).toLowerCase().replace(/[^a-z0-9]/g,"");
 const seenNames=new Set(local.map(canonicalName));
 let skippedDuplicates=0;
 const added=[],notices=[];
 for(const src of upstream){
  const raw="https://raw.githubusercontent.com/"+src.repo+"/"+src.branch+"/";
  const [manifestText,license]=await Promise.all([download(raw+"manifest.json"),download(raw+"LICENSE")]);
  const data=JSON.parse(manifestText),entries=Array.isArray(data)?data:data.scrapers;
  if(!Array.isArray(entries)||!entries.length)throw Error("Missing providers: "+src.repo);
  fs.mkdirSync("upstream/"+src.key+"/providers",{recursive:true});
  fs.writeFileSync("upstream/"+src.key+"/LICENSE",license);
  let count=0;
  for(const p of entries){
   if(!safeFile(p.filename)||typeof p.id!=="string"||!/^[a-z0-9_-]+$/i.test(p.id))throw Error("Unsafe provider entry in "+src.repo);
   const nameKey=canonicalName(p);
   if(seenNames.has(nameKey)){skippedDuplicates++;continue;}
   seenNames.add(nameKey);
   const code=await download(raw+p.filename);
   const file="upstream/"+src.key+"/"+p.filename;
   fs.writeFileSync(file,code);
   let id=p.id;
   if(seen.has(id))id=src.key+"-"+id;
   if(seen.has(id))throw Error("Duplicate ID: "+id);
   seen.add(id);
   added.push({...p,id,filename:file,upstreamRepository:src.repo,upstreamId:p.id});
   count++;
  }
  notices.push(src.repo+" ("+count+" provider files, GPL-3.0): https://github.com/"+src.repo);
 }
 const manifest={...base,version:"5.0.0",name:"VN Ultra v5 - Clean Providers",description:"VN and bundled GPL-3.0 upstream Nuvio JavaScript providers. Upstream enabled does not guarantee playback.",scrapers:[...local,...added]};
 const ids=manifest.scrapers.map(p=>p.id);
 if(ids.length!==new Set(ids).size)throw Error("Duplicate provider IDs");
 for(const p of manifest.scrapers)if(!fs.existsSync(p.filename))throw Error("Missing provider "+p.filename);
 fs.writeFileSync("manifest.json",JSON.stringify(manifest,null,2)+"\n");
 const rawBase="https://raw.githubusercontent.com/vinaytiwari-rk/VN-REPO/main/";
 const cleanV5={...manifest,scrapers:manifest.scrapers.map(p=>({...p,filename:rawBase+p.filename}))};
 fs.mkdirSync("v5",{recursive:true});
 fs.writeFileSync("v5/manifest.json",JSON.stringify(cleanV5,null,2)+"\n");
 fs.writeFileSync("upstream/NOTICE.md","# Bundled upstream provider code\n\n"+notices.join("\n")+"\n\nEach upstream LICENSE is included in its directory. Provider code is third-party and is not independently playback-verified. Use only content you are authorized to access.\n");
 console.log("Bundled",added.length,"upstream entries;",manifest.scrapers.length,"total; skipped duplicate names:",skippedDuplicates);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
