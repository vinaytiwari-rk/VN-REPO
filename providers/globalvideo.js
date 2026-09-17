/*
 * VN Global Video Provider
 * Version: 1.2.0
 *
 * Nuvio-compatible public/authorized video source engine.
 *
 * Current stage:
 * - Safe request handling
 * - Source isolation
 * - Stream normalization
 * - TMDB metadata hook
 *
 * Individual public platforms will be added after the core is verified.
 */

var PROVIDER_ID = "globalvideo";
var PROVIDER_NAME = "VN Global Video";

function log(message, value) {
  try {
    if (value !== undefined) {
      console.log("[VN Global Video] " + message, value);
    } else {
      console.log("[VN Global Video] " + message);
    }
  } catch (e) {}
}

function makeStream(source, title, url, quality, format, headers) {
  if (!url || typeof url !== "string") {
    return null;
  }

  var stream = {
    name: PROVIDER_NAME + " - " + source,
    title: title || source + " Stream",
    url: url,
    quality: quality || "Unknown",
    provider: PROVIDER_ID,
    format: format || "mp4"
  };

  if (headers && typeof headers === "object") {
    stream.headers = headers;
  }

  return stream;
}

function normalizeStreams(source, items) {
  if (!Array.isArray(items)) {
    return [];
  }

  var result = [];

  items.forEach(function (item) {
    if (!item || typeof item !== "object") {
      return;
    }

    var stream = makeStream(
      source,
      item.title,
      item.url,
      item.quality,
      item.format,
      item.headers
    );

    if (stream) {
      result.push(stream);
    }
  });

  return result;
}

function safeSource(sourceName, sourceFunction) {
  try {
    var result = sourceFunction();

    if (!result || typeof result.then !== "function") {
      return Promise.resolve([]);
    }

    return result
      .then(function (streams) {
        return normalizeStreams(sourceName, streams);
      })
      .catch(function (error) {
        log(sourceName + " failed:", error && error.message);
        return [];
      });
  } catch (error) {
    log(sourceName + " crashed:", error && error.message);
    return Promise.resolve([]);
  }
}

/*
 * Metadata layer.
 *
 * Nuvio supplies the TMDB ID to the provider.
 * This layer will later resolve:
 *
 * TMDB ID
 *   ↓
 * title
 * year
 * original title
 * media type
 * season
 * episode
 *
 * We keep this isolated from the actual video sources.
 */

function getMetadata(tmdbId, mediaType, season, episode) {
  log("Metadata request:", tmdbId);

  /*
   * Metadata implementation will be connected after
   * the core provider test.
   */

  return Promise.resolve({
    tmdbId: String(tmdbId || ""),
    mediaType: mediaType || "movie",
    season: season == null ? null : season,
    episode: episode == null ? null : episode,
    title: null,
    year: null
  });
}

/*
 * Source registry.
 *
 * Each source gets its own function.
 * If one source fails, the remaining sources continue.
 */

var SOURCES = [];

/*
 * Main Nuvio entry point.
 */

function getStreams(tmdbId, mediaType, season, episode) {

  log(
    "Request: " +
      String(mediaType || "") +
      " / TMDB " +
      String(tmdbId || "")
  );

  return getMetadata(
    tmdbId,
    mediaType,
    season,
    episode
  )
    .then(function (metadata) {

      if (!metadata || !metadata.tmdbId) {
        return [];
      }

      if (SOURCES.length === 0) {
        log("No source modules enabled yet.");
        return [];
      }

      var requests = SOURCES.map(function (source) {
        return safeSource(
          source.name,
          function () {
            return source.getStreams(metadata);
          }
        );
      });

      return Promise.all(requests)
        .then(function (results) {

          var streams = [];

          results.forEach(function (sourceStreams) {
            if (Array.isArray(sourceStreams)) {
              sourceStreams.forEach(function (stream) {
                streams.push(stream);
              });
            }
          });

          return streams;
        });
    })
    .catch(function (error) {

      log(
        "Provider error:",
        error && error.message
      );

      return [];
    });
}

module.exports = {
  getStreams: getStreams
};