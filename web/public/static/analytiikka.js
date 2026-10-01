// Analytiikka's division points-race chart. Reads the JSON analytiikka.ts
// embeds in #analytiikka-data (already computed server-side -- see
// _shared/divisionPoints.ts) and draws one D3 line chart per division into
// its .division-chart container; the division-picker toggle itself (which
// section is visible) is wired generically in app.js, this only ever draws,
// never refetches.
//
// X-axis is games played (not calendar date) so every team's line spans the
// same 0..maxGamesPlayed range regardless of how its schedule happened to
// fall -- straight segments between consecutive games, same "points race"
// convention as F1/league standings race charts, so the lines climb up and
// to the right as points accumulate. Each line's legend is its team logo
// pinned at the line's current endpoint instead of a separate list below.
(function () {
  var dataEl = document.getElementById("analytiikka-data");
  if (!dataEl || typeof d3 === "undefined") return;

  var divisions = JSON.parse(dataEl.textContent);
  var color = d3.scaleOrdinal(d3.schemeTableau10);

  var WIDTH = 720;
  var HEIGHT = 380;
  var MARGIN = { top: 16, right: 40, bottom: 28, left: 32 };
  var LOGO_SIZE = 20;

  function drawEmpty(container) {
    var empty = document.createElement("p");
    empty.className = "empty-note";
    empty.textContent = "Ei vielä pelattuja otteluita tältä kaudelta.";
    container.appendChild(empty);
  }

  // Endpoint logos are placed at each line's final (gamesPlayed, points), but
  // teams tied on points would otherwise draw logos on top of each other --
  // one forward pass nudges later (in sort order) logos down just enough to
  // keep them readable.
  function declutter(endpoints, minGap) {
    endpoints
      .slice()
      .sort(function (a, b) {
        return a.y - b.y;
      })
      .forEach(function (point, i, sorted) {
        if (i === 0) return;
        var prev = sorted[i - 1];
        if (point.y - prev.y < minGap) point.y = prev.y + minGap;
      });
  }

  function drawChart(container, division) {
    var teams = division.teams.filter(function (t) {
      return t.series.length > 0;
    });

    if (!teams.length) {
      drawEmpty(container);
      return;
    }

    var maxGames = d3.max(teams, function (t) {
      return t.series.length;
    });

    var x = d3
      .scaleLinear()
      .domain([0, maxGames])
      .range([MARGIN.left, WIDTH - MARGIN.right]);

    var maxPoints = d3.max(teams, function (t) {
      return d3.max(t.series, function (p) {
        return p.points;
      });
    });

    var y = d3
      .scaleLinear()
      .domain([0, maxPoints || 1])
      .nice()
      .range([HEIGHT - MARGIN.bottom, MARGIN.top]);

    var line = d3
      .line()
      .x(function (p) {
        return x(p.gamesPlayed);
      })
      .y(function (p) {
        return y(p.points);
      });

    var svg = d3.create("svg").attr("viewBox", [0, 0, WIDTH, HEIGHT]).attr("class", "division-chart-svg");

    svg
      .append("g")
      .attr("class", "chart-axis")
      .attr("transform", "translate(" + MARGIN.left + ",0)")
      .call(d3.axisLeft(y).ticks(5));

    svg
      .append("g")
      .attr("class", "chart-axis")
      .attr("transform", "translate(0," + (HEIGHT - MARGIN.bottom) + ")")
      .call(
        d3
          .axisBottom(x)
          .ticks(Math.min(maxGames, 10))
          .tickFormat(d3.format("d")),
      );

    var endpoints = teams.map(function (team) {
      var seriesWithStart = [{ gamesPlayed: 0, points: 0 }].concat(
        team.series.map(function (p, i) {
          return { gamesPlayed: i + 1, points: p.points };
        }),
      );

      svg
        .append("path")
        .datum(seriesWithStart)
        .attr("fill", "none")
        .attr("stroke", color(team.abbrev))
        .attr("stroke-width", 2)
        .attr("d", line);

      var last = seriesWithStart[seriesWithStart.length - 1];
      return { team: team, x: x(last.gamesPlayed), y: y(last.points) };
    });

    declutter(endpoints, LOGO_SIZE + 2);

    endpoints.forEach(function (point) {
      svg
        .append("image")
        .attr("class", "division-chart-endpoint-logo")
        .attr("href", point.team.logo)
        .attr("width", LOGO_SIZE)
        .attr("height", LOGO_SIZE)
        .attr("x", point.x + 4)
        .attr("y", point.y - LOGO_SIZE / 2);
    });

    container.appendChild(svg.node());
  }

  document.querySelectorAll(".division-chart").forEach(function (container) {
    var divisionName = container.dataset.division;
    var division = divisions.filter(function (d) {
      return d.division === divisionName;
    })[0];
    if (division) drawChart(container, division);
  });
})();
