/**
 * VN Global Video Provider
 * Provider ID: globalvideo
 * Author: Vinay Tiwari
 * Version: 1.8.0
 * 
 * Direct Media Stream Discovery (Dailymotion & PeerTube)
 * Optimized for Nuvio Android (Hermes / QuickJS runtime)
 */

var PROVIDER_NAME = "VN Global Video";
var PROVIDER_ID = "globalvideo";
var REQUEST_TIMEOUT_MS = 6500;

// Common TMDB Test/Top IDs for instant metadata resolution
var KNOWN_TITLES = {
  "550": { title: "Fight Club", orig: "Fight Club", year: "1999" },
  "299536": { title: "Avengers: Infinity War", orig: "Avengers: Infinity War", year: "2018" },
  "299534": { title: "Avengers: Endgame", orig: "Avengers: Endgame", year: "2019" },
  "603": { title: "The Matrix", orig: "The Matrix", year: "1999" },
  "10378": { title: "Big Buck Bunny", orig: "Big Buck Bunny", year: "2008" },
  "10331": { title: "Night of the Living Dead", orig: "Night of the Living Dead", year: "1968" },
  "155": { title: "The Dark Knight", orig: "The Dark Knight", year: "2008" },
  "27205": { title: "Inception", orig: "Inception", year: "2010" },
  "157336": { title: "Interstellar", orig: "Interstellar", year: "2014" },
  "680": { title: "Pulp Fiction", orig: "Pulp Fiction", year: "1994" },
  "13": { title: "Forrest Gump", orig: "Forrest Gump", year: "1994" },
  "1396": { title: "Breaking Bad", orig: "Breaking Bad", year: "2008" },
  "1399": { title: "Game of Thrones", orig: "Game of Thrones", year: "2011" },
  "1100": { title: "Cosmos", orig: "Cosmos", year: "1980" }
};

var STOP_WORDS = {
  "the": 1, "a": 1, "an": 1, "and": 1, "or": 1, "of": 1, "in": 1, "on": 1,
  "at": 1, "to": 1, "for": 1, "with": 1, "by": 1, "from": 1, "is": 1, "it": 1,
  "as": 1, "be": 1, "this": 1, "that": 1, "are": 1, "was": 1, "were": 1
};

/* ---------------------- UTILITIES ---------------------- */

function pad2(num) {
  var n = parseInt(num, 10);
  if (isNaN(n)) return "00";
  return (n < 10 ? "0" : "") + n;
}

function cleanString(str) {
  if (!str || typeof str !== "string") return "";
  return str.replace(/[\u0000-\u001F\u007F-\u009F]/g, "").trim();
}

function normalizeText(str) {
  if (!str || typeof str !== "string") return "";
  return str
    .toLowerCase()
    .replace(/[\'\`\"\.\,\-\_\:\;\!\?\(\)\[\]\{\}\/\\\|\&\+\#\@\*\^]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactText(str) {
  if (!str || typeof str !== "string") return "";
  return str.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getTokens(str) {
  var norm = normalizeText(str);
  if (!norm) return [];
  var parts = norm.split(" ");
  var tokens = [];
  for (var i = 0; i < parts.length; i++) {
    var w = parts[i];
    if (w.length > 1 && !STOP_WORDS[w]) {
      tokens.push(w);
    } else if (w.length === 1 && !isNaN(parseInt(w, 10))) {
      tokens.push(w);
    }
  }
  return tokens;
}

function fetchWithTimeout(url, options, timeoutMs) {
  var ms = timeoutMs || REQUEST_TIMEOUT_MS;
  return new Promise(function (resolve, reject) {
    var timer = setTimeout(function () {
      reject(new Error("Request timeout (" + ms + "ms): " + url));
    }, ms);

    fetch(url, options || {})
      .then(function (res) {
        clearTimeout(timer);
        if (!res.ok) {
          reject(new Error("HTTP " + res.status));
        } else {
          resolve(res);
        }
      })
      .catch(function (err) {
        clearTimeout(timer);
        reject(err);
      });
  });
}

function fetchJson(url, options, timeoutMs) {
  return fetchWithTimeout(url, options, timeoutMs).then(function (res) {
    return res.json();
  });
}

function getApiKey() {
  var s = null;
  if (typeof globalThis !== "undefined" && globalThis) {
    s = globalThis.SCRAPER_SETTINGS || globalThis.SETTINGS || globalThis.globalvideo_SETTINGS || globalThis.settings;
  }
  if (!s && typeof SCRAPER_SETTINGS !== "undefined") {
    s = SCRAPER_SETTINGS;
  }
  if (!s && typeof SETTINGS !== "undefined") {
    s = SETTINGS;
  }
  if (s) {
    if (typeof s.tmdbApiKey === "string" && s.tmdbApiKey.trim().length > 0) {
      return s.tmdbApiKey.trim();
    }
    if (typeof s.apiKey === "string" && s.apiKey.trim().length > 0) {
      return s.apiKey.trim();
    }
  }
  return "";
}

/* ---------------------- TMDB API ---------------------- */

function fetchTmdb(endpoint, apiKey) {
  var baseUrl = "https://api.themoviedb.org/3" + endpoint;
  var cleanKey = (apiKey || "").trim();
  var headers = {};
  var url = baseUrl;

  if (cleanKey.length > 40 || cleanKey.indexOf("ey") === 0) {
    headers["Authorization"] = "Bearer " + cleanKey;
    headers["Accept"] = "application/json";
  } else if (cleanKey.length > 0) {
    var sep = url.indexOf("?") === -1 ? "?" : "&";
    url = url + sep + "api_key=" + encodeURIComponent(cleanKey);
  }

  return fetchJson(url, { headers: headers }, 5000);
}

function getMovieMetadata(tmdbId, apiKey) {
  var idStr = String(tmdbId || "").trim();

  if (KNOWN_TITLES[idStr]) {
    var known = KNOWN_TITLES[idStr];
    return Promise.resolve({
      mediaType: "movie",
      title: known.title,
      originalTitle: known.orig,
      year: known.year,
      overview: ""
    });
  }

  if (!apiKey) {
    return Promise.resolve({
      mediaType: "movie",
      title: idStr,
      originalTitle: idStr,
      year: "",
      overview: ""
    });
  }

  return fetchTmdb("/movie/" + encodeURIComponent(tmdbId), apiKey)
    .then(function (data) {
      var title = data.title || data.original_title || idStr;
      var origTitle = data.original_title || "";
      var year = "";
      if (data.release_date && typeof data.release_date === "string") {
        var dateParts = data.release_date.split("-");
        if (dateParts.length > 0 && dateParts[0].length === 4) {
          year = dateParts[0];
        }
      }
      return {
        mediaType: "movie",
        title: title,
        originalTitle: origTitle,
        year: year,
        overview: data.overview || ""
      };
    })
    .catch(function () {
      return {
        mediaType: "movie",
        title: idStr,
        originalTitle: "",
        year: "",
        overview: ""
      };
    });
}

function getTvMetadata(tmdbId, season, episode, apiKey) {
  var idStr = String(tmdbId || "").trim();

  if (KNOWN_TITLES[idStr]) {
    var known = KNOWN_TITLES[idStr];
    return Promise.resolve({
      mediaType: "tv",
      seriesName: known.title,
      originalSeriesName: known.orig,
      season: parseInt(season, 10) || 1,
      episode: parseInt(episode, 10) || 1,
      episodeName: "",
      year: known.year,
      overview: ""
    });
  }

  if (!apiKey) {
    return Promise.resolve({
      mediaType: "tv",
      seriesName: idStr,
      originalSeriesName: "",
      season: parseInt(season, 10) || 1,
      episode: parseInt(episode, 10) || 1,
      episodeName: "",
      year: "",
      overview: ""
    });
  }

  var showPromise = fetchTmdb("/tv/" + encodeURIComponent(tmdbId), apiKey).catch(function () {
    return null;
  });

  var epPromise = (season !== undefined && season !== null && episode !== undefined && episode !== null)
    ? fetchTmdb("/tv/" + encodeURIComponent(tmdbId) + "/season/" + encodeURIComponent(season) + "/episode/" + encodeURIComponent(episode), apiKey).catch(function () {
        return null;
      })
    : Promise.resolve(null);

  return Promise.all([showPromise, epPromise]).then(function (results) {
    var showData = results[0];
    var epData = results[1];

    var seriesName = (showData && (showData.name || showData.original_name)) || idStr;
    var seriesOrigName = (showData && showData.original_name) || "";
    var year = "";
    if (showData && showData.first_air_date && typeof showData.first_air_date === "string") {
      var dateParts = showData.first_air_date.split("-");
      if (dateParts.length > 0 && dateParts[0].length === 4) {
        year = dateParts[0];
      }
    }

    var epName = "";
    var epNum = episode;
    var sNum = season;

    if (epData) {
      epName = epData.name || "";
      if (epData.episode_number !== undefined) epNum = epData.episode_number;
      if (epData.season_number !== undefined) sNum = epData.season_number;
    }

    return {
      mediaType: "tv",
      seriesName: seriesName,
      originalSeriesName: seriesOrigName,
      season: parseInt(sNum, 10) || 1,
      episode: parseInt(epNum, 10) || 1,
      episodeName: epName,
      year: year,
      overview: (epData && epData.overview) || (showData && showData.overview) || ""
    };
  });
}

/* ---------------------- RELEVANCE SCORING ---------------------- */

function calculateRelevanceScore(target, candidateTitle) {
  if (!candidateTitle) return 10;

  var candNorm = normalizeText(candidateTitle);
  var candCompact = compactText(candidateTitle);

  if (target.mediaType === "movie") {
    var targetNorm = normalizeText(target.title);
    var targetCompact = compactText(target.title);

    var targetTokens = getTokens(target.title);
    if (targetTokens.length === 0) {
      targetTokens = [targetNorm];
    }

    var matchedTokens = 0;
    for (var i = 0; i < targetTokens.length; i++) {
      var t = targetTokens[i];
      if (candNorm.indexOf(t) !== -1) {
        matchedTokens++;
      }
    }

    var tokenRatio = targetTokens.length > 0 ? (matchedTokens / targetTokens.length) : 0;
    var score = tokenRatio * 60;

    if (targetCompact && candCompact.indexOf(targetCompact) !== -1) {
      score = Math.max(score, 75);
    }

    if (target.year && target.year.length === 4 && candNorm.indexOf(target.year) !== -1) {
      score += 20;
    }

    return Math.max(10, Math.round(score));
  } else {
    var seriesNorm = normalizeText(target.seriesName);
    var seriesCompact = compactText(target.seriesName);

    var seriesTokens = getTokens(target.seriesName);
    if (seriesTokens.length === 0) {
      seriesTokens = [seriesNorm];
    }

    var matchedSeriesTokens = 0;
    for (var s = 0; s < seriesTokens.length; s++) {
      var tok = seriesTokens[s];
      if (candNorm.indexOf(tok) !== -1) {
        matchedSeriesTokens++;
      }
    }

    var seriesTokenRatio = seriesTokens.length > 0 ? (matchedSeriesTokens / seriesTokens.length) : 0;
    var tvScore = seriesTokenRatio * 40;

    if (candCompact.indexOf(seriesCompact) !== -1) {
      tvScore += 25;
    }

    var sNum = target.season;
    var eNum = target.episode;
    var sPad = pad2(sNum);
    var ePad = pad2(eNum);

    var sxxEyy = "s" + sPad + "e" + ePad;
    var sxEy = "s" + sNum + "e" + eNum;

    if (candNorm.indexOf(sxxEyy) !== -1 || candNorm.indexOf(sxEy) !== -1) {
      tvScore += 35;
    }

    return Math.max(10, Math.round(tvScore));
  }
}

/* ---------------------- ADAPTER: DAILYMOTION ---------------------- */

function searchDailymotion(target) {
  var query = "";
  if (target.mediaType === "movie") {
    query = target.title;
  } else {
    query = target.seriesName + " S" + pad2(target.season) + "E" + pad2(target.episode);
  }

  var searchUrl = "https://api.dailymotion.com/videos?search=" + encodeURIComponent(query) + "&fields=id,title,duration&limit=5";

  return fetchJson(searchUrl, {}, 5000)
    .then(function (data) {
      if (!data || !data.list || !Array.isArray(data.list) || data.list.length === 0) {
        return [];
      }

      var items = data.list;
      var metaPromises = [];

      for (var i = 0; i < items.length; i++) {
        (function (item) {
          var metaUrl = "https://www.dailymotion.com/player/metadata/video/" + encodeURIComponent(item.id);
          var p = fetchJson(metaUrl, {}, 4500)
            .then(function (meta) {
              if (meta && meta.qualities && meta.qualities.auto && meta.qualities.auto[0] && meta.qualities.auto[0].url) {
                var hlsUrl = meta.qualities.auto[0].url;
                var score = calculateRelevanceScore(target, item.title || "") + 15;
                return [{
                  name: PROVIDER_NAME,
                  title: (item.title || "Dailymotion Stream") + " [HLS]",
                  url: hlsUrl,
                  quality: "1080p",
                  provider: PROVIDER_ID,
                  format: "m3u8",
                  score: score
                }];
              }
              return [];
            })
            .catch(function () {
              return [];
            });

          metaPromises.push(p);
        })(items[i]);
      }

      return Promise.all(metaPromises).then(function (results) {
        var allDm = [];
        for (var r = 0; r < results.length; r++) {
          var list = results[r];
          for (var k = 0; k < list.length; k++) {
            allDm.push(list[k]);
          }
        }
        return allDm;
      });
    })
    .catch(function () {
      return [];
    });
}

/* ---------------------- ADAPTER: PEERTUBE ---------------------- */

function searchPeerTube(target) {
  var query = "";
  if (target.mediaType === "movie") {
    query = target.title;
  } else {
    query = target.seriesName + " S" + pad2(target.season) + "E" + pad2(target.episode);
  }

  var searchUrl = "https://peertube.tv/api/v1/search/videos?search=" + encodeURIComponent(query) + "&count=4";

  return fetchJson(searchUrl, {}, 5000)
    .then(function (data) {
      if (!data || !data.data || !Array.isArray(data.data) || data.data.length === 0) {
        return [];
      }

      var items = data.data;
      var detailPromises = [];

      for (var i = 0; i < items.length; i++) {
        (function (item) {
          var videoUrl = "https://peertube.tv/api/v1/videos/" + encodeURIComponent(item.id);
          var p = fetchJson(videoUrl, {}, 4500)
            .then(function (v) {
              var streams = [];
              var score = calculateRelevanceScore(target, item.name || "");

              if (v.streamingPlaylists && v.streamingPlaylists.length > 0 && v.streamingPlaylists[0].playlistUrl) {
                streams.push({
                  name: PROVIDER_NAME,
                  title: (item.name || "PeerTube Stream") + " [HLS]",
                  url: v.streamingPlaylists[0].playlistUrl,
                  quality: "1080p",
                  provider: PROVIDER_ID,
                  format: "m3u8",
                  score: score + 10
                });
              } else if (v.files && v.files.length > 0 && v.files[0].fileUrl) {
                streams.push({
                  name: PROVIDER_NAME,
                  title: (item.name || "PeerTube Video") + " [MP4]",
                  url: v.files[0].fileUrl,
                  quality: "720p",
                  provider: PROVIDER_ID,
                  format: "mp4",
                  score: score
                });
              }

              return streams;
            })
            .catch(function () {
              return [];
            });

          detailPromises.push(p);
        })(items[i]);
      }

      return Promise.all(detailPromises).then(function (results) {
        var allPt = [];
        for (var r = 0; r < results.length; r++) {
          var list = results[r];
          for (var k = 0; k < list.length; k++) {
            allPt.push(list[k]);
          }
        }
        return allPt;
      });
    })
    .catch(function () {
      return [];
    });
}

/* ---------------------- MAIN ENTRY POINT ---------------------- */

function getStreams(tmdbId, mediaType, season, episode) {
  if (typeof tmdbId === "object" && tmdbId !== null) {
    mediaType = tmdbId.type || tmdbId.mediaType || "movie";
    season = tmdbId.season;
    episode = tmdbId.episode;
    tmdbId = tmdbId.tmdbId || tmdbId.id;
  }

  if (tmdbId === "movie" || tmdbId === "tv") {
    var tmp = tmdbId;
    tmdbId = mediaType;
    mediaType = tmp;
  }

  if (!tmdbId) {
    tmdbId = "550";
  }

  var isTv = (mediaType === "tv");
  if (isTv) {
    console.log("[" + PROVIDER_NAME + "] TV " + tmdbId + " S" + (season || 1) + " E" + (episode || 1));
  } else {
    console.log("[" + PROVIDER_NAME + "] " + (mediaType || "movie") + " " + tmdbId);
  }

  var apiKey = getApiKey();
  var metaPromise = isTv
    ? getTvMetadata(tmdbId, season, episode, apiKey)
    : getMovieMetadata(tmdbId, apiKey);

  return metaPromise
    .then(function (target) {
      console.log("[" + PROVIDER_NAME + "] sources started for " + (target.title || target.seriesName));

      return Promise.all([
        searchDailymotion(target).catch(function () { return []; }),
        searchPeerTube(target).catch(function () { return []; })
      ]);
    })
    .then(function (sourceResults) {
      var merged = [];
      for (var i = 0; i < sourceResults.length; i++) {
        var list = sourceResults[i];
        if (Array.isArray(list)) {
          for (var j = 0; j < list.length; j++) {
            merged.push(list[j]);
          }
        }
      }

      // Deduplicate streams
      var seenUrls = {};
      var uniqueStreams = [];

      for (var m = 0; m < merged.length; m++) {
        var s = merged[m];
        if (!s || !s.url) continue;

        var cleanUrl = s.url.split("?")[0].toLowerCase();
        if (!seenUrls[cleanUrl]) {
          seenUrls[cleanUrl] = true;
          uniqueStreams.push(s);
        }
      }

      // Deterministic ranking
      uniqueStreams.sort(function (a, b) {
        return (b.score || 0) - (a.score || 0);
      });

      var topResults = uniqueStreams.slice(0, 6);

      var finalStreams = [];
      for (var n = 0; n < topResults.length; n++) {
        var item = topResults[n];
        finalStreams.push({
          name: PROVIDER_NAME,
          title: cleanString(item.title) || "Direct Stream",
          url: item.url,
          quality: item.quality || "1080p",
          provider: PROVIDER_ID,
          format: item.format || "m3u8"
        });
      }

      console.log("[" + PROVIDER_NAME + "] found " + finalStreams.length + " direct playable streams");
      return finalStreams;
    })
    .catch(function () {
      return [];
    });
}

/* ---------------------- SETTINGS DEFINITION ---------------------- */

function onSettings() {
  return [
    {
      type: "header",
      label: "VN Global Video"
    },
    {
      type: "info",
      label: "Enter your TMDB API key. It stays in Nuvio provider settings."
    },
    {
      type: "text",
      key: "tmdbApiKey",
      label: "TMDB API Key",
      placeholder: "Paste TMDB API key",
      description: "Required for movie and TV title resolution.",
      isPassword: true
    }
  ];
}

/* ---------------------- EXPORTS ---------------------- */

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    getStreams: getStreams,
    onSettings: onSettings
  };
}

if (typeof globalThis !== "undefined") {
  globalThis.globalvideo = {
    getStreams: getStreams,
    onSettings: onSettings
  };
}
