/* ==========================================================================
   RoamGrid Digital Studio — 
   Global forex selection, live rate fetching, and localized price rendering.

   - Pulls live USD rates from https://open.er-api.com/v6/latest/USD
   - Persists the last good rates + the visitor's chosen currency
   - Falls back to the cache, then to bundled reference rates, offline
   - Any element carrying [data-usd] is re-rendered when the currency changes
   ========================================================================== */
(function () {
  "use strict";

  var API_URL = "https://open.er-api.com/v6/latest/USD";
  var LS_RATES = "roamgrid.fx.rates";
  var LS_CODE = "roamgrid.fx.currency";
  var FETCH_TIMEOUT = 8000;

  /* Display config: prefix vs. symbol, decimals, and bundled reference
     rates used only when neither the API nor the cache is reachable.
     Bundled values mirror the last known USD rates from the live source. */
  var CURRENCIES = {
    UGX: { label: "UGX — Ugandan Shilling", prefix: "UGX", symbol: "", decimals: 0, fallback: 4016.57 },
    KES: { label: "KES — Kenyan Shilling", prefix: "KSh", symbol: "", decimals: 0, fallback: 129.73 },
    RWF: { label: "RWF — Rwandan Franc", prefix: "RF", symbol: "", decimals: 0, fallback: 1477.99 },
    SSP: { label: "SSP — South Sudanese Pound", prefix: "SSP", symbol: "", decimals: 0, fallback: 5909.34 },
    ZAR: { label: "ZAR — South African Rand", prefix: "R", symbol: "", decimals: 2, fallback: 16.58 },
    USD: { label: "USD — US Dollar", prefix: "$", symbol: "", decimals: 0, fallback: 1 },
    GBP: { label: "GBP — British Pound", prefix: "\u00A3", symbol: "", decimals: 0, fallback: 0.756 }
  };

  var state = {
    code: "USD",
    rates: null,      // { UGX: 3680, ... } — USD base
    source: "bundled" // "live" | "cache" | "bundled"
  };

  /* ---------------------------------------------------------- helpers --- */
  function readStore(key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (err) {
      return fallback;
    }
  }

  function writeStore(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      /* Storage may be disabled — the session still works in-memory. */
    }
  }

  function isValidRates(rates) {
    if (!rates || typeof rates !== "object") return false;
    for (var code in CURRENCIES) {
      var v = Number(rates[code]);
      if (!isFinite(v) || v <= 0) return false;
    }
    return true;
  }

  function bundledRates() {
    var out = {};
    for (var code in CURRENCIES) out[code] = CURRENCIES[code].fallback;
    return out;
  }

  /* Converts a USD amount into the active currency, rounded to the
     currency's display precision. */
  function toActive(usd) {
    var usdNum = Number(usd);
    if (!isFinite(usdNum)) return 0;
    var rate = state.rates && Number(state.rates[state.code]);
    if (!isFinite(rate) || rate <= 0) rate = CURRENCIES[state.code].fallback;
    return usdNum * rate;
  }

  /* "UGX 550,000" / "KSh 19,500" / "$150" / "\u00A3740" */
  function formatAmount(value, code) {
    var cfg = CURRENCIES[code];
    var num = Number(value);
    if (!isFinite(num)) num = 0;

    var grouped;
    try {
      grouped = new Intl.NumberFormat("en-US", {
        minimumFractionDigits: cfg.decimals,
        maximumFractionDigits: cfg.decimals
      }).format(num);
    } catch (err) {
      grouped = String(Math.round(num * Math.pow(10, cfg.decimals)) / Math.pow(10, cfg.decimals));
    }

    if (code === "USD" || code === "GBP") return cfg.prefix + grouped;
    return cfg.prefix + " " + grouped;
  }

  function formatUsd(usd) {
    return formatAmount(toActive(usd), state.code);
  }

  /* Public: format an arbitrary USD amount in the current currency. */
  window.RG = window.RG || {};
  window.RG.formatUsd = formatUsd;
  window.RG.activeCurrency = function () {
    return state.code;
  };

  /* ------------------------------------------------------- rendering --- */
  function renderPrices() {
    var nodes = document.querySelectorAll("[data-usd]");
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var usd = node.getAttribute("data-usd");
      node.textContent = formatUsd(usd);
      /* Expose both sides so tooltips/aria can stay accurate. */
      node.setAttribute("data-usd-original", usd);
      node.setAttribute("title", "Base price: $" + Number(usd).toLocaleString("en-US") + " USD");
    }
  }

  function renderRateStatus() {
    var label =
      state.source === "live"
        ? "Live rates \u00B7 updated " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : state.source === "cache"
        ? "Cached rates \u00B7 offline"
        : "Reference rates \u00B7 offline";

    var nodes = document.querySelectorAll("[data-fx-status]");
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].textContent = label;
      nodes[i].setAttribute("data-fx-source", state.source);
    }
  }

  function syncSelects() {
    var selects = document.querySelectorAll("#currency-select");
    for (var i = 0; i < selects.length; i++) {
      if (selects[i].value !== state.code) selects[i].value = state.code;
    }
  }

  function apply() {
    renderPrices();
    syncSelects();
    renderRateStatus();
    document.documentElement.setAttribute("data-currency", state.code);
    document.dispatchEvent(new CustomEvent("rg:currencychange", { detail: { code: state.code } }));
  }

  /* ------------------------------------------------------ rate fetch --- */
  function hydrateFromStore() {
    var cached = readStore(LS_RATES, null);
    if (cached && isValidRates(cached.rates)) {
      state.rates = cached.rates;
      state.source = "cache";
      return true;
    }
    state.rates = bundledRates();
    state.source = "bundled";
    return false;
  }

  function fetchLiveRates() {
    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timer = controller
      ? setTimeout(function () {
          controller.abort();
        }, FETCH_TIMEOUT)
      : null;

    return fetch(API_URL, controller ? { signal: controller.signal, cache: "no-store" } : { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!data || data.result !== "success" || !isValidRates(data.rates)) {
          throw new Error("Malformed rate payload");
        }
        var picked = {};
        for (var code in CURRENCIES) {
          var v = Number(data.rates[code]);
          if (isFinite(v) && v > 0) picked[code] = v;
        }
        if (!isValidRates(picked)) throw new Error("Supported currencies missing");
        state.rates = picked;
        state.source = "live";
        writeStore(LS_RATES, { rates: picked, at: Date.now() });
        return picked;
      })
      .catch(function () {
        /* Keep whatever we already have — cache, else bundled. */
        return null;
      })
      .then(function (result) {
        if (timer) clearTimeout(timer);
        return result;
      });
  }

  /* ------------------------------------------------------ selection ---- */
  function setCurrency(code, persist) {
    if (!CURRENCIES[code]) return;
    state.code = code;
    if (persist !== false) writeStore(LS_CODE, code);
    apply();
  }

  function bindSelects() {
    var selects = document.querySelectorAll("#currency-select");
    for (var i = 0; i < selects.length; i++) {
      (function (select) {
        select.addEventListener("change", function () {
          setCurrency(select.value);
        });
      })(selects[i]);
    }
  }

  /* ---------------------------------------------------- FX calculator --- */
  /* pricing.html: [data-fx-source-input] amount input +
                   [data-fx-from] base currency select +
                   [data-fx-result] output node +
                   [data-fx-table] rate list                         */
  function bindConverter() {
    var input = document.querySelector("[data-fx-source-input]");
    var fromSelect = document.querySelector("[data-fx-from]");
    var result = document.querySelector("[data-fx-result]");
    var table = document.querySelector("[data-fx-table]");
    if (!input || !result) return;

    function convert() {
      var amount = Number(input.value);
      if (!isFinite(amount) || amount <= 0) amount = 0;

      var from = fromSelect ? fromSelect.value : "USD";
      var usd;
      if (from === "USD") {
        usd = amount;
      } else {
        var fromRate = state.rates && Number(state.rates[from]);
        if (!isFinite(fromRate) || fromRate <= 0) fromRate = CURRENCIES[from].fallback;
        usd = amount / fromRate;
      }

      var target = state.code;
      var targetRate = state.rates && Number(state.rates[target]);
      if (!isFinite(targetRate) || targetRate <= 0) targetRate = CURRENCIES[target].fallback;

      var converted = from === target ? amount : usd * targetRate;
      result.textContent = formatAmount(converted, target);
      result.setAttribute("data-converted-usd", String(usd));

      if (table) {
        var rows = "";
        for (var code in CURRENCIES) {
          var rate = state.rates && Number(state.rates[code]);
          if (!isFinite(rate) || rate <= 0) rate = CURRENCIES[code].fallback;
          var value = code === "USD" ? amount : (from === "USD" ? amount : usd) * rate;
          rows +=
            "<li><span>" +
            code +
            "</span><b>" +
            formatAmount(value, code) +
            "</b></li>";
        }
        table.innerHTML = rows;
      }
    }

    input.addEventListener("input", convert);
    if (fromSelect) fromSelect.addEventListener("change", convert);
    document.addEventListener("rg:currencychange", convert);
    convert();
  }

  /* --------------------------------------------------------- boot ------ */
  function init() {
    var savedCode = readStore(LS_CODE, null);
    if (savedCode && CURRENCIES[savedCode]) state.code = savedCode;

    hydrateFromStore();
    bindSelects();
    bindConverter();
    apply();

    fetchLiveRates().then(function (live) {
      if (live) apply();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
