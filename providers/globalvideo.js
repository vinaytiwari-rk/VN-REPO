/*
 * VN Global Video
 * Phase 1.5 - Global Public / Authorized Video Source Engine
 *
 * The provider is intentionally modular. Each source is isolated so one
 * unavailable service cannot break the complete provider.
 */

var PROVIDER_ID = "globalvideo";
var PROVIDER_NAME = "VN Global Video";
var VERSION = "1.5.0";
var MAX_RESULTS_PER_SOURCE = 8;
var REQUEST_TIMEOUT_MS = 9000;

function safeString(value) {
  return value == null ? "" : String(value).trim();
}

function encode(value) {
  return encodeURIComponent(safeString(value));
}

function cleanTitle(value) {
  return safeString(value)
    .replace(/\s+/g, " ")
    .replace(/[\[\]{}<>]/g, " ")
    .trim();
}

function withTimeout(promise, ms) {
  return new Promise(function(resolve, reject) {
    var finished = false;
    var timer = setTimeout(function() {
      if (!finished) {
        finished = true;
        reject(new Error("timeout"));
      }
    }, ms);

    promise.then(function(value) {
      if (!finished) {
        finished = true;
        clearTimeout(timer);
        resolve(value);
      }
    }).catch(function(error) {
      if (!finished) {
        finished = true;
        clearTimeout(timer);
        reject(error);
      }
    });
  });
}

function fetchJson(url) {
  return withTimeout(
    fetch(url, {
      method: "GET",
      headers: { "Accept": "application/json" }
    }).then(function(response) {
      if (!response || !response.ok) {
        throw new Error("HTTP " + (response ? response.status : "unknown"));
      }
      return response.json();
    }),
    REQUEST_TIMEOUT_MS
  );
}

function settings() {
  return (typeof globalThis !== "undefined" && globalThis.SCRAPER_SETTINGS)
    ? globalThis.SCRAPER_SETTINGS
    : {};
}

function playableFormat(url, mime) {
  var value = (safeString(url) + " " + safeString(mime)).toLowerCase();

  if (/\.m3u8(?:$|[?#])/.test(value) || value.indexOf("application/vnd.apple.mpegurl") >= 0) return "m3u8";
  if (/\.mp4(?:$|[?#])/.test(value) || value.indexOf("video/mp4") >= 0) return "mp4";
  if (/\.webm(?:$|[?#])/.test(value) || value.indexOf("video/webm") >= 0) return "webm";
  if (/\.ogv(?:$|[?#])/.test(value) || value.indexOf("video/ogg") >= 0) return "ogv";
  return null;
}

function uniqueStreams(streams) {
  var seen = {};
  var result = [];

  (streams || []).forEach(function(stream) {
    if (!stream || !stream.url) return;
    var key = safeString(stream.url).replace(/[?#].*$/, "");
    if (!key || seen[key]) return;
    seen[key] = true;
    result.push(stream);
  });

  return result;
}

function makeStream(source, title, url, format, quality, size) {
  if (!url || !format) return null;

  var stream = {
    name: source,
    title: title || source,
    url: url,
    quality: quality || "Public",
    provider: PROVIDER_ID,
    format: format
  };

  if (size) stream.size = size;
  return stream;
}

/* ---------------------------------------------------------------
 * TMDB metadata
 * ---------------------------------------------------------------
 * Nuvio passes the TMDB ID to providers, but the app's own TMDB key is
 * not automatically injected into SCRAPER_SETTINGS. Therefore this
 * provider has its own optional TMDB key setting.
 */
function resolveTmdb(tmdbId, mediaType, season, episode) {
  var apiKey = safeString(settings().tmdbApiKey);
  if (!apiKey) {
    return Promise.reject(new Error("TMDB API key is not configured for VN Global Video"));
  }

  var endpoint;

  if (mediaType === "tv" && season != null && episode != null) {
    endpoint = "https://api.themoviedb.org/3/tv/" + encode(tmdbId) +
      "/season/" + encode(season) + "/episode/" + encode(episode) +
      "?api_key=" + encode(apiKey);
  } else if (mediaType === "tv") {
    endpoint = "https://api.themoviedb.org/3/tv/" + encode(tmdbId) +
      "?api_key=" + encode(apiKey);
  } else {
    endpoint = "https://api.themoviedb.org/3/movie/" + encode(tmdbId) +
      "?api_key=" + encode(apiKey);
  }

  return fetchJson(endpoint).then(function(data) {
    var title = safeString(data && (data.title || data.name || data.episode_type));
    var original = safeString(data && (data.original_title || data.original_name));
    var airDate = safeString(data && (data.release_date || data.first_air_date || data.air_date));
    var year = airDate ? airDate.substring(0, 4) : "";

    if (!title) throw new Error("TMDB title not found");

    return {
      title: cleanTitle(title),
      originalTitle: cleanTitle(original),
      year: year
    };
  });
}

/* ---------------------------------------------------------------
 * Internet Archive adapter
 * --------------------------------------------------------------- */
function internetArchive(queryTitle) {
  var query = 'title:"' + queryTitle.replace(/"/g, "") + '"';
  var url = "https://archive.org/advancedsearch.php?q=" + encode(query) +
    "&fl[]=identifier&fl[]=title&rows=12&page=1&output=json";

  return fetchJson(url).then(function(data) {
    var docs = data && data.response && data.response.docs ? data.response.docs : [];

    return Promise.all(docs.slice(0, 12).map(function(doc) {
      if (!doc || !doc.identifier) return Promise.resolve([]);

      return fetchJson("https://archive.org/metadata/" + encode(doc.identifier))
        .then(function(meta) {
          var files = meta && meta.files ? meta.files : [];
          var streams = [];

          files.forEach(function(file) {
            if (!file || !file.name) return;

            var lower = String(file.name).toLowerCase();
            if (lower.indexOf("_thumb") >= 0 || lower.indexOf("thumbnail") >= 0 || lower.indexOf("sample") >= 0) return;

            var format = playableFormat(file.name, file.format);
            if (!format) return;

            var itemTitle = safeString(meta.metadata && meta.metadata.title) || safeString(doc.title) || queryTitle;
            var fileUrl = "https://archive.org/download/" + encode(doc.identifier) + "/" + encode(file.name);
            var stream = makeStream("Internet Archive", itemTitle, fileUrl, format, format === "m3u8" ? "HLS" : "Public", file.size);
            if (stream) streams.push(stream);
          });

          return streams.slice(0, MAX_RESULTS_PER_SOURCE);
        })
        .catch(function() { return []; });
    }));
  }).then(function(groups) {
    var result = [];
    groups.forEach(function(group) { result = result.concat(group || []); });
    return result.slice(0, MAX_RESULTS_PER_SOURCE);
  });
}

/* ---------------------------------------------------------------
 * Wikimedia Commons adapter
 * --------------------------------------------------------------- */
function wikimediaCommons(queryTitle) {
  var url = "https://commons.wikimedia.org/w/api.php?action=query" +
    "&generator=search" +
    "&gsrsearch=" + encode(queryTitle) +
    "&gsrnamespace=6" +
    "&gsrlimit=20" +
    "&prop=imageinfo" +
    "&iiprop=url%7Cmime%7Csize" +
    "&format=json&origin=*";

  return fetchJson(url).then(function(data) {
    var pages = data && data.query && data.query.pages ? data.query.pages : {};
    var result = [];

    Object.keys(pages).forEach(function(key) {
      var page = pages[key];
      var info = page && page.imageinfo && page.imageinfo[0];
      if (!info || !info.url) return;

      var format = playableFormat(info.url, info.mime);
      if (!format) return;

      var title = safeString(page.title).replace(/^File:/i, "") || queryTitle;
      var stream = makeStream("Wikimedia Commons", title, info.url, format, "Public", info.size);
      if (stream) result.push(stream);
    });

    return result.slice(0, MAX_RESULTS_PER_SOURCE);
  });
}

/* ---------------------------------------------------------------
 * Global source registry
 * ---------------------------------------------------------------
 * Planned adapters are listed so the architecture remains global. They
 * will be activated only when their public/documented playback mechanism
 * can return an actual playable URL.
 */
var SOURCE_CATALOG = [
  { id: "internetarchive", region: "Global", status: "active" },
  { id: "wikimedia", region: "Global", status: "active" },
  { id: "youtube", region: "Global", status: "planned" },
  { id: "dailymotion", region: "Global", status: "planned" },
  { id: "vimeo", region: "Global", status: "planned" },
  { id: "vkvideo", region: "Russia", status: "planned" },
  { id: "rutube", region: "Russia", status: "planned" },
  { id: "bilibili", region: "China", status: "planned" },
  { id: "youku", region: "China", status: "planned" },
  { id: "tencentvideo", region: "China", status: "planned" },
  { id: "iqiyi", region: "China", status: "planned" },
  { id: "nicovideo", region: "Japan", status: "planned" },
  { id: "navertv", region: "Korea", status: "planned" },
  { id: "mxplayer", region: "India", status: "planned" },
  { id: "jiohotstar", region: "India", status: "planned" },
  { id: "sonyliv", region: "India", status: "planned" },
  { id: "zee5", region: "India", status: "planned" },
  { id: "mediaset", region: "Europe", status: "planned" },
  { id: "rtve", region: "Europe", status: "planned" },
  { id: "ard", region: "Germany", status: "planned" },
  { id: "zdf", region: "Germany", status: "planned" },
  { id: "pluto", region: "Global", status: "planned" },
  { id: "tubi", region: "USA", status: "planned" },
  { id: "peacock", region: "USA", status: "planned" },
  { id: "crunchyroll", region: "Global", status: "planned" },
  { id: "shahid", region: "Middle East", status: "planned" },
  { id: "viu", region: "Asia", status: "planned" }
];

function searchSource(sourceFunction, titles) {
  var promise = Promise.resolve([]);

  for (var i = 0; i < titles.length; i++) {
    (function(title) {
      promise = promise.then(function(existing) {
        if (existing.length >= MAX_RESULTS_PER_SOURCE) return existing;
        return sourceFunction(title).catch(function() { return []; }).then(function(found) {
          return existing.concat(found || []).slice(0, MAX_RESULTS_PER_SOURCE);
        });
      });
    })(titles[i]);
  }

  return promise;
}

function getStreams(tmdbId, mediaType, season, episode) {
  var id = safeString(tmdbId);
  if (!id) return Promise.resolve([]);

  console.log(
    "[VN Global Video] v" + VERSION,
    "TMDB:", id,
    "Type:", mediaType,
    "Season:", season,
    "Episode:", episode,
    "Catalog:", SOURCE_CATALOG.length
  );

  return resolveTmdb(id, mediaType, season, episode)
    .then(function(meta) {
      var titles = [];
      if (meta.title) titles.push(meta.title);
      if (meta.originalTitle && meta.originalTitle !== meta.title) titles.push(meta.originalTitle);
      if (meta.year && meta.title) titles.push(meta.title + " " + meta.year);

      return Promise.all([
        searchSource(internetArchive, titles),
        searchSource(wikimediaCommons, titles)
      ]).then(function(groups) {
        var all = [];
        groups.forEach(function(group) { all = all.concat(group || []); });
        return uniqueStreams(all).slice(0, MAX_RESULTS_PER_SOURCE * 2);
      });
    })
    .catch(function(error) {
      console.log("[VN Global Video] Provider error:", String(error));
      return [];
    });
}

function onSettings() {
  return [
    { type: "header", label: "VN Global Video" },
    {
      type: "info",
      label: "Enter a TMDB API key for title/episode resolution. The key is used locally by this provider."
    },
    {
      type: "text",
      key: "tmdbApiKey",
      label: "TMDB API Key",
      placeholder: "Paste your TMDB API key",
      description: "Required because Nuvio does not automatically expose its main TMDB key to third-party providers.",
      isPassword: true
    }
  ];
}

module.exports = {
  getStreams: getStreams,
  onSettings: onSettings
};