// ===================== Back office =====================
const S = {products:{}, orders:{}, events:{}, sync:{}, rights:{}, settings:{}};
let staff = false, dlNS = null, loaded = {}, adminChecked = false, adminEmail = "";
const ADMIN = [["admin","Overview"],["admin-products","Products"],["admin-orders","Orders"],["admin-events","Events and tickets"],["admin-sync","Sync licensing"],["admin-rights","Rights and splits"],["admin-royalties","Royalties"],["admin-export","Export"]];
// The back office (staff only) may name Breakin Bread; the public site never does.
ADMIN.push(["admin-bb","Breakin Bread"]);
const TYPES = {digital_release:"Digital release", digital_track:"Digital track", vinyl:"Vinyl", cd:"CD", cassette:"Cassette", merch:"Merch", ticket:"Ticket", bundle:"Bundle"};
const VAT = {digital_release:25,digital_track:25,vinyl:25,cd:25,cassette:25,merch:25,ticket:6,bundle:25};
const PHYS = new Set(["vinyl","cd","cassette","merch","bundle","ticket"]);
const OSTAT = {pending:"Pending",paid:"Paid",packed:"Packed",shipped:"Shipped",delivered:"Delivered",refunded:"Refunded",cancelled:"Cancelled"};
const PAIDLIKE = new Set(["paid","packed","shipped","delivered"]);
const SSTAT = {enquiry:"Enquiry",quoted:"Quoted",negotiating:"Negotiating",licensed:"Licensed",invoiced:"Invoiced",paid:"Paid",declined:"Declined"};
const MEDIA = {film:"Film",tv:"TV",advert:"Advert",game:"Game",online:"Online",trailer:"Trailer",other:"Other"};
const CHANNELS = {loop:"Loop web shop", event_door:"Event door", mail:"Mail order", discogs:"Discogs marketplace", bandcamp:"Bandcamp", other:"Other"};
CHANNELS.breakinbread = "Breakin Bread";
const PSTAT = {draft:"Draft", live:"Live", sold_out:"Sold out", archived:"Archived"};
const ESTAT = {draft:"Draft", on_sale:"On sale", sold_out:"Sold out", done:"Done", cancelled:"Cancelled"};
const ROLES = ["Artist","Producer","Remixer","Songwriter","Label","Publisher","Other"];
const REG = {unregistered:"Not registered", submitted:"Submitted", registered:"Registered"};

const money = m => (m==null||m==="") ? "not set" : (m/100).toLocaleString("sv-SE",{minimumFractionDigits:2,maximumFractionDigits:2})+" kr";
const toMinor = v => { const x=String(v??"").replace(/\s/g,"").replace(",","."); if(x==="") return null; const n=Math.round(parseFloat(x)*100); return Number.isFinite(n)?n:null; };
const fromMinor = m => m==null ? "" : (m/100).toFixed(2);
const toInt = v => { const x=String(v??"").trim(); if(x==="") return null; const n=parseInt(x,10); return Number.isFinite(n)?n:null; };
const uid = p => p+"-"+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const all = k => Object.values(S[k]);
const opt = (obj, cur) => Object.entries(obj).map(([k,l])=>`<option value="${k}"${k===cur?" selected":""}>${esc(l)}</option>`).join("");
const fval = (f,n) => f.elements[n] ? String(f.elements[n].value).trim() : "";
const dt = iso => iso ? new Date(iso).toLocaleDateString("sv-SE") : "";
const relLabel = r => `${r.catno} · ${artistLine(r)} · ${r.title}`;
const relOptions = (cur, blank="No release") => `<option value="">${blank}</option>`+R.map(r=>`<option value="${r.id}"${String(cur)===String(r.id)?" selected":""}>${esc(relLabel(r))}</option>`).join("");
const pill = (txt, kind) => `<span class="pill ${kind}">${esc(txt)}</span>`;
const clean = o => { const c = JSON.parse(JSON.stringify(o)); delete c._id; return c; };
function field(label, name, input, cls=""){ const id="f-"+name; return `<div class="field ${cls}"><label for="${id}">${label}</label>${input.replace("<X", `<input id="${id}" name="${name}"`).replace("<S", `<select id="${id}" name="${name}"`).replace("<T", `<textarea id="${id}" name="${name}"`)}</div>`; }
function setStatus(t){ const s=document.getElementById("admStatus"); if(s) s.textContent=t; announce(t); }
async function put(c,id,data){ data.updatedAt=new Date().toISOString(); await dbNS.doc(c+"/"+id).set(data); }
async function del(c,id){ await dbNS.doc(c+"/"+id).delete(); }
function armed(btn){ if(btn.dataset.armed==="1") return true; btn.dataset.armed="1"; const t=btn.textContent; btn.textContent="Confirm delete"; setTimeout(()=>{ if(btn.isConnected){ btn.dataset.armed=""; btn.textContent=t; } },5000); return false; }

async function initAdmin(db){
  try{ const u = await claude.use("user"); adminEmail = (u && u.email) || ""; staff = u ? await u.canEdit() : false; }catch(e){ staff=false; }
  adminChecked = true;
  if(!staff){ if(location.hash.startsWith("#admin")) route(); return; }
  document.getElementById("navAdmin").hidden=false;
  try{ dlNS = await claude.use("downloads"); }catch(e){}
  for(const k of Object.keys(S)){
    db.collection(k).onSnapshot(snap=>{ const o={}; snap.docs.forEach(d=>{ const v=d.exists&&d.data(); if(v) o[d.id]={...JSON.parse(JSON.stringify(v)), _id:d.id}; }); S[k]=o; loaded[k]=true; refreshAdmin(); },
      err=>setStatus("Couldn't load "+k+": "+(err&&err.message||err)));
  }
  if(location.hash.startsWith("#admin")) route();
}

function viewAdmin(h){
  setNav("admin");
  if(!staff){
    const note = !adminChecked ? "Connecting to the back office…"
      : adminEmail ? `You're signed in as ${esc(adminEmail)}, but this account isn't label staff yet. Ask Gordon to add you, then reload this page.`
      : "The back office is for label staff. Use Staff sign in at the top of the page.";
    main.innerHTML=`<h1>Back office</h1><p class="note" role="status">${note}</p>`; focusMain(); return; }
  const sec = ADMIN.some(a=>a[0]===h) ? h : "admin";
  main.innerHTML = `<nav class="subnav" aria-label="Back office sections">${ADMIN.map(([k,l])=>`<a href="#${k}"${k===sec?' aria-current="page"':""}>${l}</a>`).join("")}</nav>
    <div id="adm"></div><p class="status" id="admStatus" role="status"></p>`;
  const el=document.getElementById("adm");
  SECTIONS[sec](el);
  refreshAdmin();
  focusMain();
}
const LIVE = {};
function refreshAdmin(){ const el=document.getElementById("adm"); if(!el) return; el.querySelectorAll("[data-live]").forEach(n=>{ const f=LIVE[n.dataset.live]; if(f){ const a=document.activeElement, id=a&&a.id; n.innerHTML=f(); if(id&&n.contains(document.getElementById(id))===false&&!document.getElementById(id)){} else if(id&&document.getElementById(id)) document.getElementById(id).focus({preventScroll:true}); } }); }

// ---------- money helpers ----------
const lineNet = i => Math.round(i.unit*i.qty*100/(100+(i.vat??25)));
function paidOrders(from,to){ return all("orders").filter(o=>PAIDLIKE.has(o.status) && (!from || (o.paidAt||o.createdAt)>=from) && (!to || (o.paidAt||o.createdAt)<to)); }
function soldOf(productId){ return paidOrders().reduce((s,o)=>s+o.items.filter(i=>i.productId===productId).reduce((a,i)=>a+i.qty,0),0); }

// ---------- Overview ----------
LIVE.overview = () => {
  const now=new Date(), y0=new Date(now.getFullYear(),0,1).toISOString();
  const allPaid=paidOrders(), yr=paidOrders(y0);
  const sum = os => os.reduce((s,o)=>s+o.total,0);
  const toShip = all("orders").filter(o=>(o.status==="paid"||o.status==="packed") && o.items.some(i=>["vinyl","cd","cassette","merch","bundle"].includes(i.type)));
  const low = all("products").filter(p=>p.status==="live" && p.stock!=null && p.stock<=3);
  const upcoming = all("events").filter(e=>e.start && e.start>=now.toISOString() && e.status!=="cancelled").sort((a,b)=>a.start<b.start?-1:1);
  const open = all("sync").filter(d=>!["paid","declined"].includes(d.status));
  const relWithSales = new Set(allPaid.flatMap(o=>o.items.map(i=>i.releaseId)).filter(Boolean).map(String));
  const noSplits = [...relWithSales].filter(id=>!(S.rights[id]&&(S.rights[id].splits||[]).length));
  const rightsDone = R.filter(r=>S.rights[r.id]&&(S.rights[r.id].splits||[]).length).length;
  return `<dl class="facts">
    <dt>Sales this year</dt><dd>${money(sum(yr))} from ${yr.length} ${yr.length===1?"order":"orders"}</dd>
    <dt>Sales all time</dt><dd>${money(sum(allPaid))} from ${allPaid.length} ${allPaid.length===1?"order":"orders"}</dd>
    <dt>To ship</dt><dd>${toShip.length?`<a href="#admin-orders">${toShip.length} ${toShip.length===1?"order":"orders"} waiting</a>`:"Nothing waiting"}</dd>
    <dt>Products</dt><dd>${all("products").length} in total, ${all("products").filter(p=>p.status==="live").length} live${low.length?`, ${pill(low.length+" low on stock","warn")}`:""}</dd>
    <dt>Next event</dt><dd>${upcoming[0]?`${esc(upcoming[0].name)}, ${dt(upcoming[0].start)}, ${esc(upcoming[0].venue||"")}`:"None scheduled"}</dd>
    <dt>Sync pipeline</dt><dd>${open.length} open ${open.length===1?"deal":"deals"} worth ${money(open.reduce((s,d)=>s+(d.fee||0),0))}</dd>
    <dt>Rights</dt><dd>${rightsDone} of ${R.length} releases have splits${noSplits.length?`. ${pill(noSplits.length+" selling without splits","bad")}`:""}</dd>
  </dl>
  ${low.length?`<h2>Low stock</h2><ul>${low.map(p=>`<li>${esc(p.title)} (${esc(TYPES[p.type])}): ${p.stock} left</li>`).join("")}</ul>`:""}`;
};
const SECTIONS = {};
SECTIONS["admin"] = el => {
  el.innerHTML = `<h1>Back office</h1>
  <p class="lede">Catalog, store, orders, events, sync and royalties for Loop Records and Plumphouse. Only label staff can see this.</p>
  <div data-live="overview"></div>`;
};

// ---------- Products ----------
let prodFilter="all";
LIVE.products = () => {
  const ps = all("products").filter(p=>prodFilter==="all"||p.type===prodFilter||p.status===prodFilter).sort((a,b)=>(a.sku||"").localeCompare(b.sku||""));
  if(!all("products").length) return `<p class="note">No products yet. Add one with the form above, or create draft digital editions for the whole catalog in one go.</p>`;
  return `<div class="tblwrap"><table class="tbl"><caption>${ps.length} ${ps.length===1?"product":"products"}</caption>
    <thead><tr><th scope="col">SKU</th><th scope="col">Product</th><th scope="col">Type</th><th scope="col" class="num">Price</th><th scope="col" class="num">Stock</th><th scope="col" class="num">Sold</th><th scope="col">Status</th><th scope="col"><span class="sr">Actions</span></th></tr></thead>
    <tbody>${ps.map(p=>`<tr><td>${esc(p.sku)}</td><th scope="row">${esc(p.title)}${p.variant?` <span class="muted">(${esc(p.variant)})</span>`:""}</th><td>${esc(TYPES[p.type]||p.type)}</td>
      <td class="num">${money(p.price)}</td><td class="num">${p.stock==null?"No limit":p.stock}</td><td class="num">${soldOf(p._id)}</td>
      <td>${pill(PSTAT[p.status]||p.status, p.status==="live"?"ok":p.status==="sold_out"?"warn":"neutral")}</td>
      <td class="acts"><button type="button" class="btn small" data-act="edit" data-id="${p._id}" aria-label="Edit ${esc(p.title)}">Edit</button>
      <button type="button" class="btn small danger" data-act="del" data-id="${p._id}" aria-label="Delete ${esc(p.title)}">Delete</button></td></tr>`).join("")}</tbody></table></div>`;
};
function productForm(p={}){
  return `<form class="form" id="pForm"><h2 class="full">${p._id?"Edit product":"New product"}</h2>
    <input type="hidden" name="docid" value="${esc(p._id||"")}">
    ${field("Type","type",`<S>${opt(TYPES,p.type||"vinyl")}</select>`)}
    ${field("Release","releaseId",`<S>${relOptions(p.releaseId,"Not tied to a release")}</select>`,"wide")}
    ${field("Event, for tickets","eventId",`<S><option value="">No event</option>${all("events").map(e=>`<option value="${e._id}"${p.eventId===e._id?" selected":""}>${esc(e.name)}</option>`).join("")}</select>`)}
    ${field("Title","title",`<X value="${esc(p.title||"")}" placeholder="Filled from the release if left empty">`,"wide")}
    ${field("Variant","variant",`<X value="${esc(p.variant||"")}" placeholder="Reissue, 180g, size M">`)}
    ${field("SKU","sku",`<X value="${esc(p.sku||"")}" placeholder="Made for you if empty">`)}
    ${field("Price incl. VAT, kr","price",`<X inputmode="decimal" value="${fromMinor(p.price)}">`)}
    ${field("VAT %","vat",`<X inputmode="decimal" value="${p.vat??""}" placeholder="25, tickets 6">`)}
    ${field("Stock","stock",`<X inputmode="numeric" value="${p.stock??""}" placeholder="Empty means no limit">`)}
    ${field("Weight, grams","weight",`<X inputmode="numeric" value="${p.weight??""}">`)}
    ${field("Status","status",`<S>${opt(PSTAT,p.status||"draft")}</select>`)}
    <div class="btnrow full"><button class="btn primary" type="submit">${p._id?"Save product":"Add product"}</button>${p._id?`<button class="btn" type="button" data-act="new">New product instead</button>`:""}</div></form>`;
}
SECTIONS["admin-products"] = el => {
  el.innerHTML = `<h1>Products</h1>
  <p class="lede">Everything the label sells: downloads, vinyl, CDs, cassettes, merch, bundles and tickets. Prices include VAT.</p>
  <div id="pFormWrap">${productForm()}</div>
  <div class="btnrow"><button type="button" class="btn" data-act="bulkdig">Create draft digital editions for every release</button>
  <label class="theme" for="pFilter">Show</label><select id="pFilter" class="sel"><option value="all">All products</option>${opt(TYPES)}${opt(PSTAT)}</select></div>
  <div data-live="products"></div>`;
  const wrap=el.querySelector("#pFormWrap");
  el.querySelector("#pFilter").value=prodFilter;
  el.querySelector("#pFilter").onchange=e=>{ prodFilter=e.target.value; refreshAdmin(); };
  el.onsubmit = async e => { if(e.target.id!=="pForm") return; e.preventDefault(); const f=e.target;
    const type=fval(f,"type"), rel=byId.get(fval(f,"releaseId"));
    let title=fval(f,"title") || (rel? `${artistLine(rel)} - ${rel.title}` : "");
    if(!title){ setStatus("Give the product a title, or pick a release."); f.elements.title.focus(); return; }
    const price=toMinor(fval(f,"price")), status=fval(f,"status");
    if(status==="live" && price==null){ setStatus("A live product needs a price."); f.elements.price.focus(); return; }
    const id=fval(f,"docid")||uid("p");
    const sku=fval(f,"sku") || ((rel?rel.catno.replace(/\s+/g,"").toUpperCase():"LR")+"-"+({digital_release:"DIG",digital_track:"TRK",vinyl:"LP",cd:"CD",cassette:"MC",merch:"MER",ticket:"TIX",bundle:"BND"}[type])+(fval(f,"variant")?"-"+fval(f,"variant").toUpperCase().replace(/[^A-Z0-9]+/g,"").slice(0,8):""));
    const dup = all("products").find(p=>p.sku===sku && p._id!==id);
    if(dup){ setStatus("SKU "+sku+" is already used by "+dup.title+". Choose another SKU."); f.elements.sku.focus(); return; }
    const vatIn=fval(f,"vat");
    const doc={sku,type,releaseId:rel?rel.id:null,eventId:fval(f,"eventId")||null,title,variant:fval(f,"variant"),price,vat:vatIn===""?VAT[type]:parseFloat(vatIn.replace(",",".")),
      stock:toInt(fval(f,"stock")),weight:toInt(fval(f,"weight")),status,createdAt:(S.products[id]&&S.products[id].createdAt)||new Date().toISOString()};
    try{ await put("products",id,doc); setStatus("Saved "+title+"."); wrap.innerHTML=productForm(); }catch(err){ setStatus("Couldn't save: "+(err&&err.message||err)); }
  };
  el.onclick = async e => { const b=e.target.closest("[data-act]"); if(!b) return; const a=b.dataset.act;
    if(a==="edit"){ wrap.innerHTML=productForm(S.products[b.dataset.id]); wrap.querySelector("select,input:not([type=hidden])").focus(); wrap.scrollIntoView({block:"start"}); }
    if(a==="new"){ wrap.innerHTML=productForm(); wrap.querySelector("select").focus(); }
    if(a==="del"){ if(!armed(b)) return; try{ const t=S.products[b.dataset.id].title; await del("products",b.dataset.id); setStatus("Deleted "+t+"."); }catch(err){ setStatus("Couldn't delete: "+(err&&err.message||err)); } }
    if(a==="bulkdig"){ const have=new Set(all("products").filter(p=>p.type==="digital_release").map(p=>String(p.releaseId)));
      const todo=R.filter(r=>r.group!=="related" && !have.has(String(r.id)));
      if(!todo.length){ setStatus("Every release already has a digital edition."); return; }
      b.disabled=true; let n=0;
      for(const r of todo){ try{ await put("products",uid("p"),{sku:r.catno.replace(/\s+/g,"").toUpperCase()+"-DIG",type:"digital_release",releaseId:r.id,eventId:null,title:`${artistLine(r)} - ${r.title}`,variant:"",price:null,vat:25,stock:null,weight:null,status:"draft",createdAt:new Date().toISOString()}); n++; if(n%10===0) setStatus(`Created ${n} of ${todo.length}…`); }catch(err){ setStatus("Stopped after "+n+": "+(err&&err.message||err)); break; } }
      b.disabled=false; setStatus(`Created ${n} draft digital editions. Set a price on each, then switch them to Live.`); }
  };
};

// ---------- Orders ----------
let orderFilter="open";
const code6 = () => Array.from(crypto.getRandomValues(new Uint8Array(6)),x=>"ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[x%32]).join("");
function nextNumber(){ const y=new Date().getFullYear(); const n=all("orders").filter(o=>(o.number||"").startsWith("LR-"+y)).length+1; return `LR-${y}-${String(n).padStart(4,"0")}`; }
function productOptions(cur){ return `<option value="">Choose a product</option>`+all("products").filter(p=>p.status!=="archived"||p._id===cur).sort((a,b)=>a.title.localeCompare(b.title)).map(p=>`<option value="${p._id}"${p._id===cur?" selected":""}>${esc(p.title)}${p.variant?" ("+esc(p.variant)+")":""}, ${esc(TYPES[p.type])}, ${money(p.price)}</option>`).join(""); }
function itemRow(it={}){ return `<div class="itemrow" role="group" aria-label="Order line">
  <label class="field wide">Product<select name="ip">${productOptions(it.productId)}</select></label>
  <label class="field">Quantity<input name="iq" type="number" min="1" value="${it.qty||1}"></label>
  <button type="button" class="btn small" data-act="rmitem">Remove line</button></div>`; }
function orderForm(o={}){
  const c=o.customer||{};
  return `<form class="form" id="oForm"><h2 class="full">${o._id?"Edit order "+esc(o.number):"Record an order"}</h2>
    <input type="hidden" name="docid" value="${esc(o._id||"")}">
    ${field("Customer name","cname",`<X value="${esc(c.name||"")}" autocomplete="off">`)}
    ${field("Email","cemail",`<X type="email" value="${esc(c.email||"")}" autocomplete="off">`)}
    ${field("Country","ccountry",`<X value="${esc(c.country||"Sweden")}">`)}
    ${field("Delivery address","caddress",`<T rows="2">${esc(c.address||"")}</textarea>`,"wide")}
    ${field("Channel","channel",`<S>${opt(CHANNELS,o.channel||"loop")}</select>`)}
    ${field("Status","status",`<S>${opt(OSTAT,o.status||"paid")}</select>`)}
    ${field("Shipping incl. VAT, kr","ship",`<X inputmode="decimal" value="${fromMinor(o.ship)}">`)}
    ${field("Tracking number","tracking",`<X value="${esc(o.tracking||"")}">`)}
    <fieldset class="full"><legend>Products</legend><div id="items">${(o.items&&o.items.length?o.items:[{}]).map(itemRow).join("")}</div>
      <button type="button" class="btn small" data-act="additem">Add another product</button></fieldset>
    ${field("Note","note",`<T rows="2">${esc(o.note||"")}</textarea>`,"full")}
    <div class="btnrow full"><button class="btn primary" type="submit">${o._id?"Save order":"Record order"}</button>${o._id?`<button class="btn" type="button" data-act="new">New order instead</button>`:""}</div></form>`;
}
async function syncStock(prev, o){
  const want = PAIDLIKE.has(o.status), delta = {};
  if(want) o.items.forEach(i=>delta[i.productId]=(delta[i.productId]||0)+i.qty);
  if(prev && prev.stockApplied) prev.items.forEach(i=>delta[i.productId]=(delta[i.productId]||0)-i.qty);
  for(const [pid,d] of Object.entries(delta)){ const p=S.products[pid]; if(!p||p.stock==null||!d) continue;
    const np=clean(p); np.stock=Math.max(0,p.stock-d); if(np.stock===0&&np.status==="live") np.status="sold_out"; if(np.stock>0&&np.status==="sold_out") np.status="live"; await put("products",pid,np); }
  o.stockApplied = want;
}
function codesFor(prevItem,q){ const c=(prevItem&&prevItem.codes||[]).slice(0,q); while(c.length<q) c.push(code6()); return c; }
async function saveOrderDoc(id, prev, o){
  if(PAIDLIKE.has(o.status)) o.paidAt = (prev&&prev.paidAt) || new Date().toISOString(); else o.paidAt = prev&&prev.paidAt || null;
  await syncStock(prev, o); await put("orders", id, o);
}
LIVE.orders = () => {
  const os = all("orders").filter(o=> orderFilter==="all" || (orderFilter==="open" ? ["pending","paid","packed"].includes(o.status) : o.status===orderFilter)).sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||""));
  if(!all("orders").length) return `<p class="note">No orders yet. Record sales from mail order, the event door or other shops with the form above.</p>`;
  return `<div class="tblwrap"><table class="tbl"><caption>${os.length} ${os.length===1?"order":"orders"}</caption>
  <thead><tr><th scope="col">Order</th><th scope="col">Date</th><th scope="col">Customer</th><th scope="col">Items</th><th scope="col" class="num">Total</th><th scope="col">Status</th><th scope="col"><span class="sr">Actions</span></th></tr></thead>
  <tbody>${os.map(o=>`<tr><th scope="row">${esc(o.number)}</th><td>${dt(o.createdAt)}</td><td>${esc((o.customer&&o.customer.name)||"No name")}<br><span class="muted">${esc(CHANNELS[o.channel]||"")}</span></td>
    <td>${o.items.map(i=>`${i.qty} × ${esc(i.title)}`).join("<br>")}</td><td class="num">${money(o.total)}<br><span class="muted">VAT ${money(o.vat)}</span></td>
    <td><label class="sr" for="os-${o._id}">Status of ${esc(o.number)}</label><select id="os-${o._id}" data-status="${o._id}">${opt(OSTAT,o.status)}</select></td>
    <td class="acts"><button type="button" class="btn small" data-act="edit" data-id="${o._id}" aria-label="Edit order ${esc(o.number)}">Edit</button>
    <button type="button" class="btn small danger" data-act="del" data-id="${o._id}" aria-label="Delete order ${esc(o.number)}">Delete</button></td></tr>`).join("")}</tbody></table></div>`;
};
SECTIONS["admin-orders"] = el => {
  el.innerHTML = `<h1>Orders</h1><p class="lede">Every sale, from any channel. Marking an order paid takes the items out of stock. Refunding or cancelling puts them back.</p>
  <div id="oFormWrap">${orderForm()}</div>
  <div class="btnrow"><label class="theme" for="oFilter">Show</label><select id="oFilter" class="sel"><option value="open">Open orders</option><option value="all">All orders</option>${opt(OSTAT)}</select></div>
  <div data-live="orders"></div>`;
  const wrap=el.querySelector("#oFormWrap");
  el.querySelector("#oFilter").value=orderFilter;
  el.querySelector("#oFilter").onchange=e=>{ orderFilter=e.target.value; refreshAdmin(); };
  el.onsubmit = async e => { if(e.target.id!=="oForm") return; e.preventDefault(); const f=e.target;
    const id=fval(f,"docid")||uid("o"), prev=S.orders[id];
    const items=[...f.querySelectorAll(".itemrow")].map(row=>{ const p=S.products[row.querySelector("[name=ip]").value]; if(!p) return null; const q=Math.max(1,parseInt(row.querySelector("[name=iq]").value,10)||1);
      const pi=prev&&prev.items.find(i=>i.productId===p._id);
      return {productId:p._id, sku:p.sku, title:p.title+(p.variant?" ("+p.variant+")":""), type:p.type, releaseId:p.releaseId||null, eventId:p.eventId||null, qty:q, unit: pi?pi.unit:(p.price||0), vat: p.vat??VAT[p.type], codes: p.type==="ticket"?codesFor(pi,q):[]}; }).filter(Boolean);
    if(!items.length){ setStatus("Add at least one product to the order."); f.querySelector("[name=ip]").focus(); return; }
    const noPrice=items.find(i=>!i.unit); if(noPrice){ setStatus(noPrice.title+" has no price yet. Set it under Products first."); return; }
    const ship=toMinor(fval(f,"ship"))||0;
    const total=items.reduce((s,i)=>s+i.unit*i.qty,0)+ship;
    const vat=Math.round(items.reduce((s,i)=>s+i.unit*i.qty*i.vat/(100+i.vat),0)+ship*25/125);
    const o={number:prev?prev.number:nextNumber(), createdAt:prev?prev.createdAt:new Date().toISOString(),
      customer:{name:fval(f,"cname"),email:fval(f,"cemail"),country:fval(f,"ccountry"),address:fval(f,"caddress")},
      channel:fval(f,"channel"), status:fval(f,"status"), items, ship, total, vat, currency:"SEK", tracking:fval(f,"tracking"), note:fval(f,"note"),
      checkedIn: prev?(prev.checkedIn||[]):[], stockApplied: prev?!!prev.stockApplied:false};
    try{ await saveOrderDoc(id, prev, o); setStatus(`Saved order ${o.number}, ${money(total)}.`); wrap.innerHTML=orderForm(); }catch(err){ setStatus("Couldn't save the order: "+(err&&err.message||err)); }
  };
  el.onchange = async e => { const s=e.target.closest("[data-status]"); if(!s) return; const id=s.dataset.status, prev=S.orders[id]; const o=clean(prev); o.status=s.value;
    try{ await saveOrderDoc(id, prev, o); setStatus(`${o.number} is now ${OSTAT[o.status].toLowerCase()}.`); }catch(err){ setStatus("Couldn't change status: "+(err&&err.message||err)); } };
  el.onclick = async e => { const b=e.target.closest("[data-act]"); if(!b) return; const a=b.dataset.act;
    if(a==="additem"){ el.querySelector("#items").insertAdjacentHTML("beforeend", itemRow()); const s=el.querySelectorAll("#items [name=ip]"); s[s.length-1].focus(); }
    if(a==="rmitem"){ const rows=el.querySelectorAll("#items .itemrow"); if(rows.length>1){ b.closest(".itemrow").remove(); el.querySelector("#items [name=ip]").focus(); } }
    if(a==="edit"){ wrap.innerHTML=orderForm(S.orders[b.dataset.id]); wrap.querySelector("input:not([type=hidden])").focus(); wrap.scrollIntoView({block:"start"}); }
    if(a==="new"){ wrap.innerHTML=orderForm(); wrap.querySelector("input:not([type=hidden])").focus(); }
    if(a==="del"){ if(!armed(b)) return; const prev=S.orders[b.dataset.id]; try{ const o=clean(prev); o.status="cancelled"; await syncStock(prev,o); await del("orders",b.dataset.id); setStatus("Deleted order "+prev.number+"."); }catch(err){ setStatus("Couldn't delete: "+(err&&err.message||err)); } }
  };
};

// ---------- Events and tickets ----------
let doorFor=null;
function eventForm(ev={}){
  return `<form class="form" id="eForm"><h2 class="full">${ev._id?"Edit event":"New event"}</h2>
  <input type="hidden" name="docid" value="${esc(ev._id||"")}">
  ${field("Event name","name",`<X value="${esc(ev.name||"")}">`,"wide")}
  ${field("Starts","start",`<X type="datetime-local" value="${esc((ev.start||"").slice(0,16))}">`)}
  ${field("Venue","venue",`<X value="${esc(ev.venue||"")}">`)}
  ${field("City","city",`<X value="${esc(ev.city||"Stockholm")}">`)}
  ${field("Capacity","capacity",`<X inputmode="numeric" value="${ev.capacity??""}">`)}
  ${field("Status","status",`<S>${opt(ESTAT,ev.status||"draft")}</select>`)}
  ${field("Line-up, separated by commas","lineup",`<X value="${esc((ev.lineup||[]).join(", "))}" list="peopleList">`,"wide")}
  ${field("Description","desc",`<T rows="3">${esc(ev.desc||"")}</textarea>`,"full")}
  <div class="btnrow full"><button class="btn primary" type="submit">${ev._id?"Save event":"Add event"}</button>${ev._id?`<button class="btn" type="button" data-act="new">New event instead</button>`:""}</div></form>`;
}
function tickets(eid){ return paidOrders().flatMap(o=>o.items.filter(i=>i.eventId===eid).flatMap(i=>(i.codes||[]).map(c=>({code:c,tier:i.title,holder:(o.customer&&o.customer.name)||"No name",orderId:o._id,number:o.number,checked:(o.checkedIn||[]).includes(c)})))); }
LIVE.events = () => {
  const es=all("events").sort((a,b)=>(a.start||"").localeCompare(b.start||""));
  if(!es.length) return `<p class="note">No events yet. Add one above, then add ticket tiers to it.</p>`;
  return es.map(ev=>{ const tiers=all("products").filter(p=>p.type==="ticket"&&p.eventId===ev._id); const tk=tickets(ev._id); const inn=tk.filter(t=>t.checked).length;
    return `<section class="evcard" aria-labelledby="ev-${ev._id}"><h2 id="ev-${ev._id}">${esc(ev.name)}</h2>
    <p>${ev.start?new Date(ev.start).toLocaleString("sv-SE",{dateStyle:"long",timeStyle:"short"}):"Date not set"}${ev.venue?", "+esc(ev.venue):""}${ev.city?", "+esc(ev.city):""}. ${pill(ESTAT[ev.status]||ev.status, ev.status==="on_sale"?"ok":ev.status==="cancelled"?"bad":"neutral")}</p>
    <p>${tk.length} tickets sold${ev.capacity?` of ${ev.capacity}`:""}, ${inn} checked in.${(ev.lineup||[]).length?" Line-up: "+ev.lineup.map(esc).join(", ")+".":""}</p>
    ${tiers.length?`<div class="tblwrap"><table class="tbl"><caption class="sr">Ticket tiers for ${esc(ev.name)}</caption><thead><tr><th scope="col">Tier</th><th scope="col" class="num">Price</th><th scope="col" class="num">Sold</th><th scope="col" class="num">Left</th><th scope="col">Status</th></tr></thead>
      <tbody>${tiers.map(p=>`<tr><th scope="row">${esc(p.variant||p.title)}</th><td class="num">${money(p.price)}</td><td class="num">${soldOf(p._id)}</td><td class="num">${p.stock==null?"No limit":p.stock}</td><td>${pill(PSTAT[p.status],p.status==="live"?"ok":"neutral")}</td></tr>`).join("")}</tbody></table></div>`:`<p class="note">No ticket tiers yet.</p>`}
    <div class="btnrow"><button type="button" class="btn small" data-act="edit" data-id="${ev._id}">Edit event</button>
      <button type="button" class="btn small" data-act="tier" data-id="${ev._id}">Add ticket tier</button>
      <button type="button" class="btn small" data-act="door" data-id="${ev._id}" aria-expanded="${doorFor===ev._id}">Door list</button>
      <button type="button" class="btn small danger" data-act="del" data-id="${ev._id}" aria-label="Delete ${esc(ev.name)}">Delete</button></div>
    ${doorFor===ev._id?`<div class="door"><form class="inline" id="ciForm" data-ev="${ev._id}"><label for="ciCode">Check in by ticket code</label><input id="ciCode" name="code" autocomplete="off" autocapitalize="characters"><button class="btn small primary" type="submit">Check in</button></form>
      ${tk.length?`<div class="tblwrap"><table class="tbl"><caption class="sr">Door list</caption><thead><tr><th scope="col">Code</th><th scope="col">Name</th><th scope="col">Tier</th><th scope="col">Checked in</th></tr></thead>
      <tbody>${tk.sort((a,b)=>a.holder.localeCompare(b.holder)).map(t=>`<tr><th scope="row">${t.code}</th><td>${esc(t.holder)}</td><td>${esc(t.tier)}</td><td><button type="button" class="btn small${t.checked?" primary":""}" data-act="ci" data-o="${t.orderId}" data-c="${t.code}" aria-pressed="${t.checked}" aria-label="${esc(t.holder)}, ticket ${t.code}, checked in">${t.checked?"Yes":"No"}</button></td></tr>`).join("")}</tbody></table></div>`:`<p class="note">No tickets sold yet.</p>`}</div>`:""}
    </section>`; }).join("");
};
SECTIONS["admin-events"] = el => {
  el.innerHTML = `<h1>Events and tickets</h1><p class="lede">Club nights, launches and showcases. Ticket tiers are products, so they sell through Orders, take VAT at 6 percent and count down from their capacity.</p>
  <div id="eFormWrap">${eventForm()}</div>
  <form class="form" id="tForm" hidden><h2 class="full">Add ticket tier</h2>
    ${field("Event","tev",`<S></select>`)}
    ${field("Tier name","tname",`<X placeholder="Early bird, Door, Guest list">`)}
    ${field("Price incl. VAT, kr","tprice",`<X inputmode="decimal">`)}
    ${field("Tickets available","tqty",`<X inputmode="numeric">`)}
    <div class="btnrow full"><button class="btn primary" type="submit">Add tier</button><button class="btn" type="button" data-act="tcancel">Cancel</button></div></form>
  <div data-live="events"></div>`;
  const wrap=el.querySelector("#eFormWrap"), tf=el.querySelector("#tForm");
  el.onsubmit = async e => { e.preventDefault(); const f=e.target;
    if(f.id==="eForm"){ const name=fval(f,"name"); if(!name){ setStatus("Give the event a name."); f.elements.name.focus(); return; }
      const id=fval(f,"docid")||uid("e"); const start=fval(f,"start");
      const doc={name,start:start?new Date(start).toISOString():null,venue:fval(f,"venue"),city:fval(f,"city"),capacity:toInt(fval(f,"capacity")),status:fval(f,"status"),lineup:fval(f,"lineup").split(",").map(x=>x.trim()).filter(Boolean),desc:fval(f,"desc")};
      try{ await put("events",id,doc); setStatus("Saved "+name+"."); wrap.innerHTML=eventForm(); }catch(err){ setStatus("Couldn't save: "+(err&&err.message||err)); } }
    if(f.id==="tForm"){ const ev=S.events[fval(f,"tev")], tn=fval(f,"tname"), pr=toMinor(fval(f,"tprice"));
      if(!ev||!tn||pr==null){ setStatus("Fill in the tier name and price."); return; }
      try{ await put("products",uid("p"),{sku:"TIX-"+ev._id.slice(-5).toUpperCase()+"-"+tn.toUpperCase().replace(/[^A-Z0-9]+/g,"").slice(0,8),type:"ticket",releaseId:null,eventId:ev._id,title:ev.name,variant:tn,price:pr,vat:6,stock:toInt(fval(f,"tqty")),weight:null,status:"live",createdAt:new Date().toISOString()});
        setStatus(`Added ${tn} tickets for ${ev.name}.`); tf.hidden=true; tf.reset(); }catch(err){ setStatus("Couldn't add the tier: "+(err&&err.message||err)); } }
    if(f.id==="ciForm"){ const code=String(f.elements.code.value).trim().toUpperCase(); const t=tickets(f.dataset.ev).find(x=>x.code===code);
      if(!t){ setStatus("No ticket "+code+" for this event."); return; }
      if(t.checked){ setStatus(`${t.holder} is already checked in.`); return; }
      await toggleCheck(t.orderId,t.code); setStatus(`Checked in ${t.holder}, ${t.tier}.`); }
  };
  el.onclick = async e => { const b=e.target.closest("[data-act]"); if(!b) return; const a=b.dataset.act;
    if(a==="edit"){ wrap.innerHTML=eventForm(S.events[b.dataset.id]); wrap.querySelector("input:not([type=hidden])").focus(); wrap.scrollIntoView({block:"start"}); }
    if(a==="new"){ wrap.innerHTML=eventForm(); wrap.querySelector("input:not([type=hidden])").focus(); }
    if(a==="tier"){ const s=tf.querySelector("[name=tev]"); s.innerHTML=all("events").map(ev=>`<option value="${ev._id}">${esc(ev.name)}</option>`).join(""); s.value=b.dataset.id; tf.hidden=false; tf.querySelector("[name=tname]").focus(); }
    if(a==="tcancel"){ tf.hidden=true; }
    if(a==="door"){ doorFor = doorFor===b.dataset.id?null:b.dataset.id; refreshAdmin(); const c=document.getElementById("ciCode"); if(c) c.focus(); }
    if(a==="ci"){ await toggleCheck(b.dataset.o,b.dataset.c); }
    if(a==="del"){ if(!armed(b)) return; try{ const n=S.events[b.dataset.id].name; await del("events",b.dataset.id); setStatus("Deleted "+n+". Its ticket products are kept; archive them under Products."); }catch(err){ setStatus("Couldn't delete: "+(err&&err.message||err)); } }
  };
};
async function toggleCheck(oid, code){ const o=clean(S.orders[oid]); const s=new Set(o.checkedIn||[]); s.has(code)?s.delete(code):s.add(code); o.checkedIn=[...s];
  try{ await put("orders",oid,o); announce(s.has(code)?"Checked in":"Check-in removed"); }catch(err){ setStatus("Couldn't update check-in: "+(err&&err.message||err)); } }

// ---------- Sync licensing ----------
function trackOptions(rid, cur){ const r=byId.get(String(rid)); if(!r) return `<option value="">Pick a release first</option>`; return `<option value="">Whole release</option>`+r.tracks.map(t=>`<option${t.title===cur?" selected":""}>${esc(t.title)}</option>`).join(""); }
function syncForm(d={}){
  return `<form class="form" id="sForm"><h2 class="full">${d._id?"Edit deal":"New sync deal"}</h2>
  <input type="hidden" name="docid" value="${esc(d._id||"")}">
  ${field("Licensee","licensee",`<X value="${esc(d.licensee||"")}" placeholder="Production or agency">`)}
  ${field("Contact","contact",`<X value="${esc(d.contact||"")}">`)}
  ${field("Project","project",`<X value="${esc(d.project||"")}">`)}
  ${field("Media","media",`<S>${opt(MEDIA,d.media||"film")}</select>`)}
  ${field("Release","releaseId",`<S>${relOptions(d.releaseId,"Choose a release")}</select>`,"wide")}
  ${field("Track","track",`<S>${trackOptions(d.releaseId,d.track)}</select>`)}
  ${field("Territory","territory",`<X value="${esc(d.territory||"World")}">`)}
  ${field("Term","term",`<X value="${esc(d.term||"")}" placeholder="Perpetual, 2 years">`)}
  ${field("Fee excl. VAT, kr","fee",`<X inputmode="decimal" value="${fromMinor(d.fee)}">`)}
  ${field("Status","status",`<S>${opt(SSTAT,d.status||"enquiry")}</select>`)}
  ${field("Due date","due",`<X type="date" value="${esc(d.due||"")}">`)}
  ${field("Note","note",`<T rows="2">${esc(d.note||"")}</textarea>`,"full")}
  <div class="btnrow full"><button class="btn primary" type="submit">${d._id?"Save deal":"Add deal"}</button>${d._id?`<button class="btn" type="button" data-act="new">New deal instead</button>`:""}</div></form>`;
}
LIVE.sync = () => {
  const ds=all("sync").sort((a,b)=>Object.keys(SSTAT).indexOf(a.status)-Object.keys(SSTAT).indexOf(b.status));
  if(!ds.length) return `<p class="note">No sync deals yet. Log every enquiry here, from first email to paid.</p>`;
  const sums=Object.keys(SSTAT).map(k=>{ const g=ds.filter(d=>d.status===k); return g.length?`${SSTAT[k]}: ${g.length}, ${money(g.reduce((s,d)=>s+(d.fee||0),0))}`:null; }).filter(Boolean);
  return `<p>${sums.join(". ")}.</p><div class="tblwrap"><table class="tbl"><caption>${ds.length} ${ds.length===1?"deal":"deals"}</caption>
  <thead><tr><th scope="col">Licensee and project</th><th scope="col">Music</th><th scope="col">Media and terms</th><th scope="col" class="num">Fee</th><th scope="col">Status</th><th scope="col"><span class="sr">Actions</span></th></tr></thead>
  <tbody>${ds.map(d=>{ const r=byId.get(String(d.releaseId)); return `<tr><th scope="row">${esc(d.licensee)}<br><span class="muted">${esc(d.project||"")}</span></th>
    <td>${r?esc(r.catno)+" "+esc(r.title):"No release"}${d.track?"<br>"+esc(d.track):""}</td><td>${esc(MEDIA[d.media]||"")}, ${esc(d.territory||"")}${d.term?", "+esc(d.term):""}</td>
    <td class="num">${money(d.fee)}</td><td>${pill(SSTAT[d.status], d.status==="paid"?"ok":d.status==="declined"?"bad":"warn")}${d.due?`<br><span class="muted">Due ${esc(d.due)}</span>`:""}</td>
    <td class="acts"><button type="button" class="btn small" data-act="edit" data-id="${d._id}" aria-label="Edit deal with ${esc(d.licensee)}">Edit</button>
    <button type="button" class="btn small danger" data-act="del" data-id="${d._id}" aria-label="Delete deal with ${esc(d.licensee)}">Delete</button></td></tr>`; }).join("")}</tbody></table></div>`;
};
SECTIONS["admin-sync"] = el => {
  el.innerHTML = `<h1>Sync licensing</h1><p class="lede">Film, TV, adverts and games. Paid fees go into royalties using each release's splits.</p>
  <div id="sFormWrap">${syncForm()}</div><div data-live="sync"></div>`;
  const wrap=el.querySelector("#sFormWrap");
  el.onchange = e => { if(e.target.name==="releaseId" && e.target.form && e.target.form.id==="sForm"){ e.target.form.elements.track.innerHTML=trackOptions(e.target.value); } };
  el.onsubmit = async e => { if(e.target.id!=="sForm") return; e.preventDefault(); const f=e.target;
    const lic=fval(f,"licensee"); if(!lic){ setStatus("Who is licensing? Fill in the licensee."); f.elements.licensee.focus(); return; }
    const id=fval(f,"docid")||uid("s"), prev=S.sync[id], status=fval(f,"status");
    const doc={licensee:lic,contact:fval(f,"contact"),project:fval(f,"project"),media:fval(f,"media"),releaseId:fval(f,"releaseId")?Number(fval(f,"releaseId")):null,track:fval(f,"track"),territory:fval(f,"territory"),term:fval(f,"term"),fee:toMinor(fval(f,"fee")),status,due:fval(f,"due"),note:fval(f,"note"),
      paidAt: status==="paid" ? (prev&&prev.paidAt)||new Date().toISOString() : null, createdAt:(prev&&prev.createdAt)||new Date().toISOString()};
    try{ await put("sync",id,doc); setStatus("Saved the deal with "+lic+"."); wrap.innerHTML=syncForm(); }catch(err){ setStatus("Couldn't save: "+(err&&err.message||err)); } };
  el.onclick = async e => { const b=e.target.closest("[data-act]"); if(!b) return; const a=b.dataset.act;
    if(a==="edit"){ wrap.innerHTML=syncForm(S.sync[b.dataset.id]); wrap.querySelector("input:not([type=hidden])").focus(); wrap.scrollIntoView({block:"start"}); }
    if(a==="new"){ wrap.innerHTML=syncForm(); wrap.querySelector("input:not([type=hidden])").focus(); }
    if(a==="del"){ if(!armed(b)) return; try{ await del("sync",b.dataset.id); setStatus("Deleted the deal."); }catch(err){ setStatus("Couldn't delete: "+(err&&err.message||err)); } }
  };
};

// ---------- Rights and splits ----------
let rightsRel = null;
function splitRow(s={}){ return `<div class="itemrow" role="group" aria-label="Split">
  <label class="field wide">Party<input name="sp" value="${esc(s.name||"")}" list="peopleList" autocomplete="off"></label>
  <label class="field">Role<select name="sr">${ROLES.map(x=>`<option${x===(s.role||"Artist")?" selected":""}>${x}</option>`).join("")}</select></label>
  <label class="field">Share %<input name="ss" inputmode="decimal" value="${s.share??""}"></label>
  <button type="button" class="btn small" data-act="rmsplit">Remove</button></div>`; }
function rightsForm(r){
  const d=S.rights[r.id]||{}, tr=d.tracks||{};
  return `<form class="form" id="rForm"><h2 class="full">${esc(r.catno)} · ${esc(artistLine(r))} · ${esc(r.title)}</h2>
  ${field("UPC / EAN","upc",`<X value="${esc(d.upc||"")}" inputmode="numeric">`)}
  ${field("Catalog status","rstatus",`<S>${opt({catalog:"Back catalog",reissue_planned:"Reissue planned",live:"Live in stores",withdrawn:"Withdrawn"},d.status||"catalog")}</select>`)}
  <fieldset class="full"><legend>Revenue splits, must add up to 100 percent</legend><div id="splits">${(d.splits&&d.splits.length?d.splits:[]).map(splitRow).join("")}</div>
    <p class="status" id="splitTotal" aria-live="polite"></p>
    <div class="btnrow"><button type="button" class="btn small" data-act="addsplit">Add party</button><button type="button" class="btn small" data-act="suggest">Fill from the credited artists</button></div></fieldset>
  <fieldset class="full"><legend>Tracks: ISRC and registration</legend><div class="tblwrap"><table class="tbl"><thead><tr><th scope="col">Track</th><th scope="col">ISRC</th><th scope="col">STIM</th><th scope="col">SAMI</th></tr></thead><tbody>
    ${r.tracks.map(t=>{ const x=tr[t.pos]||{}; return `<tr><th scope="row">${esc(t.pos)} ${esc(t.title)}</th>
    <td><label class="sr" for="isrc-${esc(t.pos)}">ISRC for ${esc(t.title)}</label><input id="isrc-${esc(t.pos)}" data-pos="${esc(t.pos)}" data-k="isrc" value="${esc(x.isrc||"")}" placeholder="SE-XXX-26-00001"></td>
    <td><label class="sr" for="stim-${esc(t.pos)}">STIM for ${esc(t.title)}</label><select id="stim-${esc(t.pos)}" data-pos="${esc(t.pos)}" data-k="stim">${opt(REG,x.stim||"unregistered")}</select></td>
    <td><label class="sr" for="sami-${esc(t.pos)}">SAMI for ${esc(t.title)}</label><select id="sami-${esc(t.pos)}" data-pos="${esc(t.pos)}" data-k="sami">${opt(REG,x.sami||"unregistered")}</select></td></tr>`; }).join("")}
  </tbody></table></div></fieldset>
  ${field("Notes","rnote",`<T rows="2">${esc(d.note||"")}</textarea>`,"full")}
  <div class="btnrow full"><button class="btn primary" type="submit">Save rights</button></div></form>`;
}
function splitTotal(f){ const t=[...f.querySelectorAll("[name=ss]")].reduce((s,i)=>s+(parseFloat(String(i.value).replace(",","."))||0),0); const el=f.querySelector("#splitTotal"); if(el) el.textContent=`Total ${Math.round(t*1000)/1000} percent${Math.abs(t-100)<0.001?", balanced.":t?", needs to be 100.":""}`; return t; }
LIVE.rights = () => {
  const missing=R.filter(r=>!(S.rights[r.id]&&(S.rights[r.id].splits||[]).length));
  const noIsrc=R.reduce((n,r)=>n+r.tracks.filter(t=>!((S.rights[r.id]||{}).tracks||{})[t.pos]?.isrc).length,0);
  return `<p>${R.length-missing.length} of ${R.length} releases have splits. ${noIsrc} tracks have no ISRC yet.</p>`;
};
SECTIONS["admin-rights"] = el => {
  el.innerHTML = `<h1>Rights and splits</h1><p class="lede">Who gets what from each release, plus the codes needed for collecting societies. Credits come from the catalog, so every party links back to their page.</p>
  <div data-live="rights"></div>
  <div class="field wide"><label for="rRel">Release</label><select id="rRel">${relOptions(rightsRel,"Choose a release")}</select></div>
  <div id="rFormWrap"></div>`;
  const sel=el.querySelector("#rRel"), wrap=el.querySelector("#rFormWrap");
  const show = () => { const r=byId.get(sel.value); rightsRel=r?r.id:null; wrap.innerHTML=r?rightsForm(r):""; const f=wrap.querySelector("form"); if(f) splitTotal(f); };
  sel.onchange = show; show();
  el.oninput = e => { const f=e.target.form; if(f&&f.id==="rForm"&&e.target.name==="ss") splitTotal(f); };
  el.onclick = e => { const b=e.target.closest("[data-act]"); if(!b) return; const a=b.dataset.act, f=el.querySelector("#rForm"), box=el.querySelector("#splits");
    if(a==="addsplit"){ box.insertAdjacentHTML("beforeend",splitRow()); const s=box.querySelectorAll("[name=sp]"); s[s.length-1].focus(); }
    if(a==="rmsplit"){ b.closest(".itemrow").remove(); splitTotal(f); }
    if(a==="suggest"){ const r=byId.get(sel.value); const names=r.artists.length?r.artists:[{name:"Various artists"}]; const each=Math.floor(10000/names.length)/100; let rest=Math.round((100-each*names.length)*100)/100;
      box.innerHTML=names.map((x,i)=>splitRow({name:x.name,role:"Artist",share:i===0?Math.round((each+rest)*100)/100:each})).join(""); splitTotal(f); setStatus("Filled with the credited artists sharing 100 percent. Adjust for the label or producers."); box.querySelector("[name=ss]").focus(); }
  };
  el.onsubmit = async e => { if(e.target.id!=="rForm") return; e.preventDefault(); const f=e.target, r=byId.get(sel.value);
    const splits=[...f.querySelectorAll("#splits .itemrow")].map(row=>{ const name=row.querySelector("[name=sp]").value.trim(); const p=P.find(x=>x.name.toLowerCase()===name.toLowerCase()||x.aliases.some(a=>a.toLowerCase()===name.toLowerCase()));
      return {name, key:p?p.key:null, role:row.querySelector("[name=sr]").value, share:parseFloat(String(row.querySelector("[name=ss]").value).replace(",","."))||0}; }).filter(s=>s.name);
    const tot=splits.reduce((s,x)=>s+x.share,0);
    if(splits.length && Math.abs(tot-100)>0.001){ setStatus(`The splits add up to ${tot} percent. They need to add up to 100.`); return; }
    const tracks={}; f.querySelectorAll("[data-pos]").forEach(i=>{ (tracks[i.dataset.pos]=tracks[i.dataset.pos]||{})[i.dataset.k]=i.value.trim(); });
    try{ await put("rights",String(r.id),{catno:r.catno,upc:fval(f,"upc"),status:fval(f,"rstatus"),splits,tracks,note:fval(f,"rnote")}); setStatus("Saved rights for "+r.catno+"."); }catch(err){ setStatus("Couldn't save: "+(err&&err.message||err)); } };
};

// ---------- Royalties ----------
let royPeriod="all";
function periods(){ const y=new Date().getFullYear(), o={all:"All time"}; for(const yy of [y,y-1]){ o["y"+yy]=String(yy); for(let q=4;q>=1;q--) o[`q${yy}-${q}`]=`${yy} Q${q}`; } return o; }
function range(k){ if(k==="all") return [null,null]; if(k[0]==="y"){ const y=+k.slice(1); return [new Date(y,0,1).toISOString(), new Date(y+1,0,1).toISOString()]; } const [y,q]=k.slice(1).split("-").map(Number); return [new Date(y,(q-1)*3,1).toISOString(), new Date(y,q*3,1).toISOString()]; }
function statement(){
  const [from,to]=range(royPeriod), perRel={}, other={net:0};
  paidOrders(from,to).forEach(o=>o.items.forEach(i=>{ const n=lineNet(i); if(i.releaseId){ const k=String(i.releaseId); (perRel[k]=perRel[k]||{sales:0,sync:0}).sales+=n; } else other.net+=n; }));
  all("sync").filter(d=>d.status==="paid"&&d.releaseId&&(!from||d.paidAt>=from)&&(!to||d.paidAt<to)).forEach(d=>{ const k=String(d.releaseId); (perRel[k]=perRel[k]||{sales:0,sync:0}).sync+=(d.fee||0); });
  const parties={}, unalloc=[];
  for(const [rid,v] of Object.entries(perRel)){ const sp=(S.rights[rid]||{}).splits||[]; if(!sp.length){ unalloc.push({rid,...v}); continue; }
    sp.forEach(s=>{ const k=s.key||s.name; const p=parties[k]=parties[k]||{name:s.name,key:s.key,sales:0,sync:0,rels:{}}; const a=Math.round(v.sales*s.share/100), b=Math.round(v.sync*s.share/100); p.sales+=a; p.sync+=b; p.rels[rid]=(p.rels[rid]||0)+a+b; }); }
  return {perRel, parties:Object.values(parties).sort((a,b)=>(b.sales+b.sync)-(a.sales+a.sync)), unalloc, other};
}
LIVE.roy = () => {
  const st=statement();
  if(!Object.keys(st.perRel).length && !st.other.net) return `<p class="note">No paid sales or sync fees in this period yet. Statements fill in as orders are marked paid.</p>`;
  return `${st.unalloc.length?`<p>${pill(st.unalloc.length+" releases earned money but have no splits","bad")} <a href="#admin-rights">Add splits</a> so the money can be shared out.</p>`:""}
  <div class="tblwrap"><table class="tbl"><caption>Statement by party, amounts excl. VAT</caption><thead><tr><th scope="col">Party</th><th scope="col" class="num">Sales</th><th scope="col" class="num">Sync</th><th scope="col" class="num">Total</th></tr></thead>
  <tbody>${st.parties.map(p=>`<tr><th scope="row">${p.key&&byKey.has(p.key)?`<a href="#artist-${p.key}">${esc(p.name)}</a>`:esc(p.name)}</th><td class="num">${money(p.sales)}</td><td class="num">${money(p.sync)}</td><td class="num">${money(p.sales+p.sync)}</td></tr>`).join("")}
  ${st.unalloc.length?`<tr><th scope="row">Not yet split</th><td class="num">${money(st.unalloc.reduce((s,x)=>s+x.sales,0))}</td><td class="num">${money(st.unalloc.reduce((s,x)=>s+x.sync,0))}</td><td class="num">${money(st.unalloc.reduce((s,x)=>s+x.sales+x.sync,0))}</td></tr>`:""}
  ${st.other.net?`<tr><th scope="row">Label income not tied to a release (merch, tickets)</th><td class="num">${money(st.other.net)}</td><td class="num">${money(0)}</td><td class="num">${money(st.other.net)}</td></tr>`:""}</tbody></table></div>`;
};
SECTIONS["admin-royalties"] = el => {
  el.innerHTML = `<h1>Royalties</h1><p class="lede">Net income after VAT, shared out by each release's splits. Shipping is not shared.</p>
  <div class="btnrow"><label class="theme" for="royP">Period</label><select id="royP" class="sel">${opt(periods(),royPeriod)}</select>
  <button type="button" class="btn" data-act="csv">Download statement</button></div><div data-live="roy"></div>`;
  el.querySelector("#royP").onchange=e=>{ royPeriod=e.target.value; refreshAdmin(); };
  el.onclick = async e => { const b=e.target.closest("[data-act=csv]"); if(!b) return; const st=statement();
    const rows=[["party","release","catno","amount_sek"]]; st.parties.forEach(p=>Object.entries(p.rels).forEach(([rid,v])=>{ const r=byId.get(rid); rows.push([p.name,r?r.title:rid,r?r.catno:"",(v/100).toFixed(2)]); }));
    const csv=rows.map(r=>r.map(x=>`"${String(x).replace(/"/g,'""')}"`).join(",")).join("\n");
    await saveFile(`loop-royalties-${royPeriod}.csv`, csv); };
};

// ---------- Export ----------
async function saveFile(name, data){
  if(!dlNS){ setStatus("Downloads aren't available in this view. Open the app in the Claude app or a browser where you're signed in."); return false; }
  try{ const r=await dlNS.save({filename:name,data}); setStatus(r.status==="saved"?"Saved "+name+".":"Sent "+name+" to your downloads."); return true; }
  catch(err){ setStatus(err&&err.code==="declined"?"Download cancelled.":"Couldn't save the file: "+(err&&err.message||err)); return false; }
}
LIVE.exp = () => { const last=(S.settings.exports||{}).last; return `<dl class="facts"><dt>Releases</dt><dd>${R.length}</dd><dt>People</dt><dd>${P.length}</dd><dt>Products</dt><dd>${all("products").length}</dd><dt>Orders</dt><dd>${all("orders").length}</dd><dt>Events</dt><dd>${all("events").length}</dd><dt>Sync deals</dt><dd>${all("sync").length}</dd><dt>Releases with rights</dt><dd>${all("rights").length}</dd><dt>Last export</dt><dd>${last?new Date(last).toLocaleString("sv-SE"):"Never"}</dd></dl>`; };
SECTIONS["admin-export"] = el => {
  el.innerHTML = `<h1>Export</h1><p class="lede">Everything in one file: catalog, credits, products, orders, events, sync deals and rights. The structure matches the label database, so it can be loaded into another platform or a bookkeeping system later.</p>
  <div data-live="exp"></div>
  <div class="btnrow"><button type="button" class="btn primary" data-act="json">Download everything (JSON)</button><button type="button" class="btn" data-act="ocsv">Download orders (CSV)</button><button type="button" class="btn" data-act="pcsv">Download products (CSV)</button></div>`;
  el.onclick = async e => { const b=e.target.closest("[data-act]"); if(!b) return; const a=b.dataset.act;
    const strip=(k,v)=>k==="_s"?undefined:v;
    if(a==="json"){ const bundle={schema:"loop-records.backoffice/v0",exportedAt:new Date().toISOString(),label:C.label,releases:C.releases,people:C.people,products:all("products"),orders:all("orders"),events:all("events"),sync:all("sync"),rights:all("rights")};
      if(await saveFile(`loop-records-export-${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(bundle,strip,1))){ try{ await put("settings","exports",{last:new Date().toISOString()}); }catch(e){} } }
    const q=x=>`"${String(x??"").replace(/"/g,'""')}"`;
    if(a==="ocsv"){ const rows=[["number","date","status","channel","customer","email","country","sku","title","qty","unit_sek","vat_pct","order_total_sek","order_vat_sek"]];
      all("orders").forEach(o=>o.items.forEach(i=>rows.push([o.number,dt(o.createdAt),o.status,o.channel,o.customer&&o.customer.name,o.customer&&o.customer.email,o.customer&&o.customer.country,i.sku,i.title,i.qty,(i.unit/100).toFixed(2),i.vat,(o.total/100).toFixed(2),(o.vat/100).toFixed(2)])));
      await saveFile("loop-records-orders.csv", rows.map(r=>r.map(q).join(",")).join("\n")); }
    if(a==="pcsv"){ const rows=[["sku","type","title","variant","release_catno","price_sek","vat_pct","stock","status"]];
      all("products").forEach(p=>{ const r=byId.get(String(p.releaseId)); rows.push([p.sku,p.type,p.title,p.variant,r?r.catno:"",p.price==null?"":(p.price/100).toFixed(2),p.vat,p.stock??"",p.status]); });
      await saveFile("loop-records-products.csv", rows.map(r=>r.map(q).join(",")).join("\n")); }
  };
};

// ---------- Breakin Bread ----------
// One button sends the whole label to Breakin Bread: label profile, every artist, every
// release with tracks and credits, videos, artwork, events, products, sync deals and splits.
// The server (api/breakin-bread/push.js) reads everything itself, so what is sent is always
// what is in the database. Re-sending updates the same records on Breakin Bread.
LIVE.bb = () => { const s=S.settings.breakinbread||{}; const c=s.counts||{};
  const st = s.lastStatus==="ok" ? pill("Sent","ok") : s.lastStatus==="dry" ? pill("Checked, not sent","neutral") : s.lastStatus==="error" ? pill("Last send failed","bad") : pill("Never sent","neutral");
  return `<dl class="facts"><dt>Status</dt><dd>${st}</dd><dt>Last attempt</dt><dd>${s.at?new Date(s.at).toLocaleString("sv-SE"):"Never"}</dd>
  <dt>Releases</dt><dd>${c.releases??R.length}</dd><dt>Artists</dt><dd>${c.artists??P.length}</dd><dt>Tracks</dt><dd>${c.works??R.reduce((n,r)=>n+r.tracks.length,0)}</dd>
  <dt>Credits</dt><dd>${c.credits??"–"}</dd><dt>Videos</dt><dd>${c.videos??"–"}</dd><dt>Events</dt><dd>${c.events??all("events").length}</dd>
  <dt>Products</dt><dd>${c.products??all("products").length}</dd><dt>Sync deals</dt><dd>${c.syncDeals??all("sync").length}</dd><dt>Orders</dt><dd>${c.orders??all("orders").length}</dd>
  ${s.error?`<dt>Error</dt><dd>${esc(s.error)}</dd>`:""}</dl>`; };
SECTIONS["admin-bb"] = el => {
  el.innerHTML = `<h1>Breakin Bread</h1><p class="lede">Send all of Loop Records to Breakin Bread in one click: the label, every artist, every release with its tracks, credits, artwork and videos, plus events, products, sync deals and rights splits. Sending again updates what is already there, nothing is duplicated. Customer names and email addresses stay here.</p>
  <div data-live="bb"></div>
  <div class="btnrow"><button type="button" class="btn primary" data-act="push">Send everything to Breakin Bread</button><button type="button" class="btn" data-act="dry">Check first, don't send</button></div>
  <div id="bbOut" class="note" role="status"></div>`;
  el.onclick = async e => { const b=e.target.closest("[data-act]"); if(!b||b.disabled) return; const dry=b.dataset.act==="dry";
    const out=el.querySelector("#bbOut"); const btns=el.querySelectorAll("[data-act]"); btns.forEach(x=>x.disabled=true);
    out.textContent = dry ? "Checking what would be sent…" : "Sending to Breakin Bread…"; announce(out.textContent);
    try{
      const tok = window.LoopBackend && await window.LoopBackend.token();
      if(!tok) throw new Error("You need to be signed in as staff.");
      const res = await fetch("/api/breakin-bread/push", {method:"POST", headers:{"content-type":"application/json", authorization:"Bearer "+tok}, body:JSON.stringify({dryRun:dry})});
      const j = await res.json().catch(()=>({error:"Unexpected reply ("+res.status+")"}));
      if(!res.ok || j.ok===false) throw new Error(j.error||("Failed ("+res.status+")"));
      const c=j.counts||{};
      out.textContent = (dry?"Ready to send: ":"Sent to Breakin Bread: ")+`${c.releases} releases, ${c.artists} artists, ${c.works} tracks, ${c.credits} credits, ${c.videos} videos, ${c.events} events, ${c.products} products.`;
    }catch(err){ out.textContent="Couldn't "+(dry?"check":"send")+": "+(err&&err.message||err); }
    finally{ btns.forEach(x=>x.disabled=false); }
  };
};
