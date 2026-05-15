(function(){

// ===============================
// GLOBAL
// ===============================
if (window.__PRO_PLAYER__) return;

window.__PRO_PLAYER__ = true;

const Player = {
  audioA: new Audio(),
  audioB: new Audio(),
  active: "A",
  gainA: null,
  gainB: null,
  ctx: null,
  analyser: null,
  dataArray: null,
  bufferLength: 0,
  raf: null,
  playlist: [],
  index: 0,
  playing: false,
  repeat: false,
  volume: 1,
  muted: false,
  crossfade: 2,
  preloadMap: new Map(),
  lyrics: [],
  dom: {},
  initDone: false
};

// ===============================
// DOM
// ===============================
function bindDOM(){
  Player.dom.play = document.getElementById("playPauseBtn");
  Player.dom.next = document.getElementById("nextBtn");
  Player.dom.prev = document.getElementById("prevBtn");
  Player.dom.progress = document.getElementById("progressBar");
  Player.dom.volume = document.getElementById("volumeBar");
  Player.dom.title = document.getElementById("trackTitle");
  Player.dom.wave = document.getElementById("waveform");
  Player.dom.player = document.getElementById("miniPlayer");
  Player.dom.tracks = document.querySelectorAll(".track");
}

// ===============================
// AUDIO ENGINE
// ===============================
function initAudio(){
  Player.ctx = new (window.AudioContext || window.webkitAudioContext)();

  const srcA = Player.ctx.createMediaElementSource(Player.audioA);
  const srcB = Player.ctx.createMediaElementSource(Player.audioB);

  Player.gainA = Player.ctx.createGain();
  Player.gainB = Player.ctx.createGain();

  Player.analyser = Player.ctx.createAnalyser();
  Player.analyser.fftSize = 256;

  Player.bufferLength = Player.analyser.frequencyBinCount;
  Player.dataArray = new Uint8Array(Player.bufferLength);

  srcA.connect(Player.gainA).connect(Player.analyser).connect(Player.ctx.destination);
  srcB.connect(Player.gainB).connect(Player.analyser).connect(Player.ctx.destination);

  Player.gainA.gain.value = 1;
  Player.gainB.gain.value = 0;
}

// ===============================
// HELPERS
// ===============================
function current(){
  return Player.active === "A" ? Player.audioA : Player.audioB;
}
function next(){
  return Player.active === "A" ? Player.audioB : Player.audioA;
}
function currentGain(){
  return Player.active === "A" ? Player.gainA : Player.gainB;
}
function nextGain(){
  return Player.active === "A" ? Player.gainB : Player.gainA;
}

// ===============================
// PLAY
// ===============================
function playTrack(i){
  const t = Player.dom.tracks[i];
  if (!t) return;

  Player.index = i;

  const newA = next();
  const newG = nextGain();

  const oldA = current();
  const oldG = currentGain();

  const src = t.dataset.src;

  if (newA.src !== src){
    newA.src = src;
  }

  newA.currentTime = 0;

  newA.play().catch(()=>{});

  crossfade(oldG, newG);

  Player.active = Player.active === "A" ? "B" : "A";

  if (Player.dom.title) Player.dom.title.textContent = t.dataset.title;

  saveState();
  preloadNext();
}

// ===============================
// CROSSFADE PRO
// ===============================
function crossfade(g1, g2){
  const duration = Player.crossfade;
  const now = Player.ctx.currentTime;

  g1.gain.cancelScheduledValues(now);
  g2.gain.cancelScheduledValues(now);

  g1.gain.setValueAtTime(g1.gain.value, now);
  g2.gain.setValueAtTime(g2.gain.value, now);

  g1.gain.linearRampToValueAtTime(0, now + duration);
  g2.gain.linearRampToValueAtTime(1, now + duration);
}

// ===============================
// PRELOAD SMART
// ===============================
function preloadNext(){
  const nextIndex = (Player.index + 1) % Player.dom.tracks.length;
  const t = Player.dom.tracks[nextIndex];
  if (!t) return;

  const src = t.dataset.src;

  if (Player.preloadMap.has(src)) return;

  const a = new Audio();
  a.src = src;
  a.preload = "auto";

  Player.preloadMap.set(src, a);
}

// ===============================
// CONTROLS
// ===============================
function bindControls(){
  Player.dom.play.onclick = togglePlay;
  Player.dom.next.onclick = ()=>playTrack((Player.index+1)%Player.dom.tracks.length);
  Player.dom.prev.onclick = ()=>playTrack((Player.index-1+Player.dom.tracks.length)%Player.dom.tracks.length);

  Player.dom.volume.oninput = ()=>{
    Player.volume = Player.dom.volume.value;
    Player.gainA.gain.value = Player.volume;
    Player.gainB.gain.value = Player.volume;
  };

  Player.dom.progress.oninput = ()=>{
    const a = current();
    a.currentTime = (Player.dom.progress.value/100)*a.duration;
  };
}

// ===============================
// PLAY / PAUSE
// ===============================
function togglePlay(){
  const a = current();
  if (a.paused){
    a.play();
    Player.playing = true;
  } else {
    a.pause();
    Player.playing = false;
  }
}

// ===============================
// PROGRESS LOOP
// ===============================
function progressLoop(){
  const a = current();
  if (a.duration){
    Player.dom.progress.value = (a.currentTime/a.duration)*100;
  }
  requestAnimationFrame(progressLoop);
}

// ===============================
// WAVEFORM REAL
// ===============================
function waveform(){
  Player.analyser.getByteFrequencyData(Player.dataArray);

  if (!Player.dom.wave) return;

  const bars = Player.dom.wave.children;

  for (let i=0;i<bars.length;i++){
    const v = Player.dataArray[i] / 255;
    bars[i].style.height = (v*100)+"%";
  }

  requestAnimationFrame(waveform);
}

// ===============================
// LYRICS ENGINE
// ===============================
function loadLyrics(data){
  Player.lyrics = data;
}

function lyricsLoop(){
  const t = current().currentTime;

  Player.lyrics.forEach(l=>{
    if (Math.abs(l.time - t) < 0.2){
      renderLyric(l.text);
    }
  });

  requestAnimationFrame(lyricsLoop);
}

function renderLyric(text){
  let el = document.getElementById("lyrics");
  if (!el) return;
  el.textContent = text;
}

// ===============================
// MEDIA SESSION
// ===============================
function mediaSession(){
  if (!("mediaSession" in navigator)) return;

  navigator.mediaSession.setActionHandler("play", togglePlay);
  navigator.mediaSession.setActionHandler("pause", togglePlay);
  navigator.mediaSession.setActionHandler("nexttrack", ()=>Player.dom.next.click());
  navigator.mediaSession.setActionHandler("previoustrack", ()=>Player.dom.prev.click());
}

// ===============================
// STORAGE
// ===============================
function saveState(){
  localStorage.setItem("pp_index", Player.index);
  localStorage.setItem("pp_time", current().currentTime);
  localStorage.setItem("pp_src", current().src);
}

function restoreState(){
  const i = localStorage.getItem("pp_index");
  const t = localStorage.getItem("pp_time");
  const s = localStorage.getItem("pp_src");

  if (!s) return;

  current().src = s;
  Player.index = parseInt(i)||0;

  current().onloadedmetadata = ()=>{
    current().currentTime = t || 0;
  };
}

// ===============================
// TRACK CLICK
// ===============================
function bindTracks(){
  Player.dom.tracks.forEach((t,i)=>{
    t.onclick = ()=>playTrack(i);
  });
}

// ===============================
// AUTO NEXT
// ===============================
function bindEnded(){
  Player.audioA.onended = nextAuto;
  Player.audioB.onended = nextAuto;
}

function nextAuto(){
  if (Player.repeat){
    current().currentTime = 0;
    current().play();
  } else {
    Player.dom.next.click();
  }
}

// ===============================
// DYNAMIC BG
// ===============================
function dynamicBG(){
  const c = Math.floor(Math.random()*360);
  document.body.style.background = `hsl(${c},40%,10%)`;
}

// ===============================
// FULLSCREEN
// ===============================
function fullscreen(){
  if (!document.fullscreenElement){
    Player.dom.player.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
}

// ===============================
// BOTTOM SHEET
// ===============================
let sheetOpen=false;
function toggleSheet(){
  sheetOpen=!sheetOpen;
  Player.dom.player.style.transform = sheetOpen?"translateY(0)":"translateY(80%)";
}

// ===============================
// INIT
// ===============================
function init(){
  if (Player.initDone) return;

  bindDOM();
  initAudio();
  bindControls();
  bindTracks();
  bindEnded();
  restoreState();
  mediaSession();

  progressLoop();
  waveform();
  lyricsLoop();

  Player.initDone = true;
}

document.addEventListener("DOMContentLoaded", init);

})();
