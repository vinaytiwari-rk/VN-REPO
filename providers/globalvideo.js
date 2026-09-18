const PROVIDER_NAME = "VN Global Video";
const PROVIDER_ID = "globalvideo";

function settings() {
  return globalThis.SCRAPER_SETTINGS || {};
}

function enc(v) {
  return encodeURIComponent(String(v || ""));
}

function txt(v) {
  return String(v || "").trim();
}

function fetchJson(url) {
  return fetch(url).then(function (r) {
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  });
}

function direct(url) {
  if (!url) return false;
  var u = url.toLowerCase();
  return u.indexOf(".m3u8") !== -1 ||
    u.indexOf(".mp4") !== -1 ||
    u.indexOf(".webm") !== -1 ||
    u.indexOf(".ogv") !== -1;
}

function stream(url, title, quality, format) {
  return {
    name: PROVIDER_NAME,
    title: txt(title) || "Public Direct Stream",
    url: url,
    quality: quality || "Unknown",
    provider: PROVIDER_ID,
    format: format || (url.toLowerCase().indexOf(".m3u8") !== -1 ? "m3u8" : "mp4")
  };
}

function uniq(items) {
  var seen = {};
  var out = [];
  for (var i = 0; i < items.length; i++) {
    var x = items[i];
    if (!x || !x.url || seen[x.url]) continue;
    seen[x.url] = true;
    out.push(x);
  }
  return out;
}

function tmdb(id, type, season, episode) {
  var key = txt(settings().tmdbApiKey);
  if (!key) return Promise.reject(new Error("TMDB API key missing"));

  var base = "https://api.themoviedb.org/3/";
  var show = base + "tv/" + enc(id) + "?api_key=" + enc(key);
  var movie = base + "movie/" + enc(id) + "?api_key=" + enc(key);

  if (type === "tv") {
    var ep = null;
    if (season !== undefined && episode !== undefined) {
      ep = base + "tv/" + enc(id) +
        "/season/" + enc(season) +
        "/episode/" + enc(episode) +
        "?api_key=" + enc(key);
    }

    return Promise.all([
      fetchJson(show).catch(function () { return {}; }),
      ep ? fetchJson(ep).catch(function () { return {}; }) : Promise.resolve({})
    ]).then(function (a) {
      var s = a[0] || {};
      var e = a[1] || {};
      return {
        type: "tv",
        title: txt(s.name || s.original_name),
        originalTitle: txt(s.original_name),
        episodeTitle: txt(e.name),
        season: parseInt(season, 10) || 1,
        episode: parseInt(episode, 10) || 1
      };
    });
  }

  return fetchJson(movie).then(function (m) {
    return {
      type: "movie",
      title: txt(m.title || m.original_title),
      originalTitle: txt(m.original_title),
      episodeTitle: ""
    };
  });
}

function norm(v) {
  return txt(v).toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function match(target, candidate) {
  var c = norm(candidate);
  var t = norm(target.title);
  var o = norm(target.originalTitle);

  if (!c || !t) return false;

  var tc = t.replace(/ /g, "");
  var cc = c.replace(/ /g, "");

  if (tc && cc.indexOf(tc) !== -1) {
    if (target.type === "movie") return true;

    var s = String(target.season);
    var e = String(target.episode);
    var sp = s.length === 1 ? "0" + s : s;
    var ep = e.length === 1 ? "0" + e : e;

    return c.indexOf("s" + sp + "e" + ep) !== -1 ||
      c.indexOf("s" + s + "e" + e) !== -1 ||
      (target.episodeTitle && c.indexOf(norm(target.episodeTitle)) !== -1);
  }

  if (o) {
    var oc = o.replace(/ /g, "");
    if (oc && cc.indexOf(oc) !== -1) return true;
  }

  return false;
}

/* DAILYMOTION — isolated adapter */
function dailymotion(target) {
  var s = settings();
  var token = txt(s.dailymotionAccessToken);

  var q = target.type === "tv"
    ? target.title + " S" + target.season + "E" + target.episode
    : target.title;

  return fetchJson(
    "https://api.dailymotion.com/videos?search=" +
    enc(q) + "&fields=id,title,status&limit=8"
  ).then(function (data) {
    var list = data && data.list ? data.list : [];
    var jobs = [];

    for (var i = 0; i < list.length; i++) {
      (function (item) {
        if (!item || !item.id || !match(target, item.title || "")) return;
        if (item.status && item.status !== "published") return;

        jobs.push(
          fetch(
            "https://api.dailymotion.com/v2/videos/" +
            enc(item.id) + "/streams",
            {
              method: "POST",
              headers: {
                "Authorization": "Bearer " + token,
                "Content-Type": "application/json",
                "Accept": "application/json"
              },
              body: JSON.stringify({ protocol: "hls" })
            }
          ).then(function (r) {
            if (!r.ok) throw new Error("Dailymotion streams HTTP " + r.status);
            return r.json();
          }).then(function (meta) {
            var urls = meta && meta.stream_urls ? meta.stream_urls : [];
            var out = [];

            for (var u = 0; u < urls.length; u++) {
              var url = urls[u] && urls[u].stream_url;
              if (direct(url)) {
                out.push(stream(
                  url,
                  (item.title || "Dailymotion") + " [HLS]",
                  "Auto",
                  "m3u8"
                ));
                break;
              }
            }

            return out;
          }).catch(function () {
            return [];
          })
        );
      })(list[i]);
    }

    return Promise.all(jobs).then(function (groups) {
      var out = [];
      for (var j = 0; j < groups.length; j++) out = out.concat(groups[j]);

      if (!token) {
        for (var k = 0; k < list.length; k++) {
          var item = list[k];
          if (!item || !item.id || !match(target, item.title || "")) continue;

          out.push({
            name: PROVIDER_NAME,
            title: (item.title || "Dailymotion Video") + " [Dailymotion Player]",
            url: "https://geo.dailymotion.com/player.html?video=" + enc(item.id),
            quality: "Auto",
            provider: PROVIDER_ID
          });
        }
      }

      return out;
    });
  }).catch(function () {
    return [];
  });
}

/* PEERTUBE — isolated adapter */
function peertube(target) {
  var q = target.type === "tv"
    ? target.title + " S" + target.season + "E" + target.episode
    : target.title;

  return fetchJson(
    "https://peertube.tv/api/v1/search/videos?search=" +
    enc(q) + "&count=5"
  ).then(function (data) {
    var list = data && data.data ? data.data : [];
    var jobs = [];

    for (var i = 0; i < list.length; i++) {
      (function (item) {
        if (!item || !item.id || !match(target, item.name || "")) return;

        jobs.push(
          fetchJson(
            "https://peertube.tv/api/v1/videos/" + enc(item.id)
          ).then(function (v) {
            var out = [];

            if (v && v.streamingPlaylists) {
              for (var p = 0; p < v.streamingPlaylists.length; p++) {
                var hls = v.streamingPlaylists[p] &&
                  v.streamingPlaylists[p].playlistUrl;

                if (direct(hls)) {
                  out.push(stream(
                    hls,
                    (item.name || "PeerTube") + " [HLS]",
                    "Auto",
                    "m3u8"
                  ));
                  break;
                }
              }
            }

            if (!out.length && v && v.files) {
              for (var f = 0; f < v.files.length; f++) {
                var mp4 = v.files[f] && v.files[f].fileUrl;
                if (direct(mp4)) {
                  out.push(stream(
                    mp4,
                    (item.name || "PeerTube") + " [MP4]",
                    "Auto",
                    "mp4"
                  ));
                  break;
                }
              }
            }

            return out;
          }).catch(function () {
            return [];
          })
        );
      })(list[i]);
    }

    return Promise.all(jobs).then(function (groups) {
      var out = [];
      for (var j = 0; j < groups.length; j++) out = out.concat(groups[j]);
      return out;
    });
  }).catch(function () {
    return [];
  });
}

function getStreams(tmdbId, mediaType, season, episode) {
  return tmdb(tmdbId, mediaType, season, episode)
    .then(function (target) {
      return Promise.all([
        dailymotion(target),
        peertube(target)
      ]);
    })
    .then(function (groups) {
      var all = [];
      for (var i = 0; i < groups.length; i++) all = all.concat(groups[i]);
      all = uniq(all);
      return all.slice(0, 8);
    })
    .catch(function (err) {
      console.error("[" + PROVIDER_NAME + "] " + (err && err.message ? err.message : err));
      return [];
    });
}

function onSettings() {
  return [
    { type: "header", label: "VN Global Video" },
    { type: "info", label: "Enter your TMDB API key." },
    {
      type: "text",
      key: "tmdbApiKey",
      label: "TMDB API Key",
      placeholder: "Paste TMDB API key",
      description: "Required for movie and TV metadata.",
      isPassword: true
    },
    {
      type: "info",
      label: "Optional: Dailymotion direct streams require your authorized Dailymotion access token."
    },
    {
      type: "text",
      key: "dailymotionAccessToken",
      label: "Dailymotion Access Token",
      placeholder: "Paste authorized access token",
      description: "Used only for Dailymotion's official stream URL API.",
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
