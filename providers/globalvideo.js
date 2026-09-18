var PROVIDER_NAME = "VN Global Video";
var PROVIDER_ID = "globalvideo";

function getSettings() {
  if (typeof SCRAPER_SETTINGS !== "undefined") return SCRAPER_SETTINGS;
  return {};
}

function enc(v) {
  return encodeURIComponent(String(v || ""));
}

function json(url) {
  return fetch(url).then(function (r) {
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  });
}

function clean(v) {
  return String(v || "").trim();
}

function norm(v) {
  return clean(v).toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function makeResult(url, title, quality, format) {
  return {
    name: PROVIDER_NAME,
    title: title || "Public Video",
    url: url,
    quality: quality || "Auto",
    provider: PROVIDER_ID,
    format: format || "mp4"
  };
}

function getTmdb(id, type, season, episode) {
  var key = clean(getSettings().tmdbApiKey);
  if (!key) return Promise.reject(new Error("TMDB API key missing"));

  var base = "https://api.themoviedb.org/3/";
  if (type === "tv") {
    var showUrl = base + "tv/" + enc(id) + "?api_key=" + enc(key);
    var epUrl = base + "tv/" + enc(id) +
      "/season/" + enc(season || 1) +
      "/episode/" + enc(episode || 1) +
      "?api_key=" + enc(key);

    return Promise.all([
      json(showUrl),
      json(epUrl).catch(function () { return {}; })
    ]).then(function (a) {
      var show = a[0] || {};
      var ep = a[1] || {};
      return {
        type: "tv",
        title: clean(show.name || show.original_name),
        originalTitle: clean(show.original_name),
        episodeTitle: clean(ep.name),
        season: parseInt(season, 10) || 1,
        episode: parseInt(episode, 10) || 1
      };
    });
  }

  return json(base + "movie/" + enc(id) + "?api_key=" + enc(key))
    .then(function (m) {
      return {
        type: "movie",
        title: clean(m.title || m.original_title),
        originalTitle: clean(m.original_title),
        episodeTitle: ""
      };
    });
}

function matches(target, title) {
  var a = norm(target.title);
  var b = norm(title);
  var ac = a.replace(/ /g, "");
  var bc = b.replace(/ /g, "");

  if (!a || !b) return false;

  if (bc.indexOf(ac) !== -1) {
    if (target.type === "movie") return true;

    var s = String(target.season);
    var e = String(target.episode);
    var sp = s.length === 1 ? "0" + s : s;
    var ep = e.length === 1 ? "0" + e : e;

    return b.indexOf("s" + s + "e" + e) !== -1 ||
      b.indexOf("s" + sp + "e" + ep) !== -1 ||
      (target.episodeTitle &&
       b.indexOf(norm(target.episodeTitle)) !== -1);
  }

  return target.originalTitle &&
    bc.indexOf(norm(target.originalTitle).replace(/ /g, "")) !== -1;
}

/*
 * Dailymotion:
 * 1) Search public videos.
 * 2) If an authorized access token is configured, request the official
 *    time-limited HLS URL.
 * 3) Without that permission, return the official Dailymotion player URL
 *    as an external-player result rather than pretending it is a direct HLS URL.
 */
function dailymotion(target) {
  var token = clean(getSettings().dailymotionAccessToken);

  var query = target.type === "tv"
    ? target.title + " S" + target.season + "E" + target.episode
    : target.title;

  return json(
    "https://api.dailymotion.com/videos?search=" +
    enc(query) +
    "&fields=id,title,status&limit=10"
  ).then(function (data) {
    var list = data && data.list ? data.list : [];
    var jobs = [];
    var playerResults = [];

    for (var i = 0; i < list.length; i++) {
      (function (item) {
        if (!item || !item.id) return;
        if (item.status && item.status !== "published") return;
        if (!matches(target, item.title || "")) return;

        if (!token) {
          playerResults.push(
            makeResult(
              "https://geo.dailymotion.com/player.html?video=" + enc(item.id),
              (item.title || "Dailymotion") + " [Dailymotion Player]",
              "Auto",
              "web"
            )
          );
          return;
        }

        jobs.push(
          fetch(
            "https://api.dailymotion.com/v2/videos/" +
            enc(item.id) + "/streams",
            {
              method: "POST",
              headers: {
                "Authorization": "Bearer " + token,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({ protocol: "hls" })
            }
          ).then(function (r) {
            if (!r.ok) return [];
            return r.json();
          }).then(function (x) {
            var urls = x && x.stream_urls ? x.stream_urls : [];
            for (var j = 0; j < urls.length; j++) {
              var u = urls[j] && urls[j].stream_url;
              if (u) {
                return [makeResult(
                  u,
                  (item.title || "Dailymotion") + " [HLS]",
                  "Auto",
                  "m3u8"
                )];
              }
            }
            return [];
          }).catch(function () {
            return [];
          })
        );
      })(list[i]);
    }

    if (!token) return playerResults.slice(0, 6);

    return Promise.all(jobs).then(function (groups) {
      var out = [];
      for (var k = 0; k < groups.length; k++) out = out.concat(groups[k]);
      return out.slice(0, 6);
    });
  }).catch(function () {
    return [];
  });
}

function peertube(target) {
  var query = target.type === "tv"
    ? target.title + " S" + target.season + "E" + target.episode
    : target.title;

  return json(
    "https://peertube.tv/api/v1/search/videos?search=" +
    enc(query) + "&count=5"
  ).then(function (data) {
    var list = data && data.data ? data.data : [];
    var jobs = [];

    for (var i = 0; i < list.length; i++) {
      (function (item) {
        if (!item || !item.id || !matches(target, item.name || "")) return;

        jobs.push(
          json("https://peertube.tv/api/v1/videos/" + enc(item.id))
            .then(function (v) {
              if (v && v.streamingPlaylists) {
                for (var p = 0; p < v.streamingPlaylists.length; p++) {
                  var h = v.streamingPlaylists[p] &&
                    v.streamingPlaylists[p].playlistUrl;
                  if (h) {
                    return [makeResult(
                      h,
                      (item.name || "PeerTube") + " [HLS]",
                      "Auto",
                      "m3u8"
                    )];
                  }
                }
              }

              if (v && v.files) {
                for (var q = 0; q < v.files.length; q++) {
                  var mp4 = v.files[q] && v.files[q].fileUrl;
                  if (mp4) {
                    return [makeResult(
                      mp4,
                      (item.name || "PeerTube") + " [MP4]",
                      "Auto",
                      "mp4"
                    )];
                  }
                }
              }

              return [];
            })
            .catch(function () { return []; })
        );
      })(list[i]);
    }

    return Promise.all(jobs).then(function (groups) {
      var out = [];
      for (var j = 0; j < groups.length; j++) out = out.concat(groups[j]);
      return out.slice(0, 6);
    });
  }).catch(function () {
    return [];
  });
}

function getStreams(tmdbId, mediaType, season, episode) {
  if (!tmdbId) return Promise.resolve([]);

  return getTmdb(tmdbId, mediaType, season, episode)
    .then(function (target) {
      return Promise.all([
        dailymotion(target),
        peertube(target)
      ]);
    })
    .then(function (groups) {
      var all = [];
      var seen = {};

      for (var i = 0; i < groups.length; i++) {
        for (var j = 0; j < groups[i].length; j++) {
          var item = groups[i][j];
          if (!item || !item.url || seen[item.url]) continue;
          seen[item.url] = true;
          all.push(item);
        }
      }

      return all.slice(0, 10);
    })
    .catch(function (e) {
      console.error("[" + PROVIDER_NAME + "] " + (e && e.message ? e.message : e));
      return [];
    });
}

function onSettings() {
  return [
    { type: "header", label: "VN Global Video" },
    {
      type: "info",
      label: "TMDB API key is required for title and episode matching."
    },
    {
      type: "text",
      key: "tmdbApiKey",
      label: "TMDB API Key",
      placeholder: "Paste TMDB API key",
      isPassword: true
    },
    {
      type: "info",
      label: "Dailymotion Access Token is optional. Do not enter your API Secret here."
    },
    {
      type: "text",
      key: "dailymotionAccessToken",
      label: "Dailymotion Access Token",
      placeholder: "Paste access token",
      isPassword: true
    }
  ];
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    getStreams: getStreams,
    onSettings: onSettings
  };
}
