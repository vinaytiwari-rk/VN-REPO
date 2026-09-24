const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
assert(manifest.name && manifest.version && Array.isArray(manifest.scrapers));
const ids = new Set();
for (const item of manifest.scrapers) {
  assert(item.id && !ids.has(item.id), "Duplicate/missing provider ID");
  ids.add(item.id);
  assert(fs.existsSync(item.filename), "Missing provider file: " + item.filename);
  assert(Array.isArray(item.supportedTypes));
  const code = fs.readFileSync(item.filename, "utf8");
  new vm.Script(code, { filename: item.filename });
}
async function check() {
  const sampleHtml = '<meta property="og:title" content="Example Movie | TMDB">';
  const mockFetch = (url) => {
    const value = String(url);
    const body = value.includes("themoviedb.org") ? sampleHtml :
      value.includes("dailymotion.com") ? { list: [{id:"x123",title:"Example Movie",status:"published"}] } :
      value.includes("search/videos") ? {data:[{id:"peer1",name:"Example Movie"}]} :
      value.includes("/videos/peer1") ? {streamingPlaylists:[{playlistUrl:"https://example.org/film.m3u8"}],files:[]} :
      value.includes("commons.wikimedia.org") ? {query:{pages:{"1":{title:"File:Example Movie.mp4",imageinfo:[{url:"https://upload.wikimedia.org/example.mp4",mime:"video/mp4",extmetadata:{LicenseShortName:{value:"CC BY 4.0"}}}]}}}} :
      value.includes("archive.org/metadata/") ? {metadata:{licenseurl:"https://creativecommons.org/licenses/by/4.0/"},files:[{name:"film.mp4"}]} :
      {response:{docs:[{identifier:"example-movie",title:"Example Movie"}]}};
    return Promise.resolve({ok:true,text:()=>Promise.resolve(String(body)),json:()=>Promise.resolve(body)});
  };
  for (const p of manifest.scrapers.filter(p=>p.enabled)) {
    const ctx = {module:{exports:{}},fetch:mockFetch,console,Promise,encodeURIComponent};
    vm.runInNewContext(fs.readFileSync(p.filename,"utf8"),ctx,{filename:p.filename});
    assert.strictEqual(typeof ctx.module.exports.getStreams,"function",p.id);
    const streams = await ctx.module.exports.getStreams("550","movie");
    assert(Array.isArray(streams),p.id+" must return array");
    for (const s of streams) assert(s.name && s.title && s.url && /^https:\/\//.test(s.url),p.id+" requires playable URL");
    assert(streams.length > 0,p.id+" mock fixture returned no streams");
    console.log("PASS",p.id,streams.length,"mock results");
  }
  console.log("PASS manifest + all provider JavaScript files; mocked provider contracts (not live playback)");
}
check().catch(e=>{console.error(e);process.exit(1)});
