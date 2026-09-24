function titleFromTmdb(tmdbId, mediaType) {
  var path = String(mediaType || "").toLowerCase() === "tv" ? "tv" : "movie";
  return fetch("https://www.themoviedb.org/" + path + "/" + encodeURIComponent(tmdbId))
    .then(function(r) { if (!r.ok) throw Error("TMDB unavailable"); return r.text(); })
    .then(function(html) {
      var m = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i);
      return m ? m[1].replace(/\s*\|\s*TMDB.*$/i, "").trim() : "";
    }).catch(function() { return ""; });
}
function isOpenLicensed(meta) {
  var license = String(meta.licenseurl || meta.rights || "").toLowerCase();
  return /creativecommons\.org\/(publicdomain|licenses\/(by|by-sa)\/)|public domain|cc0/.test(license);
}
function getStreams(tmdbId, mediaType) {
  if (!tmdbId || mediaType === "tv") return Promise.resolve([]);
  return titleFromTmdb(tmdbId, mediaType).then(function(title) {
    if (!title) return [];
    var q = 'title:("' + title.replace(/["\\]/g, "") + '") AND mediatype:movies';
    return fetch("https://archive.org/advancedsearch.php?q=" + encodeURIComponent(q) + "&fl[]=identifier,title&rows=5&output=json")
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var docs = data && data.response && data.response.docs || [];
        return Promise.all(docs.filter(function(d) { return d.identifier; }).map(function(d) {
          return fetch("https://archive.org/metadata/" + encodeURIComponent(d.identifier))
            .then(function(r) { return r.json(); })
            .then(function(detail) {
              if (!detail || !detail.metadata || !isOpenLicensed(detail.metadata)) return [];
              return (detail.files || []).filter(function(f) {
                return f && f.name && /\.(mp4|m4v)$/i.test(f.name) && !/sample|thumb|preview/i.test(f.name);
              }).slice(0, 3).map(function(f) {
                return {name:"VN Internet Archive • Open Licensed",title:String(d.title || title) + " • MP4",url:"https://archive.org/download/" + encodeURIComponent(d.identifier) + "/" + f.name.split("/").map(encodeURIComponent).join("/"),quality:"Auto"};
              });
            }).catch(function() { return []; });
        })).then(function(groups) { return [].concat.apply([], groups); });
      });
  }).catch(function() { return []; });
}
module.exports = { getStreams: getStreams };
