/* ===================== */
/* 🖼 LIGHTBOX GALERIE */
/* ===================== */

document.addEventListener("DOMContentLoaded", () => {

  const galleryImages = document.querySelectorAll(".gallery-img");
  const lightbox = document.getElementById("lightbox");
  const lightboxImg = document.getElementById("lightboxImg");
  const closeLightbox = document.getElementById("closeLightbox");

  if (!lightbox || !lightboxImg || !closeLightbox) return;

  galleryImages.forEach(img => {
    img.addEventListener("click", () => {
      lightbox.classList.add("active");
      lightboxImg.src = img.src;
      document.body.style.overflow = "hidden";
    });
  });

  closeLightbox.addEventListener("click", () => {
    lightbox.classList.remove("active");
    document.body.style.overflow = "auto";
  });

  lightbox.addEventListener("click", (e) => {
    if (e.target === lightbox) {
      lightbox.classList.remove("active");
      document.body.style.overflow = "auto";
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      lightbox.classList.remove("active");
      document.body.style.overflow = "auto";
    }
  });

});

