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

  // Every pill-group filter on the site (day-picker, player card's season/
  // playoffs toggle, team schedule's past/upcoming, Pistepörssi's kaikki
  // pelaajat/rookiet, Analytiikka's division picker) follows the same
  // shape: a row of .day-pill buttons and a set of sections that are
  // already fully rendered server-side, switched with is-hidden rather
  // than refetched. datasetKey is the camelCased data-* attribute (e.g.
  // "date" for data-date, "gameType" for data-game-type) both the pill and
  // its matching section carry.
  function wirePillToggle(pickerSelector, sectionSelector, datasetKey) {
    document.querySelectorAll(pickerSelector).forEach(function (picker) {
      var pills = picker.querySelectorAll(".day-pill");
      var sections = document.querySelectorAll(sectionSelector);

      pills.forEach(function (pill) {
        pill.addEventListener("click", function () {
          pills.forEach(function (p) {
            p.classList.remove("active");
          });
          pill.classList.add("active");
          sections.forEach(function (section) {
            section.classList.toggle("is-hidden", section.dataset[datasetKey] !== pill.dataset[datasetKey]);
          });
        });
      });
    });
  }

  wirePillToggle(".day-picker", ".schedule-day-section", "date");
  wirePillToggle(".season-type-picker", ".season-history-section", "gameType");
  wirePillToggle(".team-games-picker", ".team-games-section", "filter");
  wirePillToggle(".player-filter-picker", ".player-filter-section", "filter");
  wirePillToggle(".division-picker", ".division-chart-section", "division");

  // Player hero card: click (or Enter/Space, since it's a role="button")
  // flips it to reveal the bio back face. The fav-star form sits inside
  // this same element (see [playerId].ts) so its own clicks are excluded
  // here -- otherwise starring a player would also flip the card.
  document.querySelectorAll(".js-player-hero-flip").forEach(function (card) {
    function toggleFlip() {
      var flipped = card.classList.toggle("is-flipped");
      card.setAttribute("aria-pressed", String(flipped));
    }

    card.addEventListener("click", function (event) {
      if (event.target.closest(".hero-fav-form")) return;
      toggleFlip();
    });

    card.addEventListener("keydown", function (event) {
      if (event.target.closest(".hero-fav-form")) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggleFlip();
      }
    });
  });

  // Player card's per-game table rows -- each played game links to its
  // report page, same affordance as the old static site's game-card-trigger
  // (src/morning_hockey/templates/_macros.html's "Näytä ottelun tiedot"
  // hint), just a <tr> instead of a whole card so a full navigation (not an
  // inline expand) makes more sense here.
  document.querySelectorAll(".game-row-link").forEach(function (row) {
    row.addEventListener("click", function () {
      location.href = "/ottelut/" + row.dataset.gameId;
    });
  });

  // Prime time defaults to the next 5 days with games; this reveals the
  // rest in one click. Not table rows (see primetime.ts), so the generic
  // .expand-toggle/data-table-id handler further down doesn't apply here --
  // separate id-based handler instead.
  var primetimeExpand = document.getElementById("primetime-expand");
  if (primetimeExpand) {
    primetimeExpand.addEventListener("click", function () {
      document.querySelectorAll(".primetime-day-group.is-hidden").forEach(function (group) {
        group.classList.remove("is-hidden");
      });
      primetimeExpand.style.display = "none";
    });
  }

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

  // Home-page player search (topbar on mobile, sidebar-header on desktop --
  // see _shared/layout.ts's renderPlayerSearch). Each instance is driven
  // independently; "hideWithSearch" is whichever of the title text/banner
  // images is its own immediate sibling, so opening one instance doesn't
  // touch the other.
  document.querySelectorAll(".player-search").forEach(function (container) {
    var toggleBtn = container.querySelector(".player-search-toggle");
    var input = container.querySelector(".player-search-input");
    var results = container.querySelector(".player-search-results");
    var hideWithSearch = container.parentElement.querySelectorAll(".topbar-title, .sidebar-banner");
    var requestId = 0;

    function setActive(active) {
      container.classList.toggle("active", active);
      toggleBtn.setAttribute("aria-expanded", active ? "true" : "false");
      hideWithSearch.forEach(function (el) {
        el.classList.toggle("is-hidden", active);
      });
      if (active) {
        input.focus();
      } else {
        input.value = "";
        results.innerHTML = "";
      }
    }

    toggleBtn.addEventListener("click", function () {
      setActive(!container.classList.contains("active"));
    });

    input.addEventListener("input", function () {
      var query = input.value.trim();
      if (query.length < 3) {
        results.innerHTML = "";
        return;
      }
      var thisRequest = ++requestId;
      fetch("/haku/pelaajat?q=" + encodeURIComponent(query))
        .then(function (response) {
          return response.text();
        })
        .then(function (html) {
          if (thisRequest !== requestId) return;
          results.innerHTML = html;
        });
    });

    document.addEventListener("click", function (event) {
      if (container.classList.contains("active") && !container.contains(event.target)) {
        setActive(false);
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && container.classList.contains("active")) {
        setActive(false);
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

    // Same 4-layer composite as teamHeroBackgroundStyle() in
    // _shared/format.ts (team "wires" crest + jersey texture, both
    // already team-colored) -- duplicated here in plain JS since this
    // panel is built client-side and app.js has no build step to import
    // the TS helper from. Keep the two in sync if the recipe ever changes.
    function applyTeamHeroBackground(node, abbrev) {
      var wires = "https://assets.nhle.com/logos/nhl/wires/" + abbrev + ".svg";
      var texture = "https://assets.nhle.com/textures/nhl/jersey/png/" + abbrev + ".png";
      node.style.backgroundImage =
        'radial-gradient(50% 100% at 50% 0%, rgba(0,0,0,0) 0%, rgba(0,0,0,0.65) 100%), ' +
        'url("' + wires + '"), ' +
        'linear-gradient(rgba(0,0,0,0) 0%, rgb(0,0,0) 100%), ' +
        'url("' + texture + '")';
      node.style.backgroundSize = "auto, 400px auto, auto, 42px 42px";
      node.style.backgroundPosition = "0% 0%, 50% 50%, 0% 0%, 0% 0%";
      node.style.backgroundRepeat = "repeat, no-repeat, repeat, repeat";
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

      var panel = el("div", "team-detail hero-tinted");
      applyTeamHeroBackground(panel, abbrev);

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

      if (data.youtube_url) {
        var ytLink = document.createElement("a");
        ytLink.className = "game-card-youtube";
        ytLink.href = data.youtube_url;
        ytLink.target = "_blank";
        ytLink.rel = "noopener";
        ytLink.textContent = "▶ Highlightit (YouTube)";
        panel.appendChild(ytLink);
      }

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

  // Position (single-select dropdown) + team/nationality (multi-select
  // checkbox dropdowns) filters all combine with AND logic -- a row has to
  // match every active one. Goalie tables never set data-position on their
  // rows, so the position check is a no-op there. Team/nationality filter
  // values are comma-joined lists of checked values (or "all"): a row
  // matches if its own value is anywhere in that list, so checking several
  // boxes means "any of these", same as a normal multi-select.
  function rowMatchesFilters(row, table) {
    var positionFilter = table.dataset.positionFilter || "all";
    var teamFilter = table.dataset.teamFilter || "all";
    var nationalityFilter = table.dataset.nationalityFilter || "all";

    if (
      positionFilter !== "all" &&
      (positionFilter === "D" ? row.dataset.position !== "D" : row.dataset.position === "D")
    ) {
      return false;
    }
    if (teamFilter !== "all" && teamFilter.split(",").indexOf(row.dataset.team) === -1) return false;
    if (nationalityFilter !== "all" && nationalityFilter.split(",").indexOf(row.dataset.nationality) === -1) {
      return false;
    }
    return true;
  }

  // Incremental "show 25 more" instead of a one-shot "show everything" --
  // table.dataset.visibleCount is how many *matching* rows are currently
  // shown; the expand-toggle button adds another page-size's worth each
  // click until every matching row is visible.
  function applyRowVisibility(table) {
    var visibleCount = parseInt(table.dataset.visibleCount, 10) || 0;
    var rows = table.querySelectorAll("tbody tr");
    var shownCount = 0;
    rows.forEach(function (row) {
      var matches = rowMatchesFilters(row, table);
      var withinLimit = !visibleCount || shownCount < visibleCount;
      row.style.display = matches && withinLimit ? "" : "none";
      if (matches) shownCount++;
    });
    return shownCount;
  }

  function applyRanks(table) {
    var rows = Array.prototype.slice.call(table.querySelectorAll("tbody tr"));
    rows.sort(function (a, b) {
      return parseInt(a.dataset.rank, 10) - parseInt(b.dataset.rank, 10);
    });
    var visible = rows.filter(function (row) {
      return rowMatchesFilters(row, table);
    });

    var rank = 0;
    var prevGoals = null;
    var prevAssists = null;
    var hasPoints = visible.length && visible[0].dataset.goals !== undefined;
    visible.forEach(function (row, i) {
      if (hasPoints) {
        var goals = row.dataset.goals;
        var assists = row.dataset.assists;
        if (i === 0 || goals !== prevGoals || assists !== prevAssists) {
          rank = i + 1;
        }
        prevGoals = goals;
        prevAssists = assists;
      } else {
        rank = i + 1;
      }
      var cell = row.querySelector(".col-rank");
      if (cell) cell.textContent = rank;
    });
  }

  function updateExpandButton(table) {
    var btn = document.querySelector('.expand-toggle[data-table-id="' + table.id + '"]');
    if (!btn) return;
    var totalMatching = Array.prototype.slice
      .call(table.querySelectorAll("tbody tr"))
      .filter(function (row) {
        return rowMatchesFilters(row, table);
      }).length;
    var visibleCount = parseInt(table.dataset.visibleCount, 10) || 0;
    if (visibleCount >= totalMatching) {
      btn.style.display = "none";
    } else {
      btn.style.display = "";
      var remaining = Math.min(parseInt(btn.dataset.pageSize, 10) || 25, totalMatching - visibleCount);
      btn.textContent = "Näytä " + remaining + " lisää (" + visibleCount + "/" + totalMatching + ") →";
    }
  }

  function refreshTable(table) {
    if (table.dataset.visibleCount === undefined) {
      table.dataset.visibleCount = table.dataset.collapseAt || "0";
    }
    applyRowVisibility(table);
    applyRanks(table);
    updateExpandButton(table);
  }

  document.querySelectorAll(".table-filters").forEach(function (group) {
    var table = document.getElementById(group.dataset.tableId);
    if (!table) return;

    refreshTable(table);

    group.querySelectorAll("select[data-filter]").forEach(function (select) {
      select.addEventListener("change", function () {
        table.dataset[select.dataset.filter + "Filter"] = select.value;
        table.dataset.visibleCount = table.dataset.collapseAt;
        refreshTable(table);
      });
    });

    // Multi-select checkbox dropdowns (team/nationality): any number of
    // boxes checked, joined into one comma list for rowMatchesFilters.
    // <details>/<summary> gives the open/close behavior for free -- this
    // only needs to react to the checkboxes inside.
    group.querySelectorAll(".multi-filter").forEach(function (details) {
      var filterKey = details.dataset.filter;
      var summary = details.querySelector("summary");
      var allLabel = summary.dataset.allLabel;
      var checkboxes = details.querySelectorAll('input[type="checkbox"]');

      checkboxes.forEach(function (checkbox) {
        checkbox.addEventListener("change", function () {
          var checked = Array.prototype.slice.call(checkboxes).filter(function (cb) {
            return cb.checked;
          });
          if (!checked.length) {
            summary.textContent = allLabel;
            table.dataset[filterKey + "Filter"] = "all";
          } else {
            summary.textContent = checked.length <= 2
              ? checked.map(function (cb) { return cb.value; }).join(", ")
              : checked.length + " valittu";
            table.dataset[filterKey + "Filter"] = checked.map(function (cb) { return cb.value; }).join(",");
          }
          table.dataset.visibleCount = table.dataset.collapseAt;
          refreshTable(table);
        });
      });
    });
  });

  document.querySelectorAll(".stats-table").forEach(function (table) {
    var tbody = table.querySelector("tbody");
    var headers = table.querySelectorAll("th[data-sort]");
    var activeSort = null;
    var activeDir = null;

    // Tables with their own .table-filters group (Pistepörssi, Maalivahti-
    // pörssi, Rookie-pörssi) already got this from the group loop above --
    // this only needs to initialize the ones without one (team page's
    // always-show-everything roster tables).
    if (!document.querySelector('.table-filters[data-table-id="' + table.id + '"]')) {
      refreshTable(table);
    }

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

    btn.addEventListener("click", function () {
      var pageSize = parseInt(btn.dataset.pageSize, 10) || 25;
      table.dataset.visibleCount = (parseInt(table.dataset.visibleCount, 10) || 0) + pageSize;
      refreshTable(table);
    });
  });

  // Hero-banner favorite star (player/team pages): progressively enhances
  // the plain add/remove form into an instant toggle with no page
  // navigation. redirect: "manual" means the POST's 303 response is never
  // followed (its body/Location are irrelevant here) -- the mutation has
  // already happened server-side by the time the response comes back, so
  // "opaqueredirect" counts as success same as any 2xx would.
  document.querySelectorAll("form[data-fav-toggle]").forEach(function (form) {
    var button = form.querySelector(".hero-fav-star");
    var actionInput = form.querySelector('input[name="fav_action"]');
    if (!button || !actionInput) return;

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (button.disabled) return;
      button.disabled = true;

      var wasFav = actionInput.value === "remove";
      fetch(form.action, { method: "POST", body: new FormData(form), redirect: "manual" })
        .then(function (response) {
          if (response.type !== "opaqueredirect" && !response.ok) throw new Error("fav toggle failed");
          var nowFav = !wasFav;
          actionInput.value = nowFav ? "remove" : "add";
          button.classList.toggle("is-fav", nowFav);
          button.setAttribute("aria-pressed", String(nowFav));
          button.setAttribute("aria-label", nowFav ? "Poista suosikeista" : "Lisää suosikkeihin");
        })
        .catch(function () {
          form.submit();
        })
        .finally(function () {
          button.disabled = false;
        });
    });
  });
})();
