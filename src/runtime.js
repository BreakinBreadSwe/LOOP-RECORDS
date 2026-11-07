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
      if (!(await isStaff())) throw new Error("Only label staff can add sound files.");
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
      if (name === "assets") return (await isStaff()) ? assets : null;
      if (name === "downloads") return downloads;
      if (name === "user") { var s = await ready; return { id: s ? s.user.id : null, email: s ? s.user.email : null, canEdit: isStaff }; }
      return null;
    }
  };
  window.LoopBackend = { client: sb, token: token, isStaff: isStaff, ready: ready, audio: audio };

  // ---- staff sign-in (magic link) ----
  function el(tag, attrs, html) { var e = document.createElement(tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (html != null) e.innerHTML = html; return e; }
  function mountAuth() {
    var nav = document.getElementById("navAdmin"); if (!nav || !nav.parentNode) return;
    var btn = el("button", { type: "button", id: "staffBtn", "class": "staffbtn" });
    nav.parentNode.appendChild(btn);
    var dlg = el("dialog", { id: "staffDlg", "aria-labelledby": "staffTitle" },
      '<h2 id="staffTitle">Staff sign in</h2>' +
      '<form id="staffForm" class="staffform">' +
      '<p>We email you a sign-in link. Only label staff get the back office.</p>' +
      '<label for="staffEmail">Email</label><input id="staffEmail" name="email" type="email" autocomplete="email" required>' +
      '<div class="btnrow"><button class="btn primary" type="submit">Email me a link</button><button class="btn" type="button" data-close>Close</button></div></form>' +
      '<form id="codeForm" class="staffform" hidden>' +
      '<p id="sentMsg" tabindex="-1"></p>' +
      '<div class="btnrow"><button class="btn" type="button" id="staffAgain">Use another email</button><button class="btn primary" type="button" data-close>Close</button></div></form>' +
      '<p class="staffmsg" id="staffMsg" role="status" aria-live="polite"></p>');
    document.body.appendChild(dlg);
    var css = el("style", {}, ".staffbtn{font:inherit;font-weight:600;background:none;border:0;color:var(--muted);cursor:pointer;padding:4px 8px;border-radius:4px}.staffbtn:hover{color:var(--loop-text)}" +
      "#staffDlg{border:1px solid var(--line);background:var(--surface);color:var(--ink);border-radius:10px;padding:20px;max-width:min(420px,calc(100vw - 32px))}#staffDlg::backdrop{background:var(--scrim)}" +
      ".staffform label{display:block;font-weight:600;margin:12px 0 4px}.staffform input{width:100%;box-sizing:border-box;font:inherit;padding:8px 10px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--ink)}" +
      "#sentMsg{font-weight:600}.staffmsg{min-height:1.4em;color:var(--muted)}");
    document.head.appendChild(css);
    var f1 = document.getElementById("staffForm"), f2 = document.getElementById("codeForm"), msg = document.getElementById("staffMsg"), sentTo = "";
    function showStep(n) { f1.hidden = n !== 1; f2.hidden = n !== 2; msg.textContent = ""; }
    ready.then(function (s) {
      btn.textContent = s ? "Sign out" : "Staff sign in";
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
      sent.textContent = "Email sent to " + email + ". Open it in this same browser and tap Sign in. The email is called Your sign-in link and comes from Supabase Auth for now.";
      sent.focus();
    };
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountAuth); else mountAuth();
})();
