function getStreams(tmdbId, mediaType, season, episode) {
  if (!tmdbId) return Promise.resolve([]);
  var type = (mediaType || "movie").toLowerCase();
  var s = parseInt(season, 10) || 1;
  var e = parseInt(episode, 10) || 1;
  var isTv = (type === "tv" || type === "series");

  var animeSrc1 = isTv ? "https://vidsrc.to/embed/tv/" + tmdbId + "/" + s + "/" + e : "https://vidsrc.to/embed/movie/" + tmdbId;
  var animeSrc2 = isTv ? "https://vidlink.pro/tv/" + tmdbId + "/" + s + "/" + e : "https://vidlink.pro/movie/" + tmdbId;

  return Promise.resolve([
    {
      name: "VN Anime • Server 1 (Sub & Dub)",
      title: isTv ? "Episode " + e + " • English/Japanese Sub & Dub" : "Anime Movie • HD",
      url: animeSrc2,
      quality: "1080p",
      headers: { "Referer": "https://vidlink.pro/" }
    },
    {
      name: "VN Anime • Server 2 (Fast)",
      title: "High Speed Anime Server",
      url: animeSrc1,
      quality: "720p",
      headers: { "Referer": "https://vidsrc.to/" }
    }
  ]);
}
module.exports = { getStreams };
