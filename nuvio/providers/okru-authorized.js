/*
 * OK.RU authorized-video resolver
 *
 * IMPORTANT:
 * - Disabled by default.
 * - Intended only for videos the operator owns or is explicitly authorized
 *   to redistribute.
 * - It does not bypass login, DRM, private videos, or access controls.
 * - Returns direct HLS candidates from publicly served OK.RU embed metadata.
 */
function parseVideoId(input) {
  var m = String(input || "").match(/(?:ok\.ru\/(?:video|videoembed)\/|^)(\d{8,})/);
  return m ? m[1] : "";
}

function decodeMetadata(html) {
  var marker = '&quot;metadata&quot;:&quot;';
  var idx = String(html || "").indexOf(marker);
  if (idx < 0) return null;
  var s = String(html).slice(idx + marker.length, idx + marker.length + 25000)
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\\/g, '\\');
  var start = s.indexOf("{");
  if (start < 0) return null;
  var depth = 0, inString = false, escaped = false;
  for (var i = start; i < s.length; i++) {
    var ch = s[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
    } else {
      if (ch === '"') inString = true;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          try { return JSON.parse(s.slice(start, i + 1)); } catch (_) { return null; }
        }
      }
    }
  }
  return null;
}

function getStreams(videoId) {
  var id = parseVideoId(videoId);
  if (!id) return Promise.resolve([]);
  return fetch("https://ok.ru/videoembed/" + id, {
    headers: { "Accept": "text/html,application/xhtml+xml" }
  }).then(function(r) {
    if (!r.ok) throw Error("OK.RU embed unavailable");
    return r.text();
  }).then(function(html) {
    var meta = decodeMetadata(html);
    var hls = meta && (meta.hlsManifestUrl || meta.hlsMasterUrl || meta.ondemandHls);
    if (!hls) {
      var m = String(html).match(/(?:hlsManifestUrl|hlsMasterUrl|ondemandHls)(?:&quot;|")\s*:\s*(?:&quot;|")(https?:[^"&<]+)(?:&quot;|")/i);
      if (m) hls = m[1]
        .replace(/\\u0026/g, "&")
        .replace(/\\\\u0026/g, "&")
        .replace(/&amp;/g, "&");
    }
    if (!hls || !/^https:\/\//i.test(hls)) return [];
    return [{
      name: "VN • OK.RU Authorized HLS",
      title: String(meta && meta.movie && meta.movie.title || ("OK.RU Video " + id)),
      url: hls,
      quality: "Auto",
      headers: { Referer: "https://ok.ru/", Origin: "https://ok.ru" }
    }];
  }).catch(function() { return []; });
}

module.exports = { getStreams: getStreams };
