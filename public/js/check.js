(function () {
  var A = window.Availability;
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function get(file) {
    return fetch("data/" + file, { cache: "no-store" }).then(function (r) { return r.json(); });
  }
  function slot(a) { return A.fmtRange(A.toMin(a.start), A.toMin(a.end)); }

  Promise.all([get("schedule.json"), get("config.json")]).then(function (r) {
    var schedule = r[0], config = r[1];

    var conflicts = A.findConflicts(schedule);
    $("conflicts").innerHTML = conflicts.length
      ? "<table><tr><th>Interpreter</th><th>Day</th><th>Class A</th><th>Class B</th></tr>" +
        conflicts.map(function (c) {
          return "<tr><td>" + esc(c.interpreter) + "</td><td>" + esc(c.day) + "</td><td>" +
            esc(c.a.course) + "<br>" + slot(c.a) + "</td><td>" + esc(c.b.course) + "<br>" + slot(c.b) + "</td></tr>";
        }).join("") + "</table>"
      : "<p>No double-bookings found.</p>";

    var un = schedule.unassigned || [];
    $("unassigned").innerHTML = un.length
      ? "<table><tr><th>Day</th><th>Time</th><th>Course</th></tr>" +
        un.map(function (u) {
          return "<tr><td>" + esc(u.day) + "</td><td>" + slot(u) + "</td><td>" + esc(u.course) + "</td></tr>";
        }).join("") + "</table>"
      : "<p>Every class has an interpreter.</p>";

    var ws = A.toMin(config.workStart), we = A.toMin(config.workEnd);
    var head = "<tr><th>Day</th>" + schedule.interpreters.map(function (n) { return "<th>" + esc(n) + "</th>"; }).join("") + "</tr>";
    var rows = config.workDays.map(function (day) {
      var cells = schedule.interpreters.map(function (name) {
        var busy = A.busyIntervals(name, day, null, schedule, []);
        var w = A.freeWindows(busy, ws, we, config.minGapMinutes || 0);
        return "<td>" + (w.length ? w.map(function (x) { return A.fmtRange(x[0], x[1]); }).join("<br>") : "—") + "</td>";
      }).join("");
      return "<tr><th>" + esc(day) + "</th>" + cells + "</tr>";
    }).join("");
    $("weekly").innerHTML = "<table>" + head + rows + "</table>";
  }).catch(function (e) {
    document.querySelector("main").insertAdjacentHTML("beforeend", '<div class="error">' + esc(e.message) + "</div>");
  });
})();
