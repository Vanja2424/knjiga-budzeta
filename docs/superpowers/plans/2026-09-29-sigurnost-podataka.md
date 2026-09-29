# Paket 1 — Sigurnost podataka — plan implementacije

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Cilj:** Popraviti pet rizika za podatke i premestiti glavno računanje u testirano jezgro:
- automatsko plaćanje i za propuštene mesece
- bezbedno čuvanje pre ažuriranja i pri izlasku
- provera Excel uvoza i vraćanja kopije
- zaštita kategorija od prevoda
- računanje u jezgru, sa zbirovima zaokruženim na pare

**Arhitektura:** Čiste funkcije idu u `budzet-core.js` (`C`) uz testove u `app/test/core.test.js`. Stranica (`budzet-tracker.html`) zadržava ista imena funkcija kao tanke omotače. `app/main.js` dobija proveru rezultata čuvanja pre instalacije i izlaska.

**Tehnologije:** čist JS, Electron, `node:test`, smoke (pravi Electron nad privremenom kopijom).

**Specifikacija:** `docs/superpowers/specs/2026-09-29-sigurnost-podataka-design.md`

## Globalna ograničenja

- Web kod ima samo jedan izvor, koren `E:\Vanja`: `budzet-tracker.html`, `budzet-core.js`, `i18n.js`. Kopije u `E:\Vanja\app\` se nikad ne menjaju. `app/main.js` (CRLF!) i `app/test/*` se menjaju na svom mestu.
- `budzet-core.js` nema DOM ni stanje.
- Novi ključ u localStorage: `budzet-autoupis-poslednji-mesec-v1` („YYYY-MM“).
- Automatsko plaćanje obrađuje najviše **24** meseca unazad. Bez ključa se obrađuje samo tekući mesec.
- Zbirovi novca (`monthTotals`, `overallBalance`) se zaokružuju na pare: `Math.round(x*100)/100`.
- Excel mora da ima listove `Stavke` i `Kategorije`. `Stavke` mora da ima kolone `Datum`, `Opis`, `Iznos` i `Tip`, osim ako je list potpuno prazan (izvoz bez ijedne stavke).
- Tekst u UI je na srpskom. Tekst sa vrednostima ide kroz `t('… {0}', x)`. **Svaki novi tekst dobija EN unos**: u `i18n.js` za stranicu, a u `EN` mapi u `app/main.js` za dijaloge i obaveštenja. Lokalna promenljiva se ne zove `t`.
- Fajlove menjaj alatom Edit, nikad PowerShell `Set-Content`.
- Testovi: `cd /e/Vanja/app && npm test`. Smoke: `cd /e/Vanja/app && npm run copy-web && node test/smoke.js "C:/Users/gejme/OneDrive/Belgeler/Knjiga budzeta/podaci.json"`. Ne koristi `npm run smoke -- …`. Sve provere moraju da prođu.
- Git: `/e/Vanja`, grana `sigurnost-podataka`. Poruka svakog commita završava se tačno sa `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Bez podizanja verzije i bez objave.

## Preciziranja specifikacije

- Poruka o upisu za propuštene mesece ima dugme **„Poništi“** (`showUndoToast`). Ono uklanja te upise i njihove `applied` oznake. Ključ poslednjeg meseca ostaje tekući mesec, pa se ti meseci ne obrađuju ponovo.
- `checkDataFileShape` zahteva bar jedan ključ `budzet-*`. Poznati ključevi moraju biti ispravnog tipa ako postoje. `budzet-stavke-v2` nije obavezan, jer korisnik bez stavki možda nema taj ključ.

## Na šta obratiti pažnju pri pregledu

1. **Stavka sa automatskim plaćanjem za mesec koji je korisnik preskočio ili ručno isključio** ne sme da se upiše pri obradi propuštenih meseci. Test je u zadatku 1 (`autoPayDue`).
2. **Prelaz godine** (poslednji 2026-11, tekući 2027-02) daje tačno 2026-12, 2027-01 i 2027-02. Test je u zadatku 1 (`monthsToProcess`).
3. **Excel izvoz korisnika bez stavki** (prazan list „Stavke“) i dalje mora da prođe uvoz. Test je u zadatku 2 (`checkWorkbookShape`).
4. **Otkazivanje izlaska u dijalogu** vraća aplikaciju u normalan rad (`isQuitting = false`). Proverava se u pregledu zadatka 4.
5. **Opcije kategorija u EN režimu** zadržavaju srpsku vrednost. Test je smoke u zadatku 4 (`value` i `translate="no"` na opcijama).

---

### Zadatak 1: Jezgro — meseci, zbirovi, ponavljajuće, automatsko plaćanje

**Fajlovi:** `budzet-core.js` (nov odeljak `// ---------- Mesec i ponavljajuce ----------` posle odeljka Nabavka, pre `return {`, i izvoz), `app/test/core.test.js` (na kraj).

**Interfejsi (pravi):**
- `C.round2(x) → number`
- `C.monthTotals(entries, mKey) → { income, expense, net, byCat, catEntries }`
- `C.isRecurringPaid(applied, r, mKey)` i `C.isRecurringSkipped(skipped, r, mKey)` → boolean
- `C.recurringEntryId(r, mKey) → 'rec-<id>-<mKey>'`
- `C.pendingRecurringItems(recurring, entries, applied, skipped, mKey, currentMonth) → r[]`
- `C.monthsToProcess(last, current, max) → string[]`
- `C.autoPayDue(recurring, { applied, skipped, optOut }, mKey, dayLimit) → r[]`

- [ ] **Korak 1: Napiši testove koji padaju** (dodaj na kraj `app/test/core.test.js`):

```js
// ---------- Mesec i ponavljajuce ----------
test('monthTotals: prihodi, placeni rashodi, raspodela, zaokruzivanje na pare', () => {
  const entries = [
    { id: 'i', type: 'income', date: '2026-09-05', amount: 100000.1, category: 'Plata' },
    { id: 'a', type: 'expense', date: '2026-09-06', amount: 0.1, category: 'Hrana' },
    { id: 'b', type: 'expense', date: '2026-09-07', amount: 0.2, category: 'Hrana' },
    { id: 'c', type: 'expense', date: '2026-09-08', amount: 500, category: 'Prevoz', paid: false },
    { id: 'd', type: 'expense', date: '2026-08-10', amount: 3000, category: 'Stan', spreadMonths: 3, spreadStart: '2026-08' },
    { id: 't', type: 'transfer', date: '2026-09-09', amount: 999, fromAccount: 'x', toAccount: 'y' }
  ];
  const m = C.monthTotals(entries, '2026-09');
  assert.equal(m.income, 100000.1);
  assert.equal(m.expense, 1000.3);   // 0,1 + 0,2 + 1000 (deo raspodele), tacno na pare
  assert.equal(m.net, 98999.8);
  assert.deepEqual(m.byCat, { Hrana: 0.3, Stan: 1000 });
  assert.deepEqual(m.catEntries.map(x => x[0]), ['Stan', 'Hrana']);
  assert.deepEqual(C.monthTotals([], '2026-09'), { income: 0, expense: 0, net: 0, byCat: {}, catEntries: [] });
  assert.equal(C.round2(0.1 + 0.2), 0.3);
});

test('pendingRecurringItems: nije placeno, preskoceno ni upisano; prosli mesec prazan', () => {
  const recurring = [
    { id: 'k', desc: 'Kirija', amount: 18000, type: 'expense', frequency: 'monthly' },
    { id: 'n', desc: 'Netflix', amount: 1292, type: 'expense', frequency: 'monthly' },
    { id: 'p', desc: 'Porez', amount: 8000, type: 'expense', frequency: 'monthly' },
    { id: 'o', desc: 'Osiguranje', amount: 24000, type: 'expense', frequency: 'yearly', anchorMonth: 3 },
    { id: 's', desc: 'Plata', amount: 100000, type: 'income', frequency: 'monthly' }
  ];
  const entries = [{ id: 'rec-p-2026-10', type: 'expense', date: '2026-10-01', amount: 8000 }];
  const applied = { '2026-10': ['k'] }, skipped = { '2026-10': ['n'] };
  assert.deepEqual(C.pendingRecurringItems(recurring, entries, applied, skipped, '2026-10', '2026-09').map(r => r.id), ['s']);
  assert.deepEqual(C.pendingRecurringItems(recurring, entries, applied, skipped, '2026-11', '2026-09').map(r => r.id), ['k', 'n', 'p', 's']);
  assert.deepEqual(C.pendingRecurringItems(recurring, entries, applied, skipped, '2026-08', '2026-09'), []);
  assert.equal(C.isRecurringPaid(applied, { id: 'k' }, '2026-10'), true);
  assert.equal(C.isRecurringSkipped(skipped, { id: 'k' }, '2026-10'), false);
  assert.equal(C.recurringEntryId({ id: 'k' }, '2026-10'), 'rec-k-2026-10');
});

test('monthsToProcess: bez kljuca, propusteni meseci, prelaz godine, ogranicenje', () => {
  assert.deepEqual(C.monthsToProcess(null, '2026-09', 24), ['2026-09']);
  assert.deepEqual(C.monthsToProcess('smece', '2026-09', 24), ['2026-09']);
  assert.deepEqual(C.monthsToProcess('2026-09', '2026-09', 24), ['2026-09']);
  assert.deepEqual(C.monthsToProcess('2026-08', '2026-09', 24), ['2026-09']);
  assert.deepEqual(C.monthsToProcess('2026-11', '2027-02', 24), ['2026-12', '2027-01', '2027-02']);
  assert.deepEqual(C.monthsToProcess('2027-05', '2026-09', 24), ['2026-09']); // sat unazad
  const long = C.monthsToProcess('2020-01', '2026-09', 24);
  assert.equal(long.length, 24);
  assert.equal(long[0], '2024-10');
  assert.equal(long[23], '2026-09');
});

test('autoPayDue: samo autoPay, dospelo, nije placeno/preskoceno/iskljuceno, dan za tekuci mesec', () => {
  const recurring = [
    { id: 'a', autoPay: true, day: 5, frequency: 'monthly' },
    { id: 'b', autoPay: true, day: 20, frequency: 'monthly' },
    { id: 'c', autoPay: false, day: 1, frequency: 'monthly' },
    { id: 'd', autoPay: true, day: 1, frequency: 'monthly' },
    { id: 'e', autoPay: true, day: 1, frequency: 'monthly' },
    { id: 'f', autoPay: true, day: 1, frequency: 'monthly' },
    { id: 'g', autoPay: true, day: 1, frequency: 'quarterly', anchorMonth: 1 }
  ];
  const state = { applied: { '2026-08': ['d'] }, skipped: { '2026-08': ['e'] }, optOut: { '2026-08': ['f'] } };
  assert.deepEqual(C.autoPayDue(recurring, state, '2026-08', null).map(r => r.id), ['a', 'b']);   // prosli mesec: bez obzira na dan; avgust nije kvartal od januara
  assert.deepEqual(C.autoPayDue(recurring, state, '2026-10', 10).map(r => r.id), ['a', 'd', 'e', 'f', 'g']); // tekuci: dan <= 10
  assert.deepEqual(C.autoPayDue(recurring, state, '2026-10', 31).map(r => r.id), ['a', 'b', 'd', 'e', 'f', 'g']);
  assert.deepEqual(C.autoPayDue([], state, '2026-10', 31), []);
  assert.deepEqual(C.autoPayDue(recurring, undefined, '2026-08', null).map(r => r.id), ['a', 'b', 'd', 'e', 'f']);
});
```

- [ ] **Korak 2: Pokreni testove i proveri da padaju.** Komanda: `cd /e/Vanja/app && npm test`. Očekuje se `C.monthTotals is not a function`.

- [ ] **Korak 3: Napiši implementaciju.** Posle `splitPurchase` (kraj odeljka Nabavka) dodaj:

```js
  // ---------- Mesec i ponavljajuce (premesteno iz stranice radi testova) ----------
  const round2 = x => Math.round(x * 100) / 100;
  // Mesecni zbir: prihodi + placeni rashodi, raspodeljene stavke mesecnim delom; sve zaokruzeno na pare.
  function monthTotals(entries, mKey){
    let income = 0, expense = 0;
    const byCat = {};
    entries.forEach(e => {
      if(e.type !== 'income' && !isPaidExp(e)) return;
      const share = shareInMonth(e, mKey);
      if(!share) return;
      if(e.type === 'income') income += share;
      else { expense += share; byCat[e.category] = (byCat[e.category] || 0) + share; }
    });
    Object.keys(byCat).forEach(k => { byCat[k] = round2(byCat[k]); });
    income = round2(income); expense = round2(expense);
    return { income, expense, net: round2(income - expense), byCat, catEntries: Object.entries(byCat).sort((a, b) => b[1] - a[1]) };
  }
  const isRecurringPaid = (applied, r, mKey) => ((applied || {})[mKey] || []).includes(r.id);
  const isRecurringSkipped = (skipped, r, mKey) => ((skipped || {})[mKey] || []).includes(r.id);
  const recurringEntryId = (r, mKey) => 'rec-' + r.id + '-' + mKey;
  // Ponavljajuce koje u mesecu (tekucem ili buducem) tek dospevaju: nisu placene, preskocene ni upisane.
  function pendingRecurringItems(recurring, entries, applied, skipped, mKey, currentMonth){
    if(mKey < currentMonth) return [];
    const ids = new Set(entries.map(e => e.id));
    return recurring.filter(r => isDueInMonth(r, mKey) && !isRecurringPaid(applied, r, mKey) && !isRecurringSkipped(skipped, r, mKey) && !ids.has(recurringEntryId(r, mKey)));
  }
  // Meseci za automatsko upisivanje: od (poslednji obradjen + 1) do tekuceg, najvise `max` unazad; bez kljuca samo tekuci.
  function monthsToProcess(last, current, max){
    if(!/^\d{4}-\d{2}$/.test(last || '') || last >= current) return [current];
    const oldest = addMonths(current, -((max || 24) - 1));
    const from = addMonths(last, 1);
    return monthRange(from > oldest ? from : oldest, current);
  }
  // Stavke sa "Automatski upisi" dospele u mesecu; dayLimit = danasnji dan za tekuci mesec, null za prosle mesece.
  function autoPayDue(recurring, state, mKey, dayLimit){
    const s = state || {};
    return (recurring || []).filter(r => r.autoPay && isDueInMonth(r, mKey)
      && !isRecurringPaid(s.applied, r, mKey) && !isRecurringSkipped(s.skipped, r, mKey)
      && !(((s.optOut || {})[mKey]) || []).includes(r.id)
      && (dayLimit == null || effectiveDay(r.day, mKey) <= dayLimit));
  }
```

Dodaj u izvoz: `round2, monthTotals, isRecurringPaid, isRecurringSkipped, recurringEntryId, pendingRecurringItems, monthsToProcess, autoPayDue`.

- [ ] **Korak 4: Pokreni testove i proveri da prolaze.** Očekuje se da svi prođu.

- [ ] **Korak 5: Commit** (`Paket 1: jezgro — mesečni zbirovi, ponavljajuće, automatsko plaćanje`).

---

### Zadatak 2: Jezgro — provera Excel fajla i fajla kopije

**Fajlovi:** `budzet-core.js` (nastavak odeljka i izvoz), `app/test/core.test.js`.

**Interfejsi (pravi):**
- `C.checkWorkbookShape(sheetNames, stavkeHeader) → { ok, missing: string[] }`
- `C.checkDataFileShape(data) → { ok, problems: string[] }`

- [ ] **Korak 1: Testovi koji padaju:**

```js
test('checkWorkbookShape: listovi i kolone, prazan list Stavke prolazi', () => {
  const full = ['ID', 'Datum', 'Opis', 'Kategorija', 'Tip', 'Iznos', 'Placeno'];
  assert.deepEqual(C.checkWorkbookShape(['Stavke', 'Kategorije', 'Ciljevi'], full), { ok: true, missing: [] });
  assert.deepEqual(C.checkWorkbookShape(['Stavke', 'Kategorije'], []), { ok: true, missing: [] });   // izvoz bez ijedne stavke
  assert.deepEqual(C.checkWorkbookShape(['Sheet1'], ['Datum', 'Opis', 'Iznos']), { ok: false, missing: ['Stavke', 'Kategorije'] });
  assert.deepEqual(C.checkWorkbookShape(['Stavke', 'Kategorije'], ['Datum', 'Opis', 'Iznos']), { ok: false, missing: ['Stavke: Tip'] });
  assert.equal(C.checkWorkbookShape(undefined, undefined).ok, false);
});

test('checkDataFileShape: poznati kljucevi ispravnog tipa, JSON string ili vrednost', () => {
  assert.deepEqual(C.checkDataFileShape({ 'budzet-stavke-v2': [], 'budzet-limiti-v1': {} }), { ok: true, problems: [] });
  assert.deepEqual(C.checkDataFileShape({ 'budzet-stavke-v2': '[{"id":"a"}]', 'budzet-primenjeno-v1': '{}' }), { ok: true, problems: [] });
  assert.deepEqual(C.checkDataFileShape({ 'budzet-tema-v1': 'dark' }), { ok: true, problems: [] }); // bez stavki, ali nas fajl
  assert.deepEqual(C.checkDataFileShape({ 'budzet-stavke-v2': '{"x":1}' }), { ok: false, problems: ['budzet-stavke-v2'] });
  assert.deepEqual(C.checkDataFileShape({ 'budzet-stavke-v2': [], 'budzet-limiti-v1': [] }), { ok: false, problems: ['budzet-limiti-v1'] });
  assert.deepEqual(C.checkDataFileShape({ 'budzet-dugovi-v1': 'nije json' }), { ok: false, problems: ['budzet-dugovi-v1'] });
  assert.deepEqual(C.checkDataFileShape({ nesto: 1 }), { ok: false, problems: ['nema podataka Knjige budžeta'] });
  assert.equal(C.checkDataFileShape(null).ok, false);
  assert.equal(C.checkDataFileShape([]).ok, false);
});
```

- [ ] **Korak 2:** Pokreni i proveri da padaju.

- [ ] **Korak 3: Implementacija** (posle `autoPayDue`):

```js
  // Da li Excel izgleda kao izvoz Knjige budzeta (pre nego sto zameni sve podatke). Prazan list Stavke = izvoz bez stavki.
  const WORKBOOK_SHEETS = ['Stavke', 'Kategorije'];
  const STAVKE_COLUMNS = ['Datum', 'Opis', 'Iznos', 'Tip'];
  function checkWorkbookShape(sheetNames, stavkeHeader){
    const names = sheetNames || [];
    const missing = WORKBOOK_SHEETS.filter(s => !names.includes(s));
    const header = stavkeHeader || [];
    if(!missing.length && header.length) STAVKE_COLUMNS.forEach(c => { if(!header.includes(c)) missing.push('Stavke: ' + c); });
    return { ok: !missing.length, missing };
  }
  // Da li je fajl kopije (podaci.json) nas i neostecen: poznati kljucevi moraju biti niz/objekat (ili JSON string toga).
  const DATA_ARRAY_KEYS = ['budzet-stavke-v2', 'budzet-ponavljajuce-v1', 'budzet-ciljevi-v1', 'budzet-dugovi-v1', 'budzet-racuni-v1'];
  const DATA_OBJECT_KEYS = ['budzet-limiti-v1', 'budzet-primenjeno-v1', 'budzet-preskoceno-v1'];
  function checkDataFileShape(data){
    if(!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, problems: ['nema podataka Knjige budžeta'] };
    if(!Object.keys(data).some(k => k.startsWith('budzet-'))) return { ok: false, problems: ['nema podataka Knjige budžeta'] };
    const parse = v => { if(typeof v !== 'string') return v; try { return JSON.parse(v); } catch(e) { return undefined; } };
    const problems = [];
    DATA_ARRAY_KEYS.forEach(k => { if(k in data && !Array.isArray(parse(data[k]))) problems.push(k); });
    DATA_OBJECT_KEYS.forEach(k => { if(!(k in data)) return; const v = parse(data[k]); if(!v || typeof v !== 'object' || Array.isArray(v)) problems.push(k); });
    return { ok: !problems.length, problems };
  }
```

Izvoz: `checkWorkbookShape, checkDataFileShape`.

- [ ] **Korak 4:** Pokreni i proveri da prolaze. **Korak 5:** Commit (`Paket 1: jezgro — provera Excel fajla i kopije`).

---

### Zadatak 3: Stranica — zbirovi iz jezgra i automatsko plaćanje za propuštene mesece

**Fajlovi:** `budzet-tracker.html`, `i18n.js`, `app/test/smoke-checks.js`.

**Interfejsi:**
- Koristi (iz zadatka 1): `C.monthTotals`, `C.round2`, `C.isRecurringPaid`, `C.isRecurringSkipped`, `C.pendingRecurringItems`, `C.monthsToProcess`, `C.autoPayDue`
- Pravi: `window.__processAutoPay = processAutoPay` (za smoke)

- [ ] **Korak 1: Smoke provera koja pada.** Dodaj ispred `// Cuvanje u fajl` u `app/test/smoke-checks.js`:

```js
    // Automatsko plaćanje za propuštene mesece (aplikacija nije bila otvarana)
    const apKey = 'budzet-autoupis-poslednji-mesec-v1';
    check('autoupis: ključ poslednjeg meseca postoji', localStorage.getItem(apKey) === curM, localStorage.getItem(apKey));
    const apRec = JSON.parse(localStorage.getItem('budzet-ponavljajuce-v1') || '[]').find(r => r.desc === 'Smoke pretplata');
    if (apRec && typeof window.__processAutoPay === 'function') {
      const m1 = window.BudzetCore.addMonths(curM, -2), m2 = window.BudzetCore.addMonths(curM, -1);
      localStorage.setItem(apKey, window.BudzetCore.addMonths(curM, -3));
      window.__processAutoPay(); await sleep(60);
      const ids = entries().map(e => e.id);
      check('autoupis: propušteni meseci su upisani', ids.includes('rec-' + apRec.id + '-' + m1) && ids.includes('rec-' + apRec.id + '-' + m2), JSON.stringify([m1, m2]));
      check('autoupis: ključ je posle obrade tekući mesec', localStorage.getItem(apKey) === curM);
      window.__deleteEntriesById(['rec-' + apRec.id + '-' + m1, 'rec-' + apRec.id + '-' + m2]);
    }
```

`curM` i `entries` već postoje u smoke fajlu. Ako `curM` nije definisan pre ovog mesta, definiši `const curM2 = monthKey(new Date())` i koristi njega. Proveri to grep-om.

Pokreni smoke i proveri da pada (`✗ autoupis: ključ…`).

- [ ] **Korak 2: Zbirovi i ponavljajuće preko jezgra.** U `budzet-tracker.html`:
- Telo `function monthTotals(mKey){ … }` zameni sa `function monthTotals(mKey){ return C.monthTotals(entries, mKey); }`. Ostaje `function`, zbog hoisting-a.
- `function isPaid(r, mKey){ … }` → `function isPaid(r, mKey){ return C.isRecurringPaid(applied, r, mKey); }`. Isto za `isSkipped` sa `C.isRecurringSkipped(skipped, r, mKey)`.
- `pendingRecurring(mKey)` → `return C.pendingRecurringItems(recurring, entries, applied, skipped, mKey, currentMonthKey());`
- `overallBalance()`: rezultat vrati kao `C.round2(income - expense - debtExpenseTotals().paid)`.

- [ ] **Korak 3: Automatsko plaćanje za propuštene mesece.** Zameni `function processAutoPay(){ … }` (posle `let autoPayOptOut = …`):

```js
  // Obradjuje sve mesece od poslednjeg obradjenog do tekuceg (aplikacija je mozda bila zatvorena), najvise 24 unazad.
  // U proslim mesecima upisuje sve dospelo; u tekucem samo ono ciji je dan prosao.
  const AUTOPAY_LAST_KEY = 'budzet-autoupis-poslednji-mesec-v1';
  function processAutoPay(){
    const cur = currentMonthKey();
    const today = new Date().getDate();
    const months = C.monthsToProcess(localStorage.getItem(AUTOPAY_LAST_KEY), cur, 24);
    let changed = false;
    const backfilled = [];
    months.forEach(mKey=>{
      C.autoPayDue(recurring, { applied, skipped, optOut: autoPayOptOut }, mKey, mKey === cur ? today : null).forEach(r=>{
        if(!applied[mKey]) applied[mKey] = [];
        applied[mKey].push(r.id);
        const id = recurringEntryId(r, mKey);
        if(!entries.some(e=>e.id === id)){
          entries.push(Object.assign(recurringEntry(r, mKey), { auto: true }));
          if(mKey !== cur) backfilled.push({ id, rid: r.id, mKey });
        }
        changed = true;
      });
    });
    if(localStorage.getItem(AUTOPAY_LAST_KEY) !== cur) localStorage.setItem(AUTOPAY_LAST_KEY, cur);
    if(changed){ saveApplied(); saveEntries(); }
    if(backfilled.length){
      showUndoToast(t('Automatski upisano za propuštene mesece: {0}', backfilled.length), ()=>{
        const ids = new Set(backfilled.map(b=> b.id));
        entries = entries.filter(e=> !ids.has(e.id));
        backfilled.forEach(b=>{ applied[b.mKey] = (applied[b.mKey] || []).filter(x=> x !== b.rid); });
        saveApplied(); saveEntries(); renderAll();
      });
    }
    return changed;
  }
  window.__processAutoPay = () => { const c = processAutoPay(); if(c) renderAll(); return c; };
```

Proveri pozive `processAutoPay()` (pri učitavanju, na 15 minuta, posle čuvanja ponavljajuće stavke). Ponašanje povratne vrednosti je isto. Proveri i da `showUndoToast` postoji pre prvog poziva pri učitavanju. Deklarisan je kao `function`, pa hoisting važi. Ako poruka pri učitavanju ne može da se prikaže (npr. DOM još nije spreman), odloži je sa `setTimeout(…, 0)`.

- [ ] **Korak 4: EN** u `i18n.js`: `'Automatski upisano za propuštene mesece: {0}': 'Recorded automatically for missed months: {0}'`.

- [ ] **Korak 5:** `npm test` i smoke. Očekuje se `SVE U REDU`. **Korak 6:** Commit (`Paket 1: zbirovi iz jezgra, automatski upis za propuštene mesece`).

---

### Zadatak 4: Čuvanje pre ažuriranja/izlaska, provera uvoza i kopije, zaštita kategorija

**Fajlovi:** `budzet-tracker.html`, `app/main.js` (CRLF), `i18n.js`, `app/test/smoke-checks.js`.

**Interfejsi:** koristi `C.checkWorkbookShape` i `C.checkDataFileShape` iz zadatka 2. Pravi `window.__workbookShapeError(wb)` za smoke.

- [ ] **Korak 1: Smoke provere koje padaju** (ispred `// Cuvanje u fajl`):

```js
    // Sigurnost: flush vraca rezultat, uvoz pogresnog Excela je odbijen, opcije kategorija zasticene od prevoda
    const fr = await window.__desktopBridge.flush();
    check('flush vraća rezultat čuvanja', !!fr && fr.ok === true, JSON.stringify(fr));
    if (typeof window.__workbookShapeError === 'function') {
      const badWb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(badWb, XLSX.utils.aoa_to_sheet([['Datum', 'Opis', 'Iznos']]), 'Sheet1');
      check('pogrešan Excel je odbijen', typeof window.__workbookShapeError(badWb) === 'string');
      check('naš Excel prolazi proveru', window.__workbookShapeError(window.__buildWorkbook()) === null);
    } else check('provera Excel fajla postoji', false);
    check('opcije kategorija imaju vrednost i nisu za prevod', [...$('expCategory').options].every(o => o.hasAttribute('value') && o.getAttribute('translate') === 'no'));
```

Pokreni i proveri da pada.

- [ ] **Korak 2: `flush` vraća rezultat.** U gornjem `<script>` (desktop skladište), `function flushSync(){…}` vraća `true` ili `false`. Kad nema prljavih izmena vraća `true`, a u grani `if(r && r.ok)` vraća `true`, inače `false`. `window.__desktopBridge.flush` (oko reda 8448) postaje:

```js
      async flush(){
        const ok = dataStore.flushSync();
        return { ok: ok !== false, error: ok === false ? (dataStore.status && dataStore.status.error) || 'save failed' : null };
      }
```

Proveri kako `dataStore` izlaže `status` (grep `status`). Prilagodi ako se zove drugačije, i to zapiši u izveštaj.

- [ ] **Korak 3: main.js.** `flushRenderer()` vraća rezultat:

```js
async function flushRenderer() {
  try {
    const res = await Promise.race([
      runInMain('window.__desktopBridge ? window.__desktopBridge.flush() : null'),
      new Promise(r => setTimeout(() => r({ ok: false, error: 'timeout' }), 3000))
    ]);
    if (res == null) return { ok: true, error: null };
    return { ok: !!res.ok, error: res.error || null };
  } catch (err) { return { ok: false, error: String(err && err.message || err) }; }
}
```

`installUpdateNow`, posle `setUpdate({ status: 'installing', … })`, zameni `await flushRenderer();` sa:

```js
  let saved = await flushRenderer();
  if (!saved.ok) { await new Promise(r => setTimeout(r, 2000)); saved = await flushRenderer(); }
  if (!saved.ok) {
    // Ne instaliraj dok podaci nisu upisani: odlozi 5 minuta i javi korisniku
    installing = false;
    setUpdate({ status: 'ready', installAt: null });
    updateTimer = setTimeout(() => installUpdateNow(opts), 5 * 60 * 1000);
    if (Notification.isSupported()) new Notification({ title: T('Knjiga budžeta'), body: T('Ažuriranje je odloženo: podaci nisu mogli da se sačuvaju (fajl je zauzet). Pokušaću ponovo za 5 minuta.'), icon: ICON_PATH }).show();
    return;
  }
```

Proveri kako renderer koristi `installAt` i `status: 'ready'` (grep `installAt` u oba fajla). Stanje posle odlaganja ne sme da pokrene novo odbrojavanje od 60 s u prozoru. Ako pokreće, podesi `installAt` na vreme novog pokušaja, a ne `null`. Zapiši šta si izabrao.

`quitApp`, posle `saveSettingsNow();`, zameni `await flushRenderer();` sa:

```js
  let saved = await flushRenderer();
  while (!saved.ok) {
    const { response } = await dialog.showMessageBox(mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined, {
      type: 'warning', title: T('Knjiga budžeta'), message: T('Podaci nisu sačuvani.'),
      detail: T('Fajl sa podacima je možda zauzet (OneDrive, antivirus). Poslednje izmene mogu da se izgube.') + (saved.error ? '\n\n' + saved.error : ''),
      buttons: [T('Pokušaj ponovo'), T('Izađi bez čuvanja'), T('Otkaži')], defaultId: 0, cancelId: 2, noLink: true
    });
    if (response === 0) { saved = await flushRenderer(); continue; }
    if (response === 2) { isQuitting = false; return; }
    break;
  }
```

Dodaj EN u `EN` mapu u main.js:
- `'Ažuriranje je odloženo: podaci nisu mogli da se sačuvaju (fajl je zauzet). Pokušaću ponovo za 5 minuta.': 'Update postponed: your data could not be saved (the file is busy). I will try again in 5 minutes.'`
- `'Podaci nisu sačuvani.': 'Your data was not saved.'`
- `'Fajl sa podacima je možda zauzet (OneDrive, antivirus). Poslednje izmene mogu da se izgube.': 'The data file may be busy (OneDrive, antivirus). Your latest changes may be lost.'`
- `'Pokušaj ponovo': 'Try again'`
- `'Izađi bez čuvanja': 'Quit without saving'`
- `'Otkaži': 'Cancel'`

Proveri da li neki od ovih ključeva već postoji.

- [ ] **Korak 4: Provera Excel uvoza.** U stranicu, pored `parseWorkbook`:

```js
  // Pre zamene svih podataka: da li Excel izgleda kao nas izvoz (null = u redu, inace poruka za korisnika)
  function workbookShapeError(wb){
    const ws = wb.Sheets['Stavke'];
    const header = ws ? (XLSX.utils.sheet_to_json(ws, { header: 1 })[0] || []) : [];
    const chk = C.checkWorkbookShape(wb.SheetNames, header);
    return chk.ok ? null : t('Ovo ne izgleda kao Excel fajl Knjige budžeta (nedostaje: {0}). Podaci nisu promenjeni.', chk.missing.join(', '));
  }
  window.__workbookShapeError = workbookShapeError;
```

Postojeći `window.__buildWorkbook` je dodat u paketu Nabavka. Ako ne postoji, izloži ga isto.

U handleru `excelManualImportInput`, odmah posle `const wb = XLSX.read(…)`:

```js
            const bad = workbookShapeError(wb);
            if(bad){ appAlert(bad); return; }
```

U toj grani, ako `window.__desktopData` ne postoji (browser), pre `parseWorkbook` preuzmi JSON rezervnu kopiju postojećom funkcijom za izvoz. Nađi je preko `grep -n "exportedAt" budzet-tracker.html` i dugmeta za JSON izvoz. Pozovi njenu radnju za preuzimanje, ili izdvoj tu radnju u funkciju i pozovi je.

U `readExcelFileIntoLocal`, posle `XLSX.read`: `const bad = workbookShapeError(wb); if(bad) throw new Error(bad);`. Proveri da pozivaoci hvataju izuzetak i prikazuju poruku.

- [ ] **Korak 5: Provera fajla kopije.** U handleru `backupImportInput`, u grani `raw.app === 'Knjiga budzeta'`, pre `appConfirm`:

```js
          const shape = C.checkDataFileShape(raw.data);
          if(!shape.ok){ appAlert(t('Kopija je oštećena ili nije iz Knjige budžeta ({0}). Podaci nisu promenjeni.', shape.problems.join(', '))); return; }
```

- [ ] **Korak 6: Zaštita kategorija od prevoda.** Dodaj pomoćnu funkciju blizu `escapeHtml`:

```js
  // Opcija sa korisnickim podatkom: eksplicitna vrednost + bez prevoda (prevod bi inace promenio sacuvanu vrednost)
  const userOption = (v, selected) => `<option value="${escapeHtml(v)}" translate="no"${selected ? ' selected' : ''}>${escapeHtml(v)}</option>`;
```

Zameni svako `` `<option>${escapeHtml(c)}</option>` `` (nađi ih sa `grep -n "<option>\${escapeHtml(" budzet-tracker.html`, očekuje se 8 mesta: redovi oko 5822, 5826, 5855, 5857, 5874, 6039, 7150, 7952) sa `userOption(c)`. Za onboarding red (`obEnvelopeCat`) takođe. Ne diraj opcije koje nisu korisnički podaci (npr. „Sve kategorije“ sa `value=""`).

- [ ] **Korak 7: EN** u `i18n.js`:
- `'Ovo ne izgleda kao Excel fajl Knjige budžeta (nedostaje: {0}). Podaci nisu promenjeni.': 'This does not look like a Budget Book Excel file (missing: {0}). Your data was not changed.'`
- `'Kopija je oštećena ili nije iz Knjige budžeta ({0}). Podaci nisu promenjeni.': 'The backup is damaged or not from Budget Book ({0}). Your data was not changed.'`

- [ ] **Korak 8:** `npm test` i smoke. Očekuje se `SVE U REDU`. **Korak 9:** Commit (`Paket 1: bezbedno čuvanje, provera uvoza i kopije, zaštita kategorija`).
