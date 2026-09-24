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
    var q = 'title:("' + title.replace(/"/g, "") + '") AND mediatype:movies';
    return fetch("https://archive.org/advancedsearch.php?q=" + encodeURIComponent(q) + "&fl[]=identifier,title,mediatype&rows=10&page=1&output=json")
      .then(function(r){ return r.json(); })
      .then(function(data){
        var docs = data && data.response && data.response.docs ? data.response.docs : [];
        return docs.map(function(v){
          if (!v || !v.identifier) return null;
          return {
            name: "VN • Internet Archive",
            title: (v.title || title) + " • Archive Item",
            externalUrl: "https://archive.org/details/" + encodeURIComponent(v.identifier)
          };
        }).filter(Boolean);
      });
  }).catch(function(){ return []; });
}

module.exports = { getStreams };
