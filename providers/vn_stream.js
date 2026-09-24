function getStreams(tmdbId, mediaType, season, episode) {
  if (!tmdbId) return Promise.resolve([]);
  var type = (mediaType || "movie").toLowerCase();
  var s = parseInt(season, 10) || 1;
  var e = parseInt(episode, 10) || 1;
  var isTv = (type === "tv" || type === "series");

  var vidlink = isTv ? "https://vidlink.pro/tv/" + tmdbId + "/" + s + "/" + e : "https://vidlink.pro/movie/" + tmdbId;
  var smashy = isTv ? "https://embed.smashystream.com/playere.php?tmdb=" + tmdbId + "&season=" + s + "&episode=" + e : "https://embed.smashystream.com/playere.php?tmdb=" + tmdbId;
  var vidsrcPro = isTv ? "https://vidsrc.pro/embed/tv/" + tmdbId + "/" + s + "/" + e : "https://vidsrc.pro/embed/movie/" + tmdbId;

  return Promise.resolve([
    {
      name: "VN Ultra • VidLink CDN (1080p)",
      title: isTv ? "S" + s + "E" + e + " • Instant 1080p CDN" : "Full Movie • 1080p Instant CDN",
      url: vidlink,
      quality: "1080p",
      headers: { "Referer": "https://vidlink.pro/" }
    },
    {
      name: "VN Ultra • Smashy VIP (Auto)",
      title: isTv ? "S" + s + "E" + e + " • Adaptive Quality" : "Full Movie • High Speed Server",
      url: smashy,
      quality: "Auto",
      headers: { "Referer": "https://embed.smashystream.com/" }
    },
    {
      name: "VN Ultra • VidSrc Pro (720p)",
      title: "Direct Fast HLS Stream",
      url: vidsrcPro,
      quality: "720p",
      headers: { "Referer": "https://vidsrc.pro/" }
    }
  ]);
}
module.exports = { getStreams };
