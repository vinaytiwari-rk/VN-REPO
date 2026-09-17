/*
 * VN Global Video
 * Phase 1.4 - Public / Authorized Video Source Engine
 *
 * Design goals:
 * - Nuvio-compatible Promise based provider
 * - Source failures never break other sources
 * - Only return directly playable public/authorized media URLs
 * - No webpage URL is presented as a playable stream
 * - Easy to extend with regional adapters
 */

var PROVIDER_ID = "globalvideo";
var PROVIDER_NAME = "VN Global Video";
var VERSION = "1.4.0";
var MAX_RESULTS_PER_SOURCE = 8;
var REQUEST_TIMEOUT_MS = 9000;

function safeString(value) {
  return value == null ? "" : String(value).trim();
}

function cleanTitle(value) {
  return safeString(value)
    .replace(/\s+/g, " ")
    .replace(/[\[\]{}<>]/g, " ")
    .trim();
}

function encode(value) {
  return encodeURIComponent(safeString(value));
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
      headers: {
        "Accept": "application/json"
      }
    }).then(function(response) {
      if (!response || !response.ok) {
        throw new Error("HTTP " + (response ? response.status : "unknown"));
      }
      return response.json();
    }),
    REQUEST_TIMEOUT_MS
  );
}

function playableFormat(url, mime) {
  var value = (safeString(url) + " " + safeString(mime)).toLowerCase();

  if (/\.m3u8(?:$|[?#])/.test(value) || value.indexOf("application/vnd.apple.mpegurl") >= 0) {
    return "m3u8";
  }
  if (/\.mp4(?:$|[?#])/.test(value) || value.indexOf("video/mp4") >= 0) {
    return "mp4";
  }
  if (/\.webm(?:$|[?#])/.test(value) || value.indexOf("video/webm") >= 0) {
    return "webm";
  }
  if (/\.ogv(?:$|[?#])/.test(value) || value.indexOf("video/ogg") >= 0) {
    return "ogv";
  }
  return null;
}

function streamKey(url) {
  return safeString(url).replace(/[?#].*$/, "");
}

function uniqueStreams(streams) {
  var seen = {};
  var result = [];

  (streams || []).forEach(function(stream) {
    if (!stream || !stream.url) return;
    var key = streamKey(stream.url);
    if (!key || seen[key]) return;
    seen[key] = true;
    result.push(stream);
  });

  return result;
}

function makeStream(source, title, url, format, quality, size) {
  if (!url || !format) return null;

  return {
    name: source,
    title: title || source,
    url: url,
    quality: quality || "Public",
    size: size || undefined,
    provider: PROVIDER_ID,
    format: format
  };
}

/*
 * Internet Archive
 * Public search API + item metadata. We only expose files whose
 * metadata identifies a directly downloadable video format.
 */
function internetArchive(title) {
  var query = 'title:"' + title.replace(/"/g, "") + '" AND mediatype:movies';
  var url = "https://archive.org/advancedsearch.php?q=" + encode(query) +
    "&fl[]=identifier&fl[]=title&rows=12&page=1&output=json";

  return fetchJson(url).then(function(data) {
    var docs = data && data.response && data.response.docs ? data.response.docs : [];

    return Promise.all(docs.slice(0, 12).map(function(doc) {
      if (!doc || !doc.identifier) return Promise.resolve([]);

      var metaUrl = "https://archive.org/metadata/" + encode(doc.identifier);
      return fetchJson(metaUrl).then(function(meta) {
        var files = meta && meta.files ? meta.files : [];
        var streams = [];

        files.forEach(function(file) {
          if (!file || !file.name) return;

          var format = playableFormat(file.name, file.format);
          if (!format) return;

          var lower = String(file.name).toLowerCase();
          if (lower.indexOf("_thumb") >= 0 || lower.indexOf("sample") >= 0) return;

          var fileUrl = "https://archive.org/download/" + encode(doc.identifier) + "/" + encode(file.name);
          var itemTitle = safeString(meta.metadata && meta.metadata.title) || safeString(doc.title) || title;
          var quality = format === "m3u8" ? "HLS" : "Public";
          var stream = makeStream("Internet Archive", itemTitle, fileUrl, format, quality, file.size);

          if (stream) streams.push(stream);
        });

        return streams.slice(0, MAX_RESULTS_PER_SOURCE);
      }).catch(function() {
        return [];
      });
    }));
  }).then(function(groups) {
    var all = [];
    groups.forEach(function(group) {
      all = all.concat(group || []);
    });
    return all.slice(0, MAX_RESULTS_PER_SOURCE);
  });
}

/*
 * Wikimedia Commons
 * Uses the public MediaWiki API and returns only direct video files.
 */
function wikimediaCommons(title) {
  var url = "https://commons.wikimedia.org/w/api.php?action=query" +
    "&generator=search" +
    "&gsrsearch=" + encode(title) +
    "&gsrnamespace=6" +
    "&gsrlimit=20" +
    "&prop=imageinfo" +
    "&iiprop=url%7Cmime%7Csize" +
    "&format=json" +
    "&origin=*";

  return fetchJson(url).then(function(data) {
    var pages = data && data.query && data.query.pages ? data.query.pages : {};
    var streams = [];

    Object.keys(pages).forEach(function(key) {
      var page = pages[key];
      var info = page && page.imageinfo && page.imageinfo[0];
      if (!info || !info.url) return;

      var format = playableFormat(info.url, info.mime);
      if (!format) return;

      var stream = makeStream(
        "Wikimedia Commons",
        safeString(page.title).replace(/^File:/i, "") || title,
        info.url,
        format,
        "Public",
        info.size
      );

      if (stream) streams.push(stream);
    });

    return streams.slice(0, MAX_RESULTS_PER_SOURCE);
  });
}

/*
 * Future regional adapters are intentionally isolated here.
 * They will only be enabled when a platform provides a documented/public
 * playback mechanism that can be used by this provider.
 */
var SOURCE_CATALOG = [
  { id: "internetarchive", region: "Global", status: "active" },
  { id: "wikimedia", region: "Global", status: "active" },
  { id: "youtube", region: "Global", status: "adapter-planned" },
  { id: "dailymotion", region: "Global", status: "adapter-planned" },
  { id: "vimeo", region: "Global", status: "adapter-planned" },
  { id: "vkvideo", region: "Russia", status: "adapter-planned" },
  { id: "rutube", region: "Russia", status: "adapter-planned" },
  { id: "bilibili", region: "China", status: "adapter-planned" },
  { id: "youku", region: "China", status: "adapter-planned" },
  { id: "tencentvideo", region: "China", status: "adapter-planned" },
  { id: "iqiyi", region: "China", status: "adapter-planned" },
  { id: "nicovideo", region: "Japan", status: "adapter-planned" },
  { id: "navertv", region: "Korea", status: "adapter-planned" },
  { id: "mxplayer", region: "India", status: "adapter-planned" }
];

function getTitleFromTmdb(tmdbId, mediaType, season, episode) {
  /*
   * Nuvio passes the TMDB id, but does not automatically expose the user's
   * TMDB API key to providers. Therefore this phase does not pretend that
   * a key is available. If a title is supplied through a future provider
   * setting, this resolver can be upgraded without changing the adapters.
   */
  return Promise.resolve("TMDB-" + safeString(tmdbId));
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
    "Sources:", SOURCE_CATALOG.length
  );

  return getTitleFromTmdb(id, mediaType, season, episode)
    .then(function(title) {
      var clean = cleanTitle(title);
      if (!clean) return [];

      /*
       * Each source is isolated. Promise.allSettled is intentionally not
       * used for compatibility with older embedded JS engines.
       */
      return Promise.all([
        internetArchive(clean).catch(function(error) {
          console.log("[VN Global Video] Internet Archive skipped:", String(error));
          return [];
        }),
        wikimediaCommons(clean).catch(function(error) {
          console.log("[VN Global Video] Wikimedia skipped:", String(error));
          return [];
        })
      ]).then(function(groups) {
        var all = [];
        groups.forEach(function(group) {
          all = all.concat(group || []);
        });
        return uniqueStreams(all).slice(0, MAX_RESULTS_PER_SOURCE * 2);
      });
    })
    .catch(function(error) {
      console.log("[VN Global Video] Provider error:", String(error));
      return [];
    });
}

module.exports = {
  getStreams: getStreams
};