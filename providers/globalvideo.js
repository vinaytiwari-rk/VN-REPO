/*
 * VN Global Video
 * Diagnostic Provider
 * Version: 1.3.0
 */

var PROVIDER_ID = "globalvideo";
var PROVIDER_NAME = "VN Global Video";

function getStreams(tmdbId, mediaType, season, episode) {

  console.log(
    "[VN Global Video] TEST OK",
    "TMDB:", tmdbId,
    "Type:", mediaType,
    "Season:", season,
    "Episode:", episode
  );

  return Promise.resolve([
    {
      name: PROVIDER_NAME,
      title: "Provider Connection Test",
      url: "https://example.com/test.m3u8",
      quality: "TEST",
      provider: PROVIDER_ID,
      format: "m3u8"
    }
  ]);
}

module.exports = {
  getStreams: getStreams
};