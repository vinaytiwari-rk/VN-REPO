function getStreams(tmdbId, mediaType, season, episode) {
  if (String(mediaType || "").toLowerCase() !== "tv") return [];
  var s = Number(season || 1);
  var e = Number(episode || 1);
  if (s !== 1) return [];

  return fetch("https://www.themoviedb.org/tv/" + encodeURIComponent(tmdbId))
    .then(function(r){ return r.text(); })
    .then(function(html){
      var m = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i);
      var title = m ? m[1].replace(/\s*\|\s*TMDB.*$/i, "").trim() : "";
      if (!/altarboy/i.test(title)) return [];
      return [{
        name: "VN • Altarboy • Official ReelShort",
        title: "Altarboy 2026 • S01E" + String(e).padStart(2, "0") + " • Official ReelShort",
        externalUrl: e === 1
          ? "https://www.reelshort.com/episodes/episode-1-altarboy-6a7619d41dcbbd8e12015bfe-w8176edms9"
          : "https://www.reelshort.com/full-episodes/altarboy-6a7619d41dcbbd8e12015bfe"
      }];
    })
    .catch(function(){ return []; });
}

module.exports = { getStreams };
