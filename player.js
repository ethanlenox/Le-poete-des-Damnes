// ===============================
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
  events: new Map(),

  on(name, fn){
    if(!this.events.has(name)) this.events.set(name, []);
    this.events.get(name).push(fn);
  },

  off(name, fn){
    if(!this.events.has(name)) return;
    const arr = this.events.get(name).filter(f=>f!==fn);
    this.events.set(name, arr);
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

  handle(e){
    console.warn("Audio error", e);

    if(State.retries < State.maxRetries){
      State.retries++;
      setTimeout(()=>{
        Events.emit("retry");
      }, 1000);
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

  load(audio, src){
    return new Promise((resolve, reject)=>{

      if(!src) return reject("no src");

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

      const cleanup = ()=>{
        audio.removeEventListener("canplay", onReady);
        audio.removeEventListener("error", onError);
      };

      audio.addEventListener("canplay", onReady);
      audio.addEventListener("error", onError);

      audio.load();
    });
  }

};

// ===============================
//       CROSSFADE ENGINE 
// ===============================
const Crossfade = {

  duration: 1.5,

  apply(oldAudio, newAudio, g1, g2){

    const ctx = AudioCore.ctx;
    const now = ctx.currentTime;

    const targetVolume = Math.max(State.volume, 0.001);

    g1.gain.cancelScheduledValues(now);
    g2.gain.cancelScheduledValues(now);

    g1.gain.setValueAtTime(g1.gain.value, now);
    g2.gain.setValueAtTime(0.001, now);

    g1.gain.exponentialRampToValueAtTime(0.001, now + this.duration);

    g2.gain.exponentialRampToValueAtTime(
      targetVolume,
      now + this.duration
    );

    setTimeout(()=>{

      oldAudio.pause();
      oldAudio.currentTime = 0;

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

  init(){
    this.play = document.getElementById("playPauseBtn");
    this.next = document.getElementById("nextBtn");
    this.prev = document.getElementById("prevBtn");
    this.progress = document.getElementById("progressBar");
    this.volume = document.getElementById("volumeBar");
    this.title = document.getElementById("trackTitle");
    this.player = document.getElementById("miniPlayer");
    this.tracks = document.querySelectorAll(".track");
  }
};

// ===============================
//          CACHE AUDIO
// ===============================
const Cache = {
  map: new Map(),
  max: 10,

  add(src, audio){
    if(this.map.size >= this.max){
      const first = this.map.keys().next().value;
      const old = this.map.get(first);
      Memory.cleanupAudio(old);
      this.map.delete(first);
    }
    this.map.set(src, audio);
  },

  get(src){
    return this.map.get(src);
  },

  has(src){
    return this.map.has(src);
  }
};

// ===============================
//      PRELOAD QUEUE (ASYNC)
// ===============================
const Preload = {

  queue: [],
  loading: false,

  push(src){
    if(!src || this.queue.includes(src) || Cache.has(src)) return;
    this.queue.push(src);
    this.run();
  },

  async run(){
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

  async play(i){

    if(State.locked) return;

    const track = Playlist.get(i);
    if(!track) return;

    State.locked = true;
    State.index = i;

    const newAudio = AudioCore.next();
    const newGain = AudioCore.nextGain();

    const oldAudio = AudioCore.current();
    const oldGain = AudioCore.currentGain();

    try {

      if(Cache.has(track.src)){
        const cached = Cache.get(track.src);
        newAudio.src = cached.src;
      } else {
        await Loader.load(newAudio, track.src);
      }

      newAudio.currentTime = 0;
      newAudio.muted = State.muted;
      newGain.gain.value = 0.001;
      await newAudio.play();
      AudioCore.swap();
      Crossfade.apply(
      oldAudio,
      newAudio,
      oldGain,
      newGain
    );

      if(DOM.title) DOM.title.textContent = track.title;

      Events.emit("trackChange", track);

      this.save();
      this.preload();

    } catch(e){
      ErrorHandler.handle(e);
    }

    State.locked = false;
  },

  toggle(){
    const a = AudioCore.current();
    if(a.paused){
      a.play();
    } else {
      a.pause();
    }
  },

  preload(){
    const nextIndex = Playlist.next();
    const t = Playlist.get(nextIndex);
    if(t) Preload.push(t.src);
  },

  save(){
    localStorage.setItem("pp_i", State.index);
    localStorage.setItem("pp_t", AudioCore.current().currentTime);
    localStorage.setItem("pp_s", AudioCore.current().src);
  },

  restore(){
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
    State.volume = DOM.volume.value;
    AudioCore.gainA.gain.value = State.volume;
    AudioCore.gainB.gain.value = State.volume;
  };

  DOM.progress.oninput = ()=>{
    const a = AudioCore.current();
    a.currentTime = (DOM.progress.value / 100) * a.duration;
  };

  DOM.tracks.forEach((el,i)=>{
    el.onclick = ()=>Engine.play(i);
  });

}

// ===============================
//       AUTO NEXT / REPEAT
// ===============================
function bindAudioLogic(){

  Events.on("ended", ()=>{

    if(State.repeat){
      const a = AudioCore.current();
      a.currentTime = 0;
      a.play();
    } else {
      Engine.play(Playlist.next());
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

  add(name, fn){
    this.tasks.set(name, fn);
    if(!this.running) this.run();
  },

  remove(name){
    this.tasks.delete(name);
  },

  run(){
    this.running = true;

    const loop = ()=>{
      this.tasks.forEach(fn=>{
        try{ fn(); }catch(e){}
      });
      requestAnimationFrame(loop);
    };

    requestAnimationFrame(loop);
  }
};

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

  update(){
    const a = AudioCore.current();
    if(!a.duration || !DOM.progress) return;

    const val = (a.currentTime / a.duration) * 100;
    DOM.progress.value = val;
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

  init(){

    document.addEventListener("visibilitychange", ()=>{
      if(document.hidden){
        Events.emit("appHidden");
      } else {
        Events.emit("appVisible");
      }
    });

    window.addEventListener("focus", ()=>Events.emit("focus"));
    window.addEventListener("blur", ()=>Events.emit("blur"));

  }

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

      AudioCore.ctx.resume();
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

    const loop = ()=>{

      const analyser = AudioCore.analyser;
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
