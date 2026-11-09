/*
 * Availability engine.
 * Works in the browser (window.Availability) and in Node (require) so it can be tested.
 *
 * Rule: free time = working hours minus class slots minus one-off overrides.
 * Gaps shorter than `minGapMinutes` are ignored (treated as busy).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Availability = factory();
})(typeof self !== "undefined" ? self : this, function () {
  var WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  function toMin(hhmm) {
    var p = String(hhmm).split(":");
    return Number(p[0]) * 60 + Number(p[1] || 0);
  }

  function fmt(min) {
    var h = Math.floor(min / 60);
    var m = min % 60;
    var ap = h >= 12 ? "PM" : "AM";
    var h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + ":" + (m < 10 ? "0" : "") + m + " " + ap;
  }

  function fmtRange(a, b) {
    return fmt(a) + " - " + fmt(b);
  }

  /** Current time in the configured timezone -> { day, date, minutes } */
  function nowIn(timezone, at, offsetMs) {
    if (at) return parseAt(at);
    var parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      weekday: "long",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).formatToParts(new Date(Date.now() + (offsetMs || 0)));
    var get = function (t) {
      return parts.filter(function (p) { return p.type === t; })[0].value;
    };
    var hour = Number(get("hour")) % 24;
    return {
      day: get("weekday"),
      date: get("year") + "-" + get("month") + "-" + get("day"),
      minutes: hour * 60 + Number(get("minute"))
    };
  }

  /** Test helper: "2026-11-09T09:40" or "Monday 09:40" */
  function parseAt(text) {
    var iso = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})$/.exec(text);
    if (iso) {
      var dow = new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3])).getUTCDay();
      return {
        day: WEEKDAYS[dow],
        date: iso[1] + "-" + iso[2] + "-" + iso[3],
        minutes: +iso[4] * 60 + +iso[5]
      };
    }
    var named = /^([A-Za-z]+)[ T](\d{1,2}):(\d{2})$/.exec(text);
    if (named) {
      var day = WEEKDAYS.filter(function (d) {
        return d.toLowerCase().indexOf(named[1].toLowerCase()) === 0;
      })[0];
      if (day) return { day: day, date: null, minutes: +named[2] * 60 + +named[3] };
    }
    throw new Error("Bad 'at' value: " + text);
  }

  /** Busy intervals [start,end] (minutes) for one person on one day. */
  function busyIntervals(name, day, date, schedule, overrides) {
    var list = [];
    schedule.assignments.forEach(function (a) {
      if (a.interpreter === name && a.day === day) list.push([toMin(a.start), toMin(a.end)]);
    });
    (overrides || []).forEach(function (o) {
      if (o.interpreter === name && date && o.date === date) {
        list.push([o.start ? toMin(o.start) : 0, o.end ? toMin(o.end) : 24 * 60]);
      }
    });
    return list;
  }

  function mergeIntervals(list) {
    var sorted = list.slice().sort(function (a, b) { return a[0] - b[0]; });
    var out = [];
    sorted.forEach(function (iv) {
      var last = out[out.length - 1];
      if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
      else out.push([iv[0], iv[1]]);
    });
    return out;
  }

  /** Free windows inside [workStart, workEnd], dropping gaps shorter than minGap. */
  function freeWindows(busy, workStart, workEnd, minGap) {
    var merged = mergeIntervals(busy);
    var windows = [];
    var cursor = workStart;
    merged.forEach(function (iv) {
      if (iv[0] > cursor) windows.push([cursor, Math.min(iv[0], workEnd)]);
      cursor = Math.max(cursor, iv[1]);
    });
    if (cursor < workEnd) windows.push([cursor, workEnd]);
    return windows.filter(function (w) {
      return w[1] > w[0] && w[1] - w[0] >= minGap;
    });
  }

  /**
   * Status of one person right now.
   * state: free | busy | before | off
   *   free   - inside a free window; `current` = that window, `later` = later windows
   *   busy   - not free; `next` = next window (or null), `later` = windows after that
   *   before - weekday but before opening; `later` = all windows today
   *   off    - weekend or after closing
   */
  function statusFor(name, now, schedule, overrides, config) {
    var ws = toMin(config.workStart);
    var we = toMin(config.workEnd);
    var minGap = config.minGapMinutes || 0;
    var isWorkDay = config.workDays.indexOf(now.day) !== -1;
    var busy = busyIntervals(name, now.day, now.date, schedule, overrides);
    var windows = isWorkDay ? freeWindows(busy, ws, we, minGap) : [];
    var merged = mergeIntervals(busy).map(function (iv) {
      return [Math.max(iv[0], ws), Math.min(iv[1], we)];
    }).filter(function (iv) { return iv[1] > iv[0]; });

    var result = { name: name, windows: windows, busy: merged, state: "off", current: null, next: null, later: [] };
    if (!isWorkDay || now.minutes >= we) return result;
    if (now.minutes < ws) {
      result.state = "before";
      result.later = windows;
      return result;
    }
    var currentIndex = -1;
    windows.forEach(function (w, i) {
      if (now.minutes >= w[0] && now.minutes < w[1]) currentIndex = i;
    });
    if (currentIndex !== -1) {
      result.state = "free";
      result.current = windows[currentIndex];
      result.later = windows.slice(currentIndex + 1);
      return result;
    }
    result.state = "busy";
    var upcoming = windows.filter(function (w) { return w[0] > now.minutes; });
    result.next = upcoming[0] || null;
    result.later = upcoming.slice(1);
    return result;
  }

  function allStatuses(now, schedule, overrides, config) {
    return schedule.interpreters.map(function (name) {
      return statusFor(name, now, schedule, overrides, config);
    });
  }

  /** Overlapping classes for the same interpreter (data-quality check). */
  function findConflicts(schedule) {
    var conflicts = [];
    var groups = {};
    schedule.assignments.forEach(function (a) {
      var key = a.interpreter + "|" + a.day;
      (groups[key] = groups[key] || []).push(a);
    });
    Object.keys(groups).forEach(function (key) {
      var items = groups[key].slice().sort(function (a, b) { return toMin(a.start) - toMin(b.start); });
      for (var i = 0; i < items.length; i++) {
        for (var j = i + 1; j < items.length; j++) {
          if (toMin(items[j].start) < toMin(items[i].end)) {
            conflicts.push({ interpreter: items[i].interpreter, day: items[i].day, a: items[i], b: items[j] });
          }
        }
      }
    });
    return conflicts;
  }

  return {
    WEEKDAYS: WEEKDAYS,
    toMin: toMin,
    fmt: fmt,
    fmtRange: fmtRange,
    nowIn: nowIn,
    parseAt: parseAt,
    busyIntervals: busyIntervals,
    mergeIntervals: mergeIntervals,
    freeWindows: freeWindows,
    statusFor: statusFor,
    allStatuses: allStatuses,
    findConflicts: findConflicts
  };
});
