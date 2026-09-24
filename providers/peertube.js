function titleFromTmdb(tmdbId, mediaType) {
  var path = String(mediaType || "").toLowerCase() === "tv" ? "tv" : "movie";
  return fetch("https://www.themoviedb.org/" + path + "/" + encodeURIComponent(tmdbId))
    .then(function(r){ return r.text(); })
    .then(function(html){
      var m = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i);
      return m ? m[1].replace(/\s*\|\s*TMDB.*$/i, "").trim() : "";
    }).catch(function(){ return ""; });
}

function getStreams(tmdbId, mediaType, season, episode) {
  return titleFromTmdb(tmdbId, mediaType).then(function(title) {
    if (!title) return [];
    var q = title;
    if (String(mediaType).toLowerCase() === "tv" && episode) q += " " + "episode " + episode;
    return fetch("https://peertube.tv/api/v1/search/videos?search=" + encodeURIComponent(q) + "&count=8")
      .then(function(r){ return r.json(); })
      .then(function(data){
        var items = data.data || [];
        return items.filter(function(v){ return v && v.id && v.name; }).map(function(v){
          return fetch("https://peertube.tv/api/v1/videos/" + encodeURIComponent(v.id))
            .then(function(r){ return r.json(); })
            .then(function(full){
              var out = [];
              (full.streamingPlaylists || []).forEach(function(p){
                if (p && p.playlistUrl) out.push({name:"VN • PeerTube",title:v.name+" • HLS",url:p.playlistUrl,quality:"Auto"});
              });
              (full.files || []).forEach(function(f){
                if (f && f.fileUrl) out.push({name:"VN • PeerTube",title:v.name+" • MP4",url:f.fileUrl,quality:f.resolution && f.resolution.label ? f.resolution.label : "Auto"});
              });
              return out;
            }).catch(function(){ return []; });
        });
      })
      .then(function(groups){ return Promise.all(groups).then(function(x){ return [].concat.apply([],x).slice(0,12); }); });
  }).catch(function(){ return []; });
}

module.exports = { getStreams };
