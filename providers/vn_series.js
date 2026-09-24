function getStreams(tmdbId, mediaType, season, episode) {
  if (!tmdbId) return Promise.resolve([]);
  var s = parseInt(season, 10) || 1;
  var e = parseInt(episode, 10) || 1;

  var s1 = "https://vidsrc.cc/v2/embed/tv/" + tmdbId + "/" + s + "/" + e;
  var s2 = "https://vidlink.pro/tv/" + tmdbId + "/" + s + "/" + e;
  var s3 = "https://autoembed.to/tv/tmdb/" + tmdbId + "-" + s + "-" + e;

  return Promise.resolve([
    {
      name: "VN Series • Server 1 (All Episodes)",
      title: "Season " + s + " Episode " + e + " • HD Direct",
      url: s2,
      quality: "1080p",
      headers: { "Referer": "https://vidlink.pro/" }
    },
    {
      name: "VN Series • Server 2 (HLS Fast)",
      title: "Season " + s + " Episode " + e + " • Smooth Stream",
      url: s1,
      quality: "720p",
      headers: { "Referer": "https://vidsrc.cc/" }
    },
    {
      name: "VN Series • Server 3 (Backup)",
      title: "Season " + s + " Episode " + e + " • Auto Quality",
      url: s3,
      quality: "Auto",
      headers: { "Referer": "https://autoembed.to/" }
    }
  ]);
}
module.exports = { getStreams };
