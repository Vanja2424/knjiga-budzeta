# Pitaj svoj budžet (v1.26.0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Izveštaji → „Pitaj“. AI dobija pitanje i sam pravi plan proračuna. Aplikacija proračune izvodi lokalno, a AI od tih rezultata piše odgovor.

**Architecture:**
- Alati, provera plana i uputstva žive u `budzet-core.js`, sa testovima.
- Stranica dva puta poziva `desktop.bills.read` (plan, pa odgovor). Hook `__fakeAsk(req, step)` omogućava testiranje bez pravog AI-ja.
- Glavni proces se ne menja.

**Tech Stack:** vanilla JS, node:test, Electron smoke.

**Spec:** `docs/superpowers/specs/2026-10-01-pitaj-budzet-design.md`

## Global Constraints

- Plan sme da ima najviše 4 poziva, a svaki poziv najviše 24 meseca. `top.n` je najviše 10. Meseci moraju biti unutar raspona za koji postoje podaci.
- Prvi zahtev ne sme da sadrži nijedan iznos ni opis stavke.
- Odgovor se prikazuje preko `textContent`, nikad preko innerHTML-a sa tekstom koji je vratio AI.
- Nove stringove proveriti sa `i18nadd.js --check`. Pre pokretanja stranice uraditi `copy-web`. Skripte pisati Write alatom.
- Verzija je 1.26.0.

## Review Focus

1. AI vrati nepostojeći alat, mesece van raspona ili `n: 50`. Očekuje se da se proračun skrati ili preskoči, uz napomenu, i da nema izuzetka. Test je u Task 1.
2. Pitanje o mesecu koji nema stavki. Rezultat sadrži nule, a ne grešku. Test je u Task 1.
3. Rashod raspodeljen na 3 meseca i neplaćeni rashod. Zbirovi treba da se poklope sa Pregledom. Test je u Task 1.
4. Dupli klik na „Pitaj“ šalje samo jedan upit. Test je u Task 2.
5. AI odgovor sadrži HTML. Treba da se prikaže kao običan tekst. Test je u Task 2.

---

### Task 1: Core — alati, plan, uputstva

**Files:** `budzet-core.js` (nova sekcija pre „Provera Excel fajla“), `app/test/core.test.js`

**Produces:**
- `C.ASK_TOOLS` (imena alata)
- `C.askPlanPrompt({question, today, first, last, expenseCats, incomeCats}) → string`
- `C.cleanAskPlan(raw, {first, last, categories}) → { calls: [...], offTopic, notes: [] } | null`
- `C.runAskTools(calls, {entries, recurring}) → [{tool, args, result}]`
- `C.askAnswerPrompt({question, results, today}) → string`

- [ ] **Step 1: Failing tests**

```js
test('pitaj: alati nad stavkama (raspodela, neplaceno), plan, uputstva', () => {
  const entries = [
    { id: '1', type: 'income', amount: 100000, date: '2026-08-05', category: 'Plata', desc: 'Plata' },
    { id: '2', type: 'expense', amount: 30000, date: '2026-08-10', category: 'Hrana', desc: 'Maxi' },
    { id: '3', type: 'expense', amount: 9000, date: '2026-08-01', category: 'Osiguranje', desc: 'Kasko', spreadMonths: 3 },
    { id: '4', type: 'expense', amount: 5000, date: '2026-09-02', category: 'Hrana', desc: 'Lidl', paid: false },
    { id: '5', type: 'expense', amount: 42000, date: '2026-09-03', category: 'Hrana', desc: 'Nabavka velika' },
    { id: '6', type: 'expense', amount: 1200, date: '2026-09-04', category: 'Zabava', desc: 'Bioskop' }
  ];
  const recurring = [{ id: 'r1', type: 'expense', desc: 'Netflix', amount: 1200, category: 'Zabava', frequency: 'monthly' }, { id: 'r2', type: 'income', desc: 'Plata', amount: 100000, frequency: 'monthly' }];
  const run = calls => C.runAskTools(calls, { entries, recurring });
  const ms = run([{ tool: 'monthSummary', months: ['2026-08', '2026-09', '2026-10'] }])[0].result;
  assert.deepEqual(ms.map(m => [m.month, m.income, m.expense]), [['2026-08', 100000, 33000], ['2026-09', 0, 46200], ['2026-10', 0, 3000]]);
  const bc = run([{ tool: 'byCategory', months: ['2026-09'] }])[0].result;
  assert.deepEqual(bc.map(r => [r.category, r.total]), [['Hrana', 42000], ['Osiguranje', 3000], ['Zabava', 1200]]);
  const cmp = run([{ tool: 'compare', months: ['2026-08'], monthsB: ['2026-09'] }])[0].result;
  assert.deepEqual(cmp[0], { category: 'Hrana', a: 30000, b: 42000, diff: 12000, pct: 40 });
  const top = run([{ tool: 'top', months: ['2026-08', '2026-09'], n: 2 }])[0].result;
  assert.deepEqual(top, [{ desc: 'Nabavka velika', amount: 42000, category: 'Hrana', month: '2026-09' }, { desc: 'Maxi', amount: 30000, category: 'Hrana', month: '2026-08' }]);
  assert.deepEqual(run([{ tool: 'average', months: ['2026-08', '2026-09'], category: 'Hrana' }])[0].result, [{ category: 'Hrana', avgPerMonth: 36000 }]);
  const rec = run([{ tool: 'recurring' }])[0].result;
  assert.deepEqual([rec.monthly, rec.yearly, rec.items.length], [1200, 14400, 1]);
  assert.deepEqual(run([{ tool: 'monthSummary', months: ['2026-07'] }])[0].result, [{ month: '2026-07', income: 0, expense: 0, net: 0 }]);

  const ctx = { first: '2026-08', last: '2026-10', categories: ['Hrana', 'Zabava', 'Osiguranje', 'Plata'] };
  const plan = C.cleanAskPlan('```json\n{"calls":[{"tool":"byCategory","months":["2026-09","2025-01","x"]},{"tool":"hack"},{"tool":"top","months":["2026-09"],"n":50,"category":"hrana"},{"tool":"compare","months":["2026-08"],"monthsB":["2026-09"]},{"tool":"average","months":["2026-08"]},{"tool":"recurring"}],"offTopic":false}\n```', ctx);
  assert.equal(plan.calls.length, 4);
  assert.deepEqual(plan.calls[0], { tool: 'byCategory', months: ['2026-09'], type: 'expense' });
  assert.deepEqual(plan.calls[1], { tool: 'top', months: ['2026-09'], n: 10, category: 'Hrana' });
  assert.ok(plan.notes.length >= 2);
  assert.equal(C.cleanAskPlan('{"calls":[],"offTopic":true}', ctx).offTopic, true);
  assert.equal(C.cleanAskPlan('nista', ctx), null);
  const long = C.cleanAskPlan(JSON.stringify({ calls: [{ tool: 'monthSummary', months: Array.from({ length: 40 }, (_, i) => C.addMonths('2024-01', i)) }] }), { first: '2024-01', last: '2027-12', categories: [] });
  assert.equal(long.calls[0].months.length, 24);

  const pp = C.askPlanPrompt({ question: 'zasto je septembar skuplji?', today: '2026-10-01', first: '2026-08', last: '2026-10', expenseCats: ['Hrana'], incomeCats: ['Plata'] });
  assert.match(pp, /zasto je septembar skuplji/);
  assert.match(pp, /monthSummary/);
  assert.ok(!/42000|30000|Maxi/.test(pp));
  const ap = C.askAnswerPrompt({ question: 'q', today: '2026-10-01', results: [{ tool: 'byCategory', args: {}, result: bc }] });
  assert.match(ap, /42000/);
  assert.match(ap, /ne izmišljaj/i);
});
```

- [ ] **Step 2:** Pokreni testove. Očekivano: FAIL.
- [ ] **Step 3: Implement**

```js
  // ---------- Pitaj svoj budzet: AI bira proracune, aplikacija racuna lokalno, AI pise odgovor ----------
  const ASK_TOOLS = ['monthSummary', 'byCategory', 'compare', 'top', 'average', 'recurring'];
  const ASK_MAX_CALLS = 4, ASK_MAX_MONTHS = 24, ASK_MAX_TOP = 10;
  function askPlanPrompt(o){
    return ['Ti si pomoćnik za lični budžet (Srbija, RSD). Ne vidiš podatke — biraš proračune koje će aplikacija uraditi.',
      'Danas je ' + o.today + '. Podaci postoje od ' + o.first + ' do ' + o.last + '.',
      'Kategorije rashoda: ' + (o.expenseCats || []).map(c => '"' + c + '"').join(', ') + '. Kategorije prihoda: ' + (o.incomeCats || []).map(c => '"' + c + '"').join(', ') + '.',
      'Proračuni (najviše ' + ASK_MAX_CALLS + ', meseci kao "YYYY-MM", najviše ' + ASK_MAX_MONTHS + ' po proračunu):',
      '- monthSummary {months}: prihodi, rashodi, saldo po mesecu',
      '- byCategory {months, type:"expense"|"income"}: zbir po kategoriji',
      '- compare {months, monthsB}: poređenje dva perioda po kategoriji',
      '- top {months, category?, n≤10}: najveći pojedinačni rashodi (opis, iznos)',
      '- average {months, category?}: prosek po mesecu',
      '- recurring {}: ponavljajući rashodi i pretplate',
      'Vrati SAMO JSON: {"calls":[{"tool":"","months":[],"monthsB":[],"category":"","type":"expense","n":5}],"offTopic":false}',
      'Ako pitanje nije o budžetu korisnika, vrati {"calls":[],"offTopic":true}.',
      'Pitanje: ' + String(o.question || '').slice(0, 500)].join('\n');
  }
  function cleanAskPlan(raw, ctx){
    const o = extractJson(raw);
    if(!o) return null;
    const notes = [];
    const okMonth = m => /^\d{4}-(0[1-9]|1[0-2])$/.test(m) && m >= ctx.first && m <= ctx.last;
    const months = (arr, label) => {
      const list = (Array.isArray(arr) ? arr : []).map(String);
      const good = [...new Set(list.filter(okMonth))].sort();
      if(good.length < list.length) notes.push(label + ': preskočeni meseci van podataka');
      if(good.length > ASK_MAX_MONTHS){ notes.push(label + ': skraćeno na ' + ASK_MAX_MONTHS + ' meseca'); return good.slice(-ASK_MAX_MONTHS); }
      return good;
    };
    const cat = c => (ctx.categories || []).find(x => foldText(x) === foldText(c)) || '';
    const calls = [];
    (Array.isArray(o.calls) ? o.calls : []).forEach(c => {
      if(!c || !ASK_TOOLS.includes(c.tool)){ notes.push('nepoznat proračun preskočen'); return; }
      if(calls.length >= ASK_MAX_CALLS){ notes.push('više od ' + ASK_MAX_CALLS + ' proračuna — ostali preskočeni'); return; }
      if(c.tool === 'recurring'){ calls.push({ tool: 'recurring' }); return; }
      const m = months(c.months, c.tool);
      if(!m.length){ notes.push(c.tool + ': nema meseci sa podacima'); return; }
      const out = { tool: c.tool, months: m };
      if(c.tool === 'byCategory') out.type = c.type === 'income' ? 'income' : 'expense';
      if(c.tool === 'compare'){ const b = months(c.monthsB, 'compare'); if(!b.length){ notes.push('compare: nema drugog perioda'); return; } out.monthsB = b; }
      if(c.tool === 'top'){ const n = parseInt(c.n, 10); out.n = n > 0 ? Math.min(n, ASK_MAX_TOP) : 5; }
      if((c.tool === 'top' || c.tool === 'average') && cat(c.category)) out.category = cat(c.category);
      calls.push(out);
    });
    return { calls, offTopic: !!o.offTopic, notes };
  }
  function runAskTools(calls, data){
    const entries = (data && data.entries) || [], recurring = (data && data.recurring) || [];
    const sumBy = (months, type) => {
      const map = new Map();
      entries.forEach(e => {
        if(e.type !== type || (type === 'expense' && !isPaidExp(e))) return;
        months.forEach(m => { const s = shareInMonth(e, m); if(s){ const r = map.get(e.category) || { category: e.category, total: 0, perMonth: {} }; r.total += s; r.perMonth[m] = round2((r.perMonth[m] || 0) + s); map.set(e.category, r); } });
      });
      return [...map.values()].map(r => Object.assign(r, { total: round2(r.total) })).sort((a, b) => b.total - a.total);
    };
    return (calls || []).map(c => {
      let result;
      if(c.tool === 'monthSummary') result = c.months.map(m => { const t = monthTotals(entries, m); return { month: m, income: t.income, expense: t.expense, net: t.net }; });
      else if(c.tool === 'byCategory') result = sumBy(c.months, c.type || 'expense');
      else if(c.tool === 'compare'){
        const a = new Map(sumBy(c.months, 'expense').map(r => [r.category, r.total])), b = new Map(sumBy(c.monthsB, 'expense').map(r => [r.category, r.total]));
        result = [...new Set([...a.keys(), ...b.keys()])].map(k => { const x = a.get(k) || 0, y = b.get(k) || 0; return { category: k, a: x, b: y, diff: round2(y - x), pct: x > 0 ? Math.round((y - x) / x * 100) : null }; })
          .sort((p, q) => Math.abs(q.diff) - Math.abs(p.diff)).slice(0, 15);
      }
      else if(c.tool === 'top') result = entries.filter(e => isPaidExp(e) && c.months.includes(String(e.date).slice(0, 7)) && (!c.category || e.category === c.category))
        .sort((p, q) => q.amount - p.amount).slice(0, c.n || 5).map(e => ({ desc: String(e.desc || '').slice(0, 60), amount: e.amount, category: e.category, month: String(e.date).slice(0, 7) }));
      else if(c.tool === 'average') result = sumBy(c.months, 'expense').filter(r => !c.category || r.category === c.category).map(r => ({ category: r.category, avgPerMonth: round2(r.total / c.months.length) }));
      else if(c.tool === 'recurring'){
        const items = recurring.filter(r => r.type !== 'income').map(r => ({ desc: String(r.desc || '').slice(0, 60), amount: Number(r.amount) || 0, frequency: r.frequency || 'monthly', category: r.category }));
        const monthly = round2(recurring.filter(r => r.type !== 'income').reduce((s, r) => s + monthlyEquivalent(r), 0));
        result = { monthly, yearly: round2(monthly * 12), items };
      }
      return { tool: c.tool, args: Object.assign({}, c), result };
    });
  }
  function askAnswerPrompt(o){
    return ['Ti si pomoćnik za lični budžet. Odgovori na srpskom (latinica), kratko (do 8 rečenica), na osnovu REZULTATA ispod.',
      'Koristi samo brojeve iz rezultata; ne izmišljaj brojeve ni stavke. Iznose piši kao "12.345 RSD". Ako rezultati ne odgovaraju na pitanje, reci to.',
      'Danas je ' + o.today + '.',
      'Pitanje: ' + String(o.question || '').slice(0, 500),
      'Rezultati (JSON): ' + JSON.stringify(o.results || [])].join('\n');
  }
```

Izvoz: `ASK_TOOLS, askPlanPrompt, cleanAskPlan, runAskTools, askAnswerPrompt,`

Provera: `monthlyEquivalent` za mesečnu stavku vraća iznos. Ako drugačije računa kvartalne/godišnje, test koristi samo mesečnu. Proveri da je `monthTotals` definisan pre nove sekcije (jeste, oko reda 766).

- [ ] **Step 4:** PASS. **Step 5:** Commit.

### Task 2: Stranica — ekran „Pitaj“

**Files:** `budzet-tracker.html`, `i18n.js`, `app/test/smoke-checks.js`

- [ ] **Step 1: Failing smoke:**
  - podkartica `pitaj` postoji;
  - `__fakeAsk` za korak 1 vraća plan `[{tool:'byCategory', months:[tekući mesec]}]`, a za korak 2 tekst `'<b>Odgovor</b> 123'`;
  - posle „Pitaj“ prvi zahtev (zabeležen u lažnom AI-ju) ne sadrži cifre iznosa iz stavki;
  - odgovor je prikazan kao tekst, sa vidljivim `<b>` (bez elementa `<b>` u DOM-u);
  - „Šta je poslato AI-ju“ sadrži oba zahteva;
  - `offTopic` daje poruku bez drugog poziva;
  - greška u koraku 1 daje poruku;
  - dva brza klika daju jedan upit (brojač poziva za korak 1 je 1).
- [ ] **Step 2: Implementacija.**
  - `SCREEN_GROUPS.izvestaji` dobija `['pitaj', 'Pitaj']` posle Analize, a `SCREEN_RENDER.pitaj` je `renderAsk`.
  - HTML ima panel sa poljem `#askInput`, dugmetom `#askBtn`, predlozima `.ask-suggest` i listom `#askList`.
  - `askBudget(q)`:
    1. postavi `busy` i proveri dostupnost AI-ja;
    2. odredi raspon meseci (prvi i poslednji mesec sa stavkama);
    3. `req1 = {images:[], text:'', prompt: C.askPlanPrompt(...)}`, pa poziv;
    4. `C.cleanAskPlan`; ako je `offTopic`, prikaži poruku;
    5. `C.runAskTools`;
    6. `req2` preko `C.askAnswerPrompt`, pa poziv;
    7. dodaj karticu na vrh `#askList`: pitanje, odgovor (`textContent`, uz poštovanje novih redova preko `white-space: pre-wrap`), `<details>` „Šta je poslato AI-ju“ sa oba prompta kao `textContent` i napomene.
  - Tekst o privatnosti u Podešavanjima dobija i rečenicu o „Pitaj“.
- [ ] **Step 3:** Smoke → ✓. EN. Commit.

### Task 3: Završno

- [ ] Pravi Groq poziv sa izmišljenim stavkama: pitanje „Zašto je septembar skuplji od avgusta?“. Proveri da plan ima smisla i da odgovor koristi brojeve iz rezultata.
- [ ] EN ispis i snimak ekrana.
- [ ] Nezavisan pregled, pa popravke uz test koji prvo pada.
- [ ] Release notes 1.26.0, verzija, testovi, spajanje, push-source, release, memorija.
