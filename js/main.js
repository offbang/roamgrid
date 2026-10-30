/* ==========================================================================
   RoamGrid Digital Studio — main.js
   Shared UI behaviour for every page:

   - Sticky header state + mobile navigation
   - Scroll-reveal (respects prefers-reduced-motion)
   - WhatsApp launchers with pre-formatted inquiry text
   - Inquiry form validation + delivery hand-off
   - ROI / lead-loss calculator (why-you-need-a-website.html)
   - Small conveniences: year stamp, work filters, smooth anchors
   ========================================================================== */
(function () {
  "use strict";

  /* Central studio coordinates — swap these once, everywhere. */
  var STUDIO = {
    whatsapp: "256700000000", // international format, no "+"
    email: "hello@roamgrid.studio",
    handle: "@offbang.sk"
  };

  window.RG = window.RG || {};
  window.RG.STUDIO = STUDIO;

  /* ------------------------------------------------- helpers ----------- */
  function $(sel, ctx) {
    return (ctx || document).querySelector(sel);
  }

  function $$(sel, ctx) {
    return Array.prototype.slice.call((ctx || document).querySelectorAll(sel));
  }

  function on(el, evt, fn) {
    if (el) el.addEventListener(evt, fn);
  }

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function debounce(fn, wait) {
    var t;
    return function () {
      var args = arguments;
      var self = this;
      clearTimeout(t);
      t = setTimeout(function () {
        fn.apply(self, args);
      }, wait || 150);
    };
  }

  /* ------------------------------------------------- header / nav ------ */
  function initHeader() {
    var header = $(".site-header");
    var toggle = $(".nav-toggle");
    var nav = $("#site-nav");

    if (header) {
      var applyStuck = function () {
        header.classList.toggle("is-stuck", window.scrollY > 8);
      };
      applyStuck();
      window.addEventListener("scroll", applyStuck, { passive: true });
    }

    if (toggle && nav) {
      toggle.addEventListener("click", function () {
        var open = toggle.getAttribute("aria-expanded") === "true";
        toggle.setAttribute("aria-expanded", String(!open));
        nav.classList.toggle("is-open", !open);
      });

      nav.addEventListener("click", function (e) {
        if (e.target.tagName === "A") {
          toggle.setAttribute("aria-expanded", "false");
          nav.classList.remove("is-open");
        }
      });

      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape") {
          toggle.setAttribute("aria-expanded", "false");
          nav.classList.remove("is-open");
        }
      });
    }
  }

  /* ---------------------------------------------- scroll reveal -------- */
  function initReveal() {
    var items = $$(".reveal");
    if (!items.length) return;

    if (prefersReducedMotion() || !("IntersectionObserver" in window)) {
      items.forEach(function (el) {
        el.classList.add("is-visible");
      });
      return;
    }

    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );

    items.forEach(function (el) {
      io.observe(el);
    });
  }

  /* --------------------------------------------- year stamp ------------ */
  function initYear() {
    $$("[data-year]").forEach(function (el) {
      el.textContent = String(new Date().getFullYear());
    });
  }

  /* ------------------------------------------- WhatsApp launchers ------ */
  /* Any anchor with [data-wa] builds a wa.me link. Body text comes from
     data-wa-text, with {url}, {page} and {price} tokens resolved live. */
  function buildWaHref(text) {
    return (
      "https://wa.me/" +
      STUDIO.whatsapp +
      "?text=" +
      encodeURIComponent(text || "Hello RoamGrid Digital Studio, I'd like to discuss a project.")
    );
  }

  function initWhatsApp() {
    $$("[data-wa]").forEach(function (el) {
      var page = document.body.getAttribute("data-page") || document.title;
      var text = el.getAttribute("data-wa-text") || "Hello RoamGrid Digital Studio, I'd like to discuss a project.";
      text = text
        .replace("{page}", page)
        .replace("{url}", window.location.href)
        .replace("{handle}", STUDIO.handle);
      el.setAttribute("href", buildWaHref(text));
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener");
    });
  }

  /* ------------------------------------------ inquiry form ------------- */
  /* Works as a plain HTML form; wire action= to Web3Forms/Formspree by
     setting data-endpoint. Without an endpoint, we hand off to WhatsApp
     so the visitor always reaches the studio. */
  function initInquiryForm() {
    var form = $("#inquiry-form");
    if (!form) return;

    var status = $("#form-status");

    function setStatus(msg, kind) {
      if (!status) return;
      status.textContent = msg;
      status.className = "form-status" + (kind ? " is-" + kind : "");
    }

    form.addEventListener("submit", function (e) {
      var name = $("#f-name", form);
      var email = $("#f-email", form);
      var message = $("#f-message", form);

      $$(".field.is-invalid", form).forEach(function (f) {
        f.classList.remove("is-invalid");
      });

      var problems = [];
      if (!name || !name.value.trim()) {
        if (name) name.closest(".field").classList.add("is-invalid");
        problems.push("your name");
      }
      var emailOk = email && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value.trim());
      if (!emailOk) {
        if (email) email.closest(".field").classList.add("is-invalid");
        problems.push("a valid email");
      }
      if (message && !message.value.trim()) {
        message.closest(".field").classList.add("is-invalid");
        problems.push("a short brief");
      }

      if (problems.length) {
        e.preventDefault();
        setStatus("Please add " + problems.join(", ") + " so we can reply properly.", "err");
        return;
      }

      var endpoint = form.getAttribute("data-endpoint");
      if (endpoint) {
        /* Native POST to the configured form backend. */
        setStatus("Sending your inquiry\u2026", null);
        return;
      }

      /* No endpoint configured: continue in WhatsApp with the brief. */
      e.preventDefault();
      var text =
        "Project inquiry via roamgrid.studio\n" +
        "Name: " + name.value.trim() + "\n" +
        "Email: " + email.value.trim() + "\n" +
        "Budget: " + (($("#f-budget", form) || {}).value || "not set") + "\n\n" +
        message.value.trim();
      setStatus("Opening WhatsApp with your brief pre-filled\u2026", "ok");
      window.open(buildWaHref(text), "_blank", "noopener");
    });
  }

  /* --------------------------------------- ROI / lead-loss calculator -- */
  /* why-you-need-a-website.html
     Inputs: monthly enquiries, % that reach out without a website,
             average order value, close rate.
     Output: leads and revenue lost each month without a website. */
  function initRoiCalculator() {
    var calc = $("#roi-calculator");
    if (!calc) return;

    var enquiries = $("#roi-enquiries", calc);
    var reach = $("#roi-reach", calc);
    var orderValue = $("#roi-order", calc);
    var closeRate = $("#roi-close", calc);

    var outEnquiries = $("#roi-out-enquiries", calc);
    var outReach = $("#roi-out-reach", calc);
    var outOrder = $("#roi-out-order", calc);
    var outClose = $("#roi-out-close", calc);
    var outLeads = $("#roi-out-lost-leads", calc);
    var outMonth = $("#roi-out-lost-month", calc);
    var outYear = $("#roi-out-lost-year", calc);

    if (!enquiries || !reach || !orderValue || !closeRate) return;

    function money(usd) {
      if (window.RG && typeof window.RG.formatUsd === "function") {
        return window.RG.formatUsd(usd);
      }
      return "$" + Math.round(usd).toLocaleString("en-US");
    }

    function recalc() {
      var q = Number(enquiries.value) || 0;
      var r = (Number(reach.value) || 0) / 100;
      var v = Number(orderValue.value) || 0;
      var c = (Number(closeRate.value) || 0) / 100;

      if (outEnquiries) outEnquiries.textContent = Math.round(q).toLocaleString("en-US");
      if (outReach) outReach.textContent = Math.round(r * 100) + "%";
      if (outOrder) outOrder.textContent = money(v);
      if (outClose) outClose.textContent = Math.round(c * 100) + "%";

      /* Enquiries that never arrive = the share of the audience that
         would only convert through a dedicated website. */
      var lostLeads = q * (1 - r);
      var lostMonth = lostLeads * v * c;

      if (outLeads) outLeads.textContent = Math.round(lostLeads).toLocaleString("en-US");
      if (outMonth) outMonth.textContent = money(lostMonth);
      if (outYear) outYear.textContent = money(lostMonth * 12);
    }

    [enquiries, reach, orderValue, closeRate].forEach(function (input) {
      on(input, "input", recalc);
      on(input, "change", recalc);
    });

    document.addEventListener("rg:currencychange", recalc);
    recalc();
  }

  /* ------------------------------------------ work grid filter --------- */
  function initWorkFilter() {
    var bar = $("[data-filter-bar]");
    if (!bar) return;
    var cards = $$("[data-work-tags]");

    bar.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-filter]");
      if (!btn) return;
      var tag = btn.getAttribute("data-filter");

      $$("[data-filter]", bar).forEach(function (b) {
        b.setAttribute("aria-pressed", String(b === btn));
      });

      cards.forEach(function (card) {
        var tags = card.getAttribute("data-work-tags") || "";
        var show = tag === "all" || tags.split(/\s+/).indexOf(tag) !== -1;
        card.style.display = show ? "" : "none";
      });
    });
  }

  /* ------------------------------------------- anchor offset ----------- */
  function initAnchors() {
    document.addEventListener("click", function (e) {
      var a = e.target.closest('a[href^="#"]');
      if (!a) return;
      var id = a.getAttribute("href");
      if (id.length < 2) return;
      var target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
      history.replaceState(null, "", id);
    });
  }

  /* ------------------------------------------------- boot -------------- */
  function init() {
    initHeader();
    initReveal();
    initYear();
    initWhatsApp();
    initInquiryForm();
    initRoiCalculator();
    initWorkFilter();
    initAnchors();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
