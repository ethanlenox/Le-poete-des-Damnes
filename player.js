const audio = document.getElementById("audioPlayer");
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
  
/* mode initial */
if (toggleBtn && player) {
  player.classList.add("compact");

  toggleBtn.addEventListener("click", () => {
    player.classList.toggle("compact");
    player.classList.toggle("expanded");
  });
}

/* 🆕 TEMPS */
const currentTimeEl = document.getElementById("currentTime");
const durationEl = document.getElementById("duration");
const tracks = document.querySelectorAll(".track");

let currentIndex = 0;
let repeatMode = false;
const savedTrack =
  localStorage.getItem("lastTrack");

if (savedTrack !== null) {
  currentIndex = parseInt(savedTrack);
}
let lastScroll = 0;
const savedTime = localStorage.getItem("trackTime");

if (savedTime) {
  audio.currentTime = parseFloat(savedTime);
}

/* ===================== */
/* ⏱ FORMAT TEMPS */
/* ===================== */

function formatTime(sec) {
  if (isNaN(sec)) return "0:00";

  let minutes = Math.floor(sec / 60);
  let seconds = Math.floor(sec % 60);

  if (seconds < 10) seconds = "0" + seconds;

  return minutes + ":" + seconds;
}

/* ===================== */
/* 🔊 VOLUME MÉMOIRE */
/* ===================== */

let savedVolume = localStorage.getItem("volume");
audio.volume = savedVolume !== null ? savedVolume : 1;
volumeBar.value = audio.volume;

/* ===================== */
/* 🎵 ACTIVE TRACK */
/* ===================== */

function setActiveTrack(i) {

  tracks.forEach(t =>
    t.classList.remove(
      "active",
      "playing"
    )
  );

  if (tracks[i]) {

    tracks[i].classList.add(
      "active",
      "playing"
    );

    tracks[i].scrollIntoView({

      behavior: "smooth",

      block: "center"

    });
  }
}

/* ===================== */
/* ▶ PLAY TRACK */
/* ===================== */

function playTrack(i) {
  const t = tracks[i];
  if (!t) return;

  audio.src = t.dataset.src;
  title.textContent = t.dataset.title || "Lecture...";

  audio.play();
  playBtn.textContent = "⏸";

  currentIndex = i;
  localStorage.setItem(
  "lastTrack",
  currentIndex
);
  setActiveTrack(i);
}

/* CLICK TRACK */
tracks.forEach((t, i) => {
  t.addEventListener("click", () => playTrack(i));
});

/* PLAY / PAUSE */
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

/* ===================== */
/* 🎚 PROGRESS + TEMPS */
/* ===================== */

audio.addEventListener("timeupdate", () => {
  if (!audio.duration) return;

  localStorage.setItem("trackTime",audio.currentTime);

  progress.value = (audio.currentTime / audio.duration) * 100;

  /* 🆕 update temps */
  currentTimeEl.textContent = formatTime(audio.currentTime);
});

/* 🆕 durée totale */
audio.addEventListener("loadedmetadata", () => {
  durationEl.textContent = formatTime(audio.duration);
});

/* SEEK */
progress.addEventListener("input", () => {
  audio.currentTime = (progress.value / 100) * audio.duration;
});

/* ===================== */
/* 🎧 FADE NEXT TRACK */
/* ===================== */

function fadeOutAndNext(nextIndex) {
  let fade = setInterval(() => {
    if (audio.volume > 0.05) {
      audio.volume -= 0.05;
    } else {
      clearInterval(fade);
      audio.pause();
      audio.volume = volumeBar.value;
      playTrack(nextIndex);
    }
  }, 50);
}

audio.addEventListener(
  "ended",
  () => {

    if (repeatMode) {

      audio.currentTime = 0;

      audio.play();

      return;
    }

    if (
      currentIndex + 1 <
      tracks.length
    ) {

      fadeOutAndNext(
        currentIndex + 1
      );

    } else {

      playBtn.textContent = "▶";
    }
  }
);

/* ===================== */
/* 🔊 VOLUME */
/* ===================== */

volumeBar.addEventListener("input", () => {
  audio.volume = volumeBar.value;
  localStorage.setItem("volume", audio.volume);
});

/* MUTE */
muteBtn.addEventListener("click", () => {
  if (audio.volume > 0) {
    audio.volume = 0;
    volumeBar.value = 0;
    muteBtn.textContent = "🔇";
  } else {
    audio.volume = 1;
    volumeBar.value = 1;
    muteBtn.textContent = "🔊";
  }
});

nextBtn.addEventListener("click", () => {
  if (currentIndex + 1 < tracks.length) {
    playTrack(currentIndex + 1);
  } else {
    playTrack(0);
  }
});

prevBtn.addEventListener("click", () => {
  if (currentIndex - 1 >= 0) {
    playTrack(currentIndex - 1);
  } else {
    playTrack(tracks.length - 1);
  }
});
  

/* ===================== */
/* 🎵 WAVEFORM */
/* ===================== */

audio.addEventListener("play", () => {
  waveform.classList.remove("paused");
});

audio.addEventListener("pause", () => {
  waveform.classList.add("paused");
});
repeatBtn.addEventListener(
  "click",
  () => {

    repeatMode = !repeatMode;

    repeatBtn.style.opacity =
      repeatMode ? "1" : "0.5";
  }
);
/* ===================== */
/* 🖼 LIGHTBOX GALERIE */
/* ===================== */

const galleryImages =
  document.querySelectorAll(".gallery-img");

const lightbox =
  document.getElementById("lightbox");

const lightboxImg =
  document.getElementById("lightboxImg");

const closeLightbox =
  document.getElementById("closeLightbox");

/* OUVERTURE IMAGE */

galleryImages.forEach(img => {

  img.addEventListener("click", () => {

    lightbox.classList.add("active");

    lightboxImg.src = img.src;

    document.body.style.overflow = "hidden";

  });

});

/* FERMETURE BOUTON */

closeLightbox.addEventListener("click", () => {

  lightbox.classList.remove("active");

  document.body.style.overflow = "auto";

});

/* FERMETURE FOND */

lightbox.addEventListener("click", (e) => {

  if (e.target === lightbox) {

    lightbox.classList.remove("active");

    document.body.style.overflow = "auto";

  }

});

/* TOUCHE ESC */

document.addEventListener("keydown", (e) => {

  if (e.key === "Escape") {

    lightbox.classList.remove("active");

    document.body.style.overflow = "auto";

  }

});
/* ===================== */
/* ✨ REVEAL AU SCROLL */
/* ===================== */

const reveals =
  document.querySelectorAll(".reveal");

const revealOnScroll = () => {

  const triggerBottom =
    window.innerHeight * 0.9;

  reveals.forEach(el => {

    const rect =
      el.getBoundingClientRect();

    if (rect.top < triggerBottom) {

      el.classList.add("visible");

    }

  });

};

window.addEventListener(
  "scroll",
  revealOnScroll
);

window.addEventListener(
  "load",
  revealOnScroll
);
