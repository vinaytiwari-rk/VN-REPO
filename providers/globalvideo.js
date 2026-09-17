/*
 * VN Global Video Provider
 * Repository: VN-REPO
 * Version: 1.1.0
 *
 * Public / authorized video source framework
 */

var PROVIDER_NAME = "VN Global Video";

function makeStream(source, title, url, quality, format) {
  if (!url || typeof url !== "string") {
    return null;
  }

  return {
    name: PROVIDER_NAME + " - " + source,
    title: title || source + " Stream",
    url: url,
    quality: quality || "Unknown",
    format: format || "mp4",
    provider: "globalvideo"
  };
}

function getStreams(tmdbId, mediaType, season, episode) {

  console.log(
    "[VN Global Video] Request:",
    tmdbId,
    mediaType,
    season,
    episode
  );

  /*
   * Source engine will be added in the next stage.
   *
   * Every source will be isolated so that:
   *
   * Source A error
   *      ↓
   * Source B still runs
   *      ↓
   * Source C still runs
   *
   * One failed provider will NOT break the complete scraper.
   */

  var streams = [];

  /*
   * Example:
   *
   * var stream = makeStream(
   *   "Public Source",
   *   "Public Video",
   *   "https://example.com/video.m3u8",
   *   "1080p",
   *   "m3u8"
   * );
   *
   * if (stream) {
   *   streams.push(stream);
   * }
   */

  return Promise.resolve(streams);
}

module.exports = {
  getStreams: getStreams
};