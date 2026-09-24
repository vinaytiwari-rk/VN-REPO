/**
 * VN Universal Stream Provider for Nuvio
 * Compatible with Movies & TV Shows (Hermes JS Engine Compatible)
 */

var PROVIDER_NAME = "VN Universal Streams";

function getStreams(tmdbId, mediaType, season, episode) {
  if (!tmdbId) return Promise.resolve([]);

  var type = (mediaType || "movie").toLowerCase();
  var s = parseInt(season, 10) || 1;
  var e = parseInt(episode, 10) || 1;
  var isTv = (type === "tv" || type === "series");

  var streams = [];

  // Source 1: Direct Fast Stream Resolver (Auto / 1080p)
  var source1Url = isTv
    ? "https://vidsrc.to/embed/tv/" + tmdbId + "/" + s + "/" + e
    : "https://vidsrc.to/embed/movie/" + tmdbId;

  // Source 2: Multi-Quality High Speed Stream
  var source2Url = isTv
    ? "https://autoembed.to/tv/tmdb/" + tmdbId + "-" + s + "-" + e
    : "https://autoembed.to/movie/tmdb/" + tmdbId;

  // Source 3: Backup VIP Stream
  var source3Url = isTv
    ? "https://multiembed.mov/directstream.php?video_id=" + tmdbId + "&tmdb=1&s=" + s + "&e=" + e
    : "https://multiembed.mov/directstream.php?video_id=" + tmdbId + "&tmdb=1";

  // Build Nuvio standard stream objects
  streams.push({
    name: "VN VIP • Server 1 (1080p)",
    title: isTv ? "Season " + s + " Episode " + e + " [Fast HLS]" : "Full Movie • 1080p High Speed",
    url: source3Url,
    quality: "1080p",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      "Referer": "https://multiembed.mov/"
    }
  });

  streams.push({
    name: "VN Stream • Server 2 (Auto)",
    title: isTv ? "S" + s + " E" + e + " • Multi-Source" : "Full Movie • Auto Quality",
    url: source2Url,
    quality: "Auto",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      "Referer": "https://autoembed.to/"
    }
  });

  streams.push({
    name: "VN Cloud • Server 3 (Backup)",
    title: isTv ? "S" + s + " E" + e + " • Backup Stream" : "Full Movie • Fast Stream",
    url: source1Url,
    quality: "720p",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      "Referer": "https://vidsrc.to/"
    }
  });

  return Promise.resolve(streams);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    getStreams: getStreams
  };
}
