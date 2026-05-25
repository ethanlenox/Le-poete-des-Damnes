window.addEventListener("load", () => {

  const intro = document.getElementById("intro");

  // durée affichage intro
  const INTRO_DURATION = 3200;

  setTimeout(() => {

    intro.classList.add("hide");

    // nettoyage propre DOM
    setTimeout(() => {
      intro.remove();
    }, 1400);

  }, INTRO_DURATION);

});
