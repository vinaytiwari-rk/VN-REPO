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

/* -------------------------------------------------------
   TITLE NORMALIZATION
   Altarboy / Altar Boy / Altar-Boy / Altar_Boy
   all become comparable.
------------------------------------------------------- */

function normalizeTitle(value) {
  return clean(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_\-./]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s/g, "");
}

function words(value) {
  return clean(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_\-./]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(function (x) {
      return x.length >= 3;
    });
}

function uniqueValues(list) {
  var seen = {};
  var result = [];

  list.forEach(function (x) {
    x = clean(x);

    if (!x) return;

    var key = normalizeTitle(x);

    if (!key || seen[key]) return;

    seen[key] = true;
    result.push(x);
  });

  return result;
}

/* -------------------------------------------------------
   PLAYABLE URL CHECK
------------------------------------------------------- */

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

/* -------------------------------------------------------
   STREAM OBJECT
------------------------------------------------------- */

function makeStream(url, title, size, source, label) {
  var lower = url.toLowerCase();

  return {
    name: PROVIDER_NAME,
    title: clean(title) || "Public Video",
    url: url,
    quality: label || "Public",
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

/* -------------------------------------------------------
   TMDB
------------------------------------------------------- */

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

    var epUrl =
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
      getJson(epUrl)
    ]).then(function (data) {
      var show = data[0] || {};
      var ep = data[1] || {};

      return {
        title: clean(show.name),
        originalTitle: clean(show.original_name),
        episodeTitle: clean(ep.name),
        overview: clean(
          (ep.overview || "") +
          " " +
          (show.overview || "")
        ),
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
      overview: clean(data.overview),
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

/* -------------------------------------------------------
   SEARCH QUERY GENERATION
------------------------------------------------------- */

function buildSearches(meta, mediaType) {
  var searches = [];

  var title = clean(meta.title);
  var original = clean(meta.originalTitle);
  var episodeTitle = clean(meta.episodeTitle);

  if (title) {
    searches.push(title);
  }

  if (original && original !== title) {
    searches.push(original);
  }

  if (
    mediaType === "tv" &&
    meta.season != null &&
    meta.episode != null
  ) {
    var s =
      String(meta.season).padStart(2, "0");

    var e =
      String(meta.episode).padStart(2, "0");

    if (title) {
      searches.push(
        title + " S" + s + "E" + e
      );

      searches.push(
        title + " S" + s + " E" + e
      );

      searches.push(
        title +
        " Season " +
        meta.season +
        " Episode " +
        meta.episode
      );

      searches.push(
        title +
        " Episode " +
        meta.episode
      );

      searches.push(
        title +
        " Ep " +
        meta.episode
      );

      searches.push(
        title + " " + meta.episode
      );
    }

    if (episodeTitle) {
      searches.push(episodeTitle);

      if (title) {
        searches.push(
          title + " " + episodeTitle
        );
      }
    }

    /*
      Compilation/full-video possibilities.
    */

    if (title) {
      searches.push(title + " complete");
      searches.push(title + " full");
      searches.push(title + " compilation");
      searches.push(title + " season " + meta.season);
    }
  } else {
    if (title && meta.year) {
      searches.push(
        title + " " + meta.year
      );
    }

    if (original && meta.year) {
      searches.push(
        original + " " + meta.year
      );
    }

    if (title) {
      searches.push(title + " full");
      searches.push(title + " complete");
    }
  }

  return uniqueValues(searches);
}

/* -------------------------------------------------------
   RELEVANCE SCORING
------------------------------------------------------- */

function scoreCandidate(
  candidateText,
  meta,
  mediaType
) {
  var candidate =
    normalizeTitle(candidateText);

  if (!candidate) return 0;

  var score = 0;

  var title =
    normalizeTitle(meta.title);

  var original =
    normalizeTitle(meta.originalTitle);

  var episode =
    normalizeTitle(meta.episodeTitle);

  /*
    Strong show-name match.
    This handles:
    Altarboy
    Altar Boy
    Altar-Boy
  */

  if (title) {
    if (candidate.indexOf(title) !== -1) {
      score += 60;
    }

    if (title.indexOf(candidate) !== -1) {
      score += 20;
    }
  }

  if (
    original &&
    original !== title
  ) {
    if (candidate.indexOf(original) !== -1) {
      score += 50;
    }
  }

  /*
    Episode title.
  */

  if (episode) {
    if (candidate.indexOf(episode) !== -1) {
      score += 45;
    }
  }

  /*
    Word matching.
  */

  var importantWords = [];

  importantWords =
    importantWords.concat(words(meta.title));

  importantWords =
    importantWords.concat(words(meta.originalTitle));

  var uniqueWords =
    uniqueValues(importantWords);

  uniqueWords.forEach(function (word) {
    if (
      candidate.indexOf(
        normalizeTitle(word)
      ) !== -1
    ) {
      score += 8;
    }
  });

  /*
    Episode indicators.
  */

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
        String(meta.season).padStart(2, "0") +
        "e" +
        String(meta.episode).padStart(2, "0"),
      "episode" + e,
      "ep" + e
    ];

    patterns.forEach(function (p) {
      if (
        candidate.indexOf(
          normalizeTitle(p)
        ) !== -1
      ) {
        score += 35;
      }
    });
  }

  /*
    Compilation/full content gets some
    positive score, but not enough to
    outrank a proper episode match.
  */

  var compilationWords = [
    "complete",
    "full",
    "compilation",
    "allepisodes",
    "season"
  ];

  compilationWords.forEach(function (word) {
    if (
      candidate.indexOf(
        normalizeTitle(word)
      ) !== -1
    ) {
      score += 5;
    }
  });

  return score;
}

/* -------------------------------------------------------
   INTERNET ARCHIVE
------------------------------------------------------- */

function searchArchive(
  searchTitle,
  meta,
  mediaType
) {
  var query =
    'title:("' +
    searchTitle.replace(/"/g, "") +
    '")';

  var url =
    "https://archive.org/advancedsearch.php?q=" +
    enc(query) +
    "&fl[]=identifier" +
    "&fl[]=title" +
    "&fl[]=description" +
    "&rows=30" +
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
            .then(function (full) {
              var files =
                full && full.files
                  ? full.files
                  : [];

              var result = [];

              var metadataText =
                clean(doc.title) +
                " " +
                clean(doc.description) +
                " " +
                clean(full.title) +
                " " +
                clean(full.description);

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

                var candidateText =
                  metadataText +
                  " " +
                  name;

                var score =
                  scoreCandidate(
                    candidateText,
                    meta,
                    mediaType
                  );

                /*
                  Don't throw away weak candidates
                  during the first search. Keep them
                  so alternate title searches can
                  still discover unusual uploads.
                */

                var direct =
                  "https://archive.org/download/" +
                  encodeURIComponent(
                    doc.identifier
                  ) +
                  "/" +
                  name
                    .split("/")
                    .map(encodeURIComponent)
                    .join("/");

                var size =
                  Number(file.size || 0);

                result.push({
                  item: makeStream(
                    direct,
                    clean(doc.title) ||
                      name,
                    size,
                    "Internet Archive",
                    score >= 80
                      ? "Public • Match"
                      : "Public"
                  ),
                  score: score
                });
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

      groups.forEach(function (group) {
        all = all.concat(group);
      });

      all.sort(function (a, b) {
        if (b.score !== a.score) {
          return b.score - a.score;
        }

        var as =
          Number(
            a.item.size || 0
          );

        var bs =
          Number(
            b.item.size || 0
          );

        if (!as && !bs) return 0;
        if (!as) return 1;
        if (!bs) return -1;

        return as - bs;
      });

      return all;
    });
}

/* -------------------------------------------------------
   WIKIMEDIA COMMONS
------------------------------------------------------- */

function searchWikimedia(
  searchTitle,
  meta,
  mediaType
) {
  var url =
    "https://commons.wikimedia.org/w/api.php" +
    "?action=query" +
    "&generator=search" +
    "&gsrsearch=" +
    enc(searchTitle + " video") +
    "&gsrnamespace=6" +
    "&gsrlimit=30" +
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

        var info =
          page.imageinfo[0];

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

        var score =
          scoreCandidate(
            title,
            meta,
            mediaType
          );

        result.push({
          item: makeStream(
            info.url,
            title || "Wikimedia Video",
            Number(info.size || 0),
            "Wikimedia Commons",
            score >= 80
              ? "Public • Match"
              : "Public"
          ),
          score: score
        });
      });

      result.sort(function (a, b) {
        return b.score - a.score;
      });

      return result;
    })
    .catch(function () {
      return [];
    });
}

/* -------------------------------------------------------
   MAIN STREAM FUNCTION
------------------------------------------------------- */

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

      /*
        Run every search.
      */

      return Promise.all(
        searches.map(function (query) {
          return Promise.all([
            searchArchive(
              query,
              meta,
              mediaType
            ).catch(function () {
              return [];
            }),

            searchWikimedia(
              query,
              meta,
              mediaType
            ).catch(function () {
              return [];
            })
          ]);
        })
      );
    })
    .then(function (groups) {
      var all = [];
      var seen = {};

      groups.forEach(function (group) {
        group.forEach(function (source) {
          source.forEach(function (entry) {
            if (
              !entry ||
              !entry.item ||
              !entry.item.url
            ) {
              return;
            }

            if (
              seen[entry.item.url]
            ) {
              return;
            }

            seen[entry.item.url] = true;

            all.push(entry);
          });
        });
      });

      /*
        Highest relevance first.
      Smaller files win when relevance
        is equal.
      */

      all.sort(function (a, b) {
        if (b.score !== a.score) {
          return b.score - a.score;
        }

        var as =
          Number(
            a.item.size || 0
          );

        var bs =
          Number(
            b.item.size || 0
          );

        if (!as && !bs) return 0;
        if (!as) return 1;
        if (!bs) return -1;

        return as - bs;
      });

      return all
        .slice(0, 12)
        .map(function (entry) {
          return entry.item;
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

/* -------------------------------------------------------
   SETTINGS
------------------------------------------------------- */

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