# Paket 3 — Nabavka ↔ Analiza ↔ Budžet — plan implementacije

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Cilj:**
- „Kupljene stvari“ u Analizi (učestalost + iznos iz računa podeljen po cenama sa liste)
- „na listi ~X“ u Budžetu
- „Vreme je da kupiš“ predlozi u Nabavci

**Arhitektura:** Računanje je u `budzet-core.js` (`C`), uz testove:
- `purchasedItemName`, `purchasedItemKey`
- `purchasedItemStats`
- `restockSuggestions`
- `normalizeShopping` čuva `dismissed`

Stranica upisuje `itemPrices` pri kupovini i crta tri nova dela.

**Specifikacija:** `docs/superpowers/specs/2026-09-29-nabavka-analiza-budzet-design.md`

## Globalna ograničenja

- Web kod ima samo jedan izvor, koren `E:\Vanja`. Kopije u `E:\Vanja\app\` se ne menjaju, osim `app/test/*`.
- `itemPrices` je niz iste dužine kao `items`, sa `number` ≥ 0 ili `null`. Ide samo u JSON, ne u Excel.
- Stvar se prepoznaje po nazivu bez završne zagrade sa količinom i bez obzira na velika slova i razmake: `purchasedItemKey(label) = normShoppingName(purchasedItemName(label))`.
- Iznos po stvari: iznos rashoda × (težina stvari / zbir težina u tom rashodu). Težina je cena sa liste. Stvar bez cene u rashodu koji ima cene dobija prosek cena iz tog rashoda. Rashod bez ijedne cene ne daje iznos.
- Predlog: bar **3** različita dana kupovine. Interval je **medijan** razmaka. Predlaže se kad je `danaOdPoslednje ≥ interval`, a stvar nije u spisku sa `needed` i nije sakrivena (`dismissed[key] >= poslednjiDatum`). Najviše **5** predloga, poređanih po `daysSince/intervalDays` opadajuće, a pri jednakosti po nazivu.
- UI na srpskom. Tekst sa vrednostima ide kroz `t()`, svaki novi tekst dobija EN u `i18n.js`. Korisnički podaci se escape-uju i dobijaju `translate="no"`.
- CSS ide u sloj `apple-theme`. Fajlove menjaj alatom Edit.
- Testovi: `cd /e/Vanja/app && npm test`. Smoke: `cd /e/Vanja/app && npm run copy-web && node test/smoke.js "C:/Users/gejme/OneDrive/Belgeler/Knjiga budzeta/podaci.json"`. Sve mora da prođe.
- Git: grana `nabavka-analiza-budzet`. Trailer tačno `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Bez podizanja verzije.

## Na šta obratiti pažnju pri pregledu

1. **Zbir iznosa stvari iz jednog rashoda sa cenama mora biti jednak iznosu rashoda.** Test je u zadatku 1.
2. **„Mleko (2 kom)“ i „mleko“ su ista stvar**, i u statistici i u predlozima. Test je u zadatku 1.
3. **Sakriven predlog se vraća tek posle novije kupovine.** Test je u zadatku 1.
4. **Stari rashodi bez `itemPrices`** ne ruše Analizu i pokazuju samo „×N“. Test je u zadatku 1 (rashod bez cena).

---

### Zadatak 1: Jezgro

**Fajlovi:** `budzet-core.js` (nov odeljak posle `debtPaid`; izmena `normalizeShopping`; izvoz), `app/test/core.test.js`.

**Interfejsi (pravi):**
- `C.purchasedItemName(label)` i `C.purchasedItemKey(label)`
- `C.purchasedItemStats(entries, months?, category?) → [{ key, name, count, amount|null, withAmount }]`
- `C.restockSuggestions(entries, shopping, todayISO) → [{ name, key, intervalDays, daysSince, itemId|null }]`
- `C.normalizeShopping(...)` sada vraća i `dismissed: { [key]: 'YYYY-MM-DD' }`

- [ ] **Korak 1: Testovi koji padaju:**

```js
// ---------- Kupljene stvari ----------
test('purchasedItemName / purchasedItemKey', () => {
  assert.equal(C.purchasedItemName('Mleko (2 kom)'), 'Mleko');
  assert.equal(C.purchasedItemName('  Hleb '), 'Hleb');
  assert.equal(C.purchasedItemName('Mleko 2,8% (1 l)'), 'Mleko 2,8%');
  assert.equal(C.purchasedItemName('Sok (narandža) (1 l)'), 'Sok (narandža)');
  assert.equal(C.purchasedItemKey('MLEKO  (2 kom)'), 'mleko');
  assert.equal(C.purchasedItemKey(undefined), '');
});

test('purchasedItemStats: srazmerno cenama, bez cene = prosek, bez cena = samo broj', () => {
  const ex2 = (id, date, amount, category, items, itemPrices, extra = {}) => ({ id, type: 'expense', date, amount, category, desc: 'x', items, itemPrices, ...extra });
  const entries = [
    ex2('e1', '2026-09-05', 1000, 'Hrana', ['Mleko (2 kom)', 'Hleb'], [300, 100]),   // 750 / 250
    ex2('e2', '2026-09-12', 500, 'Hrana', ['mleko', 'Jaja'], [200, null]),           // 250 / 250
    ex2('e3', '2026-09-20', 800, 'Hrana', ['Hleb', 'Kafa'], undefined),               // samo broj
    ex2('e4', '2026-09-21', 999, 'Hrana', ['Mleko'], [100], { paid: false }),          // neplaceno
    ex2('e5', '2026-08-30', 120, 'Hrana', ['Mleko'], [100]),                           // drugi mesec
    ex2('e6', '2026-09-22', 400, 'Kozmetika', ['Sapun'], [400])
  ];
  const s = C.purchasedItemStats(entries, ['2026-09'], 'Hrana');
  assert.deepEqual(s.map(x => [x.name, x.count, x.amount, x.withAmount]), [
    ['Mleko', 2, 1000, 2], ['Hleb', 2, 250, 1], ['Jaja', 1, 250, 1], ['Kafa', 1, null, 0]
  ]);
  assert.deepEqual(C.purchasedItemStats(entries, ['2026-09']).map(x => x.name), ['Mleko', 'Sapun', 'Hleb', 'Jaja', 'Kafa']);
  const all = C.purchasedItemStats(entries).find(x => x.key === 'mleko');
  assert.deepEqual([all.count, all.amount, all.withAmount], [3, 1120, 3]);
  assert.deepEqual(C.purchasedItemStats([], ['2026-09']), []);
  // itemPrices pogresne duzine se ignorise (samo broj)
  assert.deepEqual(C.purchasedItemStats([ex2('b', '2026-09-01', 100, 'Hrana', ['A', 'B'], [10])]).map(x => x.amount), [null, null]);
});

test('restockSuggestions: medijan intervala, prag, needed, dismissed, najvise 5', () => {
  const buy = (id, date, items) => ({ id, type: 'expense', date, amount: 100, category: 'Hrana', desc: 'x', items });
  const entries = [
    buy('m1', '2026-09-01', ['Mleko (1 l)']), buy('m2', '2026-09-08', ['mleko']), buy('m3', '2026-09-15', ['Mleko']),
    buy('m4', '2026-09-22', ['Mleko', 'Hleb']), buy('m5', '2026-09-22', ['Mleko']),       // isti dan se broji jednom
    buy('h1', '2026-09-10', ['Hleb']), buy('h2', '2026-09-20', ['Hleb']), buy('h3', '2026-09-25', ['Hleb']),
    buy('j1', '2026-09-01', ['Jaja']), buy('j2', '2026-09-10', ['Jaja']),
    buy('k1', '2026-08-01', ['Kafa']), buy('k2', '2026-08-15', ['Kafa']), buy('k3', '2026-08-29', ['Kafa']),
    buy('s1', '2026-09-01', ['Sir']), buy('s2', '2026-09-08', ['Sir']), buy('s3', '2026-09-15', ['Sir']),
    buy('o1', '2026-09-01', ['Sok']), buy('o2', '2026-09-08', ['Sok']), buy('o3', '2026-09-15', ['Sok']),
    Object.assign(buy('x1', '2026-09-26', ['Mleko']), { paid: false })                        // neplaceno se ne broji
  ];
  const shopping = { items: [{ id: 'm', name: 'Mleko', needed: false }, { id: 's', name: 'Sir', needed: true }], dismissed: { sok: '2026-09-15' } };
  const r = C.restockSuggestions(entries, shopping, '2026-09-29');
  assert.deepEqual(r, [
    { name: 'Kafa', key: 'kafa', intervalDays: 14, daysSince: 31, itemId: null },
    { name: 'Mleko', key: 'mleko', intervalDays: 7, daysSince: 7, itemId: 'm' }
  ]);
  // sakriveno se vraca posle novije kupovine
  const r2 = C.restockSuggestions(entries.concat([buy('o4', '2026-09-20', ['Sok'])]), shopping, '2026-10-10');
  assert.ok(r2.some(x => x.key === 'sok'));
  // najvise 5
  const many = [];
  ['A', 'B', 'C', 'D', 'E', 'F', 'G'].forEach((n, i) => ['2026-08-01', '2026-08-08', '2026-08-15'].forEach((d, j) => many.push(buy(n + j, d, [n]))));
  assert.equal(C.restockSuggestions(many, { items: [] }, '2026-09-29').length, 5);
  assert.deepEqual(C.restockSuggestions([], null, '2026-09-29'), []);
});

test('normalizeShopping cuva dismissed (samo kljuc -> datum)', () => {
  const n = C.normalizeShopping({ items: [], dismissed: { mleko: '2026-09-22', los: 5, 'x': 'nije datum' } }, () => 'id');
  assert.deepEqual(n.dismissed, { mleko: '2026-09-22' });
  assert.deepEqual(C.normalizeShopping(null, () => 'id').dismissed, {});
});
```

Provera Hleba: kupljen 10., 20. i 25. Razmaci su 10 i 5, medijan je 7,5. Prošlo je 4 dana, pa nema predloga. Jaja imaju samo 2 kupovine, pa nema predloga. Sir je `needed`, pa se ne predlaže. Sok je sakriven do 15. Kafa: 31/14 ≈ 2,2 je prva, a Mleko (7/7 = 1) drugo.

- [ ] **Korak 2:** Pokreni testove i proveri da padaju.

- [ ] **Korak 3: Implementacija** (posle `debtPaid`):

```js
  // ---------- Kupljene stvari (Nabavka -> Analiza, predlozi) ----------
  const purchasedItemName = label => String(label == null ? '' : label).replace(/\s*\([^()]*\)\s*$/, '').replace(/\s+/g, ' ').trim();
  const purchasedItemKey = label => normShoppingName(purchasedItemName(label));
  // Po stvari: broj kupovina i deo stvarnog iznosa racuna (srazmerno cenama sa liste; bez cene = prosek iz tog racuna)
  function purchasedItemStats(entries, months, category){
    const map = new Map();
    (entries || []).forEach(e => {
      if(!isPaidExp(e) || !Array.isArray(e.items) || !e.items.length) return;
      if(months && !months.includes(e.date.slice(0, 7))) return;
      if(category && e.category !== category) return;
      const prices = Array.isArray(e.itemPrices) && e.itemPrices.length === e.items.length ? e.itemPrices : null;
      const priced = prices ? prices.filter(p => p > 0) : [];
      const avg = priced.length ? priced.reduce((s, p) => s + p, 0) / priced.length : 0;
      const weights = priced.length ? prices.map(p => p > 0 ? p : avg) : null;
      const W = weights ? weights.reduce((s, w) => s + w, 0) : 0;
      e.items.forEach((label, i) => {
        const key = purchasedItemKey(label);
        if(!key) return;
        if(!map.has(key)) map.set(key, { key, name: purchasedItemName(label), count: 0, amount: null, withAmount: 0 });
        const g = map.get(key);
        g.count++;
        if(weights && W > 0){ g.amount = round2((g.amount || 0) + e.amount * weights[i] / W); g.withAmount++; }
      });
    });
    return [...map.values()].sort((a, b) => (b.amount || 0) - (a.amount || 0) || b.count - a.count || a.name.localeCompare(b.name));
  }
  const dayNumber = iso => Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000);
  // "Vreme je da kupis": stvari kupljene bar 3 dana, medijan razmaka, proslo >= interval; bez needed i sakrivenih
  function restockSuggestions(entries, shopping, todayISO){
    const items = (shopping && shopping.items) || [];
    const dismissed = (shopping && shopping.dismissed) || {};
    const dates = new Map(), names = new Map();
    (entries || []).forEach(e => {
      if(!isPaidExp(e) || !Array.isArray(e.items)) return;
      e.items.forEach(label => {
        const key = purchasedItemKey(label);
        if(!key) return;
        if(!dates.has(key)){ dates.set(key, new Set()); names.set(key, purchasedItemName(label)); }
        dates.get(key).add(e.date);
      });
    });
    const today = dayNumber(todayISO);
    const out = [];
    dates.forEach((set, key) => {
      const ds = [...set].sort();
      if(ds.length < 3) return;
      const gaps = ds.slice(1).map((d, i) => dayNumber(d) - dayNumber(ds[i])).sort((a, b) => a - b);
      const mid = gaps.length >> 1;
      const interval = gaps.length % 2 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2;
      const last = ds[ds.length - 1];
      const since = today - dayNumber(last);
      if(interval <= 0 || since < interval) return;
      if(dismissed[key] && dismissed[key] >= last) return;
      const item = items.find(i => normShoppingName(i.name) === key);
      if(item && item.needed) return;
      out.push({ name: item ? item.name : names.get(key), key, intervalDays: Math.round(interval), daysSince: since, itemId: item ? item.id : null });
    });
    return out.sort((a, b) => (b.daysSince / b.intervalDays) - (a.daysSince / a.intervalDays) || a.name.localeCompare(b.name)).slice(0, 5);
  }
```

U `normalizeShopping`, u povratnu vrednost dodaj `dismissed`:

```js
    const dismissed = {};
    if(src.dismissed && typeof src.dismissed === 'object' && !Array.isArray(src.dismissed))
      Object.keys(src.dismissed).forEach(k => { const v = src.dismissed[k]; if(typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) dismissed[k] = v; });
    return { items, sections, dismissed };
```

Proveri postojeći test `normalizeShopping` (iz paketa Nabavka). On radi `deepEqual` nad `empty.items` i `empty.sections` odvojeno, pa novo polje ne smeta. Ako negde postoji `deepEqual` celog objekta, dopuni ga sa `dismissed: {}`.

Izvoz: `purchasedItemName, purchasedItemKey, purchasedItemStats, restockSuggestions`.

- [ ] **Korak 4:** Pokreni testove i proveri da prolaze. **Korak 5:** Commit (`Paket 3: jezgro — kupljene stvari i predlozi`).

---

### Zadatak 2: Cene pri kupovini, „Kupljene stvari“ u Analizi, „na listi“ u Budžetu

**Fajlovi:** `budzet-tracker.html`, `i18n.js`, `app/test/smoke-checks.js`.

**Interfejsi:** koristi `C.purchasedItemStats`, `C.shoppingEstimate`, `envelopeRemainingThisMonth`, `shopCategoryOf`, `C.NO_CATEGORY`.

- [ ] **Korak 1: Smoke** (ispred `// Cuvanje u fajl`):

```js
    // Paket 3: kupovina pamti cene po stvari; Analiza pokazuje kupljene stvari; Budzet pokazuje "na listi"
    const catsP3 = window.__desktopBridge.getQuickAddData().expenseCats;
    const shP3 = window.__shopping();
    shP3.items.push({ id: 'p3-a', name: 'P3 mleko', section: 'Mlečni', store: '', category: catsP3[0], price: 150, qty: '', needed: true, checked: true },
                    { id: 'p3-b', name: 'P3 hleb', section: 'Pekara', store: '', category: catsP3[0], price: 50, qty: '', needed: true, checked: true },
                    { id: 'p3-c', name: 'P3 jogurt', section: 'Mlečni', store: '', category: catsP3[0], price: 120, qty: '', needed: true, checked: false });
    window.__saveShopping(); await sleep(40);
    go('kategorije'); await sleep(60);
    check('budžet: "na listi" za kategoriju sa stavkama', [...document.querySelectorAll('#catList li')].some(li => li.textContent.includes(catsP3[0]) && /na listi/.test(li.textContent)));
    window.__finishPurchase({ total: 400 }); await sleep(60);
    const p3e = entries().find(e => (e.items || []).includes('P3 mleko'));
    check('kupovina pamti cene po stvari', !!p3e && JSON.stringify(p3e.itemPrices) === JSON.stringify([150, 50]), p3e && JSON.stringify(p3e.itemPrices));
    go('analiza'); await sleep(80);
    const catHead = [...document.querySelectorAll('#analizaWhereList .analiza-cat-head')].find(b => b.dataset.cat === catsP3[0]);
    if (catHead) { if (!catHead.closest('.analiza-cat').classList.contains('open')) catHead.click(); await sleep(60); }
    check('analiza: kupljene stvari', /P3 mleko/.test($('analizaWhereList').textContent) && /×1/.test($('analizaWhereList').textContent));
    window.__deleteEntriesById([p3e.id]);
    window.__shopping().items = window.__shopping().items.filter(i => !/^p3-/.test(i.id)); window.__saveShopping();
```

Proveri `id` kontejnera liste kategorija na ekranu Budžet (`#catList`) i da `window.__finishPurchase` pravi jedan rashod kad su obe stavke iz iste kategorije.

- [ ] **Korak 2: `itemPrices` pri kupovini.** U `confirmFinishPurchase`, u objektu rashoda, posle `items: r.items.map(C.purchaseItemLabel)`, dodaj `itemPrices: r.items.map(i=> i.price > 0 ? i.price : null)`.

U `sanitizeImportedBackup` (mapiranje `cleanEntries`), posle obrade `items`:

```js
      if(Array.isArray(o.items) && Array.isArray(e.itemPrices) && e.itemPrices.length === o.items.length) o.itemPrices = e.itemPrices.map(p=> (typeof p === 'number' && isFinite(p) && p >= 0) ? p : null); else delete o.itemPrices;
```

U `duplicateEntry`, uz postojeći `items.slice()`, dodaj `if(Array.isArray(copy.itemPrices)) copy.itemPrices = copy.itemPrices.slice();`.

- [ ] **Korak 3: „Kupljene stvari“ u Analizi.** U `renderAnalizaWhere`, gde se za otvorenu kategoriju pravi `groups` (tabela `analiza-groups`), dodaj posle nje:

```js
        const bought = C.purchasedItemStats(entries, [b.month], r.cat).slice(0, 8);
        if(bought.length) groups += `<div class="analiza-bought"><div class="analiza-bought-title">${t('Kupljene stvari')}</div>${bought.map(s=>
          `<span class="analiza-bought-item"><span translate="no">${escapeHtml(s.name)}</span> ×${s.count}${s.amount != null ? ' · ~' + fmt(s.amount) : ''}</span>`).join('')}</div>`;
```

Prilagodi imenima promenljivih u toj funkciji (`r`, `b.month`, `groups`).

CSS:

```css
.analiza-bought{ margin:0 0 0.8em; }
.analiza-bought-title{ font:600 12px/1.3 var(--font); color:var(--ink-soft); margin:0.2em 0 0.35em; }
.analiza-bought-item{ display:inline-block; margin:0 0.5em 0.35em 0; padding:2px 8px; border-radius:6px; background:var(--fill); font-size:12.5px; }
```

- [ ] **Korak 4: „na listi“ u Budžetu.** U `renderCategories`, pre mapiranja kategorija, izračunaj:

```js
    const shopEst = C.shoppingEstimate(shopping.items.map(i=> Object.assign({}, i, { category: shopCategoryOf(i) || C.NO_CATEGORY }))).byCategory;
```

U redu kategorije `c`, ako je `shopEst[c] > 0`, dodaj posle naziva:

```js
<span class="shop-on-list${(()=>{ const env = envelopeRemainingThisMonth(c); return env && shopEst[c] > env.remaining ? ' over' : ''; })()}">${t('na listi ~{0}', fmt(shopEst[c]))}</span>
```

Pre toga proveri koji deo reda sadrži naziv (`<span class="name">`).

CSS: `.shop-on-list{ font-size:12px; color:var(--ink-soft); margin-left:0.5em; } .shop-on-list.over{ color:var(--warn-text); font-weight:600; }`

- [ ] **Korak 5: EN:** `'Kupljene stvari': 'Items bought'`, `'na listi ~{0}': 'on list ~{0}'`.

- [ ] **Korak 6:** testovi + smoke. **Korak 7:** Commit (`Paket 3: cene pri kupovini, kupljene stvari u Analizi, na listi u Budžetu`).

---

### Zadatak 3: „Vreme je da kupiš“ u Nabavci

**Fajlovi:** `budzet-tracker.html`, `i18n.js`, `app/test/smoke-checks.js`.

**Interfejsi:** koristi `C.restockSuggestions`, `addShoppingFromInput`/`C.findShoppingItem`, `shopping`, `saveShopping`, `renderShopping`, `toISODateLocal`.

- [ ] **Korak 1: Smoke** (ispred `// Cuvanje u fajl`):

```js
    // Paket 3: predlozi "Vreme je da kupis" posle tri kupovine iste stvari
    const cat3 = window.__desktopBridge.getQuickAddData().expenseCats[0];
    const dAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
    const rsIds = [];
    for (const n of [30, 20, 10]) {
      const r = window.__desktopBridge.addEntry({ type: 'expense', desc: 'P3 radnja', amount: 100, currency: 'RSD', category: cat3, date: dAgo(n) });
      const e = entries().filter(x => x.desc === 'P3 radnja' && x.date === dAgo(n)).pop();
      if (r.ok && e) { window.__setEntryItems(e.id, ['P3 kafa (1 kom)']); rsIds.push(e.id); }
    }
    go('nabavka'); await sleep(80);
    const sug = [...document.querySelectorAll('#shopSuggest .shop-suggest-row')].find(r => /P3 kafa/.test(r.textContent));
    check('nabavka: predlog posle tri kupovine', !!sug, $('shopSuggest') && $('shopSuggest').textContent);
    if (sug) {
      sug.querySelector('.shop-suggest-add').click(); await sleep(60);
      const it = window.BudzetCore.findShoppingItem(window.__shopping().items, 'P3 kafa');
      check('nabavka: "Dodaj" stavlja stvar na listu', !!it && it.needed === true);
      it.needed = false; window.__saveShopping(); await sleep(60);
      const sug2 = [...document.querySelectorAll('#shopSuggest .shop-suggest-row')].find(r => /P3 kafa/.test(r.textContent));
      sug2 && sug2.querySelector('.shop-suggest-hide').click(); await sleep(60);
      check('nabavka: "✕" sakriva predlog', ![...document.querySelectorAll('#shopSuggest .shop-suggest-row')].some(r => /P3 kafa/.test(r.textContent)));
      window.__shopping().items = window.__shopping().items.filter(i => i.id !== it.id); window.__saveShopping();
    }
    window.__deleteEntriesById(rsIds);
```

Proveri da `__desktopBridge.addEntry` prihvata `date` (jeste, koristi se u ranijim smoke proverama) i da `__setEntryItems` postoji.

- [ ] **Korak 2: HTML.** Na ekranu Nabavka, između prvog panela (brzi unos) i panela liste, dodaj:

```html
    <div class="panel shop-suggest" id="shopSuggest" style="display:none; margin-top:1.5em;"></div>
```

- [ ] **Korak 3: Logika** (u odeljku Nabavka):

```js
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
      addShoppingFromInput(s.name);
      renderShopping();
    }));
    box.querySelectorAll('.shop-suggest-hide').forEach(b=> b.addEventListener('click', ()=>{
      const key = b.dataset.key;
      const last = entries.filter(e=> e.type === 'expense' && e.paid !== false && Array.isArray(e.items) && e.items.some(l=> C.purchasedItemKey(l) === key)).map(e=> e.date).sort().pop();
      if(!shopping.dismissed) shopping.dismissed = {};
      shopping.dismissed[key] = last || toISODateLocal(new Date());
      saveShopping(); renderShopping();
    }));
  }
```

Pozovi `renderShoppingSuggestions()` u `renderShopping()` (npr. pre `renderShoppingFooter()`). `addShoppingFromInput(s.name)` pravi novu stavku ili uključuje `needed` na postojećoj. `daysTxt(n)` postoji (`'{0} dan'` ili `'{0} dana'`).

CSS:

```css
.shop-suggest-row{ display:grid; grid-template-columns:minmax(0,1fr) auto auto auto; gap:0.7em; align-items:center; padding:0.4em 0; border-bottom:1px solid var(--paper-line); }
.shop-suggest-row .btn-secondary{ padding:3px 10px; font-size:12.5px; }
@media (max-width: 600px){ .shop-suggest-row{ grid-template-columns:1fr auto auto; } .shop-suggest-row .shop-meta{ grid-column:1 / -1; order:3; } }
```

- [ ] **Korak 4: EN:**
- `'Vreme je da kupiš': 'Time to buy'`
- `'kupuješ na ~{0} dana, poslednji put pre {1}': 'you buy it every ~{0} days, last time {1} ago'`
- `'Sakrij do sledeće kupovine': 'Hide until the next purchase'`

`'Dodaj'` već postoji.

- [ ] **Korak 5:** testovi + smoke. **Korak 6:** Commit (`Paket 3: predlozi vreme je da kupiš`).
