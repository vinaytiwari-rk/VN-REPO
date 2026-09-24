function getStreams(tmdbId, mediaType, season, episode) {
  if (!tmdbId) return Promise.resolve([]);
  var type = (mediaType || "movie").toLowerCase();
  var s = parseInt(season, 10) || 1;
  var e = parseInt(episode, 10) || 1;
  var isTv = (type === "tv" || type === "series");

  var hindiSrc1 = isTv ? "https://autoembed.to/tv/tmdb/" + tmdbId + "-" + s + "-" + e : "https://autoembed.to/movie/tmdb/" + tmdbId;
  var hindiSrc2 = isTv ? "https://multiembed.mov/?video_id=" + tmdbId + "&tmdb=1&s=" + s + "&e=" + e : "https://multiembed.mov/?video_id=" + tmdbId + "&tmdb=1";

  return Promise.resolve([
    {
      name: "VN Hindi • BollyServer 1 (Dual Audio)",
      title: isTv ? "Episode " + e + " • Hindi / Dual Audio" : "Hindi Dubbed / Bollywood HD",
      url: hindiSrc1,
      quality: "1080p",
      headers: { "Referer": "https://autoembed.to/" }
    },
    {
      name: "VN Hindi • BollyServer 2 (Multi)",
      title: "Hindi Audio Available • Fast Server",
      url: hindiSrc2,
      quality: "720p",
      headers: { "Referer": "https://multiembed.mov/" }
    }
  ]);
}
module.exports = { getStreams };
