# Razgovor sa botom i naredbe (v1.35) — plan izrade

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Telegram bot odgovara na pitanja o budžetu i izvršava naredbe rečima uz potvrdu dugmetom; unos troška ide preko `/nov`.

**Architecture:** Čista logika (namera, poklapanje imena, plan AI-ja, čišćenje naredbe, proračuni) je u `budzet-core.js` sa unit testovima. Stranica (`budzet-tracker.html`) usmerava poruke, pravi predloge i izvršava ih postojećim funkcijama aplikacije. `app/telegram.js` samo registruje meni komandi.

**Tech Stack:** vanilla JS, Electron 44, node:test, smoke kroz `test/smoke.js` (pravi Electron).

**Spec:** `docs/superpowers/specs/2026-10-06-bot-razgovor-design.md`

## Global Constraints

- Izvorni fajlovi su u `E:\Vanja` (`budzet-core.js`, `budzet-tracker.html`, `i18n.js`); `npm run copy-web` (u `E:\Vanja\app`) ih kopira u `app/` pre testova/smoke-a.
- Svaki novi tekst za korisnika ide kroz `t(...)` i dobija engleski prevod u `i18n.js`; unit test proverava da je svaki ključ rečnika upotrebljen.
- AI nikad ne dobija imena ponavljajućih stavki, dugova, ciljeva ni spiska Nabavke; u prvom koraku ni iznose.
- Potvrda važi 10 minuta; kontekst razgovora: do 4 razmene, 15 minuta; „Poništi“ 24 h.
- Iznos naredbe: broj > 0 i < 100.000.000.
- Test kuke stranice samo pod `IS_TEST`.
- Smoke: `node test/smoke.js` iz `E:\Vanja\app` (bez podataka) mora dati `SVE U REDU`.

## Review Focus

1. Dupli klik na „✓ Potvrdi“ (Telegram ponovo šalje callback) — druga potvrda ne sme ponoviti radnju → „Već urađeno“. Test u Task 6.
2. Stavka plaćena u aplikaciji između predloga i potvrde → „Već urađeno“, ništa se ne menja. Test u Task 6.
3. Uplata na dug veća od ostatka → upisuje se samo ostatak. Test u Task 6.
4. Poništi posle izmene poslednjeg unosa vraća stari iznos (ne briše unos). Test u Task 6.
5. Pitanje dok AI nije podešen ili vrati grešku → poruka sa podsetnikom na `/nov`, bez izuzetka. Test u Task 5.

---

### Task 1: Namera poruke i dugmad (core)

**Files:**
- Modify: `budzet-core.js` (`telegramIntent` ~2004, `parseTelegramCallback` ~2047)
- Test: `app/test/core.test.js` (~1828)

**Interfaces:**
- Produces: `C.telegramIntent(text)` → `{kind:'empty'} | {kind:'question'} | {kind:'command', command:'nov', rest:string} | {kind:'command', command:'pomoc'|'ponisti'|'nepoznata'}`; `C.parseTelegramCallback(data)` prihvata i akcije `c`, `n`, `h` (`h:<id>:<idx>`).

- [ ] **Step 1: Test (zameni red 1833 i dodaj)**

```js
  assert.deepEqual(C.telegramIntent('kafa 250'), { kind: 'question' });
  assert.deepEqual(C.telegramIntent('/nov kafa 250'), { kind: 'command', command: 'nov', rest: 'kafa 250' });
  assert.deepEqual(C.telegramIntent('/nov@knjiga_bot +plata 1000'), { kind: 'command', command: 'nov', rest: '+plata 1000' });
  assert.deepEqual(C.telegramIntent('/nov'), { kind: 'command', command: 'nov', rest: '' });
  assert.deepEqual(C.parseTelegramCallback('c:abc123'), { action: 'c', id: 'abc123', arg: '' });
  assert.deepEqual(C.parseTelegramCallback('n:abc123'), { action: 'n', id: 'abc123', arg: '' });
  assert.deepEqual(C.parseTelegramCallback('h:abc123:2'), { action: 'h', id: 'abc123', arg: '2' });
```

- [ ] **Step 2:** `node --test test/core.test.js` → FAIL (`entry` umesto `question`).

- [ ] **Step 3: Implementacija**

```js
  function telegramIntent(text){
    const s = String(text || '').trim();
    if(!s) return { kind: 'empty' };
    if(s[0] === '/'){
      const m = /^\/([^\s@]+)(?:@\S+)?\s*([\s\S]*)$/.exec(s);
      const cmd = foldText(m ? m[1] : '');
      if(cmd === 'nov') return { kind: 'command', command: 'nov', rest: (m[2] || '').trim() };
      return { kind: 'command', command: ['start', 'help', 'pomoc'].includes(cmd) ? 'pomoc' : (cmd === 'ponisti' ? 'ponisti' : 'nepoznata') };
    }
    return { kind: 'question' };
  }
```
U `parseTelegramCallback` regex postaje `/^([ksxouncvh]):([A-Za-z0-9]{1,40})(?::([a-z0-9]{1,10}))?$/`.

- [ ] **Step 4:** testovi prolaze. **Step 5:** commit „Bot: /nov i dugmad potvrde (core)“.

### Task 2: Poklapanje imena (core)

**Files:** Modify `budzet-core.js` (posle `parseTelegramCallback`, export); Test `app/test/core.test.js`.

**Interfaces:** Produces `C.matchActionTarget(text, candidates)`; `candidates: [{id, name}]` → `{match:{id,name}} | {choices:[{id,name}] (≤6)} | {none:true}`.

- [ ] **Step 1: Test**

```js
test('matchActionTarget: padezi, dijakritike, celo ime pobedjuje, izbor, nista', () => {
  const debts = [{ id: 'r', name: 'Rale' }, { id: 'g', name: 'Gabo' }, { id: 'j', name: 'Jovica' }];
  assert.deepEqual(C.matchActionTarget('Raletu', debts), { match: { id: 'r', name: 'Rale' } });
  assert.deepEqual(C.matchActionTarget('Jovici', debts), { match: { id: 'j', name: 'Jovica' } });
  const goals = [{ id: 'l', name: 'Letovanje' }, { id: 'a', name: 'Auto' }];
  assert.deepEqual(C.matchActionTarget('letovanje', goals), { match: { id: 'l', name: 'Letovanje' } });
  const rec = [{ id: 'p', name: 'Porez' }, { id: 'y', name: 'Anđela - Yettel' }, { id: 'n', name: 'Nokti' }, { id: 'pi', name: 'Porez imovina' }];
  assert.deepEqual(C.matchActionTarget('porez', rec), { match: { id: 'p', name: 'Porez' } });
  assert.deepEqual(C.matchActionTarget('andjela', rec), { match: { id: 'y', name: 'Anđela - Yettel' } });
  assert.deepEqual(C.matchActionTarget('yettel', rec), { match: { id: 'y', name: 'Anđela - Yettel' } });
  const two = [{ id: 'k1', name: 'Kaca' }, { id: 'k2', name: 'Kaca' }];
  assert.deepEqual(C.matchActionTarget('Kaci', two), { choices: two });
  assert.deepEqual(C.matchActionTarget('struja', rec), { none: true });
  assert.deepEqual(C.matchActionTarget('', rec), { none: true });
});
```

- [ ] **Step 2:** FAIL (nije funkcija).

- [ ] **Step 3: Implementacija**

```js
  // Naredbe iz bota: ime iz poruke ("Raletu", "letovanje") -> stavka aplikacije, bez AI-ja (imena ne idu AI-ju)
  const ACTION_SUFFIXES = ['ima', 'ama', 'ovi', 'ove', 'ova', 'om', 'em', 'u', 'a', 'e', 'i', 'o'];
  const stemWord = w => { for(const s of ACTION_SUFFIXES) if(w.length - s.length >= 3 && w.endsWith(s)) return w.slice(0, -s.length); return w; };
  const stemWords = s => foldText(s).split(/[^a-z0-9]+/).filter(Boolean).map(stemWord);
  const wordHit = (a, b) => a === b || (Math.min(a.length, b.length) >= 3 && (a.startsWith(b) || b.startsWith(a)));
  function matchActionTarget(text, candidates){
    const tw = stemWords(text);
    if(!tw.length) return { none: true };
    const scored = (candidates || []).map(c => {
      const nw = stemWords(c.name);
      if(!nw.length) return { c, score: 0 };
      const hits = nw.filter(n => tw.some(w => wordHit(w, n)));
      const exact = nw.every(n => tw.includes(n));
      return { c, score: hits.length === nw.length ? (exact ? 3 : 2) : hits.length ? 1 : 0 };
    }).filter(x => x.score > 0);
    if(!scored.length) return { none: true };
    const best = Math.max(...scored.map(x => x.score));
    const top = scored.filter(x => x.score === best).map(x => x.c);
    return top.length === 1 ? { match: top[0] } : { choices: top.slice(0, 6) };
  }
```

- [ ] **Step 4:** prolazi (ako „andjela“ ne prolazi: `foldText` pretvara đ u dj, pa „Anđela“ → „andjela“ → stem „andjel“; tekst „andjela“ → „andjel“ = exact u jednoj reči, hits 1 od 2 → score 1, jedini kandidat → match). **Step 5:** commit.

### Task 3: Plan AI-ja sa naredbom, novim proračunima i razgovorom (core)

**Files:** Modify `budzet-core.js` (`askPlanPrompt` ~1767, `cleanAskPlan` ~1782, `runAskTools` ~1814, `askAnswerPrompt` ~1870, `pendingForMonth` ~823); Test `app/test/core.test.js`.

**Interfaces:**
- Produces: `C.ASK_SNAPSHOT_TOOLS = ['toPay','debts','accounts','goals','forecast']`; `C.ACTION_KINDS`; `askPlanPrompt({question, today, first, last, expenseCats, incomeCats, history?:[{q,a}], actions?:true})`; `cleanAskPlan(raw, ctx)` → `{calls, action: null|{kind,target,amount,items}, offTopic, notes}`; `runAskTools(calls, {entries, recurring, today, snapshot})`; `askAnswerPrompt({..., history})`; `pendingForMonth` dodatno vraća `items: [{kind:'expense'|'recurring', id, desc, amount, date?, day?, debtId?}]` i `debtItems: [{id, person, rest}]`.

- [ ] **Step 1: Testovi**

```js
test('pitaj iz bota: naredba, novi proracuni bez meseci, razgovor u promptu', () => {
  const p = C.askPlanPrompt({ question: 'a prošlog meseca?', today: '2026-10-06', first: '2026-01', last: '2026-10', expenseCats: ['Hrana'], incomeCats: ['Plata'],
    history: [{ q: 'koliko za hranu ovog meseca?', a: 'Potrošili ste 12.000 RSD.' }], actions: true });
  assert.match(p, /koliko za hranu ovog meseca/);
  assert.match(p, /toPay/); assert.match(p, /debtPay/);
  const ctx = { first: '2026-01', last: '2026-10', categories: ['Hrana'] };
  const plan = C.cleanAskPlan(JSON.stringify({ calls: [{ tool: 'toPay' }, { tool: 'forecast', months: ['1999-01'] }], action: null }), ctx);
  assert.deepEqual(plan.calls, [{ tool: 'toPay' }, { tool: 'forecast' }]);
  assert.equal(plan.action, null);
  const a = C.cleanAskPlan(JSON.stringify({ calls: [], action: { kind: 'debtPay', target: ' Raletu ', amount: '5000' } }), ctx).action;
  assert.deepEqual(a, { kind: 'debtPay', target: 'Raletu', amount: 5000, items: [] });
  assert.equal(C.cleanAskPlan(JSON.stringify({ action: { kind: 'rm -rf', target: 'x' } }), ctx).action, null);
  assert.equal(C.cleanAskPlan(JSON.stringify({ action: { kind: 'paid', target: '' } }), ctx).action, null);
  assert.equal(C.cleanAskPlan(JSON.stringify({ action: { kind: 'goalPay', target: 'auto', amount: 1e9 } }), ctx).action.amount, null);
  assert.deepEqual(C.cleanAskPlan(JSON.stringify({ action: { kind: 'shopAdd', items: ['mleko', ' hleb ', ''] } }), ctx).action.items, ['mleko', 'hleb']);
  assert.deepEqual(C.cleanAskPlan(JSON.stringify({ action: { kind: 'shopDone', target: 'mleko' } }), ctx).action.items, ['mleko']);
  assert.deepEqual(C.cleanAskPlan(JSON.stringify({ action: { kind: 'deleteLast' } }), ctx).action, { kind: 'deleteLast', target: '', amount: null, items: [] });
  const r = C.runAskTools([{ tool: 'toPay' }, { tool: 'goals' }], { entries: [], recurring: [], today: '2026-10-06', snapshot: { toPay: { total: 5 } } });
  assert.deepEqual(r.map(x => x.result), [{ total: 5 }, null]);
  const ans = C.askAnswerPrompt({ question: 'a prošlog?', today: '2026-10-06', results: [], history: [{ q: 'koliko za hranu?', a: '12.000' }] });
  assert.match(ans, /koliko za hranu\?/);
});

test('pendingForMonth: spisak stavki i dugova za bota', () => {
  const recurring = [{ id: 'p', desc: 'Porez', amount: 8000, type: 'expense', frequency: 'monthly', day: 1 }];
  const entries = [{ id: 'a', type: 'expense', desc: 'Drva', date: '2026-10-01', amount: 56160, paid: false }];
  const debts = [{ id: 'g', direction: 'i_owe', person: 'Gabo', amount: 1000 }];
  const p = C.pendingForMonth({ entries, recurring, applied: {}, skipped: {}, debts, mKey: '2026-10', currentMonth: '2026-10' });
  assert.deepEqual(p.items, [{ kind: 'expense', id: 'a', desc: 'Drva', amount: 56160, date: '2026-10-01' }, { kind: 'recurring', id: 'p', desc: 'Porez', amount: 8000, day: 1 }]);
  assert.deepEqual(p.debtItems, [{ id: 'g', person: 'Gabo', rest: 1000 }]);
});
```
Postojeći test „pendingForMonth: drugi meseci…“ koristi `deepEqual` na celom objektu — promeni ga da poredi samo `{expense, income, count, debt, debtCount}` (npr. `const pick = o => ({ expense: o.expense, income: o.income, count: o.count, debt: o.debt, debtCount: o.debtCount });`).

- [ ] **Step 2:** FAIL.

- [ ] **Step 3: Implementacija**

`askPlanPrompt` — posle reda `'- recurring {}: ...'` dodaj:
```js
      '- toPay {}: šta treba platiti ovog meseca (stavke, zbir, dugovi)',
      '- debts {}: dugovi (moji i prema meni), ostatak',
      '- accounts {}: stanje po računu',
      '- goals {}: ciljevi štednje (trenutno, cilj)',
      '- forecast {}: prognoza stanja do plate',
```
pa, kada je `o.actions`, posle JSON reda:
```js
      'Ako korisnik traži IZMENU (ne pitanje), vrati "action" umesto proračuna: {"kind":"","target":"","amount":null,"items":[]}.',
      'kind: add (upiši rashod/prihod, target = ceo opis sa iznosom), paid (označi plaćeno), skip (preskoči ovaj mesec), debtPay (uplata na dug, target = osoba), goalPay (uplata u cilj), shopAdd (dodaj na spisak, items), shopDone (kupljeno, items), editLast (izmeni poslednji unos: amount ili target = novi opis), deleteLast (obriši poslednji unos).',
      'target je ime iz poruke, onako kako je napisano. Ne izmišljaj iznos.',
```
i pre reda `'Pitanje: '`:
```js
      ...((o.history || []).length ? ['Prethodni razgovor (za kontekst, npr. "a prošlog meseca?"):'].concat(o.history.map(h => 'P: ' + String(h.q).slice(0, 300) + ' | O: ' + String(h.a).slice(0, 300))) : []),
```
JSON red postaje `'Vrati SAMO JSON: {"calls":[...],"action":null,"offTopic":false}'` (zadrži postojeći primer poziva).

`cleanAskPlan` — na početku petlje:
```js
      if(c && ASK_SNAPSHOT_TOOLS.includes(c.tool)){ if(calls.length < ASK_MAX_CALLS) calls.push({ tool: c.tool }); return; }
```
i na kraju `return { calls, action: cleanAskAction(o.action), offTopic: !!o.offTopic, notes };` sa:
```js
  const ASK_SNAPSHOT_TOOLS = ['toPay', 'debts', 'accounts', 'goals', 'forecast'];
  const ACTION_KINDS = ['add', 'paid', 'skip', 'debtPay', 'goalPay', 'shopAdd', 'shopDone', 'editLast', 'deleteLast'];
  function cleanAskAction(a){
    if(!a || typeof a !== 'object' || !ACTION_KINDS.includes(a.kind)) return null;
    const n = Number(a.amount);
    const out = { kind: a.kind, target: String(a.target == null ? '' : a.target).trim().slice(0, 60), amount: n > 0 && n < 1e8 ? round2(n) : null,
      items: (Array.isArray(a.items) ? a.items : []).map(x => String(x == null ? '' : x).trim().slice(0, 60)).filter(Boolean).slice(0, 20) };
    if((out.kind === 'shopAdd' || out.kind === 'shopDone') && !out.items.length && out.target) out.items = [out.target];
    if((out.kind === 'shopAdd' || out.kind === 'shopDone') && !out.items.length) return null;
    if(['add', 'paid', 'skip', 'debtPay', 'goalPay'].includes(out.kind) && !out.target) return null;
    return out;
  }
```
`runAskTools` — prva grana u `map`: `if(ASK_SNAPSHOT_TOOLS.includes(c.tool)) result = ((data && data.snapshot) || {})[c.tool] ?? null; else if(c.tool === 'monthSummary') ...`.

`askAnswerPrompt` — pre `'Pitanje: '` isti `history` red kao u planu.

`pendingForMonth` — skupljaj stavke:
```js
    const items = direct.map(e => ({ kind: 'expense', id: e.id, desc: e.desc, amount: e.amount, date: e.date }));
    // u recAmount (petlja): items.push({ kind: 'recurring', id: r.id, desc: r.desc, amount: a, day: r.day, ...(r.debtId ? { debtId: r.debtId } : {}) })
    const debtItems = [];  // u petlji nad left: debtItems.push({ id, person: (debts.find(d => d.id === id) || {}).person, rest: left[id] })
```
Zbir `recSum` računaj iz istih iznosa. Vrati i `items, debtItems`.

Export: `ASK_SNAPSHOT_TOOLS, ACTION_KINDS, matchActionTarget` (Task 2) u `return {...}`.

- [ ] **Step 4:** svi core testovi prolaze. **Step 5:** commit.

### Task 4: Meni komandi (app/telegram.js)

**Files:** Modify `app/telegram.js` (petlja posle `setState('running')` ~224); Test `app/test/telegram.test.js`.

**Interfaces:** Consumes postojeći `api(method, body)` i `T()`.

- [ ] **Step 1: Test** (po uzoru na postojeće testove sa lažnim `fetch`/api u istom fajlu): posle prvog uspešnog `getUpdates`, zabeleženi pozivi sadrže tačno jedan `setMyCommands` sa `commands` = `nov`, `ponisti`, `pomoc`; drugi krug ga ne šalje ponovo; greška u `setMyCommands` ne zaustavlja petlju.

- [ ] **Step 2:** FAIL.

- [ ] **Step 3: Implementacija** (posle bloka za dopunu imena bota):
```js
    if (!commandsSet) {
      commandsSet = true;
      await safe(() => api('setMyCommands', { commands: [
        { command: 'nov', description: T('Nov unos: /nov kafa 250') },
        { command: 'ponisti', description: T('Poništi poslednji unos') },
        { command: 'pomoc', description: T('Uputstvo') }] }));
    }
```
`let commandsSet = false;` uz ostalo stanje; resetuj na `false` kad se token promeni (gde se resetuje `meAt`). Engleski prevodi u rečniku `T` u `main.js`/`telegram.js` (gde je postojeći rečnik za `T`).

- [ ] **Step 4:** `npm test` prolazi. **Step 5:** commit.

### Task 5: Usmeravanje i pitanja (stranica)

**Files:** Modify `budzet-tracker.html` (`TG_HELP`, `tgText` ~5755, novo `tgAsk`, `tgSnapshot`), `i18n.js`; Test `app/test/smoke-checks.js` (~1862 i svi postojeći Telegram tekstovi koji su unos → dodaj `/nov `).

**Interfaces:**
- Consumes: `C.telegramIntent`, `C.askPlanPrompt({..., history, actions:true})`, `C.cleanAskPlan`, `C.runAskTools({snapshot})`, `C.askAnswerPrompt({history})`, `askCall(req, step)`, `askAiAvailable()`, `askErr(r)`.
- Produces: `tgEntry(text, p)` (dosadašnje telo `tgText` za unos), `tgAsk(text, p)`, `tgHistory` (niz `{q, a, at}`), `tgAwait` (`{kind:'entry'|'amount', proposalId?, at}` ili null), `tgSnapshot()`.

- [ ] **Step 1: Smoke testovi** (u bloku Telegram):
```js
        const r1 = await B.handle({ update_id: 900001, kind: 'text', text: '/nov Smoke tg kafa 250' });   // ranije bez /nov
        // ... postojeće provere ostaju; '/nov Smoke tg kafa' za "bez iznosa"; '/nov +Smoke tg honorar 3000'
        const n1 = await B.handle({ update_id: 900010, kind: 'text', text: '/nov' });
        check('telegram: /nov bez teksta pita šta da upiše', /upišem/.test(n1.replies[0].text));
        await B.handle({ update_id: 900011, kind: 'text', text: 'Smoke tg sok 120' });
        check('telegram: posle /nov sledeća poruka je unos', ents().some(e => e.desc === 'Smoke tg sok' && e.amount === 120));
        let asked = [];
        window.__fakeAsk = async (req, step) => { asked.push(req.prompt); return step === 1
          ? { ok: true, content: JSON.stringify({ calls: [{ tool: 'toPay' }], action: null }) }
          : { ok: true, content: JSON.stringify({ odgovor: 'Treba platiti Smoke stavku.' }) }; };
        const q1 = await B.handle({ update_id: 900012, kind: 'text', text: 'šta treba da platimo?' });
        check('telegram: pitanje -> odgovor AI-ja', /Treba platiti/.test(q1.replies[0].text), JSON.stringify(q1));
        check('telegram: toPay rezultat ide u drugi korak', /"tool":"toPay"/.test(asked[1]) && /"total"/.test(asked[1]), asked[1] && asked[1].slice(0, 300));
        check('telegram: prvi korak bez iznosa i imena', !/56160|Smoke tg sok/.test(asked[0]));
        asked = [];
        await B.handle({ update_id: 900013, kind: 'text', text: 'a prošlog meseca?' });
        check('telegram: razgovor se pamti', /šta treba da platimo/.test(asked[0]));
        window.__fakeAsk = async () => ({ ok: false, kind: 'http', message: 'x' });
        const q3 = await B.handle({ update_id: 900014, kind: 'text', text: 'koliko imam na računu?' });
        check('telegram: greška AI-ja -> poruka sa /nov', /\/nov/.test(q3.replies[0].text), q3.replies[0].text);
        window.__fakeAsk = null;
```
Pronađi grep-om `kind: 'text', text:` u `smoke-checks.js` i svaki tekst koji je zamišljen kao unos (ne komanda, ne link) prefiksiraj sa `/nov `.

- [ ] **Step 2:** `npm run copy-web && node test/smoke.js` → nove provere padaju.

- [ ] **Step 3: Implementacija**

```js
  const TG_HELP = () => t('Pitaj me bilo šta o budžetu („šta treba da platimo?“, „koliko smo dali za hranu?“) ili reci šta da uradim („platila sam porez“, „vratila sam Raletu 5000“, „dodaj mleko“) — pre svake izmene tražim potvrdu. Nov unos: /nov kafa 250 (prihod: /nov +honorar 30000). Pošalji sliku ili PDF računa ili uplatnice. /ponisti poništava poslednji unos.');
  let tgHistory = [];   // [{ q, a, at }] samo u memoriji
  let tgAwait = null;   // { kind: 'entry' } posle praznog /nov, { kind: 'amount', proposalId } kad naredbi fali iznos
  const TG_AWAIT_MS = 10 * 60 * 1000, TG_HISTORY_MS = 15 * 60 * 1000;
  const tgRecentHistory = () => tgHistory.filter(h=> Date.now() - h.at < TG_HISTORY_MS).slice(-4);
  async function tgText(text, p){
    const fiscalUrl = C.fiscalUrlFrom(text);
    if(fiscalUrl) return tgFiscalLink(fiscalUrl, p);
    const intent = C.telegramIntent(text);
    const wait = tgAwait && Date.now() - tgAwait.at < TG_AWAIT_MS ? tgAwait : null;
    if(intent.kind === 'command'){
      tgAwait = null;
      if(intent.command === 'ponisti'){ const it = await tgUndo(null); return tgReply(it ? t('↩ Poništeno: {0}', it.label) : t('Nema unosa iz Telegrama za poništavanje (poslednja 24 sata).')); }
      if(intent.command === 'nov'){
        if(!intent.rest){ tgAwait = { kind: 'entry', at: Date.now() }; return tgReply(t('Šta da upišem? Npr. „kafa 250“.')); }
        return tgEntry(intent.rest, p);
      }
      return tgReply(TG_HELP());
    }
    if(intent.kind !== 'question') return tgReply(TG_HELP());
    if(wait){ tgAwait = null;
      if(wait.kind === 'entry') return tgEntry(text, p);
      if(wait.kind === 'amount'){ const n = C.parseAmount(text); if(n > 0) return tgProposalAmount(wait.proposalId, n, p); }
    }
    return tgAsk(text, p);
  }
```
`tgEntry(text, p)` = dosadašnji deo `tgText` od `const data = window.__desktopBridge.getQuickAddData();` do kraja (bez izmena).

```js
  function tgSnapshot(){
    const pend = C.pendingForMonth({ entries, recurring, applied, skipped, debts, mKey: currentMonthKey(), currentMonth: currentMonthKey() });
    const bal = accounts.length ? accountBalances() : null;
    let fc = null; try{ const f = forecastNow(); fc = { startBalance: f.startBalance, lowest: f.lowest && { date: f.lowest.date, balance: f.lowest.balance }, payday: f.payday && { date: f.payday.date }, firstNegative: f.firstNegative || null }; } catch(e){}
    return {
      toPay: { total: pend.expense, count: pend.count, items: pend.items.map(i=> ({ desc: i.desc, amount: i.amount, rok: i.date || (i.day ? t('dan {0}', i.day) : '') })), debtsTotal: pend.debt, debts: pend.debtItems.map(d=> ({ person: d.person, ostatak: d.rest })), expectedIncome: pend.income },
      debts: debts.map(d=> ({ person: d.person, smer: d.direction === 'i_owe' ? 'ja dugujem' : 'duguju meni', ukupno: d.amount, ostatak: debtRemaining(d) })),
      accounts: bal ? { racuni: accounts.map(a=> ({ name: a.name, stanje: bal[a.id] })), ukupno: C.round2(accounts.reduce((s, a)=> s + bal[a.id], 0)) } : { ukupno: overallBalance() },
      goals: goals.map(g=> ({ name: g.name, trenutno: g.current, cilj: g.target, mesecno: g.monthly ? g.monthly.amount : null })),
      forecast: fc
    };
  }
  async function tgAsk(text, p){
    if(!askAiAvailable()) return tgReply(t('AI nije podešen (Podešavanja → AI čitanje računa). Unos i dalje radi: /nov kafa 250'));
    const today = toISODateLocal(new Date()), history = tgRecentHistory();
    const { first, last } = C.askMonthRange(entries, currentMonthKey());
    const r1 = await askCall({ images: [], text: '', prompt: C.askPlanPrompt({ question: text, today, first, last, expenseCats, incomeCats, history, actions: true }) }, 1);
    if(!r1 || !r1.ok) return tgReply('✕ ' + askErr(r1) + ' ' + t('Unos i dalje radi: /nov kafa 250'));
    const plan = C.cleanAskPlan(r1.content, { first, last, categories: expenseCats.concat(incomeCats) });
    if(!plan) return tgReply(t('Nisam razumeo — probaj drugačije.'));
    if(plan.action) return tgPropose(plan.action, text, p);   // Task 6
    if(plan.offTopic) return tgReply(t('Mogu da odgovorim samo na pitanja o budžetu. Za unos: /nov kafa 250'));
    if(!plan.calls.length) return tgReply(t('Za ovo pitanje nema podataka u knjizi.'));
    const results = C.runAskTools(plan.calls, { entries, recurring, today, snapshot: tgSnapshot() });
    const r2 = await askCall({ images: [], text: '', prompt: C.askAnswerPrompt({ question: text, today, results, history, lang: askLangOverride || I18N.lang }) }, 2);
    if(!r2 || !r2.ok) return tgReply('✕ ' + askErr(r2) + ' ' + t('Unos i dalje radi: /nov kafa 250'));
    const answer = C.cleanAskAnswer(r2.content).slice(0, 3000);
    tgHistory = tgRecentHistory().concat({ q: text, a: answer, at: Date.now() }).slice(-4);
    return tgReply(answer);
  }
```
Do Task 6 `tgPropose` vraća `tgReply(t('Nisam razumeo — probaj drugačije.'))` (privremeno, zamenjuje se u Task 6). `accountBalances` i `overallBalance` već postoje u stranici. Prevodi u `i18n.js` za sve nove `t(...)` ključeve; pokreni `npm test` (proverava korišćenje ključeva).

Uputstvo pri povezivanju u `app/telegram.js` (red 173) promeni u: `'✓ Povezano sa Knjigom budžeta. Pitaj me nešto o budžetu ili upiši trošak: /nov kafa 250. /pomoc za uputstvo.'` (+ prevod u rečniku `T`).

- [ ] **Step 4:** `npm test` i smoke prolaze. **Step 5:** commit.

### Task 6: Naredbe sa potvrdom (stranica)

**Files:** Modify `budzet-tracker.html` (`tgPropose`, `tgCallback`, `tgUndo`, novi ključ `budzet-telegram-potvrde-v1`), `i18n.js`; Test `app/test/smoke-checks.js`.

**Interfaces:**
- Consumes: `C.matchActionTarget`, `C.pendingForMonth(...).items`, `C.telegramEntryDraft`, `markRecurringPaid(r, mKey, amount)`, `toggleSkipMonth`-logika (`skipped`, `saveSkipped`), `debtRemaining`, `saveDebts`, `contributeToGoal(g, amount)`, `addShoppingFromInput(name)`, `C.findShoppingItem`, `saveShopping`, `tgLog(ids, label, extra)`, `tgSenderTag`, `tgWho`.
- Produces: `tgPropose(action, text, p)`, `tgProposalAmount(id, amount, p)`; callback `c:`/`n:`/`h:`; dnevnik radnji `{ ..., act: { kind, prev } }`.

Struktura predloga (`budzet-telegram-potvrde-v1`, niz, max 50, rok 10 min):
```js
{ id, created, kind, targetId, targetKind /* 'expense'|'recurring'|'debt'|'goal'|'entry' */, amount, items, choices /* [{id,name,targetKind}] */, draft /* add */, label, state: 'open'|'done'|'cancelled' }
```

- [ ] **Step 1: Smoke testovi** (novi blok posle Telegram bloka; svaka naredba = predlog → `c:` → provera podataka → `u:` → provera vraćanja):
```js
    if (window.__telegramBridge) {
      const B = window.__telegramBridge; let uid = 901000;
      const send = (text, extra) => B.handle(Object.assign({ update_id: ++uid, kind: 'text', text }, extra || {}));
      const click = (data, extra) => B.handle(Object.assign({ update_id: ++uid, kind: 'callback', data, messageId: 77 }, extra || {}));
      const btn = (r, re) => (r.replies[0].buttons || []).flat().find(b => re.test(b.data));
      const act = a => { window.__fakeAsk = async (req, step) => ({ ok: true, content: JSON.stringify({ calls: [], action: a }) }); };
      const L = k => JSON.parse(localStorage.getItem(k) || '[]');
      const curM = new Date().toISOString().slice(0, 7);
      // pripremi: ponavljajuca "Smoke porez", dug "Smoke Rale" 12000, cilj "Smoke letovanje", stavka Nabavke
      const rec = { id: 'smkpor', type: 'expense', desc: 'Smoke porez', amount: 8000, category: L('budzet-kategorije-v2')[0] || 'Ostalo', day: 1, frequency: 'monthly', anchorMonth: 1 };
      localStorage.setItem('budzet-ponavljajuce-v1', JSON.stringify(L('budzet-ponavljajuce-v1').concat(rec)));
      window.__reloadForTest && window.__reloadForTest();
      // ... (dug i cilj kroz postojeće forme ili hook kao u ranijim smoke blokovima: setVal + requestSubmit)

      // paid
      act({ kind: 'paid', target: 'smoke porez' });
      const p1 = await send('platila sam smoke porez');
      check('naredba: predlog sa Potvrdi/Otkaži', /Smoke porez/.test(p1.replies[0].text) && !!btn(p1, /^c:/) && !!btn(p1, /^n:/), JSON.stringify(p1));
      const c1 = await click(btn(p1, /^c:/).data);
      check('naredba: plaćeno posle potvrde', (JSON.parse(localStorage.getItem('budzet-primenjeno-v1') || '{}')[curM] || []).includes('smkpor'), JSON.stringify(c1));
      const c1b = await click(btn(p1, /^c:/).data);
      check('naredba: dupla potvrda ne ponavlja', /Već/.test(c1b.callbackText || ''), JSON.stringify(c1b));
      await click(btn(c1, /^u:/).data);
      check('naredba: Poništi vraća neplaćeno', !(JSON.parse(localStorage.getItem('budzet-primenjeno-v1') || '{}')[curM] || []).includes('smkpor'));
      // "Već urađeno": predlog, pa plaćanje u aplikaciji, pa potvrda
      const p2 = await send('platila sam smoke porez');
      window.__markRecurringPaid('smkpor');
      const c2 = await click(btn(p2, /^c:/).data);
      check('naredba: plaćeno u međuvremenu -> Već urađeno', /Već/.test((c2.callbackText || '') + (c2.replies[0] && c2.replies[0].text || '')), JSON.stringify(c2));
      // skip, debtPay (iznos > ostatka -> ostatak; bez iznosa -> pita koliko), goalPay, shopAdd, shopDone,
      // add ("Smoke kafa 250" bez /nov), editLast (Poništi vraća stari iznos), deleteLast, Otkaži, istek (created - 11 min), izbor (dva duga istog imena -> h:), grupa (ime potvrđivača)
      window.__fakeAsk = null;
    }
```
Napiši provere za svaku navedenu stavku u komentaru po istom obrascu: `act(...)` → `send` → `click(c:)` → provera u `localStorage` → `click(u:)` → provera vraćanja. Za grupu: `send(..., { group: true, from: { name: 'Ana' } })`, potvrda sa `{ group: true, from: { name: 'Vanja' } }` → rezultat sadrži „Vanja“. Istek: posle predloga promeni `created` u `budzet-telegram-potvrde-v1` na `Date.now() - 11*60*1000`, klik → „Isteklo“.

- [ ] **Step 2:** smoke → nove provere padaju.

- [ ] **Step 3: Implementacija**

```js
  const TG_PROP_KEY = 'budzet-telegram-potvrde-v1', TG_PROP_MS = 10 * 60 * 1000;
  const tgProps = () => tgLoad(TG_PROP_KEY).filter(x=> Date.now() - x.created < 24 * 3600e3);
  const tgPropPut = x => tgSave(TG_PROP_KEY, tgProps().filter(y=> y.id !== x.id).concat(x).slice(-50));
  const tgConfirmButtons = x => [[{ text: '✓ ' + t('Potvrdi'), data: 'c:' + x.id }, { text: '✕ ' + t('Otkaži'), data: 'n:' + x.id }]];
  const tgLastEntries = () => tgLoad(TG_LOG_KEY).filter(l=> !l.undone && !l.act && Date.now() - l.at < 864e5 && (l.ids || []).length === 1)
    .map(l=> entries.find(e=> e.id === l.ids[0])).filter(Boolean);
  // kandidati po vrsti naredbe; name = ono sto se poredi, label = ono sto se prikazuje
  function tgCandidates(kind){
    const mKey = currentMonthKey();
    if(kind === 'paid' || kind === 'skip'){
      const pend = C.pendingForMonth({ entries, recurring, applied, skipped, debts, mKey, currentMonth: mKey }).items
        .filter(i=> kind === 'paid' || i.kind === 'recurring')
        .map(i=> ({ id: i.id, name: i.desc, targetKind: i.kind, amount: i.amount }));
      return pend;
    }
    if(kind === 'paidAll') return recurring.filter(r=> r.type === 'expense' && C.isDueInMonth(r, mKey) && !(r.until && r.until < mKey)).map(r=> ({ id: r.id, name: r.desc, targetKind: 'recurring', amount: recurringAmountNow(r) }));
    if(kind === 'debtPay') return debts.filter(d=> d.direction === 'i_owe' && debtRemaining(d) > 0).map(d=> ({ id: d.id, name: d.person, targetKind: 'debt', amount: debtRemaining(d) }));
    if(kind === 'goalPay') return goals.map(g=> ({ id: g.id, name: g.name, targetKind: 'goal' }));
    if(kind === 'editLast' || kind === 'deleteLast') return tgLastEntries().map(e=> ({ id: e.id, name: e.desc, targetKind: 'entry', amount: e.amount }));
    return [];
  }
  function tgProposalText(x){
    const mon = monthLabel(currentMonthKey());
    switch(x.kind){
      case 'add': return t('Upisati: {0} · {1} · {2}?', x.draft.desc, fmt(x.draft.amount), x.draft.category || '—');
      case 'paid': return t('Označiti {0} ({1}) kao plaćeno za {2}?', x.label, fmt(x.amount), mon);
      case 'skip': return t('Preskočiti {0} ({1}) za {2}?', x.label, fmt(x.amount), mon);
      case 'debtPay': return t('Uplata {0} na dug {1}? Ostaje {2}.', fmt(x.amount), x.label, fmt(Math.max(0, x.rest - x.amount)));
      case 'goalPay': return t('Uplatiti {0} u cilj {1}?', fmt(x.amount), x.label);
      case 'shopAdd': return t('Dodati na spisak: {0}?', x.items.join(', '));
      case 'shopDone': return t('Štiklirati: {0}?', x.items.join(', ')) + (x.missing.length ? '\n' + t('Nisam našao: {0}', x.missing.join(', ')) : '');
      case 'editLast': return t('{0}: {1} → {2}?', x.label, fmt(x.oldAmount), x.amount != null ? fmt(x.amount) : x.newDesc);
      case 'deleteLast': return t('Obrisati: {0} ({1})?', x.label, fmt(x.amount));
    }
  }
  async function tgPropose(a, text, p){
    const x = { id: newId(), created: Date.now(), kind: a.kind, amount: a.amount, items: a.items, state: 'open', who: tgWho(p) };
    if(a.kind === 'add'){
      const data = window.__desktopBridge.getQuickAddData();
      const draftOf = s => C.telegramEntryDraft(s, { today: toISODateLocal(new Date()), accounts: data.accounts || [], currencies: CURRENCIES.filter(c=> c !== 'RSD'), rules: data.rules, history: data.history, expenseCats, incomeCats, group: false });
      let d = draftOf(text); if(d.error) d = draftOf(a.target + (a.amount ? ' ' + a.amount : ''));
      if(d.error) return tgReply(t('Nisam našao iznos — pošalji npr. „/nov kafa 250“.'));
      d.category = d.category || (d.type === 'expense' ? await tgAiCategory(d.desc) : null) || '';
      x.draft = d; x.tag = tgSenderTag(p);
    } else if(a.kind === 'shopAdd'){
      // nista za trazenje
    } else if(a.kind === 'shopDone'){
      const need = shopping.items.filter(it=> it.needed && !it.checked);
      x.found = []; x.missing = [];
      a.items.forEach(n=>{ const m = C.matchActionTarget(n, need.map(it=> ({ id: it.id, name: it.name }))); if(m.match) x.found.push(m.match.id); else if(m.choices) x.found.push(m.choices[0].id); else x.missing.push(n); });
      if(!x.found.length) return tgReply(t('Nisam našao na spisku: {0}', a.items.join(', ')));
      x.items = x.found.map(id=> shopping.items.find(it=> it.id === id).name);
    } else {
      let cands = tgCandidates(a.kind);
      const target = a.target || (a.kind === 'editLast' || a.kind === 'deleteLast' ? null : '');
      let m = target == null ? (cands.length ? { match: cands[cands.length - 1] } : { none: true }) : C.matchActionTarget(target, cands);
      if(m.none && a.kind === 'paid'){ cands = tgCandidates('paidAll'); m = C.matchActionTarget(a.target, cands); }
      if(m.none) return tgReply(a.kind === 'editLast' || a.kind === 'deleteLast' ? t('Nema unosa iz bota u poslednja 24 sata.') : t('Nisam našao „{0}“.', a.target));
      if(m.choices){ x.choices = m.choices.map(c=> cands.find(k=> k.id === c.id)); tgPropPut(x);
        return tgReply(t('Na šta misliš?'), { buttons: x.choices.map((c, i)=> [{ text: c.name + (c.amount ? ' · ' + fmt(c.amount) : ''), data: `h:${x.id}:${i}` }]) }); }
      tgFillTarget(x, cands.find(k=> k.id === m.match.id), a);
      if(x.needAmount){ tgPropPut(x); tgAwait = { kind: 'amount', proposalId: x.id, at: Date.now() }; return tgReply(t('Koliko? (npr. 5000)')); }
    }
    tgPropPut(x);
    return tgReply(tgProposalText(x), { buttons: tgConfirmButtons(x) });
  }
  function tgFillTarget(x, c, a){
    x.targetId = c.id; x.targetKind = c.targetKind; x.label = c.name;
    if(x.kind === 'paid' || x.kind === 'skip') x.amount = a.amount || c.amount;
    if(x.kind === 'debtPay'){ x.rest = c.amount; if(!a.amount) x.needAmount = true; else x.amount = Math.min(a.amount, c.amount); }
    if(x.kind === 'goalPay' && !a.amount) x.needAmount = true;
    if(x.kind === 'editLast'){ x.oldAmount = c.amount; if(a.amount) x.amount = a.amount; else { x.amount = null; x.newDesc = a.target; } }
    if(x.kind === 'deleteLast') x.amount = c.amount;
  }
  async function tgProposalAmount(id, n, p){
    const x = tgProps().find(y=> y.id === id && y.state === 'open');
    if(!x) return tgReply(t('Isteklo — pošalji ponovo.'));
    x.needAmount = false; x.amount = x.kind === 'debtPay' ? Math.min(n, x.rest) : n;
    tgPropPut(x);
    return tgReply(tgProposalText(x), { buttons: tgConfirmButtons(x) });
  }
  // Izvrsenje: proveri da li stanje i dalje vazi; vrati { text, logExtra } ili { already:true }
  function tgExecute(x){
    const mKey = currentMonthKey();
    if(x.kind === 'add'){
      const d = x.draft;
      const r = window.__desktopBridge.addEntry({ type: d.type, desc: d.desc, amount: d.amount, currency: d.currency || 'RSD', date: d.date, accountId: d.accountId || undefined, category: d.category, paid: true, tags: x.tag || undefined });
      if(!r || !r.ok) throw new Error((r && r.error) || t('Stavka nije dodata.'));
      return { text: `${d.desc} · ${r.amountText} · ${r.category}`, ids: r.ids };
    }
    if(x.kind === 'paid' && x.targetKind === 'recurring'){
      const r = recurring.find(y=> y.id === x.targetId); if(!r || isPaid(r, mKey)) return { already: true };
      const prev = { applied: (applied[mKey] || []).slice(), skipped: (skipped[mKey] || []).slice() };
      const id = markRecurringPaid(r, mKey, x.amount); if(!id) return { already: true };
      saveApplied(); saveEntries(); saveSkipped();
      return { text: t('{0} plaćeno ({1})', r.desc, fmt(x.amount)), ids: [id], act: { kind: 'recPaid', mKey, prev } };
    }
    if(x.kind === 'paid'){
      const e = entries.find(y=> y.id === x.targetId); if(!e || isExpensePaid(e)) return { already: true };
      const prev = { paid: e.paid, amount: e.amount };
      e.paid = true; if(x.amount && x.amount !== e.amount) e.amount = x.amount; saveEntries();
      return { text: t('{0} plaćeno ({1})', e.desc, fmt(e.amount)), ids: [], act: { kind: 'entryEdit', id: e.id, prev } };
    }
    if(x.kind === 'skip'){
      const r = recurring.find(y=> y.id === x.targetId); if(!r || isPaid(r, mKey) || isSkipped(r, mKey)) return { already: true };
      if(!skipped[mKey]) skipped[mKey] = []; skipped[mKey].push(r.id); saveSkipped();
      return { text: t('{0} preskočeno za ovaj mesec', r.desc), ids: [], act: { kind: 'skip', mKey, id: r.id } };
    }
    if(x.kind === 'debtPay'){
      const d = debts.find(y=> y.id === x.targetId); const rem = d ? debtRemaining(d) : 0; if(!d || rem <= 0) return { already: true };
      const amt = Math.min(x.amount, rem), prev = d.paidAmount || 0;
      d.paidAmount = C.round2(prev + amt); saveDebts();
      return { text: t('Uplata {0} na dug {1}, ostaje {2}', fmt(amt), d.person, fmt(debtRemaining(d))), ids: [], act: { kind: 'debt', id: d.id, prev } };
    }
    if(x.kind === 'goalPay'){
      const g = goals.find(y=> y.id === x.targetId); if(!g) return { already: true };
      const prev = g.current, trId = contributeToGoal(g, x.amount);
      return { text: t('Uplaćeno {0} u cilj {1}', fmt(x.amount), g.name), ids: trId ? [trId] : [], act: { kind: 'goal', id: g.id, prev } };
    }
    if(x.kind === 'shopAdd'){
      const before = shopping.items.map(it=> ({ id: it.id, needed: it.needed, checked: it.checked, price: it.price }));
      const created = []; x.items.forEach(n=>{ const r = addShoppingFromInput(n); if(r && r.created) created.push(r.item.id); });
      return { text: t('Na spisku: {0}', x.items.join(', ')), ids: [], shopping: before, act: { kind: 'shopAdd', created } };
    }
    if(x.kind === 'shopDone'){
      const its = x.found.map(id=> shopping.items.find(it=> it.id === id)).filter(it=> it && !it.checked);
      if(!its.length) return { already: true };
      const before = its.map(it=> ({ id: it.id, needed: it.needed, checked: it.checked, price: it.price }));
      its.forEach(it=>{ it.checked = true; }); saveShopping();
      return { text: t('Štiklirano: {0}', its.map(it=> it.name).join(', ')), ids: [], shopping: before };
    }
    if(x.kind === 'editLast'){
      const e = entries.find(y=> y.id === x.targetId); if(!e) return { already: true };
      const prev = { amount: e.amount, desc: e.desc };
      if(x.amount != null) e.amount = x.amount; else e.desc = x.newDesc; saveEntries();
      return { text: t('Izmenjeno: {0} · {1}', e.desc, fmt(e.amount)), ids: [], act: { kind: 'entryEdit', id: e.id, prev } };
    }
    if(x.kind === 'deleteLast'){
      const e = entries.find(y=> y.id === x.targetId); if(!e) return { already: true };
      entries = entries.filter(y=> y.id !== e.id); if(e.type === 'expense') unapplyRoundUpSaving(e.amount); saveEntries();
      return { text: t('Obrisano: {0}', e.desc), ids: [], act: { kind: 'restore', entry: e } };
    }
  }
```
Napomena za `add`: proveri da `__desktopBridge.addEntry` već primenjuje oznaku `tags` (postojeći `tgEntry` je šalje) — koristi isti oblik.

`tgCallback` — pre `return tgFileCallback(p, cb)`:
```js
    if(cb.action === 'c' || cb.action === 'n' || cb.action === 'h'){
      const x = tgProps().find(y=> y.id === cb.id);
      if(!x || x.state !== 'open') return { callbackText: x ? t('Već urađeno') : t('Isteklo'), replies: [] };
      if(Date.now() - x.created > TG_PROP_MS){ x.state = 'cancelled'; tgPropPut(x); return { callbackText: t('Isteklo'), replies: [{ editMessageId: p.messageId, text: t('Isteklo — pošalji ponovo.') }] }; }
      if(cb.action === 'n'){ x.state = 'cancelled'; tgPropPut(x); return { callbackText: t('Otkazano'), replies: [{ editMessageId: p.messageId, text: '✕ ' + t('Otkazano') }] }; }
      if(cb.action === 'h'){
        const c = (x.choices || [])[parseInt(cb.arg, 10)]; if(!c) return { replies: [] };
        tgFillTarget(x, c, { amount: x.amount, target: x.label });
        x.choices = null; tgPropPut(x);
        if(x.needAmount){ tgAwait = { kind: 'amount', proposalId: x.id, at: Date.now() }; return { replies: [{ editMessageId: p.messageId, text: t('Koliko? (npr. 5000)') }] }; }
        return { replies: [{ editMessageId: p.messageId, text: tgProposalText(x), buttons: tgConfirmButtons(x) }] };
      }
      if(x.needAmount) return { callbackText: t('Koliko? (npr. 5000)'), replies: [] };
      x.state = 'done'; tgPropPut(x);   // pre izvrsenja: dupli klik ne ponavlja
      let res;
      try{ res = tgExecute(x); } catch(e){ return { replies: [{ editMessageId: p.messageId, text: '✕ ' + t('Nije urađeno: {0}', String(e && e.message || e)) }] }; }
      renderAll();
      if(res.already) return { callbackText: t('Već urađeno'), replies: [{ editMessageId: p.messageId, text: t('Već urađeno — ništa nije menjano.') }] };
      const logId = tgLog(res.ids || [], res.text, { act: res.act || null, shopping: res.shopping });
      return { replies: [{ editMessageId: p.messageId, text: '✓ ' + tgWho(p) + res.text, buttons: [[{ text: t('Poništi'), data: 'u:' + logId }]] }] };
    }
```
`tgUndo` — posle vraćanja Nabavke dodaj vraćanje radnje (`item.act`):
```js
    const a = item.act;
    if(a && a.kind === 'recPaid'){ applied[a.mKey] = a.prev.applied; skipped[a.mKey] = a.prev.skipped; saveApplied(); saveSkipped(); }
    if(a && a.kind === 'entryEdit'){ const e = entries.find(x=> x.id === a.id); if(e){ Object.assign(e, a.prev); if(a.prev.paid === undefined) delete e.paid; saveEntries(); } }
    if(a && a.kind === 'skip'){ skipped[a.mKey] = (skipped[a.mKey] || []).filter(id=> id !== a.id); saveSkipped(); }
    if(a && a.kind === 'debt'){ const d = debts.find(x=> x.id === a.id); if(d){ d.paidAmount = a.prev; saveDebts(); } }
    if(a && a.kind === 'goal'){ const g = goals.find(x=> x.id === a.id); if(g){ g.current = a.prev; saveGoals(); } }   // prenos brise postojeci kod (item.ids)
    if(a && a.kind === 'shopAdd' && a.created.length){ shopping.items = shopping.items.filter(it=> !a.created.includes(it.id)); saveShopping(); }
    if(a && a.kind === 'restore'){ entries.push(a.entry); if(a.entry.type === 'expense') applyRoundUpSaving && applyRoundUpSaving(a.entry.amount); saveEntries(); }
```
(Proveri tačno ime funkcije za zaokruživanje koja je par `unapplyRoundUpSaving`; ako ne postoji, ne vraćaj uštedu.) `/ponisti` bez id-ja uzima i radnje (ne samo unose) — postojeći izbor „poslednji neponišten u 24 h“ to već radi.

`recPaid` poništavanje: unos `rec-<id>-<mKey>` je u `ids`, pa ga postojeći kod briše; `applied/skipped` se vraćaju iz `prev`.

Svi novi tekstovi kroz `t()` + `i18n.js`.

- [ ] **Step 4:** `npm test`, `npm run copy-web`, smoke → `SVE U REDU`. **Step 5:** commit.

### Task 7: Pregled, izdanje

- [ ] Nezavisan pregled grane (opus agent): ispravi sve Critical/Important sa RED→GREEN testom; sitnice upiši u memoriju `roadmap-2026-10`.
- [ ] `app/package.json` → `1.35.0`; `app/release-notes/1.35.0.md` (srpski + jedna engleska rečenica).
- [ ] `npm run dist`, provera upakovane aplikacije (`scratchpad/run-packaged.js` sa kopijom podataka: `__telegramBridge` postoji, `C.telegramIntent('/nov x').command === 'nov'`).
- [ ] Merge u `main`, `npm run push-source`, pa `npm run release`.
- [ ] Javi korisnici da prvi put proba: `/pomoc`, „šta treba da platimo?“, „platila sam porez“ → Potvrdi → Poništi.
