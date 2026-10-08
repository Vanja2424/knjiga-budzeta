  // ---- Nabavka (lista za kupovinu) ----
  // Pravila (parsiranje, grupe, procena, raspodela) su u budzet-core.js; ovde stanje ekrana i crtanje.
  const SHOP_VIEW_KEY = 'budzet-nabavka-prikaz-v1';
  const shopState = (()=>{ try{ const v = JSON.parse(localStorage.getItem(SHOP_VIEW_KEY) || 'null'); if(v && ['section','store','category'].includes(v.by) && ['need','all','prices'].includes(v.show)) return { by: v.by, show: v.show, sectionsOpen: false }; } catch(e){} return { by: 'section', show: 'need', sectionsOpen: false }; })();
  const saveShopView = () => localStorage.setItem(SHOP_VIEW_KEY, JSON.stringify({ by: shopState.by, show: shopState.show }));
  const shopCategoryOf = it => expenseCats.includes(it.category) ? it.category : null;
  // Podrazumevani delovi prodavnice se prevode samo dok ih korisnik ne preimenuje
  const shopSectionLabelHtml = s => C.SHOPPING_SECTIONS.includes(s) ? escapeHtml(s) : `<span translate="no">${escapeHtml(s)}</span>`;
  function defaultShoppingCategory(){
    const last = shopping.items[shopping.items.length - 1];
    if(last && expenseCats.includes(last.category)) return last.category;
    return expenseCats.includes('Hrana') ? 'Hrana' : (expenseCats[0] || 'Ostalo');
  }
  function addShoppingFromInput(text){
    const p = C.parseShoppingInput(text);
    if(!p.name) return null;
    let item = C.findShoppingItem(shopping.items, p.name);
    const created = !item;
    if(!item){
      item = { id: newId(), name: p.name, section: C.SHOPPING_OTHER, store: '', category: defaultShoppingCategory(), price: null, qty: '', needed: true, checked: false };
      shopping.items.push(item);
    }
    item.needed = true;
    if(p.qty) item.qty = p.qty;
    if(p.price != null) item.price = p.price;
    saveShopping();
    return { item, created };
  }
  // Kolicina stavke racuna: qty > 0, jedinica iz QTY_UNITS (inace 1 kom)
  function cleanItemQty(q){
    const qty = q && typeof q.qty === 'number' && isFinite(q.qty) && q.qty > 0 ? q.qty : 1;
    const unit = q && C.QTY_UNITS.includes(q.unit) ? q.unit : 'kom';
    return { qty: q && C.QTY_UNITS.includes(q.unit) ? qty : 1, unit };
  }
  // Excel kolone CeneStavki/Kolicine (JSON) -> itemPrices/itemQty, samo kad su iste duzine kao stavke
  function itemArraysFromCells(n, pricesCell, qtyCell){
    const parse = v => { try { const a = JSON.parse(String(v || '')); return Array.isArray(a) && a.length === n ? a : null; } catch(e){ return null; } };
    const out = {};
    if(!n) return out;
    const p = parse(pricesCell), q = parse(qtyCell);
    if(p) out.itemPrices = p.map(x=> (typeof x === 'number' && isFinite(x) && x >= 0) ? x : null);
    if(q) out.itemQty = q.map(cleanItemQty);
    return out;
  }
  // jedinica iz podataka (kom, kg, l, pak) -> prikaz (EN: pcs, pack)
  const unitTxt = unit => t(String(unit || 'kom'));
  const unitPriceTxt = (v, unit) => fmtNum(v, 2) + ' RSD/' + unitTxt(unit);
  const daysAgo = iso => Math.max(0, Math.round((parseLocalDate(toISODateLocal(new Date())) - parseLocalDate(iso)) / 864e5));
  const priceChangeHtml = ch => ch ? `<span class="shop-price-change ${ch.pct > 0 ? 'up' : 'down'}" title="${escapeHtml(ch.vs === 'store' ? t('u odnosu na prethodnu kupovinu u istoj prodavnici ({0})', fmtNum(ch.prev, 2)) : t('u odnosu na prosek poslednjih kupovina ({0})', fmtNum(ch.prev, 2)))}">${ch.pct > 0 ? '↑' : '↓'}${Math.abs(ch.pct)}%</span>` : '';
  const cheapestHtml = ins => {
    if(!ins || !ins.cheapest) return '';
    const store = '<span translate="no">' + escapeHtml(ins.cheapest.store || t(C.NO_STORE)) + '</span>', price = unitPriceTxt(ins.cheapest.unitPrice, ins.unit), days = daysAgo(ins.cheapest.date);
    return `<span class="shop-cheapest">${days === 0 ? t('najjeftinije: {0} {1} (danas)', store, price) : t('najjeftinije: {0} {1} (pre {2})', store, price, daysTxt(days))}</span>`;
  };
  let priceFilter = 'all';
  let priceHistCache = null;
  function shopPriceHistory(){
    if(!priceHistCache || priceHistCache.entries !== entries || priceHistCache.version !== entriesVersion)
      priceHistCache = { entries, version: entriesVersion, hist: C.priceHistory(entries) };
    return priceHistCache.hist;
  }
  // Licna inflacija: koliko je poskupela tvoja korpa (artikli kupljeni i tada i sada)
  let basketMonths = 3;
  const pctTxt = v => (v > 0 ? '+' : v < 0 ? '−' : '') + fmtNum(Math.abs(v), 1) + '%';
  const itemsTxt = n => t(n % 10 === 1 && n % 100 !== 11 ? '{0} artikal' : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) ? '{0} artikla' : '{0} artikala', n);
  function basketCardHtml(){
    const r = C.basketInflation(entries, toISODateLocal(new Date()), basketMonths, shopPriceHistory());
    const periods = [1, 3, 6, 12].map(m=> `<button class="btn-secondary basket-m${m === basketMonths ? ' active' : ''}" data-m="${m}">${m === 1 ? t('1m') : m + 'm'}</button>`).join('');
    const row = x => `<div class="basket-row"><span class="shop-name" translate="no">${escapeHtml(x.name)}</span><span class="muted">${unitPriceTxt(x.base, x.unit)} → ${unitPriceTxt(x.cur, x.unit)}</span><span class="shop-price-change ${x.pct > 0 ? 'up' : 'down'}">${pctTxt(x.pct)}</span></div>`;
    const body = !r.enough
      ? `<div class="hint">${escapeHtml(t('Premalo podataka za ovaj period (treba bar 3 artikla kupljena i tada i sada). Kako šalješ račune, ovde se pojavljuje poređenje.'))}</div>`
      : `<div class="basket-pct ${r.pct > 0 ? 'up' : r.pct < 0 ? 'down' : ''}">${escapeHtml(t('{0} za {1}', pctTxt(r.pct), monthsTxt(basketMonths)))} <span class="muted">· ${escapeHtml(itemsTxt(r.count))}</span></div>`
        + (r.up.length ? `<div class="basket-sub">${escapeHtml(t('Najviše poskupelo'))}</div>` + r.up.map(row).join('') : '')
        + (r.down.length ? `<div class="basket-sub">${escapeHtml(t('Najviše pojeftinilo'))}</div>` + r.down.map(row).join('') : '');
    return `<div class="basket-card"><div class="basket-head"><b>🛒 ${escapeHtml(t('Tvoja korpa'))}</b><span class="basket-periods">${periods}</span></div>${body}</div>`;
  }
  function renderShopPrices(hist){
    hist = C.mergePriceHistoryAliases(hist, shopping.items);
    const box = document.getElementById('shopPrices');
    const today = toISODateLocal(new Date());
    const all = [...hist.values()].map(h=> C.priceInsight(h, today)).filter(Boolean);
    if(!all.length){ box.innerHTML = `<div class="empty">${t('Još nema cena — slikaj račun iz prodavnice (Ubaci račun iz prodavnice…).')}</div>`; return; }
    const list = all.filter(x=> priceFilter === 'all' || (x.change && (priceFilter === 'up' ? x.change.pct > 0 : x.change.pct < 0)))
      .sort((a, b)=> Math.abs((b.change || {}).pct || 0) - Math.abs((a.change || {}).pct || 0) || a.name.localeCompare(b.name));
    const filters = [['all', t('Sve')], ['up', t('Poskupelo')], ['down', t('Pojeftinilo')]]
      .map(([f, label])=> `<button class="btn-secondary price-filter${priceFilter === f ? ' active' : ''}" data-f="${f}">${label}</button>`).join('');
    box.innerHTML = basketCardHtml() + `<div class="price-filters">${filters}</div>` + (list.length ? list.map(x=> `<div class="price-row" data-key="${escapeHtml(x.key)}" role="button" tabindex="0">
        <span class="shop-name" translate="no">${escapeHtml(x.name)}</span>
        <span>${unitPriceTxt(x.last.unitPrice, x.unit)} <span class="muted">· <span translate="no">${escapeHtml(x.last.store || t(C.NO_STORE))}</span> · ${fmtDocDate(x.last.date)}</span></span>
        <span>${priceChangeHtml(x.change)}</span>
        ${cheapestHtml(x) || '<span></span>'}
      </div>`).join('') : `<div class="empty">${t('Nema artikala za ovaj filter.')}</div>`);
    box.querySelectorAll('.price-filter').forEach(b=> b.addEventListener('click', ()=>{ priceFilter = b.dataset.f; renderShopPrices(hist); }));
    box.querySelectorAll('.basket-m').forEach(b=> b.addEventListener('click', ()=>{ basketMonths = Number(b.dataset.m); renderShopPrices(hist); }));
    box.querySelectorAll('.price-row').forEach(r=>{
      const open = ()=> openPriceHistory(hist.get(r.dataset.key));
      r.addEventListener('click', open);
      r.addEventListener('keydown', e=>{ if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); open(); } });
    });
  }
  function openPriceHistory(h){
    if(!h) return;
    const unit = h.obs[h.obs.length - 1].unit;
    const pts = h.obs.filter(o=> o.unit === unit);
    let chart = '';
    if(pts.length > 1){
      const W = 300, H = 100, P = 8;
      const d0 = parseLocalDate(pts[0].date).getTime(), d1 = parseLocalDate(pts[pts.length - 1].date).getTime();
      const vals = pts.map(o=> o.unitPrice), lo = Math.min(...vals), hi = Math.max(...vals);
      const xy = pts.map(o=> [P + (d1 > d0 ? (parseLocalDate(o.date).getTime() - d0) / (d1 - d0) : 0.5) * (W - 2 * P), H - P - (hi > lo ? (o.unitPrice - lo) / (hi - lo) : 0.5) * (H - 2 * P)].map(v=> Math.round(v * 10) / 10));
      chart = `<svg class="price-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${xy.map(p=> p.join(',')).join(' ')}"/>${xy.map(p=> `<circle cx="${p[0]}" cy="${p[1]}" r="2.5"/>`).join('')}</svg>`;
    }
    const rows = h.obs.slice().reverse().map(o=> `<tr><td>${fmtDocDate(o.date)}</td><td translate="no">${escapeHtml(o.store || t(C.NO_STORE))}</td><td class="num">${fmtNum(o.qty, 3)} ${unitTxt(o.unit)}</td><td class="num">${unitPriceTxt(o.unitPrice, o.unit)}</td></tr>`).join('');
    openDialog(h.name, chart + `<table class="price-hist"><thead><tr><th>${t('Datum')}</th><th>${t('Prodavnica')}</th><th class="num">${t('Količina')}</th><th class="num">${t('Cena po jedinici')}</th></tr></thead><tbody>${rows}</tbody></table>`, { html: true, alertOnly: true });
  }
  function renderShopping(){
    document.querySelectorAll('.shop-by-btn').forEach(b=> b.classList.toggle('active', b.dataset.by === shopState.by));
    document.querySelectorAll('.shop-show-btn').forEach(b=> b.classList.toggle('active', b.dataset.show === shopState.show));
    const list = document.getElementById('shopList');
    const hist = shopPriceHistory(), today = toISODateLocal(new Date());
    const preferredStore = C.mostCommonStore(shopping.items.filter(i=> i.needed));
    const pricesBox = document.getElementById('shopPrices');
    list.style.display = shopState.show === 'prices' ? 'none' : '';
    pricesBox.style.display = shopState.show === 'prices' ? '' : 'none';
    if(shopState.show === 'prices') renderShopPrices(hist); else pricesBox.innerHTML = '';
    const metaHtml = i => {
      const est = C.estimateShoppingItem(i, hist, preferredStore);
      const fromReceipt = est.source === 'store' || est.source === 'last';
      const ins = fromReceipt ? C.priceInsight(C.itemPriceHistory(i, hist), today) : null;
      const price = est.amount > 0 ? `<span title="${escapeHtml(fromReceipt ? t('po ceni sa računa: {0}', unitPriceTxt(est.unitPrice, est.unit)) : t('ručno upisana cena'))}">${fromReceipt ? '~' : ''}${fmt(est.amount)}</span>${fromReceipt && ins ? priceChangeHtml(ins.change) : ''}` : '';
      return { html: [i.qty ? `<span translate="no">${escapeHtml(i.qty)}</span>` : '', price].filter(Boolean).join(' · '), cheapest: ins ? cheapestHtml(ins) : '' };
    };
    const visible = shopState.show === 'need' ? shopping.items.filter(i=> i.needed) : shopping.items;
    if(!shopping.items.length) list.innerHTML = `<div class="empty">${t('Lista je prazna. Dodaj prve stavke, npr. Mleko, Hleb, Jaja.')}</div>`;
    else if(!visible.length) list.innerHTML = `<div class="empty">${t('Nema ništa za kupovinu. Uključi „treba“ u prikazu Sve stavke ili dodaj novu stavku.')}</div>`;
    else {
      const groups = C.groupShoppingItems(visible, shopState.by, { sections: shopping.sections, categories: expenseCats });
      list.innerHTML = groups.map(g=>{
        const title = shopState.by === 'section' ? shopSectionLabelHtml(g.label)
          : g.key === '' ? escapeHtml(g.label) : (shopState.by === 'category' ? catTagHtml(g.label) : `<span translate="no">${escapeHtml(g.label)}</span>`);
        return `<div class="shop-group"><h3 class="shop-group-title">${title} <span class="muted">${g.items.length}</span></h3>
          ${g.items.map(i=> { const m = metaHtml(i); return `<div class="shop-row${i.checked ? ' done' : ''}" data-row-id="${i.id}">
            ${i.needed ? `<input type="checkbox" class="shop-check" data-id="${i.id}"${i.checked ? ' checked' : ''} title="${t('Kupljeno')}">` : '<span class="shop-check-space"></span>'}
            <span class="shop-name-wrap"><span class="shop-name" translate="no">${escapeHtml(i.name)}</span>${m.cheapest}</span>
            <span class="shop-meta">${m.html}</span>
            ${shopState.show === 'all' ? `<label class="paid-checkbox-label shop-need" title="${t('Treba')}"><input type="checkbox" class="shop-need-box" data-id="${i.id}"${i.needed ? ' checked' : ''}></label>` : ''}
            <button class="edit-btn shop-edit" data-id="${i.id}" title="${t('Uredi')}">✎</button>
            <button class="del-btn shop-del" data-id="${i.id}" title="${t('Obriši')}">✕</button>
          </div>`; }).join('')}</div>`;
      }).join('');
    }
    list.querySelectorAll('.shop-check').forEach(box=> box.addEventListener('change', ()=>{
      const it = shopping.items.find(x=> x.id === box.dataset.id); if(!it) return;
      it.checked = box.checked; saveShopping(); renderShopping();
    }));
    list.querySelectorAll('.shop-need-box').forEach(box=> box.addEventListener('change', ()=>{
      const it = shopping.items.find(x=> x.id === box.dataset.id); if(!it) return;
      it.needed = box.checked; if(!it.needed) it.checked = false; saveShopping(); renderShopping();
    }));
    list.querySelectorAll('.shop-edit').forEach(b=> b.addEventListener('click', ()=> editShoppingItem(b.dataset.id)));
    list.querySelectorAll('.shop-del').forEach(b=> b.addEventListener('click', async ()=>{
      const it = shopping.items.find(x=> x.id === b.dataset.id); if(!it) return;
      if(!(await appConfirm(t('Obrisati „{0}“ sa spiska?', it.name), { okText: t('Obriši'), danger: true }))) return;
      shopping.items = shopping.items.filter(x=> x.id !== it.id); saveShopping(); renderShopping();
    }));
    renderShoppingSections();
    renderShoppingSuggestions();
    renderShoppingFooter();
  }
  // "Vreme je da kupis": stvari koje kupujes u pravilnim razmacima, a proslo je vise od uobicajenog
  function renderShoppingSuggestions(){
    const box = document.getElementById('shopSuggest');
    const list = C.restockSuggestions(entries, shopping, toISODateLocal(new Date()));
    if(!list.length){ box.style.display = 'none'; box.innerHTML = ''; return; }
    box.style.display = '';
    box.innerHTML = `<h3 class="shop-group-title">${t('Vreme je da kupiš')}</h3>` + list.map(s=> `<div class="shop-suggest-row" data-key="${escapeHtml(s.key)}">
        <span class="shop-name" translate="no">${escapeHtml(s.name)}</span>
        <span class="shop-meta">${t('kupuješ na ~{0} dana, poslednji put pre {1}', s.intervalDays, daysTxt(s.daysSince))}</span>
        <button class="btn-secondary shop-suggest-add" data-key="${escapeHtml(s.key)}">${t('Dodaj')}</button>
        <button class="del-btn shop-suggest-hide" data-key="${escapeHtml(s.key)}" title="${t('Sakrij do sledeće kupovine')}">✕</button></div>`).join('');
    box.querySelectorAll('.shop-suggest-add').forEach(b=> b.addEventListener('click', ()=>{
      const s = list.find(x=> x.key === b.dataset.key); if(!s) return;
      // Postojeca stavka iz spiska: samo "treba" (bez ponovnog citanja naziva kao unosa, npr. "Pivo 0,5")
      const existing = s.itemId && shopping.items.find(i=> i.id === s.itemId);
      if(existing){ existing.needed = true; saveShopping(); } else addShoppingFromInput(s.name);
      renderShopping();
    }));
    box.querySelectorAll('.shop-suggest-hide').forEach(b=> b.addEventListener('click', ()=>{
      const key = b.dataset.key;
      const last = C.lastPurchaseDates(entries, shopping).get(key);
      shopping.dismissed = C.pruneDismissed(entries, shopping);
      shopping.dismissed[key] = last || toISODateLocal(new Date());
      saveShopping(); renderShopping();
    }));
  }
  function editShoppingItem(id){
    const it = shopping.items.find(x=> x.id === id); if(!it) return;
    const NO_CAT = t('— bez kategorije —');
    openEditModal(t('Uredi stavku'), [
      {key:'name', label:t('Naziv'), type:'text', value:it.name},
      {key:'qty', label:t('Količina (npr. 2 kom)'), type:'text', value:it.qty},
      {key:'price', label:t('Cena (RSD, procena)'), type:'number', value: it.price != null ? it.price : ''},
      {key:'section', label:t('Deo prodavnice'), type:'select', value:it.section, options:shopping.sections},
      {key:'store', label:t('Prodavnica'), type:'text', value:it.store},
      {key:'category', label:t('Kategorija budžeta'), type:'select', value: shopCategoryOf(it) || NO_CAT, options: shopCategoryOf(it) ? expenseCats : [NO_CAT].concat(expenseCats)},
      {key:'needed', label:t('Treba za sledeću kupovinu'), type:'checkbox', value:it.needed}
    ], vals=>{
      const name = String(vals.name || '').replace(/\s+/g, ' ').trim();
      if(!name) return;
      const other = C.findShoppingItem(shopping.items, name);
      if(other && other.id !== it.id){ appAlert(t('Stavka sa tim imenom već postoji.')); return; }
      // staro ime ostaje kao alias: kupovine i cene pod starim imenom i dalje pripadaju stavci
      if(C.normShoppingName(name) !== C.normShoppingName(it.name)){
        const aliases = (it.aliases || []).concat([it.name]).filter((a, ai, arr)=> C.normShoppingName(a) !== C.normShoppingName(name) && arr.findIndex(b=> C.normShoppingName(b) === C.normShoppingName(a)) === ai).slice(-10);
        if(aliases.length) it.aliases = aliases; else delete it.aliases;
      }
      it.name = name; it.qty = String(vals.qty || '').trim();
      it.price = vals.price > 0 ? vals.price : null;
      it.section = shopping.sections.includes(vals.section) ? vals.section : C.SHOPPING_OTHER;
      it.store = String(vals.store || '').trim();
      if(expenseCats.includes(vals.category)) it.category = vals.category;
      it.needed = !!vals.needed; if(!it.needed) it.checked = false;
      saveShopping(); renderShopping();
    });
  }
  function renderShoppingSections(){
    const panel = document.getElementById('shopSectionsPanel');
    panel.style.display = shopState.sectionsOpen ? '' : 'none';
    if(!shopState.sectionsOpen) return;
    const secs = shopping.sections;
    panel.innerHTML = secs.map((s, i)=> `<div class="shop-sec-row">
        ${s === C.SHOPPING_OTHER ? `<span class="shop-sec-fixed">${shopSectionLabelHtml(s)}</span>` : `<input type="text" class="shop-sec-name" data-i="${i}" value="${escapeHtml(s)}" aria-label="${t('Naziv dela')}">`}
        <button class="edit-btn shop-sec-up" data-i="${i}" title="${t('Gore')}" ${i === 0 || s === C.SHOPPING_OTHER ? 'disabled' : ''}>↑</button>
        <button class="edit-btn shop-sec-down" data-i="${i}" title="${t('Dole')}" ${i >= secs.length - 2 || s === C.SHOPPING_OTHER ? 'disabled' : ''}>↓</button>
        ${s === C.SHOPPING_OTHER ? '' : `<button class="del-btn shop-sec-del" data-i="${i}" title="${t('Obriši')}">✕</button>`}
      </div>`).join('') + `<div class="shop-sec-row"><input type="text" id="shopSecNew" placeholder="${t('Novi deo prodavnice')}" aria-label="${t('Novi deo prodavnice')}"><button class="btn-secondary" id="shopSecAdd">${t('Dodaj')}</button></div>`;
    const commit = ()=>{ saveShopping(); renderShopping(); };
    panel.querySelectorAll('.shop-sec-name').forEach(inp=> inp.addEventListener('change', ()=>{
      const i = Number(inp.dataset.i), old = secs[i], name = inp.value.replace(/\s+/g, ' ').trim();
      if(!name || name === old) { inp.value = old; return; }
      if(secs.some((s, si)=> si !== i && s.toLowerCase() === name.toLowerCase())){ appAlert(t('Deo sa tim imenom već postoji.')); inp.value = old; return; }
      secs[i] = name; shopping.items.forEach(it=>{ if(it.section === old) it.section = name; }); commit();
    }));
    panel.querySelectorAll('.shop-sec-up').forEach(b=> b.addEventListener('click', ()=>{ const i = Number(b.dataset.i); if(secs[i] === C.SHOPPING_OTHER) return; [secs[i-1], secs[i]] = [secs[i], secs[i-1]]; commit(); }));
    panel.querySelectorAll('.shop-sec-down').forEach(b=> b.addEventListener('click', ()=>{ const i = Number(b.dataset.i); if(secs[i] === C.SHOPPING_OTHER || secs[i+1] === C.SHOPPING_OTHER) return; [secs[i+1], secs[i]] = [secs[i], secs[i+1]]; commit(); }));
    panel.querySelectorAll('.shop-sec-del').forEach(b=> b.addEventListener('click', ()=>{
      const i = Number(b.dataset.i), old = secs[i];
      secs.splice(i, 1); shopping.items.forEach(it=>{ if(it.section === old) it.section = C.SHOPPING_OTHER; }); commit();
    }));
    const add = ()=>{
      const inp = document.getElementById('shopSecNew'), name = inp.value.replace(/\s+/g, ' ').trim();
      if(!name) return;
      if(secs.some(s=> s.toLowerCase() === name.toLowerCase())){ appAlert(t('Deo sa tim imenom već postoji.')); return; }
      secs.splice(secs.length - 1, 0, name); commit();
    };
    document.getElementById('shopSecAdd').addEventListener('click', add);
    document.getElementById('shopSecNew').addEventListener('keydown', e=>{ if(e.key === 'Enter'){ e.preventDefault(); add(); } });
  }
  const shopChecked = () => shopping.items.filter(i=> i.needed && i.checked);
  // Kategorija za racun: nepostojeca kategorija stavke -> prva kategorija rashoda (oznaceno u raspodeli)
  const shopPurchaseCat = it => shopCategoryOf(it) || expenseCats[0] || 'Ostalo';
  const shopEstimateNow = () => C.shoppingEstimate(shopping.items.map(i=> Object.assign({}, i, { category: shopCategoryOf(i) || C.NO_CATEGORY })),
    { history: shopPriceHistory(), preferredStore: C.mostCommonStore(shopping.items.filter(i=> i.needed)) });
  function renderShoppingFooter(){
    const foot = document.getElementById('shopFooter');
    const est = shopEstimateNow();
    if(!est.count){ foot.style.display = 'none'; return; }
    foot.style.display = '';
    const nChecked = shopChecked().length;
    const catRows = Object.keys(est.byCategory).map(cat=>{
      const sum = est.byCategory[cat];
      const env = cat === C.NO_CATEGORY ? null : envelopeRemainingThisMonth(cat);
      const name = cat === C.NO_CATEGORY ? escapeHtml(t(C.NO_CATEGORY)) : catTagHtml(cat);
      if(!env) return `<div class="shop-budget-row">${t('{0}: nabavka ~{1}', name, fmt(sum))}</div>`;
      const over = sum > env.remaining;
      return `<div class="shop-budget-row${over ? ' over' : ''}">${t('{0}: ostalo {1} od {2} · nabavka ~{3}', name, fmt(env.remaining), fmt(env.allocated + env.rollover), fmt(sum))}</div>`;
    }).join('');
    foot.innerHTML = `<div class="shop-foot-main">
        <div class="shop-estimate"><b>${t('Za kupovinu: {0} · procena ~{1}', est.count, fmt(est.total))}</b>${est.unpriced ? ' ' + t('({0} bez cene)', est.unpriced) : ''}${est.fromReceipts ? ' · ' + t('{0} od {1} po ceni sa računa', est.fromReceipts, est.count) : ''}</div>
        <button class="save-btn" id="shopFinishBtn"${nChecked ? '' : ' disabled'}>${t('Završi kupovinu ({0})', nChecked)}</button>
      </div>${catRows}`;
    document.getElementById('shopFinishBtn').addEventListener('click', openFinishPurchase);
  }
  let finishSplitEdited = false;
  let finishShopLastFocus = null;
  function finishSplitRows(total){
    return C.splitPurchase(shopChecked().map(i=> Object.assign({}, i, { category: shopPurchaseCat(i) })), total);
  }
  function renderFinishSplit(){
    const box = document.getElementById('finishShopSplit');
    const total = parseFloat(document.getElementById('finishShopTotal').value) || 0;
    const checked = shopChecked();
    const cats = new Set(checked.map(shopPurchaseCat));
    if(cats.size < 2){
      const onlyCat = [...cats][0];
      const hasMissing = onlyCat != null && checked.some(i=> !shopCategoryOf(i));
      box.innerHTML = hasMissing ? `<div class="hint">${t('Stavke bez kategorije idu u: {0}', catTagHtml(onlyCat))}</div>` : '';
      return;
    }
    if(!finishSplitEdited || !box.querySelector('.finish-split-amt')){
      const rows = finishSplitRows(total);
      box.innerHTML = `<div class="modal-field"><label>${t('Raspodela po kategorijama')}</label>${rows.map(r=>{
        const missing = shopChecked().filter(i=> shopPurchaseCat(i) === r.category).some(i=> !shopCategoryOf(i));
        return `<div class="finish-split-row">${catTagHtml(r.category)}${missing ? ` <span class="muted">${t('(bez kategorije → {0})', escapeHtml(r.category))}</span>` : ''}
          <input type="number" class="finish-split-amt" data-cat="${escapeHtml(r.category)}" value="${r.amount}" min="0" step="1" aria-label="${escapeHtml(r.category)}"></div>`;
      }).join('')}<div class="hint" id="finishSplitLeft"></div></div>`;
      box.querySelectorAll('.finish-split-amt').forEach(inp=> inp.addEventListener('input', ()=>{ finishSplitEdited = true; updateFinishLeft(); }));
    }
    updateFinishLeft();
  }
  function finishSplitValues(){
    return [...document.querySelectorAll('#finishShopSplit .finish-split-amt')].map(inp=> ({ category: inp.dataset.cat, amount: parseFloat(inp.value) }));
  }
  function updateFinishLeft(){
    const el = document.getElementById('finishSplitLeft'); if(!el) return;
    const total = parseFloat(document.getElementById('finishShopTotal').value) || 0;
    const left = Math.round((total - finishSplitValues().reduce((s, r)=> s + (r.amount || 0), 0)) * 100) / 100;
    el.textContent = t('Za raspodelu: {0}', fmt(left));
    el.classList.toggle('bad', left !== 0);
  }
  function openFinishPurchase(){
    const checked = shopChecked(); if(!checked.length) return;
    finishShopLastFocus = document.activeElement;
    finishSplitEdited = false;
    document.getElementById('finishShopTotal').value = '';
    document.getElementById('finishShopDate').value = toISODateLocal(new Date());
    const accField = document.getElementById('finishShopAccountField');
    accField.style.display = accounts.length >= 2 ? '' : 'none';
    document.getElementById('finishShopAccount').innerHTML = accounts.map(a=> `<option value="${a.id}"${a.id === defaultAccountId() ? ' selected' : ''}>${escapeHtml(a.name)}</option>`).join('');
    document.getElementById('finishShopStore').value = C.mostCommonStore(checked);
    const stores = [...new Set(shopping.items.map(i=> i.store).filter(Boolean))].sort((a, b)=> a.localeCompare(b));
    document.getElementById('finishShopStores').innerHTML = stores.map(s=> `<option value="${escapeHtml(s)}">`).join('');
    renderFinishSplit();
    document.getElementById('finishShopOverlay').classList.add('show');
    setTimeout(()=> document.getElementById('finishShopTotal').focus(), 0);
  }
  function closeFinishPurchase(){
    document.getElementById('finishShopOverlay').classList.remove('show');
    if(finishShopLastFocus && typeof finishShopLastFocus.focus === 'function') finishShopLastFocus.focus();
    finishShopLastFocus = null;
  }
  // Pravi rashod(e) od stikliranih stavki. opts (za smoke) moze da zada total/rows bez modala.
  function confirmFinishPurchase(opts){
    opts = opts || {};
    const checked = shopChecked(); if(!checked.length) return false;
    const total = opts.total != null ? Number(opts.total) : parseFloat(document.getElementById('finishShopTotal').value);
    if(!(total > 0)){ appAlert(t('Upiši iznos sa računa.')); return false; }
    const auto = finishSplitRows(total);
    let rows = auto;
    if(!opts.total && auto.length > 1){
      const vals = finishSplitValues();
      if(vals.some(v=> !(v.amount > 0)) || Math.round(vals.reduce((s, v)=> s + v.amount, 0) * 100) !== Math.round(total * 100)){ appAlert(t('Zbir po kategorijama mora da bude jednak iznosu sa računa.')); return false; }
      rows = auto.map(r=> Object.assign({}, r, { amount: (vals.find(v=> v.category === r.category) || {}).amount }));
    }
    const date = opts.total != null ? toISODateLocal(new Date()) : (document.getElementById('finishShopDate').value || toISODateLocal(new Date()));
    const store = (opts.total != null ? C.mostCommonStore(checked) : document.getElementById('finishShopStore').value).trim();
    const accountId = accounts.length ? (accounts.length >= 2 && opts.total == null ? document.getElementById('finishShopAccount').value : defaultAccountId()) : undefined;
    const made = rows.map(r=>{
      const e = { id: newId(), type: 'expense', desc: store || t('Nabavka'), amount: r.amount, category: r.category, date, paid: true, tags: ['nabavka'], items: r.items.map(C.purchaseItemLabel), itemPrices: r.items.map(i=> i.price > 0 ? i.price : null) };
      if(accountId) e.accountId = accountId;
      entries.push(e); applyRoundUpSaving(r.amount);
      return e;
    });
    const before = checked.map(i=> ({ i, needed: i.needed, checked: i.checked }));
    checked.forEach(i=>{ i.needed = false; i.checked = false; });
    saveEntries(); saveShopping(); closeFinishPurchase(); renderAll();
    showUndoToast(t('Rashod {0} dodat ({1} stavki)', fmt(total), checked.length), ()=>{
      const ids = new Set(made.map(e=> e.id));
      entries = entries.filter(e=> !ids.has(e.id));
      before.forEach(b=>{ b.i.needed = b.needed; b.i.checked = b.checked; });
      saveEntries(); saveShopping(); renderAll();
    });
    return true;
  }
  if(IS_TEST) window.__finishPurchase = opts => confirmFinishPurchase(opts);
  document.getElementById('finishShopTotal').addEventListener('input', renderFinishSplit);
  document.getElementById('finishShopTotal').addEventListener('keydown', e=>{
    if(e.isComposing || e.key !== 'Enter') return;
    e.preventDefault();
    confirmFinishPurchase();
  });
  document.getElementById('finishShopSplit').addEventListener('keydown', e=>{
    if(e.isComposing || e.key !== 'Enter' || !e.target.classList.contains('finish-split-amt')) return;
    e.preventDefault();
    confirmFinishPurchase();
  });
  document.getElementById('finishShopCancel').addEventListener('click', closeFinishPurchase);
  document.getElementById('finishShopSave').addEventListener('click', ()=> confirmFinishPurchase());
  document.getElementById('finishShopOverlay').addEventListener('click', e=>{ if(e.target.id === 'finishShopOverlay') closeFinishPurchase(); });
  document.getElementById('shopQuickInput').addEventListener('keydown', e=>{
    if(e.isComposing) return;
    if(e.key !== 'Enter') return;
    e.preventDefault();
    const res = addShoppingFromInput(e.target.value);
    if(!res) return;
    e.target.value = '';
    renderShopping();
  });
  document.querySelectorAll('.shop-by-btn').forEach(b=> b.addEventListener('click', ()=>{ shopState.by = b.dataset.by; saveShopView(); renderShopping(); }));
  document.querySelectorAll('.shop-show-btn').forEach(b=> b.addEventListener('click', ()=>{ shopState.show = b.dataset.show; saveShopView(); renderShopping(); }));
  document.getElementById('shopSectionsBtn').addEventListener('click', ()=>{ shopState.sectionsOpen = !shopState.sectionsOpen; renderShoppingSections(); });

