document.addEventListener("DOMContentLoaded", () => {

  const intro = document.getElementById("intro");
  const skip = document.getElementById("skipIntro");

  if (!intro) return;

  const closeIntro = () => {

    intro.classList.add("hide");

    setTimeout(() => {
      intro.remove();
    }, 1200);
  };

  setTimeout(closeIntro, 5200);

  skip?.addEventListener("click", closeIntro);
});

  // mémorisation session
  sessionStorage.setItem("introPlayed", "true");

  const closeIntro = () => {

    intro.classList.add("hide");

    setTimeout(() => {

      intro.remove();

    }, 1400);
  };

  // auto fermeture
  setTimeout(closeIntro, 5200);

  // skip
  skip.addEventListener("click", closeIntro);

});
