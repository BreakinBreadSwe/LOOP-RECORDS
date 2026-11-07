// Loop Records runtime: connects the web app to Supabase.
//
// The app (src/app.template.html + src/admin.js) talks to a small `window.claude` API:
//   claude.use("db")        collection(name).onSnapshot(cb, err), doc("coll/id").set(data) / .delete()
//   claude.use("user")      canEdit() -> true for label staff
//   claude.use("assets")    upload(blob) -> {id, url}, delete(id)
//   claude.use("downloads") save({filename, data})
// This file implements that API on Supabase (Postgres table app_docs, Auth, Storage), so the
// same front end runs as a normal website. Without config it does nothing and the site is a
// read-only catalog.
(function () {
  "use strict";
  var cfg = window.LOOP_CONFIG || {};
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey || !window.supabase) return;

  var sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  // ---- auth ----
  var ready = sb.auth.getSession().then(function (r) { return (r.data && r.data.session) || null; }).catch(function () { return null; });
  var knownUser;
  ready.then(function (s) {
    knownUser = s ? s.user.id : null;
    sb.auth.onAuthStateChange(function (_evt, session) {
      var id = session ? session.user.id : null;
      if (id !== knownUser) { knownUser = id; location.reload(); }
    });
  });
  async function token() { var r = await sb.auth.getSession(); return r.data.session ? r.data.session.access_token : null; }
  // Who is signed in: role (visitor, customer, artist, admin), linked artist and their release ids.
  var mePromise = null;
  function me() {
    if (!mePromise) mePromise = (async function () {
      var s = await ready; if (!s) return { role: "visitor", person: null, releases: [], email: "" };
      var r = await sb.rpc("my_role"); var role = (!r.error && r.data) || "customer", person = null, rel = [];
      if (role === "artist") {
        var p = await sb.rpc("my_person_key"); person = p.data || null;
        var x = await sb.rpc("my_release_ids"); rel = (x.data || []).map(function (v) { return Number(typeof v === "object" && v ? Object.values(v)[0] : v); });
      }
      return { role: role, person: person, releases: rel, email: s.user.email || "" };
    })();
    return mePromise;
  }
  async function isStaff() {
    var s = await ready; if (!s) return false;
    var r = await sb.rpc("is_staff"); return !r.error && r.data === true;
  }

  // ---- document store ----
  var loaders = {};
  async function fetchAll(coll) {
    var out = [], from = 0, step = 1000;
    for (;;) {
      var r = await sb.from("app_docs").select("id,data").eq("collection", coll).range(from, from + step - 1);
      if (r.error) throw r.error;
      out = out.concat(r.data || []);
      if (!r.data || r.data.length < step) return out;
      from += step;
    }
  }
  function snapshot(rows) {
    return { docs: rows.map(function (row) { return { id: row.id, exists: true, data: function () { return row.data; } }; }) };
  }
  function reload(coll) { (loaders[coll] || []).forEach(function (f) { f(); }); }
  function split(path) { var i = path.indexOf("/"); return { c: path.slice(0, i), id: path.slice(i + 1) }; }

  var db = {
    collection: function (name) {
      return {
        onSnapshot: function (cb, onErr) {
          var alive = true, timer = null;
          var load = function () {
            clearTimeout(timer);
            timer = setTimeout(function () {
              fetchAll(name).then(function (rows) { if (alive) cb(snapshot(rows)); }, function (e) { if (alive && onErr) onErr(e); });
            }, 60);
          };
          (loaders[name] = loaders[name] || []).push(load);
          load();
          var ch = sb.channel("app_docs:" + name + ":" + Math.random().toString(36).slice(2))
            .on("postgres_changes", { event: "*", schema: "public", table: "app_docs", filter: "collection=eq." + name }, load)
            .subscribe();
          return function () { alive = false; sb.removeChannel(ch); loaders[name] = (loaders[name] || []).filter(function (f) { return f !== load; }); };
        }
      };
    },
    doc: function (path) {
      var p = split(path);
      return {
        set: async function (data) {
          var r = await sb.from("app_docs").upsert({ collection: p.c, id: p.id, data: JSON.parse(JSON.stringify(data)) });
          if (r.error) throw r.error; reload(p.c);
        },
        delete: async function () {
          var r = await sb.from("app_docs").delete().eq("collection", p.c).eq("id", p.id);
          if (r.error) throw r.error; reload(p.c);
        },
        get: async function () {
          var r = await sb.from("app_docs").select("data").eq("collection", p.c).eq("id", p.id).maybeSingle();
          if (r.error) throw r.error;
          return { id: p.id, exists: !!r.data, data: function () { return r.data ? r.data.data : undefined; } };
        }
      };
    }
  };

  // ---- artwork storage ----
  var assets = {
    upload: async function (blob) {
      var ext = (blob.type && blob.type.split("/")[1]) || "jpg";
      var path = new Date().toISOString().slice(0, 10) + "/" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + "." + ext.replace("jpeg", "jpg");
      var r = await sb.storage.from("artwork").upload(path, blob, { contentType: blob.type || "image/jpeg", upsert: false });
      if (r.error) throw r.error;
      return { id: path, url: sb.storage.from("artwork").getPublicUrl(path).data.publicUrl };
    },
    delete: async function (id) { var r = await sb.storage.from("artwork").remove([id]); if (r.error) throw r.error; }
  };

  // ---- track sound files (bucket "audio", staff only) ----
  function safeName(n) { return String(n || "track").normalize("NFKD").replace(/[^\w.\-]+/g, "_").slice(-80); }
  var audio = {
    upload: async function (file, releaseId, pos) {
      var m = await me(); if (m.role !== "admin" && m.role !== "artist") throw new Error("Only label staff and the release's artists can add sound files.");
      var path = releaseId + "/" + safeName(pos) + "-" + Date.now().toString(36) + "-" + safeName(file.name);
      var r = await sb.storage.from("audio").upload(path, file, { contentType: file.type || "audio/mpeg", upsert: false });
      if (r.error) throw r.error;
      return { path: path, url: sb.storage.from("audio").getPublicUrl(path).data.publicUrl };
    },
    remove: async function (path) { var r = await sb.storage.from("audio").remove([path]); if (r.error) throw r.error; }
  };

  // ---- downloads ----
  var downloads = {
    save: async function (o) {
      var blob = o.data instanceof Blob ? o.data : new Blob([o.data], { type: /\.csv$/i.test(o.filename) ? "text/csv" : "application/json" });
      var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = o.filename;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      return { status: "saved" };
    }
  };

  window.claude = {
    use: async function (name) {
      if (name === "db") return db;
      if (name === "assets") { var m = await me(); return (m.role === "admin" || m.role === "artist" || (await isStaff())) ? assets : null; }
      if (name === "downloads") return downloads;
      if (name === "user") { var s = await ready; return { id: s ? s.user.id : null, email: s ? s.user.email : null, canEdit: isStaff }; }
      return null;
    }
  };
  window.LoopBackend = { client: sb, token: token, isStaff: isStaff, ready: ready, audio: audio, me: me };

  // ---- sign in or sign up (magic link): staff, artists and customers ----
  function el(tag, attrs, html) { var e = document.createElement(tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (html != null) e.innerHTML = html; return e; }
  function mountAuth() {
    var nav = document.getElementById("navAdmin"); if (!nav || !nav.parentNode) return;
    var btn = el("button", { type: "button", id: "staffBtn", "class": "ico" });
    (nav.closest(".tools") || nav.parentNode).appendChild(btn);
    var dlg = el("dialog", { id: "staffDlg", "aria-labelledby": "staffTitle" },
      '<div class="brand dlgbrand" aria-hidden="true"><span class="mark mk-spiral"></span><span class="words"><span class="mark mk-word"></span>' +
      '<svg class="era" viewBox="0 0 200 10" focusable="false"><text x="0" y="9" textLength="200" lengthAdjust="spacing">STOCKHOLM 1993–1998</text></svg></span></div>' +
      '<h2 id="staffTitle">Sign in or sign up</h2>' +
      '<form id="staffForm" class="staffform">' +
      '<p>Type your email and we send you a link. New here? The same link creates your account.</p>' +
      '<label for="staffEmail">Email</label><input id="staffEmail" name="email" type="email" autocomplete="email" required>' +
      '<div class="btnrow"><button class="btn primary" type="submit">Email me a link</button><button class="btn" type="button" data-close>Close</button></div></form>' +
      '<form id="codeForm" class="staffform" hidden>' +
      '<p id="sentMsg" tabindex="-1"></p>' +
      '<label for="staffCode">Or type the code from the email</label><input id="staffCode" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="10">' +
      '<div class="btnrow"><button class="btn primary" type="submit">Sign in with the code</button></div>' +
      '<div class="btnrow"><button class="btn" type="button" id="staffAgain">Use another email</button><button class="btn primary" type="button" data-close>Close</button></div></form>' +
      '<p class="staffmsg" id="staffMsg" role="status" aria-live="polite"></p>');
    document.body.appendChild(dlg);
    var css = el("style", {}, "" +
      "#staffDlg{border:1px solid var(--line);background:var(--surface);color:var(--ink);border-radius:10px;padding:20px;max-width:min(420px,calc(100vw - 32px))}#staffDlg::backdrop{background:var(--scrim)}" +
      ".staffform label{display:block;font-weight:600;margin:12px 0 4px}.staffform input{width:100%;box-sizing:border-box;font:inherit;padding:8px 10px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--ink)}" +
      ".dlgbrand{margin:4px 0 22px;max-width:300px}#staffTitle{margin-top:0}" +
      "#sentMsg{font-weight:600}.staffmsg{min-height:1.4em;color:var(--muted)}");
    document.head.appendChild(css);
    var f1 = document.getElementById("staffForm"), f2 = document.getElementById("codeForm"), msg = document.getElementById("staffMsg"), sentTo = "";
    function showStep(n) { f1.hidden = n !== 1; f2.hidden = n !== 2; msg.textContent = ""; }
    ready.then(function (s) {
      // Simple monochrome icons: an arrow into a door to sign in, out of it to sign out.
      btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + (s
        ? '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M10 8l-4 4 4 4M6 12h9"/>'
        : '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M11 8l4 4-4 4M4 12h11"/>') + '</svg>';
      var label = s ? "Sign out" : "Sign in or sign up";
      btn.setAttribute("aria-label", label); btn.title = label;
      btn.onclick = function () { if (s) { sb.auth.signOut(); } else { showStep(1); dlg.showModal(); document.getElementById("staffEmail").focus(); } };
    });
    dlg.querySelectorAll("[data-close]").forEach(function (b) { b.onclick = function () { dlg.close(); }; });
    document.getElementById("staffAgain").onclick = function () { showStep(1); document.getElementById("staffEmail").focus(); };
    f1.onsubmit = async function (e) {
      e.preventDefault();
      var email = document.getElementById("staffEmail").value.trim();
      msg.textContent = "Sending…";
      var r = await sb.auth.signInWithOtp({ email: email, options: { emailRedirectTo: location.origin + location.pathname + "#admin", shouldCreateUser: true } });
      if (r.error) { msg.textContent = "Couldn't send the email: " + r.error.message; return; }
      sentTo = email; showStep(2);
      var sent = document.getElementById("sentMsg");
      sent.textContent = "Email sent to " + email + ". Tap the button or link in it. If the email shows a code, you can type it here instead.";
      sent.focus();
    };
    wireCode();
  }
  function wireCode() {
    var f2 = document.getElementById("codeForm"); if (!f2) return;
    f2.onsubmit = async function (e) {
      e.preventDefault();
      var msg = document.getElementById("staffMsg"), code = document.getElementById("staffCode").value.replace(/\D/g, ""), email = document.getElementById("staffEmail").value.trim();
      if (!code) { msg.textContent = "Type the code from the email first."; document.getElementById("staffCode").focus(); return; }
      msg.textContent = "Checking the code…";
      var r = await sb.auth.verifyOtp({ email: email, token: code, type: "email" });
      if (r.error) { msg.textContent = "That code didn't work. It may have run out, or a newer email has a newer code. " + r.error.message; return; }
      msg.textContent = "Signed in."; location.hash = "#admin";
    };
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountAuth); else mountAuth();
})();
