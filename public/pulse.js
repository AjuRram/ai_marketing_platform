/**
 * Pulse browser SDK.
 *
 * Drop-in page-view and event tracking, authenticated with a PUBLISHABLE key.
 * That key ships in the page source and is assumed public — it is write-only
 * and scoped to two ingest endpoints, so it cannot read anybody's audience back
 * out. Never put an `sk_` key in here.
 *
 *   <script src="https://your-host/pulse.js"
 *           data-key="pk_..."
 *           data-host="https://your-host"></script>
 *
 * Then:
 *   Pulse.identify("maya@example.com", { plan: "pro" })
 *   Pulse.track("pricing_viewed", { plan: "team" })
 *
 * ~2kB, no dependencies, no build step.
 */
(function (window, document) {
  "use strict";

  var script = document.currentScript;
  var KEY = (script && script.getAttribute("data-key")) || "";
  var HOST =
    (script && script.getAttribute("data-host")) ||
    (script && new URL(script.src, location.href).origin) ||
    location.origin;
  var AUTO = !script || script.getAttribute("data-auto") !== "false";

  var identity = null;

  function post(path, payload) {
    if (!KEY) {
      console.warn("[pulse] no data-key set on the script tag; event dropped");
      return Promise.resolve(null);
    }

    var url = HOST + "/api/v1/" + path;
    var body = JSON.stringify(payload);

    // `sendBeacon` survives the page being unloaded, which is exactly when the
    // last and most interesting page-view fires. It cannot set an
    // Authorization header, so the key rides as a query parameter — safe here
    // precisely because a publishable key is already public.
    if (navigator.sendBeacon && document.visibilityState === "hidden") {
      var ok = navigator.sendBeacon(
        url + "?key=" + encodeURIComponent(KEY),
        new Blob([body], { type: "application/json" }),
      );
      if (ok) return Promise.resolve(null);
    }

    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + KEY },
      body: body,
      // Lets the request outlive the page during a navigation.
      keepalive: true,
    }).catch(function () {
      // Analytics must never break the host page.
      return null;
    });
  }

  var Pulse = {
    /** Associate subsequent events with a person, and upsert their traits. */
    identify: function (email, traits) {
      if (!email) return Promise.resolve(null);
      identity = email;
      try {
        localStorage.setItem("pulse:email", email);
      } catch (e) {
        /* private mode */
      }
      return post("audience/people/upsert", { email: email, traits: traits || {} });
    },

    /** Record a named behavioural event. */
    track: function (name, props) {
      if (!name) return Promise.resolve(null);
      return post("events", {
        name: name,
        email: identity,
        props: props || {},
      });
    },

    /** Record a page view. Called automatically unless data-auto="false". */
    page: function (props) {
      return Pulse.track(
        "page_view",
        Object.assign(
          {
            path: location.pathname,
            referrer: document.referrer || null,
            title: document.title,
          },
          props || {},
        ),
      );
    },

    reset: function () {
      identity = null;
      try {
        localStorage.removeItem("pulse:email");
      } catch (e) {
        /* ignore */
      }
    },
  };

  try {
    identity = localStorage.getItem("pulse:email");
  } catch (e) {
    /* ignore */
  }

  if (AUTO) {
    Pulse.page();

    // SPA navigations do not reload the page, so history has to be patched for
    // a route change to register. Both pushState and popstate are needed:
    // pushState covers in-app links, popstate covers the back button.
    var push = history.pushState;
    history.pushState = function () {
      push.apply(this, arguments);
      Pulse.page();
    };
    window.addEventListener("popstate", function () {
      Pulse.page();
    });
  }

  window.Pulse = Pulse;
})(window, document);
