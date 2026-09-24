function getStreams(tmdbId, mediaType, season, episode) {
  if (!tmdbId) return Promise.resolve([]);
  var type = (mediaType || "movie").toLowerCase();
  var s = parseInt(season, 10) || 1;
  var e = parseInt(episode, 10) || 1;
  var isTv = (type === "tv" || type === "series");

  var backupUrl = isTv ? "https://vidsrc.net/embed/tv/" + tmdbId + "/" + s + "/" + e : "https://vidsrc.net/embed/movie/" + tmdbId;

  return Promise.resolve([
    {
      name: "VN Cloud • Backup Server VIP",
      title: "Reliable Fallback Stream",
      url: backupUrl,
      quality: "Auto",
      headers: { "Referer": "https://vidsrc.net/" }
    }
  ]);
}
module.exports = { getStreams };
