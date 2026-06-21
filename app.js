'use strict';
const app = document.getElementById('app');
const player = document.getElementById('player');
let LESSONS = [], IDX = {}, slow = false, token = 0, unlocked = false;
const INTERVALS = [1, 3, 7, 16, 35, 75, 150];

// ---- iOS audio unlock: first user gesture primes the element for programmatic control ----
function unlock() {
  if (unlocked) return; unlocked = true;
  player.play().then(() => player.pause()).catch(() => {});
}
document.addEventListener('touchend', unlock, { once: true });
document.addEventListener('click', unlock, { once: true });

// ---- SRS (localStorage) ----
const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const srsLoad = () => JSON.parse(localStorage.getItem('jp_srs') || '{}');
const srsSave = (s) => localStorage.setItem('jp_srs', JSON.stringify(s));
function enroll(lesson) { const s = srsLoad(); for (const ln of lesson.lines) if (!s[ln.ja]) s[ln.ja] = { due: today(), step: 0, reps: 0 }; srsSave(s); }
function dueList() { const s = srsLoad(), t = today(), o = []; for (const ja in s) if (s[ja].due <= t && IDX[ja]) o.push(ja); return o; }
function schedule(ja, grade) {
  const s = srsLoad(), c = s[ja] || { step: 0, reps: 0 }; let n;
  if (grade === 'again') { c.step = 0; n = 1; }
  else if (grade === 'easy') { c.step = Math.min(c.step + 2, INTERVALS.length - 1); n = INTERVALS[c.step]; }
  else { c.step = Math.min(c.step + 1, INTERVALS.length - 1); n = INTERVALS[c.step]; }
  c.reps = (c.reps || 0) + 1;
  const d = new Date(); d.setDate(d.getDate() + n); c.due = d.toISOString().slice(0, 10);
  s[ja] = c; srsSave(s);
}

// ---- audio: seek into a scene mp3, stop at the line's end ----
let curSrc = '';
function ensureSrc(src) {
  return new Promise(res => {
    if (curSrc === src) return res();
    curSrc = src; player.src = src;
    const on = () => { player.removeEventListener('loadedmetadata', on); res(); };
    player.addEventListener('loadedmetadata', on); player.load();
  });
}
function stopAudio() { token++; try { player.pause(); } catch (e) {} }
async function playSeg(src, start, end) {
  if (start == null) return 'done';
  const my = token;
  await ensureSrc(src);
  if (my !== token) return 'abort';
  player.playbackRate = slow ? 0.7 : 1;
  try { player.currentTime = start; } catch (e) {}
  try { await player.play(); } catch (e) {}
  return new Promise(res => {
    const iv = setInterval(() => {
      if (my !== token) { clearInterval(iv); return res('abort'); }
      if (player.paused || player.currentTime >= end) { try { player.pause(); } catch (e) {} clearInterval(iv); res('done'); }
    }, 40);
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
function playLineByJa(ja) { stopAudio(); const e = IDX[ja]; if (e) playSeg(e.lesson.audio, e.line.start, e.line.end); }

// ---- views ----
function home() {
  stopAudio();
  const due = dueList().length;
  let h = `<header><h1>日本語</h1><p class="sub">タップで再生 · オフラインOK</p></header>`;
  h += `<button class="review-btn ${due ? '' : 'dim'}" onclick="reviewView()">🔁 復習 ${due ? `<b>${due}</b> 枚` : '— なし'}</button>`;
  h += `<div class="list">`;
  for (const L of LESSONS) h += `<button class="card" onclick="lessonView('${L.id}')"><span>${L.title}</span><span class="chev">›</span></button>`;
  h += `</div><footer>発音テストは Mac の jp-exam で 🎤</footer>`;
  app.innerHTML = h; window.scrollTo(0, 0);
}
function lessonView(id) {
  stopAudio();
  const L = LESSONS.find(x => x.id === id); enroll(L);
  let h = `<div class="lh"><button class="back" onclick="home()">‹</button><h2>${L.title}</h2></div>`;
  h += `<div class="ctrls">
    <button onclick="playAll('${id}',false)">▶︎ 全部</button>
    <button onclick="playAll('${id}',true)">🔁 シャドー</button>
    <button id="slowb" class="${slow ? 'on' : ''}" onclick="toggleSlow()">🐢 ${slow ? 'ゆっくり' : 'ふつう'}</button></div><div class="lines">`;
  L.lines.forEach((ln, i) => {
    h += `<div class="line" id="ln${i}" onclick="tapLine('${id}',${i})"><div class="ja">${ln.ja}</div>` +
      (ln.romaji ? `<div class="ro">${ln.romaji}</div>` : '') + (ln.meaning ? `<div class="mn">${ln.meaning}</div>` : '') + `</div>`;
  });
  app.innerHTML = h + `</div>`; window.scrollTo(0, 0);
}
function setOn(i) { document.querySelectorAll('.line').forEach(e => e.classList.remove('on')); const el = document.getElementById('ln' + i); if (el) el.classList.add('on'); return el; }
async function tapLine(id, i) {
  stopAudio(); const L = LESSONS.find(x => x.id === id), ln = L.lines[i];
  const el = setOn(i);
  await playSeg(L.audio, ln.start, ln.end);
  if (el) el.classList.remove('on');
}
async function playAll(id, shadow) {
  stopAudio(); const my = token, L = LESSONS.find(x => x.id === id);
  for (let i = 0; i < L.lines.length; i++) {
    if (my !== token) return;
    const ln = L.lines[i]; if (ln.start == null) continue;
    const el = setOn(i); if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    if (await playSeg(L.audio, ln.start, ln.end) === 'abort' || my !== token) return;
    await sleep(shadow ? (ln.end - ln.start) * 1000 * 1.15 : 250);
  }
  document.querySelectorAll('.line').forEach(e => e.classList.remove('on'));
}
function toggleSlow() { slow = !slow; const b = document.getElementById('slowb'); if (b) { b.classList.toggle('on', slow); b.innerHTML = `🐢 ${slow ? 'ゆっくり' : 'ふつう'}`; } }

// ---- review ----
let queue = [], qi = 0;
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; } return a; };
function reviewView() {
  stopAudio(); queue = shuffle(dueList()); qi = 0;
  if (!queue.length) { app.innerHTML = `<div class="lh"><button class="back" onclick="home()">‹</button><h2>復習</h2></div><p class="empty">🎉 今日の復習はおわり！</p>`; return; }
  card();
}
function card() {
  if (qi >= queue.length) return home();
  const ja = queue[qi], ln = IDX[ja].line;
  app.innerHTML = `<div class="lh"><button class="back" onclick="home()">‹</button><h2>復習 ${qi + 1}/${queue.length}</h2></div>
    <div class="rev"><div class="mn big">${ln.meaning || '—'}</div>
    <div id="ans" class="ans hidden"><div class="ja">${ln.ja}</div>${ln.romaji ? `<div class="ro">${ln.romaji}</div>` : ''}</div>
    <div id="rb"><button class="big-btn" onclick="reveal()">答えを見る 🔊</button></div></div>`;
}
function reveal() {
  const ja = queue[qi]; document.getElementById('ans').classList.remove('hidden'); playLineByJa(ja);
  document.getElementById('rb').innerHTML = `<div class="rate">
    <button onclick="rate('again')">もう一度</button><button onclick="rate('good')">OK</button><button onclick="rate('easy')">かんたん</button></div>
    <button class="replay" onclick="playLineByJa(decodeURIComponent('${encodeURIComponent(ja)}'))">🔊 もう一度</button>`;
}
function rate(g) { schedule(queue[qi], g); qi++; card(); }

Object.assign(window, { home, lessonView, reviewView, tapLine, playAll, toggleSlow, reveal, rate, playLineByJa });

fetch('data/lessons.json').then(r => r.json()).then(d => {
  LESSONS = d.lessons;
  for (const L of LESSONS) for (const ln of L.lines) IDX[ln.ja] = { lesson: L, line: ln };
  home();
}).catch(e => { app.innerHTML = '<p class="empty">読み込み失敗 😢</p>'; });
