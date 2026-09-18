const PROVIDER_NAME = "VN Global Video";
const PROVIDER_ID = "globalvideo";

function getSettings() {
  return globalThis.SCRAPER_SETTINGS || {};
}

function enc(value) {
  return encodeURIComponent(String(value || ""));
}

function json(url) {
  return fetch(url).then(function (response) {
    if (!response.ok) throw new Error("HTTP " + response.status);
    return response.json();
  });
}

function text(value) {
  return String(value || "").trim();
}

function playable(url) {
  if (!url) return false;
  var u = url.toLowerCase();
  return u.indexOf(".mp4") !== -1 ||
    u.indexOf(".m3u8") !== -1 ||
    u.indexOf(".webm") !== -1 ||
    u.indexOf(".ogv") !== -1;
}

function makeStream(url, title, quality, source) {
  var lower = url.toLowerCase();
  var format = lower.indexOf(".m3u8") !== -1 ? "m3u8" :
    lower.indexOf(".webm") !== -1 ? "webm" :
    lower.indexOf(".ogv") !== -1 ? "ogv" : "mp4";

  return {
    name: PROVIDER_NAME,
    title: title || source + " Public Video",
    url: url,
    quality: quality || "Unknown",
    provider: PROVIDER_ID,
    format: format
  };
}

function unique(streams) {
  var seen = {};
  var result = [];

  streams.forEach(function (s) {
    if (!s || !s.url || seen[s.url]) return;
    seen[s.url] = true;
    result.push(s);
  });

  return result;
}

function resolveTMDB(tmdbId, mediaType, season, episode) {
  var settings = getSettings();
  var apiKey = text(settings.tmdbApiKey);

  if (!apiKey) {
    return Promise.reject(new Error("TMDB API key missing"));
  }

  var base = "https://api.themoviedb.org/3/";
  var showUrl = base + "tv/" + enc(tmdbId) + "?api_key=" + enc(apiKey);
  var movieUrl = base + "movie/" + enc(tmdbId) + "?api_key=" + enc(apiKey);

  if (mediaType === "tv") {
    var episodeUrl = null;

    if (season !== undefined && episode !== undefined) {
      episodeUrl =
        base + "tv/" + enc(tmdbId) +
        "/season/" + enc(season) +
        "/episode/" + enc(episode) +
        "?api_key=" + enc(apiKey);
    }

    var showPromise = json(showUrl);
    var epPromise = episodeUrl ? json(episodeUrl).catch(function () { return {}; }) : Promise.resolve({});

    return Promise.all([showPromise, epPromise]).then(function (data) {
      var show = data[0] || {};
      var ep = data[1] || {};

      return {
        mediaType: "tv",
        title: text(show.name || show.original_name),
        originalTitle: text(show.original_name),
        episodeTitle: text(ep.name),
        season: season,
        episode: episode,
        year: text((show.first_air_date || "").slice(0, 4))
      };
    });
  }

  return json(movieUrl).then(function (data) {
    return {
      mediaType: "movie",
      title: text(data.title || data.original_title),
      originalTitle: text(data.original_title),
      episodeTitle: "",
      year: text((data.release_date || "").slice(0, 4))
    };
  });
}

function normalize(value) {
  return text(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function relevant(target, candidate) {
  var c = normalize(candidate);
  if (!c) return false;

  var main = normalize(target.title);
  var original = normalize(target.originalTitle);
  var compactMain = main.replace(/ /g, "");
  var compactCandidate = c.replace(/ /g, "");

  if (compactMain && compactCandidate.indexOf(compactMain) !== -1) {
    if (target.mediaType !== "tv") return true;
    if (target.season === undefined || target.episode === undefined) return true;

    var s = String(parseInt(target.season, 10) || 1);
    var e = String(parseInt(target.episode, 10) || 1);
    var s2 = s.length === 1 ? "0" + s : s;
    var e2 = e.length === 1 ? "0" + e : e;

    return c.indexOf("s" + s2 + "e" + e2) !== -1 ||
      c.indexOf("s" + s + "e" + e) !== -1 ||
      (target.episodeTitle && c.indexOf(normalize(target.episodeTitle)) !== -1);
  }

  if (original) {
    var compactOriginal = original.replace(/ /g, "");
    if (compactOriginal && compactCandidate.indexOf(compactOriginal) !== -1) {
      return true;
    }
  }

  var words = main.split(" ");
  var hits = 0;
  for (var i = 0; i < words.length; i++) {
    if (words[i].length > 2 && c.indexOf(words[i]) !== -1) hits++;
  }

  return words.length > 0 && hits >= Math.max(1, Math.ceil(words.length * 0.7));
}

function searchInternetArchive(target) {
  var query;

  if (target.mediaType === "tv") {
    var s = String(parseInt(target.season, 10) || 1);
    var e = String(parseInt(target.episode, 10) || 1);
    var s2 = s.length === 1 ? "0" + s : s;
    var e2 = e.length === 1 ? "0" + e : e;

    query =
      'title:("' + target.title.replace(/"/g, "") + '") AND ' +
      'mediatype:movies AND (' +
      'title:"S' + s2 + 'E' + e2 + '" OR ' +
      'title:"S' + s + 'E' + e + '" OR ' +
      'title:"' + (target.episodeTitle || "").replace(/"/g, "") + '"' +
      ')';
  } else {
    query =
      'title:("' + target.title.replace(/"/g, "") + '") AND mediatype:movies';
  }

  var url =
    "https://archive.org/advancedsearch.php?q=" +
    enc(query) +
    "&fl[]=identifier&fl[]=title&rows=4&page=1&output=json";

  return json(url).then(function (data) {
    var docs = data && data.response && data.response.docs
      ? data.response.docs : [];

    var candidates = docs.slice(0, 4);

    return Promise.all(candidates.map(function (doc) {
      if (!doc.identifier) return Promise.resolve([]);

      return json(
        "https://archive.org/metadata/" + enc(doc.identifier)
      ).then(function (meta) {
        var files = meta && meta.files ? meta.files : [];
        var streams = [];

        for (var i = 0; i < files.length; i++) {
          var file = files[i] || {};
          var name = text(file.name);

          if (!playable(name)) continue;

          var lower = name.toLowerCase();
          if (lower.indexOf("sample") !== -1 ||
              lower.indexOf("preview") !== -1 ||
              lower.indexOf("thumbnail") !== -1) continue;

          var candidateTitle =
            text(doc.title) + " " + name;

          if (!relevant(target, candidateTitle)) continue;

          var direct =
            "https://archive.org/download/" +
            encodeURIComponent(doc.identifier) +
            "/" +
            name.split("/").map(encodeURIComponent).join("/");

          streams.push(
            makeStream(direct, name, "Public", "Internet Archive")
          );

          if (streams.length >= 3) break;
        }

        return streams;
      }).catch(function () {
        return [];
      });
    }));
  }).then(function (groups) {
    var result = [];
    for (var i = 0; i < groups.length; i++) {
      result = result.concat(groups[i]);
    }
    return result;
  }).catch(function () {
    return [];
  });
}

function searchWikimedia(target) {
  var searchTitle = target.title;

  if (target.mediaType === "tv" && target.episodeTitle) {
    searchTitle += " " + target.episodeTitle;
  }

  var url =
    "https://commons.wikimedia.org/w/api.php" +
    "?action=query&generator=search" +
    "&gsrsearch=" + enc(searchTitle + " video") +
    "&gsrnamespace=6&gsrlimit=5" +
    "&prop=imageinfo&iiprop=url|mime" +
    "&format=json&origin=*";

  return json(url).then(function (data) {
    var pages = data && data.query && data.query.pages
      ? data.query.pages : {};

    var streams = [];
    var keys = Object.keys(pages);

    for (var i = 0; i < keys.length; i++) {
      var page = pages[keys[i]];
      if (!page.imageinfo || !page.imageinfo[0]) continue;

      var info = page.imageinfo[0];
      var candidateTitle = page.title || "";

      if (!info.url || !relevant(target, candidateTitle)) continue;

      var mime = text(info.mime).toLowerCase();
      if (mime.indexOf("video/") !== 0 && !playable(info.url)) continue;

      streams.push(
        makeStream(
          info.url,
          candidateTitle.replace(/^File:/, ""),
          "Public",
          "Wikimedia Commons"
        )
      );

      if (streams.length >= 2) break;
    }

    return streams;
  }).catch(function () {
    return [];
  });
}

function getStreams(tmdbId, mediaType, season, episode) {
  return resolveTMDB(tmdbId, mediaType, season, episode)
    .then(function (target) {
      return Promise.all([
        searchInternetArchive(target),
        searchWikimedia(target)
      ]);
    })
    .then(function (groups) {
      var streams = [];

      for (var i = 0; i < groups.length; i++) {
        streams = streams.concat(groups[i]);
      }

      streams = unique(streams);

      console.log(
        "[" + PROVIDER_NAME + "] Found " + streams.length + " relevant streams"
      );

      return streams.slice(0, 6);
    })
    .catch(function (error) {
      console.error(
        "[" + PROVIDER_NAME + "] " +
        (error && error.message ? error.message : error)
      );
      return [];
    });
}

function onSettings() {
  return [
    {
      type: "header",
      label: "VN Global Video"
    },
    {
      type: "info",
      label: "Enter your TMDB API key."
    },
    {
      type: "text",
      key: "tmdbApiKey",
      label: "TMDB API Key",
      placeholder: "Paste TMDB API key",
      description: "Required for movie and TV metadata.",
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
