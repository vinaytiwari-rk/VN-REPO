const PROVIDER_NAME = "VN Global Video";
const PROVIDER_ID = "globalvideo";

function settings() {
  return globalThis.SCRAPER_SETTINGS || {};
}

function enc(v) {
  return encodeURIComponent(String(v || ""));
}

function clean(v) {
  return String(v || "").trim();
}

function getJson(url) {
  return fetch(url).then(function (r) {
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  });
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

function tokens(text) {
  return clean(text)
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(function (x) {
      return x.length >= 3;
    });
}

function relevant(text, searchTitle) {
  var a = tokens(text);
  var b = tokens(searchTitle);

  if (!b.length) return true;

  var hits = 0;

  b.forEach(function (word) {
    if (a.indexOf(word) !== -1) hits++;
  });

  return hits >= Math.min(2, b.length);
}

function stream(url, title, size, source) {
  return {
    name: PROVIDER_NAME,
    title: title,
    url: url,
    quality: "Public",
    size: size || undefined,
    provider: PROVIDER_ID,
    format:
      url.toLowerCase().indexOf(".m3u8") !== -1
        ? "m3u8"
        : "mp4"
  };
}


/* =====================================================
   TMDB RESOLUTION
   ===================================================== */

function resolveTMDB(tmdbId, mediaType, season, episode) {
  var key = clean(settings().tmdbApiKey);

  if (!key) {
    return Promise.reject(
      new Error("TMDB API key missing")
    );
  }

  if (mediaType === "tv" && season != null && episode != null) {

    var showUrl =
      "https://api.themoviedb.org/3/tv/" +
      enc(tmdbId) +
      "?api_key=" +
      enc(key);

    var episodeUrl =
      "https://api.themoviedb.org/3/tv/" +
      enc(tmdbId) +
      "/season/" +
      enc(season) +
      "/episode/" +
      enc(episode) +
      "?api_key=" +
      enc(key);

    return Promise.all([
      getJson(showUrl),
      getJson(episodeUrl)
    ]).then(function (data) {

      var show = data[0] || {};
      var ep = data[1] || {};

      return {
        title: clean(show.name),
        originalTitle: clean(show.original_name),
        episodeTitle: clean(ep.name),
        year: clean(
          (show.first_air_date || "").slice(0, 4)
        ),
        season: season,
        episode: episode
      };
    });
  }

  var type =
    mediaType === "tv"
      ? "tv"
      : "movie";

  var url =
    "https://api.themoviedb.org/3/" +
    type +
    "/" +
    enc(tmdbId) +
    "?api_key=" +
    enc(key);

  return getJson(url).then(function (data) {
    return {
      title: clean(data.title || data.name),
      originalTitle: clean(
        data.original_title ||
        data.original_name
      ),
      episodeTitle: "",
      year: clean(
        (
          data.release_date ||
          data.first_air_date ||
          ""
        ).slice(0, 4)
      )
    };
  });
}


/* =====================================================
   INTERNET ARCHIVE
   ===================================================== */

function searchArchive(searchTitle) {

  var query =
    'title:("' +
    searchTitle.replace(/"/g, "") +
    '")';

  var url =
    "https://archive.org/advancedsearch.php?q=" +
    enc(query) +
    "&fl[]=identifier" +
    "&fl[]=title" +
    "&rows=20" +
    "&page=1" +
    "&output=json";

  return getJson(url)
    .then(function (data) {

      var docs =
        data &&
        data.response &&
        data.response.docs
          ? data.response.docs
          : [];

      return Promise.all(
        docs.map(function (doc) {

          if (!doc.identifier) {
            return Promise.resolve([]);
          }

          var metadataUrl =
            "https://archive.org/metadata/" +
            enc(doc.identifier);

          return getJson(metadataUrl)
            .then(function (meta) {

              var files =
                meta && meta.files
                  ? meta.files
                  : [];

              var result = [];

              files.forEach(function (file) {

                var name = clean(file.name);

                if (!playable(name)) return;

                if (
                  name.toLowerCase().indexOf("sample") !== -1
                ) {
                  return;
                }

                var combined =
                  clean(doc.title) +
                  " " +
                  name;

                /*
                 * IMPORTANT:
                 * Reject unrelated Archive results.
                 */
                if (!relevant(combined, searchTitle)) {
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

                var size =
                  Number(file.size || 0);

                result.push(
                  stream(
                    direct,
                    clean(doc.title) ||
                      name,
                    size,
                    "Internet Archive"
                  )
                );
              });

              return result;
            })
            .catch(function () {
              return [];
            });
        })
      );
    })
    .then(function (groups) {

      var all = [];

      groups.forEach(function (g) {
        all = all.concat(g);
      });

      /*
       * Smaller files first.
       * This generally gives faster-starting public files.
       */
      all.sort(function (a, b) {

        var as =
          Number(a.size || 0);

        var bs =
          Number(b.size || 0);

        if (!as && !bs) return 0;
        if (!as) return 1;
        if (!bs) return -1;

        return as - bs;
      });

      return all;
    });
}


/* =====================================================
   WIKIMEDIA
   ===================================================== */

function searchWikimedia(searchTitle) {

  var url =
    "https://commons.wikimedia.org/w/api.php" +
    "?action=query" +
    "&generator=search" +
    "&gsrsearch=" +
    enc(searchTitle + " video") +
    "&gsrnamespace=6" +
    "&gsrlimit=20" +
    "&prop=imageinfo" +
    "&iiprop=url|mime|size" +
    "&format=json" +
    "&origin=*";

  return getJson(url)
    .then(function (data) {

      var pages =
        data &&
        data.query &&
        data.query.pages
          ? data.query.pages
          : {};

      var result = [];

      Object.keys(pages).forEach(function (id) {

        var page = pages[id];

        if (
          !page.imageinfo ||
          !page.imageinfo[0]
        ) {
          return;
        }

        var info = page.imageinfo[0];

        if (!info.url) return;

        var mime =
          clean(info.mime).toLowerCase();

        if (
          mime.indexOf("video/") !== 0 &&
          !playable(info.url)
        ) {
          return;
        }

        var title =
          clean(
            page.title
              ? page.title.replace(
                  /^File:/,
                  ""
                )
              : ""
          );

        if (!relevant(title, searchTitle)) {
          return;
        }

        result.push(
          stream(
            info.url,
            title || "Wikimedia Video",
            Number(info.size || 0),
            "Wikimedia Commons"
          )
        );
      });

      return result;
    });
}


/* =====================================================
   MAIN
   ===================================================== */

function getStreams(
  tmdbId,
  mediaType,
  season,
  episode
) {

  return resolveTMDB(
    tmdbId,
    mediaType,
    season,
    episode
  )
    .then(function (meta) {

      var searches = [];

      if (meta.title) {

        if (
          mediaType === "tv" &&
          meta.season != null &&
          meta.episode != null
        ) {

          var tvSearch =
            meta.title +
            " S" +
            String(meta.season).padStart(2, "0") +
            " E" +
            String(meta.episode).padStart(2, "0");

          searches.push(tvSearch);

          if (meta.episodeTitle) {
            searches.push(
              meta.title +
              " " +
              meta.episodeTitle
            );
          }

        } else {

          searches.push(
            meta.title +
            (meta.year
              ? " " + meta.year
              : "")
          );

          if (meta.originalTitle) {
            searches.push(
              meta.originalTitle
            );
          }
        }
      }

      return Promise.all(
        searches.map(function (query) {

          return Promise.all([
            searchArchive(query)
              .catch(function () {
                return [];
              }),

            searchWikimedia(query)
              .catch(function () {
                return [];
              })
          ]);
        })
      );
    })
    .then(function (groups) {

      var result = [];
      var seen = {};

      groups.forEach(function (group) {

        group.forEach(function (source) {

          source.forEach(function (item) {

            if (!item.url) return;

            if (seen[item.url]) return;

            seen[item.url] = true;

            result.push(item);
          });
        });
      });

      /*
       * Maximum 8 relevant results.
       * Don't flood Nuvio with random/slow files.
       */
      return result.slice(0, 8);
    })
    .catch(function (error) {

      console.error(
        "[VN Global Video]",
        error &&
        error.message
          ? error.message
          : error
      );

      return [];
    });
}


/* =====================================================
   SETTINGS
   ===================================================== */

function onSettings() {

  return [
    {
      type: "header",
      label: "VN Global Video"
    },

    {
      type: "info",
      label:
        "Public direct-video sources only."
    },

    {
      type: "text",
      key: "tmdbApiKey",
      label: "TMDB API Key",
      placeholder:
        "Paste your TMDB API key",
      description:
        "Required for movie and TV metadata.",
      isPassword: true
    }
  ];
}


module.exports = {
  getStreams: getStreams,
  onSettings: onSettings
};