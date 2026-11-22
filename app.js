(function () {
  var FEED_URL = "https://feeds.megaphone.fm/NI8173303106";
  var OFFICIAL_URL = "https://stand.fm/channels/5e1d9174a6c0bf4883c32ef4";
  var STORAGE_KEY = "goyousu_player_v1";
  var PAGE_SIZE = 40;

  var audio = document.getElementById("audio");
  var listEl = document.getElementById("episode-list");
  var countEl = document.getElementById("episode-count");
  var searchEl = document.getElementById("episode-search");
  var sortEl = document.getElementById("episode-sort");
  var seasonEl = document.getElementById("season-select");
  var moreBtn = document.getElementById("more-episodes");
  var emptyEl = document.getElementById("empty-list");
  var errorEl = document.getElementById("load-error");
  var heroTitle = document.getElementById("hero-title");
  var heroMeta = document.getElementById("hero-meta");
  var heroLabel = document.getElementById("hero-label");
  var heroPlay = document.getElementById("hero-play");
  var heroShuffle = document.getElementById("hero-shuffle");
  var shuffleBtn = document.getElementById("btn-shuffle");
  var nowTitle = document.getElementById("now-title");
  var nowMeta = document.getElementById("now-meta");
  var seekEl = document.getElementById("seek");
  var curEl = document.getElementById("time-current");
  var durEl = document.getElementById("time-duration");
  var playBtn = document.getElementById("btn-play");
  var speedEl = document.getElementById("speed");
  var sleepEl = document.getElementById("sleep");
  var officialLink = document.getElementById("official-link");

  var episodes = []; // ascending by date, number = 1..
  var current = null;
  var activeFilter = "all";
  var activeSeason = "all";
  var limit = PAGE_SIZE;
  var sleepTimer = null;
  var sleepAtEnd = false;
  var lastSave = 0;
  var seeking = false;

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) { return JSON.parse(raw); }
    } catch (e) {}
    return { tracks: {}, last: null, speed: 1, shuffle: false };
  }
  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  }
  var state = loadState();
  if (!state.tracks) { state.tracks = {}; }

  function record(ep) {
    return state.tracks[String(ep.number)] || { pos: 0, duration: 0, done: false };
  }
  function statusOf(ep) {
    var r = record(ep);
    if (r.done) { return "done"; }
    if (r.pos && r.pos >= 5) { return "mid"; }
    return "unheard";
  }
  function statusLabel(s) {
    if (s === "done") { return "聴了"; }
    if (s === "mid") { return "途中"; }
    return "未聴";
  }
  function fmt(sec) {
    if (!sec || !isFinite(sec)) { sec = 0; }
    sec = Math.floor(sec);
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    var s = sec % 60;
    var ss = (s < 10 ? "0" : "") + s;
    if (h > 0) { return h + ":" + (m < 10 ? "0" : "") + m + ":" + ss; }
    return m + ":" + ss;
  }
  function fmtDate(pubDate) {
    var d = new Date(pubDate);
    if (isNaN(d.getTime())) { return ""; }
    return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
  }
  function escapeHtml(str) {
    return String(str == null ? "" : str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function epLabel(ep) {
    if (ep.season != null && ep.epInSeason != null) { return "S" + ep.season + "-" + ep.epInSeason; }
    return "#" + ep.number;
  }

  function filtered() {
    var q = searchEl.value ? searchEl.value.replace(/^\s+|\s+$/g, "").toLowerCase() : "";
    var out = [];
    var i, ep, st;
    for (i = 0; i < episodes.length; i++) {
      ep = episodes[i];
      if (activeSeason !== "all" && String(ep.season) !== String(activeSeason)) { continue; }
      if (activeFilter !== "all") {
        st = statusOf(ep);
        if (st !== activeFilter) { continue; }
      }
      if (q) {
        var hay = (ep.title + " " + ep.desc + " シーズン" + ep.season + " " + ep.number).toLowerCase();
        if (hay.indexOf(q) === -1) { continue; }
      }
      out.push(ep);
    }
    var dir = (sortEl && sortEl.value === "old") ? 1 : -1;
    out.sort(function (a, b) {
      var da = new Date(a.pubDate).getTime() || 0;
      var db = new Date(b.pubDate).getTime() || 0;
      if (da !== db) { return (da - db) * dir; }
      return (a.number - b.number) * dir;
    });
    return out;
  }

  function render() {
    var items = filtered();
    countEl.innerHTML = items.length + "回";
    emptyEl.style.display = items.length ? "none" : "block";
    var html = "";
    var n = Math.min(limit, items.length);
    for (var i = 0; i < n; i++) {
      var ep = items[i];
      var st = statusOf(ep);
      var playing = current && current.number === ep.number;
      html += '<li data-num="' + ep.number + '"' + (playing ? ' class="playing"' : "") + ">"
        + '<span class="ep-num">' + escapeHtml(epLabel(ep)) + '</span>'
        + '<span class="ep-status ' + st + '">' + statusLabel(st) + "</span>"
        + '<div class="ep-title">' + escapeHtml(ep.title) + "</div>"
        + (ep.desc ? '<div class="ep-desc">' + escapeHtml(ep.desc) + "</div>" : "")
        + '<div class="ep-date">' + fmtDate(ep.pubDate) + (ep.duration ? " ・ " + fmt(ep.duration) : "") + "</div>"
        + "</li>";
    }
    listEl.innerHTML = html;
    moreBtn.style.display = items.length > limit ? "block" : "none";
    var lis = listEl.getElementsByTagName("li");
    for (var j = 0; j < lis.length; j++) {
      lis[j].onclick = (function (num) {
        return function () { playByNumber(num, true); };
      })(parseInt(lis[j].getAttribute("data-num"), 10));
    }
  }

  function episodeByNumber(num) {
    for (var i = 0; i < episodes.length; i++) {
      if (episodes[i].number === num) { return episodes[i]; }
    }
    return null;
  }
  function randomEpisode(exclude) {
    if (!episodes.length) { return null; }
    if (episodes.length === 1) { return episodes[0]; }
    var ep = null;
    for (var tries = 0; tries < 10; tries++) {
      ep = episodes[Math.floor(Math.random() * episodes.length)];
      if (!exclude || ep.number !== exclude.number) { break; }
    }
    return ep;
  }
  function updateShuffleBtn() {
    var label = state.shuffle ? "シャッフル ON" : "シャッフル OFF";
    if (shuffleBtn) { shuffleBtn.innerHTML = label; }
  }
  function prevEpisode(ep) {
    for (var i = 0; i < episodes.length; i++) {
      if (episodes[i].number === ep.number) { return episodes[i - 1] || null; }
    }
    return null;
  }
  function nextEpisode(ep) {
    for (var i = 0; i < episodes.length; i++) {
      if (episodes[i].number === ep.number) { return episodes[i + 1] || null; }
    }
    return null;
  }
  function resumeChoice() {
    if (state.last) {
      var last = episodeByNumber(state.last);
      if (last) {
        if (statusOf(last) !== "done") { return { ep: last, kind: "resume" }; }
        var nx = nextEpisode(last);
        if (nx) { return { ep: nx, kind: "next" }; }
        return { ep: last, kind: "again" };
      }
    }
    return episodes.length ? { ep: episodes[0], kind: "first" } : null;
  }
  function updateHero() {
    var c = resumeChoice();
    if (!c) { return; }
    heroTitle.innerHTML = escapeHtml(c.ep.title);
    heroMeta.innerHTML = fmtDate(c.ep.pubDate) + (c.ep.duration ? " ・ " + fmt(c.ep.duration) : "");
    heroLabel.innerHTML = c.kind === "resume" ? "つづきから" : (c.kind === "next" ? "つぎの回" : "はじめの一回（シーズン0-0「ごイダンス」）");
    heroPlay.disabled = false;
    heroPlay.innerHTML = c.kind === "resume" ? "続きを聴く" : "この回を聴く";
    heroPlay.onclick = function () { playEpisode(c.ep, true); };
    if (heroShuffle) {
      heroShuffle.disabled = false;
      heroShuffle.onclick = function () {
        var ep = randomEpisode(current);
        if (ep) { playEpisode(ep, true); }
      };
    }
  }

  function playByNumber(num, autoplay) {
    var ep = episodeByNumber(num);
    if (ep) { playEpisode(ep, autoplay); }
  }
  function playEpisode(ep, autoplay) {
    current = ep;
    state.last = ep.number;
    saveState();
    audio.src = ep.source;
    audio.playbackRate = parseFloat(speedEl.value) || state.speed || 1;
    nowTitle.innerHTML = escapeHtml(ep.title);
    nowMeta.innerHTML = fmtDate(ep.pubDate);
    officialLink.href = OFFICIAL_URL;
    officialLink.style.display = "inline";
    setupMediaSession(ep);
    var r = record(ep);
    var startPos = (r.done) ? 0 : (r.pos || 0);
    var onMeta = function () {
      audio.removeEventListener("loadedmetadata", onMeta);
      if (startPos > 5 && audio.duration && startPos < audio.duration - 10) {
        try { audio.currentTime = startPos; } catch (e) {}
      }
      if (autoplay) { try { audio.play(); } catch (e) {} }
    };
    audio.addEventListener("loadedmetadata", onMeta);
    if (autoplay) {
      try { audio.preload = "auto"; } catch (e) {}
      try { var pr = audio.play(); if (pr && pr.catch) { pr.catch(function () {}); } } catch (e) {}
      var onCanPlay = function () {
        audio.removeEventListener("canplay", onCanPlay);
        try { var pr2 = audio.play(); if (pr2 && pr2.catch) { pr2.catch(function () {}); } } catch (e) {}
      };
      audio.addEventListener("canplay", onCanPlay);
    }
    render();
  }

  function savePosition(force) {
    if (!current) { return; }
    var now = new Date().getTime();
    if (!force && now - lastSave < 4000) { return; }
    lastSave = now;
    var key = String(current.number);
    var prev = state.tracks[key] || { pos: 0, duration: 0, done: false };
    prev.pos = audio.currentTime || 0;
    if (audio.duration) { prev.duration = audio.duration; }
    if (audio.duration && prev.pos >= audio.duration - 5) { prev.done = true; }
    state.tracks[key] = prev;
    saveState();
  }
  function clearSleep() {
    if (sleepTimer) { clearTimeout(sleepTimer); sleepTimer = null; }
    sleepAtEnd = false;
  }
  function applySleep() {
    clearSleep();
    var v = sleepEl.value;
    if (v === "-1") { sleepAtEnd = true; return; }
    var mins = parseInt(v, 10);
    if (mins > 0) {
      sleepTimer = setTimeout(function () { audio.pause(); }, mins * 60 * 1000);
    }
  }

  audio.addEventListener("play", function () { playBtn.innerHTML = "⏸ 一時停止"; });
  audio.addEventListener("pause", function () { playBtn.innerHTML = "▶ 再生"; savePosition(true); });
  audio.addEventListener("timeupdate", function () {
    if (!seeking && audio.duration) {
      seekEl.value = Math.floor((audio.currentTime / audio.duration) * 100);
    }
    curEl.innerHTML = fmt(audio.currentTime);
    durEl.innerHTML = fmt(audio.duration);
    savePosition(false);
  });
  audio.addEventListener("ended", function () {
    if (current) {
      var key = String(current.number);
      state.tracks[key] = { pos: audio.duration || 0, duration: audio.duration || 0, done: true };
      saveState();
    }
    if (sleepAtEnd) { clearSleep(); render(); return; }
    if (state.shuffle) {
      var rnd = randomEpisode(current);
      if (rnd) { playEpisode(rnd, true); } else { render(); }
      return;
    }
    var nx = current ? nextEpisode(current) : null;
    if (nx) { playEpisode(nx, true); } else { render(); }
  });

  playBtn.onclick = function () {
    if (!current) {
      var c = resumeChoice();
      if (c) { playEpisode(c.ep, true); }
      return;
    }
    if (audio.paused) { audio.play(); } else { audio.pause(); }
  };
  function doPrev() {
    if (!current) { return; }
    if (audio.currentTime && audio.currentTime > 5) {
      try { audio.currentTime = 0; } catch (e) {}
      return;
    }
    var pv = prevEpisode(current);
    if (pv) { playEpisode(pv, true); }
  }
  function doNext() {
    if (!current) {
      var c = resumeChoice();
      if (c) { playEpisode(c.ep, true); }
      return;
    }
    if (state.shuffle) {
      var rnd = randomEpisode(current);
      if (rnd) { playEpisode(rnd, true); }
      return;
    }
    var nx2 = nextEpisode(current);
    if (nx2) { playEpisode(nx2, true); }
  }
  document.getElementById("btn-prev").onclick = doPrev;
  document.getElementById("btn-next").onclick = doNext;

  var playerEl = document.getElementById("player");
  var collapseBtn = document.getElementById("btn-collapse");
  function applyCompact() {
    var c = !!state.compact;
    if (playerEl) { playerEl.className = c ? "player compact" : "player"; }
    document.body.className = c ? "compact" : "";
    if (collapseBtn) { collapseBtn.innerHTML = c ? "▲ 大きく" : "▼ 小さく"; }
  }
  if (collapseBtn) {
    collapseBtn.onclick = function () {
      state.compact = !state.compact;
      saveState();
      applyCompact();
    };
  }
  applyCompact();

  function setupMediaSession(ep) {
    try {
      if (!("mediaSession" in navigator)) { return; }
      if (typeof MediaMetadata !== "undefined") {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: ep.title,
          artist: "令和ロマンのご様子",
          album: "令和ロマンのご様子"
        });
      }
      var ms = navigator.mediaSession;
      try { ms.setActionHandler("play", function () { audio.play(); }); } catch (e) {}
      try { ms.setActionHandler("pause", function () { audio.pause(); }); } catch (e) {}
      try { ms.setActionHandler("previoustrack", function () { doPrev(); }); } catch (e) {}
      try { ms.setActionHandler("nexttrack", function () { doNext(); }); } catch (e) {}
    } catch (e) {}
  }
  seekEl.onchange = function () {
    if (audio.duration) { audio.currentTime = (seekEl.value / 100) * audio.duration; }
  };
  seekEl.onmousedown = function () { seeking = true; };
  seekEl.ontouchstart = function () { seeking = true; };
  seekEl.onmouseup = function () { seeking = false; };
  seekEl.ontouchend = function () { seeking = false; };
  speedEl.onchange = function () {
    var v = parseFloat(speedEl.value) || 1;
    audio.playbackRate = v;
    state.speed = v; saveState();
  };
  sleepEl.onchange = applySleep;
  if (shuffleBtn) {
    updateShuffleBtn();
    shuffleBtn.onclick = function () {
      state.shuffle = !state.shuffle;
      saveState();
      updateShuffleBtn();
    };
  }
  if (state.speed) {
    for (var i = 0; i < speedEl.options.length; i++) {
      if (parseFloat(speedEl.options[i].value) === state.speed) { speedEl.selectedIndex = i; break; }
    }
  }

  searchEl.oninput = function () { limit = PAGE_SIZE; render(); };
  searchEl.onkeyup = function () { limit = PAGE_SIZE; render(); };
  if (sortEl) { sortEl.onchange = function () { limit = PAGE_SIZE; render(); }; }
  if (seasonEl) { seasonEl.onchange = function () { activeSeason = seasonEl.value; limit = PAGE_SIZE; render(); }; }
  moreBtn.onclick = function () { limit += PAGE_SIZE; render(); };
  var filterBox = document.getElementById("filters");
  var fbtns = filterBox.getElementsByTagName("button");
  for (var k = 0; k < fbtns.length; k++) {
    fbtns[k].onclick = (function (btn) {
      return function () {
        activeFilter = btn.getAttribute("data-filter");
        for (var m = 0; m < fbtns.length; m++) { fbtns[m].className = ""; }
        btn.className = "active";
        limit = PAGE_SIZE; render();
      };
    })(fbtns[k]);
  }

  // ---- RSS parsing ----
  function tagText(el, names) {
    for (var i = 0; i < names.length; i++) {
      var nodes = el.getElementsByTagName(names[i]);
      if (nodes && nodes.length && nodes[0].textContent) { return nodes[0].textContent; }
    }
    return "";
  }
  function parseFeed(xml) {
    var items = xml.getElementsByTagName("item");
    var out = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var title = tagText(it, ["title"]).replace(/^\s+|\s+$/g, "");
      var pubDate = tagText(it, ["pubDate"]);
      var enc = it.getElementsByTagName("enclosure");
      var src = "";
      if (enc && enc.length) { src = enc[0].getAttribute("url") || ""; }
      if (!title || !src) { continue; }
      var season = null, epInSeason = null;
      var sTxt = tagText(it, ["itunes:season", "season"]);
      var eTxt = tagText(it, ["itunes:episode", "episode"]);
      if (sTxt) { season = parseInt(sTxt, 10); }
      if (eTxt) { epInSeason = parseInt(eTxt, 10); }
      if (season == null || isNaN(season)) {
        var m = title.match(/シーズン\s*(\d+)\s*[-−ー–]\s*(\d+)/);
        if (m) { season = parseInt(m[1], 10); epInSeason = parseInt(m[2], 10); }
      }
      var durTxt = tagText(it, ["itunes:duration", "duration"]);
      var dur = durTxt ? parseInt(durTxt, 10) : 0;
      var rawDesc = tagText(it, ["itunes:subtitle", "subtitle"]);
      var desc = rawDesc.replace(/^\s+|\s+$/g, "");
      if (desc.length > 120) { desc = desc.substring(0, 120) + "…"; }
      out.push({
        title: title, pubDate: pubDate, source: src,
        season: (season == null || isNaN(season)) ? null : season,
        epInSeason: (epInSeason == null || isNaN(epInSeason)) ? null : epInSeason,
        duration: isNaN(dur) ? 0 : dur, desc: desc
      });
    }
    out.sort(function (a, b) {
      var da = new Date(a.pubDate).getTime() || 0;
      var db = new Date(b.pubDate).getTime() || 0;
      if (da !== db) { return da - db; }
      return 0;
    });
    for (var n = 0; n < out.length; n++) { out[n].number = n + 1; }
    return out;
  }
  function buildSeasonOptions() {
    if (!seasonEl) { return; }
    var seen = {};
    var seasons = [];
    for (var i = 0; i < episodes.length; i++) {
      var s = episodes[i].season;
      if (s != null && !seen[s]) { seen[s] = 1; seasons.push(s); }
    }
    seasons.sort(function (a, b) { return a - b; });
    var html = '<option value="all">ぜんぶ</option>';
    for (var j = 0; j < seasons.length; j++) {
      html += '<option value="' + seasons[j] + '">シーズン' + seasons[j] + "</option>";
    }
    seasonEl.innerHTML = html;
    seasonEl.value = activeSeason;
  }

  var xhr = new XMLHttpRequest();
  xhr.open("GET", FEED_URL, true);
  xhr.onreadystatechange = function () {
    if (xhr.readyState !== 4) { return; }
    if (xhr.status < 200 || xhr.status >= 300) { errorEl.style.display = "block"; heroTitle.innerHTML = "読み込めませんでした"; return; }
    try {
      var xml = xhr.responseXML;
      if (!xml && xhr.responseText && typeof DOMParser !== "undefined") {
        xml = new DOMParser().parseFromString(xhr.responseText, "text/xml");
      }
      if (!xml) { throw new Error("no xml"); }
      episodes = parseFeed(xml);
      if (!episodes.length) { throw new Error("empty"); }
      buildSeasonOptions();
      updateHero();
      render();
    } catch (e) {
      errorEl.style.display = "block";
      heroTitle.innerHTML = "読み込めませんでした";
    }
  };
  xhr.onerror = function () { errorEl.style.display = "block"; };
  xhr.send(null);
})();
