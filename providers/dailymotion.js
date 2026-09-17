/*
 * Nuvio Dailymotion Provider
 *
 * Searches public Dailymotion videos and returns available
 * MP4 / HLS sources for Nuvio.
 */

const DM_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36",
  "Accept": "application/json,text/plain,*/*",
  "Referer": "https://www.dailymotion.com/",
  "Origin": "https://www.dailymotion.com"
};

const TMDB_HEADERS = {
  "User-Agent": "Nuvio-Dailymotion-Provider/1.0",
  "Accept": "application/json"
};

function settings() {
  return globalThis.SCRAPER_SETTINGS || {};
}

function cleanText(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/\\u0026/g, "&")
    .replace(/\\\//g, "/")
    .trim();
}

function normalize(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/\b(19|20)\d{2}\b/g, " ")
    .replace(/s\d{1,2}e\d{1,3}/gi, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value) {
  const stop = {
    the: 1,
    a: 1,
    an: 1,
    of: 1,
    and: 1,
    to: 1,
    in: 1,
    on: 1,
    for: 1,
    with: 1,
    from: 1,
    movie: 1,
    film: 1,
    official: 1,
    trailer: 1,
    full: 1,
    episode: 1
  };

  return normalize(value)
    .split(" ")
    .filter(function (x) {
      return x.length > 2 && !stop[x];
    });
}

function similarity(query, candidate) {
  const q = tokens(query);
  const c = tokens(candidate);

  if (!q.length || !c.length) return 0;

  let hits = 0;

  q.forEach(function (word) {
    if (c.indexOf(word) !== -1) hits++;
  });

  return hits / q.length;
}

function requestJson(url, headers) {
  return fetch(url, {
    headers: headers || {}
  }).then(function (response) {
    if (!response.ok) {
      throw new Error("HTTP " + response.status + " for " + url);
    }

    return response.json();
  });
}

function requestText(url, headers) {
  return fetch(url, {
    headers: headers || {}
  }).then(function (response) {
    if (!response.ok) {
      throw new Error("HTTP " + response.status + " for " + url);
    }

    return response.text();
  });
}

function pad(value) {
  const n = Number(value || 0);
  return n < 10 ? "0" + n : String(n);
}

function getTmdbTitle(tmdbId, mediaType, season, episode) {
  const cfg = settings();

  const apiKey = String(cfg.tmdbApiKey || "").trim();

  if (!apiKey) {
    throw new Error(
      "TMDB API key is not configured. Open Dailymotion provider settings in Nuvio and add it."
    );
  }

  const base = "https://api.themoviedb.org/3";

  const id = encodeURIComponent(String(tmdbId));

  const language = encodeURIComponent(
    cfg.language || "en-US"
  );

  if (mediaType === "tv") {
    const showUrl =
      base +
      "/tv/" +
      id +
      "?api_key=" +
      encodeURIComponent(apiKey) +
      "&language=" +
      language;

    const episodeUrl =
      base +
      "/tv/" +
      id +
      "/season/" +
      encodeURIComponent(String(season)) +
      "/episode/" +
      encodeURIComponent(String(episode)) +
      "?api_key=" +
      encodeURIComponent(apiKey) +
      "&language=" +
      language;

    return Promise.all([
      requestJson(showUrl, TMDB_HEADERS),
      requestJson(episodeUrl, TMDB_HEADERS)
    ]).then(function (items) {
      const show = items[0] || {};
      const ep = items[1] || {};

      const title =
        show.name ||
        show.original_name ||
        "";

      return {
        title: title,
        year: String(show.first_air_date || "").slice(0, 4),
        episodeTitle: ep.name || "",
        query:
          title +
          " S" +
          pad(season) +
          "E" +
          pad(episode) +
          (ep.name ? " " + ep.name : "")
      };
    });
  }

  const movieUrl =
    base +
    "/movie/" +
    id +
    "?api_key=" +
    encodeURIComponent(apiKey) +
    "&language=" +
    language;

  return requestJson(movieUrl, TMDB_HEADERS).then(function (movie) {
    const title =
      movie.title ||
      movie.original_title ||
      "";

    return {
      title: title,
      year: String(movie.release_date || "").slice(0, 4),
      episodeTitle: "",
      query:
        title +
        (movie.release_date
          ? " " + String(movie.release_date).slice(0, 4)
          : "")
    };
  });
}

function extractVideoIds(html) {
  const found = [];
  const seen = {};

  const re =
    /(?:dailymotion\.com\/video\/|\\\/video\\\/)\s*(x[a-z0-9]+)/gi;

  let match;

  while ((match = re.exec(html)) !== null) {
    const id = match[1].toLowerCase();

    if (!seen[id]) {
      seen[id] = true;
      found.push(id);
    }
  }

  return found;
}

function searchDailymotion(query, limit) {
  const url =
    "https://www.dailymotion.com/search/" +
    encodeURIComponent(query) +
    "/videos";

  return requestText(url, DM_HEADERS).then(function (html) {
    return extractVideoIds(html).slice(0, limit);
  });
}

function getMetadata(videoId) {
  const urls = [
    "https://www.dailymotion.com/player/metadata/video/" +
      videoId +
      "?app=com.dailymotion.neon",

    "https://www.dailymotion.com/player/metadata/video/" +
      videoId +
      "?embedder=https%3A%2F%2Fwww.dailymotion.com"
  ];

  function next(index) {
    if (index >= urls.length) {
      return Promise.reject(
        new Error(
          "No Dailymotion metadata endpoint succeeded"
        )
      );
    }

    return requestJson(
      urls[index],
      DM_HEADERS
    ).catch(function () {
      return next(index + 1);
    });
  }

  return next(0);
}

function buildStreams(
  videoId,
  metadata,
  requestedQuery,
  maxSources
) {
  if (!metadata || metadata.error) {
    return [];
  }

  const qualities = metadata.qualities || {};

  const order = [
    "1080",
    "720",
    "480",
    "380",
    "240",
    "auto"
  ];

  const streams = [];
  const used = {};

  order.forEach(function (quality) {
    const list = Array.isArray(qualities[quality])
      ? qualities[quality]
      : [];

    list.forEach(function (item) {
      if (!item || !item.url || used[item.url]) {
        return;
      }

      const type = String(item.type || "");

      if (
        type !== "video/mp4" &&
        type !== "application/x-mpegURL"
      ) {
        return;
      }

      used[item.url] = true;

      streams.push({
        name: "Dailymotion",

        title:
          cleanText(
            metadata.title || requestedQuery
          ) +
          " • " +
          quality +
          "p",

        url: String(item.url).split("#")[0],

        quality:
          quality === "auto"
            ? "Auto"
            : quality + "p",

        headers: {
          "User-Agent":
            DM_HEADERS["User-Agent"],
          "Referer":
            "https://www.dailymotion.com/"
        }
      });
    });
  });

  return streams.slice(0, maxSources);
}

function getStreams(
  tmdbId,
  mediaType,
  season,
  episode
) {
  const cfg = settings();

  const maxResults = Math.max(
    1,
    Math.min(
      10,
      Number(cfg.maxResults || 5)
    )
  );

  const maxSources = Math.max(
    1,
    Math.min(
      8,
      Number(cfg.maxSources || 3)
    )
  );

  if (!tmdbId) {
    return Promise.resolve([]);
  }

  if (
    mediaType === "tv" &&
    (!season || !episode)
  ) {
    return Promise.resolve([]);
  }

  if (
    mediaType !== "movie" &&
    mediaType !== "tv"
  ) {
    return Promise.resolve([]);
  }

  return getTmdbTitle(
    tmdbId,
    mediaType,
    season,
    episode
  )
    .then(function (info) {
      if (!info.title) {
        return [];
      }

      const queries = [info.query];

      if (mediaType === "tv") {
        queries.push(
          info.title +
            " S" +
            pad(season) +
            "E" +
            pad(episode)
        );

        if (info.episodeTitle) {
          queries.push(
            info.title +
              " " +
              info.episodeTitle
          );
        }
      } else {
        queries.push(info.title);
      }

      return queries.reduce(
        function (chain, query) {
          return chain.then(function (all) {
            if (all.length >= maxResults) {
              return all;
            }

            return searchDailymotion(
              query,
              maxResults
            )
              .then(function (ids) {
                ids.forEach(function (id) {
                  if (all.indexOf(id) === -1) {
                    all.push(id);
                  }
                });

                return all;
              })
              .catch(function (error) {
                console.log(
                  "[Dailymotion] Search failed: " +
                    error.message
                );

                return all;
              });
          });
        },
        Promise.resolve([])
      ).then(function (ids) {
        return Promise.all(
          ids.map(function (id) {
            return getMetadata(id)
              .then(function (metadata) {
                const score = similarity(
                  info.query,
                  metadata.title || ""
                );

                const relaxedScore =
                  similarity(
                    info.title +
                      (info.episodeTitle
                        ? " " +
                          info.episodeTitle
                        : ""),
                    metadata.title || ""
                  );

                return {
                  id: id,
                  metadata: metadata,
                  score: Math.max(
                    score,
                    relaxedScore * 0.9
                  )
                };
              })
              .catch(function (error) {
                console.log(
                  "[Dailymotion] Metadata " +
                    id +
                    " failed: " +
                    error.message
                );

                return null;
              });
          })
        ).then(function (results) {
          const valid = results
            .filter(function (x) {
              return (
                x &&
                x.metadata &&
                x.score >= 0.35
              );
            })
            .sort(function (a, b) {
              return b.score - a.score;
            });

          const streams = [];

          valid.forEach(function (item) {
            buildStreams(
              item.id,
              item.metadata,
              info.query,
              maxSources
            ).forEach(function (stream) {
              streams.push(stream);
            });
          });

          return streams.slice(
            0,
            maxSources * 2
          );
        });
      });
    })
    .catch(function (error) {
      console.log(
        "[Dailymotion] " +
          error.message
      );

      return [];
    });
}

function onSettings() {
  return [
    {
      type: "header",
      label: "Dailymotion"
    },

    {
      type: "text",
      key: "tmdbApiKey",
      label: "TMDB API Key",
      placeholder:
        "Paste your TMDB v3 API key",
      description:
        "Required to convert Nuvio's TMDB ID into a title before searching Dailymotion.",
      isPassword: true
    },

    {
      type: "select",
      key: "language",
      label: "TMDB Language",

      options: [
        {
          label: "English (US)",
          value: "en-US"
        },
        {
          label: "English (India)",
          value: "en-IN"
        },
        {
          label: "Hindi",
          value: "hi-IN"
        }
      ],

      defaultValue: "en-US"
    },

    {
      type: "select",
      key: "maxResults",
      label:
        "Dailymotion search results",

      options: [
        {
          label: "3",
          value: "3"
        },
        {
          label: "5",
          value: "5"
        },
        {
          label: "8",
          value: "8"
        }
      ],

      defaultValue: "5"/*
 * Nuvio Dailymotion Provider
 *
 * Searches public Dailymotion videos and returns available
 * MP4 / HLS sources for Nuvio.
 */

const DM_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36",
  "Accept": "application/json,text/plain,*/*",
  "Referer": "https://www.dailymotion.com/",
  "Origin": "https://www.dailymotion.com"
};

const TMDB_HEADERS = {
  "User-Agent": "Nuvio-Dailymotion-Provider/1.0",
  "Accept": "application/json"
};

function settings() {
  return globalThis.SCRAPER_SETTINGS || {};
}

function cleanText(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/\\u0026/g, "&")
    .replace(/\\\//g, "/")
    .trim();
}

function normalize(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/\b(19|20)\d{2}\b/g, " ")
    .replace(/s\d{1,2}e\d{1,3}/gi, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value) {
  const stop = {
    the: 1,
    a: 1,
    an: 1,
    of: 1,
    and: 1,
    to: 1,
    in: 1,
    on: 1,
    for: 1,
    with: 1,
    from: 1,
    movie: 1,
    film: 1,
    official: 1,
    trailer: 1,
    full: 1,
    episode: 1
  };

  return normalize(value)
    .split(" ")
    .filter(function (x) {
      return x.length > 2 && !stop[x];
    });
}

function similarity(query, candidate) {
  const q = tokens(query);
  const c = tokens(candidate);

  if (!q.length || !c.length) return 0;

  let hits = 0;

  q.forEach(function (word) {
    if (c.indexOf(word) !== -1) hits++;
  });

  return hits / q.length;
}

function requestJson(url, headers) {
  return fetch(url, {
    headers: headers || {}
  }).then(function (response) {
    if (!response.ok) {
      throw new Error("HTTP " + response.status + " for " + url);
    }

    return response.json();
  });
}

function requestText(url, headers) {
  return fetch(url, {
    headers: headers || {}
  }).then(function (response) {
    if (!response.ok) {
      throw new Error("HTTP " + response.status + " for " + url);
    }

    return response.text();
  });
}

function pad(value) {
  const n = Number(value || 0);
  return n < 10 ? "0" + n : String(n);
}

function getTmdbTitle(tmdbId, mediaType, season, episode) {
  const cfg = settings();

  const apiKey = String(cfg.tmdbApiKey || "").trim();

  if (!apiKey) {
    throw new Error(
      "TMDB API key is not configured. Open Dailymotion provider settings in Nuvio and add it."
    );
  }

  const base = "https://api.themoviedb.org/3";

  const id = encodeURIComponent(String(tmdbId));

  const language = encodeURIComponent(
    cfg.language || "en-US"
  );

  if (mediaType === "tv") {
    const showUrl =
      base +
      "/tv/" +
      id +
      "?api_key=" +
      encodeURIComponent(apiKey) +
      "&language=" +
      language;

    const episodeUrl =
      base +
      "/tv/" +
      id +
      "/season/" +
      encodeURIComponent(String(season)) +
      "/episode/" +
      encodeURIComponent(String(episode)) +
      "?api_key=" +
      encodeURIComponent(apiKey) +
      "&language=" +
      language;

    return Promise.all([
      requestJson(showUrl, TMDB_HEADERS),
      requestJson(episodeUrl, TMDB_HEADERS)
    ]).then(function (items) {
      const show = items[0] || {};
      const ep = items[1] || {};

      const title =
        show.name ||
        show.original_name ||
        "";

      return {
        title: title,
        year: String(show.first_air_date || "").slice(0, 4),
        episodeTitle: ep.name || "",
        query:
          title +
          " S" +
          pad(season) +
          "E" +
          pad(episode) +
          (ep.name ? " " + ep.name : "")
      };
    });
  }

  const movieUrl =
    base +
    "/movie/" +
    id +
    "?api_key=" +
    encodeURIComponent(apiKey) +
    "&language=" +
    language;

  return requestJson(movieUrl, TMDB_HEADERS).then(function (movie) {
    const title =
      movie.title ||
      movie.original_title ||
      "";

    return {
      title: title,
      year: String(movie.release_date || "").slice(0, 4),
      episodeTitle: "",
      query:
        title +
        (movie.release_date
          ? " " + String(movie.release_date).slice(0, 4)
          : "")
    };
  });
}

function extractVideoIds(html) {
  const found = [];
  const seen = {};

  const re =
    /(?:dailymotion\.com\/video\/|\\\/video\\\/)\s*(x[a-z0-9]+)/gi;

  let match;

  while ((match = re.exec(html)) !== null) {
    const id = match[1].toLowerCase();

    if (!seen[id]) {
      seen[id] = true;
      found.push(id);
    }
  }

  return found;
}

function searchDailymotion(query, limit) {
  const url =
    "https://www.dailymotion.com/search/" +
    encodeURIComponent(query) +
    "/videos";

  return requestText(url, DM_HEADERS).then(function (html) {
    return extractVideoIds(html).slice(0, limit);
  });
}

function getMetadata(videoId) {
  const urls = [
    "https://www.dailymotion.com/player/metadata/video/" +
      videoId +
      "?app=com.dailymotion.neon",

    "https://www.dailymotion.com/player/metadata/video/" +
      videoId +
      "?embedder=https%3A%2F%2Fwww.dailymotion.com"
  ];

  function next(index) {
    if (index >= urls.length) {
      return Promise.reject(
        new Error(
          "No Dailymotion metadata endpoint succeeded"
        )
      );
    }

    return requestJson(
      urls[index],
      DM_HEADERS
    ).catch(function () {
      return next(index + 1);
    });
  }

  return next(0);
}

function buildStreams(
  videoId,
  metadata,
  requestedQuery,
  maxSources
) {
  if (!metadata || metadata.error) {
    return [];
  }

  const qualities = metadata.qualities || {};

  const order = [
    "1080",
    "720",
    "480",
    "380",
    "240",
    "auto"
  ];

  const streams = [];
  const used = {};

  order.forEach(function (quality) {
    const list = Array.isArray(qualities[quality])
      ? qualities[quality]
      : [];

    list.forEach(function (item) {
      if (!item || !item.url || used[item.url]) {
        return;
      }

      const type = String(item.type || "");

      if (
        type !== "video/mp4" &&
        type !== "application/x-mpegURL"
      ) {
        return;
      }

      used[item.url] = true;

      streams.push({
        name: "Dailymotion",

        title:
          cleanText(
            metadata.title || requestedQuery
          ) +
          " • " +
          quality +
          "p",

        url: String(item.url).split("#")[0],

        quality:
          quality === "auto"
            ? "Auto"
            : quality + "p",

        headers: {
          "User-Agent":
            DM_HEADERS["User-Agent"],
          "Referer":
            "https://www.dailymotion.com/"
        }
      });
    });
  });

  return streams.slice(0, maxSources);
}

function getStreams(
  tmdbId,
  mediaType,
  season,
  episode
) {
  const cfg = settings();

  const maxResults = Math.max(
    1,
    Math.min(
      10,
      Number(cfg.maxResults || 5)
    )
  );

  const maxSources = Math.max(
    1,
    Math.min(
      8,
      Number(cfg.maxSources || 3)
    )
  );

  if (!tmdbId) {
    return Promise.resolve([]);
  }

  if (
    mediaType === "tv" &&
    (!season || !episode)
  ) {
    return Promise.resolve([]);
  }

  if (
    mediaType !== "movie" &&
    mediaType !== "tv"
  ) {
    return Promise.resolve([]);
  }

  return getTmdbTitle(
    tmdbId,
    mediaType,
    season,
    episode
  )
    .then(function (info) {
      if (!info.title) {
        return [];
      }

      const queries = [info.query];

      if (mediaType === "tv") {
        queries.push(
          info.title +
            " S" +
            pad(season) +
            "E" +
            pad(episode)
        );

        if (info.episodeTitle) {
          queries.push(
            info.title +
              " " +
              info.episodeTitle
          );
        }
      } else {
        queries.push(info.title);
      }

      return queries.reduce(
        function (chain, query) {
          return chain.then(function (all) {
            if (all.length >= maxResults) {
              return all;
            }

            return searchDailymotion(
              query,
              maxResults
            )
              .then(function (ids) {
                ids.forEach(function (id) {
                  if (all.indexOf(id) === -1) {
                    all.push(id);
                  }
                });

                return all;
              })
              .catch(function (error) {
                console.log(
                  "[Dailymotion] Search failed: " +
                    error.message
                );

                return all;
              });
          });
        },
        Promise.resolve([])
      ).then(function (ids) {
        return Promise.all(
          ids.map(function (id) {
            return getMetadata(id)
              .then(function (metadata) {
                const score = similarity(
                  info.query,
                  metadata.title || ""
                );

                const relaxedScore =
                  similarity(
                    info.title +
                      (info.episodeTitle
                        ? " " +
                          info.episodeTitle
                        : ""),
                    metadata.title || ""
                  );

                return {
                  id: id,
                  metadata: metadata,
                  score: Math.max(
                    score,
                    relaxedScore * 0.9
                  )
                };
              })
              .catch(function (error) {
                console.log(
                  "[Dailymotion] Metadata " +
                    id +
                    " failed: " +
                    error.message
                );

                return null;
              });
          })
        ).then(function (results) {
          const valid = results
            .filter(function (x) {
              return (
                x &&
                x.metadata &&
                x.score >= 0.35
              );
            })
            .sort(function (a, b) {
              return b.score - a.score;
            });

          const streams = [];

          valid.forEach(function (item) {
            buildStreams(
              item.id,
              item.metadata,
              info.query,
              maxSources
            ).forEach(function (stream) {
              streams.push(stream);
            });
          });

          return streams.slice(
            0,
            maxSources * 2
          );
        });
      });
    })
    .catch(function (error) {
      console.log(
        "[Dailymotion] " +
          error.message
      );

      return [];
    });
}

function onSettings() {
  return [
    {
      type: "header",
      label: "Dailymotion"
    },

    {
      type: "text",
      key: "tmdbApiKey",
      label: "TMDB API Key",
      placeholder:
        "Paste your TMDB v3 API key",
      description:
        "Required to convert Nuvio's TMDB ID into a title before searching Dailymotion.",
      isPassword: true
    },

    {
      type: "select",
      key: "language",
      label: "TMDB Language",

      options: [
        {
          label: "English (US)",
          value: "en-US"
        },
        {
          label: "English (India)",
          value: "en-IN"
        },
        {
          label: "Hindi",
          value: "hi-IN"
        }
      ],

      defaultValue: "en-US"
    },

    {
      type: "select",
      key: "maxResults",
      label:
        "Dailymotion search results",

      options: [
        {
          label: "3",
          value: "3"
        },
        {
          label: "5",
          value: "5"
        },
        {
          label: "8",
          value: "8"
        }
      ],

      defaultValue: "5"
    },

    {
      type: "select",
      key: "maxSources",
      label: "Sources per result",

      options: [
        {
          label: "2",
          value: "2"
        },
        {
          label: "3",
          value: "3"
        },
        {
          label: "5",
          value: "5"
        }
      ],

      defaultValue: "3"
    },

    {
      type: "info",
      label:
        "Only publicly available Dailymotion videos are queried. Availability can vary by video and region."
    }
  ];
}

module.exports = {
  getStreams,
  onSettings
};
    },

    {
      type: "select",
      key: "maxSources",
      label: "Sources per result",

      options: [
        {
          label: "2",
          value: "2"
        },
        {
          label: "3",
          value: "3"
        },
        {
          label: "5",
          value: "5"
        }
      ],

      defaultValue: "3"
    },

    {
      type: "info",
      label:
        "Only publicly available Dailymotion videos are queried. Availability can vary by video and region."
    }
  ];
}

module.exports = {
  getStreams,
  onSettings
};
