(function () {
  var sidebar = document.getElementById("sidebar");
  var backdrop = document.getElementById("backdrop");
  var openBtn = document.getElementById("sidebar-open");
  var closeBtn = document.getElementById("sidebar-close");

  function openSidebar() {
    sidebar.classList.add("open");
    backdrop.classList.add("open");
  }

  function closeSidebar() {
    sidebar.classList.remove("open");
    backdrop.classList.remove("open");
  }

  if (openBtn) openBtn.addEventListener("click", openSidebar);
  if (closeBtn) closeBtn.addEventListener("click", closeSidebar);
  if (backdrop) backdrop.addEventListener("click", closeSidebar);

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") closeSidebar();
  });

  document.querySelectorAll(".sidebar a").forEach(function (link) {
    link.addEventListener("click", closeSidebar);
  });
})();
