/*
 * VN Global Public Video Provider
 * Repository: VN-REPO
 *
 * Purpose:
 * - Nuvio-compatible provider framework
 * - Public/authorized video sources can be added here
 * - Promise-based for Nuvio compatibility
 */

function getStreams(tmdbId, mediaType, season, episode) {
  console.log(
    "[VN Global Video] Request:",
    tmdbId,
    mediaType,
    season,
    episode
  );

  /*
   * Source providers will be added here one by one.
   *
   * IMPORTANT:
   * Only return URLs that are actually playable video streams
   * and are permitted for playback/use.
   */

  return Promise.resolve([]);
}

module.exports = {
  getStreams: getStreams
};