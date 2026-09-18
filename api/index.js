const https = require("https");

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function getJson(url, headers) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: headers || {} }, r => {
      let data = "";
      r.on("data", c => data += c);
      r.on("end", () => {
        if (r.statusCode < 200 || r.statusCode >= 300) return reject(new Error("HTTP " + r.statusCode));
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.setTimeout(10000, () => req.destroy(new Error("timeout")));
  });
}

function q(v) {
  return encodeURIComponent(String(v || ""));
}

function tmdbKey() {
  return process.env.TMDB_API_KEY || "";
}

async function tmdb(id, type) {
  const key = tmdbKey();
  if (!key) return null;
  const raw = String(id || "").replace(/^tmdb:/, "");
  const endpoint = type === "series" ? "tv/" : "movie/";
  return getJson("https://api.themoviedb.org/3/" + endpoint + q(raw) + "?api_key=" + q(key) + "&language=en-US");
}

function titleOf(m, type) {
  return m && (type === "series" ? (m.name || m.original_name) : (m.title || m.original_title));
}

async function dmSearch(query, limit) {
  const data = await getJson(
    "https://api.dailymotion.com/videos?search=" + q(query) +
    "&fields=id,title,thumbnail_url,duration,status&limit=" + (limit || 12)
  );
  return (data && data.list) || [];
}

async function ptSearch(query, limit) {
  const data = await getJson(
    "https://peertube.tv/api/v1/search/videos?search=" + q(query) +
    "&count=" + (limit || 12)
  );
  return (data && data.data) || [];
}

async function ptVideo(id) {
  return getJson("https://peertube.tv/api/v1/videos/" + q(id));
}

function norm(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\\s+/g, " ").trim();
}

function relevant(target, name) {
  const a = norm(target), b = norm(name);
  if (!a || !b) return false;
  return b.indexOf(a) >= 0 || a.indexOf(b) >= 0;
}

function poster(url) {
  return url || undefined;
}

async function catalog(type, search) {
  if (!search) return { metas: [] };
  const [dm, pt] = await Promise.allSettled([dmSearch(search, 10), ptSearch(search, 10)]);
  const metas = [];
  if (dm.status === "fulfilled") {
    dm.value.forEach(v => {
      if (!v || !v.id || (v.status && v.status !== "published")) return;
      metas.push({
        id: "dm:" + v.id,
        type: type,
        name: v.title || "Dailymotion Video",
        poster: poster(v.thumbnail_url),
        description: "Public Dailymotion video. Opens through the official Dailymotion player."
      });
    });
  }
  if (pt.status === "fulfilled") {
    pt.value.forEach(v => {
      if (!v || !v.id || !v.name) return;
      metas.push({
        id: "pt:" + v.id,
        type: type,
        name: v.name,
        poster: poster(v.thumbnailPath),
        description: "Public PeerTube video."
      });
    });
  }
  return { metas: metas.slice(0, 20) };
}

async function streamFor(id, type, season, episode) {
  if (String(id).indexOf("dm:") === 0) {
    const vid = String(id).slice(3);
    return {
      streams: [{
        name: "VN Global Video",
        title: "Dailymotion Official Player",
        externalUrl: "https://geo.dailymotion.com/player.html?video=" + q(vid)
      }]
    };
  }

  if (String(id).indexOf("pt:") === 0) {
    const vid = String(id).slice(3);
    const v = await ptVideo(vid);
    const streams = [];
    (v.streamingPlaylists || []).forEach(p => {
      if (p && p.playlistUrl) streams.push({
        name: "VN Global Video",
        title: "PeerTube HLS",
        url: p.playlistUrl
      });
    });
    (v.files || []).forEach(f => {
      if (f && f.fileUrl) streams.push({
        name: "VN Global Video",
        title: "PeerTube MP4",
        url: f.fileUrl
      });
    });
    return { streams: streams.slice(0, 8) };
  }

  const raw = String(id || "").replace(/^tmdb:/, "");
  const m = await tmdb(raw, type);
  if (!m) return { streams: [] };

  const title = titleOf(m, type);
  const query = type === "series"
    ? title + " S" + (season || 1) + "E" + (episode || 1)
    : title;

  const [dm, pt] = await Promise.allSettled([dmSearch(query, 12), ptSearch(query, 12)]);
  const streams = [];

  if (dm.status === "fulfilled") {
    dm.value.forEach(v => {
      if (!v || !v.id || (v.status && v.status !== "published") || !relevant(title, v.title)) return;
      streams.push({
        name: "VN Global Video",
        title: (v.title || "Dailymotion") + " • Official Player",
        externalUrl: "https://geo.dailymotion.com/player.html?video=" + q(v.id)
      });
    });
  }

  if (pt.status === "fulfilled") {
    for (const v of pt.value) {
      if (!v || !v.id || !relevant(title, v.name)) continue;
      try {
        const full = await ptVideo(v.id);
        (full.streamingPlaylists || []).forEach(p => {
          if (p && p.playlistUrl) streams.push({
            name: "VN Global Video",
            title: (v.name || "PeerTube") + " • HLS",
            url: p.playlistUrl
          });
        });
        (full.files || []).forEach(f => {
          if (f && f.fileUrl) streams.push({
            name: "VN Global Video",
            title: (v.name || "PeerTube") + " • MP4",
            url: f.fileUrl
          });
        });
      } catch (_) {}
    }
  }

  const seen = {};
  return { streams: streams.filter(s => {
    const k = s.url || s.externalUrl;
    if (!k || seen[k]) return false;
    seen[k] = true;
    return true;
  }).slice(0, 12) };
}

async function meta(id, type) {
  if (String(id).indexOf("dm:") === 0) {
    const vid = String(id).slice(3);
    const list = await dmSearch(vid, 1);
    const v = list[0];
    return { meta: v ? {
      id, type, name: v.title || "Dailymotion Video", poster: v.thumbnail_url
    } : null };
  }
  if (String(id).indexOf("pt:") === 0) {
    const v = await ptVideo(String(id).slice(3));
    return { meta: v ? {
      id, type, name: v.name, poster: v.thumbnailPath, description: v.description
    } : null };
  }
  const m = await tmdb(id, type);
  return { meta: m ? {
    id, type, name: titleOf(m, type),
    poster: m.poster_path ? "https://image.tmdb.org/t/p/w500" + m.poster_path : undefined,
    background: m.backdrop_path ? "https://image.tmdb.org/t/p/w1280" + m.backdrop_path : undefined,
    description: m.overview || undefined
  } : null };
}

module.exports = async function(req, res) {
  try {
    const parsed = new URL(req.url, "https://vn-global-video-addon.vercel.app");
    const path = parsed.pathname;
    const parts = path.split("/").filter(Boolean);
    const search = parsed.searchParams.get("search") || "";
    const seasonParam = parsed.searchParams.get("season") || "";
    const episodeParam = parsed.searchParams.get("episode") || "";

    if (req.method === "OPTIONS") return send(res, 200, { ok: true });

    if (path === "/manifest.json" || path === "/manifest") {
      return send(res, 200, require("../manifest.json"));
    }

    if (parts[0] === "catalog") {
      const type = parts[1] === "series" ? "series" : "movie";
      return send(res, 200, await catalog(type, search));
    }

    if (parts[0] === "meta") {
      return send(res, 200, await meta(parts[2] || "", parts[1] === "series" ? "series" : "movie"));
    }

    if (parts[0] === "stream") {
      const type = parts[1] === "series" ? "series" : "movie";
      let id = decodeURIComponent(parts[2] || "").replace(/\.json$/, "");
      let season = seasonParam;
      let episode = episodeParam;

      // Stremio/Nuvio series IDs commonly arrive as tmdb:<id>:<season>:<episode>.
      if (type === "series") {
        const m = id.match(/^(.*?)(?::(\d+))(?::(\d+))$/);
        if (m) {
          id = m[1];
          season = season || m[2];
          episode = episode || m[3];
        }
      }

      return send(res, 200, await streamFor(id, type, season, episode));
    }

    return send(res, 404, { error: "Not Found" });
  } catch (e) {
    return send(res, 200, { streams: [], metas: [], error: "Provider temporarily unavailable" });
  }
};
