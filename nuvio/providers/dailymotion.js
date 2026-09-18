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
    if (String(mediaType).toLowerCase() === "tv" && episode) q += " S" + String(season || 1).padStart(2,"0") + "E" + String(episode).padStart(2,"0");
    return fetch("https://api.dailymotion.com/videos?search=" + encodeURIComponent(q) + "&fields=id,title,thumbnail_url,status&limit=8")
      .then(function(r){ return r.json(); })
      .then(function(data){
        return (data.list || []).filter(function(v){ return v && v.id && (!v.status || v.status === "published"); }).map(function(v){
          return {
            name: "VN • Dailymotion",
            title: (v.title || title) + " • Official Player",
            externalUrl: "https://geo.dailymotion.com/player.html?video=" + encodeURIComponent(v.id)
          };
        });
      });
  }).catch(function(){ return []; });
}

module.exports = { getStreams };
