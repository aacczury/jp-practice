'use strict';
const app = document.getElementById('app');
const player = document.getElementById('player');
let LESSONS = [], IDX = {}, slow = false, token = 0, unlocked = false;
const INTERVALS = [1, 3, 7, 16, 35, 75, 150];

function unlock() { if (unlocked) return; unlocked = true; player.play().then(() => player.pause()).catch(() => {}); }
document.addEventListener('touchend', unlock, { once: true });
document.addEventListener('click', unlock, { once: true });

// ---- theme ----
function applyTheme() { document.body.className = localStorage.getItem('jp_theme') === 'light' ? 'light' : ''; }
function toggleTheme() { localStorage.setItem('jp_theme', localStorage.getItem('jp_theme') === 'light' ? 'dark' : 'light'); applyTheme(); }

// ---- favorites ----
const favLoad = () => JSON.parse(localStorage.getItem('jp_fav') || '[]');
const isFav = (ja) => favLoad().includes(ja);
const favId = (ja) => 'fav-' + btoa(unescape(encodeURIComponent(ja))).slice(0, 12);
function toggleFav(ja, ev) { if (ev) ev.stopPropagation(); let f = favLoad(); f = f.includes(ja) ? f.filter(x => x !== ja) : [...f, ja]; localStorage.setItem('jp_fav', JSON.stringify(f)); const b = document.getElementById(favId(ja)); if (b) b.textContent = isFav(ja) ? '★' : '☆'; }

// ---- SRS ----
const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const srsLoad = () => JSON.parse(localStorage.getItem('jp_srs') || '{}');
const srsSave = (s) => localStorage.setItem('jp_srs', JSON.stringify(s));
function enroll(L) { if (L.type === 'song') return; const s = srsLoad(); for (const ln of L.lines) if (!s[ln.ja]) s[ln.ja] = { due: today(), step: 0, reps: 0 }; srsSave(s); }
function dueList() { const s = srsLoad(), t = today(), o = []; for (const ja in s) if (s[ja].due <= t && IDX[ja]) o.push(ja); return o; }
function schedule(ja, g) { const s = srsLoad(), c = s[ja] || { step: 0, reps: 0 }; let n; if (g === 'again') { c.step = 0; n = 1; } else if (g === 'easy') { c.step = Math.min(c.step + 2, 6); n = INTERVALS[c.step]; } else { c.step = Math.min(c.step + 1, 6); n = INTERVALS[c.step]; } c.reps = (c.reps || 0) + 1; const d = new Date(); d.setDate(d.getDate() + n); c.due = d.toISOString().slice(0, 10); s[ja] = c; srsSave(s); }

// ---- TTS audio ----
let curSrc = '';
function ensureSrc(src) { return new Promise(res => { if (curSrc === src) return res(); curSrc = src; player.src = src; const on = () => { player.removeEventListener('loadedmetadata', on); res(); }; player.addEventListener('loadedmetadata', on); player.load(); }); }
function stopAudio() { token++; try { player.pause(); } catch (e) {} }
async function playSeg(src, start, end) {
  const my = token; await ensureSrc(src); if (my !== token) return 'abort';
  player.playbackRate = slow ? 0.7 : 1; try { player.currentTime = start; } catch (e) {} try { await player.play(); } catch (e) {}
  return new Promise(res => { const iv = setInterval(() => { if (my !== token) { clearInterval(iv); return res('abort'); } if (player.paused || player.currentTime >= end) { try { player.pause(); } catch (e) {} clearInterval(iv); res('done'); } }, 40); });
}
async function playClip(src) {
  const my = token; await ensureSrc(src); if (my !== token) return 'abort';
  player.playbackRate = slow ? 0.7 : 1; try { player.currentTime = 0; } catch (e) {} try { await player.play(); } catch (e) {}
  return new Promise(res => { const iv = setInterval(() => { if (my !== token) { clearInterval(iv); return res('abort'); } if (player.ended || player.paused) { clearInterval(iv); res('done'); } }, 60); });
}
function rawPlay(L, ln) { if (ln.clip) return playClip(ln.clip); if (L.audio && ln.start != null) return playSeg(L.audio, ln.start, ln.end); return Promise.resolve('done'); }
function playLine(L, ln) { stopAudio(); ytPause(); stopYtSync(); return rawPlay(L, ln); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- YouTube IFrame player (song page) ----
let ytPlayer = null, ytReady = !!(window.YT && window.YT.Player), ytPending = null, ytThresh = 240;
let ytSegs = [], ytStopAt = null, ytPoll = null, ytHi = -1;
let curSong = null, curPage = 0, linePage = {};
function loadYTapi() { if (document.getElementById('ytapi')) return; const s = document.createElement('script'); s.id = 'ytapi'; s.src = 'https://www.youtube.com/iframe_api'; document.head.appendChild(s); }
window.onYouTubeIframeAPIReady = function () { ytReady = true; if (ytPending) { mountYT(ytPending); ytPending = null; } };
function mountYT(vid) { if (!document.getElementById('ytplayer')) return; ytPlayer = new YT.Player('ytplayer', { width: '100%', height: '100%', videoId: vid, playerVars: { playsinline: 1, rel: 0, modestbranding: 1 } }); }
function ensureYT(vid) { if (ytReady && window.YT && YT.Player) mountYT(vid); else { ytPending = vid; loadYTapi(); } }
function cleanupYT() { stopYtSync(); ytSegs = []; ytHi = -1; curSong = null; try { if (ytPlayer && ytPlayer.destroy) ytPlayer.destroy(); } catch (e) {} ytPlayer = null; ytPending = null; }
function ytPause() { try { if (ytPlayer && ytPlayer.pauseVideo) ytPlayer.pauseVideo(); } catch (e) {} }
function stopYtSync() { if (ytPoll) { clearInterval(ytPoll); ytPoll = null; } ytStopAt = null; }
function startYtPoll() {
  if (ytPoll) clearInterval(ytPoll);
  ytPoll = setInterval(() => {
    if (!ytPlayer || !ytPlayer.getCurrentTime) return;
    let ct; try { ct = ytPlayer.getCurrentTime(); } catch (e) { return; }
    if (ytStopAt != null && ct >= ytStopAt) { ytPause(); stopYtSync(); return; }   // tapped line: stop at its end
    const cur = ytSegs.find(s => ct >= s.t - 0.25 && ct < s.e);
    if (cur) { const pg = linePage[cur.i]; if (pg != null && pg !== curPage) renderPage(pg); hiSong(cur.i); }
    else hiSong(-1);
  }, 200);
}
function ytSeekLine(i) { stopAudio(); const s = ytSegs.find(x => x.i === i); if (!s || !ytPlayer || !ytPlayer.seekTo) return; ytStopAt = s.e; ytPlayer.seekTo(s.t, true); ytPlayer.playVideo(); startYtPoll(); }
function ytThrough() { stopAudio(); if (!ytSegs.length || !ytPlayer || !ytPlayer.seekTo) return; ytStopAt = null; ytPlayer.seekTo(ytSegs[0].t, true); ytPlayer.playVideo(); startYtPoll(); }
window.addEventListener('scroll', () => { const w = document.getElementById('ytwrap'); if (w) w.classList.toggle('mini', window.scrollY > ytThresh); }, { passive: true });

// ---- rendering ----
const esc = s => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/'/g, '&#39;');
function setOn(i) { document.querySelectorAll('.line').forEach(e => e.classList.remove('on')); const el = document.querySelector('.line[data-li="' + i + '"]'); if (el) el.classList.add('on'); return el; }
function hiSong(i) { if (i === ytHi) return; ytHi = i; if (i < 0) { document.querySelectorAll('.line').forEach(e => e.classList.remove('on')); return; } const el = setOn(i); if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
function lineRow(L, ln, i) {
  const av = ln.spk === 'her' ? '👩' : (ln.spk === 'me' ? '🧑' : '');
  return `<div class="line${ln.spk ? ' ' + ln.spk : ''}" data-li="${i}" onclick="tap('${L.id}',${i})">` +
    (av ? `<div class="av av-${ln.spk}">${av}</div>` : '') +
    `<div class="lc"><div class="ja">${esc(ln.ja)}</div>${ln.romaji ? `<div class="ro">${esc(ln.romaji)}</div>` : ''}${ln.meaning ? `<div class="mn">${esc(ln.meaning)}</div>` : ''}</div>` +
    `<button class="star" id="${favId(ln.ja)}" onclick="toggleFav(decodeURIComponent('${encodeURIComponent(ln.ja)}'),event)">${isFav(ln.ja) ? '★' : '☆'}</button></div>`;
}
function songLine(L, ln, i) {
  const hasYT = L.youtube && L.youtube.id && ln.yt != null;
  const t = hasYT ? Math.max(0, Math.round(ln.yt + (L.youtube.offset || 0))) : null;
  const mmss = t != null ? `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}` : '';
  const open = hasYT ? `onclick="ytSeekLine(${i})"` : `onclick="tapSong('${L.id}',${i})"`;
  return `<div class="line song" data-li="${i}" ${open}><button class="star" id="${favId(ln.ja)}" onclick="toggleFav(decodeURIComponent('${encodeURIComponent(ln.ja)}'),event)">${isFav(ln.ja) ? '★' : '☆'}</button>` +
    `<div class="lc"><div class="ja">${esc(ln.ja)}</div>${ln.romaji ? `<div class="ro">${esc(ln.romaji)}</div>` : ''}${ln.meaning ? `<div class="mn">${esc(ln.meaning)}</div>` : ''}</div>` +
    (t != null ? `<span class="ts">${mmss}</span>` : '') +
    `<button class="spk" onclick="tapSong('${L.id}',${i});event.stopPropagation()">🔊</button></div>`;
}

// ---- history (browser/back-gesture navigation) ----
let navLock = false;
function pushNav(state) { if (navLock) return; const c = history.state; if (c && c.view === state.view && c.id === state.id) return; try { history.pushState(state, ''); } catch (e) {} }
function renderView(s) { navLock = true; const v = (s && s.view) || 'home'; if (v === 'lesson') lessonView(s.id); else if (v === 'song') songView(s.id); else if (v === 'review') reviewView(); else if (v === 'fav') favView(); else home(); navLock = false; }
window.addEventListener('popstate', (e) => renderView(e.state));

// ---- views ----
function home() {
  pushNav({ view: 'home' }); cleanupYT(); stopAudio();
  const due = dueList().length, fav = favLoad().length;
  const days = LESSONS.filter(l => l.type === 'day'), songs = LESSONS.filter(l => l.type === 'song');
  let h = `<header><div class="hrow"><h1>日本語</h1><button class="theme" onclick="toggleTheme()">◐</button></div><p class="sub">タップで再生 · オフラインOK</p></header>`;
  h += `<div class="qa"><button class="review-btn ${due ? '' : 'dim'}" onclick="reviewView()">🔁 復習 ${due ? `<b>${due}</b>` : '—'}</button><button class="review-btn ${fav ? '' : 'dim'}" onclick="favView()">★ お気に入り ${fav ? `<b>${fav}</b>` : '—'}</button></div>`;
  h += `<div class="list">` + days.map(L => `<button class="card" onclick="lessonView('${L.id}')"><span>${esc(L.title)}</span><span class="chev">›</span></button>`).join('');
  if (songs.length) h += `<div class="sec">🎵 歌</div>` + songs.map(L => `<button class="card" onclick="songView('${L.id}')"><span>${esc(L.title)}</span><span class="chev">›</span></button>`).join('');
  h += `</div><footer>発音テストは Mac の jp-exam で 🎤</footer>`;
  app.innerHTML = h; window.scrollTo(0, 0);
}
function lessonView(id) {
  pushNav({ view: 'lesson', id }); cleanupYT(); stopAudio(); const L = LESSONS.find(x => x.id === id); enroll(L);
  let h = `<div class="lh"><button class="back" onclick="history.back()">‹</button><h2>${esc(L.title)}</h2></div><div class="ctrls"><button onclick="playAll('${id}',false)">▶︎ 全部</button><button onclick="playAll('${id}',true)">🔁 シャドー</button><button id="slowb" class="${slow ? 'on' : ''}" onclick="toggleSlow()">🐢 ${slow ? 'ゆっくり' : 'ふつう'}</button></div>`;
  h += `<div class="lines">` + L.lines.map((ln, i) => lineRow(L, ln, i)).join('') + `</div>`;
  app.innerHTML = h; window.scrollTo(0, 0);
}
function songView(id) {
  pushNav({ view: 'song', id }); cleanupYT(); stopAudio(); curSong = LESSONS.find(x => x.id === id); curPage = 0; const L = curSong, vid = L.youtube && L.youtube.id;
  let h = `<div class="lh"><button class="back" onclick="history.back()">‹</button><h2>${esc(L.title)}</h2></div>`;
  if (vid) h += `<div class="ytwrap" id="ytwrap"><div class="ytinner"><div id="ytplayer"></div></div></div><button class="ytthrough" onclick="ytThrough()">🎬 動画で通し再生（歌詞が追従）</button><p class="hint">歌詞をタップ → その行だけ再生 · 🔊 = お手本の声</p>`;
  else h += `<a class="ytbig" href="https://www.youtube.com/results?search_query=${encodeURIComponent(L.title)}" target="_blank" rel="noopener">▶ YouTubeで検索</a>`;
  h += `<div class="ctrls"><button onclick="playAll('${id}',false)">▶︎ 全部(声)</button><button onclick="playAll('${id}',true)">🔁 シャドー</button><button id="slowb" class="${slow ? 'on' : ''}" onclick="toggleSlow()">🐢 ${slow ? 'ゆっくり' : 'ふつう'}</button></div>`;
  h += `<div id="pagenav"></div><div class="lines" id="lines"></div>`;
  app.innerHTML = h; window.scrollTo(0, 0);
  linePage = {}; L.pages.forEach((pg, pi) => pg.idxs.forEach(i => linePage[i] = pi));
  if (vid) {
    const off = L.youtube.offset || 0;
    ytSegs = L.lines.map((ln, i) => ln.yt != null ? { i, t: ln.yt + off, e: (ln.ytEnd != null ? ln.ytEnd : ln.yt + 6) + off } : null).filter(Boolean);
    const w = document.getElementById('ytwrap'); ytThresh = w && w.offsetHeight ? Math.round(w.offsetHeight * 0.6) : 200; ensureYT(vid);
  }
  renderPage(0);
}
function renderPage(p) {
  const L = curSong; if (!L) return; curPage = Math.max(0, Math.min(p, L.pages.length - 1)); ytHi = -1;
  const pg = L.pages[curPage];
  document.getElementById('lines').innerHTML = pg.idxs.map(i => songLine(L, L.lines[i], i)).join('');
  const nav = document.getElementById('pagenav');
  nav.innerHTML = L.pages.length > 1
    ? `<div class="pgnav"><button onclick="prevPage()" ${curPage === 0 ? 'disabled' : ''}>‹ 前</button><span>${curPage + 1} / ${L.pages.length}${pg.title ? ' · ' + esc(pg.title) : ''}</span><button onclick="nextPage()" ${curPage === L.pages.length - 1 ? 'disabled' : ''}>次 ›</button></div>`
    : '';
}
function prevPage() { stopAudio(); ytPause(); stopYtSync(); renderPage(curPage - 1); window.scrollTo({ top: 0 }); }
function nextPage() { stopAudio(); ytPause(); stopYtSync(); renderPage(curPage + 1); window.scrollTo({ top: 0 }); }
async function tap(id, i) { stopAudio(); const L = LESSONS.find(x => x.id === id); const el = setOn(i); await playLine(L, L.lines[i]); if (el) el.classList.remove('on'); }
async function tapSong(id, i) { const L = LESSONS.find(x => x.id === id); const el = setOn(i); await playLine(L, L.lines[i]); if (el) el.classList.remove('on'); }
async function playAll(id, shadow) {
  stopAudio(); ytPause(); stopYtSync(); const my = token, L = LESSONS.find(x => x.id === id);
  const idxs = (L.type === 'song' && L.pages) ? L.pages[curPage].idxs : L.lines.map((_, k) => k);
  for (const i of idxs) {
    if (my !== token) return; const ln = L.lines[i]; const el = setOn(i); if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    if (await rawPlay(L, ln) === 'abort' || my !== token) return;
    const dur = (ln.end != null && ln.start != null) ? (ln.end - ln.start) : 1.6;
    await sleep(shadow ? dur * 1000 * 1.15 : 250);
  }
  document.querySelectorAll('.line').forEach(e => e.classList.remove('on'));
}
function toggleSlow() { slow = !slow; const b = document.getElementById('slowb'); if (b) { b.classList.toggle('on', slow); b.innerHTML = `🐢 ${slow ? 'ゆっくり' : 'ふつう'}`; } }

function favView() {
  pushNav({ view: 'fav' }); cleanupYT(); stopAudio(); const favs = favLoad().filter(ja => IDX[ja]);
  let h = `<div class="lh"><button class="back" onclick="history.back()">‹</button><h2>★ お気に入り</h2></div>`;
  if (!favs.length) { app.innerHTML = h + `<p class="empty">まだありません — 各文の ☆ をタップ</p>`; return; }
  app.innerHTML = h + `<div class="lines">` + favs.map(ja => { const e = IDX[ja]; return lineRow(e.lesson, e.line, e.idx); }).join('') + `</div>`; window.scrollTo(0, 0);
}

// ---- review ----
let queue = [], qi = 0;
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; } return a; };
function reviewView() { pushNav({ view: 'review' }); cleanupYT(); stopAudio(); queue = shuffle(dueList()); qi = 0; if (!queue.length) { app.innerHTML = `<div class="lh"><button class="back" onclick="history.back()">‹</button><h2>復習</h2></div><p class="empty">🎉 今日はおわり！</p>`; return; } rcard(); }
function rcard() { if (qi >= queue.length) return home(); const ln = IDX[queue[qi]].line; app.innerHTML = `<div class="lh"><button class="back" onclick="history.back()">‹</button><h2>復習 ${qi + 1}/${queue.length}</h2></div><div class="rev"><div class="mn big">${esc(ln.meaning) || '—'}</div><div id="ans" class="ans hidden"><div class="ja">${esc(ln.ja)}</div>${ln.romaji ? `<div class="ro">${esc(ln.romaji)}</div>` : ''}</div><div id="rb"><button class="big-btn" onclick="reveal()">答えを見る 🔊</button></div></div>`; }
function reveal() { const e = IDX[queue[qi]]; document.getElementById('ans').classList.remove('hidden'); playLine(e.lesson, e.line); document.getElementById('rb').innerHTML = `<div class="rate"><button onclick="rate('again')">もう一度</button><button onclick="rate('good')">OK</button><button onclick="rate('easy')">かんたん</button></div>`; }
function rate(g) { schedule(queue[qi], g); qi++; rcard(); }

Object.assign(window, { home, lessonView, songView, reviewView, favView, tap, tapSong, playAll, toggleSlow, toggleTheme, toggleFav, ytSeekLine, ytThrough, prevPage, nextPage, reveal, rate });

applyTheme();
fetch('data/lessons.json').then(r => r.json()).then(d => {
  LESSONS = d.lessons;
  for (const L of LESSONS) L.lines.forEach((ln, i) => { if (!IDX[ln.ja]) IDX[ln.ja] = { lesson: L, line: ln, idx: i }; });
  history.replaceState({ view: 'home' }, ''); navLock = true; home(); navLock = false;
}).catch(() => { app.innerHTML = '<p class="empty">読み込み失敗 😢</p>'; });
