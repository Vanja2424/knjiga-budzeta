# Dokumenti (v1.25.0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Novi ekran „Dokumenti“ za garancije i dokumente sa rokom, sa prilozima, AI čitanjem, podsetnicima (kartica na Pregledu i Windows obaveštenje), obnovom i garancijom napravljenom iz rashoda.

**Architecture:**
- Logika roka, stanja, podsetnika, obnove i čišćenja živi u `budzet-core.js`, sa testovima.
- Stranica dobija ekran, prozor i povezivanje sa postojećim delovima: `prepareBillFile`, `bills:read`/`saveFile`, `sendNotificationOnce`, `showUndoToast`, JSON kopija i Excel.
- Glavni proces se ne menja.

**Tech Stack:** vanilla JS, node:test, Electron smoke (`test/smoke-checks.js`).

**Spec:** `docs/superpowers/specs/2026-10-01-dokumenti-design.md`

## Global Constraints

- Ključ za podatke je `budzet-dokumenti-v1`, a Excel list se zove `Dokumenti`.
- Id-jevi prolaze `isId`, a prilozi `isAttachmentName`.
- Podrazumevano: `remindDays` je 30, garancija traje 24 meseca, period obnove je 12 meseci.
- Šalje se samo fajl dokumenta, i to samo kad prekidač „Ne šalji ovaj fajl AI-ju“ nije uključen. Za grupu „Lična dokumenta“ prekidač je podrazumevano uključen.
- Patch skripte se pišu alatom Write (Bash heredoc jede `\`). Novi UI stringovi idu kroz `i18nadd.js --check`.
- Pre svakog pokretanja stranice ide `npm run copy-web`.
- Verzija je 1.25.0. Objava ide preko push-source, pa release.

## Review Focus

1. **Garancija kupljena 31.1. na 1 mesec, i 29.2. plus 12 meseci.** Očekuje se 28./29.2. i 28.2. sledeće godine. Test je u Task 1.
2. **Dokument bez roka, i dokument koji ističe danas.** Prvi nema podsetnik ni grešku. Drugi daje stanje `soon` sa 0 dana i obaveštenje „danas ističe“. Test je u Task 1.
3. **Obnova dokumenta koji je istekao pre godinu dana.** Novi rok se računa od danas, a ne od starog roka (nema „obnovljeno, a već isteklo“). Test je u Task 1.
4. **AI pročita lični dokument.** Prekidač za lična dokumenta sprečava slanje sledećih fajlova. Test je u Task 3 (smoke).
5. **Brisanje zapisa sa više priloga, pa opoziv.** Svi prilozi se vraćaju. Test je u Task 3.

---

### Task 1: Core — rok, stanje, podsetnici, obnova, čišćenje, AI

**Files:** `budzet-core.js` (nova sekcija pre „Provera Excel fajla“), `app/test/core.test.js`

**Produces:**
- `C.DOC_GROUPS`
- `C.addMonthsToDate(iso, n) → iso` (kraj meseca se ne prelije u sledeći mesec)
- `C.documentExpiry(doc) → iso|''`
- `C.documentStatus(doc, today) → {state, days}`
- `C.documentReminders(docs, today) → [{doc, status, notifyKey}]`
- `C.renewDocument(doc, today, months) → doc`
- `C.cleanDocuments(arr) → doc[]`
- `C.documentPrompt(groups)`
- `C.cleanDocumentReading(raw, groups) → {kind,title,group,issued,expires,warrantyMonths,vendor,low}|null`

- [ ] **Step 1: Failing tests**

```js
test('dokumenti: rok, stanje, podsetnici, obnova', () => {
  assert.equal(C.addMonthsToDate('2026-01-31', 1), '2026-02-28');
  assert.equal(C.addMonthsToDate('2028-02-29', 12), '2029-02-28');
  assert.equal(C.addMonthsToDate('2026-09-30', 24), '2028-09-30');
  assert.equal(C.documentExpiry({ issued: '2026-01-15', warrantyMonths: 24 }), '2028-01-15');
  assert.equal(C.documentExpiry({ expires: '2027-05-01', issued: '2026-01-15', warrantyMonths: 24 }), '2027-05-01');
  assert.equal(C.documentExpiry({ issued: '2026-01-15' }), '');
  const st = (expires, rd) => C.documentStatus({ expires, remindDays: rd == null ? 30 : rd }, '2026-10-01');
  assert.deepEqual(st('2026-10-01'), { state: 'soon', days: 0 });
  assert.deepEqual(st('2026-10-31'), { state: 'soon', days: 30 });
  assert.deepEqual(st('2026-11-01'), { state: 'ok', days: 31 });
  assert.deepEqual(st('2026-09-30'), { state: 'expired', days: -1 });
  assert.deepEqual(C.documentStatus({}, '2026-10-01'), { state: 'none', days: null });
  const docs = [{ id: 'd1', title: 'A', expires: '2026-10-10', remindDays: 30 }, { id: 'd2', title: 'B', expires: '2026-10-01', remindDays: 30 }, { id: 'd3', title: 'C', expires: '2027-01-01', remindDays: 30 }, { id: 'd4', title: 'D', expires: '2026-08-01', remindDays: 30 }, { id: 'd5', title: 'E' }];
  const rem = C.documentReminders(docs, '2026-10-01');
  assert.deepEqual(rem.map(r => [r.doc.id, r.notifyKey]), [['d2', 'doc-d2-2026-10-01-day'], ['d1', 'doc-d1-2026-10-10-soon']]);
  assert.deepEqual(C.documentReminders(docs, '2026-10-01', { includeExpiredDays: 90 }).map(r => r.doc.id), ['d4', 'd2', 'd1']);
  const ren = C.renewDocument({ id: 'd1', expires: '2026-10-10', renewal: { months: 12 } }, '2026-10-01');
  assert.equal(ren.expires, '2027-10-10');
  assert.deepEqual(ren.history, [{ expires: '2026-10-10', renewedAt: '2026-10-01' }]);
  assert.equal(C.renewDocument({ id: 'd4', expires: '2025-09-01' }, '2026-10-01').expires, '2027-10-01');   // istekao davno -> od danas
  assert.equal(C.renewDocument({ id: 'd6', expires: '2026-09-01' }, '2026-10-01', 6).expires, '2027-03-01'); // istekao skoro -> od starog roka
});

test('dokumenti: ciscenje zapisa i AI odgovora', () => {
  const evil = '"><img onerror=1>';
  const c = C.cleanDocuments([
    { id: 'd1', kind: 'garancija', title: ' Frižider ', group: 'Tehnika', issued: '2026-01-15', warrantyMonths: '24', files: ['a.pdf', '..\\x.pdf', 'b.bat'], remindDays: 'x', renewal: { amount: '25.000', category: 'Prevoz', months: 12 } },
    { id: evil, title: 'X' }, { id: 'd3', title: '' }, null
  ]);
  assert.equal(c.length, 1);
  assert.deepEqual(c[0].files, ['a.pdf']);
  assert.equal(c[0].title, 'Frižider');
  assert.equal(c[0].warrantyMonths, 24);
  assert.equal(c[0].remindDays, 30);
  assert.equal(c[0].renewal.amount, 25000);
  assert.equal(c[0].kind, 'garancija');
  assert.match(C.documentPrompt(['Tehnika', 'Auto']), /"Tehnika", "Auto"/);
  const r = C.cleanDocumentReading('```json\n{"kind":"garancija","title":"Gorenje frižider","group":"tehnika","issued":"15.01.2026","expires":"","warrantyMonths":"24","vendor":"Tehnomanija","confidence":{"issued":"low"}}\n```', ['Tehnika', 'Auto']);
  assert.deepEqual([r.kind, r.title, r.group, r.issued, r.expires, r.warrantyMonths, r.vendor], ['garancija', 'Gorenje frižider', 'Tehnika', '2026-01-15', '', 24, 'Tehnomanija']);
  assert.deepEqual(r.low, ['issued']);
  assert.equal(C.cleanDocumentReading({ kind: 'nesto', title: 'X', group: 'Nepoznata' }, ['Tehnika']).kind, 'dokument');
  assert.equal(C.cleanDocumentReading({ kind: 'nesto', title: 'X', group: 'Nepoznata' }, ['Tehnika']).group, '');
  assert.equal(C.cleanDocumentReading('nista', []), null);
});
```

- [ ] **Step 2: Run tests.** Expected: FAIL (`C.addMonthsToDate is not a function`).

- [ ] **Step 3: Implement**

```js
  // ---------- Dokumenti: garancije i dokumenti sa rokom ----------
  const DOC_GROUPS = ['Tehnika', 'Auto', 'Osiguranje', 'Lična dokumenta', 'Ugovori', 'Ostalo'];
  const isoOk = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
  function addMonthsToDate(iso, n){
    const [y, m, d] = iso.split('-').map(Number);
    const first = new Date(y, m - 1 + n, 1);
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    return first.getFullYear() + '-' + pad2(first.getMonth() + 1) + '-' + pad2(Math.min(d, last));
  }
  function documentExpiry(doc){
    if(doc && isoOk(doc.expires)) return doc.expires;
    if(doc && isoOk(doc.issued) && doc.warrantyMonths > 0) return addMonthsToDate(doc.issued, doc.warrantyMonths);
    return '';
  }
  function documentStatus(doc, today){
    const exp = documentExpiry(doc);
    if(!exp) return { state: 'none', days: null };
    const days = dayNumber(exp) - dayNumber(today);
    const rd = doc.remindDays >= 0 ? doc.remindDays : 30;
    return { state: days < 0 ? 'expired' : days <= rd ? 'soon' : 'ok', days };
  }
  // za karticu i obavestenja: soon (i opciono skoro istekli), najblizi rok prvi
  function documentReminders(docs, today, opts){
    const back = (opts && opts.includeExpiredDays) || 0;
    return (docs || []).map(doc => ({ doc, status: documentStatus(doc, today) }))
      .filter(x => x.status.state === 'soon' || (x.status.state === 'expired' && -x.status.days <= back))
      .sort((a, b) => a.status.days - b.status.days)
      .map(x => Object.assign(x, { notifyKey: 'doc-' + x.doc.id + '-' + documentExpiry(x.doc) + '-' + (x.status.days === 0 ? 'day' : x.status.state === 'expired' ? 'expired' : 'soon') }));
  }
  // obnova: od starog roka ako nije istekao pre vise od 60 dana, inace od danas
  function renewDocument(doc, today, months){
    const n = months > 0 ? months : (doc.renewal && doc.renewal.months > 0 ? doc.renewal.months : 12);
    const old = documentExpiry(doc);
    const base = old && dayNumber(today) - dayNumber(old) <= 60 ? old : today;
    return Object.assign({}, doc, { expires: addMonthsToDate(base, n), history: (doc.history || []).concat([{ expires: old || '', renewedAt: today }]) });
  }
  function cleanDocuments(arr){
    const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
    return (Array.isArray(arr) ? arr : []).filter(d => d && isId(d.id) && str(d.title, 80)).map(d => {
      const o = { id: d.id, kind: d.kind === 'garancija' ? 'garancija' : 'dokument', title: str(d.title, 80), group: str(d.group, 40) || 'Ostalo',
        files: (Array.isArray(d.files) ? d.files : []).filter(isAttachmentName), remindDays: Number.isInteger(+d.remindDays) && +d.remindDays >= 0 && +d.remindDays <= 365 ? +d.remindDays : 30 };
      if(isoOk(d.issued)) o.issued = d.issued;
      if(isoOk(d.expires)) o.expires = d.expires;
      const wm = parseInt(d.warrantyMonths, 10); if(wm > 0 && wm <= 240) o.warrantyMonths = wm;
      if(str(d.vendor, 60)) o.vendor = str(d.vendor, 60);
      if(str(d.notes, 300)) o.notes = str(d.notes, 300);
      if(d.renewal && typeof d.renewal === 'object'){ const a = parseAmount(d.renewal.amount), m = parseInt(d.renewal.months, 10);
        o.renewal = { amount: Number.isFinite(a) && a > 0 ? round2(a) : 0, category: str(d.renewal.category, 40), months: m > 0 && m <= 120 ? m : 12 }; }
      if(Array.isArray(d.history)) o.history = d.history.filter(h => h && isoOk(h.renewedAt)).map(h => Object.assign({ expires: isoOk(h.expires) ? h.expires : '', renewedAt: h.renewedAt }, isId(h.entryId) ? { entryId: h.entryId } : {}));
      if(isId(d.entryId)) o.entryId = d.entryId;
      return o;
    });
  }
  function documentPrompt(groups){
    return ['Čitaš garantni list, polisu, saobraćajnu/registraciju, ugovor ili drugi dokument sa rokom (Srbija), sa slike ili iz teksta.',
      'Vrati SAMO JSON: {"kind":"garancija|dokument","title":"","group":"","issued":"YYYY-MM-DD","expires":"YYYY-MM-DD","warrantyMonths":0,"vendor":"","confidence":{"expires":"high"}}',
      '- title: kratak naziv (npr. "Frižider Gorenje", "Registracija Golf 7", "Kasko polisa").',
      '- group: jedna od ovih ili "": ' + (groups || []).map(g => '"' + g + '"').join(', ') + '.',
      '- issued: datum kupovine/izdavanja; expires: datum isteka ako piše; warrantyMonths: trajanje garancije u mesecima ako piše umesto datuma.',
      '- vendor: prodavac ili izdavalac. Nečitljivo = null; ne izmišljaj datume.'].join('\n');
  }
  function cleanDocumentReading(raw, groups){
    const o = extractJson(raw);
    if(!o) return null;
    const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
    const conf = o.confidence && typeof o.confidence === 'object' ? o.confidence : {};
    const wm = parseInt(o.warrantyMonths, 10);
    const out = { kind: o.kind === 'garancija' ? 'garancija' : 'dokument', title: str(o.title, 80), group: (groups || []).find(g => foldText(g) === foldText(o.group)) || '',
      issued: readDate(o.issued), expires: readDate(o.expires), warrantyMonths: wm > 0 && wm <= 240 ? wm : null, vendor: str(o.vendor, 60) };
    out.low = Object.keys(conf).filter(k => conf[k] === 'low');
    if(!out.expires && !(out.issued && out.warrantyMonths)) out.low.push('expires');
    return out;
  }
```

Izvoz: `DOC_GROUPS, addMonthsToDate, documentExpiry, documentStatus, documentReminders, renewDocument, cleanDocuments, documentPrompt, cleanDocumentReading,`

Proveri da li postoji `dayNumber` (red oko 909, sekcija „Kupljene stvari“) i da li se nova sekcija nalazi posle njega u fajlu.

- [ ] **Step 4:** Run tests. Expected: PASS. **Step 5:** Commit.

---

### Task 2: Stranica — stanje, ekran, prozor, čuvanje, kopija i Excel

**Files:** `budzet-tracker.html`, `i18n.js`, `app/test/smoke-checks.js`

**Consumes:**
- Task 1;
- `prepareBillFile`, `BILL_ERR`, `billSlug`, `desktop.bills.read/saveFile/openFile/deleteFile/restoreFile`;
- `showUndoToast`, `appConfirm`, `newId`, `entries`, `saveEntries`, `expenseCats`, `defaultAccountId`, `toISODateLocal`, `escapeHtml`, `t`.

**Produces:**
- stanje `documents` i `saveDocuments()`;
- ekran `dokumenti`, `renderDocuments()`;
- `openDocReview({doc?, files?, prefill?})`;
- `deleteDocument(id)`, `renewDocumentNow(id)`;
- hookovi `__documents()`, `__fakeDocReading`, `__openDocReview`, `__addDocFiles(files)`, `__renewDocument(id)`, `__deleteDocument(id, {confirm:false})`.

- [ ] **Step 1: Failing smoke checks** (pre `// Cuvanje u fajl`). Proveravaju sledeće:
  - ekran `dokumenti` postoji, a bočni meni ima 9 grupa;
  - `__addDocFiles([png])` sa `__fakeDocReading` (garancija Gorenje, kupljena pre 23 meseca, 24 meseca garancije) otvara `docOverlay` sa popunjenim nazivom i datumom kupovine;
  - posle „Sačuvaj“ zapis ima `files.length === 1` i stanje `soon`, a na spisku je red sa klasom `doc-soon`;
  - `__fakeDocReading` sa `group: 'Lična dokumenta'` uključuje `#docNoAi`, pa sledeće dodavanje priloga sa uključenim prekidačem ne poziva AI (brojač poziva ostaje isti);
  - obnova dokumenta sa `renewal.amount 25000` pravi rashod „Obnova: …“ i pomera rok za 12 meseci, a `__undoTop` vraća stari rok i briše rashod;
  - brisanje zapisa sa 2 priloga i opoziv vraćaju zapis i oba fajla (`desktop.bills.openFile` vraća `ok` za oba);
  - JSON kopija (`__sanitizeImportedBackup({ entries: [], documents: [...] })`) i Excel (`__buildWorkbook().Sheets.Dokumenti`) čuvaju zapis.

- [ ] **Step 2: Implementacija.** Na meni (`SCREEN_GROUPS.dokumenti = [['dokumenti','Dokumenti']]`, dugme u bočnom meniju posle Nabavke, ikona dokumenta) i na `SCREEN_RENDER.dokumenti`. Delovi:
  - **Ekran:** traka ima filter (segment) i dugme „Dodaj dokument…“ sa file inputom. Ispod je `#docList`, sa redovima `doc-row doc-<state>`: naziv, grupa, oznaka stanja, 📎 i, za dokument, dugme „Obnovi“.
  - **Prozor `docOverlay`:**
    - levo je pregled prvog priloga;
    - desno su polja iz specifikacije, `#docNoAi` sa napomenom, lista priloga sa dugmadima „Dodaj prilog“ i ×, i dugmad Otkaži / Obriši / Sačuvaj;
    - čitanje ide preko `prepareBillFile`, pa `readDocFile` sa `C.documentPrompt`, pa `C.cleanDocumentReading`;
    - prilog se čuva preko `desktop.bills.saveFile` kao `YYYY-MM-DD-dokument-<slug>-<n>.<ext>`, a čuva se i kad AI ne uspe.
  - **Čuvanje:** `localStorage[budzet-dokumenti-v1]`. Uz to i `buildBackupData` (`documents`), `sanitizeImportedBackup` (`C.cleanDocuments`), primena kopije, `persistAllToLocalStorage`, a u `buildWorkbook` i `parseWorkbook` list `Dokumenti` (ID, Vrsta, Naziv, Grupa, Izdato, Istice, GarancijaMeseci, Prodavac, Napomena, Podsetnik, Prilozi, Obnova JSON, Istorija JSON, StavkaID; čita se samo ako list postoji).
  - **Prevlačenje fajlova:** `if(activeScreen === 'dokumenti'){ addDocFiles(files); return; }`.
  - **Escape:** zatvara `docOverlay`.
- [ ] **Step 3:** Smoke → sve ✓. Dodaj EN prevode (provera sudara). Commit.

---

### Task 3: Podsetnici, obnova i garancija iz rashoda

**Files:** `budzet-tracker.html`, `i18n.js`, `app/test/smoke-checks.js`

- [ ] **Step 1: Failing smoke:**
  - kartica `#docReminders` na Pregledu je vidljiva i navodi naziv dokumenta koji uskoro ističe;
  - kod rashoda sa `attachments` u Rashodima postoji dugme `.warranty-btn`;
  - klik na `.warranty-btn` otvara `docOverlay` sa vrstom „garancija“, datumom kupovine jednakim datumu rashoda, 24 meseca i prilogom rashoda;
  - čuvanje pravi zapis sa `entryId`;
  - `C.documentReminders` se koristi u `checkAndSendNotifications`. Proverava se hook `__docNotifyKeys()`, koji vraća ključeve koje bi poslao.
- [ ] **Step 2: Implementacija:**
  - kartica na Pregledu (u `SCREEN_RENDER.pregled` kao `renderDocReminders()`), sa ključnim klasama `soon`/`expired` i dugmetom „Otvori Dokumenti“;
  - `checkAndSendNotifications` dobija petlju za `C.documentReminders(documents, today)` i `sendNotificationOnce(notifyKey, …, { screen: 'dokumenti', rowId: doc.id })`;
  - `renewDocumentNow` preko `C.renewDocument`, sa rashodom kad je `renewal.amount > 0` i opozivom;
  - `.warranty-btn` u `renderExpenses` (uz `.att-btn`) poziva `openDocReview({ prefill })`.
- [ ] **Step 3:** Smoke → ✓. EN. Commit.

---

### Task 4: Završno

- [ ] Pravi Groq poziv sa izmišljenim garantnim listom (canvas). EN ispis za ekran, prozor i karticu. Snimak ekrana spiska i prozora.
- [ ] Nezavisan pregled (opus) sa ovim Review Focus-om. Popravke idu u jednom prolazu, uz test koji pada pre svake.
- [ ] Release notes 1.25.0, verzija, npm test i smoke, spajanje u main, push-source, release. Ažuriraj memoriju.
