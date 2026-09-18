const ALTARBOY_IMDB = "tt44126817";
const EP1 = "https://www.reelshort.com/episodes/episode-1-altarboy-6a7619d41dcbbd8e12015bfe-w8176edms9";
const ALL_EPISODES = "https://www.reelshort.com/full-episodes/altarboy-6a7619d41dcbbd8e12015bfe";

function getStreams(id, mediaType, season, episode) {
  if (String(mediaType || "").toLowerCase() !== "tv") return [];
  if (String(id || "").toLowerCase() !== ALTARBOY_IMDB) return [];

  const s = Number(season || 1);
  const e = Number(episode || 1);
  if (s !== 1) return [];

  return [{
    name: "VN Altarboy • ReelShort",
    title: "Altarboy 2026 • S01E" + String(e).padStart(2, "0") + " • Official ReelShort",
    externalUrl: e === 1 ? EP1 : ALL_EPISODES
  }];
}

module.exports = { getStreams };
