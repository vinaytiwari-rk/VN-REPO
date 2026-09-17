const PROVIDER_NAME = "VN Global Video";
const PROVIDER_ID = "globalvideo";

function getSettings() {
  return globalThis.SCRAPER_SETTINGS || {};
}

function enc(value) {
  return encodeURIComponent(String(value || ""));
}

function json(url) {
  return fetch(url)
    .then(function (response) {
      if (!response.ok) {
        throw new Error("HTTP " + response.status);
      }
      return response.json();
    });
}

function text(value) {
  return String(value || "").trim();
}

function playable(url) {
  if (!url) return false;

  var u = url.toLowerCase();

  return (
    u.indexOf(".mp4") !== -1 ||
    u.indexOf(".m3u8") !== -1 ||
    u.indexOf(".webm") !== -1 ||
    u.indexOf(".ogv") !== -1
  );
}

function makeStream(url, title, quality, source) {
  return {
    name: PROVIDER_NAME,
    title: title || source + " Public Video",
    url: url,
    quality: quality || "Unknown",
    provider: PROVIDER_ID,
    format: url.toLowerCase().indexOf(".m3u8") !== -1
      ? "m3u8"
      : "mp4"
  };
}

function unique(streams) {
  var seen = {};
  var result = [];

  streams.forEach(function (s) {
    if (!s || !s.url) return;

    if (seen[s.url]) return;

    seen[s.url] = true;
    result.push(s);
  });

  return result;
}


/* =========================================================
   TMDB
   ========================================================= */

function resolveTMDB(tmdbId, mediaType, season, episode) {
  var settings = getSettings();
  var apiKey = text(settings.tmdbApiKey);

  if (!apiKey) {
    return Promise.reject(new Error("TMDB API key missing"));
  }

  var url;

  if (mediaType === "tv") {
    if (season && episode) {
      url =
        "https://api.themoviedb.org/3/tv/" +
        enc(tmdbId) +
        "/season/" +
        enc(season) +
        "/episode/" +
        enc(episode) +
        "?api_key=" +
        enc(apiKey);
    } else {
      url =
        "https://api.themoviedb.org/3/tv/" +
        enc(tmdbId) +
        "?api_key=" +
        enc(apiKey);
    }
  } else {
    url =
      "https://api.themoviedb.org/3/movie/" +
      enc(tmdbId) +
      "?api_key=" +
      enc(apiKey);
  }

  return json(url).then(function (data) {
    return {
      title: text(data.title || data.name),
      originalTitle: text(
        data.original_title || data.original_name
      ),
      year: text(
        (data.release_date || data.first_air_date || "").slice(0, 4)
      )
    };
  });
}


/* =========================================================
   INTERNET ARCHIVE
   ========================================================= */

function searchInternetArchive(title) {
  var query =
    "title:(" +
    title.replace(/"/g, "") +
    ") AND mediatype:movies";

  var url =
    "https://archive.org/advancedsearch.php?q=" +
    enc(query) +
    "&fl[]=identifier&rows=8&page=1&output=json";

  return json(url)
    .then(function (data) {
      var docs =
        data &&
        data.response &&
        data.response.docs
          ? data.response.docs
          : [];

      return Promise.all(
        docs.map(function (doc) {
          if (!doc.identifier) return Promise.resolve([]);

          var metadataUrl =
            "https://archive.org/metadata/" +
            enc(doc.identifier);

          return json(metadataUrl)
            .then(function (meta) {
              var files =
                meta && meta.files
                  ? meta.files
                  : [];

              var streams = [];

              files.forEach(function (file) {
                var name = text(file.name);

                if (!playable(name)) return;

                if (
                  name.toLowerCase().indexOf("sample") !== -1
                ) {
                  return;
                }

                var direct =
                  "https://archive.org/download/" +
                  encodeURIComponent(doc.identifier) +
                  "/" +
                  name
                    .split("/")
                    .map(encodeURIComponent)
                    .join("/");

                streams.push(
                  makeStream(
                    direct,
                    name,
                    "Public",
                    "Internet Archive"
                  )
                );
              });

              return streams;
            })
            .catch(function () {
              return [];
            });
        })
      );
    })
    .then(function (groups) {
      var result = [];

      groups.forEach(function (group) {
        result = result.concat(group);
      });

      return result;
    });
}


/* =========================================================
   WIKIMEDIA COMMONS
   ========================================================= */

function searchWikimedia(title) {
  var url =
    "https://commons.wikimedia.org/w/api.php" +
    "?action=query" +
    "&generator=search" +
    "&gsrsearch=" +
    enc(title + " video") +
    "&gsrnamespace=6" +
    "&gsrlimit=8" +
    "&prop=imageinfo" +
    "&iiprop=url|mime|size" +
    "&format=json" +
    "&origin=*";

  return json(url).then(function (data) {
    var pages =
      data &&
      data.query &&
      data.query.pages
        ? data.query.pages
        : {};

    var streams = [];

    Object.keys(pages).forEach(function (key) {
      var page = pages[key];

      if (!page.imageinfo || !page.imageinfo[0]) {
        return;
      }

      var info = page.imageinfo[0];

      if (!info.url) return;

      var mime = text(info.mime).toLowerCase();

      if (
        mime.indexOf("video/") !== 0 &&
        !playable(info.url)
      ) {
        return;
      }

      streams.push(
        makeStream(
          info.url,
          page.title
            ? page.title.replace(/^File:/, "")
            : "Wikimedia Video",
          "Public",
          "Wikimedia Commons"
        )
      );
    });

    return streams;
  });
}


/* =========================================================
   MAIN
   ========================================================= */

function getStreams(tmdbId, mediaType, season, episode) {
  console.log(
    "[" +
      PROVIDER_NAME +
      "] " +
      mediaType +
      " " +
      tmdbId
  );

  return resolveTMDB(
    tmdbId,
    mediaType,
    season,
    episode
  )
    .then(function (meta) {
      var titles = [];

      if (meta.title) {
        titles.push(meta.title);
      }

      if (
        meta.originalTitle &&
        meta.originalTitle !== meta.title
      ) {
        titles.push(meta.originalTitle);
      }

      return Promise.all(
        titles.map(function (title) {
          return Promise.all([
            searchInternetArchive(title).catch(function () {
              return [];
            }),

            searchWikimedia(title).catch(function () {
              return [];
            })
          ]);
        })
      );
    })
    .then(function (groups) {
      var streams = [];

      groups.forEach(function (group) {
        group.forEach(function (sourceGroup) {
          streams = streams.concat(sourceGroup);
        });
      });

      streams = unique(streams);

      console.log(
        "[" +
          PROVIDER_NAME +
          "] Found " +
          streams.length +
          " streams"
      );

      return streams.slice(0, 20);
    })
    .catch(function (error) {
      console.error(
        "[" +
          PROVIDER_NAME +
          "] " +
          (error && error.message
            ? error.message
            : error)
      );

      return [];
    });
}


/* =========================================================
   SETTINGS
   ========================================================= */

function onSettings() {
  return [
    {
      type: "header",
      label: "VN Global Video"
    },

    {
      type: "info",
      label:
        "Enter your TMDB API key. It stays in Nuvio provider settings."
    },

    {
      type: "text",
      key: "tmdbApiKey",
      label: "TMDB API Key",
      placeholder: "Paste TMDB API key",
      description:
        "Required for movie and TV title resolution.",
      isPassword: true
    }
  ];
}


/* =========================================================
   EXPORT
   ========================================================= */

if (
  typeof module !== "undefined" &&
  module.exports
) {
  module.exports = {
    getStreams: getStreams,
    onSettings: onSettings
  };
}