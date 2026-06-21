const CACHE='jp-pwa-9a2e0895';
const ASSETS=["./", "index.html", "app.js", "style.css", "manifest.webmanifest", "data/lessons.json", "icon-192.png", "icon-512.png", "audio/day01.mp3", "audio/day02.mp3", "audio/day03.mp3", "audio/day04.mp3", "audio/day05.mp3", "audio/day06.mp3", "audio/day07.mp3", "audio/day08.mp3", "audio/day09.mp3", "audio/day10.mp3", "audio/day11.mp3", "audio/day12.mp3"];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)))});
