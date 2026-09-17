const PROVIDER_NAME = "VN Global Video";
const PROVIDER_ID = "globalvideo";

function S() {
  return globalThis.SCRAPER_SETTINGS || {};
}

function C(v) {
  return String(v == null ? "" : v).trim();
}

function E(v) {
  return encodeURIComponent(C(v));
}

function J(url) {
  return fetch(url).then(function (r) {
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  });
}

function playable(url) {
  if (!url) return false;

  var x = String(url).toLowerCase();

  return (
    x.indexOf(".m3u8") !== -1 ||
    x.indexOf(".mp4") !== -1 ||
    x.indexOf(".webm") !== -1 ||
    x.indexOf(".ogv") !== -1
  );
}

function make(url, title, quality, source) {
  var x = String(url).toLowerCase();

  return {
    name: PROVIDER_NAME,
    title: C(title) || source || "Public Stream",
    url: url,
    quality: quality || "Auto",
    provider: PROVIDER_ID,
    format:
      x.indexOf(".m3u8") !== -1
        ? "m3u8"
        : x.indexOf(".webm") !== -1
        ? "webm"
        : "mp4"
  };
}

function unique(list) {
  var seen = {};
  var out = [];

  list.forEach(function (x) {
    if (!x || !x.url) return;

    if (seen[x.url]) return;

    seen[x.url] = true;
    out.push(x);
  });

  return out;
}

/* ---------------- TMDB ---------------- */

function tmdb(tmdbId, mediaType) {
  var key = C(S().tmdbApiKey);

  if (!key) {
    return Promise.reject(
      new Error("TMDB API key missing")
    );
  }

  var type =
    mediaType === "tv"
      ? "tv"
      : "movie";

  return J(
    "https://api.themoviedb.org/3/" +
      type +
      "/" +
      E(tmdbId) +
      "?api_key=" +
      E(key)
  );
}

/* ---------------- TITLE VARIANTS ---------------- */

function variants(meta, mediaType, season, episode) {
  var a = [];

  var title = C(
    meta.title || meta.name
  );

  var original = C(
    meta.original_title ||
      meta.original_name
  );

  if (title) a.push(title);

  if (
    original &&
    original.toLowerCase() !==
      title.toLowerCase()
  ) {
    a.push(original);
  }

  if (
    mediaType === "tv" &&
    season != null &&
    episode != null
  ) {
    if (title) {
      a.push(
        title +
          " S" +
          (season < 10
            ? "0" + season
            : season) +
          "E" +
          (episode < 10
            ? "0" + episode
            : episode)
      );

      a.push(
        title +
          " Episode " +
          episode
      );

      a.push(
        title +
          " Ep " +
          episode
      );
    }

    if (meta.episodeTitle) {
      a.push(C(meta.episodeTitle));

      if (title) {
        a.push(
          title +
            " " +
            C(meta.episodeTitle)
        );
      }
    }
  }

  return a.slice(0, 5);
}

/* ---------------- DIRECT API ADAPTERS ---------------- */

/*
  Adapter contract:
  Each adapter MUST return direct playable
  URLs only.

  No webpage URL is returned.
*/

function adapterWikimedia(query) {
  return J(
    "https://commons.wikimedia.org/w/api.php" +
      "?action=query" +
      "&generator=search" +
      "&gsrsearch=" +
      E(query + " video") +
      "&gsrnamespace=6" +
      "&gsrlimit=5" +
      "&prop=imageinfo" +
      "&iiprop=url|mime" +
      "&format=json" +
      "&origin=*"
  )
    .then(function (data) {
      var pages =
        data &&
        data.query &&
        data.query.pages
          ? data.query.pages
          : {};

      var result = [];

      Object.keys(pages).forEach(
        function (id) {
          var p = pages[id];

          if (
            !p.imageinfo ||
            !p.imageinfo[0]
          ) {
            return;
          }

          var info =
            p.imageinfo[0];

          if (!info.url) return;

          var mime =
            C(info.mime).toLowerCase();

          if (
            mime.indexOf("video/") === 0 ||
            playable(info.url)
          ) {
            result.push(
              make(
                info.url,
                p.title
                  ? p.title.replace(
                      /^File:/,
                      ""
                    )
                  : "Wikimedia",
                "Public",
                "Wikimedia"
              )
            );
          }
        }
      );

      return result;
    })
    .catch(function () {
      return [];
    });
}

/*
  Internet Archive is intentionally NOT
  recursively crawling metadata.

  That was the main reason for the
  previous multi-minute delay.
*/

function adapterArchive(query) {
  return J(
    "https://archive.org/advancedsearch.php?q=" +
      E(
        'title:("' +
          query.replace(/"/g, "") +
          '")'
      ) +
      "&fl[]=identifier" +
      "&fl[]=title" +
      "&rows=5" +
      "&output=json"
  )
    .then(function () {
      /*
        Search results do not guarantee a
        direct playable URL, so don't guess.
      */
      return [];
    })
    .catch(function () {
      return [];
    });
}

/* ---------------- MAIN ---------------- */

function getStreams(
  tmdbId,
  mediaType,
  season,
  episode
) {
  return tmdb(
    tmdbId,
    mediaType
  )
    .then(function (meta) {
      var q =
        variants(
          meta,
          mediaType,
          season,
          episode
        );

      /*
        Only two fastest title searches.
        All requests run in parallel.
      */

      q = q.slice(0, 2);

      return Promise.all(
        q.map(function (query) {
          return Promise.all([
            adapterWikimedia(query),
            adapterArchive(query)
          ]);
        })
      );
    })
    .then(function (groups) {
      var result = [];

      groups.forEach(function (g) {
        g.forEach(function (items) {
          result =
            result.concat(items);
        });
      });

      return unique(result).slice(0, 8);
    })
    .catch(function (e) {
      console.error(
        "[VN Global Video]",
        e && e.message
          ? e.message
          : e
      );

      return [];
    });
}

/* ---------------- SETTINGS ---------------- */

function onSettings() {
  return [
    {
      type: "header",
      label: "VN Global Video"
    },
    {
      type: "info",
      label:
        "Fast public direct-video sources."
    },
    {
      type: "text",
      key: "tmdbApiKey",
      label: "TMDB API Key",
      placeholder:
        "Paste TMDB API key",
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