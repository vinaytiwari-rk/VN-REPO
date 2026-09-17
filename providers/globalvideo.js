const PROVIDER_NAME = "VN Global Video";
const PROVIDER_ID = "globalvideo";

function settings() {
  return globalThis.SCRAPER_SETTINGS || {};
}

function clean(v) {
  return String(v == null ? "" : v).trim();
}

function enc(v) {
  return encodeURIComponent(clean(v));
}

function getJson(url) {
  return fetch(url).then(function (r) {
    if (!r.ok) {
      throw new Error("HTTP " + r.status);
    }
    return r.json();
  });
}

/* ---------- SAFE TITLE NORMALIZATION ---------- */

function normalizeTitle(v) {
  return clean(v)
    .toLowerCase()
    .replace(/[_\-./]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/ /g, "");
}

function getWords(v) {
  return clean(v)
    .toLowerCase()
    .replace(/[_\-./]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(function (x) {
      return x.length >= 3;
    });
}

function uniqueText(list) {
  var seen = {};
  var out = [];

  list.forEach(function (v) {
    v = clean(v);
    if (!v) return;

    var key = normalizeTitle(v);

    if (!key || seen[key]) return;

    seen[key] = true;
    out.push(v);
  });

  return out;
}

/* ---------- PLAYABLE ---------- */

function playable(url) {
  if (!url) return false;

  var u = String(url).toLowerCase();

  return (
    u.indexOf(".mp4") !== -1 ||
    u.indexOf(".m3u8") !== -1 ||
    u.indexOf(".webm") !== -1 ||
    u.indexOf(".ogv") !== -1
  );
}

/* ---------- STREAM ---------- */

function makeStream(
  url,
  title,
  size,
  quality
) {
  var lower = String(url).toLowerCase();

  return {
    name: PROVIDER_NAME,
    title: clean(title) || "Public Video",
    url: url,
    quality: quality || "Public",
    size: size || undefined,
    provider: PROVIDER_ID,
    format:
      lower.indexOf(".m3u8") !== -1
        ? "m3u8"
        : lower.indexOf(".webm") !== -1
        ? "webm"
        : "mp4"
  };
}

/* ---------- TMDB ---------- */

function resolveTMDB(
  tmdbId,
  mediaType,
  season,
  episode
) {
  var key = clean(settings().tmdbApiKey);

  if (!key) {
    return Promise.reject(
      new Error("TMDB API key missing")
    );
  }

  if (
    mediaType === "tv" &&
    season != null &&
    episode != null
  ) {
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
        season: season,
        episode: episode,
        year: clean(
          String(
            show.first_air_date || ""
          ).substring(0, 4)
        )
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
      title: clean(
        data.title || data.name
      ),
      originalTitle: clean(
        data.original_title ||
        data.original_name
      ),
      episodeTitle: "",
      season: null,
      episode: null,
      year: clean(
        String(
          data.release_date ||
          data.first_air_date ||
          ""
        ).substring(0, 4)
      )
    };
  });
}

/* ---------- SEARCH PATTERNS ---------- */

function buildSearches(meta, mediaType) {
  var list = [];

  if (meta.title) {
    list.push(meta.title);
  }

  if (
    meta.originalTitle &&
    meta.originalTitle !== meta.title
  ) {
    list.push(meta.originalTitle);
  }

  if (
    mediaType === "tv" &&
    meta.season != null &&
    meta.episode != null
  ) {
    var s =
      meta.season < 10
        ? "0" + meta.season
        : String(meta.season);

    var e =
      meta.episode < 10
        ? "0" + meta.episode
        : String(meta.episode);

    if (meta.title) {
      list.push(
        meta.title + " S" + s + "E" + e
      );

      list.push(
        meta.title + " S" + s + " E" + e
      );

      list.push(
        meta.title +
        " Season " +
        meta.season +
        " Episode " +
        meta.episode
      );

      list.push(
        meta.title +
        " Episode " +
        meta.episode
      );

      list.push(
        meta.title +
        " Ep " +
        meta.episode
      );

      list.push(
        meta.title +
        " " +
        meta.episode
      );
    }

    if (meta.episodeTitle) {
      list.push(meta.episodeTitle);

      if (meta.title) {
        list.push(
          meta.title +
          " " +
          meta.episodeTitle
        );
      }
    }

    /*
      Full movie / compilation possibilities.
    */

    if (meta.title) {
      list.push(
        meta.title + " full"
      );

      list.push(
        meta.title + " complete"
      );

      list.push(
        meta.title + " compilation"
      );

      list.push(
        meta.title +
        " season " +
        meta.season
      );
    }
  } else {
    if (
      meta.title &&
      meta.year
    ) {
      list.push(
        meta.title +
        " " +
        meta.year
      );
    }

    if (meta.title) {
      list.push(
        meta.title + " full"
      );

      list.push(
        meta.title + " complete"
      );
    }
  }

  return uniqueText(list);
}

/* ---------- RELEVANCE ---------- */

function scoreCandidate(
  text,
  meta,
  mediaType
) {
  var c =
    normalizeTitle(text);

  if (!c) return 0;

  var score = 0;

  var title =
    normalizeTitle(meta.title);

  var original =
    normalizeTitle(
      meta.originalTitle
    );

  var episode =
    normalizeTitle(
      meta.episodeTitle
    );

  /*
    Altarboy
    Altar Boy
    Altar-Boy
    become comparable.
  */

  if (
    title &&
    c.indexOf(title) !== -1
  ) {
    score += 60;
  }

  if (
    title &&
    title.indexOf(c) !== -1
  ) {
    score += 20;
  }

  if (
    original &&
    original !== title &&
    c.indexOf(original) !== -1
  ) {
    score += 50;
  }

  if (
    episode &&
    c.indexOf(episode) !== -1
  ) {
    score += 45;
  }

  var important =
    getWords(meta.title)
      .concat(
        getWords(
          meta.originalTitle
        )
      );

  uniqueText(important).forEach(
    function (word) {
      if (
        c.indexOf(
          normalizeTitle(word)
        ) !== -1
      ) {
        score += 8;
      }
    }
  );

  if (
    mediaType === "tv" &&
    meta.season != null &&
    meta.episode != null
  ) {
    var s =
      String(meta.season);

    var e =
      String(meta.episode);

    var patterns = [
      "s" + s + "e" + e,
      "s" +
        (meta.season < 10
          ? "0" + meta.season
          : meta.season) +
        "e" +
        (meta.episode < 10
          ? "0" + meta.episode
          : meta.episode),
      "episode" + e,
      "ep" + e
    ];

    patterns.forEach(function (p) {
      if (
        c.indexOf(
          normalizeTitle(p)
        ) !== -1
      ) {
        score += 35;
      }
    });
  }

  return score;
}

/* ---------- INTERNET ARCHIVE ---------- */

function searchArchive(
  query,
  meta,
  mediaType
) {
  var url =
    "https://archive.org/advancedsearch.php?q=" +
    enc(
      'title:("' +
      query.replace(/"/g, "") +
      '")'
    ) +
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
            return [];
          }

          return getJson(
            "https://archive.org/metadata/" +
            enc(doc.identifier)
          )
            .then(function (metaData) {
              var files =
                metaData &&
                metaData.files
                  ? metaData.files
                  : [];

              var output = [];

              files.forEach(function (file) {
                var name =
                  clean(file.name);

                if (!playable(name)) {
                  return;
                }

                if (
                  name
                    .toLowerCase()
                    .indexOf("sample") !== -1
                ) {
                  return;
                }

                var candidate =
                  clean(doc.title) +
                  " " +
                  name;

                var score =
                  scoreCandidate(
                    candidate,
                    meta,
                    mediaType
                  );

                var direct =
                  "https://archive.org/download/" +
                  encodeURIComponent(
                    doc.identifier
                  ) +
                  "/" +
                  name
                    .split("/")
                    .map(
                      encodeURIComponent
                    )
                    .join("/");

                output.push({
                  score: score,
                  stream: makeStream(
                    direct,
                    clean(doc.title) ||
                      name,
                    Number(
                      file.size || 0
                    ),
                    score >= 70
                      ? "Public • Match"
                      : "Public"
                  )
                });
              });

              return output;
            })
            .catch(function () {
              return [];
            });
        })
      );
    })
    .then(function (groups) {
      var all = [];

      groups.forEach(function (group) {
        all =
          all.concat(group);
      });

      all.sort(function (a, b) {
        if (
          b.score !== a.score
        ) {
          return b.score - a.score;
        }

        return (
          Number(
            a.stream.size || 0
          ) -
          Number(
            b.stream.size || 0
          )
        );
      });

      return all;
    })
    .catch(function () {
      return [];
    });
}

/* ---------- WIKIMEDIA ---------- */

function searchWikimedia(
  query,
  meta,
  mediaType
) {
  var url =
    "https://commons.wikimedia.org/w/api.php" +
    "?action=query" +
    "&generator=search" +
    "&gsrsearch=" +
    enc(query + " video") +
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

      var output = [];

      Object.keys(pages).forEach(
        function (id) {
          var page = pages[id];

          if (
            !page.imageinfo ||
            !page.imageinfo[0]
          ) {
            return;
          }

          var info =
            page.imageinfo[0];

          if (!info.url) return;

          var mime =
            clean(info.mime)
              .toLowerCase();

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

          var score =
            scoreCandidate(
              title,
              meta,
              mediaType
            );

          output.push({
            score: score,
            stream: makeStream(
              info.url,
              title ||
                "Wikimedia Video",
              Number(
                info.size || 0
              ),
              score >= 70
                ? "Public • Match"
                : "Public"
            )
          });
        }
      );

      output.sort(function (a, b) {
        return b.score - a.score;
      });

      return output;
    })
    .catch(function () {
      return [];
    });
}

/* ---------- MAIN ---------- */

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
      var searches =
        buildSearches(
          meta,
          mediaType
        );

      return Promise.all(
        searches.map(
          function (query) {
            return Promise.all([
              searchArchive(
                query,
                meta,
                mediaType
              ),

              searchWikimedia(
                query,
                meta,
                mediaType
              )
            ]);
          }
        )
      );
    })
    .then(function (groups) {
      var all = [];
      var seen = {};

      groups.forEach(
        function (group) {
          group.forEach(
            function (source) {
              source.forEach(
                function (entry) {
                  if (
                    !entry ||
                    !entry.stream ||
                    !entry.stream.url
                  ) {
                    return;
                  }

                  if (
                    seen[
                      entry.stream.url
                    ]
                  ) {
                    return;
                  }

                  seen[
                    entry.stream.url
                  ] = true;

                  all.push(entry);
                }
              );
            }
          );
        }
      );

      all.sort(function (a, b) {
        if (
          b.score !== a.score
        ) {
          return b.score - a.score;
        }

        return (
          Number(
            a.stream.size || 0
          ) -
          Number(
            b.stream.size || 0
          )
        );
      });

      return all
        .slice(0, 12)
        .map(function (x) {
          return x.stream;
        });
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

/* ---------- SETTINGS ---------- */

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