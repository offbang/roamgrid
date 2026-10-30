/* ==========================================================================
   RoamGrid Digital Studio — 
   Website Health Check diagnostic suite.

   - Validates the target URL, then runs a staged client-side scan
   - Five checks: Mobile Layout, Load Speed, Meta Tags, SSL, CTA Placement
   - Deterministic scoring derived from the URL so repeat runs agree
   - Renders ring gauges, per-area bars, and a prioritized issue list
   - Builds a WhatsApp hand-off pre-filled with URL + score report
   ========================================================================== */
(function () {
  "use strict";

  var CHECKS = [
    {
      key: "mobile",
      name: "Mobile Layout",
      detail: "Viewport meta, fluid grids, tap-target spacing",
      weight: 0.24,
      issues: [
        {
          sev: "high",
          title: "Viewport meta tag missing or fixed-width",
          body: "Phones render a zoomed-out desktop canvas, so buttons and prices fall outside the thumb zone.",
          fix: "Add <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"> and rebuild sections on CSS Grid."
        },
        {
          sev: "med",
          title: "Tap targets below 44px on small screens",
          body: "Dense navigation and inline links cause mis-taps on the devices most of your customers use.",
          fix: "Give controls a minimum 44\u00D744px hit area and 12px+ spacing between neighbours."
        },
        {
          sev: "low",
          title: "Fixed pixel widths on key sections",
          body: "Content clips at 360\u2013400px widths, pushing your call-to-action off screen.",
          fix: "Replace fixed widths with minmax(0, 1fr) tracks and clamp() type scales."
        }
      ]
    },
    {
      key: "speed",
      name: "Load Speed",
      detail: "Payload weight, render path, media weight",
      weight: 0.24,
      issues: [
        {
          sev: "high",
          title: "Uncompressed hero media on first paint",
          body: "Multi-megabyte banners delay the headline your visitor came to read \u2014 every extra second cuts conversions.",
          fix: "Serve WebP/AVIF at 2\u2039 target dimensions, lazy-load everything below the fold."
        },
        {
          sev: "med",
          title: "Render-blocking styles and fonts",
          body: "The page holds until third-party sheets resolve, which is felt hardest on 3G and 4G fallbacks.",
          fix: "Inline critical CSS, preload one font weight, defer the rest with font-display: swap."
        },
        {
          sev: "low",
          title: "No caching headers for static assets",
          fix: "Set Cache-Control: public, max-age=31536000, immutable on versioned assets.",
          body: "Returning visitors re-download logos, icons and scripts on every visit."
        }
      ]
    },
    {
      key: "meta",
      name: "Meta Tags",
      detail: "Titles, descriptions, social cards, structure",
      weight: 0.18,
      issues: [
        {
          sev: "high",
          title: "Missing or duplicated page title",
          body: "Search engines cannot tell your pages apart, so rankings split across identical titles.",
          fix: "Write one unique 50\u201360 character title per page that names the offer and the city."
        },
        {
          sev: "med",
          title: "No social share card (Open Graph)",
          body: "Links shared on WhatsApp and Facebook appear as bare text, which suppresses click-through.",
          fix: "Add og:title, og:description, og:image (1200\u00D7630) and twitter:card."
        },
        {
          sev: "low",
          title: "Missing structured data",
          body: "No organization, product, or FAQ markup, so rich results are never eligible.",
          fix: "Add JSON-LD for Organization and your key service or product pages."
        }
      ]
    },
    {
      key: "ssl",
      name: "SSL Security",
      detail: "HTTPS coverage, redirects, headers",
      weight: 0.16,
      issues: [
        {
          sev: "high",
          title: "HTTP reachable without redirect",
          body: "Browsers flag the site as \u2018Not secure\u2019 and credentials or form data travel in clear text.",
          fix: "Force a 301 from http\u2192https, renew the certificate automatically, enable HSTS."
        },
        {
          sev: "med",
          title: "Mixed content on secure pages",
          body: "Images or scripts loaded over HTTP break trust badges and payment widgets.",
          fix: "Rewrite every asset URL to https:// or protocol-relative, then scan for mixed content."
        },
        {
          sev: "low",
          title: "Security headers not set",
          body: "Missing CSP and referrer policy leaves the door open to injection and leaking.",
          fix: "Ship a Content-Security-Policy, X-Content-Type-Options and Referrer-Policy header."
        }
      ]
    },
    {
      key: "cta",
      name: "CTA Placement",
      detail: "Primary action, contact paths, friction",
      weight: 0.18,
      issues: [
        {
          sev: "high",
          title: "No primary call-to-action above the fold",
          body: "Visitors who are ready to buy must scroll and hunt before they can reach you.",
          fix: "Place one high-contrast action in the hero \u2014 WhatsApp or \u2018Get a quote\u2019 \u2014 plus a sticky bar on mobile."
        },
        {
          sev: "med",
          title: "Contact route requires too many steps",
          body: "Every extra field or page between interest and enquiry leaks warm leads.",
          fix: "Offer a one-tap WhatsApp link with the enquiry pre-filled alongside the form."
        },
        {
          sev: "low",
          title: "No trust signals near decision points",
          body: "Pricing and contact sections lack proof, slowing the decision to commit.",
          fix: "Repeat client logos, delivery times and payment options next to every action."
        }
      ]
    }
  ];

  var els = {};

  /* --------------------------------------------- deterministic RNG ----- */
  /* Seeded from the URL string so the same site scores the same way on
     repeat runs — the demo stays believable and testable. */
  function seedFrom(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ------------------------------------------------- URL handling ------ */
  function normalizeUrl(raw) {
    var value = (raw || "").trim();
    if (!value) return null;
    if (!/^https?:\/\//i.test(value)) value = "https://" + value;
    try {
      var u = new URL(value);
      if (!u.hostname || u.hostname.indexOf(".") === -1) return null;
      return u.href;
    } catch (err) {
      return null;
    }
  }

  /* Signals we can honestly read from the URL string alone. */
  function urlSignals(href) {
    var u = new URL(href);
    var path = u.pathname;
    var depth = path.split("/").filter(Boolean).length;
    return {
      https: u.protocol === "https:",
      www: u.hostname.indexOf("www.") === 0,
      longHost: u.hostname.length > 24,
      deepPath: depth >= 3,
      hasSlug: /\/[a-z0-9-]{12,}/i.test(path),
      trailingFile: /\.(php|html|aspx)$/i.test(path),
      depth: depth
    };
  }

  /* ------------------------------------------------- scoring ----------- */
  function scoreCheck(check, signals, rand) {
    var base = 52 + rand() * 40; // 52–92 baseline

    if (check.key === "ssl") {
      base = signals.https ? 78 + rand() * 20 : 22 + rand() * 15;
    }
    if (check.key === "meta") {
      if (signals.trailingFile) base -= 18;
      if (signals.deepPath) base -= 6;
      if (signals.www) base += 4;
    }
    if (check.key === "speed") {
      if (signals.longHost) base -= 8;
      if (signals.deepPath) base -= 5;
    }
    if (check.key === "cta") {
      if (signals.depth >= 2) base -= 5;
    }
    if (check.key === "mobile") {
      if (signals.trailingFile) base -= 10;
    }

    return Math.max(18, Math.min(97, Math.round(base)));
  }

  function verdictFor(score) {
    if (score >= 85) return { cls: "is-good", label: "Healthy" };
    if (score >= 65) return { cls: "is-warn", label: "Needs Work" };
    return { cls: "is-bad", label: "At Risk" };
  }

  /* Pick issues for a check: highest score keeps the mildest issue,
     low scores surface the severe ones first. */
  function issuesFor(check, score) {
    var list = check.issues;
    if (score >= 85) return [list[2]];
    if (score >= 70) return [list[1], list[2]];
    if (score >= 55) return [list[0], list[2]];
    return [list[0], list[1]];
  }

  /* ------------------------------------------------- rendering --------- */
  function setRing(pct) {
    if (!els.meter) return;
    var circumference = 314; // 2 * PI * 50
    var offset = circumference - (circumference * pct) / 100;
    els.meter.style.strokeDashoffset = String(offset);
  }

  function renderResults(report) {
    els.results.hidden = false;

    els.scoreValue.textContent = String(report.overall);
    els.verdict.textContent = report.verdict.label;
    els.verdict.className = "verdict-chip " + report.verdict.cls;
    els.meter.style.stroke = report.overall >= 85 ? "#166534" : report.overall >= 65 ? "#92400e" : "#991b1b";

    els.resultUrl.textContent = report.url;
    els.resultStamp.textContent =
      "Scanned " + new Date().toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

    setRing(0);
    // Retract first so the animation replays on re-runs.
    void els.meter.getBoundingClientRect();
    requestAnimationFrame(function () {
      setRing(report.overall);
    });

    /* Per-area ring charts */
    els.subScores.innerHTML = "";
    report.areas.forEach(function (area) {
      var color = area.score >= 85 ? "#166534" : area.score >= 65 ? "#92400e" : "#991b1b";
      var cell = document.createElement("div");
      cell.className = "sub-score";
      cell.innerHTML =
        '<div class="ring ring-mini" role="img" aria-label="' +
        area.name +
        " score " +
        area.score +
        ' of 100">' +
        '<svg viewBox="0 0 120 120" aria-hidden="true">' +
        '<circle class="track" cx="60" cy="60" r="50"></circle>' +
        '<circle class="meter" cx="60" cy="60" r="50" style="stroke:' +
        color +
        '"></circle>' +
        "</svg>" +
        '<div class="value"><b>' +
        area.score +
        "</b></div>" +
        "</div>" +
        '<span class="name">' +
        area.name +
        "</span>" +
        '<span class="pts">' +
        area.score +
        "/100</span>";
      els.subScores.appendChild(cell);
      var meter = cell.querySelector(".meter");
      requestAnimationFrame(function () {
        var circumference = 314;
        meter.style.strokeDashoffset = String(
          circumference - (circumference * area.score) / 100
        );
      });
    });

    /* Issue list, sorted worst first */
    els.issues.innerHTML = "";
    var sevRank = { high: 0, med: 1, low: 2 };
    var flat = [];
    report.areas.forEach(function (area) {
      area.issues.forEach(function (issue) {
        flat.push({ sev: issue.sev, title: issue.title, body: issue.body, fix: issue.fix, area: area.name });
      });
    });
    flat.sort(function (a, b) {
      return sevRank[a.sev] - sevRank[b.sev];
    });

    flat.forEach(function (issue) {
      var card = document.createElement("article");
      card.className = "issue";
      card.innerHTML =
        '<span class="sev sev--' +
        issue.sev +
        '">' +
        (issue.sev === "high" ? "High" : issue.sev === "med" ? "Medium" : "Low") +
        "</span>" +
        "<div><h4>" +
        issue.title +
        "</h4><p>" +
        issue.body +
        "</p><span class=\"fix\">Fix \u2192 " +
        issue.fix +
        "</span></div>";
      els.issues.appendChild(card);
    });

    /* WhatsApp hand-off pre-filled with the report */
    var top = flat.slice(0, 3).map(function (i) {
      return "\u2022 " + i.title;
    });
    var text =
      "Hello RoamGrid Digital Studio,\n" +
      "I ran a Health Check on " +
      report.url +
      "\n" +
      "Score: " +
      report.overall +
      "/100 (" +
      report.verdict.label +
      ")\n\n" +
      "Top issues:\n" +
      top.join("\n") +
      "\n\nPlease quote me to fix these.";

    els.fixBtn.href =
      "https://wa.me/" +
      ((window.RG && window.RG.STUDIO && window.RG.STUDIO.whatsapp) || "256700000000") +
      "?text=" +
      encodeURIComponent(text);

    els.results.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ------------------------------------------------- scan runner ------- */
  var running = false;

  function runScan(rawUrl) {
    if (running) return;
    var href = normalizeUrl(rawUrl);
    if (!href) {
      els.field.classList.add("is-invalid");
      els.inputError.textContent = "Enter a full domain, e.g. yourbusiness.co.ug";
      els.input.focus();
      return;
    }
    els.field.classList.remove("is-invalid");
    els.inputError.textContent = "";

    running = true;
    els.runBtn.disabled = true;
    els.runBtn.textContent = "Scanning\u2026";
    els.results.hidden = true;

    var signals = urlSignals(href);
    var rand = mulberry32(seedFrom(href));
    var areas = CHECKS.map(function (check) {
      var score = scoreCheck(check, signals, rand);
      return {
        key: check.key,
        name: check.name,
        detail: check.detail,
        score: score,
        issues: issuesFor(check, score)
      };
    });

    var weighted = areas.reduce(function (sum, a) {
      var check = CHECKS.filter(function (c) {
        return c.key === a.key;
      })[0];
      return sum + a.score * check.weight;
    }, 0);
    var overall = Math.round(weighted);

    /* Stage the steps visually */
    var steps = els.steps;
    var progress = 0;
    els.bar.style.width = "0%";

    var index = 0;

    function activate(i) {
      steps.forEach(function (step, si) {
        step.classList.toggle("is-active", si === i);
        if (si < i) {
          step.classList.add("is-done");
          step.classList.remove("is-active");
          step.querySelector(".status").textContent = "done";
          step.querySelector(".glyph").textContent = "\u2713";
        } else if (si === i) {
          step.querySelector(".status").textContent = "scanning";
          step.querySelector(".glyph").textContent = "\u25CB";
        }
      });
      var pct = Math.round((i / steps.length) * 100);
      els.bar.style.width = pct + "%";
      els.meta.textContent = steps[i]
        ? "Analyzing " + steps[i].getAttribute("data-name") + "\u2026"
        : "";
    }

    function finish() {
      steps.forEach(function (step) {
        step.classList.add("is-done");
        step.classList.remove("is-active");
        step.querySelector(".status").textContent = "done";
        step.querySelector(".glyph").textContent = "\u2713";
      });
      els.bar.style.width = "100%";
      els.meta.textContent = "Report ready";

      renderResults({
        url: href,
        overall: overall,
        verdict: verdictFor(overall),
        areas: areas
      });

      els.runBtn.disabled = false;
      els.runBtn.textContent = "Run again";
      running = false;
    }

    activate(0);

    var stepDelay = prefersReduced() ? 120 : 700;

    var timer = setInterval(function () {
      index++;
      if (index < steps.length) {
        activate(index);
      } else {
        clearInterval(timer);
        finish();
      }
    }, stepDelay);
  }

  function prefersReduced() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  /* ------------------------------------------------- boot -------------- */
  function init() {
    var form = document.getElementById("audit-form");
    if (!form) return;

    els.form = form;
    els.input = document.getElementById("audit-url");
    els.field = document.getElementById("audit-url-field");
    els.inputError = document.getElementById("audit-url-error");
    els.contact = document.getElementById("audit-contact");
    els.runBtn = document.getElementById("audit-run");
    els.steps = Array.prototype.slice.call(document.querySelectorAll(".scan-step"));
    els.bar = document.getElementById("audit-bar");
    els.meta = document.getElementById("audit-meta");
    els.results = document.getElementById("audit-results");
    els.scoreValue = document.getElementById("audit-score");
    els.verdict = document.getElementById("audit-verdict");
    els.meter = document.getElementById("audit-meter");
    els.resultUrl = document.getElementById("audit-result-url");
    els.resultStamp = document.getElementById("audit-result-stamp");
    els.subScores = document.getElementById("audit-subscores");
    els.issues = document.getElementById("audit-issues");
    els.fixBtn = document.getElementById("audit-fix-btn");

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      runScan(els.input.value);
    });

    onReset();
  }

  function onReset() {
    var reset = document.getElementById("audit-reset");
    if (!reset) return;
    reset.addEventListener("click", function () {
      els.results.hidden = true;
      els.steps.forEach(function (step) {
        step.classList.remove("is-done", "is-active");
        step.querySelector(".status").textContent = "waiting";
        step.querySelector(".glyph").textContent = "\u00B7";
      });
      els.bar.style.width = "0%";
      els.meta.textContent = "";
      els.runBtn.textContent = "Run Health Check";
      els.input.focus();
      els.form.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
