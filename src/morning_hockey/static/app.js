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

  document.querySelectorAll(".stats-table").forEach(function (table) {
    var tbody = table.querySelector("tbody");
    var headers = table.querySelectorAll("th[data-sort]");
    var activeSort = null;
    var activeDir = null;

    headers.forEach(function (th) {
      th.addEventListener("click", function () {
        var key = th.dataset.sort;
        var isText = th.dataset.type === "text";
        var dir = key === activeSort && activeDir === "desc" ? "asc" : "desc";

        var rows = Array.prototype.slice.call(tbody.querySelectorAll("tr"));
        rows.sort(function (a, b) {
          if (isText) {
            var an = a.dataset[key] || "";
            var bn = b.dataset[key] || "";
            return dir === "asc" ? an.localeCompare(bn) : bn.localeCompare(an);
          }
          var av = parseFloat(a.dataset[key]);
          var bv = parseFloat(b.dataset[key]);
          return dir === "asc" ? av - bv : bv - av;
        });

        rows.forEach(function (row) {
          tbody.appendChild(row);
        });

        headers.forEach(function (h) {
          h.classList.remove("sort-asc", "sort-desc");
        });
        th.classList.add(dir === "asc" ? "sort-asc" : "sort-desc");

        activeSort = key;
        activeDir = dir;
      });
    });
  });
})();
