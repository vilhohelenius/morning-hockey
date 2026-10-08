(function () {
    // Kept in sync by hand with functions/_shared/teamColors.ts -- this
    // project has no build step, so app.js can't import the .ts module and
    // duplicates the map instead.
    var TEAM_COLORS = {
      ANA: "#F47A38", BOS: "#FFB81C", BUF: "#002654", CAR: "#CC0000", CBJ: "#002654",
      CGY: "#D2001C", CHI: "#CF0A2C", COL: "#6F263D", DAL: "#006847", DET: "#CE1126",
      EDM: "#FF4C00", FLA: "#C8102E", LAK: "#A2AAAD", MIN: "#154734", MTL: "#AF1E2D",
      NJD: "#CE1126", NSH: "#FFB81C", NYI: "#00539B", NYR: "#0038A8", OTT: "#C52032",
      PHI: "#F74902", PIT: "#FCB514", SEA: "#99D9D9", SJS: "#006D75", STL: "#002F87",
      TBL: "#002868", TOR: "#00205B", UTA: "#71AFE5", VAN: "#00205B", VGK: "#B4975A",
      WPG: "#041E42", WSH: "#C8102E",
    };

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
  // shape: a row of pill/segment buttons and a set of sections that are
  // already fully rendered server-side, switched with is-hidden rather
  // than refetched. datasetKey is the camelCased data-* attribute (e.g.
  // "date" for data-date, "gameType" for data-game-type) both the pill and
  // its matching section carry. pillSelector defaults to the usual
  // .day-pill row but can be overridden (e.g. the game preview's
  // .toggle-segment away/home switch, styled like Asetukset's toggles).
  function wirePillToggle(pickerSelector, sectionSelector, datasetKey, pillSelector) {
    document.querySelectorAll(pickerSelector).forEach(function (picker) {
      var pills = picker.querySelectorAll(pillSelector || ".day-pill");
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
  wirePillToggle(".analytiikka-view-picker", ".analytiikka-view-section", "view");
  wirePillToggle(".sarjataulukko-view-picker", ".sarjataulukko-view-section", "view");
  wirePillToggle(".standings-tab-picker", ".standings-tab-section", "tab", ".standings-tab");
  wirePillToggle(".roster-team-picker", ".roster-team-section", "team", ".toggle-segment");

  // Dashboard day browser: yesterday..+3 days panels are all rendered
  // server-side (index.ts), so the arrows just switch which one is visible.
  // The links keep real ?pv= hrefs as the no-JS fallback; history.replaceState
  // keeps the URL in sync so the refresh button reloads the same day.
  var DAY_MIN = -1, DAY_MAX = 3;
  var dayNav = document.getElementById("day-nav");
  if (dayNav) {
    var dayOffset = parseInt(dayNav.getAttribute("data-offset") || "0", 10);
    var dayTitleEl = document.getElementById("day-title");
    var dayPanels = document.querySelectorAll(".day-panel");
    var dayButtons = dayNav.querySelectorAll(".day-nav-btn");

    var showDay = function (offset) {
      dayOffset = offset;
      dayPanels.forEach(function (panel) {
        var active = parseInt(panel.getAttribute("data-offset"), 10) === offset;
        panel.hidden = !active;
        if (active && dayTitleEl) dayTitleEl.innerHTML = panel.getAttribute("data-title");
      });
      dayButtons.forEach(function (btn) {
        var target = offset + parseInt(btn.getAttribute("data-dir"), 10);
        var disabled = target < DAY_MIN || target > DAY_MAX;
        btn.classList.toggle("is-disabled", disabled);
        if (disabled) {
          btn.setAttribute("aria-disabled", "true");
          btn.removeAttribute("href");
        } else {
          btn.removeAttribute("aria-disabled");
          btn.setAttribute("href", target === 0 ? "/" : "/?pv=" + target);
        }
      });
      try {
        history.replaceState(null, "", offset === 0 ? "/" : "/?pv=" + offset);
      } catch (e) {}
    };

    dayButtons.forEach(function (btn) {
      btn.addEventListener("click", function (event) {
        event.preventDefault();
        var target = dayOffset + parseInt(btn.getAttribute("data-dir"), 10);
        if (target >= DAY_MIN && target <= DAY_MAX) showDay(target);
      });
    });

    // The home page is served from the browser cache (Cache-Control: private,
    // max-age=ttl, Vary: Cookie), and back/forward may restore it from bfcache
    // or from an expired cache entry. Reload when it is older than its ttl or
    // the mh_v version cookie (bumped by every settings/favorites POST) has
    // changed since it was rendered. The refresh button is location.reload().
    var cookieVer = function () {
      var m = document.cookie.match(/(?:^|;\s*)mh_v=([^;]*)/);
      return m ? decodeURIComponent(m[1]) : "";
    };
    var checkHomeFreshness = function () {
      var rendered = parseInt(dayNav.getAttribute("data-rendered") || "0", 10);
      var ttl = parseInt(dayNav.getAttribute("data-ttl") || "0", 10);
      if (!rendered || !ttl) return;
      if (Date.now() - rendered > ttl * 1000 || cookieVer() !== (dayNav.getAttribute("data-ver") || "")) {
        // Guard against reload loops (e.g. a badly skewed client clock).
        try {
          var last = parseInt(sessionStorage.getItem("homeFreshReloadAt") || "0", 10);
          if (Date.now() - last < 15000) return;
          sessionStorage.setItem("homeFreshReloadAt", String(Date.now()));
        } catch (e) {}
        location.reload();
      }
    };
    window.addEventListener("pageshow", function (event) {
      if (event.persisted) checkHomeFreshness();
    });
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") checkHomeFreshness();
    });
    checkHomeFreshness();
  }

  // Sarjataulukko tabs: remember the last selected tab (storage may be
  // unavailable/blocked, so every access is guarded; default stays Divisioona).
  document.querySelectorAll(".standings-tab-picker").forEach(function (picker) {
    var tabs = picker.querySelectorAll(".standings-tab");
    try {
      var saved = localStorage.getItem("standingsTab");
      tabs.forEach(function (tab) {
        if (saved && tab.dataset.tab === saved && !tab.classList.contains("active")) tab.click();
      });
    } catch (e) {}
    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        try {
          localStorage.setItem("standingsTab", tab.dataset.tab);
        } catch (e) {}
      });
    });
  });

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

  // Names carry an emoji FI flag from the server; show it as the SVG flag instead.
  function elFlags(tag, className, text) {
    var node = el(tag, className);
    text.split("\uD83C\uDDEB\uD83C\uDDEE").forEach(function (part, i) {
      if (i) {
        var img = document.createElement("img");
        img.src = "/static/flags/fi.svg";
        img.alt = "";
        img.className = "flag-img";
        node.appendChild(img);
      }
      node.appendChild(document.createTextNode(part));
    });
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

    // Same recipe as teamHeroBackgroundStyle() in _shared/format.ts (own
    // dotted jersey texture on the team color) -- duplicated since app.js
    // has no build step. Keep the two in sync.
    function applyTeamHeroBackground(node, abbrev) {
      var dots = "radial-gradient(circle, rgba(0,0,0,0.28) 1.6px, transparent 2.2px)";
      node.style.backgroundColor = TEAM_COLORS[abbrev] || "#444444";
      node.style.backgroundImage = dots + ", " + dots + ", linear-gradient(rgba(0,0,0,0.38), rgba(0,0,0,0.38))";
      node.style.backgroundSize = "10px 10px, 10px 10px, auto";
      node.style.backgroundPosition = "0 0, 5px 5px, 0 0";
      node.style.backgroundRepeat = "repeat, repeat, no-repeat";
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
      closeBtn.innerHTML = '<svg class="ic" aria-hidden="true"><use href="/static/icons.svg#i-close"></use></svg>';
      closeBtn.addEventListener("click", closeDetail);
      header.appendChild(closeBtn);
      panel.appendChild(header);

      var body = el("div", "team-detail-body");
      body.appendChild(renderResults(data.recent_results || []));
      body.appendChild(renderScorers(data.top_scorers || []));
      body.appendChild(renderGoalie(data.starting_goalie));
      body.appendChild(renderNextGame(data.next_game));
      panel.appendChild(body);

      var row = trigger.closest(".division-row, .stand-row");
      if (row.tagName === "TR") {
        // Table rows can't be followed by a bare div: wrap the panel in a
        // full-width row. The cell keeps the panel pinned to the visible
        // (non-scrolled) edge of the horizontally scrolling table.
        var wrapRow = document.createElement("tr");
        wrapRow.className = "stand-detail-row";
        var wrapCell = document.createElement("td");
        wrapCell.colSpan = row.children.length;
        wrapCell.appendChild(panel);
        wrapRow.appendChild(wrapCell);
        row.insertAdjacentElement("afterend", wrapRow);
        panel = wrapRow;
      } else {
        row.insertAdjacentElement("afterend", panel);
      }

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

    // "Ottelun kulku" timeline. Mirrors functions/_shared/matchTimeline.ts
    // (server render on /ottelut/[id]); the server already grouped goals +
    // penalties into periods (buildTimeline), so this only renders.
    // Static, trusted SVG markup only -- all data goes in via textContent/href.
    function mtLogo(abbrev) {
      var img = el("img", "mt-logo");
      img.src = "https://assets.nhle.com/logos/nhl/svg/" + abbrev + "_light.svg";
      img.alt = abbrev;
      img.loading = "lazy";
      return img;
    }
    var MT_STRENGTH = { YV: "YV", AV: "AV" };

    function timelineEvent(event, awayAbbrev) {
      var isGoal = event.kind === "goal";
      var isGoalie = event.kind === "goalie";
      var item = isGoal ? event.goal : isGoalie ? event.change : event.penalty;
      var side = item.team_abbrev === awayAbbrev ? "away" : "home";
      var row = el("div", "mt-event mt-" + side + (isGoal ? " mt-goal" : isGoalie ? " mt-goalie" : " mt-penalty"));
      var main = el("div", "mt-main");
      // Shootout attempts carry no meaningful clock time.
      if (!(item.period >= 100)) main.appendChild(el("span", "mt-time", item.time_in_period));
      var who = el("span", "mt-who");

      if (isGoal) {
        var pill = el("span", "mt-pill");
        pill.appendChild(mtLogo(item.team_abbrev));
        pill.appendChild(el("span", "mt-pill-score", item.away_score + " - " + item.home_score));
        main.appendChild(pill);
        who.appendChild(elFlags("strong", null, item.scorer_short || item.scorer));
        if (item.strength) who.appendChild(el("span", "mt-strength mt-strength-tag", MT_STRENGTH[item.strength] || item.strength));
        var col = el("div", "mt-col");
        col.appendChild(who);
        var assists = item.assists_short || item.assists || [];
        if (assists.length) col.appendChild(elFlags("p", "mt-assists", assists.join(" · ")));
        main.appendChild(col);
        row.appendChild(main);
      } else if (isGoalie) {
        var swap = el("span", "mt-badge mt-swap");
        swap.title = "Maalivahdinvaihto";
        swap.setAttribute("aria-label", "Maalivahdinvaihto");
        swap.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M6.99 11 3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3L21 9z"/></svg>';
        main.appendChild(swap);
        who.appendChild(elFlags("strong", null, item.goalie_in));
        who.appendChild(elFlags("span", "mt-reason", " sisään, " + item.goalie_out + " ulos"));
        main.appendChild(who);
        row.appendChild(main);
      } else {
        main.appendChild(el("span", "mt-badge", item.minutes > 0 ? String(item.minutes) : "RL"));
        who.appendChild(elFlags("strong", null, item.player || item.team_abbrev));
        if (item.reason) who.appendChild(el("span", "mt-reason", "(" + item.reason + ")"));
        main.appendChild(who);
        row.appendChild(main);
      }
      return row;
    }

    function shootoutEvent(attempt, awayAbbrev) {
      var side = attempt.team_abbrev === awayAbbrev ? "away" : "home";
      var row = el("div", "mt-event mt-" + side + " mt-so mt-so-" + attempt.result);
      var main = el("div", "mt-main");
      main.appendChild(el("span", "mt-time", attempt.sequence + "."));
      if (attempt.result === "goal") {
        var pill = el("span", "mt-pill");
        pill.appendChild(mtLogo(attempt.team_abbrev));
        pill.appendChild(el("span", "mt-pill-score", attempt.away_score + " - " + attempt.home_score));
        main.appendChild(pill);
      } else {
        main.appendChild(el("span", "mt-so-miss", attempt.result === "save" ? "Torjuttu" : "Ohi"));
      }
      var who = el("span", "mt-who");
      who.appendChild(elFlags("strong", null, attempt.player));
      main.appendChild(who);
      row.appendChild(main);
      return row;
    }

    function renderTimeline(periods, awayAbbrev) {
      var wrap = section("Ottelun kulku");
      if (!periods.length) {
        wrap.appendChild(el("p", "tp-empty", "Ei maaleja eikä jäähyjä."));
        return wrap;
      }
      var list = el("div", "mt");
      periods.forEach(function (period) {
        var band = el("div", "mt-band");
        band.appendChild(el("span", null, period.label));
        band.appendChild(el("span", "mt-band-score", period.away_goals + " - " + period.home_goals));
        list.appendChild(band);
        period.events.forEach(function (event) {
          list.appendChild(timelineEvent(event, awayAbbrev));
        });
        (period.shootout || []).forEach(function (attempt) {
          list.appendChild(shootoutEvent(attempt, awayAbbrev));
        });
      });
      wrap.appendChild(list);
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
      var awayColor = TEAM_COLORS[awayAbbrev] || "var(--accent)";
      var homeColor = TEAM_COLORS[homeAbbrev] || "color-mix(in srgb, var(--accent) 45%, transparent)";
      var HIDDEN_STATS = ["Torjuntaprosentti", "Aloitusprosentti", "Taklaukset", "Blokatut", "Kiekon menetykset", "Kiekon riistot", "xGF%"];
      stats.forEach(function (stat) {
        if (HIDDEN_STATS.some(function (label) { return stat.label.indexOf(label) === 0; })) return;
        var block = el("div", "gd-stat-block");
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
        block.appendChild(row);

        if (stat.away_pct !== undefined && stat.home_pct !== undefined) {
          var bar = el("div", "pts-bar");
          var awayBar = el("span", "pts-bar-away");
          awayBar.style.width = stat.away_pct + "%";
          awayBar.style.background = awayColor;
          var homeBar = el("span", "pts-bar-home");
          homeBar.style.width = stat.home_pct + "%";
          homeBar.style.background = homeColor;
          bar.appendChild(awayBar);
          bar.appendChild(homeBar);
          block.appendChild(bar);
        }

        wrap.appendChild(block);
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
      closeBtn.innerHTML = '<svg class="ic" aria-hidden="true"><use href="/static/icons.svg#i-close"></use></svg>';
      closeBtn.addEventListener("click", closeGameDetail);
      header.appendChild(closeBtn);
      panel.appendChild(header);

      var fullLink = document.createElement("a");
      fullLink.className = "archive-link game-detail-full";
      fullLink.href = "/ottelut/" + trigger.dataset.gameId;
      fullLink.textContent = "Koko ottelun tilastot →";
      panel.appendChild(fullLink);

      var body = el("div", "team-detail-body");
      body.appendChild(renderTimeline(data.timeline || [], awayAbbrev));
      var statRows = (data.team_stats || []).slice();
      var goalsAway = 0;
      var goalsHome = 0;
      (data.timeline || []).forEach(function (period) {
        goalsAway += period.away_goals || 0;
        goalsHome += period.home_goals || 0;
      });
      if ((data.timeline || []).length) {
        var goalRow = { label: "Maalit", away_value: String(goalsAway), home_value: String(goalsHome) };
        if (goalsAway + goalsHome > 0) {
          goalRow.away_pct = (100 * goalsAway) / (goalsAway + goalsHome);
          goalRow.home_pct = (100 * goalsHome) / (goalsAway + goalsHome);
        }
        statRows.unshift(goalRow);
      }
      body.appendChild(renderTeamStats(statRows, awayAbbrev, homeAbbrev));
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
    // A column sort (not the default "rank" one) numbers rows in the
    // current DOM order, ties = equal sort value; otherwise by data-rank.
    var sortKey = table.dataset.sortKey;
    var byColumn = sortKey && sortKey !== "rank";
    if (!byColumn) {
      rows.sort(function (a, b) {
        return parseInt(a.dataset.rank, 10) - parseInt(b.dataset.rank, 10);
      });
    }
    var visible = rows.filter(function (row) {
      return rowMatchesFilters(row, table);
    });

    // Column sorts rank by value in the column's "good" direction (best =
    // 1), whatever order the rows are shown in -- so worst-to-best shows
    // N..1, like the default column. Text columns just number by position.
    var colRanks = new Map();
    if (byColumn) {
      var th = table.querySelector('th[data-sort="' + sortKey + '"]');
      var isText = th && th.dataset.type === "text";
      var asc = th && th.dataset.firstDir === "asc";
      var ordered = isText ? visible : visible.slice().sort(function (a, b) {
        var av = parseFloat(a.dataset[sortKey]);
        var bv = parseFloat(b.dataset[sortKey]);
        return asc ? av - bv : bv - av;
      });
      ordered.forEach(function (row, i) {
        var same = i > 0 && !isText && ordered[i - 1].dataset[sortKey] === row.dataset[sortKey];
        colRanks.set(row, same ? colRanks.get(ordered[i - 1]) : i + 1);
      });
    }

    var rank = 0;
    var prevGoals = null;
    var prevAssists = null;
    var hasPoints = !byColumn && visible.length && visible[0].dataset.goals !== undefined && visible[0].dataset.assists !== undefined;
    visible.forEach(function (row, i) {
      if (byColumn) {
        rank = colRanks.get(row);
      } else if (hasPoints) {
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
        table.dataset.sortKey = key;

        applyRowVisibility(table);
        applyRanks(table);
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

// Logos swapped to *_dark.svg via CSS `content: url()` (style.css "Logo dark
// fix") don't paint while the <img> is loading="lazy" until a scroll forces
// a re-layout, so make those few eager.
document.querySelectorAll('img[src$="/TBL_light.svg"],img[src$="/TOR_light.svg"],img[src$="/NSH_light.svg"]').forEach(function (img) {
  img.loading = "eager";
});

// Keep the tapped tab/pill centred in its horizontally scrolling row.
document.addEventListener("click", function (e) {
  var tab = e.target.closest && e.target.closest(".standings-tab, .day-pill");
  if (tab && tab.parentElement.scrollWidth > tab.parentElement.clientWidth) {
    tab.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }
});
