/**
 * VN Global Video Provider
 * Provider ID: globalvideo
 * Author: Vinay Tiwari
 * Version: 1.6.0
 * 
 * Optimized for Nuvio Android (Hermes / QuickJS runtime)
 * Fast public video stream discovery & mobile-friendly relevance matching
 */

(function () {
  'use strict';

  var PROVIDER_NAME = 'VN Global Video';
  var PROVIDER_ID = 'globalvideo';
  var REQUEST_TIMEOUT_MS = 6000;

  var STOP_WORDS = {
    'the': 1, 'a': 1, 'an': 1, 'and': 1, 'or': 1, 'of': 1, 'in': 1, 'on': 1,
    'at': 1, 'to': 1, 'for': 1, 'with': 1, 'by': 1, 'from': 1, 'is': 1, 'it': 1,
    'as': 1, 'be': 1, 'this': 1, 'that': 1, 'are': 1, 'was': 1, 'were': 1
  };

  var PENALTY_PATTERNS = [
    /\btrailer\b/i,
    /\bteaser\b/i,
    /\bsample\b/i,
    /\bpromo\b/i,
    /\bpreview\b/i,
    /\breview\b/i,
    /\breaction\b/i,
    /\binterview\b/i,
    /\btheme\s+song\b/i,
    /\bsoundtrack\b/i,
    /\bost\b/i,
    /\bopening\b/i,
    /\bending\b/i,
    /\bgameplay\b/i,
    /\bmaking\s+of\b/i,
    /\bbehind\s+the\s+scenes\b/i,
    /\bfeaturette\b/i,
    /\bdeleted\s+scene\b/i,
    /\bbloopers\b/i
  ];

  /* ---------------------- UTILITY FUNCTIONS ---------------------- */

  function pad2(num) {
    var n = parseInt(num, 10);
    if (isNaN(n)) return '00';
    return (n < 10 ? '0' : '') + n;
  }

  function cleanString(str) {
    if (!str || typeof str !== 'string') return '';
    return str.replace(/[\u0000-\u001F\u007F-\u009F]/g, '').trim();
  }

  function normalizeText(str) {
    if (!str || typeof str !== 'string') return '';
    return str
      .toLowerCase()
      .replace(/[\'\`\"\.\,\-\_\:\;\!\?\(\)\[\]\{\}\/\\\|\&\+\#\@\*\^]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function compactText(str) {
    if (!str || typeof str !== 'string') return '';
    return str.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function getTokens(str) {
    var norm = normalizeText(str);
    if (!norm) return [];
    var parts = norm.split(' ');
    var tokens = [];
    for (var i = 0; i < parts.length; i++) {
      var w = parts[i];
      if (w.length > 1 && !STOP_WORDS[w]) {
        tokens.push(w);
      } else if (w.length === 1 && !isNaN(parseInt(w, 10))) {
        tokens.push(w);
      }
    }
    return tokens;
  }

  function fetchWithTimeout(url, options, timeoutMs) {
    var ms = timeoutMs || REQUEST_TIMEOUT_MS;
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () {
        reject(new Error('Request timeout (' + ms + 'ms): ' + url));
      }, ms);

      fetch(url, options || {})
        .then(function (res) {
          clearTimeout(timer);
          if (!res.ok) {
            reject(new Error('HTTP ' + res.status));
          } else {
            resolve(res);
          }
        })
        .catch(function (err) {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  function fetchJson(url, options, timeoutMs) {
    return fetchWithTimeout(url, options, timeoutMs).then(function (res) {
      return res.json();
    });
  }

  function getApiKey() {
    var settings = null;
    if (typeof globalThis !== 'undefined' && globalThis && globalThis.SCRAPER_SETTINGS) {
      settings = globalThis.SCRAPER_SETTINGS;
    } else if (typeof SCRAPER_SETTINGS !== 'undefined' && SCRAPER_SETTINGS) {
      settings = SCRAPER_SETTINGS;
    }
    if (settings && typeof settings.tmdbApiKey === 'string') {
      var key = settings.tmdbApiKey.trim();
      if (key.length > 0) return key;
    }
    return '';
  }

  /* ---------------------- TMDB METADATA ---------------------- */

  function getMovieMetadata(tmdbId, apiKey) {
    if (!apiKey) {
      // Graceful fallback when tmdbId is used directly as title during testing
      var rawTitle = String(tmdbId || '').trim();
      return Promise.resolve({
        mediaType: 'movie',
        title: rawTitle,
        originalTitle: rawTitle,
        year: '',
        overview: ''
      });
    }

    var url = 'https://api.themoviedb.org/3/movie/' + encodeURIComponent(tmdbId) + '?api_key=' + encodeURIComponent(apiKey);
    return fetchJson(url, {}, 5000)
      .then(function (data) {
        var title = data.title || data.original_title || String(tmdbId);
        var origTitle = data.original_title || '';
        var year = '';
        if (data.release_date && typeof data.release_date === 'string') {
          var dateParts = data.release_date.split('-');
          if (dateParts.length > 0 && dateParts[0].length === 4) {
            year = dateParts[0];
          }
        }
        return {
          mediaType: 'movie',
          title: title,
          originalTitle: origTitle,
          year: year,
          overview: data.overview || ''
        };
      })
      .catch(function () {
        return {
          mediaType: 'movie',
          title: String(tmdbId),
          originalTitle: '',
          year: '',
          overview: ''
        };
      });
  }

  function getTvMetadata(tmdbId, season, episode, apiKey) {
    if (!apiKey) {
      return Promise.resolve({
        mediaType: 'tv',
        seriesName: String(tmdbId || ''),
        originalSeriesName: '',
        season: parseInt(season, 10) || 1,
        episode: parseInt(episode, 10) || 1,
        episodeName: '',
        year: '',
        overview: ''
      });
    }

    var showUrl = 'https://api.themoviedb.org/3/tv/' + encodeURIComponent(tmdbId) + '?api_key=' + encodeURIComponent(apiKey);
    var epUrl = null;
    if (season !== undefined && season !== null && episode !== undefined && episode !== null) {
      epUrl = 'https://api.themoviedb.org/3/tv/' + encodeURIComponent(tmdbId) + '/season/' + encodeURIComponent(season) + '/episode/' + encodeURIComponent(episode) + '?api_key=' + encodeURIComponent(apiKey);
    }

    var showPromise = fetchJson(showUrl, {}, 5000).catch(function () {
      return null;
    });

    var epPromise = epUrl
      ? fetchJson(epUrl, {}, 5000).catch(function () {
          return null;
        })
      : Promise.resolve(null);

    return Promise.all([showPromise, epPromise]).then(function (results) {
      var showData = results[0];
      var epData = results[1];

      var seriesName = (showData && (showData.name || showData.original_name)) || String(tmdbId);
      var seriesOrigName = (showData && showData.original_name) || '';
      var year = '';
      if (showData && showData.first_air_date && typeof showData.first_air_date === 'string') {
        var dateParts = showData.first_air_date.split('-');
        if (dateParts.length > 0 && dateParts[0].length === 4) {
          year = dateParts[0];
        }
      }

      var epName = '';
      var epNum = episode;
      var sNum = season;

      if (epData) {
        epName = epData.name || '';
        if (epData.episode_number !== undefined) epNum = epData.episode_number;
        if (epData.season_number !== undefined) sNum = epData.season_number;
      }

      return {
        mediaType: 'tv',
        seriesName: seriesName,
        originalSeriesName: seriesOrigName,
        season: parseInt(sNum, 10) || 1,
        episode: parseInt(epNum, 10) || 1,
        episodeName: epName,
        year: year,
        overview: (epData && epData.overview) || (showData && showData.overview) || ''
      };
    });
  }

  /* ---------------------- RELEVANCE SCORING ---------------------- */

  function calculateRelevanceScore(target, candidateTitle, candidateDesc) {
    if (!candidateTitle) return 0;

    var candNorm = normalizeText(candidateTitle);
    var candCompact = compactText(candidateTitle);
    var descNorm = normalizeText(candidateDesc || '');

    // Reject obvious clips / promos / trailers
    for (var p = 0; p < PENALTY_PATTERNS.length; p++) {
      if (PENALTY_PATTERNS[p].test(candidateTitle)) {
        return 0;
      }
    }

    if (target.mediaType === 'movie') {
      var targetNorm = normalizeText(target.title);
      var targetOrigNorm = normalizeText(target.originalTitle || '');
      var targetCompact = compactText(target.title);
      var targetOrigCompact = compactText(target.originalTitle || '');

      var targetTokens = getTokens(target.title);
      if (targetTokens.length === 0) {
        targetTokens = [targetNorm];
      }

      var matchedTokens = 0;
      for (var i = 0; i < targetTokens.length; i++) {
        var t = targetTokens[i];
        if (candNorm.indexOf(t) !== -1 || descNorm.indexOf(t) !== -1) {
          matchedTokens++;
        }
      }

      var tokenRatio = targetTokens.length > 0 ? (matchedTokens / targetTokens.length) : 0;
      var score = tokenRatio * 70;

      // Exact or compact phrase matches
      if (targetCompact && candCompact.indexOf(targetCompact) !== -1) {
        score = Math.max(score, 75);
      }
      if (targetOrigCompact && candCompact.indexOf(targetOrigCompact) !== -1) {
        score = Math.max(score, 70);
      }

      // Year validation bonus
      if (target.year && target.year.length === 4) {
        if (candNorm.indexOf(target.year) !== -1) {
          score += 20;
        } else if (descNorm.indexOf(target.year) !== -1) {
          score += 10;
        }
      }

      // Reject if title overlap is too low
      if (tokenRatio < 0.45 && candCompact.indexOf(targetCompact) === -1) {
        return 0;
      }

      return Math.round(score);
    } else {
      // TV Series & Episode Matching
      var seriesNorm = normalizeText(target.seriesName);
      var seriesCompact = compactText(target.seriesName);
      var seriesOrigCompact = compactText(target.originalSeriesName || '');

      var seriesTokens = getTokens(target.seriesName);
      if (seriesTokens.length === 0) {
        seriesTokens = [seriesNorm];
      }

      var matchedSeriesTokens = 0;
      for (var s = 0; s < seriesTokens.length; s++) {
        var tok = seriesTokens[s];
        if (candNorm.indexOf(tok) !== -1) {
          matchedSeriesTokens++;
        }
      }

      var seriesTokenRatio = seriesTokens.length > 0 ? (matchedSeriesTokens / seriesTokens.length) : 0;

      // Series title MUST match
      var hasSeriesMatch = (seriesTokenRatio >= 0.5) ||
        (seriesCompact && candCompact.indexOf(seriesCompact) !== -1) ||
        (seriesOrigCompact && candCompact.indexOf(seriesOrigCompact) !== -1);

      if (!hasSeriesMatch) {
        return 0;
      }

      var tvScore = seriesTokenRatio * 40;
      if (candCompact.indexOf(seriesCompact) !== -1) {
        tvScore += 20;
      }

      // Season & Episode number patterns
      var sNum = target.season;
      var eNum = target.episode;
      var sPad = pad2(sNum);
      var ePad = pad2(eNum);

      var hasSeasonEpMatch = false;

      var sxxEyy = 's' + sPad + 'e' + ePad;
      var sxEy = 's' + sNum + 'e' + eNum;
      var seasonEpText1 = 'season ' + sNum + ' episode ' + eNum;
      var seasonEpText2 = 'season ' + sPad + ' episode ' + ePad;
      var seasonEpText3 = 'season ' + sNum + ' ep ' + eNum;
      var seasonEpText4 = 'season ' + sPad + ' ep ' + ePad;
      var xPattern1 = sNum + 'x' + ePad;
      var xPattern2 = sNum + 'x' + eNum;

      if (
        candNorm.indexOf(sxxEyy) !== -1 ||
        candNorm.indexOf(sxEy) !== -1 ||
        candNorm.indexOf(seasonEpText1) !== -1 ||
        candNorm.indexOf(seasonEpText2) !== -1 ||
        candNorm.indexOf(seasonEpText3) !== -1 ||
        candNorm.indexOf(seasonEpText4) !== -1 ||
        candNorm.indexOf(xPattern1) !== -1 ||
        candNorm.indexOf(xPattern2) !== -1
      ) {
        hasSeasonEpMatch = true;
        tvScore += 40;
      } else if (
        candNorm.indexOf('s' + sPad) !== -1 ||
        candNorm.indexOf('season ' + sNum) !== -1
      ) {
        if (
          candNorm.indexOf('e' + ePad) !== -1 ||
          candNorm.indexOf('ep ' + eNum) !== -1 ||
          candNorm.indexOf('episode ' + eNum) !== -1
        ) {
          hasSeasonEpMatch = true;
          tvScore += 35;
        }
      }

      // Episode title match if distinct
      if (target.episodeName) {
        var epNorm = normalizeText(target.episodeName);
        var epTokens = getTokens(target.episodeName);
        if (epTokens.length > 0 && epNorm !== 'episode ' + eNum && epNorm !== 'chapter ' + eNum) {
          var matchedEpTokens = 0;
          for (var e = 0; e < epTokens.length; e++) {
            if (candNorm.indexOf(epTokens[e]) !== -1) {
              matchedEpTokens++;
            }
          }
          if (matchedEpTokens > 0) {
            tvScore += (matchedEpTokens / epTokens.length) * 20;
            if (matchedEpTokens === epTokens.length) {
              hasSeasonEpMatch = true;
            }
          }
        }
      }

      // For TV, reject if no season/episode confirmation
      if (!hasSeasonEpMatch) {
        return 0;
      }

      return Math.round(tvScore);
    }
  }

  function detectFormat(url, formatStr) {
    var lowerUrl = (url || '').toLowerCase();
    var lowerFmt = (formatStr || '').toLowerCase();

    if (lowerUrl.indexOf('.m3u8') !== -1 || lowerFmt.indexOf('hls') !== -1 || lowerFmt.indexOf('m3u8') !== -1) {
      return 'm3u8';
    }
    if (lowerUrl.indexOf('.webm') !== -1 || lowerFmt.indexOf('webm') !== -1) {
      return 'webm';
    }
    if (lowerUrl.indexOf('.ogv') !== -1 || lowerUrl.indexOf('.ogg') !== -1 || lowerFmt.indexOf('ogg') !== -1) {
      return 'ogv';
    }
    return 'mp4';
  }

  function detectQuality(filename, format, height) {
    var str = ((filename || '') + ' ' + (format || '')).toLowerCase();
    var h = parseInt(height, 10);

    if (h >= 1080 || str.indexOf('1080p') !== -1 || str.indexOf('1080') !== -1) {
      return '1080p';
    }
    if (h >= 720 || str.indexOf('720p') !== -1 || str.indexOf('720') !== -1 || str.indexOf('hd') !== -1) {
      return '720p';
    }
    if (h >= 480 || str.indexOf('480p') !== -1 || str.indexOf('480') !== -1) {
      return '480p';
    }
    if (h >= 360 || str.indexOf('360p') !== -1 || str.indexOf('360') !== -1) {
      return '360p';
    }
    if (str.indexOf('512kb') !== -1 || str.indexOf('sd') !== -1) {
      return 'SD';
    }
    return 'Public';
  }

  function getQualityWeight(quality) {
    switch (quality) {
      case '1080p': return 5;
      case '720p': return 4;
      case '480p': return 3;
      case '360p': return 2;
      case 'SD': return 2;
      default: return 1;
    }
  }

  /* ---------------------- ADAPTER: INTERNET ARCHIVE ---------------------- */

  function searchInternetArchive(target) {
    var searchQuery = '';
    if (target.mediaType === 'movie') {
      var cleanTitle = normalizeText(target.title);
      searchQuery = 'title:(' + cleanTitle.replace(/"/g, '') + ') AND mediatype:movies';
    } else {
      var cleanSeries = normalizeText(target.seriesName);
      var sPad = pad2(target.season);
      var ePad = pad2(target.episode);
      var epQuery = cleanSeries + ' S' + sPad + 'E' + ePad;
      searchQuery = '(title:(' + epQuery.replace(/"/g, '') + ') OR title:(' + cleanSeries.replace(/"/g, '') + ')) AND mediatype:movies';
    }

    var searchUrl = 'https://archive.org/advancedsearch.php?q=' + encodeURIComponent(searchQuery) +
      '&fl[]=identifier,title,mediatype,year,description' +
      '&sort[]=downloads+desc' +
      '&rows=3&page=1&output=json';

    return fetchJson(searchUrl, {}, 5500)
      .then(function (data) {
        if (!data || !data.response || !data.response.docs || data.response.docs.length === 0) {
          return [];
        }

        var docs = data.response.docs;
        var scoredDocs = [];

        for (var i = 0; i < docs.length; i++) {
          var doc = docs[i];
          var score = calculateRelevanceScore(target, doc.title || doc.identifier, doc.description || '');
          if (score >= 45) {
            scoredDocs.push({
              identifier: doc.identifier,
              title: doc.title || doc.identifier,
              score: score
            });
          }
        }

        if (scoredDocs.length === 0) {
          return [];
        }

        scoredDocs.sort(function (a, b) {
          return b.score - a.score;
        });
        var topDocs = scoredDocs.slice(0, 2);

        var metaPromises = [];
        for (var d = 0; d < topDocs.length; d++) {
          (function (candidate) {
            var filesUrl = 'https://archive.org/metadata/' + encodeURIComponent(candidate.identifier) + '/files';
            var p = fetchJson(filesUrl, {}, 5000)
              .then(function (filesData) {
                if (!filesData || !filesData.result || !Array.isArray(filesData.result)) {
                  return [];
                }

                var files = filesData.result;
                var streams = [];

                for (var f = 0; f < files.length; f++) {
                  var file = files[f];
                  var fileName = file.name || '';
                  var format = file.format || '';
                  var lowerName = fileName.toLowerCase();
                  var size = parseInt(file.size, 10) || 0;

                  // Reject non-playable or metadata files
                  if (
                    lowerName.indexOf('_thumb') !== -1 ||
                    lowerName.indexOf('.thumbs') !== -1 ||
                    lowerName.indexOf('_sample') !== -1 ||
                    lowerName.indexOf('sample.mp4') !== -1 ||
                    lowerName.indexOf('.gif') !== -1 ||
                    lowerName.indexOf('.jpg') !== -1 ||
                    lowerName.indexOf('.png') !== -1 ||
                    lowerName.indexOf('.xml') !== -1 ||
                    lowerName.indexOf('.sqlite') !== -1 ||
                    lowerName.indexOf('.torrent') !== -1 ||
                    lowerName.indexOf('.txt') !== -1
                  ) {
                    continue;
                  }

                  // Reasonable size check
                  if (size > 0 && (size < 2 * 1024 * 1024 || size > 3.5 * 1024 * 1024 * 1024)) {
                    continue;
                  }

                  var isVideoFormat = (
                    format === 'MPEG4' ||
                    format === '512Kb MPEG4' ||
                    format === 'h.264' ||
                    format === 'WebM' ||
                    format === 'Ogg Video' ||
                    /\.(mp4|webm|ogv|m3u8)$/i.test(fileName)
                  );

                  if (!isVideoFormat) continue;

                  // Safely encode path segments for download URL
                  var pathSegments = fileName.split('/').map(encodeURIComponent).join('/');
                  var directUrl = 'https://archive.org/download/' + encodeURIComponent(candidate.identifier) + '/' + pathSegments;
                  var detectedFmt = detectFormat(fileName, format);
                  var detectedQual = detectQuality(fileName, format, file.height);

                  streams.push({
                    name: PROVIDER_NAME,
                    title: candidate.title + ' [' + detectedQual + ']',
                    url: directUrl,
                    quality: detectedQual,
                    provider: PROVIDER_ID,
                    format: detectedFmt,
                    score: candidate.score
                  });
                }

                return streams;
              })
              .catch(function () {
                return [];
              });

            metaPromises.push(p);
          })(topDocs[d]);
        }

        return Promise.all(metaPromises).then(function (results) {
          var allStreams = [];
          for (var r = 0; r < results.length; r++) {
            var sList = results[r];
            for (var k = 0; k < sList.length; k++) {
              allStreams.push(sList[k]);
            }
          }
          return allStreams;
        });
      })
      .catch(function () {
        return [];
      });
  }

  /* ---------------------- ADAPTER: WIKIMEDIA COMMONS ---------------------- */

  function searchWikimediaCommons(target) {
    var query = '';
    if (target.mediaType === 'movie') {
      query = normalizeText(target.title);
      if (target.year) query += ' ' + target.year;
    } else {
      query = normalizeText(target.seriesName) + ' S' + pad2(target.season) + 'E' + pad2(target.episode);
    }

    var searchUrl = 'https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=' +
      encodeURIComponent(query + ' video') + '&gsrnamespace=6&gsrlimit=4&prop=imageinfo&iiprop=url|mime|size&format=json&origin=*';

    return fetchJson(searchUrl, {}, 5000)
      .then(function (data) {
        if (!data || !data.query || !data.query.pages) {
          return [];
        }

        var pages = data.query.pages;
        var streams = [];

        for (var pageId in pages) {
          if (Object.prototype.hasOwnProperty.call(pages, pageId)) {
            var page = pages[pageId];
            if (page.imageinfo && page.imageinfo.length > 0) {
              var img = page.imageinfo[0];
              var mime = (img.mime || '').toLowerCase();
              var directUrl = img.url || '';
              var pageTitle = (page.title || '').replace(/^File:/i, '');

              var score = calculateRelevanceScore(target, pageTitle, '');
              if (score >= 45 && (mime.indexOf('video/') === 0 || mime.indexOf('ogg') !== -1 || /\.(mp4|webm|ogv)$/i.test(directUrl))) {
                var fmt = detectFormat(directUrl, mime);
                var qual = detectQuality(pageTitle, mime, img.height);

                streams.push({
                  name: PROVIDER_NAME,
                  title: pageTitle + ' [' + qual + ']',
                  url: directUrl,
                  quality: qual,
                  provider: PROVIDER_ID,
                  format: fmt,
                  score: score
                });
              }
            }
          }
        }

        return streams;
      })
      .catch(function () {
        return [];
      });
  }

  /* ---------------------- MAIN ENTRY POINT ---------------------- */

  function getStreams(tmdbId, mediaType, season, episode) {
    if (!tmdbId) {
      return Promise.resolve([]);
    }

    var isTv = (mediaType === 'tv');
    if (isTv) {
      console.log('[' + PROVIDER_NAME + '] TV ' + tmdbId + ' S' + season + ' E' + episode);
    } else {
      console.log('[' + PROVIDER_NAME + '] ' + mediaType + ' ' + tmdbId);
    }

    var apiKey = getApiKey();
    var metaPromise = isTv
      ? getTvMetadata(tmdbId, season, episode, apiKey)
      : getMovieMetadata(tmdbId, apiKey);

    return metaPromise
      .then(function (target) {
        console.log('[' + PROVIDER_NAME + '] sources started');

        return Promise.all([
          searchInternetArchive(target).catch(function () { return []; }),
          searchWikimediaCommons(target).catch(function () { return []; })
        ]);
      })
      .then(function (sourceResults) {
        var merged = [];
        for (var i = 0; i < sourceResults.length; i++) {
          var list = sourceResults[i];
          if (Array.isArray(list)) {
            for (var j = 0; j < list.length; j++) {
              merged.push(list[j]);
            }
          }
        }

        // Deduplicate streams
        var seenUrls = {};
        var uniqueStreams = [];

        for (var m = 0; m < merged.length; m++) {
          var s = merged[m];
          if (!s || !s.url) continue;

          var cleanUrl = s.url.split('?')[0].toLowerCase();
          if (!seenUrls[cleanUrl]) {
            seenUrls[cleanUrl] = true;
            uniqueStreams.push(s);
          }
        }

        // Deterministic ranking
        uniqueStreams.sort(function (a, b) {
          var scoreDiff = (b.score || 0) - (a.score || 0);
          if (scoreDiff !== 0) return scoreDiff;

          var qDiff = getQualityWeight(b.quality) - getQualityWeight(a.quality);
          if (qDiff !== 0) return qDiff;

          var fmtWeight = function (f) {
            if (f === 'mp4') return 4;
            if (f === 'm3u8') return 3;
            if (f === 'webm') return 2;
            return 1;
          };
          return fmtWeight(b.format) - fmtWeight(a.format);
        });

        var topResults = uniqueStreams.slice(0, 4);

        var finalStreams = [];
        for (var n = 0; n < topResults.length; n++) {
          var item = topResults[n];
          finalStreams.push({
            name: PROVIDER_NAME,
            title: cleanString(item.title) || 'Public Stream',
            url: item.url,
            quality: item.quality || 'Public',
            provider: PROVIDER_ID,
            format: item.format || 'mp4'
          });
        }

        console.log('[' + PROVIDER_NAME + '] found ' + finalStreams.length + ' relevant streams');
        return finalStreams;
      })
      .catch(function () {
        return [];
      });
  }

  /* ---------------------- SETTINGS DEFINITION ---------------------- */

  function onSettings() {
    return [
      {
        type: 'header',
        label: 'VN Global Video'
      },
      {
        type: 'info',
        label: 'Enter your TMDB API key. It stays in Nuvio provider settings.'
      },
      {
        type: 'text',
        key: 'tmdbApiKey',
        label: 'TMDB API Key',
        placeholder: 'Paste TMDB API key',
        description: 'Required for movie and TV title resolution.',
        isPassword: true
      }
    ];
  }

  /* ---------------------- EXPORTS ---------------------- */

  var providerModule = {
    getStreams: getStreams,
    onSettings: onSettings
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = providerModule;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.globalvideo = providerModule;
  }
})();
