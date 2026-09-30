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

  var teamPanel = document.getElementById("team-panel");
  var teamPanelBackdrop = document.getElementById("team-panel-backdrop");
  var teamPanelTitle = document.getElementById("team-panel-title");
  var teamPanelBody = document.getElementById("team-panel-body");
  var teamPanelClose = document.getElementById("team-panel-close");
  var snapshotsEl = document.getElementById("team-snapshots");

  if (teamPanel && snapshotsEl) {
    var snapshots = {};
    try {
      snapshots = JSON.parse(snapshotsEl.textContent || "{}");
    } catch (e) {
      snapshots = {};
    }

    var openAbbrev = null;

    function el(tag, className, text) {
      var node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    }

    function section(titleText) {
      var wrap = el("div", "tp-section");
      wrap.appendChild(el("p", "tp-section-title", titleText));
      return wrap;
    }

    function renderResults(results) {
      var wrap = section("5 viime ottelua");
      if (!results.length) {
        wrap.appendChild(el("p", "tp-empty", "Ei pelattuja otteluita."));
        return wrap;
      }
      var row = el("div", "tp-results");
      results.forEach(function (r) {
        var chip = el("span", "tp-result-chip result-" + r.result.toLowerCase(), r.result);
        chip.title = "vs " + r.opponent_abbrev;
        row.appendChild(chip);
      });
      wrap.appendChild(row);
      return wrap;
    }

    function renderScorers(scorers) {
      var wrap = section("Pistepörssi (top 3)");
      if (!scorers.length) {
        wrap.appendChild(el("p", "tp-empty", "Ei tilastoituja pisteitä."));
        return wrap;
      }
      scorers.forEach(function (s, i) {
        var row = el("div", "tp-scorer-row");
        row.appendChild(el("span", null, (i + 1) + ". " + s.name));
        row.appendChild(el("span", "tp-scorer-line", s.goals + "+" + s.assists + "=" + s.points));
        wrap.appendChild(row);
      });
      return wrap;
    }

    function renderGoalie(goalie) {
      var wrap = section("Oletettu ykkösmaalivahti");
      if (!goalie) {
        wrap.appendChild(el("p", "tp-empty", "Ei tietoa."));
        return wrap;
      }
      var row = el("div", "tp-scorer-row");
      row.appendChild(el("span", null, goalie.name));
      row.appendChild(el("span", "tp-scorer-line", goalie.games_played + " O · " + goalie.save_pct.toFixed(3)));
      wrap.appendChild(row);
      return wrap;
    }

    function renderNextGame(game) {
      var wrap = section("Seuraava ottelu");
      if (!game) {
        wrap.appendChild(el("p", "tp-empty", "Ei tiedossa."));
        return wrap;
      }
      var label = (game.is_home ? "vs " : "@ ") + game.opponent_abbrev + " · " + game.date;
      wrap.appendChild(el("p", null, label));
      return wrap;
    }

    function openTeamPanel(abbrev) {
      var data = snapshots[abbrev];
      if (!data) return;

      teamPanelTitle.textContent = abbrev;
      teamPanelBody.innerHTML = "";
      teamPanelBody.appendChild(renderResults(data.recent_results || []));
      teamPanelBody.appendChild(renderScorers(data.top_scorers || []));
      teamPanelBody.appendChild(renderGoalie(data.starting_goalie));
      teamPanelBody.appendChild(renderNextGame(data.next_game));

      teamPanel.classList.add("open");
      teamPanel.setAttribute("aria-hidden", "false");
      teamPanelBackdrop.classList.add("open");
      openAbbrev = abbrev;
    }

    function closeTeamPanel() {
      teamPanel.classList.remove("open");
      teamPanel.setAttribute("aria-hidden", "true");
      teamPanelBackdrop.classList.remove("open");
      openAbbrev = null;
    }

    // The backdrop is decorative dimming only (pointer-events: none in CSS)
    // so a team button underneath it stays clickable while the panel is
    // open — switching teams should replace the panel's content in place,
    // not require closing it first. Closing on an "outside" click is
    // handled here instead of via a backdrop click listener.
    document.addEventListener("click", function (event) {
      var trigger = event.target.closest(".team-trigger");
      if (trigger) {
        var abbrev = trigger.dataset.teamAbbrev;
        if (openAbbrev === abbrev) {
          closeTeamPanel();
        } else {
          openTeamPanel(abbrev);
        }
        return;
      }

      if (openAbbrev && !event.target.closest("#team-panel")) {
        closeTeamPanel();
      }
    });

    if (teamPanelClose) teamPanelClose.addEventListener("click", closeTeamPanel);
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeTeamPanel();
    });
  }

  document.querySelectorAll(".stats-table").forEach(function (table) {
    var tbody = table.querySelector("tbody");
    var headers = table.querySelectorAll("th[data-sort]");
    var activeSort = null;
    var activeDir = null;

    headers.forEach(function (th) {
      th.addEventListener("click", function () {
        var key = th.dataset.sort;
        var isText = th.dataset.type === "text";
        var firstDir = th.dataset.firstDir === "asc" ? "asc" : "desc";
        var dir;
        if (key === activeSort) {
          dir = activeDir === "desc" ? "asc" : "desc";
        } else {
          dir = firstDir;
        }

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
