function getStreams(tmdbId, mediaType, season, episode) {
  if (!tmdbId) return Promise.resolve([]);
  var type = (mediaType || "movie").toLowerCase();
  var s = parseInt(season, 10) || 1;
  var e = parseInt(episode, 10) || 1;
  var isTv = (type === "tv" || type === "series");

  var url1 = isTv ? "https://multiembed.mov/directstream.php?video_id=" + tmdbId + "&tmdb=1&s=" + s + "&e=" + e : "https://multiembed.mov/directstream.php?video_id=" + tmdbId + "&tmdb=1";
  var url2 = isTv ? "https://embed.smashystream.com/playere.php?tmdb=" + tmdbId + "&season=" + s + "&episode=" + e : "https://embed.smashystream.com/playere.php?tmdb=" + tmdbId;

  return Promise.resolve([
    {
      name: "VN Cinema • Multi-Audio (Hindi/Tamil/Telugu)",
      title: "Regional & Multi-Language Tracks",
      url: url1,
      quality: "1080p",
      headers: { "Referer": "https://multiembed.mov/" }
    },
    {
      name: "VN Cinema • English/Original Audio",
      title: "Original High Bitrate Stream",
      url: url2,
      quality: "Auto",
      headers: { "Referer": "https://embed.smashystream.com/" }
    }
  ]);
}
module.exports = { getStreams };
