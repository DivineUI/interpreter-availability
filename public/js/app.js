(function () {
  var A = window.Availability;
  var data = { schedule: null, overrides: [], config: null };
  var params = new URLSearchParams(location.search);
  var atParam = params.get("at"); // testing aid, e.g. ?at=Monday 09:40
  var clockOffsetMs = 0; // server time minus this device's time

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function getJson(file) {
    return fetch("data/" + file, { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("Could not load " + file);
      return r.json();
    });
  }

  // Ask the web server what time it is (HTTP Date header), so a wrong phone clock does not matter.
  function syncClock() {
    var sent = Date.now();
    return fetch("./", { method: "HEAD", cache: "no-store" }).then(function (r) {
      var header = r.headers.get("Date");
      var received = Date.now();
      if (!header) return;
      var server = new Date(header).getTime();
      if (isNaN(server)) return;
      // Assume the reply took half the round trip to arrive.
      clockOffsetMs = server - (sent + (received - sent) / 2);
    }).catch(function () { /* keep the device clock */ });
  }

  function loadAll() {
    return Promise.all([getJson("schedule.json"), getJson("overrides.json"), getJson("config.json")]).then(function (r) {
      data.schedule = r[0];
      data.overrides = r[1].overrides || [];
      data.config = r[2];
    });
  }

  function barHtml(status, now, config) {
    var ws = A.toMin(config.workStart);
    var we = A.toMin(config.workEnd);
    var total = we - ws;
    var segs = status.busy.map(function (iv) {
      var left = ((iv[0] - ws) / total) * 100;
      var width = ((iv[1] - iv[0]) / total) * 100;
      return '<div class="seg" style="left:' + left.toFixed(2) + "%;width:" + width.toFixed(2) + '%"></div>';
    }).join("");
    // Short gaps are not "free", so paint them as busy too.
    var shortGaps = "";
    var cursor = ws;
    status.busy.concat([[we, we]]).forEach(function (iv) {
      if (iv[0] > cursor && iv[0] - cursor < (config.minGapMinutes || 0)) {
        shortGaps += '<div class="seg" style="left:' + (((cursor - ws) / total) * 100).toFixed(2) +
          "%;width:" + (((iv[0] - cursor) / total) * 100).toFixed(2) + '%"></div>';
      }
      cursor = Math.max(cursor, iv[1]);
    });
    var marker = "";
    if (now.minutes >= ws && now.minutes <= we && config.workDays.indexOf(now.day) !== -1) {
      marker = '<div class="now" style="left:calc(' + (((now.minutes - ws) / total) * 100).toFixed(2) + '% - 1px)"></div>';
    }
    return '<div class="bar" aria-hidden="true">' + segs + shortGaps + marker + "</div>" +
      '<div class="scale"><span>' + A.fmt(ws) + "</span><span>" + A.fmt(Math.round((ws + we) / 2)) + "</span><span>" + A.fmt(we) + "</span></div>";
  }

  function windowsText(list) {
    return list.map(function (w) { return A.fmtRange(w[0], w[1]); }).join(" · ");
  }

  function card(status, now, config) {
    var we = A.toMin(config.workEnd);
    var pill, line, later = "";

    if (status.state === "free") {
      pill = '<span class="pill free">Free now</span>';
      var until = status.current[1] === we ? A.fmt(we) + " (end of day)" : A.fmt(status.current[1]);
      line = "<strong>" + esc(status.name) + "</strong> is free now, until <strong>" + until + "</strong>";
      if (status.later.length) later = "Free again: " + windowsText(status.later);
    } else if (status.state === "busy") {
      pill = '<span class="pill busy">Not available</span>';
      if (status.next) {
        line = "<strong>" + esc(status.name) + "</strong> is not available, but will be free <strong>" + A.fmtRange(status.next[0], status.next[1]) + "</strong>";
        if (status.later.length) later = "Then: " + windowsText(status.later);
      } else {
        line = "<strong>" + esc(status.name) + "</strong> is not available and is not free again today";
      }
    } else if (status.state === "before") {
      pill = '<span class="pill before">Not started</span>';
      line = "<strong>" + esc(status.name) + "</strong> — service starts at " + A.fmt(A.toMin(config.workStart));
      if (status.later.length) later = "Free today: " + windowsText(status.later);
    } else {
      pill = '<span class="pill off">Off duty</span>';
      line = "<strong>" + esc(status.name) + "</strong> is off duty";
    }

    return '<article class="card"><div class="row"><span class="name">' + esc(status.name) + "</span>" + pill + "</div>" +
      '<p class="line">' + line + "</p>" + barHtml(status, now, config) +
      (later ? '<div class="later">' + later + "</div>" : "") + "</article>";
  }

  var ORDER = { free: 0, busy: 1, before: 2, off: 3 };

  function render() {
    var config = data.config;
    var now = A.nowIn(config.timezone, atParam, clockOffsetMs);
    var statuses = A.allStatuses(now, data.schedule, data.overrides, config);

    statuses.sort(function (a, b) {
      if (ORDER[a.state] !== ORDER[b.state]) return ORDER[a.state] - ORDER[b.state];
      if (a.state === "busy") {
        var an = a.next ? a.next[0] : 9999;
        var bn = b.next ? b.next[0] : 9999;
        if (an !== bn) return an - bn;
      }
      return a.name.localeCompare(b.name);
    });

    $("title").textContent = config.title;
    $("mingap").textContent = config.minGapMinutes;
    $("clock").textContent = now.day + ", " + A.fmt(now.minutes) + (atParam ? "  (test time)" : "");

    var banner = $("banner");
    var isWorkDay = config.workDays.indexOf(now.day) !== -1;
    var ws = A.toMin(config.workStart), we = A.toMin(config.workEnd);
    if (!isWorkDay) {
      banner.hidden = false;
      banner.textContent = "No service today. Hours: " + config.workDays[0] + " to " + config.workDays[config.workDays.length - 1] + ", " + A.fmt(ws) + " - " + A.fmt(we) + ".";
    } else if (now.minutes >= we) {
      banner.hidden = false;
      banner.textContent = "Service has ended for today (" + A.fmt(ws) + " - " + A.fmt(we) + ").";
    } else if (now.minutes < ws) {
      banner.hidden = false;
      banner.textContent = "Service has not started yet. Hours: " + A.fmt(ws) + " - " + A.fmt(we) + ".";
    } else {
      banner.hidden = true;
    }

    var freeCount = statuses.filter(function (s) { return s.state === "free"; }).length;
    $("summary").innerHTML =
      '<span class="chip ' + (freeCount ? "free" : "") + '">' + freeCount + " of " + statuses.length + " free now</span>";

    $("cards").innerHTML = statuses.map(function (s) { return card(s, now, config); }).join("");
  }

  function showError(err) {
    $("cards").innerHTML = '<div class="error">' + esc(err.message || err) + "</div>";
  }

  Promise.all([loadAll(), syncClock()]).then(function () {
    render();
    var every = (data.config.refreshSeconds || 30) * 1000;
    setInterval(render, every);
    // Pick up edits to overrides.json / schedule.json without a manual reload.
    setInterval(function () { Promise.all([loadAll(), syncClock()]).then(render).catch(function () {}); }, 5 * 60 * 1000);
  }).catch(showError);
})();
