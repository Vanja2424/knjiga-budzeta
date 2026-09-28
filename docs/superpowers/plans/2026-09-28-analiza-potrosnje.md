# Analiza potrošnje — plan implementacije

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Cilj:** Novi ekran Izveštaji → **Analiza**. Korisnik na njemu vidi na šta ide novac, kako se kategorija menja kroz vreme, koliko troši fiksno a koliko promenljivo i gde može da uštedi. Pregled dobija red koji vodi na taj ekran.

**Arhitektura:** Sva računanja su čiste funkcije u `budzet-core.js` (UMD modul, bez DOM-a i stanja), pokrivene testovima `node:test`. `budzet-tracker.html` samo crta rezultate tih funkcija. Novo trajno polje `fixedCategories` čuva se kao ključ u localStorage, a desktop verzija ga automatski upisuje u podaci.json.

**Tehnologije:** čist JavaScript (bez okvira), SVG grafikoni pisani ručno, Electron (desktop omotač), `node:test` za jedinične testove i sopstveni smoke test koji pokreće pravi Electron.

**Specifikacija:** `docs/superpowers/specs/2026-09-28-analiza-potrosnje-design.md`. Pročitaj je pre početka.

## Globalna ograničenja

- Jedini izvor web koda je koren `E:\Vanja`: `budzet-tracker.html`, `budzet-core.js`, `i18n.js`. Fajlovi istog imena u `E:\Vanja\app\` su kopije koje pravi `npm run copy-web`. **Nikad ih ne menjaj** (u `.gitignore` su).
- `budzet-core.js` nema DOM ni stanje. Stranica ga koristi kao `C` (`window.BudzetCore`), a testovi preko `require('../../budzet-core.js')`.
- Računaju se samo plaćeni troškovi: `e.type === 'expense' && e.paid !== false`. Deo mesečno raspoređenog troška računa se preko `C.shareInMonth(e, mKey)`. `e.amount` je već u RSD.
- Period je 3, 6 ili 12 punih meseci **pre** izabranog meseca, podrazumevano 6.
- Pragovi, prepisani iz specifikacije:
  - iznad proseka: **≥ 20% i ≥ 1.000 RSD**
  - sitni česti troškovi: prosečna kupovina **≤ 1.500 RSD** i **≥ 4 kupovine mesečno**
  - poskupljenje: poslednje plaćanje **> 10%** skuplje od prvog, uz najmanje **3 plaćanja**
  - klizač: **0–50%**
- Fiksni trošak je stavka nastala iz ponavljajuće stavke (`id` počinje sa `rec-`) ili stavka u kategoriji iz `fixedCategories`.
- Ključ u localStorage: `budzet-fiksne-kategorije-v1` (JSON niz imena kategorija, podrazumevano `[]`).
- Tekst u UI je na srpskom:
  - statički tekst se na engleski prevodi sam, tačnim poklapanjem, preko unosa u `i18n.js`
  - tekst sa vrednostima ide kroz `t('... {0}', x)`
  - lokalna promenljiva se **ne sme zvati `t`**
  - korisnički podaci (kategorije, opisi) se ne prevode (`catTagHtml`, `translate="no"`)
- Vizuelne izmene idu u `<style id="apple-theme">` sloj, pre njegovog `</style>` (drugi `</style>` u fajlu, oko reda 1579).
- Fajlove sa „ž/š/č/ć/đ“ menjaj alatom Edit ili Write, ne PowerShell `Set-Content` (kvari kodiranje).
- Testovi: `cd /e/Vanja/app && npm test`. Smoke: `cd /e/Vanja/app && npm run smoke -- "C:/Users/gejme/OneDrive/Belgeler/Knjiga budzeta/podaci.json"`. Smoke kopira fajl u privremeni folder i nikad ne dira prave podatke.
- Git: repozitorijum je `/e/Vanja`, grana `main`. **Nikad** ne dodaji `podaci*.json`, `*.xlsx` ni `verzije/`. Poruka svakog commita završava se sa:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```
- Ovaj plan **ne** objavljuje novu verziju. Verzija, beleške o izdanju i `npm run release` rade se posle, kad korisnik to odobri.

## Preciziranja specifikacije (odluke donete u planu)

- „Iznad proseka“ traži prosek > 0. Kategorija koja je nova u izabranom mesecu nema svoj prosek, pa se ne prikazuje kao „iznad proseka“.
- „Sitni česti troškovi“ gledaju samo **promenljive** stavke. Fiksne (pretplate i fiksne kategorije) su u posebnoj listi, a klizač takođe smanjuje samo promenljive troškove.
- „Prvi mesec sa podacima“ je najraniji mesec bilo kog plaćenog troška, za celu aplikaciju. Meseci pre njega ne ulaze u prosek. Kasniji mesec bez troškova u nekoj kategoriji ulazi kao 0.
- Pregled računa za **tekući** mesec (kao dosadašnje upozorenje o anomalijama) sa periodom od 6 meseci. Klik vodi na Analizu postavljenu na tekući mesec i 6 meseci, pa su brojke iste.
- Poskupljenje na Pregledu (`detectSubscriptionCreep`, prag 15%) ostaje nepromenjeno, kako specifikacija kaže. Prag od 10% važi samo za listu pretplata u Analizi.
- `fixedCategories` ne ide u Excel. Ide u podaci.json (a time i u dnevne i mesečne kopije) i u JSON rezervnu kopiju.

## Na šta obratiti pažnju pri pregledu

1. **Trošak raspoređen na više meseci** (`spreadMonths` > 1) mora da uđe u zbir, grupu po opisu i prosek samo sa mesečnim delom, nikad celim iznosom. Test je u zadatku 2 (`groupByDesc` sa `spreadMonths`).
2. **Neplaćen trošak** (`paid: false`) ne sme da uđe ni u jednu brojku Analize. Test je u zadatku 1 (`periodStats` ignoriše neplaćeno).
3. **Preimenovanje fiksne kategorije** zadržava oznaku „fiksno“ pod novim imenom. Test je smoke provera u zadatku 4.
4. **Pregled i Analiza pokazuju istu uštedu.** Test je smoke provera u zadatku 7, koja poredi iznos iz reda na Pregledu sa `C.savingsSummary`.
5. **Opis koji je samo broj ili interpunkcija** („123“, „--“) ide u „(bez opisa)“ i ne ruši grupisanje. Test je u zadatku 1 (`normalizeDesc`).

---

### Zadatak 1: Osnovne funkcije u jezgru (opis, period, prosek, fiksno)

**Fajlovi:**
- Izmena: `budzet-core.js`: novi odeljak pre `return {` (oko reda 366) i izvoz u objektu koji se vraća
- Izmena: `budzet-tracker.html:5694-5698`: `monthlyEquivalent` postaje `C.monthlyEquivalent`
- Test: `app/test/core.test.js`: dodaj na kraj

**Interfejsi:**
- Koristi: `addMonths`, `spreadOf`, `shareInMonth`, `shareInMonths` (već postoje u jezgru)
- Pravi:
  - `C.NO_DESC`: `'(bez opisa)'`
  - `C.cleanDesc(desc) → string`: bez brojeva i interpunkcije na kraju, zadržava velika slova
  - `C.normalizeDesc(desc) → string`: ključ grupe, malim slovima, ili `NO_DESC`
  - `C.isPaidExp(e) → boolean`
  - `C.analysisPeriod(mKey, n) → string[]`: n meseci pre `mKey`, rastuće
  - `C.firstExpenseMonth(entries) → string|null`
  - `C.sumPaid(entries, mKey, pred?) → number`
  - `C.periodStats(entries, months, pred?) → { perMonth: number[], counted: string[], monthsWithData: number, avg: number, enough: boolean }`
  - `C.isFixedEntry(e, fixedCategories) → boolean`
  - `C.monthlyEquivalent(r) → number`

- [ ] **Korak 1: Napiši testove koji padaju.** Dodaj na kraj `app/test/core.test.js`:

```js
// ---------- Analiza potrosnje ----------
const ex = (id, date, amount, category, desc, extra = {}) => ({ id, type: 'expense', date, amount, category, desc, ...extra });

test('normalizeDesc: velika/mala slova, brojevi i interpunkcija na kraju', () => {
  assert.equal(C.normalizeDesc('Maxi 123'), 'maxi');
  assert.equal(C.normalizeDesc('MAXI.'), 'maxi');
  assert.equal(C.normalizeDesc('  maxi  '), 'maxi');
  assert.equal(C.normalizeDesc('Kafa (2)'), 'kafa');
  assert.equal(C.normalizeDesc('Lidl  Novi   Sad 45/2'), 'lidl novi sad');
  assert.equal(C.normalizeDesc('123'), '(bez opisa)');
  assert.equal(C.normalizeDesc('--'), '(bez opisa)');
  assert.equal(C.normalizeDesc(''), '(bez opisa)');
  assert.equal(C.normalizeDesc(undefined), '(bez opisa)');
  assert.equal(C.cleanDesc('Maxi 123'), 'Maxi');
});

test('analysisPeriod: n meseci pre izabranog, rastuce', () => {
  assert.deepEqual(C.analysisPeriod('2026-03', 3), ['2025-12', '2026-01', '2026-02']);
  assert.equal(C.analysisPeriod('2026-09', 12).length, 12);
  assert.equal(C.analysisPeriod('2026-09', 12)[11], '2026-08');
});

test('firstExpenseMonth: najraniji placeni trosak (i pocetak raspodele)', () => {
  assert.equal(C.firstExpenseMonth([]), null);
  assert.equal(C.firstExpenseMonth([ex('a', '2026-05-10', 100, 'Hrana', 'x'), ex('b', '2026-03-02', 100, 'Hrana', 'y')]), '2026-03');
  assert.equal(C.firstExpenseMonth([ex('a', '2026-05-10', 100, 'Hrana', 'x', { spreadMonths: 3, spreadStart: '2026-01' })]), '2026-01');
  assert.equal(C.firstExpenseMonth([ex('a', '2026-01-10', 100, 'Hrana', 'x', { paid: false }), ex('b', '2026-04-02', 100, 'Hrana', 'y')]), '2026-04');
  assert.equal(C.firstExpenseMonth([{ id: 'i', type: 'income', date: '2025-01-01', amount: 5, category: 'Plata', desc: 'p' }]), null);
});

test('periodStats: prosek samo od prvog meseca sa podacima, neplaceno se ne racuna', () => {
  const entries = [
    ex('a', '2026-04-05', 3000, 'Hrana', 'Maxi'),
    ex('b', '2026-05-05', 5000, 'Hrana', 'Maxi'),
    ex('c', '2026-05-06', 9999, 'Hrana', 'Maxi', { paid: false }),
    // jun bez troskova -> ulazi kao 0
  ];
  const st = C.periodStats(entries, ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']);
  assert.deepEqual(st.perMonth, [0, 0, 0, 3000, 5000, 0]);
  assert.deepEqual(st.counted, ['2026-04', '2026-05', '2026-06']);
  assert.equal(st.monthsWithData, 3);
  assert.equal(st.avg, 8000 / 3);
  assert.equal(st.enough, true);
  const onlyOne = C.periodStats(entries, ['2026-03', '2026-04']);
  assert.equal(onlyOne.monthsWithData, 1);
  assert.equal(onlyOne.enough, false);
  const none = C.periodStats([], ['2026-03', '2026-04']);
  assert.deepEqual(none, { perMonth: [0, 0], counted: [], monthsWithData: 0, avg: 0, enough: false });
  const hrana = C.periodStats(entries.concat([ex('d', '2026-05-07', 700, 'Prevoz', 'Bus')]), ['2026-04', '2026-05'], e => e.category === 'Prevoz');
  assert.deepEqual(hrana.perMonth, [0, 700]);
  assert.equal(hrana.avg, 350);
});

test('sumPaid i isFixedEntry', () => {
  const entries = [ex('a', '2026-05-05', 1000, 'Hrana', 'x'), ex('b', '2026-05-06', 400, 'Hrana', 'y', { paid: false }), ex('c', '2026-04-06', 200, 'Hrana', 'z')];
  assert.equal(C.sumPaid(entries, '2026-05'), 1000);
  assert.equal(C.sumPaid(entries, '2026-05', e => e.category === 'Prevoz'), 0);
  assert.equal(C.isFixedEntry(ex('rec-abc-2026-05', '2026-05-01', 1, 'Zabava', 'Netflix'), []), true);
  assert.equal(C.isFixedEntry(ex('x1', '2026-05-01', 1, 'Stanovanje', 'Kirija'), ['Stanovanje']), true);
  assert.equal(C.isFixedEntry(ex('x2', '2026-05-01', 1, 'Hrana', 'Maxi'), ['Stanovanje']), false);
});

test('monthlyEquivalent', () => {
  assert.equal(C.monthlyEquivalent({ amount: 1200, frequency: 'yearly' }), 100);
  assert.equal(C.monthlyEquivalent({ amount: 300, frequency: 'quarterly' }), 100);
  assert.equal(C.monthlyEquivalent({ amount: 100, frequency: 'monthly' }), 100);
  assert.equal(C.monthlyEquivalent({ amount: 100 }), 100);
});
```

- [ ] **Korak 2: Pokreni testove i proveri da padaju.** Komanda: `cd /e/Vanja/app && npm test`. Očekuje se da padnu, sa `TypeError: C.normalizeDesc is not a function` i sličnim porukama.

- [ ] **Korak 3: Napiši implementaciju.** U `budzet-core.js`, odmah posle funkcije `debtPayoffPlan` (pre `return {`), dodaj:

```js
  // ---------- Analiza potrosnje ----------
  // Racuna se samo placen rashod; raspodeljena stavka ulazi mesecnim delom (shareInMonth).
  const NO_DESC = '(bez opisa)';
  const isPaidExp = e => e.type === 'expense' && e.paid !== false;
  // "Maxi 123", "MAXI." i "maxi" su ista grupa: bez brojeva/interpunkcije na kraju, bez obzira na velika/mala slova.
  function cleanDesc(desc){
    return String(desc == null ? '' : desc).replace(/\s+/g, ' ').replace(/[\s\d.,;:!?#*+\-–—_/\\()'"]+$/u, '').trim();
  }
  function normalizeDesc(desc){ return cleanDesc(desc).toLowerCase() || NO_DESC; }
  // n punih meseci PRE mKey, rastuce ('2026-03', 3 -> ['2025-12','2026-01','2026-02']).
  function analysisPeriod(mKey, n){
    const out = [];
    for(let i = n; i >= 1; i--) out.push(addMonths(mKey, -i));
    return out;
  }
  function firstExpenseMonth(entries){
    let first = null;
    entries.forEach(e => { if(!isPaidExp(e)) return; const s = spreadOf(e).start; if(first === null || s < first) first = s; });
    return first;
  }
  function sumPaid(entries, mKey, pred){
    return entries.reduce((s, e) => (isPaidExp(e) && (!pred || pred(e))) ? s + shareInMonth(e, mKey) : s, 0);
  }
  // Mesecni zbirovi za period; prosek samo od prvog meseca sa podacima (raniji meseci nisu nula).
  function periodStats(entries, months, pred){
    const first = firstExpenseMonth(entries);
    const perMonth = months.map(m => sumPaid(entries, m, pred));
    const counted = first === null ? [] : months.filter(m => m >= first);
    const sum = months.reduce((s, m, i) => (first !== null && m >= first) ? s + perMonth[i] : s, 0);
    return { perMonth, counted, monthsWithData: counted.length, avg: counted.length ? sum / counted.length : 0, enough: counted.length >= 2 };
  }
  // Fiksno = generisano iz ponavljajuce stavke (id "rec-<id>-<YYYY-MM>") ili kategorija oznacena kao fiksna.
  function isFixedEntry(e, fixedCategories){
    return /^rec-/.test(e.id || '') || (fixedCategories || []).includes(e.category);
  }
  // Mesecni "ekvivalent" cene bez obzira na ucestalost (godisnja/12, kvartalna/3).
  function monthlyEquivalent(r){
    if(r.frequency === 'yearly') return r.amount / 12;
    if(r.frequency === 'quarterly') return r.amount / 3;
    return r.amount;
  }
```

U objektu koji se vraća, posle `linearRegressionForecast, debtPayoffPlan` dodaj:

```js
    linearRegressionForecast, debtPayoffPlan,
    NO_DESC, isPaidExp, cleanDesc, normalizeDesc, analysisPeriod, firstExpenseMonth, sumPaid, periodStats,
    isFixedEntry, monthlyEquivalent
```

(zarez posle `debtPayoffPlan` mora da postoji).

U `budzet-tracker.html` zameni celu funkciju `monthlyEquivalent` (red oko 5694, sa komentarom iznad nje) ovim:

```js
  // Mesecni "ekvivalent" cene bez obzira na ucestalost — omogucava fer poredjenje/sabiranje
  // godisnjih i kvartalnih pretplata sa mesecnim.
  const monthlyEquivalent = C.monthlyEquivalent;
```

Pazi na redosled: `const` nema hoisting kao `function`. Proveri da se `monthlyEquivalent` ne poziva pre tog reda tokom učitavanja stranice (`grep -n "monthlyEquivalent(" budzet-tracker.html`). Svi pozivi su unutar funkcija za crtanje, koje se pozivaju kasnije, pa je u redu. Ako neki poziv ipak radi na nivou skripte pre tog reda, premesti `const` odmah ispod `const C = window.BudzetCore;`.

- [ ] **Korak 4: Pokreni testove i proveri da prolaze.** Komanda: `cd /e/Vanja/app && npm test`. Očekuje se da svi testovi prođu, i stari i novi.

- [ ] **Korak 5: Commit.**

```bash
cd /e/Vanja && git add budzet-core.js budzet-tracker.html app/test/core.test.js && git commit -m "Analiza: osnovne funkcije u jezgru (opis, period, prosek, fiksno)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Zadatak 2: Kategorije, grupisanje po opisu, iznad proseka, sitni česti

**Fajlovi:**
- Izmena: `budzet-core.js`: nastavak odeljka „Analiza potrošnje“ i izvoz
- Test: `app/test/core.test.js`: dodaj na kraj

**Interfejsi:**
- Koristi (iz zadatka 1): `isPaidExp`, `cleanDesc`, `normalizeDesc`, `NO_DESC`, `analysisPeriod`, `sumPaid`, `periodStats`, `isFixedEntry`, `shareInMonths`
- Pravi:
  - `C.ABOVE_PCT = 0.2`, `C.ABOVE_MIN = 1000`, `C.SMALL_MAX = 1500`, `C.SMALL_PER_MONTH = 4`
  - `C.categoryBreakdown(entries, mKey, n) → { month, months, total, avg, enough, rows: [{ cat, total, avg|null, diff|null, pct|null }] }`. Redovi su samo kategorije sa `total > 0`, poređani po `total` opadajuće. `avg`, `diff` i `pct` su `null` kad je `enough === false`. `pct` je `null` i kad je `avg === 0`.
  - `C.groupByDesc(entries, months, pred?) → [{ key, label, total, count, avgPurchase }]`, poređano po `total` opadajuće
  - `C.aboveAverage(breakdown) → rows[]`: podskup `breakdown.rows`, poređan po `diff` opadajuće
  - `C.smallFrequent(entries, mKey, n, fixedCategories) → [{ key, label, total, count, avgPurchase, perMonth, monthly, yearly }]`

- [ ] **Korak 1: Napiši testove koji padaju.** Dodaj na kraj `app/test/core.test.js`:

```js
test('groupByDesc: grupe po opisu, raspodeljeni trosak ulazi mesecnim delom', () => {
  const entries = [
    ex('a', '2026-05-02', 1000, 'Hrana', 'Maxi 12'),
    ex('b', '2026-05-09', 3000, 'Hrana', 'maxi.'),
    ex('c', '2026-05-10', 500, 'Hrana', 'Pekara'),
    ex('d', '2026-05-11', 700, 'Prevoz', 'Bus'),
    ex('e', '2026-04-11', 6000, 'Hrana', 'Nabavka', { spreadMonths: 3, spreadStart: '2026-04' }), // 2000/mes: apr, maj, jun
    ex('f', '2026-05-12', 9999, 'Hrana', 'Maxi', { paid: false })
  ];
  const g = C.groupByDesc(entries, ['2026-05'], e => e.category === 'Hrana');
  assert.deepEqual(g.map(x => [x.key, x.label, x.total, x.count]), [
    ['maxi', 'Maxi', 4000, 2], ['nabavka', 'Nabavka', 2000, 1], ['pekara', 'Pekara', 500, 1]
  ]);
  assert.equal(g[0].avgPurchase, 2000);
  const all = C.groupByDesc(entries, ['2026-05']);
  assert.equal(all.length, 4);
  const noDesc = C.groupByDesc([ex('z', '2026-05-01', 50, 'Hrana', '123')], ['2026-05']);
  assert.equal(noDesc[0].label, '(bez opisa)');
});

test('categoryBreakdown i aboveAverage: pragovi 20% i 1.000 RSD, tacno na pragu ulazi', () => {
  const entries = [];
  // Hrana: prosek 5000 (mar, apr), maj 6000 -> +1000 i +20% -> ulazi (tacno na pragu)
  entries.push(ex('h1', '2026-03-05', 5000, 'Hrana', 'x'), ex('h2', '2026-04-05', 5000, 'Hrana', 'x'), ex('h3', '2026-05-05', 6000, 'Hrana', 'x'));
  // Zabava: prosek 2000, maj 2900 -> +45% ali samo +900 -> ne ulazi
  entries.push(ex('z1', '2026-03-05', 2000, 'Zabava', 'y'), ex('z2', '2026-04-05', 2000, 'Zabava', 'y'), ex('z3', '2026-05-05', 2900, 'Zabava', 'y'));
  // Stanovanje: prosek 40000, maj 45000 -> +5000 ali +12,5% -> ne ulazi
  entries.push(ex('s1', '2026-03-05', 40000, 'Stanovanje', 'k'), ex('s2', '2026-04-05', 40000, 'Stanovanje', 'k'), ex('s3', '2026-05-05', 45000, 'Stanovanje', 'k'));
  // Pokloni: nova kategorija (prosek 0), maj 3000 -> ne ulazi u "iznad proseka"
  entries.push(ex('p1', '2026-05-05', 3000, 'Pokloni', 'p'));
  // Prevoz: prosek 3000, maj 5000 -> +2000, +66% -> ulazi, prvi po diff
  entries.push(ex('v1', '2026-03-05', 3000, 'Prevoz', 'b'), ex('v2', '2026-04-05', 3000, 'Prevoz', 'b'), ex('v3', '2026-05-05', 5000, 'Prevoz', 'b'));
  const b = C.categoryBreakdown(entries, '2026-05', 6);
  assert.equal(b.enough, true);
  assert.deepEqual(b.months, C.analysisPeriod('2026-05', 6));
  assert.deepEqual(b.rows.map(r => r.cat), ['Stanovanje', 'Hrana', 'Prevoz', 'Pokloni', 'Zabava']);
  assert.equal(b.total, 45000 + 6000 + 5000 + 3000 + 2900);
  const hrana = b.rows.find(r => r.cat === 'Hrana');
  assert.deepEqual([hrana.total, hrana.avg, hrana.diff, hrana.pct], [6000, 5000, 1000, 20]);
  assert.equal(b.rows.find(r => r.cat === 'Pokloni').pct, null);
  assert.deepEqual(C.aboveAverage(b).map(r => r.cat), ['Prevoz', 'Hrana']);
});

test('categoryBreakdown: premalo istorije -> bez poredjenja', () => {
  const entries = [ex('a', '2026-04-05', 5000, 'Hrana', 'x'), ex('b', '2026-05-05', 9000, 'Hrana', 'x')];
  const b = C.categoryBreakdown(entries, '2026-05', 6); // samo april pre maja
  assert.equal(b.enough, false);
  assert.deepEqual(b.rows.map(r => [r.cat, r.total, r.avg, r.diff, r.pct]), [['Hrana', 9000, null, null, null]]);
  assert.deepEqual(C.aboveAverage(b), []);
  const empty = C.categoryBreakdown([], '2026-05', 6);
  assert.deepEqual([empty.rows, empty.total, empty.enough], [[], 0, false]);
});

test('smallFrequent: <=1.500 prosecno i >=4 kupovine mesecno, samo promenljivo', () => {
  const entries = [];
  const months = ['2026-03', '2026-04'];
  months.forEach(m => {
    for(let i = 1; i <= 4; i++) entries.push(ex('k' + m + i, m + '-0' + i, 300, 'Hrana', 'Kafa ' + i)); // 4x/mes, 300
    for(let i = 1; i <= 3; i++) entries.push(ex('p' + m + i, m + '-1' + i, 200, 'Hrana', 'Pekara'));   // 3x/mes -> ne
    for(let i = 1; i <= 5; i++) entries.push(ex('t' + m + i, m + '-2' + i, 1600, 'Hrana', 'Taxi'));    // 1600 > 1500 -> ne
    for(let i = 1; i <= 4; i++) entries.push(ex('b' + m + i, m + '-0' + i, 1500, 'Prevoz', 'Bus'));    // tacno 1500 -> da
    for(let i = 1; i <= 5; i++) entries.push(ex('s' + m + i, m + '-0' + i, 100, 'Stanovanje', 'Voda'));// fiksna kat. -> ne
  });
  const res = C.smallFrequent(entries, '2026-05', 6, ['Stanovanje']);
  assert.deepEqual(res.map(g => g.key), ['bus', 'kafa']);
  const kafa = res.find(g => g.key === 'kafa');
  assert.deepEqual([kafa.count, kafa.perMonth, kafa.monthly, kafa.yearly], [8, 4, 1200, 14400]);
  assert.deepEqual(C.smallFrequent(entries.filter(e => e.date < '2026-04'), '2026-05', 6, []), []); // samo 1 mesec podataka
});
```

- [ ] **Korak 2: Pokreni testove i proveri da padaju.** Komanda: `cd /e/Vanja/app && npm test`. Očekuje se da padnu, sa `C.groupByDesc is not a function` i sličnim porukama.

- [ ] **Korak 3: Napiši implementaciju.** U `budzet-core.js`, posle `monthlyEquivalent` (iz zadatka 1), dodaj:

```js
  const ABOVE_PCT = 0.2, ABOVE_MIN = 1000, SMALL_MAX = 1500, SMALL_PER_MONTH = 4;
  // Grupe po opisu u datim mesecima: ukupno (mesecnim delom), broj kupovina, prosecna kupovina.
  function groupByDesc(entries, months, pred){
    const map = new Map();
    entries.forEach(e => {
      if(!isPaidExp(e) || (pred && !pred(e))) return;
      const amt = shareInMonths(e, months);
      if(amt <= 0) return;
      const key = normalizeDesc(e.desc);
      if(!map.has(key)) map.set(key, { key, label: cleanDesc(e.desc) || NO_DESC, total: 0, count: 0 });
      const g = map.get(key);
      g.total += amt; g.count++;
    });
    return [...map.values()].map(g => Object.assign(g, { avgPurchase: g.total / g.count })).sort((a, b) => b.total - a.total);
  }
  // Kategorije izabranog meseca naspram proseka perioda (n meseci pre njega).
  function categoryBreakdown(entries, mKey, n){
    const months = analysisPeriod(mKey, n);
    const overall = periodStats(entries, months);
    const enough = overall.enough;
    const cats = [...new Set(entries.filter(isPaidExp).map(e => e.category))];
    const rows = cats.map(cat => {
      const pred = e => e.category === cat;
      const total = sumPaid(entries, mKey, pred);
      if(!enough) return { cat, total, avg: null, diff: null, pct: null };
      const avg = periodStats(entries, months, pred).avg;
      return { cat, total, avg, diff: total - avg, pct: avg > 0 ? Math.round((total - avg) / avg * 100) : null };
    }).filter(r => r.total > 0).sort((a, b) => b.total - a.total);
    return { month: mKey, months, total: rows.reduce((s, r) => s + r.total, 0), avg: overall.avg, enough, rows };
  }
  // Iznad proseka: bar 20% I bar 1.000 RSD (vrednost tacno na pragu se racuna); nova kategorija (prosek 0) ne.
  function aboveAverage(breakdown){
    if(!breakdown.enough) return [];
    return breakdown.rows.filter(r => r.avg > 0 && r.diff >= ABOVE_MIN && r.total >= r.avg * (1 + ABOVE_PCT)).sort((a, b) => b.diff - a.diff);
  }
  // Sitni cesti promenljivi troskovi u periodu: prosecna kupovina <= 1.500 i >= 4 kupovine mesecno.
  function smallFrequent(entries, mKey, n, fixedCategories){
    const st = periodStats(entries, analysisPeriod(mKey, n));
    if(!st.enough) return [];
    const k = st.counted.length;
    return groupByDesc(entries, st.counted, e => !isFixedEntry(e, fixedCategories))
      .filter(g => g.avgPurchase <= SMALL_MAX && g.count / k >= SMALL_PER_MONTH)
      .map(g => Object.assign(g, { perMonth: g.count / k, monthly: g.total / k, yearly: g.total / k * 12 }));
  }
```

U izvoz dodaj: `ABOVE_PCT, ABOVE_MIN, SMALL_MAX, SMALL_PER_MONTH, groupByDesc, categoryBreakdown, aboveAverage, smallFrequent`.

- [ ] **Korak 4: Pokreni testove i proveri da prolaze.** Komanda: `cd /e/Vanja/app && npm test`. Očekuje se da svi prođu.

- [ ] **Korak 5: Commit.**

```bash
cd /e/Vanja && git add budzet-core.js app/test/core.test.js && git commit -m "Analiza: kategorije, grupe po opisu, iznad proseka, sitni česti troškovi

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Zadatak 3: Fiksno/promenljivo, pretplate, klizač „šta ako“, sažetak uštede

**Fajlovi:**
- Izmena: `budzet-core.js`: nastavak odeljka i izvoz
- Test: `app/test/core.test.js`: dodaj na kraj

**Interfejsi:**
- Koristi (iz zadataka 1 i 2): `isPaidExp`, `sumPaid`, `periodStats`, `analysisPeriod`, `isFixedEntry`, `monthlyEquivalent`, `categoryBreakdown`, `aboveAverage`, `smallFrequent`, `toISODate`
- Pravi:
  - `C.splitFixedVariable(entries, mKey, fixedCategories) → { fixed, variable, total, fixedPct }` (`fixedPct` je ceo broj 0–100, 0 kad je `total` 0)
  - `C.variableAverage(entries, mKey, n, fixedCategories) → number`
  - `C.CREEP_PCT = 0.10`
  - `C.subscriptionsYearly(recurring, entries) → [{ id, desc, category, frequency, yearly, first|null, last|null, creep, creepPct|null }]`, poređano po `yearly` opadajuće, bez prihoda
  - `C.monthsUntil(today: Date, deadlineISO) → number` (≥ 1)
  - `C.whatIf(variableAvg, pct, goals, today: Date) → { pct, monthly, yearly, goal: null | { id, name, monthsLeft, newMonths, sooner } }`
  - `C.savingsSummary(entries, recurring, fixedCategories, mKey, n) → { month, n, enough, breakdown, above, aboveTotal, small, smallMonthly, subscriptions }`

- [ ] **Korak 1: Napiši testove koji padaju.** Dodaj na kraj `app/test/core.test.js`:

```js
test('splitFixedVariable i variableAverage', () => {
  const entries = [
    ex('rec-n1-2026-05', '2026-05-01', 1200, 'Zabava', 'Netflix'),
    ex('k1', '2026-05-03', 40000, 'Stanovanje', 'Kirija'),
    ex('m1', '2026-05-04', 8800, 'Hrana', 'Maxi'),
    ex('m2', '2026-05-05', 500, 'Hrana', 'Maxi', { paid: false }),
    ex('a1', '2026-03-04', 6000, 'Hrana', 'Maxi'), ex('a2', '2026-04-04', 10000, 'Hrana', 'Maxi'),
    ex('rec-n1-2026-04', '2026-04-01', 1200, 'Zabava', 'Netflix')
  ];
  assert.deepEqual(C.splitFixedVariable(entries, '2026-05', ['Stanovanje']), { fixed: 41200, variable: 8800, total: 50000, fixedPct: 82 });
  assert.deepEqual(C.splitFixedVariable([], '2026-05', []), { fixed: 0, variable: 0, total: 0, fixedPct: 0 });
  assert.equal(C.variableAverage(entries, '2026-05', 6, ['Stanovanje']), 8000); // (6000 + 10000) / 2
});

test('subscriptionsYearly: godisnji trosak i poskupljenje > 10% (bar 3 placanja)', () => {
  const recurring = [
    { id: 'n', desc: 'Netflix', amount: 1400, category: 'Zabava', type: 'expense', frequency: 'monthly' },
    { id: 'o', desc: 'Osiguranje', amount: 24000, category: 'Ostalo', type: 'expense', frequency: 'yearly' },
    { id: 's', desc: 'Spotify', amount: 600, category: 'Zabava', type: 'expense', frequency: 'monthly' },
    { id: 'p', desc: 'Plata', amount: 100000, category: 'Plata', type: 'income', frequency: 'monthly' }
  ];
  const entries = [
    ex('rec-n-2026-01', '2026-01-05', 1200, 'Zabava', 'Netflix'), ex('rec-n-2026-02', '2026-02-05', 1300, 'Zabava', 'Netflix'),
    ex('rec-n-2026-03', '2026-03-05', 1400, 'Zabava', 'Netflix'),                        // +16,7% -> poskupelo
    ex('rec-s-2026-01', '2026-01-05', 600, 'Zabava', 'Spotify'), ex('rec-s-2026-02', '2026-02-05', 660, 'Zabava', 'Spotify'),
    ex('rec-s-2026-03', '2026-03-05', 660, 'Zabava', 'Spotify'),                          // tacno +10% -> NE
    ex('rec-o-2025-01', '2025-01-05', 20000, 'Ostalo', 'Osiguranje'), ex('rec-o-2026-01', '2026-01-05', 24000, 'Ostalo', 'Osiguranje') // samo 2 -> NE
  ];
  const res = C.subscriptionsYearly(recurring, entries);
  assert.deepEqual(res.map(r => [r.id, r.yearly, r.creep, r.creepPct]), [
    ['o', 24000, false, null], ['n', 16800, true, 17], ['s', 7200, false, null]
  ]);
  assert.deepEqual([res[1].first, res[1].last], [1200, 1400]);
  assert.deepEqual(C.subscriptionsYearly([], entries), []);
});

test('whatIf: usteda i cilj N meseci ranije', () => {
  const today = new Date(2026, 8, 28); // 28.09.2026.
  const goals = [
    { id: 'g1', name: 'More', target: 130000, current: 10000, deadline: '2027-09-28' }, // 12 meseci, tempo 10.000
    { id: 'g2', name: 'Auto', target: 900000, current: 0, deadline: '2029-01-01' },
    { id: 'g3', name: 'Gotov', target: 5000, current: 5000, deadline: '2026-12-01' },
    { id: 'g4', name: 'Bez roka', target: 50000, current: 0, deadline: '' },
    { id: 'g5', name: 'Prosao', target: 50000, current: 0, deadline: '2026-01-01' }
  ];
  const r = C.whatIf(20000, 10, goals, today); // 2.000 mesecno
  assert.deepEqual([r.pct, r.monthly, r.yearly], [10, 2000, 24000]);
  assert.deepEqual(r.goal, { id: 'g1', name: 'More', monthsLeft: 12, newMonths: 10, sooner: 2 }); // 120000 / 12000 = 10
  assert.equal(C.whatIf(20000, 0, goals, today).goal, null);
  assert.equal(C.whatIf(20000, 80, [], today).pct, 50);     // klizac najvise 50%
  assert.equal(C.whatIf(20000, 10, goals.slice(2), today).goal, null); // samo gotov / bez roka / prosao
  assert.equal(C.whatIf(20000, 1, [goals[0]], today).goal, null); // 200/mes ne skracuje ni za ceo mesec -> null
  assert.equal(C.monthsUntil(today, '2026-10-01'), 1);
});

test('savingsSummary: isti rezultat za Pregled i Analizu', () => {
  const entries = [ex('v1', '2026-03-05', 3000, 'Prevoz', 'b'), ex('v2', '2026-04-05', 3000, 'Prevoz', 'b'), ex('v3', '2026-05-05', 5000, 'Prevoz', 'b')];
  const s = C.savingsSummary(entries, [], [], '2026-05', 6);
  assert.equal(s.enough, true);
  assert.deepEqual(s.above.map(r => r.cat), ['Prevoz']);
  assert.equal(s.aboveTotal, 2000);
  assert.deepEqual([s.small, s.smallMonthly, s.subscriptions], [[], 0, []]);
  assert.equal(s.breakdown.rows.length, 1);
});
```

- [ ] **Korak 2: Pokreni testove i proveri da padaju.** Komanda: `cd /e/Vanja/app && npm test`. Očekuje se da padnu, sa `C.splitFixedVariable is not a function` i sličnim porukama.

- [ ] **Korak 3: Napiši implementaciju.** U `budzet-core.js`, posle `smallFrequent`, dodaj:

```js
  function splitFixedVariable(entries, mKey, fixedCategories){
    const fixed = sumPaid(entries, mKey, e => isFixedEntry(e, fixedCategories));
    const total = sumPaid(entries, mKey);
    return { fixed, variable: total - fixed, total, fixedPct: total > 0 ? Math.round(fixed / total * 100) : 0 };
  }
  function variableAverage(entries, mKey, n, fixedCategories){
    return periodStats(entries, analysisPeriod(mKey, n), e => !isFixedEntry(e, fixedCategories)).avg;
  }
  // Ponavljajuci troskovi sa godisnjim troskom; "poskupelo" = poslednja naplata > 10% iznad prve (bar 3 naplate).
  const CREEP_PCT = 0.10;
  function subscriptionsYearly(recurring, entries){
    return (recurring || []).filter(r => r.type !== 'income').map(r => {
      const prefix = 'rec-' + r.id + '-';
      const hist = entries.filter(e => (e.id || '').startsWith(prefix)).sort((a, b) => a.date.localeCompare(b.date));
      const first = hist.length ? hist[0].amount : null;
      const last = hist.length ? hist[hist.length - 1].amount : null;
      const creep = hist.length >= 3 && first > 0 && last > first * (1 + CREEP_PCT);
      return { id: r.id, desc: r.desc, category: r.category, frequency: r.frequency || 'monthly', yearly: monthlyEquivalent(r) * 12,
        first, last, creep, creepPct: creep ? Math.round((last - first) / first * 100) : null };
    }).sort((a, b) => b.yearly - a.yearly);
  }
  // Broj meseci do roka, isto kao predlog kod ciljeva (najmanje 1).
  function monthsUntil(today, deadlineISO){
    const [y, m, d] = deadlineISO.split('-').map(Number);
    let months = (y - today.getFullYear()) * 12 + (m - 1 - today.getMonth());
    if(d < today.getDate()) months -= 1;
    return Math.max(1, months);
  }
  // "Sta ako smanjim promenljive troskove za pct%": usteda i koliko ranije stize cilj sa najblizim rokom.
  function whatIf(variableAvg, pct, goals, today){
    const p = Math.max(0, Math.min(50, Number(pct) || 0));
    const monthly = variableAvg * p / 100;
    const res = { pct: p, monthly, yearly: monthly * 12, goal: null };
    if(monthly <= 0) return res;
    const todayISO = toISODate(today);
    const active = (goals || []).filter(g => g.target > g.current && g.deadline && g.deadline > todayISO)
      .sort((a, b) => a.deadline.localeCompare(b.deadline));
    if(!active.length) return res;
    const g = active[0];
    const remaining = g.target - g.current;
    const monthsLeft = monthsUntil(today, g.deadline);
    const newMonths = Math.ceil(remaining / (remaining / monthsLeft + monthly));
    const sooner = monthsLeft - newMonths;
    if(sooner >= 1) res.goal = { id: g.id, name: g.name, monthsLeft, newMonths, sooner };
    return res;
  }
  // Jedan poziv za Pregled i Analizu — da brojke uvek budu iste.
  function savingsSummary(entries, recurring, fixedCategories, mKey, n){
    const breakdown = categoryBreakdown(entries, mKey, n);
    const above = aboveAverage(breakdown);
    const small = smallFrequent(entries, mKey, n, fixedCategories);
    return { month: mKey, n, enough: breakdown.enough, breakdown, above, aboveTotal: above.reduce((s, r) => s + r.diff, 0),
      small, smallMonthly: small.reduce((s, g) => s + g.monthly, 0), subscriptions: subscriptionsYearly(recurring, entries) };
  }
```

U izvoz dodaj: `splitFixedVariable, variableAverage, CREEP_PCT, subscriptionsYearly, monthsUntil, whatIf, savingsSummary`.

- [ ] **Korak 4: Pokreni testove i proveri da prolaze.** Komanda: `cd /e/Vanja/app && npm test`. Očekuje se da svi prođu.

- [ ] **Korak 5: Commit.**

```bash
cd /e/Vanja && git add budzet-core.js app/test/core.test.js && git commit -m "Analiza: fiksno/promenljivo, pretplate, šta ako, sažetak uštede

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Zadatak 4: Čuvanje oznake „fiksno“ (`fixedCategories`)

**Fajlovi:**
- Izmena `budzet-tracker.html`:
  - konstante i stanje (oko reda 2543 i 2553)
  - funkcije za čuvanje (oko reda 2649)
  - `renameCategory` (oko reda 5616)
  - brisanje kategorije u `renderCategories` (oko reda 5518)
  - izvoz JSON kopije (oko reda 6512)
  - `sanitizeImportedBackup`: povratni objekat (oko reda 6588)
  - uvoz JSON kopije (oko reda 6625-6660)
- Izmena `app/test/smoke-checks.js`

**Interfejsi:**
- Pravi (u stranici):
  - `let fixedCategories: string[]`
  - `saveFixedCategories()`
  - `setCategoryFixed(cat, on)`, koja poziva `saveFixedCategories()` i `invalidate()`
  - `window.__setCategoryFixed = setCategoryFixed`, za smoke test
- Zadaci 6 i 7 čitaju `fixedCategories` i pozivaju `setCategoryFixed`.

- [ ] **Korak 1: Napiši smoke proveru koja pada.** U `app/test/smoke-checks.js`, odmah posle bloka „Svi ekrani se otvaraju“ (posle reda `check('podmeni za Ciljevi i dugovi', ...)` i pre `go('pregled');`), dodaj:

```js
    // Oznaka "fiksno" po kategoriji: cuva se i prati preimenovanje/brisanje
    const fixedKey = 'budzet-fiksne-kategorije-v1';
    const fixedList = () => JSON.parse(localStorage.getItem(fixedKey) || '[]');
    check('oznaka fiksno postoji', typeof window.__setCategoryFixed === 'function');
    if (typeof window.__setCategoryFixed === 'function') {
      window.__addExpenseCategory('Smoke fiksna');
      window.__setCategoryFixed('Smoke fiksna', true);
      check('fiksna kategorija sačuvana', fixedList().includes('Smoke fiksna'), localStorage.getItem(fixedKey));
      window.__renameCategory('Smoke fiksna', 'Smoke fiksna 2');
      check('preimenovanje zadržava oznaku fiksno', fixedList().includes('Smoke fiksna 2') && !fixedList().includes('Smoke fiksna'), localStorage.getItem(fixedKey));
      window.__deleteExpenseCategory('Smoke fiksna 2');
      check('brisanje kategorije briše oznaku fiksno', !fixedList().includes('Smoke fiksna 2'), localStorage.getItem(fixedKey));
    }
```

- [ ] **Korak 2: Pokreni smoke i proveri da pada.** Komanda: `cd /e/Vanja/app && npm run smoke -- "C:/Users/gejme/OneDrive/Belgeler/Knjiga budzeta/podaci.json"`. Očekuje se `✗ oznaka fiksno postoji` i na kraju `IMA GREŠAKA`.

- [ ] **Korak 3: Napiši implementaciju** u `budzet-tracker.html`.

(a) Ispod `const ROUNDUP_KEY = 'budzet-zaokruzivanje-v1';` dodaj:

```js
  const FIXED_CATS_KEY = 'budzet-fiksne-kategorije-v1';
```

(b) Ispod `let healthHistory = JSON.parse(localStorage.getItem(HEALTH_KEY) || '[]');` dodaj:

```js
  // Kategorije koje korisnik oznaci kao fiksne (Analiza). Stavke iz ponavljajucih su fiksne i bez oznake.
  let fixedCategories = (()=>{ try{ const v = JSON.parse(localStorage.getItem(FIXED_CATS_KEY) || '[]'); return Array.isArray(v) ? v.filter(c=> typeof c === 'string') : []; } catch(e){ return []; } })();
```

(c) Ispod `const saveEnvelopeState = () => ...;` dodaj:

```js
  const saveFixedCategories = () => localStorage.setItem(FIXED_CATS_KEY, JSON.stringify(fixedCategories));
```

(d) U `renameCategory`, posle reda `if(envelopeState.rollover[oldName] != null){ ... }`, dodaj:

```js
    fixedCategories = fixedCategories.map(c => c === oldName ? newName : c);
```

U redu `saveCats(); saveLimits(); saveCatColors(); saveEnvelopeState(); saveEntries(); saveRecurring();` dodaj `saveFixedCategories();` na kraj.

(e) U `renderCategories`, izdvoji telo handlera za brisanje (`list.querySelectorAll('.del-btn:not([disabled])')...`) u funkciju na nivou skripte. Stavi je odmah iznad `function renameCategory`:

```js
  function deleteExpenseCategory(cat){
    expenseCats = expenseCats.filter(c => c !== cat);
    delete limits[cat];
    delete catColors[cat];
    delete envelopeState.rollover[cat];
    fixedCategories = fixedCategories.filter(c => c !== cat);
    saveCats(); saveLimits(); saveCatColors(); saveEnvelopeState(); saveFixedCategories();
    populateExpenseCategorySelect(); populateExpenseFilters(); populateRecurringCategorySelect(); renderCatRules();
    renderAll();
  }
  function setCategoryFixed(cat, on){
    fixedCategories = fixedCategories.filter(c => c !== cat);
    if(on) fixedCategories.push(cat);
    saveFixedCategories();
    invalidate();
  }
  window.__setCategoryFixed = setCategoryFixed;
  window.__renameCategory = (a, b) => renameCategory(a, b);
  window.__deleteExpenseCategory = cat => deleteExpenseCategory(cat);
```

Handler u `renderCategories` postaje:

```js
    list.querySelectorAll('.del-btn:not([disabled])').forEach(b=>{
      b.addEventListener('click', ()=> deleteExpenseCategory(b.dataset.cat));
    });
```

(f) Za smoke test je potrebno i dodavanje kategorije bez forme. Ispod `function addCategory(){ ... }` dodaj:

```js
  window.__addExpenseCategory = name => { document.getElementById('newCatInput').value = name; addCategory(); };
```

(g) JSON izvoz, red sa `return { entries, accounts, ... savedScenarios, exportedAt: ... }`: dodaj `fixedCategories,` odmah posle `savedScenarios,`.

(h) Na kraj povratnog objekta u `sanitizeImportedBackup`, posle reda `savedScenarios: ...`, dodaj:

```js
      fixedCategories: Array.isArray(data.fixedCategories) ? data.fixedCategories.filter(c=> typeof c === 'string') : [],
```

(i) U handleru `backupImportInput`, posle `savedScenarios = data.savedScenarios;`, dodaj `fixedCategories = data.fixedCategories;`. U dugački red `saveEntries(); saveAccounts(); ... saveSavedScenarios();` dodaj `saveFixedCategories();` na kraj.

- [ ] **Korak 4: Pokreni testove i smoke, proveri da prolaze.** Komanda: `cd /e/Vanja/app && npm test && npm run smoke -- "C:/Users/gejme/OneDrive/Belgeler/Knjiga budzeta/podaci.json"`. Očekuje se da prođu sve tri provere „fiksno“, uključujući preimenovanje i brisanje, i na kraju `SVE U REDU`.

- [ ] **Korak 5: Commit.**

```bash
cd /e/Vanja && git add budzet-tracker.html app/test/smoke-checks.js && git commit -m "Analiza: čuvanje oznake fiksno po kategoriji

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Zadatak 5: Ekran Analiza: gornja traka, „Na šta ide novac“, „Kroz vreme“

**Fajlovi:**
- Izmena `budzet-tracker.html`:
  - HTML novog ekrana, ubacuje se odmah ispred `<div class="screen" id="screen-uporedi">` (red oko 2078)
  - `SCREEN_GROUPS.izvestaji` i `SCREEN_RENDER` (oko reda 3101 i 3118)
  - nove funkcije za crtanje, odmah iznad komentara `// ---- Kalendar meseca` (oko reda 4165)
  - CSS u sloju `apple-theme`
- Izmena `app/test/smoke-checks.js`

**Interfejsi:**
- Koristi:
  - `C.categoryBreakdown`, `C.groupByDesc`, `C.periodStats`, `C.firstExpenseMonth`, `C.analysisPeriod`
  - funkcije iz stranice: `sumMonth`, `isPaidExpense`, `fmt`, `t`, `escapeHtml`, `catTagHtml`, `catColorFor`, `expenseCats`, `monthYearLabelSr`, `currentMonthKey`, `LOCALE`
- Pravi:
  - `analizaState = { month: string|null, n: 3|6|12, cat: string|null, open: Set<string>, showAll: Set<string>, whatIf: number }`
  - `renderAnaliza()`
  - `openAnaliza(section?: 'save')`: postavlja tekući mesec i period od 6 meseci, otvara ekran i po želji skroluje do `#analizaSave`. Koristi ga zadatak 7.
  - prazne funkcije `renderAnalizaFixed(month)` i `renderAnalizaSave(month)`, koje popunjava zadatak 6

- [ ] **Korak 1: Napiši smoke proveru koja pada.** U `app/test/smoke-checks.js`:
  - u nizu ekrana za petlju „Svi ekrani se otvaraju“ dodaj `'analiza'` ispred `'izvestaj'`
  - posle bloka „fiksno“ iz zadatka 4 dodaj:

```js
    // Analiza: prva podkartica u Izvestajima, izbor perioda
    document.querySelector('nav.tabs button[data-group="izvestaji"]').click(); await sleep(50);
    check('Analiza je prva podkartica Izveštaja', ($('subtabs').querySelector('button') || {}).dataset?.screen === 'analiza', $('subtabs').innerHTML.slice(0, 200));
    go('analiza'); await sleep(80);
    document.querySelector('.analiza-period-btn[data-n="3"]').click(); await sleep(50);
    check('Analiza: period 3 meseca', $('analizaSummary').dataset.n === '3' && document.querySelector('.analiza-period-btn[data-n="3"]').classList.contains('active'));
    document.querySelector('.analiza-period-btn[data-n="6"]').click(); await sleep(50);
    check('Analiza: period 6 meseci', $('analizaSummary').dataset.n === '6');
    check('Analiza: sažetak i kategorije', $('analizaSummary').textContent.trim().length > 0 && !!$('analizaWhereList'));
    const firstCat = document.querySelector('#analizaWhereList .analiza-cat-head');
    if (firstCat) {
      firstCat.click(); await sleep(50);
      check('Analiza: klik na kategoriju otvara opise', !!document.querySelector('#analizaWhereList .analiza-groups'));
    }
    check('Analiza: grafikon kroz vreme', $('analizaTrendChart').querySelectorAll('rect').length > 0 || $('analizaTrendNote').textContent.length > 0);
```

- [ ] **Korak 2: Pokreni smoke i proveri da pada.** Komanda: `cd /e/Vanja/app && npm run smoke -- "C:/Users/gejme/OneDrive/Belgeler/Knjiga budzeta/podaci.json"`. Očekuje se `✗` na `ekran analiza` (ili izuzetak jer `screen-analiza` ne postoji) i `IMA GREŠAKA`.

- [ ] **Korak 3: Napiši HTML.** Ubaci odmah ispred `<div class="screen" id="screen-uporedi">`:

```html
  <!-- ANALIZA -->
  <div class="screen" id="screen-analiza">
    <div class="panel">
      <div class="analiza-controls">
        <select id="analizaMonth" aria-label="Mesec"></select>
        <div class="trend-range-toggle" role="group" aria-label="Period">
          <button class="analiza-period-btn" data-n="3">3 meseca</button>
          <button class="analiza-period-btn" data-n="6">6 meseci</button>
          <button class="analiza-period-btn" data-n="12">12 meseci</button>
        </div>
      </div>
      <div id="analizaSummary" class="analiza-summary"></div>
    </div>
    <div class="panel" id="analizaWhere" style="margin-top:1.5em;">
      <h2>Na šta ide novac</h2>
      <div id="analizaWhereList"></div>
    </div>
    <div class="panel chart-panel" id="analizaTrend" style="margin-top:1.5em;">
      <div class="analiza-head">
        <h2>Kroz vreme</h2>
        <select id="analizaTrendCat" aria-label="Kategorija"></select>
      </div>
      <svg id="analizaTrendChart" class="trend-svg" viewBox="0 0 760 200" preserveAspectRatio="xMidYMid meet"></svg>
      <div id="analizaTrendNote" class="hint"></div>
    </div>
    <div class="panel" id="analizaFixed" style="margin-top:1.5em;">
      <h2>Fiksno / promenljivo</h2>
      <div id="analizaFixedBar"></div>
      <div class="hint">Troškovi iz ponavljajućih stavki su uvek fiksni.</div>
      <div id="analizaFixedCats" class="analiza-fixed-cats"></div>
    </div>
    <div class="panel" id="analizaSave" style="margin-top:1.5em;">
      <h2>Gde mogu da uštedim</h2>
      <div id="analizaSaveBody"></div>
      <div class="analiza-whatif">
        <label for="analizaWhatIf" id="analizaWhatIfLabel"></label>
        <input type="range" id="analizaWhatIf" min="0" max="50" step="5" value="10">
        <div id="analizaWhatIfResult"></div>
      </div>
    </div>
  </div>
```

- [ ] **Korak 4: Registruj ekran.** U `SCREEN_GROUPS` zameni red za `izvestaji` ovim:

```js
    izvestaji: [['analiza', 'Analiza'], ['izvestaj', 'Izveštaj za štampu'], ['uporedi', 'Uporedi'], ['scenario', 'Scenario „šta ako“']],
```

U `SCREEN_RENDER`, ispred `izvestaj: ...`, dodaj:

```js
    analiza: ()=> renderAnaliza(),
```

- [ ] **Korak 5: Napiši logiku za crtanje.** Iznad `// ---- Kalendar meseca (kompaktan)` dodaj:

```js
  // ---- Analiza potrosnje (Izvestaji → Analiza) ----
  // Sva racunanja su u budzet-core.js (C.categoryBreakdown, C.savingsSummary...); ovde je samo crtanje.
  const analizaState = { month: null, n: 6, cat: null, open: new Set(), showAll: new Set(), whatIf: 10 };
  const analizaPeriodTxt = n => n === 3 ? t('3 meseca') : n === 12 ? t('12 meseci') : t('6 meseci');
  function analizaMonthOptions(){
    const cur = currentMonthKey();
    const first = C.firstExpenseMonth(entries) || cur;
    return C.monthRange(first < cur ? first : cur, cur).reverse();
  }
  function renderAnaliza(){
    const months = analizaMonthOptions();
    if(!analizaState.month || !months.includes(analizaState.month)) analizaState.month = months[0];
    const month = analizaState.month;
    const sel = document.getElementById('analizaMonth');
    sel.innerHTML = months.map(m=> `<option value="${m}"${m === month ? ' selected' : ''}>${monthYearLabelSr(m)}</option>`).join('');
    document.querySelectorAll('.analiza-period-btn').forEach(b=> b.classList.toggle('active', Number(b.dataset.n) === analizaState.n));
    const b = C.categoryBreakdown(entries, month, analizaState.n);
    const sum = document.getElementById('analizaSummary');
    sum.dataset.n = String(analizaState.n);
    if(b.total <= 0) sum.textContent = t('{0}: {1}', monthYearLabelSr(month), t('Nema plaćenih troškova u ovom mesecu'));
    else if(!b.enough) sum.textContent = t('{0}: {1}', monthYearLabelSr(month), fmt(b.total)) + ' · ' + t('Za poređenje su potrebna bar 2 meseca podataka');
    else {
      const pct = b.avg > 0 ? Math.round((b.total - b.avg) / b.avg * 100) : 0;
      sum.textContent = t('{0}: {1} · prosek ({2}) {3} · {4}', monthYearLabelSr(month), fmt(b.total), analizaPeriodTxt(analizaState.n), fmt(b.avg), (pct > 0 ? '+' : '') + pct + '%');
    }
    renderAnalizaWhere(b);
    renderAnalizaTrend(b);
    renderAnalizaFixed(month);
    renderAnalizaSave(month);
  }
  function renderAnalizaWhere(b){
    const el = document.getElementById('analizaWhereList');
    if(!b.rows.length){ el.innerHTML = `<div class="empty">${t('Nema plaćenih troškova u ovom mesecu')}</div>`; return; }
    el.innerHTML = b.rows.map(r=>{
      const share = b.total > 0 ? Math.round(r.total / b.total * 100) : 0;
      const color = catColorFor(r.cat, Math.max(0, expenseCats.indexOf(r.cat)));
      const diff = r.pct == null ? '' : `<span class="analiza-diff ${r.diff > 0 ? 'up' : 'down'}">${r.diff > 0 ? '▲' : '▼'} ${Math.abs(r.pct)}%</span>`;
      const open = analizaState.open.has(r.cat);
      let groups = '';
      if(open){
        const all = C.groupByDesc(entries, [b.month], e=> e.category === r.cat);
        const shown = analizaState.showAll.has(r.cat) ? all : all.slice(0, 5);
        groups = `<table class="analiza-groups">${shown.map(g=> `<tr>
            <td${g.label === C.NO_DESC ? '' : ' translate="no"'}>${escapeHtml(g.label)}</td>
            <td class="muted">${t('{0}×', g.count)} · ${t('prosečno {0}', fmt(g.avgPurchase))}</td>
            <td class="num">${fmt(g.total)}</td></tr>`).join('')}</table>
          ${all.length > 5 ? `<button class="btn-link analiza-more" data-cat="${escapeHtml(r.cat)}">${analizaState.showAll.has(r.cat) ? t('prikaži manje') : t('prikaži sve')}</button>` : ''}`;
      }
      return `<div class="analiza-cat${open ? ' open' : ''}">
        <button class="analiza-cat-head" data-cat="${escapeHtml(r.cat)}">
          <span class="name">${catTagHtml(r.cat)}</span>
          <span class="analiza-bar"><i style="width:${share}%; background:${color};"></i></span>
          <span class="amt">${fmt(r.total)}</span>${diff}
        </button>${groups}</div>`;
    }).join('');
    el.querySelectorAll('.analiza-cat-head').forEach(btn=> btn.addEventListener('click', ()=>{
      const c = btn.dataset.cat;
      analizaState.open.has(c) ? analizaState.open.delete(c) : analizaState.open.add(c);
      renderAnalizaWhere(b);
    }));
    el.querySelectorAll('.analiza-more').forEach(btn=> btn.addEventListener('click', ()=>{
      const c = btn.dataset.cat;
      analizaState.showAll.has(c) ? analizaState.showAll.delete(c) : analizaState.showAll.add(c);
      renderAnalizaWhere(b);
    }));
  }
  function renderAnalizaTrend(b){
    const sel = document.getElementById('analizaTrendCat');
    const svg = document.getElementById('analizaTrendChart');
    const note = document.getElementById('analizaTrendNote');
    const cats = [...new Set(entries.filter(isPaidExpense).map(e=> e.category))];
    if(!cats.length){ sel.innerHTML = ''; svg.innerHTML = ''; note.textContent = t('Nema podataka.'); return; }
    if(!analizaState.cat || !cats.includes(analizaState.cat)) analizaState.cat = (b.rows[0] || {}).cat || cats[0];
    const cat = analizaState.cat;
    sel.innerHTML = cats.map(c=> `<option value="${escapeHtml(c)}"${c === cat ? ' selected' : ''} translate="no">${escapeHtml(c)}</option>`).join('');
    const cols = b.months.concat([b.month]);
    const vals = cols.map(m=> sumMonth(m, e=> isPaidExpense(e) && e.category === cat));
    const st = C.periodStats(entries, b.months, e=> e.category === cat);
    const W = 760, H = 200, padL = 10, padR = 10, padT = 15, padB = 30;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const max = Math.max(1, ...vals, st.avg);
    const slot = plotW / cols.length, bw = Math.min(46, slot * 0.6);
    const yFor = v => padT + plotH - v / max * plotH;
    const bars = cols.map((m, i)=>{
      const x = padL + i * slot + (slot - bw) / 2, y = yFor(vals[i]);
      const [yy, mo] = m.split('-');
      const label = new Date(yy, mo - 1, 1).toLocaleDateString(LOCALE, { month: 'short' }).replace('.', '');
      const cls = m === b.month ? 'analiza-bar-sel' : 'analiza-bar-col';
      return `<rect class="${cls}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${(padT + plotH - y).toFixed(1)}" rx="3"><title>${escapeHtml(monthYearLabelSr(m))}: ${fmt(vals[i])}</title></rect>
        <text x="${(x + bw / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="var(--ink-soft)">${label}</text>`;
    }).join('');
    const avgLine = st.enough ? `<line x1="${padL}" x2="${W - padR}" y1="${yFor(st.avg).toFixed(1)}" y2="${yFor(st.avg).toFixed(1)}" stroke="var(--ink-soft)" stroke-width="1.5" stroke-dasharray="5 4"/>` : '';
    svg.innerHTML = bars + avgLine;
    note.textContent = st.enough ? t('Isprekidana linija: prosek {0} ({1})', fmt(st.avg), analizaPeriodTxt(analizaState.n)) : t('Za poređenje su potrebna bar 2 meseca podataka');
  }
  // Popunjava zadatak 6.
  function renderAnalizaFixed(month){}
  function renderAnalizaSave(month){}
  function openAnaliza(section){
    analizaState.month = currentMonthKey();
    analizaState.n = 6;
    showScreen('analiza');
    renderScreen('analiza');
    if(section === 'save') setTimeout(()=> document.getElementById('analizaSave').scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  }
  document.getElementById('analizaMonth').addEventListener('change', e=>{ analizaState.month = e.target.value; renderAnaliza(); });
  document.getElementById('analizaTrendCat').addEventListener('change', e=>{ analizaState.cat = e.target.value; renderAnaliza(); });
  document.querySelectorAll('.analiza-period-btn').forEach(btn=> btn.addEventListener('click', ()=>{ analizaState.n = Number(btn.dataset.n); renderAnaliza(); }));
```

Pre ovoga proveri da postoje klase `.btn-link`, `.empty` i `.muted`: `grep -n "\.btn-link\|\.empty{\|\.muted" budzet-tracker.html`. Ako neka ne postoji, koristi najbližu postojeću klasu za tekstualno dugme ili prazno stanje (npr. klasu elementa `goalsEmpty`) ili je dodaj u CSS iz koraka 6.

- [ ] **Korak 6: Dodaj CSS.** Na kraj sloja `<style id="apple-theme">`, pre njegovog `</style>` (drugi `</style>` u fajlu, oko reda 1579), dodaj:

```css
/* ---- Analiza potrosnje ---- */
.analiza-controls{ display:flex; flex-wrap:wrap; gap:0.8em; align-items:center; }
.analiza-period-btn{ border:none; background:transparent; color:var(--ink); border-radius:6px; padding:4px 12px; font:500 12.5px/1.3 var(--font); cursor:default; }
.analiza-period-btn.active{ background:var(--card); font-weight:600; box-shadow:0 1px 3px rgba(0,0,0,0.12); }
[data-theme="dark"] .analiza-period-btn.active{ background:#636366; }
.analiza-summary{ margin-top:0.8em; font:600 15px/1.4 var(--font); color:var(--ink); }
.analiza-head{ display:flex; justify-content:space-between; align-items:baseline; gap:0.6em; flex-wrap:wrap; }
.analiza-head h2{ border-bottom:none; margin-bottom:0.4em; }
.analiza-cat{ border-bottom:1px solid var(--paper-line); }
.analiza-cat-head{ width:100%; display:grid; grid-template-columns:minmax(8em,1.2fr) 2fr auto 4.5em; gap:0.8em; align-items:center;
  background:none; border:none; padding:0.65em 0; text-align:left; color:var(--ink); font:inherit; cursor:default; }
.analiza-bar{ height:6px; border-radius:3px; background:var(--fill); overflow:hidden; }
.analiza-bar i{ display:block; height:100%; border-radius:3px; }
.analiza-cat-head .amt{ font-variant-numeric:tabular-nums; font-weight:600; text-align:right; }
.analiza-diff{ font-size:12px; font-weight:600; text-align:right; }
.analiza-diff.up{ color:var(--neg-text); } .analiza-diff.down{ color:var(--pos-text); }
.analiza-groups{ width:100%; margin:0 0 0.7em; font-size:13px; }
.analiza-groups td{ padding:0.25em 0; } .analiza-groups td.num{ text-align:right; font-variant-numeric:tabular-nums; }
.analiza-groups td.muted{ color:var(--ink-soft); padding-left:0.8em; }
.analiza-bar-col{ fill:var(--fill-strong); } .analiza-bar-sel{ fill:var(--ledger); }
@media (max-width: 600px){ .analiza-cat-head{ grid-template-columns:1fr auto; } .analiza-cat-head .analiza-bar{ grid-column:1 / -1; order:3; } }
```

Proveri da `--fill-strong`, `--card`, `--font`, `--neg-text` i `--pos-text` postoje u `:root` sloja `apple-theme` (red oko 838). Iz pregleda koda znamo da `--fill`, `--pos-text` i `--neg-text` postoje. Ako neka od ostalih ne postoji, zameni je najbližom koja postoji.

- [ ] **Korak 7: Pokreni testove i smoke.** Komanda: `cd /e/Vanja/app && npm test && npm run smoke -- "C:/Users/gejme/OneDrive/Belgeler/Knjiga budzeta/podaci.json"`. Očekuje se `SVE U REDU`, bez `greška u konzoli`.

- [ ] **Korak 8: Commit.**

```bash
cd /e/Vanja && git add budzet-tracker.html app/test/smoke-checks.js && git commit -m "Analiza: ekran, na šta ide novac, kroz vreme

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Zadatak 6: „Fiksno / promenljivo“ i „Gde mogu da uštedim“ sa klizačem

**Fajlovi:**
- Izmena `budzet-tracker.html`: prazne `renderAnalizaFixed` i `renderAnalizaSave` iz zadatka 5 dobijaju pravu implementaciju, plus handler za klizač i CSS
- Izmena `app/test/smoke-checks.js`

**Interfejsi:**
- Koristi:
  - `C.splitFixedVariable`, `C.savingsSummary`, `C.variableAverage`, `C.whatIf`
  - `fixedCategories` i `setCategoryFixed` iz zadatka 4
  - `analizaState` iz zadatka 5
  - `expenseCats`, `goals`, `recurring`, `monthsTxt`
- Pravi: `#analizaSaveBody` sa podsekcijama `.analiza-above`, `.analiza-small` i `.analiza-subs`, i `#analizaWhatIfResult`

- [ ] **Korak 1: Napiši smoke proveru koja pada.** Posle provera za Analizu iz zadatka 5 dodaj:

```js
    // Analiza: fiksno/promenljivo i usteda
    check('Analiza: traka fiksno/promenljivo', $('analizaFixedBar').textContent.trim().length > 0);
    const fixedBox = document.querySelector('#analizaFixedCats input[type="checkbox"]');
    check('Analiza: prekidači fiksno po kategoriji', !!fixedBox);
    if (fixedBox) {
      const cat = fixedBox.dataset.cat, was = fixedBox.checked;
      fixedBox.click(); await sleep(60);
      check('Analiza: prekidač fiksno se čuva', JSON.parse(localStorage.getItem('budzet-fiksne-kategorije-v1') || '[]').includes(cat) === !was);
      document.querySelector(`#analizaFixedCats input[data-cat="${CSS.escape(cat)}"]`).click(); await sleep(60);
      check('Analiza: prekidač fiksno vraćen', JSON.parse(localStorage.getItem('budzet-fiksne-kategorije-v1') || '[]').includes(cat) === was);
    }
    setVal('analizaWhatIf', '20'); await sleep(40);
    check('Analiza: klizač šta ako', /20%/.test($('analizaWhatIfLabel').textContent) && $('analizaWhatIfResult').textContent.trim().length > 0, $('analizaWhatIfResult').textContent);
```

Proveri da se prekidač stvarno čuva u podaci.json, a ne samo u memoriji. U desktop verziji `localStorage` je zamenjen skladištem koje piše u fajl, pa je čitanje iz `localStorage` ista stvar kao ponovno učitavanje fajla. Dodatno ponovno učitavanje zato nije potrebno.

- [ ] **Korak 2: Pokreni smoke i proveri da pada.** Komanda: ista smoke komanda kao ranije. Očekuje se `✗ Analiza: traka fiksno/promenljivo`.

- [ ] **Korak 3: Napiši implementaciju.** Zameni obe prazne funkcije:

```js
  function renderAnalizaFixed(month){
    const s = C.splitFixedVariable(entries, month, fixedCategories);
    const bar = document.getElementById('analizaFixedBar');
    bar.innerHTML = s.total <= 0 ? `<div class="empty">${t('Nema plaćenih troškova u ovom mesecu')}</div>` : `
      <div class="analiza-split"><i class="fixed" style="width:${s.fixedPct}%"></i><i class="variable" style="width:${100 - s.fixedPct}%"></i></div>
      <div class="analiza-split-legend">
        <span><i class="swatch fixed"></i>${t('Fiksno: {0} ({1}%)', fmt(s.fixed), s.fixedPct)}</span>
        <span><i class="swatch variable"></i>${t('Promenljivo: {0} ({1}%)', fmt(s.variable), 100 - s.fixedPct)}</span>
      </div>`;
    document.getElementById('analizaFixedCats').innerHTML = expenseCats.map(c=> `<label class="paid-checkbox-label">
        <input type="checkbox" data-cat="${escapeHtml(c)}"${fixedCategories.includes(c) ? ' checked' : ''}> ${catTagHtml(c)}</label>`).join('');
    document.querySelectorAll('#analizaFixedCats input[type="checkbox"]').forEach(box=> box.addEventListener('change', ()=>{
      setCategoryFixed(box.dataset.cat, box.checked);
      renderAnaliza();
    }));
  }
  function renderAnalizaSave(month){
    const s = C.savingsSummary(entries, recurring, fixedCategories, month, analizaState.n);
    const parts = [];
    if(s.above.length) parts.push(`<div class="analiza-above"><h3>${t('Iznad proseka')}</h3>${s.above.map(r=> `<div class="analiza-save-row">
        <span>${catTagHtml(r.cat)}</span><span class="muted">${t('{0} naspram proseka {1}', fmt(r.total), fmt(r.avg))}</span><b>+${fmt(r.diff)}</b></div>`).join('')}</div>`);
    if(s.small.length) parts.push(`<div class="analiza-small"><h3>${t('Sitni česti troškovi')}</h3>${s.small.map(g=> `<div class="analiza-save-row">
        <span${g.label === C.NO_DESC ? '' : ' translate="no"'}>${escapeHtml(g.label)}</span><span class="muted">${t('~{0}× mesečno · prosečno {1}', Math.round(g.perMonth), fmt(g.avgPurchase))}</span><b>${t('{0} mesečno · {1} godišnje', fmt(g.monthly), fmt(g.yearly))}</b></div>`).join('')}</div>`);
    if(s.subscriptions.length) parts.push(`<div class="analiza-subs"><h3>${t('Pretplate i ponavljajuće')}</h3>${s.subscriptions.map(r=> `<div class="analiza-save-row">
        <span translate="no">${escapeHtml(r.desc)}</span><span class="muted">${r.creep ? `<span class="analiza-creep">${t('↑ poskupelo {0}%', r.creepPct)}</span>` : ''}</span><b>${t('{0} godišnje', fmt(r.yearly))}</b></div>`).join('')}</div>`);
    if(!s.enough && !s.subscriptions.length) parts.push(`<div class="empty">${t('Za poređenje su potrebna bar 2 meseca podataka')}</div>`);
    else if(!parts.length) parts.push(`<div class="empty">${t('Nema ništa upadljivo — potrošnja je u okviru proseka.')}</div>`);
    document.getElementById('analizaSaveBody').innerHTML = parts.join('');
    renderAnalizaWhatIf(month);
  }
  function renderAnalizaWhatIf(month){
    const slider = document.getElementById('analizaWhatIf');
    slider.value = String(analizaState.whatIf);
    document.getElementById('analizaWhatIfLabel').innerHTML = t('Šta ako smanjim promenljive troškove za {0}', `<b>${analizaState.whatIf}%</b>`);
    const avg = C.variableAverage(entries, month, analizaState.n, fixedCategories);
    const w = C.whatIf(avg, analizaState.whatIf, goals, new Date());
    const res = document.getElementById('analizaWhatIfResult');
    if(avg <= 0){ res.textContent = t('Za poređenje su potrebna bar 2 meseca podataka'); return; }
    res.innerHTML = t('Ušteda: {0} mesečno · {1} godišnje', fmt(w.monthly), `<b>${fmt(w.yearly)}</b>`) +
      (w.goal ? `<div class="analiza-goal">${t('Cilj „{0}“ stižeš {1} ranije', escapeHtml(w.goal.name), monthsTxt(w.goal.sooner))}</div>` : '');
  }
  document.getElementById('analizaWhatIf').addEventListener('input', e=>{ analizaState.whatIf = Number(e.target.value) || 0; renderAnalizaWhatIf(analizaState.month); });
```

Iz komentara ukloni red `// Popunjava zadatak 6.`.

- [ ] **Korak 4: Dodaj CSS.** Na kraj bloka „Analiza potrošnje“ u `apple-theme` dodaj:

```css
.analiza-split{ display:flex; height:12px; border-radius:6px; overflow:hidden; background:var(--fill); }
.analiza-split .fixed, .swatch.fixed{ background:var(--ledger); }
.analiza-split .variable, .swatch.variable{ background:var(--warn); }
.analiza-split-legend{ display:flex; gap:1.4em; flex-wrap:wrap; margin:0.6em 0; font-size:13px; }
.analiza-fixed-cats{ display:flex; flex-wrap:wrap; gap:0.4em 1.4em; margin-top:0.6em; }
#screen-analiza h3{ font:600 13px/1.3 var(--font); color:var(--ink-soft); text-transform:none; margin:1em 0 0.3em; }
.analiza-save-row{ display:grid; grid-template-columns:minmax(7em,1fr) 1.4fr auto; gap:0.8em; align-items:baseline; padding:0.45em 0; border-bottom:1px solid var(--paper-line); font-size:13.5px; }
.analiza-save-row .muted{ color:var(--ink-soft); }
.analiza-save-row b{ font-variant-numeric:tabular-nums; text-align:right; }
.analiza-creep{ color:var(--warn-text); font-weight:600; }
.analiza-whatif{ margin-top:1.2em; padding-top:1em; border-top:1px solid var(--paper-line); }
.analiza-whatif input[type="range"]{ width:100%; margin:0.6em 0; }
.analiza-goal{ margin-top:0.3em; color:var(--pos-text); font-weight:600; }
@media (max-width: 600px){ .analiza-save-row{ grid-template-columns:1fr auto; } .analiza-save-row .muted{ grid-column:1 / -1; order:3; } }
```

- [ ] **Korak 5: Pokreni testove i smoke.** Komanda: `cd /e/Vanja/app && npm test && npm run smoke -- "C:/Users/gejme/OneDrive/Belgeler/Knjiga budzeta/podaci.json"`. Očekuje se `SVE U REDU`.

- [ ] **Korak 6: Commit.**

```bash
cd /e/Vanja && git add budzet-tracker.html app/test/smoke-checks.js && git commit -m "Analiza: fiksno/promenljivo, gde mogu da uštedim, klizač šta ako

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Zadatak 7: Veza sa Pregledom (panel Obrasci)

**Fajlovi:**
- Izmena `budzet-tracker.html`:
  - HTML za `patternsPanel` (red oko 1739)
  - `detectSpendingAnomalies` se briše (oko reda 4105-4121)
  - `renderPatterns` (oko reda 4139)
- Izmena `app/test/smoke-checks.js`

**Interfejsi:**
- Koristi: `C.savingsSummary(entries, recurring, fixedCategories, currentMonthKey(), 6)` i `openAnaliza('save')` iz zadatka 5
- Pravi:
  - element `#patternsAnalizaLink` (dugme), sa `data-total` = zaokružen `aboveTotal` ili `smallMonthly`
  - `data-kind` = `above` ili `small`

- [ ] **Korak 1: Napiši smoke proveru koja pada.** Posle provera iz zadatka 6 dodaj:

```js
    // Pregled → Analiza: isti iznos na oba mesta
    go('pregled'); await sleep(80);
    const S = window.BudzetCore.savingsSummary(entries(), JSON.parse(localStorage.getItem('budzet-ponavljajuce-v1') || '[]'),
      JSON.parse(localStorage.getItem('budzet-fiksne-kategorije-v1') || '[]'), monthKey(new Date()), 6);
    // Dugme uvek postoji u HTML-u; "ima reda" = dugme i panel su vidljivi
    const linkEl = $('patternsAnalizaLink');
    const link = linkEl && linkEl.style.display !== 'none' && $('patternsPanel').style.display !== 'none' ? linkEl : null;
    const expectLink = S.above.length > 0 || S.small.length > 0;
    check('Pregled: red za Analizu kad ima uštede', !!link === expectLink, JSON.stringify({ above: S.above.length, small: S.small.length }));
    if (link) {
      const want = Math.round(S.above.length ? S.aboveTotal : S.smallMonthly);
      check('Pregled i Analiza: isti iznos', Number(link.dataset.total) === want, link.dataset.total + ' vs ' + want);
      link.click(); await sleep(120);
      check('Pregled: red vodi na Analizu', $('screen-analiza').classList.contains('active') && $('analizaSummary').dataset.n === '6');
      go('pregled');
    }
```

- [ ] **Korak 2: Pokreni smoke i proveri da pada.** Ako pravi podaci imaju uštedu, očekuje se `✗ Pregled: red za Analizu kad ima uštede`. Ako nemaju, ta provera prolazi i pre izmene (očekivano je „nema reda“). Tada je jedina provera koja pokazuje da izmena radi jedinični test iz zadatka 3 (`savingsSummary`) i ručni snimak iz zadatka 8. To zabeleži u izveštaju.

- [ ] **Korak 3: Napiši implementaciju.**

(a) U HTML-u `patternsPanel`, posle `<div id="patternsList"></div>`, dodaj:

```html
      <button class="analiza-link" id="patternsAnalizaLink" style="display:none;"></button>
```

(b) Obriši celu funkciju `detectSpendingAnomalies` sa njena dva reda komentara iznad (`// Anomalija: ova mesec u kategoriji ...`). Pre toga proveri da nema drugih poziva: `grep -n "detectSpendingAnomalies" budzet-tracker.html`. Jedini poziv treba da bude u `renderPatterns`.

(c) U `renderPatterns`:
- zameni `const anomalies = detectSpendingAnomalies();` sa `const S = C.savingsSummary(entries, recurring, fixedCategories, currentMonthKey(), 6);`
- uslov za skrivanje panela zameni sa `if(creep.length === 0 && S.above.length === 0 && S.small.length === 0 && forecast == null){ panel.style.display = 'none'; return; }`
- zameni `anomalies.forEach(...)` blok ovim:

```js
    S.above.forEach(({cat,total,avg,pct})=>{
      rows.push({level:'caution', icon:'⚠', txt: t('Kategorija <b>{0}</b> je ovog meseca {1}% iznad proseka poslednjih 6 meseci ({2} naspram proseka {3}).', escapeHtml(cat), pct, fmt(total), fmt(Math.round(avg)))});
    });
```

Na kraj funkcije, posle reda koji popunjava `patternsList`, dodaj:

```js
    const link = document.getElementById('patternsAnalizaLink');
    if(S.above.length){
      link.dataset.kind = 'above'; link.dataset.total = String(Math.round(S.aboveTotal));
      link.textContent = (S.above.length === 1 ? t('1 kategorija iznad proseka') : t('Kategorija iznad proseka: {0}', S.above.length)) + ' · ' + t('moguća ušteda ~{0} →', fmt(S.aboveTotal));
      link.style.display = '';
    } else if(S.small.length){
      link.dataset.kind = 'small'; link.dataset.total = String(Math.round(S.smallMonthly));
      link.textContent = t('Sitni troškovi: ~{0} mesečno →', fmt(S.smallMonthly));
      link.style.display = '';
    } else {
      link.style.display = 'none'; delete link.dataset.total;
    }
```

Handler dodaj jednom, na nivou skripte, odmah posle funkcije `renderPatterns`:

```js
  document.getElementById('patternsAnalizaLink').addEventListener('click', ()=> openAnaliza('save'));
```

(d) Proveri da je stara funkcija potpuno uklonjena: `grep -n "detectSpendingAnomalies" budzet-tracker.html`. Očekuje se da nema pogodaka.

(e) CSS u bloku „Analiza potrošnje“:

```css
.analiza-link{ display:block; width:100%; margin-top:0.8em; padding:0.6em 0.8em; border:none; border-radius:8px; background:var(--fill); color:var(--ledger); font:600 13.5px/1.3 var(--font); text-align:left; cursor:default; }
.analiza-link:hover{ background:var(--fill-strong); }
```

- [ ] **Korak 4: Pokreni testove i smoke.** Komanda: `cd /e/Vanja/app && npm test && npm run smoke -- "C:/Users/gejme/OneDrive/Belgeler/Knjiga budzeta/podaci.json"`. Očekuje se `SVE U REDU`.

- [ ] **Korak 5: Commit.**

```bash
cd /e/Vanja && git add budzet-tracker.html app/test/smoke-checks.js && git commit -m "Pregled: red za Analizu, anomalije preko zajedničke funkcije

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Zadatak 8: Engleski prevod, množina „meseca“ i završna provera

**Fajlovi:**
- Izmena `i18n.js`: novi unosi u objekat `EN`
- Izmena `budzet-tracker.html:2529`: `monthsTxt` sa ispravnom srpskom množinom
- Privremeni fajlovi (ne idu u repozitorijum) u scratchpad folderu sesije: `en-check.js`, `en-run.js`

**Interfejsi:**
- Koristi: sav tekst iz zadataka 4–7

- [ ] **Korak 1: Ispravi množinu u `monthsTxt`.** Trenutno piše „2 meseci“. Zameni red:

```js
  const monthsTxt = n => t(n === 1 ? '{0} mesec' : '{0} meseci', n);
```

ovim:

```js
  const monthsTxt = n => t(n % 10 === 1 && n % 100 !== 11 ? '{0} mesec' : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) ? '{0} meseca' : '{0} meseci', n);
```

- [ ] **Korak 2: Dodaj engleske unose.** U `i18n.js`, u objektu `EN`, dodaj novu grupu posle grupe `// ---- Podmeni ----`. Pre dodavanja proveri da neki ključ već ne postoji (`grep -n "'6 meseci'\|'12 meseci'\|'{0} meseca'" i18n.js`). Dupli ključ u objektu nije greška, ali kasniji pobeđuje, pa ga izbegni.

```js
    // ---- Analiza potrosnje ----
    'Na šta ide novac': 'Where the money goes', 'Kroz vreme': 'Over time', 'Fiksno / promenljivo': 'Fixed / variable',
    'Gde mogu da uštedim': 'Where I can save', '3 meseca': '3 months', '6 meseci': '6 months', '12 meseci': '12 months',
    'Troškovi iz ponavljajućih stavki su uvek fiksni.': 'Expenses from recurring items are always fixed.',
    'Nema plaćenih troškova u ovom mesecu': 'No paid expenses this month',
    'Za poređenje su potrebna bar 2 meseca podataka': 'At least 2 months of data are needed for comparison',
    '(bez opisa)': '(no description)', 'prikaži sve': 'show all', 'prikaži manje': 'show less',
    'Iznad proseka': 'Above average', 'Sitni česti troškovi': 'Small frequent expenses', 'Pretplate i ponavljajuće': 'Subscriptions & recurring',
    'Nema ništa upadljivo — potrošnja je u okviru proseka.': 'Nothing stands out — spending is within average.',
    '{0}: {1}': '{0}: {1}', '{0}: {1} · prosek ({2}) {3} · {4}': '{0}: {1} · average ({2}) {3} · {4}',
    '{0}×': '{0}×', 'prosečno {0}': 'avg. {0}', 'Isprekidana linija: prosek {0} ({1})': 'Dashed line: average {0} ({1})',
    'Fiksno: {0} ({1}%)': 'Fixed: {0} ({1}%)', 'Promenljivo: {0} ({1}%)': 'Variable: {0} ({1}%)',
    '{0} naspram proseka {1}': '{0} vs. average {1}', '~{0}× mesečno · prosečno {1}': '~{0}× a month · avg. {1}',
    '{0} mesečno · {1} godišnje': '{0} a month · {1} a year', '{0} godišnje': '{0} a year', '↑ poskupelo {0}%': '↑ up {0}%',
    'Šta ako smanjim promenljive troškove za {0}': 'What if I cut variable expenses by {0}',
    'Ušteda: {0} mesečno · {1} godišnje': 'Savings: {0} a month · {1} a year', 'Cilj „{0}“ stižeš {1} ranije': 'You reach “{0}” {1} sooner',
    '1 kategorija iznad proseka': '1 category above average', 'Kategorija iznad proseka: {0}': 'Categories above average: {0}',
    'moguća ušteda ~{0} →': 'possible savings ~{0} →', 'Sitni troškovi: ~{0} mesečno →': 'Small expenses: ~{0} a month →',
    'Kategorija <b>{0}</b> je ovog meseca {1}% iznad proseka poslednjih 6 meseci ({2} naspram proseka {3}).': '<b>{0}</b> is {1}% above its 6-month average this month ({2} vs. average {3}).',
    '{0} meseca': '{0} months', 'Period': 'Period',
```

`'Analiza'` već postoji (`'Insights'`), a `'Mesec'` i `'Kategorija'` takođe. Ne dodaji ih ponovo. Stari engleski unos za staru poruku o anomaliji („... poslednja 3 meseca ...“) sada više nije potreban, pa ga obriši iz `i18n.js` ako postoji (`grep -n "poslednja 3 meseca (" i18n.js`).

- [ ] **Korak 3: Pokreni testove i smoke.** Komanda: `cd /e/Vanja/app && npm test && npm run smoke -- "C:/Users/gejme/OneDrive/Belgeler/Knjiga budzeta/podaci.json"`. Očekuje se da `npm test` prođe i da smoke završi sa `SVE U REDU`.

- [ ] **Korak 4: Proveri engleski i napravi snimke ekrana.**

Neka `$SP` bude scratchpad folder sesije. Napravi `$SP/en-check.js`. Skripta otvara Analizu i vraća vidljivi tekst:

```js
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  if (document.getElementById('onboardingOverlay').classList.contains('show')) document.getElementById('onboardingSkipBtn').click();
  window.__showScreen('analiza'); await sleep(900);
  const text = document.getElementById('screen-analiza').innerText;
  return { ok: true, passed: [], failures: [], text };
})();
```

Napravi i `$SP/en-run.js`. On pokreće Electron kao `app/test/smoke.js`, ali uz `settings.json` sa engleskim jezikom i snimkom ekrana:

```js
const { spawnSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const lang = process.argv[2] || 'en', shot = process.argv[3];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'knjiga-en-'));
const dataDir = path.join(tmp, 'data'); fs.mkdirSync(dataDir);
fs.copyFileSync('C:/Users/gejme/OneDrive/Belgeler/Knjiga budzeta/podaci.json', path.join(dataDir, 'podaci.json'));
const ud = path.join(tmp, 'userdata'); fs.mkdirSync(ud);
fs.writeFileSync(path.join(ud, 'settings.json'), JSON.stringify({ lang }));
const env = { ...process.env, KNJIGA_TEST: '1', KNJIGA_DATA_DIR: dataDir, KNJIGA_BACKUP_DIR: path.join(tmp, 'backup'),
  KNJIGA_TEST_SCRIPT: path.join(__dirname, 'en-check.js'), KNJIGA_TEST_SHOT: shot, KNJIGA_TEST_SIZE: '1280,1600' };
delete env.ELECTRON_RUN_AS_NODE;
const appDir = 'E:/Vanja/app';
const electron = require(path.join(appDir, 'node_modules', 'electron'));
const r = spawnSync(electron, ['.', `--user-data-dir=${ud}`], { cwd: appDir, env, encoding: 'utf8', timeout: 120000 });
const line = (r.stdout || '').split('\n').find(l => l.startsWith('SMOKE_RESULT '));
console.log(line ? JSON.parse(line.slice(13)).text : r.stdout + r.stderr);
```

Pokreni (posle `cd /e/Vanja/app && npm run copy-web`):
- `node "$SP/en-run.js" en "$SP/analiza-en.png"`
- `node "$SP/en-run.js" sr "$SP/analiza-sr.png"`

Očekuje se da engleski tekst **nema srpskih reči** osim imena kategorija i opisa (korisnički podaci). Ako se pojavi neprevedena srpska rečenica, dodaj njen unos u `i18n.js` i ponovi. Pogledaj oba PNG-a alatom Read. Proveri da ništa ne izlazi iz okvira, da se ▲/▼ i trake vide i da se na srpskom snimku za oko minut vide 2–3 konkretne uštede sa iznosima.

- [ ] **Korak 5: Commit.**

```bash
cd /e/Vanja && git add i18n.js budzet-tracker.html && git commit -m "Analiza: engleski prevod, ispravna množina meseci

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Korak 6: Izveštaj korisniku.** Na srpskom, kratko:
  - šta je urađeno
  - rezultat `npm test` i smoke-a (broj provera)
  - snimci ekrana
  - pitanje da li da se objavi verzija 1.10.0

Objavljivanje se radi posebno, tek kad korisnik kaže da: verzija u `app/package.json`, `app/release-notes/1.10.0.md`, `npm run release`, pa `npm run push-source`.
