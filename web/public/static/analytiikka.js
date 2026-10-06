// Analytiikka's points-race line charts. Two independent datasets, each
// embedded server-side as JSON by analytiikka.ts:
//  - #analytiikka-data: one series per team, grouped by division
//    (_shared/divisionPoints.ts, reconstructed from the always-complete
//    games table).
//  - #pisteporssi-data: one series per top-10 skater
//    (_shared/skaterGameLog.ts, fetched on demand from the NHL API since
//    per-game skater history isn't in D1).
// Both draw with the same drawPointsRaceChart core below -- only the
// endpoint legend differs (a team logo vs. a player's headshot+name). The
// view/division-picker toggles themselves (which section is visible) are
// wired generically in app.js, this only ever draws, never refetches.
//
// X-axis is games played (not calendar date) so every line spans the same
// 0..maxGamesPlayed range regardless of how its schedule happened to fall --
// straight segments between consecutive games, same "points race" convention
// as F1/league standings race charts, so the lines climb up and to the right
// as points accumulate. Each line's legend sits pinned at the line's current
// endpoint instead of a separate list below.
(function () {
  if (typeof d3 === "undefined") return;

  var WIDTH = 720;
  var HEIGHT = 380;

  function drawEmpty(container, message) {
    var empty = document.createElement("p");
    empty.className = "empty-note";
    empty.textContent = message;
    container.appendChild(empty);
  }

  // Endpoint legends are placed at each line's final (gamesPlayed, points).
  // Entities tied on points but far apart in games played sit nowhere near
  // each other on screen, so overlap only matters when a pair is close in
  // BOTH x and y -- comparing y alone pushes a leader's legend down into
  // empty space just because some other entity, many games behind, happened
  // to reach the same points total. Processed in y order (top first) so a
  // push-down can cascade onto a point it now collides with that it didn't
  // originally. The 1e-6 slack matters: after point.y = other.y + minGap,
  // floating-point rounding can leave (point.y - other.y) a hair under
  // minGap, which without it re-collides forever and hangs the page.
  function declutter(endpoints, minGap) {
    var placed = [];
    endpoints
      .slice()
      .sort(function (a, b) {
        return a.y - b.y;
      })
      .forEach(function (point) {
        var collided = true;
        while (collided) {
          collided = false;
          for (var i = 0; i < placed.length; i++) {
            var other = placed[i];
            if (Math.abs(point.x - other.x) < minGap && point.y - other.y < minGap - 1e-6) {
              point.y = other.y + minGap;
              collided = true;
            }
          }
        }
        placed.push(point);
      });
  }

  // entities: [{ id, color, series: [{date, points}], ...whatever
  // options.renderLabel needs }]. options.renderLabel(svg, point) draws
  // that entity's endpoint legend at the already-decluttered point.x/point.y
  // (point.entity is the original entity).
  function drawPointsRaceChart(container, entities, options) {
    var withGames = entities.filter(function (e) {
      return e.series.length > 0;
    });

    if (!withGames.length) {
      drawEmpty(container, options.emptyMessage);
      return;
    }

    var maxGames = d3.max(withGames, function (e) {
      return e.series.length;
    });

    var x = d3
      .scaleLinear()
      .domain([0, maxGames])
      .range([options.margin.left, WIDTH - options.margin.right]);

    var maxPoints = d3.max(withGames, function (e) {
      return d3.max(e.series, function (p) {
        return p.points;
      });
    });

    var y = d3
      .scaleLinear()
      .domain([0, maxPoints || 1])
      .nice()
      .range([HEIGHT - options.margin.bottom, options.margin.top]);

    var line = d3
      .line()
      .x(function (p) {
        return x(p.gamesPlayed);
      })
      .y(function (p) {
        return y(p.points);
      });

    var svg = d3.create("svg").attr("viewBox", [0, 0, WIDTH, HEIGHT]).attr("class", "division-chart-svg");

    // Points are always whole numbers -- .nice() can otherwise pick a domain
    // that spaces default ticks at half-point intervals (0, 0.5, 1, ...), so
    // only the integer ticks are kept.
    var yTicks = y.ticks(5).filter(function (v) {
      return Number.isInteger(v);
    });
    if (!yTicks.length) yTicks = [0, maxPoints || 1];

    svg
      .append("g")
      .attr("class", "chart-axis")
      .attr("transform", "translate(" + options.margin.left + ",0)")
      .call(d3.axisLeft(y).tickValues(yTicks).tickFormat(d3.format("d")));

    svg
      .append("g")
      .attr("class", "chart-axis")
      .attr("transform", "translate(0," + (HEIGHT - options.margin.bottom) + ")")
      .call(
        d3
          .axisBottom(x)
          .ticks(Math.min(maxGames, 10))
          .tickFormat(d3.format("d")),
      );

    var endpoints = withGames.map(function (entity) {
      var seriesWithStart = [{ gamesPlayed: 0, points: 0 }].concat(
        entity.series.map(function (p, i) {
          return { gamesPlayed: i + 1, points: p.points };
        }),
      );

      svg
        .append("path")
        .datum(seriesWithStart)
        .attr("fill", "none")
        .attr("stroke", entity.color)
        .attr("stroke-width", 2)
        .attr("d", line);

      // A small dot on every actual game (not the synthetic 0-games start
      // point) so the line reads as "one point of accumulation per game",
      // not just a smooth trend.
      svg
        .append("g")
        .selectAll("circle")
        .data(
          entity.series.map(function (p, i) {
            return { gamesPlayed: i + 1, points: p.points };
          }),
        )
        .join("circle")
        .attr("r", 3)
        .attr("fill", entity.color)
        .attr("cx", function (p) {
          return x(p.gamesPlayed);
        })
        .attr("cy", function (p) {
          return y(p.points);
        });

      var last = seriesWithStart[seriesWithStart.length - 1];
      return { entity: entity, x: x(last.gamesPlayed), y: y(last.points) };
    });

    declutter(endpoints, options.minGap);

    endpoints.forEach(function (point) {
      options.renderLabel(svg, point);
    });

    container.appendChild(svg.node());
  }

  // ---------- Joukkueet: one chart per division ----------
  (function () {
    var dataEl = document.getElementById("analytiikka-data");
    if (!dataEl) return;

    var divisions = JSON.parse(dataEl.textContent);
    var color = d3.scaleOrdinal(d3.schemeTableau10);
    var LOGO_SIZE = 32;
    // Margins leave room for a logo centered right on the line's endpoint --
    // top/bottom need half a logo's height of breathing room above/below the
    // plotted range, right needs a full logo's width plus the gap after the
    // line, otherwise a team sitting at the very top (highest points) or far
    // right (most games played) gets its logo clipped against the SVG edge.
    var margin = { top: LOGO_SIZE / 2 + 8, right: LOGO_SIZE + 16, bottom: 28 + LOGO_SIZE / 2, left: 32 };

    document.querySelectorAll(".division-chart").forEach(function (container) {
      var divisionName = container.dataset.division;
      var division = divisions.filter(function (d) {
        return d.division === divisionName;
      })[0];
      if (!division) return;

      var entities = division.teams.map(function (team) {
        return { color: color(team.abbrev), series: team.series, team: team };
      });

      drawPointsRaceChart(container, entities, {
        margin: margin,
        minGap: LOGO_SIZE + 4,
        emptyMessage: "Ei vielä pelattuja otteluita tältä kaudelta.",
        renderLabel: function (svg, point) {
          svg
            .append("image")
            .attr("class", "division-chart-endpoint-logo")
            .attr("href", point.entity.team.logo)
            .attr("width", LOGO_SIZE)
            .attr("height", LOGO_SIZE)
            .attr("x", point.x + 4)
            .attr("y", point.y - LOGO_SIZE / 2);
        },
      });
    });
  })();

  // ---------- Pistepörssi: current top-10 skaters, one chart ----------
  (function () {
    var dataEl = document.getElementById("pisteporssi-data");
    if (!dataEl) return;

    var skaters = JSON.parse(dataEl.textContent);
    var color = d3.scaleOrdinal(d3.schemeTableau10);
    var PHOTO_SIZE = 28;
    var BADGE_SIZE = 14;
    // Right margin is wider than the team chart's -- the legend here is a
    // headshot circle plus a name label beside it, not just a square logo.
    var margin = { top: PHOTO_SIZE / 2 + 8, right: 110, bottom: 28 + PHOTO_SIZE / 2, left: 32 };

    var entities = skaters.map(function (skater) {
      return { color: color(skater.playerId), series: skater.series, skater: skater };
    });

    document.querySelectorAll(".skater-chart").forEach(function (container) {
      drawPointsRaceChart(container, entities, {
        margin: margin,
        minGap: PHOTO_SIZE + 6,
        emptyMessage: "Ei vielä tilastoituja otteluita tältä kaudelta.",
        renderLabel: function (svg, point) {
          var skater = point.entity.skater;
          var g = svg
            .append("g")
            .attr("class", "skater-chart-endpoint")
            .attr("transform", "translate(" + (point.x + 4) + "," + (point.y - PHOTO_SIZE / 2) + ")");

          var clipId = "skater-clip-" + skater.playerId;
          g.append("clipPath")
            .attr("id", clipId)
            .append("circle")
            .attr("cx", PHOTO_SIZE / 2)
            .attr("cy", PHOTO_SIZE / 2)
            .attr("r", PHOTO_SIZE / 2);

          g.append("circle")
            .attr("class", "skater-chart-endpoint-photo")
            .attr("cx", PHOTO_SIZE / 2)
            .attr("cy", PHOTO_SIZE / 2)
            .attr("r", PHOTO_SIZE / 2)
            .attr("fill", "var(--border)");

          g.append("image")
            .attr("href", skater.headshot)
            .attr("width", PHOTO_SIZE)
            .attr("height", PHOTO_SIZE)
            .attr("clip-path", "url(#" + clipId + ")");

          // A small team-logo badge overlapping the headshot's bottom-right
          // corner -- fits without widening the legend further, per "ehkä
          // myös logo jos mahtuu järkevästi".
          g.append("circle")
            .attr("class", "skater-chart-endpoint-badge")
            .attr("cx", PHOTO_SIZE - BADGE_SIZE / 2)
            .attr("cy", PHOTO_SIZE - BADGE_SIZE / 2)
            .attr("r", BADGE_SIZE / 2)
            .attr("fill", "var(--card-bg)");
          g.append("image")
            .attr("href", skater.logo)
            .attr("width", BADGE_SIZE - 2)
            .attr("height", BADGE_SIZE - 2)
            .attr("x", PHOTO_SIZE - BADGE_SIZE + 1)
            .attr("y", PHOTO_SIZE - BADGE_SIZE + 1);

          g.append("text")
            .attr("class", "skater-chart-endpoint-name")
            .attr("x", PHOTO_SIZE + 6)
            .attr("y", PHOTO_SIZE / 2)
            .attr("dominant-baseline", "middle")
            .text(skater.name);
        },
      });
    });
  })();
})();
