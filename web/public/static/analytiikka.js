// Analytiikka's division points-race chart. Reads the JSON analytiikka.ts
// embeds in #analytiikka-data (already computed server-side -- see
// _shared/divisionPoints.ts) and draws one D3 step-line chart per division
// into its .division-chart container; the division-picker toggle itself
// (which section is visible) is wired generically in app.js, this only
// ever draws, never refetches.
(function () {
  var dataEl = document.getElementById("analytiikka-data");
  if (!dataEl || typeof d3 === "undefined") return;

  var divisions = JSON.parse(dataEl.textContent);
  var color = d3.scaleOrdinal(d3.schemeTableau10);

  var WIDTH = 720;
  var HEIGHT = 380;
  var MARGIN = { top: 16, right: 16, bottom: 28, left: 32 };

  function drawEmpty(container) {
    var empty = document.createElement("p");
    empty.className = "empty-note";
    empty.textContent = "Ei vielä pelattuja otteluita tältä kaudelta.";
    container.appendChild(empty);
  }

  function drawChart(container, division) {
    var teams = division.teams.filter(function (t) {
      return t.series.length > 0;
    });

    if (!teams.length) {
      drawEmpty(container);
      return;
    }

    var allPoints = [];
    teams.forEach(function (t) {
      t.series.forEach(function (p) {
        allPoints.push(new Date(p.date));
      });
    });

    var x = d3
      .scaleTime()
      .domain(d3.extent(allPoints))
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
      .curve(d3.curveStepAfter)
      .x(function (p) {
        return x(new Date(p.date));
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
      .call(d3.axisBottom(x).ticks(6).tickFormat(d3.timeFormat("%-d.%-m.")));

    teams.forEach(function (team) {
      var seriesWithStart = [{ date: team.series[0].date, points: 0 }].concat(team.series);
      svg
        .append("path")
        .datum(seriesWithStart)
        .attr("fill", "none")
        .attr("stroke", color(team.abbrev))
        .attr("stroke-width", 2)
        .attr("d", line);
    });

    container.appendChild(svg.node());

    var legend = document.createElement("div");
    legend.className = "division-chart-legend";

    teams
      .slice()
      .sort(function (a, b) {
        return b.series[b.series.length - 1].points - a.series[a.series.length - 1].points;
      })
      .forEach(function (team) {
        var item = document.createElement("span");
        item.className = "division-chart-legend-item";

        var swatch = document.createElement("span");
        swatch.className = "division-chart-swatch";
        swatch.style.background = color(team.abbrev);

        var logo = document.createElement("img");
        logo.className = "division-chart-legend-logo";
        logo.loading = "lazy";
        logo.alt = "";
        logo.src = team.logo;

        var label = document.createElement("span");
        label.textContent = team.abbrev + " · " + team.series[team.series.length - 1].points + "p";

        item.appendChild(swatch);
        item.appendChild(logo);
        item.appendChild(label);
        legend.appendChild(item);
      });

    container.appendChild(legend);
  }

  document.querySelectorAll(".division-chart").forEach(function (container) {
    var divisionName = container.dataset.division;
    var division = divisions.filter(function (d) {
      return d.division === divisionName;
    })[0];
    if (division) drawChart(container, division);
  });
})();
