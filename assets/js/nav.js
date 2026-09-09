// Tiny shared helpers for the project site.
(function () {
  // Mark the current page in the nav.
  var here = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".site-nav a").forEach(function (a) {
    var target = a.getAttribute("href");
    if (target === here || (here === "index.html" && target === "./")) {
      a.classList.add("active");
    }
  });

  // Fill any <span data-year> with the current year.
  document.querySelectorAll("[data-year]").forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });

  // Replace a <video> with a friendly placeholder if its source 404s, so the
  // page still reads well before the demo clips are dropped in.
  document.querySelectorAll("figure.clip video").forEach(function (v) {
    v.addEventListener("error", function () {
      if (v.dataset.failed) return;
      v.dataset.failed = "1";
      var ph = document.createElement("div");
      ph.className = "missing";
      ph.textContent = (v.dataset.label || "Demo clip") +
        " — drop the .mp4 into /videos/ (see videos/README.md)";
      v.replaceWith(ph);
    }, true);
  });
})();
