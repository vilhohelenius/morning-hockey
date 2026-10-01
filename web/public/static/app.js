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

  document.querySelectorAll(".day-picker").forEach(function (picker) {
    var pills = picker.querySelectorAll(".day-pill");
    var sections = document.querySelectorAll(".schedule-day-section");

    pills.forEach(function (pill) {
      pill.addEventListener("click", function () {
        pills.forEach(function (p) {
          p.classList.remove("active");
        });
        pill.classList.add("active");
        sections.forEach(function (section) {
          section.classList.toggle("is-hidden", section.dataset.date !== pill.dataset.date);
        });
      });
    });
  });

  // "Back" buttons on pages reached by navigating forward from somewhere
  // else: prefer real browser history over a fixed destination, since a
  // page can be reached from several different places (e.g. a game report
  // from the dashboard, Arkisto, or a team page) and a hardcoded link can
  // only ever guess one of them. The href is a plain fallback for when
  // there's no history to go back to (opened directly/in a new tab).
  document.querySelectorAll(".js-back").forEach(function (link) {
    link.addEventListener("click", function (event) {
      if (window.history.length > 1) {
        event.preventDefault();
        history.back();
      }
    });
  });

  document.querySelectorAll(".nav-group-toggle").forEach(function (toggle) {
    toggle.addEventListener("click", function () {
      var sublist = toggle.nextElementSibling;
      var isOpen = sublist.classList.toggle("open");
      toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });
  });

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

  var snapshotsEl = document.getElementById("team-snapshots");

  if (snapshotsEl) {
    var snapshots = {};
    try {
      snapshots = JSON.parse(snapshotsEl.textContent || "{}");
    } catch (e) {
      snapshots = {};
    }

    var openTrigger = null;
    var detailEl = null;

    function shortDate(iso) {
      var parts = iso.split("-");
      return parseInt(parts[2], 10) + "." + parseInt(parts[1], 10) + ".";
    }

    function playerChip(headshotUrl, label) {
      var wrap = el("span", "tp-player");
      var img = document.createElement("img");
      img.src = headshotUrl;
      img.alt = "";
      img.loading = "lazy";
      img.className = "tp-player-photo";
      img.onerror = function () {
        img.style.visibility = "hidden";
      };
      wrap.appendChild(img);
      wrap.appendChild(el("span", null, label));
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
        row.appendChild(playerChip(s.headshot, (i + 1) + ". " + s.name));
        row.appendChild(el("span", "tp-scorer-line", s.goals + "+" + s.assists + "=" + s.points));
        wrap.appendChild(row);
      });
      return wrap;
    }

    function renderGoalie(goalie) {
      var wrap = section("Ykkösmaalivahti");
      if (!goalie) {
        wrap.appendChild(el("p", "tp-empty", "Ei tietoa."));
        return wrap;
      }
      var row = el("div", "tp-scorer-row");
      row.appendChild(playerChip(goalie.headshot, goalie.name));
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
      var row = el("div", "tp-next");
      row.appendChild(el("span", "tp-next-date", shortDate(game.date)));

      var opponent = el("span", "tp-next-opponent");
      opponent.appendChild(document.createTextNode(game.is_home ? "vs " : "@ "));
      var logo = document.createElement("img");
      logo.src = game.opponent_logo;
      logo.alt = "";
      logo.loading = "lazy";
      logo.className = "schedule-logo";
      opponent.appendChild(logo);
      opponent.appendChild(document.createTextNode(game.opponent_abbrev));
      row.appendChild(opponent);

      wrap.appendChild(row);
      return wrap;
    }

    function closeDetail() {
      if (detailEl && detailEl.parentNode) detailEl.parentNode.removeChild(detailEl);
      if (openTrigger) openTrigger.setAttribute("aria-expanded", "false");
      detailEl = null;
      openTrigger = null;
    }

    function openDetail(trigger) {
      var abbrev = trigger.dataset.teamAbbrev;
      var data = snapshots[abbrev];
      if (!data) return;

      closeDetail();

      var logoSrc = trigger.querySelector("img") ? trigger.querySelector("img").src : "";
      var teamName = trigger.dataset.teamName || abbrev;

      var panel = el("div", "team-detail");

      var header = el("div", "team-detail-header");
      var teamLink = document.createElement("a");
      teamLink.href = "/joukkueet/" + abbrev.toLowerCase();
      teamLink.className = "team-detail-link";
      var logo = document.createElement("img");
      logo.src = logoSrc;
      logo.alt = "";
      logo.className = "team-detail-logo";
      teamLink.appendChild(logo);
      teamLink.appendChild(el("span", "team-detail-name", teamName));
      header.appendChild(teamLink);
      var closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "icon-btn team-detail-close";
      closeBtn.setAttribute("aria-label", "Sulje");
      closeBtn.textContent = "✕";
      closeBtn.addEventListener("click", closeDetail);
      header.appendChild(closeBtn);
      panel.appendChild(header);

      var body = el("div", "team-detail-body");
      body.appendChild(renderResults(data.recent_results || []));
      body.appendChild(renderScorers(data.top_scorers || []));
      body.appendChild(renderGoalie(data.starting_goalie));
      body.appendChild(renderNextGame(data.next_game));
      panel.appendChild(body);

      var row = trigger.closest(".division-row");
      row.insertAdjacentElement("afterend", panel);

      trigger.setAttribute("aria-expanded", "true");
      detailEl = panel;
      openTrigger = trigger;
    }

    document.addEventListener("click", function (event) {
      var trigger = event.target.closest(".team-trigger");
      if (!trigger) return;

      if (openTrigger === trigger) {
        closeDetail();
      } else {
        openDetail(trigger);
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeDetail();
    });
  }

  var gameDetailsEl = document.getElementById("game-details");

  if (gameDetailsEl) {
    var gameDetails = {};
    try {
      gameDetails = JSON.parse(gameDetailsEl.textContent || "{}");
    } catch (e) {
      gameDetails = {};
    }

    var openGameTrigger = null;
    var gameDetailEl = null;

    function goalRow(goal, awayAbbrev, awayLogo, homeLogo) {
      var row = el("div", "gd-goal-row");

      var main = el("div", "gd-goal-main");
      main.appendChild(el("span", "gd-goal-time", goal.time_in_period));

      var logo = document.createElement("img");
      logo.src = goal.team_abbrev === awayAbbrev ? awayLogo : homeLogo;
      logo.alt = "";
      logo.loading = "lazy";
      logo.className = "gd-goal-logo";
      main.appendChild(logo);

      var who = el("span", "gd-goal-who");
      who.appendChild(el("strong", null, goal.scorer));
      if (goal.strength) who.appendChild(el("span", "gd-goal-strength", goal.strength));
      main.appendChild(who);

      main.appendChild(el("span", "gd-goal-score", goal.away_score + "–" + goal.home_score));
      row.appendChild(main);

      if (goal.assists.length) {
        row.appendChild(el("p", "gd-goal-assists", goal.assists.join(", ")));
      }
      return row;
    }

    function renderGoals(goals, awayAbbrev, awayLogo, homeLogo) {
      var wrap = section("Maalit");
      if (!goals.length) {
        wrap.appendChild(el("p", "tp-empty", "Ei maaleja."));
        return wrap;
      }
      var currentPeriod = null;
      goals.forEach(function (goal) {
        if (goal.period_label !== currentPeriod) {
          currentPeriod = goal.period_label;
          wrap.appendChild(el("p", "gd-period", currentPeriod));
        }
        wrap.appendChild(goalRow(goal, awayAbbrev, awayLogo, homeLogo));
      });
      return wrap;
    }

    function statNumber(value) {
      var parenMatch = value.match(/\(([\d.]+)/);
      if (parenMatch) return parseFloat(parenMatch[1]);
      var match = value.match(/[\d.]+/);
      return match ? parseFloat(match[0]) : null;
    }

    function renderTeamStats(stats, awayAbbrev, homeAbbrev) {
      var wrap = section("Ottelun tilastot");
      var header = el("div", "gd-stat-header");
      header.appendChild(el("span", "gd-stat-team", awayAbbrev));
      header.appendChild(el("span", "gd-stat-team", homeAbbrev));
      wrap.appendChild(header);
      stats.forEach(function (stat) {
        var row = el("div", "gd-stat-row");
        var awaySpan = el("span", "gd-stat-value", stat.away_value);
        var homeSpan = el("span", "gd-stat-value", stat.home_value);

        var awayNum = statNumber(stat.away_value);
        var homeNum = statNumber(stat.home_value);
        if (awayNum !== null && homeNum !== null && awayNum !== homeNum) {
          var lowerIsBetter = stat.label.indexOf("Jäähyt") === 0;
          var awayBetter = lowerIsBetter ? awayNum < homeNum : awayNum > homeNum;
          (awayBetter ? awaySpan : homeSpan).classList.add("gd-stat-better");
        }

        row.appendChild(awaySpan);
        row.appendChild(el("span", "gd-stat-label", stat.label));
        row.appendChild(homeSpan);
        wrap.appendChild(row);
      });
      return wrap;
    }

    function closeGameDetail() {
      if (gameDetailEl && gameDetailEl.parentNode) gameDetailEl.parentNode.removeChild(gameDetailEl);
      if (openGameTrigger) openGameTrigger.setAttribute("aria-expanded", "false");
      gameDetailEl = null;
      openGameTrigger = null;
    }

    function openGameDetail(trigger) {
      var data = gameDetails[trigger.dataset.gameId];
      if (!data) return;

      closeGameDetail();

      var awayAbbrev = trigger.querySelector(".team.away .abbrev").textContent;
      var homeAbbrev = trigger.querySelector(".team.home .abbrev").textContent;
      var awayLogo = trigger.querySelector(".team.away img").src;
      var homeLogo = trigger.querySelector(".team.home img").src;

      var panel = el("div", "team-detail");

      var header = el("div", "team-detail-header");
      var awayHeaderLogo = document.createElement("img");
      awayHeaderLogo.src = awayLogo;
      awayHeaderLogo.alt = "";
      awayHeaderLogo.className = "team-detail-logo";
      header.appendChild(awayHeaderLogo);
      header.appendChild(el("span", "team-detail-name", awayAbbrev));
      header.appendChild(el("span", "team-detail-vs", "–"));
      header.appendChild(el("span", "team-detail-name", homeAbbrev));
      var homeHeaderLogo = document.createElement("img");
      homeHeaderLogo.src = homeLogo;
      homeHeaderLogo.alt = "";
      homeHeaderLogo.className = "team-detail-logo";
      header.appendChild(homeHeaderLogo);
      var closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "icon-btn team-detail-close";
      closeBtn.setAttribute("aria-label", "Sulje");
      closeBtn.textContent = "✕";
      closeBtn.addEventListener("click", closeGameDetail);
      header.appendChild(closeBtn);
      panel.appendChild(header);

      var body = el("div", "team-detail-body");
      body.appendChild(renderGoals(data.goals || [], awayAbbrev, awayLogo, homeLogo));
      body.appendChild(renderTeamStats(data.team_stats || [], awayAbbrev, homeAbbrev));
      panel.appendChild(body);

      var fullLink = document.createElement("a");
      fullLink.className = "archive-link";
      fullLink.href = "/ottelut/" + trigger.dataset.gameId;
      fullLink.textContent = "Koko ottelun tilastot →";
      panel.appendChild(fullLink);

      trigger.insertAdjacentElement("afterend", panel);

      trigger.setAttribute("aria-expanded", "true");
      gameDetailEl = panel;
      openGameTrigger = trigger;
    }

    document.addEventListener("click", function (event) {
      var trigger = event.target.closest(".game-card-trigger");
      if (!trigger) return;

      if (openGameTrigger === trigger) {
        closeGameDetail();
      } else {
        openGameDetail(trigger);
      }
    });

    document.addEventListener("keydown", function (event) {
      var trigger = event.target.closest(".game-card-trigger");
      if (!trigger) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (openGameTrigger === trigger) {
          closeGameDetail();
        } else {
          openGameDetail(trigger);
        }
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeGameDetail();
    });
  }

  function applyRowVisibility(table) {
    var limit = parseInt(table.dataset.collapseAt, 10);
    var expanded = table.dataset.expanded === "true";
    var positionFilter = table.dataset.positionFilter || "all";
    var rows = table.querySelectorAll("tbody tr");
    var shownCount = 0;
    rows.forEach(function (row) {
      var matchesPosition =
        positionFilter === "all" ||
        (positionFilter === "D" ? row.dataset.position === "D" : row.dataset.position !== "D");
      var withinCollapse = !limit || expanded || shownCount < limit;
      row.style.display = matchesPosition && withinCollapse ? "" : "none";
      if (matchesPosition) shownCount++;
    });
  }

  function applyRanks(table) {
    var positionFilter = table.dataset.positionFilter || "all";
    var rows = Array.prototype.slice.call(table.querySelectorAll("tbody tr"));
    rows.sort(function (a, b) {
      return parseInt(a.dataset.rank, 10) - parseInt(b.dataset.rank, 10);
    });
    var visible = rows.filter(function (row) {
      return (
        positionFilter === "all" ||
        (positionFilter === "D" ? row.dataset.position === "D" : row.dataset.position !== "D")
      );
    });

    var rank = 0;
    var prevGoals = null;
    var prevAssists = null;
    visible.forEach(function (row, i) {
      var goals = row.dataset.goals;
      var assists = row.dataset.assists;
      if (i === 0 || goals !== prevGoals || assists !== prevAssists) {
        rank = i + 1;
      }
      var cell = row.querySelector(".col-rank");
      if (cell) cell.textContent = rank;
      prevGoals = goals;
      prevAssists = assists;
    });
  }

  document.querySelectorAll(".table-filters").forEach(function (group) {
    var table = document.getElementById(group.dataset.tableId);
    if (!table) return;
    var buttons = group.querySelectorAll(".filter-btn");

    applyRanks(table);

    buttons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        buttons.forEach(function (b) {
          b.classList.remove("active");
        });
        btn.classList.add("active");
        table.dataset.positionFilter = btn.dataset.position;
        applyRowVisibility(table);
        applyRanks(table);
      });
    });
  });

  document.querySelectorAll(".stats-table").forEach(function (table) {
    var tbody = table.querySelector("tbody");
    var headers = table.querySelectorAll("th[data-sort]");
    var activeSort = null;
    var activeDir = null;

    applyRowVisibility(table);

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

        applyRowVisibility(table);
      });
    });
  });

  document.querySelectorAll(".expand-toggle").forEach(function (btn) {
    var table = document.getElementById(btn.dataset.tableId);
    if (!table) return;

    function updateLabel() {
      var expanded = table.dataset.expanded === "true";
      btn.textContent = expanded ? btn.dataset.collapseLabel : btn.dataset.expandLabel;
    }

    updateLabel();

    btn.addEventListener("click", function () {
      table.dataset.expanded = table.dataset.expanded === "true" ? "false" : "true";
      applyRowVisibility(table);
      updateLabel();
    });
  });
})();
