window.addEventListener("load", () => {

  const intro = document.getElementById("intro");
  const skip = document.getElementById("skipIntro");

  // intro déjà vue
  if (sessionStorage.getItem("introPlayed")) {

    intro.remove();

    return;
  }

  // mémorisation session
  sessionStorage.setItem("introPlayed", "true");

  const closeIntro = () => {

    intro.classList.add("hide");

    setTimeout(() => {

      intro.remove();

    }, 1400);
  };

  // auto fermeture
  setTimeout(closeIntro, 3200);

  // skip
  skip.addEventListener("click", closeIntro);

});
