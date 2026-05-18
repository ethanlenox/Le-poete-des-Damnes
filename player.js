 // ==============================
//         PRO PLAYER
// CORE + STATE + AUDIO ENGINE
// ===============================

(function(){

if (window.__ULTRA_PRO_PLAYER_V4__) return;
window.__ULTRA_PRO_PLAYER_V4__ = true;

// ===============================
//          STATE MANAGER
// ===============================
const State = {
  seeking: false,
  index: 0,
  playing: false,
  volume: 1,
  muted: false,
  repeat: false,
  shuffle: false,
  ready: false,
  locked: false,
  buffering: false,
  lastInteraction: 0,
  lastUpdate: 0,
  duration: 0,
  currentTime: 0,
  networkState: "idle",
  error: null,
  retries: 0,
  maxRetries: 3

};

// ===============================
//          EVENT BUS
// ===============================
const Events = {
  maxListeners: 50,
  events: new Map(),

on(name, fn){

  if(!this.events.has(name)){
    this.events.set(name, []);
  }

  const list = this.events.get(name);

  // évite doublons
  if(list.includes(fn)){
    return;
  }

  // protection mémoire
  if(list.length >= this.maxListeners){
    list.shift();
  }

  list.push(fn);
},

  off(name, fn){

  if(!this.events.has(name)) return;

  const arr = this.events
    .get(name)
    .filter(f => f !== fn);

  // cleanup total
  if(arr.length === 0){

    this.events.delete(name);

  } else {

    this.events.set(name, arr);

  }
},

  emit(name, data){
    if(!this.events.has(name)) return;
    this.events.get(name).forEach(fn=>{
      try { fn(data); } catch(e){}
    });
  },

  once(name, fn){

  const wrap = (d)=>{
    fn(d);
    this.off(name, wrap);
  };

  this.on(name, wrap);
},

clear(name){

  if(!this.events.has(name)) return;

  this.events.delete(name);
},

destroy(){

  this.events.clear();
}
};

// ===============================
//          AUDIO CORE 
// ===============================
const AudioCore = {

  ctx: null,

  A: new Audio(),
  B: new Audio(),

  active: "A",

  gainA: null,
  gainB: null,

  analyser: null,
  dataArray: null,
  bufferLength: 0,

  init(){

    this.ctx = new (window.AudioContext || window.webkitAudioContext)();

    const srcA = this.ctx.createMediaElementSource(this.A);
    const srcB = this.ctx.createMediaElementSource(this.B);

    this.gainA = this.ctx.createGain();
    this.gainB = this.ctx.createGain();

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;

    this.bufferLength = this.analyser.frequencyBinCount;
    this.dataArray = new Uint8Array(this.bufferLength);

    srcA.connect(this.gainA).connect(this.analyser).connect(this.ctx.destination);
    srcB.connect(this.gainB).connect(this.analyser).connect(this.ctx.destination);

    this.gainA.gain.value = 1;
    this.gainB.gain.value = 0;

    this.bindEvents();
  },

  bindEvents(){

    [this.A, this.B].forEach((audio)=>{

      audio.addEventListener("play", ()=>{
        State.playing = true;
        Events.emit("play");
      });

      audio.addEventListener("pause", ()=>{
        State.playing = false;
        Events.emit("pause");
      });

      audio.addEventListener("timeupdate", ()=>{

  // ignore audio inactif
  if(audio !== AudioCore.current()) return;

  State.currentTime = audio.currentTime;
  State.duration = audio.duration || 0;

  Events.emit("time", {
    current: audio.currentTime,
    duration: audio.duration
  });

});

      audio.addEventListener("waiting", ()=>{
        State.buffering = true;
        Events.emit("buffering", true);
      });

      audio.addEventListener("playing", ()=>{
        State.buffering = false;
        Events.emit("buffering", false);
      });

      audio.addEventListener("ended", ()=>{
        Events.emit("ended");
      });

      audio.addEventListener("error", (e)=>{
        State.error = e;
        Events.emit("error", e);
      });

    });

  },

  current(){
    return this.active === "A" ? this.A : this.B;
  },

  next(){
    return this.active === "A" ? this.B : this.A;
  },

  currentGain(){
    return this.active === "A" ? this.gainA : this.gainB;
  },

  nextGain(){
    return this.active === "A" ? this.gainB : this.gainA;
  },

  swap(){
    this.active = this.active === "A" ? "B" : "A";
  }

};

// ===============================
//     ERROR HANDLER + RETRY
// ===============================
const ErrorHandler = {
    retryDelay: 1200,

  handle(e){
    console.warn("Audio error", e);

    if(State.retries < State.maxRetries){
      State.retries++;

      setTimeout(()=>{

  const current = AudioCore.current();

  try{

    current.pause();

    current.currentTime = 0;

  }catch(e){}

  Events.emit("retry");

}, this.retryDelay);
      
    } else {
      Events.emit("fatalError", e);
    }
  },

  reset(){
    State.retries = 0;
  }

};

// ===============================
//          AUDIO LOADER 
// ===============================
const Loader = {
    timeout: 15000,
  load(audio, src){

  return new Promise((resolve, reject)=>{

    if(!src){
      return reject("no src");
    }

    let timeoutId = null;

    if(audio.src !== src){
      audio.src = src;
    }

    const onReady = ()=>{

      cleanup();

      resolve();
    };

    const onError = (e)=>{

      cleanup();

      reject(e);
    };

    const onTimeout = ()=>{

      cleanup();

      reject("timeout");
    };

    const cleanup = ()=>{

      clearTimeout(timeoutId);

      audio.removeEventListener("canplay", onReady);
      audio.removeEventListener("error", onError);
    };

    timeoutId = setTimeout(
      onTimeout,
      this.timeout
    );

    audio.addEventListener("canplay", onReady);
    audio.addEventListener("error", onError);

    try{

      audio.load();

    }catch(e){

      cleanup();

      reject(e);
    }

  });
}

};

// ===============================
//           CROSSFADE
// ===============================
const Crossfade = {
  cleanupTimer: null,

  duration: 1.2,

  apply(oldAudio, newAudio, g1, g2){
    clearTimeout(this.cleanupTimer);

    const ctx = AudioCore.ctx;
    const now = ctx.currentTime;

    const vol = Math.max(State.volume, 0.001);

    g1.gain.cancelScheduledValues(now);
    g2.gain.cancelScheduledValues(now);

    // ancien track part du volume actuel
    g1.gain.setValueAtTime(vol, now);
    g1.gain.linearRampToValueAtTime(0.001, now + this.duration);

    // nouveau track démarre à 0
    g2.gain.setValueAtTime(0.001, now);
    g2.gain.linearRampToValueAtTime(vol, now + this.duration);

    this.cleanupTimer = setTimeout(()=>{

    // sécurité
    if(oldAudio !== newAudio){

    oldAudio.pause();

    oldAudio.currentTime = 0;

    oldAudio.removeAttribute("src");

    oldAudio.load();
    }

    }, this.duration * 1000);
    }

    };

// ===============================
//    CLEANUP / MEMORY CONTROL
// ===============================
const Memory = {

  cleanupAudio(audio){
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  },

  clearCache(map){
    map.forEach(a=>{
      this.cleanupAudio(a);
    });
    map.clear();
  }

};

// expose part1
  
window.__PLAYER_PART1__ = {
  State,
  Events,
  AudioCore,
  Loader,
  Crossfade,
  ErrorHandler,
  Memory
};

})();



// ===============================
//         PRO PLAYER
// ENGINE + CONTROLS + PLAYLIST
// ===============================

(function(){

const {
  State,
  Events,
  AudioCore,
  Loader,
  Crossfade,
  ErrorHandler,
  Memory
} = window.__PLAYER_PART1__;

// ===============================
//          DOM BINDER
// ===============================
const DOM = {
  play: null,
  next: null,
  prev: null,
  progress: null,
  volume: null,
  title: null,
  tracks: [],
  player: null,
  currentTime: null,
  duration: null,

  init(){
    this.play = document.getElementById("playPauseBtn");
    this.next = document.getElementById("nextBtn");
    this.prev = document.getElementById("prevBtn");
    this.progress = document.getElementById("progressBar");
    this.volume = document.getElementById("volumeBar");
    this.title = document.getElementById("trackTitle");
    this.currentTime = document.getElementById("currentTime");
    this.duration = document.getElementById("duration");
    this.player = document.getElementById("miniPlayer");
    this.tracks = document.querySelectorAll(".track");
  }
};

// ===============================
//          CACHE AUDIO
// ===============================
const Cache = {

  usage: new Map(),
  map: new Map(),
  max: 10,

  add(src, audio){

    // update entrée existante
    if(this.map.has(src)){

      this.usage.set(src, Date.now());
      return;
    }

    // purge LRU
    if(this.map.size >= this.max){

      let oldestKey = null;
      let oldestTime = Infinity;

      this.usage.forEach((time, key)=>{

        if(time < oldestTime){

          oldestTime = time;
          oldestKey = key;
        }

      });

      if(oldestKey){

        const oldAudio = this.map.get(oldestKey);

        if(oldAudio){
          Memory.cleanupAudio(oldAudio);
        }

        this.map.delete(oldestKey);
        this.usage.delete(oldestKey);
      }
    }

    this.map.set(src, audio);
    this.usage.set(src, Date.now());
  },

  get(src){

    if(this.map.has(src)){
      this.usage.set(src, Date.now());
    }

    return this.map.get(src);
  },

  has(src){
    return this.map.has(src);
  },

  clear(){

    this.map.forEach(audio=>{
      Memory.cleanupAudio(audio);
    });

    this.map.clear();
    this.usage.clear();
  }

};

// ===============================
//      PRELOAD QUEUE (ASYNC)
// ===============================
const Preload = {
  enabled: true,
  queue: [],
  loading: false,

  canPreload(){

    // économie batterie/navigation cachée
    if(document.hidden){
      return false;
    }

    // data saver
    const conn = navigator.connection ||
                 navigator.mozConnection ||
                 navigator.webkitConnection;

    if(conn){

      // mode économie données
      if(conn.saveData){
        return false;
      }

      // réseau faible
      const slow = [
        "slow-2g",
        "2g"
      ];

      if(slow.includes(conn.effectiveType)){
        return false;
      }
    }

    return true;
  },

  push(src){
    if(
  !src ||
  !this.enabled ||
  !this.canPreload() ||
  this.queue.includes(src) ||
  Cache.has(src)
){
  return;
}
    this.queue.push(src);
    this.run();
  },

  async run(){

    if(!this.canPreload()){

    this.loading = false;
    return;
   }
    if(this.loading || !this.queue.length) return;

    this.loading = true;

    const src = this.queue.shift();
    const a = new Audio();

    try {
      await Loader.load(a, src);
      Cache.add(src, a);
    } catch(e){}

    this.loading = false;
    this.run();
  }
};

// ===============================
//        PLAYLIST MANAGER
// ===============================
const Playlist = {

  list: [],

  buildFromDOM(){
    this.list = Array.from(DOM.tracks).map(el=>({
      src: el.dataset.src,
      title: el.dataset.title
    }));
  },

  get(i){
    return this.list[i];
  },

  next(){
    if(State.shuffle){
      return Math.floor(Math.random()*this.list.length);
    }
    return (State.index + 1) % this.list.length;
  },

  prev(){
    return (State.index - 1 + this.list.length) % this.list.length;
  }

};

// ===============================
//      ENGINE (FULL CONTROL)
// ===============================
const Engine = {
  queuedIndex: null,
  playToken: 0,
  lastPlayTime: 0,
  transitioning: false,

  async play(i){

    const now = performance.now();

// anti spam ultra rapide
if(now - this.lastPlayTime < 250){
  return;
}

this.lastPlayTime = now;

// lock sécurité
if(State.locked){

  // queue dernier tap utilisateur
  this.queuedIndex = i;
  return;
}

// transition en cours
if(this.transitioning){

  // garde uniquement la dernière demande
  this.queuedIndex = i;
  return;
}

this.transitioning = true;

const token = ++this.playToken;

// protection anti relance ultra rapide
clearTimeout(this.__playLock);

this.__playLock = setTimeout(()=>{
  this.transitioning = false;
}, 2000);

 const track = Playlist.get(i);
if(!track) return;

    // sécurité premier démarrage AudioContext
if(AudioCore.ctx && AudioCore.ctx.state !== "running"){

  try{
    await AudioCore.ctx.resume();
  }catch(e){}
}

State.locked = true;
State.index = i;


const oldAudio = AudioCore.current();
const oldGain = AudioCore.currentGain();

const newAudio = AudioCore.next();
const newGain = AudioCore.nextGain();

    try {

      if(Cache.has(track.src)){

  newAudio.src = track.src;

} else {

  await Loader.load(newAudio, track.src);

}

      newAudio.currentTime = 0;
newAudio.muted = State.muted;

      await newAudio.play();

// sécurité race condition async
if(token !== this.playToken){

  newAudio.pause();
  return;
}

// premier lancement sans crossfade
if(!oldAudio.src){

  newGain.gain.value = State.volume;

  AudioCore.swap();

} else {

  Crossfade.apply(
    oldAudio,
    newAudio,
    oldGain,
    newGain
  );

  AudioCore.swap();

}

      if(DOM.title) DOM.title.textContent = track.title;

      Events.emit("trackChange", track);

      this.save();
      this.preload();

      } catch(e){
  ErrorHandler.handle(e);
  this.finishTransition();
  }

    setTimeout(()=>{

  State.locked = false;
 

    }, 1500);
  },

  finishTransition(){

  this.transitioning = false;

  // exécute dernière demande utilisateur
  if(this.queuedIndex !== null){

    const nextIndex = this.queuedIndex;

    this.queuedIndex = null;

    setTimeout(()=>{
      this.play(nextIndex);
    }, 50);
  }
},

async toggle(){

  const a = AudioCore.current();

  const gain = AudioCore.currentGain();

  const now = AudioCore.ctx.currentTime;

  // PLAY
  if(a.paused){

    try{

      gain.gain.cancelScheduledValues(now);

      gain.gain.setValueAtTime(0.001, now);

      gain.gain.linearRampToValueAtTime(
        Math.max(State.volume, 0.001),
        now + 0.12
      );

      await a.play();

    }catch(e){}

  } else {

    // PAUSE FADE
    gain.gain.cancelScheduledValues(now);

    gain.gain.setValueAtTime(
      Math.max(gain.gain.value, 0.001),
      now
    );

    gain.gain.linearRampToValueAtTime(
      0.001,
      now + 0.12
    );

    setTimeout(()=>{

      a.pause();

      // restore volume
      gain.gain.value =
        Math.max(State.volume, 0.001);

    }, 120);
  }
},

  preload(){
    const nextIndex = Playlist.next();
    const t = Playlist.get(nextIndex);
    if(t) Preload.push(t.src);
  },

  save(){
    this.saveSettings();
    localStorage.setItem("pp_i", State.index);
    localStorage.setItem("pp_t", AudioCore.current().currentTime);
    localStorage.setItem("pp_s", AudioCore.current().src);
  },

    saveSettings(){

    localStorage.setItem("pp_volume", State.volume);
    localStorage.setItem("pp_muted", State.muted);
    localStorage.setItem("pp_repeat", State.repeat);
    localStorage.setItem("pp_shuffle", State.shuffle);

  },

  restoreSettings(){

    const volume = parseFloat(localStorage.getItem("pp_volume"));
    const muted = localStorage.getItem("pp_muted");
    const repeat = localStorage.getItem("pp_repeat");
    const shuffle = localStorage.getItem("pp_shuffle");

    if(!isNaN(volume)){
      State.volume = volume;
    }

    State.muted = muted === "true";
    State.repeat = repeat === "true";
    State.shuffle = shuffle === "true";

    AudioCore.A.muted = State.muted;
    AudioCore.B.muted = State.muted;

    if(AudioCore.gainA){
      AudioCore.gainA.gain.value = State.volume;
    }

    if(AudioCore.gainB){
      AudioCore.gainB.gain.value = State.volume;
    }

  },
  

  restore(){
    this.restoreSettings();
    const src = localStorage.getItem("pp_s");
    if(!src) return;

    const i = parseInt(localStorage.getItem("pp_i")) || 0;
    const t = parseFloat(localStorage.getItem("pp_t")) || 0;

    const a = AudioCore.current();

    a.src = src;
    State.index = i;

    a.onloadedmetadata = ()=>{
      a.currentTime = t;
    };
  }

};

// ===============================
//         CONTROLS BIND
// ===============================
function bindControls(){

  DOM.play.onclick = ()=>Engine.toggle();

  DOM.next.onclick = ()=>Engine.play(Playlist.next());

  DOM.prev.onclick = ()=>Engine.play(Playlist.prev());

  


// ajout boutons aux
  const repeatBtn = document.getElementById("repeatBtn");
  const muteBtn = document.getElementById("muteBtn");
  const togglePlayerBtn = document.getElementById("togglePlayer");

  // PLAY / PAUSE ICON
  Events.on("play", ()=>{
    if(DOM.play) DOM.play.textContent = "⏸";
  });

  Events.on("pause", ()=>{
    if(DOM.play) DOM.play.textContent = "▶";
  });

  // REPEAT
  if(repeatBtn){
    repeatBtn.onclick = ()=>{

      State.repeat = !State.repeat;

      repeatBtn.style.opacity = State.repeat ? "1" : "0.5";
    };
  }

// MUTE
if(muteBtn){

  const syncMute = ()=>{

    AudioCore.A.muted = State.muted;
    AudioCore.B.muted = State.muted;

    muteBtn.textContent = State.muted ? "🔇" : "🔊";
  };

  muteBtn.onclick = ()=>{

    State.muted = !State.muted;

    syncMute();
  };

  Events.on("trackChange", syncMute);

}

  // PLAYLIST TOGGLE
  if(togglePlayerBtn){

    togglePlayerBtn.onclick = ()=>{

      document.body.classList.toggle("playlist-open");

    };

  }

// fin ajout boutons aux
DOM.volume.oninput = ()=>{

  State.volume = Number(DOM.volume.value);

  const v = Math.max(State.volume, 0.001);

  const now = AudioCore.ctx.currentTime;

  // gain A smooth
  AudioCore.gainA.gain.cancelScheduledValues(now);
  AudioCore.gainA.gain.setValueAtTime(
    AudioCore.gainA.gain.value,
    now
  );

  AudioCore.gainA.gain.linearRampToValueAtTime(
    v,
    now + 0.08
  );

  // gain B smooth
  AudioCore.gainB.gain.cancelScheduledValues(now);
  AudioCore.gainB.gain.setValueAtTime(
    AudioCore.gainB.gain.value,
    now
  );

  AudioCore.gainB.gain.linearRampToValueAtTime(
    v,
    now + 0.08
  );
};

DOM.progress.oninput = ()=>{

  const a = AudioCore.current();

  if(!a.duration) return;

  State.seeking = true;

  const time =
    (DOM.progress.value / 100) * a.duration;

  a.currentTime = time;
};

  DOM.progress.addEventListener("change", ()=>{

  State.seeking = false;

});

DOM.progress.addEventListener("touchend", ()=>{

  State.seeking = false;

});

DOM.progress.addEventListener("mouseup", ()=>{

  State.seeking = false;

});

  DOM.tracks.forEach((el,i)=>{
    el.onclick = ()=>Engine.play(i);
  });

}

// ===============================
//       AUTO NEXT / REPEAT
// ===============================
  function bindAudioLogic(){

  let autoTransition = false;

    Events.on("time", ({ current, duration })=>{

  // sécurité durée invalide
  if(
    !duration ||
    !isFinite(duration) ||
    duration < 10
  ){
    return;
  }

  // sécurité début track
  if(current < 5){
    return;
  }

  const remain = duration - current;

  // déclenche avant fin réelle
  if(
    remain <= Crossfade.duration &&
    !autoTransition
  ){

    autoTransition = true;

    const nextIndex = Playlist.next();

    Engine.play(nextIndex);

  }

  // reset sécurité
  if(remain > Crossfade.duration){
    autoTransition = false;
  }

});



  Events.on("error", ErrorHandler.handle);

  Events.on("retry", ()=>{
    Engine.play(State.index);
  });

}

// ===============================
//          INIT PART 2
// ===============================
function initPart2(){

  DOM.init();
  Playlist.buildFromDOM();
  bindControls();
  bindAudioLogic();
  Engine.restore();

}

// expose part2
window.__PLAYER_PART2__ = {
  DOM,
  Cache,
  Preload,
  Playlist,
  Engine,
  initPart2
};

})();



// ===============================
//          PRO PLAYER
// WAVEFORM + LYRICS + ANIMATIONS
// ===============================

(function(){

const {
  State,
  Events,
  AudioCore
} = window.__PLAYER_PART1__;

const {
  DOM
} = window.__PLAYER_PART2__;

// ===============================
//   RAF MANAGER (PERF CONTROL)
// ===============================
  const RAF = {
  tasks: new Map(),
  running: false,
  rafId: null,
  paused: false,

  add(name, fn){

    this.tasks.set(name, fn);

    if(!this.running && !this.paused){
      this.run();
    }
  },

  remove(name){

    this.tasks.delete(name);

    // stop total si plus aucune task
    if(this.tasks.size === 0){
      this.stop();
    }
  },

  stop(){

    this.running = false;

    if(this.rafId){
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  },

  pause(){

    this.paused = true;
    this.stop();
  },

  resume(){

    if(!this.paused) return;

    this.paused = false;

    if(this.tasks.size > 0){
      this.run();
    }
  },

  run(){

    if(this.running) return;

    this.running = true;

    const loop = ()=>{

      // sécurité hidden tab
      if(document.hidden){
        this.pause();
        return;
      }

      this.tasks.forEach(fn=>{
        try{
          fn();
        }catch(e){}
      });

      this.rafId = requestAnimationFrame(loop);
    };

    this.rafId = requestAnimationFrame(loop);
  }
};

  // AUTO PAUSE ONGLET CACHÉ
document.addEventListener("visibilitychange", ()=>{

  if(document.hidden){

    RAF.pause();

  } else {

    RAF.resume();

  }

});

// ===============================
//    WAVEFORM ENGINE (REAL)
// ===============================
const Waveform = {

  bars: [],
  resolution: 64,

  init(){
    if(!DOM.wave) return;

    DOM.wave.innerHTML = "";

    for(let i=0;i<this.resolution;i++){
      const bar = document.createElement("span");
      bar.style.display = "inline-block";
      bar.style.width = "2px";
      bar.style.marginRight = "1px";
      bar.style.height = "5px";
      DOM.wave.appendChild(bar);
      this.bars.push(bar);
    }

    RAF.add("waveform", ()=>this.draw());
  },

  draw(){
    const analyser = AudioCore.analyser;
    if(!analyser) return;

    analyser.getByteFrequencyData(AudioCore.dataArray);

    for(let i=0;i<this.bars.length;i++){
      const v = AudioCore.dataArray[i] / 255;
      const h = v * 100;
      this.bars[i].style.height = h + "%";
    }
  }

};

// ===============================
//   LYRICS ENGINE (SYNC PRECIS)
// ===============================
const Lyrics = {

  list: [],
  currentIndex: -1,
  container: null,

  init(){
    this.container = document.getElementById("lyrics");
  },

  load(data){
    this.list = data.sort((a,b)=>a.time - b.time);
    this.currentIndex = -1;
  },

  update(){

    if(!this.list.length) return;

    const t = AudioCore.current().currentTime;

    for(let i=0;i<this.list.length;i++){
      if(t >= this.list[i].time && this.currentIndex !== i){
        this.currentIndex = i;
        this.render(this.list[i].text);
        break;
      }
    }
  },

  render(text){
    if(!this.container) return;

    this.container.textContent = text;

    this.container.animate([
      { opacity: 0, transform: "translateY(10px)" },
      { opacity: 1, transform: "translateY(0)" }
    ], { duration: 200 });
  }

};

// ===============================
//       ANIMATIONS ENGINE
// ===============================
const UIEffects = {

  pulse(el){
    if(!el) return;

    el.animate([
      { transform: "scale(1)" },
      { transform: "scale(1.15)" },
      { transform: "scale(1)" }
    ], { duration: 200 });
  },

  glow(el){
    if(!el) return;

    el.animate([
      { boxShadow: "0 0 0px #0ff" },
      { boxShadow: "0 0 25px #0ff" },
      { boxShadow: "0 0 0px #0ff" }
    ], { duration: 800 });
  },

  background(){

    const hue = Math.floor(Math.random()*360);
    document.body.style.background = `hsl(${hue},30%,10%)`;
  }

};

// ===============================
//      PROGRESS SYNC ENGINE
// ===============================
  const Progress = {
        lastProgress: -1,
    lastCurrentText: "",
    lastDurationText: "",

    format(sec){
        if(isNaN(sec)) return "0:00";

        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);

        return `${m}:${s < 10 ? "0"+s : s}`;
    },

    update(){

        const a = AudioCore.current();

        if(
        !a.duration ||
        !DOM.progress ||
        State.seeking
        ){
        return;
        }

        const val = (a.currentTime / a.duration) * 100;

        const rounded = Math.floor(val);

        if(rounded !== this.lastProgress){

        this.lastProgress = rounded;

        DOM.progress.value = rounded;
        }

        if(DOM.currentTime){
        const currentText = this.format(a.currentTime);

        if(currentText !== this.lastCurrentText){

        this.lastCurrentText = currentText;

        DOM.currentTime.textContent = currentText;
}
        }

        if(DOM.duration){
        const durationText = this.format(a.duration);

        if(durationText !== this.lastDurationText){

        this.lastDurationText = durationText;

        DOM.duration.textContent = durationText;
}
        }
    }
};

// ===============================
//      GLOBAL LOOP (CENTRAL)
// ===============================
const Loop = {

  init(){
    RAF.add("progress", ()=>Progress.update());
    RAF.add("lyrics", ()=>Lyrics.update());
  }

};

// ===============================
//    EVENT HOOKS (UI REACTIONS)
// ===============================
function bindUIEvents(){

  Events.on("play", ()=>{
    UIEffects.pulse(DOM.play);
    UIEffects.glow(DOM.player);
    UIEffects.background();
  });

  Events.on("trackChange", ()=>{
    UIEffects.background();
  });

}

// ===============================
//         INIT PART 3
// ===============================
function initPart3(){

  Waveform.init();
  Lyrics.init();
  Loop.init();
  bindUIEvents();

}

// expose part3
window.__PLAYER_PART3__ = {
  RAF,
  Waveform,
  Lyrics,
  UIEffects,
  Progress,
  Loop,
  initPart3
};

})();



// ===============================
//         PRO PLAYER
// API + MEDIA + MOBILE + INIT
// ===============================

(function(){

const {
  State,
  Events,
  AudioCore
} = window.__PLAYER_PART1__;

const {
  DOM,
  Engine,
  Playlist,
  initPart2
} = window.__PLAYER_PART2__;

const {
  initPart3
} = window.__PLAYER_PART3__;

// ===============================
//         MEDIA SESSION 
// ===============================
const Media = {

  init(){

    if(!("mediaSession" in navigator)) return;

    navigator.mediaSession.setActionHandler("play", ()=>Engine.toggle());
    navigator.mediaSession.setActionHandler("pause", ()=>Engine.toggle());
    navigator.mediaSession.setActionHandler("nexttrack", ()=>Engine.play(Playlist.next()));
    navigator.mediaSession.setActionHandler("previoustrack", ()=>Engine.play(Playlist.prev()));

    Events.on("trackChange", (track)=>{
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist || "",
        album: track.album || ""
      });
    });

  }

};

// ===============================
//   MOBILE / VISIBILITY HANDLER
// ===============================
const Mobile = {
    recovering: false,

    async recoverAudio(){

    if(this.recovering) return;

    this.recovering = true;

    try{

      // resume context safari/iOS
      if(
        AudioCore.ctx &&
        AudioCore.ctx.state !== "running"
      ){

        await AudioCore.ctx.resume().catch(()=>{});
      }

      const current = AudioCore.current();

      // audio cassé / suspendu
      if(
        State.playing &&
        current &&
        current.paused
      ){

        await current.play().catch(()=>{});
      }

    }catch(e){}

    setTimeout(()=>{
      this.recovering = false;
    }, 1000);
  },

  init(){

    document.addEventListener("visibilitychange", async ()=>{

  if(document.hidden){

    Events.emit("appHidden");

  } else {

    Events.emit("appVisible");

    await this.recoverAudio();

  }

});

  window.addEventListener("focus", async ()=>{

  Events.emit("focus");

  await this.recoverAudio();

});
    window.addEventListener("blur", ()=>Events.emit("blur"));

    // safari / ios recovery
window.addEventListener("pageshow", async ()=>{
  await this.recoverAudio();
});
// retour veille téléphone
document.addEventListener("resume", async ()=>{
  await this.recoverAudio();
});}
};

// ===============================
//     FULLSCREEN CONTROLLER
// ===============================
const Fullscreen = {

  toggle(){
    if(!document.fullscreenElement){
      DOM.player && DOM.player.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }

};

// ===============================
//        BOTTOM SHEET
// ===============================
const BottomSheet = {

  open: false,
  startY: 0,
  currentY: 0,

  init(){

    if(!DOM.player) return;

    DOM.player.addEventListener("touchstart", (e)=>{
      this.startY = e.touches[0].clientY;
    });

    DOM.player.addEventListener("touchmove", (e)=>{
      this.currentY = e.touches[0].clientY;
      const delta = this.currentY - this.startY;

      if(delta > 0){
        DOM.player.style.transform = `translateY(${delta}px)`;
      }
    });

    DOM.player.addEventListener("touchend", ()=>{
      const delta = this.currentY - this.startY;

      if(delta > 100){
        this.open = false;
        DOM.player.style.transform = "translateY(80%)";
      } else {
        this.open = true;
        DOM.player.style.transform = "translateY(0)";
      }
    });

  }

};

// ===============================
//    SECURITY / AUTOPLAY FIX
// ===============================
const Security = {

  unlocked: false,

  init(){

    const unlock = ()=>{
      if(this.unlocked) return;

      AudioCore.ctx.resume().catch(()=>{});
      this.unlocked = true;

      document.removeEventListener("click", unlock);
      document.removeEventListener("touchstart", unlock);
    };

    document.addEventListener("click", unlock);
    document.addEventListener("touchstart", unlock);

  }

};

// ===============================
// API PUBLIC (CONTROL EXTERNE)
// ===============================
const API = {

  play(i){ Engine.play(i); },
  pause(){ AudioCore.current().pause(); },
  toggle(){ Engine.toggle(); },
  next(){ Engine.play(Playlist.next()); },
  prev(){ Engine.play(Playlist.prev()); },

  volume(v){
    State.volume = v;
    AudioCore.gainA.gain.value = v;
    AudioCore.gainB.gain.value = v;
  },

  loadPlaylist(data){
    Playlist.list = data;
  },

  loadLyrics(data){
    window.__PLAYER_PART3__.Lyrics.load(data);
  }

};

// ===============================
//          GLOBAL INIT
// ===============================
function init(){

  AudioCore.init();

  initPart2();
  initPart3();

  Media.init();
  Mobile.init();
  BottomSheet.init();
  Security.init();

  Events.emit("ready");

}

// ===============================
//          AUTO INIT
// ===============================
document.addEventListener("DOMContentLoaded", init);

// ===============================
//         EXPORT GLOBAL
// ===============================
window.PlayerAPI = API;

})();



// ===============================
//        ADDON PRO VISUAL 
// ===============================

(function(){

const { State, Events, AudioCore } = window.__PLAYER_PART1__;
const { DOM, Engine, Playlist } = window.__PLAYER_PART2__;

// ===============================
//           WAVEFORM 
// ===============================
const WaveAddon = {
  fps: 30,
  lastFrame: 0,

  bars: [],
  raf: null,

  init(){

    const wf = document.getElementById("waveform");
    if(!wf) return;

    this.bars = wf.querySelectorAll("span");

    Events.on("play", ()=>this.start());
    Events.on("pause", ()=>this.stop());
  },

  start(){
    if(this.raf) return;

    const loop = (now = 0)=>{

      const analyser = AudioCore.analyser;
// pause totale si audio pause
if(!State.playing){

  this.stop();
  return;
}

// hidden tab sécurité
if(document.hidden){

  this.stop();
  return;
}

// limiter FPS
if(now - this.lastFrame < (1000 / this.fps)){

  this.raf = requestAnimationFrame(loop);
  return;
}

this.lastFrame = now;
      
      if(analyser){
        analyser.getByteFrequencyData(AudioCore.dataArray);

        this.bars.forEach((bar,i)=>{
          const v = AudioCore.dataArray[i*2] || 0;
          bar.style.height = Math.max(4, v/6) + "px";
        });
      }

      this.raf = requestAnimationFrame(loop);
    };

    loop();
  },

  stop(){
    this.lastFrame = 0;
    cancelAnimationFrame(this.raf);
    this.raf = null;
  }

};

// ===============================
//    COVER FX (ZOOM + RYTHME)
// ===============================
const CoverAddon = {

  el: null,
  raf: null,

  init(){
    this.el = document.getElementById("cover");
    if(!this.el) return;

    Events.on("play", ()=>this.start());
    Events.on("pause", ()=>this.stop());
  },

  start(){
    if(this.raf) return;

    const loop = ()=>{

      const analyser = AudioCore.analyser;
      if(analyser){
        analyser.getByteFrequencyData(AudioCore.dataArray);

        const v = AudioCore.dataArray[20] / 255;
        const scale = 1 + (v * 0.06);

        this.el.style.transform = `scale(${scale})`;
      }

      this.raf = requestAnimationFrame(loop);
    };

    loop();
  },

  stop(){
    cancelAnimationFrame(this.raf);
    this.raf = null;
    if(this.el) this.el.style.transform = "scale(1)";
  }

};

// ===============================
//           GLOW FX 
// ===============================
const GlowAddon = {

  init(){
    Events.on("play", ()=>{
      if(DOM.player){
        DOM.player.style.boxShadow = "0 0 25px #00e5ff";
      }
    });

    Events.on("pause", ()=>{
      if(DOM.player){
        DOM.player.style.boxShadow = "none";
      }
    });
  }

};

// ===============================
//          TRACK ACTIVE   
// ===============================
const TrackUIAddon = {

  init(){
    Events.on("trackChange", ()=>{
      document.querySelectorAll(".track").forEach(t=>{
        t.classList.remove("active","playing");
      });

      const el = document.querySelectorAll(".track")[State.index];
      if(el){
        el.classList.add("active","playing");
      }
    });
  }

};

// ===============================
//        CROSSFADE BOOST 
// ===============================
const CrossfadeAddon = {

  init(){

    Events.on("trackChange", ()=>{
      const g = AudioCore.currentGain();
      g.gain.value = State.volume;
    });

  }

};

// ===============================
//       LYRICS BUTTON FIX 
// ===============================
const LyricsAddon = {

  init(){

    document.querySelectorAll(".lyrics-btn").forEach(btn=>{

      btn.addEventListener("click",(e)=>{
        e.stopPropagation();

        const i = btn.dataset.track;
        if(i === undefined) return;

        const t = Playlist.get(parseInt(i));
        if(!t) return;

        localStorage.setItem("lastTrack", i);
        localStorage.setItem("lastSrc", t.src);
        localStorage.setItem("lastTitle", t.title);
        localStorage.setItem("trackTime", AudioCore.current().currentTime);

        // navigation naturelle (tu gardes ton HTML)
      });

    });

  }

};

// ===============================
//       INIT GLOBAL ADDON
// ===============================
function initAddons(){

  WaveAddon.init();
  CoverAddon.init();
  GlowAddon.init();
  TrackUIAddon.init();
  CrossfadeAddon.init();
  LyricsAddon.init();

}

document.addEventListener("DOMContentLoaded", ()=>{
  setTimeout(initAddons, 0);
});

})();


// ===============================
//     AUDIO CORE STABILITY
// watchdog + stall + recovery
// ===============================

(function(){

const{State,Events,AudioCore}=window.__PLAYER_PART1__;

// ===============================
//        AUDIO WATCHDOG
// ===============================

const AudioWatchdog={

timer:null,
lastTime:0,
stallCount:0,
recovering:false,

interval:3000,
maxStall:3,

init(){

Events.on("play",()=>this.start());
Events.on("pause",()=>this.stop());

document.addEventListener("visibilitychange",()=>{

if(!document.hidden){
this.recover();
}

});

window.addEventListener("focus",()=>{

this.recover();

});

window.addEventListener("pageshow",()=>{

this.recover();

});

},

start(){

this.stop();

this.timer=setInterval(()=>{

this.check();

},this.interval);

},

stop(){

clearInterval(this.timer);

this.timer=null;
this.lastTime=0;
this.stallCount=0;

},

async check(){

const a=AudioCore.current();

if(
!a||
a.paused||
!State.playing||
State.buffering
){
return;
}

const t=a.currentTime;

if(t===this.lastTime){

this.stallCount++;

Events.emit("audio:stall",{
count:this.stallCount
});

if(this.stallCount>=this.maxStall){

await this.recover();

}

}else{

this.stallCount=0;

}

this.lastTime=t;

},

async recover(){

if(this.recovering)return;

this.recovering=true;

const a=AudioCore.current();

try{

// resume AudioContext iOS/Safari
if(
AudioCore.ctx&&
AudioCore.ctx.state!=="running"
){
await AudioCore.ctx.resume();
}

}catch(e){}

try{

// pause fantôme Android/iOS
if(
State.playing&&
a&&
a.paused
){
await a.play();
}

// micro jump anti stall
if(
a&&
!a.paused&&
a.readyState>=2
){
a.currentTime+=0.01;
}

Events.emit("audio:recovered");

}catch(e){

Events.emit("audio:recoveryError",e);

}

setTimeout(()=>{

this.recovering=false;

},1200);

}

};

// ===============================
//         AUTO INIT
// ===============================

document.addEventListener("DOMContentLoaded",()=>{

AudioWatchdog.init();

});

})();


// ===============================
//      AUDIO CONTEXT REBUILD
// Safari/iOS/Android protection
// ===============================

(function(){

const{State,Events,AudioCore}=window.__PLAYER_PART1__;

// ===============================
//      CONTEXT REBUILDER
// ===============================

const ContextRebuilder={

rebuilding:false,
maxRetries:2,
retries:0,

init(){

Events.on("audio:recoveryError",()=>{

this.check();

});

document.addEventListener("visibilitychange",()=>{

if(!document.hidden){
this.check();
}

});

window.addEventListener("focus",()=>{

this.check();

});

},

async check(){

if(
!AudioCore.ctx||
AudioCore.ctx.state==="running"
){
return;
}

await this.rebuild();

},

async rebuild(){

if(this.rebuilding)return;

if(this.retries>=this.maxRetries)return;

this.rebuilding=true;
this.retries++;

try{

const oldCtx=AudioCore.ctx;

if(oldCtx){

try{
await oldCtx.close();
}catch(e){}

}

// nouveau contexte
AudioCore.ctx=new(
window.AudioContext||
window.webkitAudioContext
)();

// rebuild nodes
const srcA=AudioCore.ctx.createMediaElementSource(AudioCore.A);
const srcB=AudioCore.ctx.createMediaElementSource(AudioCore.B);

AudioCore.gainA=AudioCore.ctx.createGain();
AudioCore.gainB=AudioCore.ctx.createGain();

AudioCore.analyser=AudioCore.ctx.createAnalyser();
AudioCore.analyser.fftSize=1024;

AudioCore.bufferLength=
AudioCore.analyser.frequencyBinCount;

AudioCore.dataArray=
new Uint8Array(AudioCore.bufferLength);

srcA.connect(AudioCore.gainA)
.connect(AudioCore.analyser)
.connect(AudioCore.ctx.destination);

srcB.connect(AudioCore.gainB)
.connect(AudioCore.analyser)
.connect(AudioCore.ctx.destination);

// restore volume
const activeGain=
AudioCore.currentGain();

const inactiveGain=
AudioCore.nextGain();

activeGain.gain.value=
Math.max(State.volume,0.001);

inactiveGain.gain.value=0;

await AudioCore.ctx.resume().catch(()=>{});

Events.emit("audio:contextRebuilt");

}catch(e){

Events.emit("audio:contextFailed",e);

}

setTimeout(()=>{

this.rebuilding=false;

},1500);

}

};

// ===============================
//         AUTO INIT
// ===============================

document.addEventListener("DOMContentLoaded",()=>{

ContextRebuilder.init();

});

})();


// ===============================
//     ANTI DOUBLE PLAY ANDROID
// multiple play protection
// ===============================

(function(){

const{State,Events,AudioCore}=window.__PLAYER_PART1__;

// ===============================
//       PLAY GUARD SYSTEM
// ===============================

const PlayGuard={

lock:false,
lastPlay:0,
delay:400,

init(){

[this.getA(),this.getB()].forEach(a=>{

if(!a)return;

a.addEventListener("play",()=>{

this.handle(a);

});

});

},

getA(){
return AudioCore.A;
},

getB(){
return AudioCore.B;
},

handle(active){

const now=Date.now();

if(now-this.lastPlay<this.delay){

this.forcePause(active);
return;

}

this.lastPlay=now;

// sécurité double audio Android
[this.getA(),this.getB()].forEach(a=>{

if(
a!==active&&
!a.paused
){
this.forcePause(a);
}

});

},

forcePause(a){

try{

a.pause();

}catch(e){}

}

};

// ===============================
//         AUTO INIT
// ===============================

document.addEventListener("DOMContentLoaded",()=>{

PlayGuard.init();

});

})();


