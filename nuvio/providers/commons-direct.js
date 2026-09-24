// Wikimedia Commons: only freely licensed MP4 files matching a TMDB title.
function titleFromTmdb(id,type) {
  var kind = String(type).toLowerCase()==="tv" ? "tv" : "movie";
  return fetch("https://www.themoviedb.org/"+kind+"/"+encodeURIComponent(id))
    .then(function(r){if(!r.ok)throw Error("TMDB unavailable");return r.text();})
    .then(function(html){
      var m=html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i);
      return m?m[1].replace(/\s*\|\s*TMDB.*$/i,"").trim():"";
    }).catch(function(){return "";});
}
function norm(s){return String(s||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();}
function getStreams(tmdbId,mediaType){
  if(!tmdbId||String(mediaType).toLowerCase()==="tv")return Promise.resolve([]);
  return titleFromTmdb(tmdbId,mediaType).then(function(title){
    if(!title)return [];
    var api="https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch="+encodeURIComponent('filetype:video "'+title.replace(/"/g,"")+'"')+"&gsrnamespace=6&gsrlimit=10&prop=imageinfo&iiprop=url%7Cmime%7Cextmetadata&format=json&origin=*";
    return fetch(api).then(function(r){if(!r.ok)throw Error("Commons unavailable");return r.json();})
      .then(function(data){
        var pages=data&&data.query&&data.query.pages||{};
        return Object.keys(pages).map(function(k){
          var p=pages[k],f=p.imageinfo&&p.imageinfo[0],meta=f&&f.extmetadata||{};
          var license=String(meta.LicenseShortName&&meta.LicenseShortName.value||"").toLowerCase();
          var filename=String(p.title||"").replace(/^File:/i,"").replace(/\.mp4$/i,"");
          if(!f||f.mime!=="video/mp4"||!/^https:\/\//.test(f.url||""))return null;
          if(!/^(cc0|cc by|cc-by|public domain)/i.test(license))return null;
          if(norm(filename).indexOf(norm(title))===-1)return null;
          return {name:"VN Wikimedia Commons",title:filename+" • Open licensed MP4",url:f.url,quality:"Auto"};
        }).filter(Boolean).slice(0,5);
      });
  }).catch(function(){return [];});
}
module.exports={getStreams:getStreams};
