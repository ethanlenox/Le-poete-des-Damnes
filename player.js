// AUDIO GLOBAL PERSISTANT
if (!window.globalAudio) {
  window.globalAudio = new Audio();
}
const audio = window.globalAudio;

/* ✅ AJOUT : éviter double init */
if (audio._initialized) return;
audio._initialized = true;

const playBtn = document.getElementById("playPauseBtn");
const nextBtn = document.getElementById("nextBtn");
const prevBtn = document.getElementById("prevBtn");
const muteBtn = document.getElementById("muteBtn");
const title = document.getElementById("trackTitle");
const progress = document.getElementById("progressBar");
const volumeBar = document.getElementById("volumeBar");
const waveform = document.getElementById("waveform");
const repeatBtn = document.getElementById("repeatBtn");
const toggleBtn = document.getElementById("togglePlayer");
const player = document.getElementById("miniPlayer");

const currentTimeEl = document.getElementById("currentTime");
const durationEl = document.getElementById("duration");
const tracks = document.querySelectorAll(".track");

let currentIndex = 0;
let repeatMode = false;

/* ===================== */
/*    MUSIQUE CONTINU    */
/* ===================== */

function restoreState() {

  const savedTrack = localStorage.getItem("lastTrack");
  const savedSrc = localStorage.getItem("lastSrc");
  const savedTitle = localStorage.getItem("lastTitle");
  const savedTime = localStorage.getItem("trackTime");

  if (!savedSrc) return;

  if (savedTrack !== null) {
    currentIndex = parseInt(savedTrack);
  }

  if (audio.src !== savedSrc) {
    audio.src = savedSrc;
  }

  if (savedTime) {
    audio.currentTime = parseFloat(savedTime);
  }

  if (title) {
    title.textContent = savedTitle || "Lecture...";
  }

  if (playBtn) {
    playBtn.textContent = audio.paused ? "▶" : "⏸";
  }
}

restoreState();

/* ===================== */
/* FORMAT TEMPS */
/* ===================== */

function formatTime(sec) {
  if (isNaN(sec)) return "0:00";

  let minutes = Math.floor(sec / 60);
  let seconds = Math.floor(sec % 60);

  if (seconds < 10) seconds = "0" + seconds;

  return minutes + ":" + seconds;
}

/* ===================== */
/* VOLUME */
/* ===================== */

let savedVolume = localStorage.getItem("volume");
audio.volume = savedVolume !== null ? savedVolume : 1;

if (volumeBar) {
  volumeBar.value = audio.volume;
}

/* ===================== */
/* ACTIVE TRACK */
/* ===================== */

function setActiveTrack(i) {

  tracks.forEach(t =>
    t.classList.remove("active", "playing")
  );

  if (tracks[i]) {

    tracks[i].classList.add("active", "playing");

    tracks[i].scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  }
}

/* ===================== */
/* PLAY TRACK */
/* ===================== */

async function playTrack(i) {

  const t = tracks[i];
  if (!t) return;

  currentIndex = i;

  audio.src = t.dataset.src;

  if (title) {
    title.textContent = t.dataset.title || "Lecture...";
  }

  audio.play().catch(() => {});

  if (playBtn) playBtn.textContent = "⏸";

  localStorage.setItem("lastTrack", i);
  localStorage.setItem("lastSrc", t.dataset.src);
  localStorage.setItem("lastTitle", t.dataset.title);

  setActiveTrack(i);
}

/* CLICK TRACK */
if (tracks.length) {
  tracks.forEach((t, i) => {
    t.addEventListener("click", () => playTrack(i));
  });
}

/* PLAY / PAUSE */
if (playBtn) {
playBtn.addEventListener("click", () => {

  if (audio.paused) {
    audio.play();
    playBtn.textContent = "⏸";
    setActiveTrack(currentIndex);
  } else {
    audio.pause();
    playBtn.textContent = "▶";
  }
});
}

/* ===================== */
/* PROGRESS */
/* ===================== */

let lastSave = 0;

audio.addEventListener("timeupdate", () => {

  if (!audio.duration) return;

  const now = Date.now();
  if (now - lastSave > 1000) {
    localStorage.setItem("trackTime", audio.currentTime);
    lastSave = now;
  }

  if (progress) {
    const percent =
      (audio.currentTime / audio.duration) * 100;

    progress.value = percent;

    progress.style.background =
      `linear-gradient(
        90deg,
        #00e5ff 0%,
        #00e5ff ${percent}%,
        rgba(255,255,255,0.12) ${percent}%,
        rgba(255,255,255,0.12) 100%
      )`;
  }

  if (currentTimeEl) {
    currentTimeEl.textContent =
      formatTime(audio.currentTime);
  }
});

audio.addEventListener("loadedmetadata", () => {
  if (durationEl) {
    durationEl.textContent = formatTime(audio.duration);
  }
});

if (progress) {
progress.addEventListener("input", () => {
  audio.currentTime = (progress.value / 100) * audio.duration;
});
}

/* ===================== */
/* NEXT / PREV */
/* ===================== */

function fadeOutAndNext(nextIndex) {
  let fade = setInterval(() => {
    if (audio.volume > 0.05) {
      audio.volume -= 0.05;
    } else {
      clearInterval(fade);
      audio.pause();
      audio.volume = volumeBar ? volumeBar.value : 1;
      playTrack(nextIndex);
    }
  }, 50);
}

audio.addEventListener("ended", () => {

  if (repeatMode) {
    audio.currentTime = 0;
    audio.play();
    return;
  }

  if (currentIndex + 1 < tracks.length) {
    fadeOutAndNext(currentIndex + 1);
  } else {
    if (playBtn) playBtn.textContent = "▶";
  }
});

if (nextBtn) {
nextBtn.addEventListener("click", () => {
  if (!tracks.length) return;
  currentIndex = (currentIndex + 1) % tracks.length;
  playTrack(currentIndex);
});
}

if (prevBtn) {
prevBtn.addEventListener("click", () => {
  if (!tracks.length) return;
  currentIndex =
    (currentIndex - 1 + tracks.length) % tracks.length;
  playTrack(currentIndex);
});
}

/* ===================== */
/* VOLUME / MUTE */
/* ===================== */

if (volumeBar) {
volumeBar.addEventListener("input", () => {
  audio.volume = volumeBar.value;
  localStorage.setItem("volume", audio.volume);
});
}

if (muteBtn) {
muteBtn.addEventListener("click", () => {
  if (audio.volume > 0) {
    audio.volume = 0;
    if (volumeBar) volumeBar.value = 0;
    muteBtn.textContent = "🔇";
  } else {
    audio.volume = 1;
    if (volumeBar) volumeBar.value = 1;
    muteBtn.textContent = "🔊";
  }
});
}

/* ===================== */
/* AUDIO CONTEXT GLOBAL */
/* ===================== */

if (!window.globalAudioContext) {
  window.globalAudioContext =
    new (window.AudioContext || window.webkitAudioContext)();
}

const audioContext = window.globalAudioContext;

/* ✅ éviter double source */
if (!audio._sourceCreated) {
  const source = audioContext.createMediaElementSource(audio);
  const analyser = audioContext.createAnalyser();

  source.connect(analyser);
  analyser.connect(audioContext.destination);

  analyser.fftSize = 64;

  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  const bars = waveform
    ? waveform.querySelectorAll("span")
    : [];

  let waveformAnimationId = null;

  function animateWaveform() {
    analyser.getByteFrequencyData(dataArray);

    bars.forEach((bar, i) => {
      const value = dataArray[i * 2];
      const height = Math.max(4, value / 6);
      bar.style.height = `${height}px`;
    });

    waveformAnimationId =
      requestAnimationFrame(animateWaveform);
  }

  audio.addEventListener("play", () => {
    if (waveform) waveform.classList.remove("paused");
    if (!waveformAnimationId) animateWaveform();
  });

  audio.addEventListener("pause", () => {
    if (waveform) waveform.classList.add("paused");
    cancelAnimationFrame(waveformAnimationId);
    waveformAnimationId = null;
  });

  audio._sourceCreated = true;
}

/* ===================== */
/* REPEAT */
/* ===================== */

if (repeatBtn) {
repeatBtn.addEventListener("click", () => {
  repeatMode = !repeatMode;
  repeatBtn.style.opacity =
    repeatMode ? "1" : "0.5";
});
}

/* ===================== */
/* SAVE TRACK */
/* ===================== */

function saveTrack(i) {
  const t = tracks[i];

  localStorage.setItem("lastTrack", i);
  localStorage.setItem("lastSrc", t.dataset.src);
  localStorage.setItem("lastTitle", t.dataset.title);
}

/* ===================== */
/* LYRICS BUTTON */
/* ===================== */

document.querySelectorAll(".lyrics-btn").forEach(btn => {

  btn.addEventListener("click", () => {

    const index = btn.dataset.track;

    if (index !== undefined) {
      saveTrack(parseInt(index));
    }

  });

});
