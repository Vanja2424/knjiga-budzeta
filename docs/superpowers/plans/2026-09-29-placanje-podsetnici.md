# Paket 2 — Plaćanje i podsetnici — plan implementacije

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Cilj:**
- „Plati sve zakasnele“ na ekranu Ponavljajuće
- obaveštenje koje vodi na stavku
- mesečna rata duga kao ponavljajuća stavka koja sama umanjuje dug
- preračun duga u stranoj valuti po današnjem kursu

**Arhitektura:** Pravila su u `budzet-core.js` (`C`), uz testove:
- šta je zakasnelo
- koliko je dug otplaćen
- `until` na ponavljajućoj stavki

`budzet-tracker.html` crta i povezuje. Rate su obične ponavljajuće stavke sa `debtId`. Njihovo plaćanje pravi rashod sa `debtId`. Otplaćeni deo duga je `d.paidAmount` (ručne uplate) plus plaćeni rashodi sa tim `debtId`.

**Specifikacija:** `docs/superpowers/specs/2026-09-29-placanje-podsetnici-design.md`

## Globalna ograničenja

- Web kod ima samo jedan izvor, koren `E:\Vanja`: `budzet-tracker.html`, `budzet-core.js`, `i18n.js`. Kopije u `E:\Vanja\app\` se nikad ne menjaju. `app/test/*` se menja na svom mestu.
- `budzet-core.js` nema DOM ni stanje.
- „Zakasnelo“ znači: rashod (`r.type !== 'income'`) iz ponavljajuće stavke, dospeo u tekućem mesecu, nije plaćen ni preskočen, i `effectiveDay(r.day, mKey) < danas`. Stavka koja dospeva danas nije zakasnela.
- **Nijedan iznos ne sme da se računa dvaput:**
  - `C.debtPaid(d, entries)` = `(d.paidAmount||0)` + zbir **plaćenih** rashoda (`type==='expense' && paid!==false`) sa `e.debtId === d.id`
  - `overallBalance` / `debtExpenseTotals().paid` i dalje koriste samo `d.paidAmount`, jer su rate već u rashodima
  - sve ostalo (ostatak, kartica, plan otplate, „Za plaćanje“, obaveštenja, broj kasnih) koristi `C.debtPaid`
- Rata: ponavljajuća stavka `{ type:'expense', desc:'Rata: <osoba>', frequency:'monthly', day, category, amount, debtId }`. Plaćanje rate predlaže `min(r.amount, ostatak duga)`. Kad je dug izmiren, stavka dobija `until: currentMonthKey()`. Kad dug ponovo ima ostatak, `until` se uklanja.
- `C.isDueInMonth(r, mKey)` vraća `false` kad `r.until` postoji i `mKey > r.until`.
- UI na srpskom. Tekst sa vrednostima ide kroz `t('… {0}', x)`. **Svaki novi tekst dobija EN unos u `i18n.js`.** Korisnički podaci idu kroz `escapeHtml`/`catTagHtml`/`userOption`. Lokalna promenljiva se ne zove `t`.
- CSS ide u sloj `apple-theme`, pre drugog `</style>`.
- Fajlove menjaj alatom Edit.
- Testovi: `cd /e/Vanja/app && npm test`. Smoke: `cd /e/Vanja/app && npm run copy-web && node test/smoke.js "C:/Users/gejme/OneDrive/Belgeler/Knjiga budzeta/podaci.json"`. Sve mora da prođe.
- Git: `/e/Vanja`, grana `placanje-podsetnici`. Trailer tačno `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Bez podizanja verzije i bez objave.

## Preciziranja specifikacije

- Dugme **„Napravi mesečnu ratu“** stoji na **kartici duga** (Dugujem, nije izmiren, nema ratu), a ne samo u panelu Plan otplate. Taj panel se prikazuje tek kad je kapacitet upisan, a kartica je uvek vidljiva.
- Poništavanje „Plati sve“ uklanja napravljene rashode i `applied` oznake **bez** `optOutAutoPay`. To nije ručno skidanje plaćanja, već vraćanje na stanje pre klika.

## Na šta obratiti pažnju pri pregledu

1. **Plaćena rata mora da smanji ostatak duga, ali ne sme da smanji „Ukupno stanje“ dvaput.** Test je smoke u zadatku 4 (stanje posle rate je umanjeno tačno za iznos rate).
2. **Brisanje rashoda rate vraća ostatak i uklanja `until`.** Test je smoke u zadatku 4.
3. **Stavka koja dospeva danas nije u „Plati sve zakasnele“.** Test je u zadatku 1 (`overdueRecurring`).
4. **Obaveštenje za stavku koja je u međuvremenu obrisana** ne sme da sruši aplikaciju. Samo otvara ekran. Test je smoke u zadatku 3.
5. **Preračun duga bez kursa** (offline) ne prikazuje dugme. Pokriva se pregledom zadatka 5.

---

### Zadatak 1: Jezgro — zakasnele stavke, otplaćeni deo duga, `until`

**Fajlovi:** `budzet-core.js` (`isDueInMonth` na vrhu fajla; nove funkcije u odeljku „Mesec i ponavljajuce“; izvoz), `app/test/core.test.js`.

**Interfejsi (pravi):**
- `C.overdueRecurring(recurring, applied, skipped, mKey, today) → r[]`
- `C.debtPaid(d, entries) → number`
- `C.isDueInMonth` sada poštuje `until`

- [ ] **Korak 1: Testovi koji padaju** (na kraj `core.test.js`):

```js
// ---------- Placanje i podsetnici ----------
test('isDueInMonth: until zavrsava ponavljajucu stavku', () => {
  assert.equal(C.isDueInMonth({ frequency: 'monthly', until: '2026-10' }, '2026-10'), true);
  assert.equal(C.isDueInMonth({ frequency: 'monthly', until: '2026-10' }, '2026-11'), false);
  assert.equal(C.isDueInMonth({ frequency: 'monthly' }, '2030-01'), true);
  assert.equal(C.isDueInMonth({ frequency: 'yearly', anchorMonth: 3, until: '2026-12' }, '2027-03'), false);
});

test('overdueRecurring: samo rashodi, dan < danas, nije placeno ni preskoceno', () => {
  const recurring = [
    { id: 'k', type: 'expense', day: 1, frequency: 'monthly' },
    { id: 'd', type: 'expense', day: 29, frequency: 'monthly' },   // dospeva danas (29.) -> nije kasno
    { id: 'p', type: 'expense', day: 5, frequency: 'monthly' },    // placeno
    { id: 's', type: 'expense', day: 5, frequency: 'monthly' },    // preskoceno
    { id: 'i', type: 'income', day: 1, frequency: 'monthly' },     // prihod
    { id: 'q', type: 'expense', day: 1, frequency: 'quarterly', anchorMonth: 1 }, // septembar nije kvartal od januara
    { id: 'u', type: 'expense', day: 1, frequency: 'monthly', until: '2026-08' },
    { id: 'x', day: 2, frequency: 'monthly' }                      // bez type -> rashod
  ];
  const applied = { '2026-09': ['p'] }, skipped = { '2026-09': ['s'] };
  assert.deepEqual(C.overdueRecurring(recurring, applied, skipped, '2026-09', 29).map(r => r.id), ['k', 'x']);
  assert.deepEqual(C.overdueRecurring(recurring, applied, skipped, '2026-09', 1), []);
  assert.deepEqual(C.overdueRecurring([], applied, skipped, '2026-09', 29), []);
});

test('debtPaid: rucne uplate + placene rate tog duga', () => {
  const d = { id: 'd1', amount: 10000, paidAmount: 1500 };
  const entries = [
    { id: 'rec-r1-2026-08', type: 'expense', amount: 2000, debtId: 'd1' },
    { id: 'rec-r1-2026-09', type: 'expense', amount: 2000, debtId: 'd1', paid: false }, // neplaceno
    { id: 'z', type: 'expense', amount: 700, debtId: 'd2' },                              // drugi dug
    { id: 'w', type: 'expense', amount: 900 }
  ];
  assert.equal(C.debtPaid(d, entries), 3500);
  assert.equal(C.debtPaid({ id: 'd3', amount: 5 }, entries), 0);
  assert.equal(C.debtPaid({ id: 'd1', amount: 5, paidAmount: 0.1 }, [{ type: 'expense', amount: 0.2, debtId: 'd1' }]), 0.3);
});
```

- [ ] **Korak 2:** Pokreni testove i proveri da padaju.

- [ ] **Korak 3: Implementacija.**

U `isDueInMonth`, kao prvi red tela, dodaj `if(r.until && mKey > r.until) return false;`.

Posle `autoPayDue` dodaj:

```js
  // Zakasneli rashodi iz ponavljajucih u mesecu: dospeli (dan < danas), nisu placeni ni preskoceni; prihodi ne.
  function overdueRecurring(recurring, applied, skipped, mKey, today){
    return (recurring || []).filter(r => r.type !== 'income' && isDueInMonth(r, mKey)
      && !isRecurringPaid(applied, r, mKey) && !isRecurringSkipped(skipped, r, mKey)
      && effectiveDay(r.day, mKey) < today);
  }
  // Otplaceno od duga: rucne uplate + placeni rashodi rata vezani za taj dug (debtId). Zaokruzeno na pare.
  function debtPaid(d, entries){
    const linked = (entries || []).reduce((s, e) => (e.type === 'expense' && e.paid !== false && e.debtId === d.id) ? s + e.amount : s, 0);
    return round2((d.paidAmount || 0) + linked);
  }
```

Izvoz: `overdueRecurring, debtPaid`.

- [ ] **Korak 4:** Pokreni testove i proveri da prolaze. **Korak 5:** Commit (`Paket 2: jezgro — zakasnele stavke, otplata duga, until`).

---

### Zadatak 2: „Plati sve zakasnele“

**Fajlovi:** `budzet-tracker.html`, `i18n.js`, `app/test/smoke-checks.js`.

**Interfejsi:**
- Koristi: `C.overdueRecurring`, `togglePaid`, `recurringEntry`, `recurringEntryId`, `recurringAmountNow`, `showUndoToast`, `saveApplied`, `saveEntries`, `saveSkipped`, `renderAll`, `playPaidSound`
- Pravi:
  - `markRecurringPaid(r, mKey, amount) → entryId`, izdvojeno iz `togglePaid`
  - `openPayOverdue()`
  - `confirmPayOverdue(opts)`
  - hook `window.__payOverdue = opts => confirmPayOverdue(opts)`

- [ ] **Korak 1: Smoke provera koja pada** (ispred `// Cuvanje u fajl`):

```js
    // Plati sve zakasnele (radi osim prvog dana u mesecu, kad nista sa danom 1 nije zakasnelo)
    if (new Date().getDate() > 1) {
      go('ponavljajuce'); await sleep(50);
      setVal('recDesc', 'Smoke kasni'); setVal('recAmount', '321'); setVal('recDay', '1');
      $('recAutoPay').checked = false;
      $('recurringForm').requestSubmit(); await sleep(100);
      const lateRec = JSON.parse(localStorage.getItem('budzet-ponavljajuce-v1') || '[]').find(r => r.desc === 'Smoke kasni');
      const btn = $('payOverdueBtn');
      check('plati sve: dugme se vidi', !!btn && btn.style.display !== 'none' && /\(\d+\)/.test(btn.textContent), btn && btn.textContent);
      const res = window.__payOverdue({ ids: [lateRec.id] });
      const eid = 'rec-' + lateRec.id + '-' + curM;
      check('plati sve: izabrana stavka plaćena', res && entries().some(e => e.id === eid && e.amount === 321));
      $('undoBtn').click(); await sleep(80);
      check('plati sve: poništavanje vraća na neplaćeno', !entries().some(e => e.id === eid) && !(JSON.parse(localStorage.getItem('budzet-primenjeno-v1') || '{}')[curM] || []).includes(lateRec.id));
    }
```

Proveri ključ za `applied` u localStorage (`APPLIED_KEY`) i da `curM` postoji ranije u smoke-u.

- [ ] **Korak 2: Izdvoji plaćanje.** U `togglePaid`, deo za `checked` (od `if(!applied[mKey].includes…` do `entries.push(…)`) izdvoji u:

```js
  // Oznaci ponavljajucu stavku placenom za mesec i napravi njen rashod (bez iscrtavanja/zvuka) — vraca id rashoda
  function markRecurringPaid(r, mKey, amount){
    if(!applied[mKey]) applied[mKey] = [];
    if(!applied[mKey].includes(r.id)) applied[mKey].push(r.id);
    if(skipped[mKey] && skipped[mKey].includes(r.id)){ skipped[mKey] = skipped[mKey].filter(id => id !== r.id); saveSkipped(); }
    const entryId = recurringEntryId(r, mKey);
    if(!entries.some(e => e.id === entryId)) entries.push(recurringEntry(r, mKey, (typeof amount === 'number' && amount > 0) ? amount : undefined));
    return entryId;
  }
```

`togglePaid` u grani `checked` poziva `markRecurringPaid(r, mKey, customAmount)`, a zatim `playPaidSound(); justPaidId = r.id;`. Ponašanje ostaje isto: `recurringEntry` sa `amount` `undefined` koristi `recurringAmountNow`.

- [ ] **Korak 3: Dugme i modal.**

U HTML ekrana Ponavljajuće, neposredno iznad `<div id="recurringList"></div>`, dodaj:

```html
        <button type="button" class="submit-btn neutral pay-overdue-btn" id="payOverdueBtn" style="display:none;"></button>
```

Posle `finishShopOverlay` (modal Nabavke) dodaj modal:

```html
<div class="modal-overlay" id="payOverdueOverlay">
  <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="payOverdueTitle" tabindex="-1">
    <h3 id="payOverdueTitle">Plati zakasnele</h3>
    <div id="payOverdueList" class="pay-overdue-list"></div>
    <div class="hint" id="payOverdueTotal"></div>
    <div class="modal-actions">
      <button class="cancel-btn" id="payOverdueCancel">Otkaži</button>
      <button class="save-btn" id="payOverdueSave">Plati izabrano</button>
    </div>
  </div>
</div>
```

Logiku dodaj posle `togglePaid`:

```js
  // ---- Plati sve zakasnele ----
  const overdueNow = () => C.overdueRecurring(recurring, applied, skipped, currentMonthKey(), new Date().getDate());
  function updatePayOverdueBtn(){
    const btn = document.getElementById('payOverdueBtn');
    const n = overdueNow().length;
    btn.style.display = n ? '' : 'none';
    btn.textContent = t('Plati sve zakasnele ({0})', n);
  }
  function openPayOverdue(){
    const items = overdueNow(); if(!items.length) return;
    const mKey = currentMonthKey();
    document.getElementById('payOverdueList').innerHTML = items.map(r=> `<label class="pay-overdue-row">
        <input type="checkbox" class="pay-overdue-check" data-id="${r.id}" checked>
        <span class="pay-overdue-desc" translate="no">${escapeHtml(r.desc)}</span>
        <span class="muted">${parseLocalDate(C.dueDateFor(r, mKey)).toLocaleDateString(LOCALE, {day:'2-digit', month:'2-digit'})}</span>
        <input type="number" class="pay-overdue-amt" data-id="${r.id}" value="${recurringAmountNow(r)}" min="0" step="1" aria-label="${escapeHtml(r.desc)}">
      </label>`).join('');
    const upd = ()=>{
      const sum = [...document.querySelectorAll('.pay-overdue-check')].filter(c=> c.checked)
        .reduce((s, c)=> s + (parseFloat(document.querySelector(`.pay-overdue-amt[data-id="${CSS.escape(c.dataset.id)}"]`).value) || 0), 0);
      document.getElementById('payOverdueTotal').textContent = t('Izabrano ukupno: {0}', fmt(sum));
    };
    document.querySelectorAll('#payOverdueList input').forEach(i=> i.addEventListener('input', upd));
    upd();
    document.getElementById('payOverdueOverlay').classList.add('show');
    setTimeout(()=> document.getElementById('payOverdueSave').focus(), 0);
  }
  function closePayOverdue(){ document.getElementById('payOverdueOverlay').classList.remove('show'); }
  // opts (smoke): { ids: [...] } plati te stavke po predlozenom iznosu bez modala
  function confirmPayOverdue(opts){
    const mKey = currentMonthKey();
    const items = overdueNow();
    let chosen;
    if(opts && opts.ids) chosen = items.filter(r=> opts.ids.includes(r.id)).map(r=> ({ r, amount: undefined }));
    else chosen = [...document.querySelectorAll('.pay-overdue-check')].filter(c=> c.checked).map(c=>{
      const r = items.find(x=> x.id === c.dataset.id);
      const v = parseFloat(document.querySelector(`.pay-overdue-amt[data-id="${CSS.escape(c.dataset.id)}"]`).value);
      return r ? { r, amount: v > 0 ? v : undefined } : null;
    }).filter(Boolean);
    if(!chosen.length){ closePayOverdue(); return false; }
    const made = chosen.map(({ r, amount })=> ({ rid: r.id, entryId: markRecurringPaid(r, mKey, amount) }));
    saveApplied(); saveEntries(); closePayOverdue(); playPaidSound(); renderAll();
    const total = made.reduce((s, m)=> s + ((entries.find(e=> e.id === m.entryId) || {}).amount || 0), 0);
    showUndoToast(t('Plaćeno {0} stavki ({1})', made.length, fmt(total)), ()=>{
      const ids = new Set(made.map(m=> m.entryId));
      entries = entries.filter(e=> !ids.has(e.id));
      made.forEach(m=>{ applied[mKey] = (applied[mKey] || []).filter(x=> x !== m.rid); });
      saveApplied(); saveEntries(); renderAll();
    });
    return true;
  }
  window.__payOverdue = opts => confirmPayOverdue(opts);
  document.getElementById('payOverdueBtn').addEventListener('click', openPayOverdue);
  document.getElementById('payOverdueCancel').addEventListener('click', closePayOverdue);
  document.getElementById('payOverdueSave').addEventListener('click', ()=> confirmPayOverdue());
  document.getElementById('payOverdueOverlay').addEventListener('click', e=>{ if(e.target.id === 'payOverdueOverlay') closePayOverdue(); });
```

Pozovi `updatePayOverdueBtn()` na kraju `renderRecurring()` (nađi funkciju koja crta `#recurringList`). U Escape handler dodaj red za `payOverdueOverlay`, isto kao za `finishShopOverlay`.

- [ ] **Korak 4: CSS** (apple-theme):

```css
.pay-overdue-btn{ margin: 0 0 1em; }
.pay-overdue-list{ max-height: 50vh; overflow:auto; margin-bottom: 0.6em; }
.pay-overdue-row{ display:grid; grid-template-columns: 22px minmax(0,1fr) auto 7.5em; gap:0.7em; align-items:center; padding:0.4em 0; border-bottom:1px solid var(--paper-line); }
.pay-overdue-desc{ min-width:0; overflow-wrap:anywhere; }
.pay-overdue-row input[type="number"]{ min-height:0; padding:4px 8px; }
```

- [ ] **Korak 5: EN** (`i18n.js`):
- `'Plati sve zakasnele ({0})': 'Pay all overdue ({0})'`
- `'Plati zakasnele': 'Pay overdue'`
- `'Plati izabrano': 'Pay selected'`
- `'Izabrano ukupno: {0}': 'Selected total: {0}'`
- `'Plaćeno {0} stavki ({1})': 'Paid {0} items ({1})'`

`'Otkaži'` već postoji.

- [ ] **Korak 6:** `npm test` + smoke. **Korak 7:** Commit (`Paket 2: plati sve zakasnele`).

---

### Zadatak 3: Obaveštenje vodi na stavku

**Fajlovi:** `budzet-tracker.html`, `app/test/smoke-checks.js`.

**Interfejsi:** pravi `openNotificationTarget({ screen, rowId })` i `window.__openNotificationTarget`.

- [ ] **Korak 1: Smoke** (ispred `// Cuvanje u fajl`):

```js
    // Obavestenje vodi na stavku (i ne rusi se kad stavka vise ne postoji)
    const anyRec = JSON.parse(localStorage.getItem('budzet-ponavljajuce-v1') || '[]')[0];
    if (anyRec && typeof window.__openNotificationTarget === 'function') {
      go('pregled'); await sleep(40);
      window.__openNotificationTarget({ screen: 'ponavljajuce', rowId: anyRec.id }); await sleep(150);
      const row = document.querySelector(`#screen-ponavljajuce [data-row-id="${CSS.escape(anyRec.id)}"]`);
      check('obaveštenje otvara stavku', $('screen-ponavljajuce').classList.contains('active') && !!row && row.classList.contains('row-flash'));
      window.__openNotificationTarget({ screen: 'dugovi', rowId: 'nepostojeci-id' }); await sleep(150);
      check('obaveštenje za obrisanu stavku samo otvara ekran', $('screen-dugovi').classList.contains('active'));
    } else check('obaveštenje: hook postoji', false);
```

- [ ] **Korak 2: Implementacija.** Pored `sendNotificationOnce`:

```js
  // Klik na obavestenje: otvori ekran, skroluj do reda i kratko ga istakni (red mozda vise ne postoji)
  function openNotificationTarget(target){
    if(!target || !target.screen) return;
    showScreen(target.screen);
    if(!target.rowId) return;
    setTimeout(()=>{
      const el = document.querySelector(`#screen-${target.screen} [data-row-id="${CSS.escape(target.rowId)}"]`);
      if(!el) return;
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.classList.remove('row-flash'); void el.offsetWidth; el.classList.add('row-flash');
      setTimeout(()=> el.classList.remove('row-flash'), 1600);
    }, 60);
  }
  window.__openNotificationTarget = openNotificationTarget;
```

`sendNotificationOnce(key, title, body, target)`: u `onclick` pozovi `window.desktop.showWindow()` (ako postoji), a zatim `openNotificationTarget(target)`. `onclick` postavi i kad nema `window.desktop`.

U `checkAndSendNotifications` prosledi odredište:
- za ponavljajuće (oba poziva): `{ screen: 'ponavljajuce', rowId: r.id }`
- za dugove: `{ screen: 'dugovi', rowId: d.id }`

Dok si tu, prevedi tekstove `'Danas dospeva'` / `'Sutra dospeva'` kroz `t(...)` i dodaj EN (`'Due today'` / `'Due tomorrow'`), ako ih nema.

- [ ] **Korak 3: CSS:**

```css
@keyframes rowFlash{ 0%{ background: color-mix(in srgb, var(--accent) 28%, transparent); } 100%{ background: transparent; } }
.row-flash{ animation: rowFlash 1.6s ease-out; border-radius: 8px; }
@media (prefers-reduced-motion: reduce){ .row-flash{ animation: none; background: color-mix(in srgb, var(--accent) 18%, transparent); } }
```

- [ ] **Korak 4:** testovi + smoke. **Korak 5:** Commit (`Paket 2: obaveštenje vodi na stavku`).

---

### Zadatak 4: Mesečna rata duga

**Fajlovi:** `budzet-tracker.html`, `i18n.js`, `app/test/smoke-checks.js`.

**Interfejsi:**
- Koristi `C.debtPaid` i `markRecurringPaid` (iz zadatka 2)
- Pravi:
  - `debtRemaining(d)`
  - `debtInstallment(d) → r|undefined`
  - `syncDebtInstallments()`
  - `createDebtInstallment(d, { amount, day, category }) → r`
  - hook `window.__createDebtInstallment(debtId, opts)`
  - hook `window.__markRecurringPaid(rid, amount)`

- [ ] **Korak 1: Smoke** (ispred `// Cuvanje u fajl`):

```js
    // Rata duga: pravljenje, placanje smanjuje ostatak (stanje samo jednom), izmirenje -> until, brisanje rate -> ostatak nazad
    go('dugovi'); await sleep(40);
    setVal('debtPerson', 'Smoke rata'); setVal('debtAmount', '3000'); setVal('debtCurrency', 'RSD'); setVal('debtDirection', 'i_owe');
    $('debtForm').requestSubmit(); await sleep(80);
    const rd = JSON.parse(localStorage.getItem('budzet-dugovi-v1') || '[]').find(d => d.person === 'Smoke rata');
    const cat0 = window.__desktopBridge.getQuickAddData().expenseCats[0];
    const inst = rd && window.__createDebtInstallment(rd.id, { amount: 1000, day: 1, category: cat0 });
    check('rata: ponavljajuća stavka sa debtId', !!inst && inst.debtId === rd.id && inst.desc === 'Rata: Smoke rata');
    const balBefore = $('balanceSub').textContent;
    window.__markRecurringPaid(inst.id, 1000); await sleep(60);
    const rEntry = entries().find(e => e.id === 'rec-' + inst.id + '-' + curM);
    check('rata: plaćanje pravi rashod sa debtId', !!rEntry && rEntry.debtId === rd.id && rEntry.amount === 1000);
    check('rata: ostatak duga se smanjio', window.BudzetCore.debtPaid(JSON.parse(localStorage.getItem('budzet-dugovi-v1')).find(d => d.id === rd.id), entries()) === 1000);
    window.__deleteEntriesById([rEntry.id]); window.__markRecurringPaid(inst.id, 3000); await sleep(60);
    check('rata: izmiren dug -> until', JSON.parse(localStorage.getItem('budzet-ponavljajuce-v1')).find(r => r.id === inst.id).until === curM);
    window.__deleteEntriesById(['rec-' + inst.id + '-' + curM]); await sleep(60);
    check('rata: brisanje rate vraća ostatak i uklanja until', !JSON.parse(localStorage.getItem('budzet-ponavljajuce-v1')).find(r => r.id === inst.id).until);
```

Proveri da `window.__deleteEntriesById` poziva `renderAll`/`invalidate`, pa se `syncDebtInstallments` pokreće. Ako ne poziva, pozovi ga u hook-u. Proveri i da `debtDirection` postoji u formi (postoji).

- [ ] **Korak 2: Pomoćne funkcije** (pored `debtExpenseTotals`):

```js
  // Otplaceno/ostatak duga: rucne uplate + placene rate (rashodi sa debtId). overallBalance i dalje koristi samo d.paidAmount.
  const debtRemaining = d => Math.max(0, C.round2(d.amount - C.debtPaid(d, entries)));
  const debtInstallment = d => recurring.find(r => r.debtId === d.id);
  // Rata prestaje kad je dug izmiren (until = tekuci mesec); kad dug ponovo ima ostatak, nastavlja se
  function syncDebtInstallments(){
    let changed = false;
    recurring.forEach(r=>{
      if(!r.debtId) return;
      const d = debts.find(x=> x.id === r.debtId);
      if(!d) return;
      const done = debtRemaining(d) <= 0;
      if(done && !r.until){ r.until = currentMonthKey(); changed = true; }
      else if(!done && r.until){ delete r.until; changed = true; }
    });
    if(changed) saveRecurring();
  }
  function createDebtInstallment(d, o){
    const r = { id: newId(), type: 'expense', desc: t('Rata: {0}', d.person), amount: o.amount, category: o.category, day: C.clampRecurringDay(o.day), frequency: 'monthly', anchorMonth: 1, isSubscription: false, autoPay: false, debtId: d.id };
    recurring.push(r); saveRecurring(); renderAll();
    return r;
  }
  window.__createDebtInstallment = (id, o) => { const d = debts.find(x=> x.id === id); return d ? createDebtInstallment(d, o) : null; };
  window.__markRecurringPaid = (rid, amount) => { const r = recurring.find(x=> x.id === rid); if(!r) return null; const id = markRecurringPaid(r, currentMonthKey(), amount); saveApplied(); saveEntries(); renderAll(); return id; };
```

`desc` rate nastaje preko `t('Rata: {0}', …)`. Ako je jezik EN, opis bi bio na engleskom. **Zato koristi čist srpski tekst** `'Rata: ' + d.person`, jer je opis podatak, a ne UI. Smoke očekuje `'Rata: Smoke rata'`.

Proveri da li recurring objekti imaju još obaveznih polja (vidi `recurringForm` submit) i dopuni ih istim podrazumevanim vrednostima.

- [ ] **Korak 3: Rashod rate nosi `debtId` i predlaže ostatak.** U `recurringEntry(r, mKey, amount)`:
- dodaj `if(r.debtId) e.debtId = r.debtId;`
- kad `amount == null` i `r.debtId`: iznos je `Math.min(recurringAmountNow(r), debtRemaining(d))`, gde je `d` dug. Ako je ostatak 0, koristi `recurringAmountNow(r)`.

- [ ] **Korak 4: Svuda koristi `debtRemaining`/`C.debtPaid`** umesto `d.amount - (d.paidAmount||0)`:
- `debtExpenseTotals`: `pending` i `pendingCount` računaj preko `debtRemaining`; `paid` **ostaje** `Math.min(d.paidAmount||0, d.amount)`
- obaveštenja za dugove (oko 5531 i 5596)
- `activeDebts` (oko 5631)
- `computeDebtPayoffPlan` / `renderDebtPlan` (6701, 6705)
- `renderDebts`: `remaining`, `settled`, iznosi „otplaćeno / ukupno“ i traka napretka koriste `C.debtPaid(d, entries)`
- `countOverdue` (7388)

`playSuccessSound` posle ručne uplate: uslov postaje `debtRemaining(d) <= 0`. Excel i JSON ostaju sa `d.paidAmount`, jer je to sačuvano polje.

- [ ] **Korak 5: `syncDebtInstallments()`** pozovi na početku `renderAll()`, pre iscrtavanja.

- [ ] **Korak 6: Dugme i prikaz na kartici duga** (`renderDebts`), za `d.direction === 'i_owe'` i dug koji nije izmiren:
- ako `debtInstallment(d)` ne postoji: dugme `<button class="btn-secondary debt-installment-btn" data-id="${d.id}">${t('Napravi mesečnu ratu')}</button>`
- ako postoji: red `<div class="goal-meta">${t('Mesečna rata: {0} · sledeća {1}', fmt(r.amount), <DD.MM.>)}</div>`. Sledeća je datum dospeća u tekućem mesecu ako rata nije plaćena, inače u sledećem mesecu (`C.dueDateFor`).

Klik na dugme otvara `openEditModal(t('Mesečna rata'), […])` sa poljima:
- `amount` (number): podrazumevano `Math.min(ostatak, kapacitet)`, gde je kapacitet `parseFloat(localStorage.getItem(DEBT_CAPACITY_KEY))`; ako kapaciteta nema, ostatak
- `day` (number): podrazumevano dan iz `d.due`, inače 1
- `category` (select, `expenseCats`): podrazumevano `'Ostalo'` ako postoji, inače prva

Na čuvanje: `if(!(vals.amount > 0)) return;`, pa `createDebtInstallment(d, { amount: vals.amount, day: vals.day || 1, category: vals.category })`.

- [ ] **Korak 7: EN:**
- `'Napravi mesečnu ratu': 'Create monthly installment'`
- `'Mesečna rata': 'Monthly installment'`
- `'Mesečna rata: {0} · sledeća {1}': 'Monthly installment: {0} · next {1}'`
- `'Iznos rate (RSD)': 'Installment amount (RSD)'`
- `'Dan u mesecu': 'Day of month'`

Koristi te labele u modalu. `'Kategorija'` već postoji.

- [ ] **Korak 8:** testovi + smoke. **Korak 9:** Commit (`Paket 2: mesečna rata duga`).

---

### Zadatak 5: Dug u stranoj valuti po današnjem kursu

**Fajlovi:** `budzet-tracker.html`, `i18n.js`, `app/test/smoke-checks.js`.

- [ ] **Korak 1: Smoke** (posle EUR duga iz verzije 1.11.1; nađi `'Smoke evro dug'` u smoke-u i nastavi u istom `if (eurRate)` bloku):

```js
      if (typeof window.__revalueDebt === 'function') {
        const before = JSON.parse(localStorage.getItem('budzet-dugovi-v1')).find(d => d.person === 'Smoke evro dug');
        // simuliraj stari kurs: iznos kao da je unet po kursu 1% nizem
        window.__setDebtAmount(before.id, Math.round(before.origAmount * eurRate * 0.99 * 100) / 100); await sleep(40);
        check('dug EUR: prikaz današnje vrednosti', /≈/.test(document.querySelector(`[data-debt-id="${before.id}"]`).textContent));
        window.__revalueDebt(before.id); await sleep(40);
        const after = JSON.parse(localStorage.getItem('budzet-dugovi-v1')).find(d => d.id === before.id);
        check('dug EUR: preračun po današnjem kursu', Math.abs(after.amount - before.origAmount * eurRate) < 0.01);
      } else check('dug EUR: preračun postoji', false);
```

- [ ] **Korak 2: Implementacija** u `renderDebts`, za dug sa `d.currency && d.currency !== 'RSD' && d.origAmount && fx.rates[d.currency]`:

```js
      const fxNow = (d.currency && d.currency !== 'RSD' && d.origAmount && fx.rates[d.currency]) ? C.round2(d.origAmount * fx.rates[d.currency]) : null;
      const fxDiff = fxNow != null ? C.round2(fxNow - d.amount) : 0;
      const fxHtml = (fxNow != null && Math.abs(fxDiff) >= 1)
        ? `<div class="goal-meta debt-fx"><span>${t('Danas ≈ {0} ({1} od unosa)', fmt(fxNow), (fxDiff > 0 ? '+' : '−') + fmt(Math.abs(fxDiff)))}</span><button class="btn-secondary debt-revalue" data-id="${d.id}">${t('Preračunaj')}</button></div>` : '';
```

Ubaci `${fxHtml}` posle reda sa iznosima. Posle crtanja dodaj handler i hook-ove:

```js
  function revalueDebt(id){
    const d = debts.find(x=> x.id === id); if(!d || !d.origAmount || !fx.rates[d.currency]) return;
    const prev = { amount: d.amount, rate: d.rate };
    d.amount = C.round2(d.origAmount * fx.rates[d.currency]); d.rate = fx.rates[d.currency];
    saveDebts(); renderAll();
    showUndoToast(t('Dug preračunat po današnjem kursu: {0}', fmt(d.amount)), ()=>{ d.amount = prev.amount; d.rate = prev.rate; saveDebts(); renderAll(); });
  }
  window.__revalueDebt = revalueDebt;
  window.__setDebtAmount = (id, amt) => { const d = debts.find(x=> x.id === id); if(d){ d.amount = amt; saveDebts(); renderAll(); } };
```

U `renderDebts`, posle `list.innerHTML = …`: `list.querySelectorAll('.debt-revalue').forEach(b=> b.addEventListener('click', ()=> revalueDebt(b.dataset.id)));`.

- [ ] **Korak 3: CSS:** `.debt-fx{ align-items:center; gap:0.6em; } .debt-fx .btn-secondary{ padding:3px 10px; font-size:12.5px; }`

- [ ] **Korak 4: EN:**
- `'Danas ≈ {0} ({1} od unosa)': 'Today ≈ {0} ({1} since entry)'`
- `'Preračunaj': 'Recalculate'`
- `'Dug preračunat po današnjem kursu: {0}': 'Debt recalculated at today\'s rate: {0}'`

- [ ] **Korak 5:** testovi + smoke. **Korak 6:** Commit (`Paket 2: dug u stranoj valuti po današnjem kursu`).
