# Fiskalni račun iz prodavnice (v1.21.0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplikacija čita fiskalni račun iz prodavnice (jednu ili više slika, ili PDF) preko Groq-a i pravi rashode po kategorijama, sa stavkama i cenama. Stavke se uparuju sa listom za kupovinu, a slika računa se čuva kao prilog.

**Architecture:**
- Sva logika računa je čista i živi u `budzet-core.js`, sa testovima: čišćenje odgovora, spajanje delova, popusti, memorija kategorija, uparivanje, podela na rashode i duplikati.
- Stranica koristi postojeći `desktop.bills.read`, `saveFile` i `openFile` iz v1.20. Glavni proces se ne menja.
- Novi prozor `receiptOverlay` ide u Nabavku.

**Tech Stack:** vanilla JS (budzet-tracker.html), node:test, Electron smoke (test/smoke-checks.js), Groq `qwen/qwen3.8-27b`.

**Spec:** `docs/superpowers/specs/2026-09-30-fiskalni-racun-design.md`

## Global Constraints

- Svaka slika računa je poseban `bills:read` poziv. Slike su JPEG sa dužom stranom do 2000 px i kvalitetom 0.85. PDF šalje `C.compactBillText(text, 6000)` i prvu stranu.
- Nema novih localStorage ključeva. Rashodi dobijaju polja `receiptId` (prolazi `isId`) i `attachments` (niz imena koja prolaze `isAttachmentName`).
- Excel list Stavke dobija kolone `RacunID` i `Prilozi` (imena spojena sa `; `).
- Sav nov UI tekst ide u `i18n.js`, uz proveru sudara preko `i18nadd.js --check`. „Račun“, „Novi račun“ i „Obriši račun“ su zauzeti.
- Fajlovi sa CRLF (`main.js`, `i18n.js`, `smoke-checks.js`, `budzet-core.js`) menjaju se alatom Edit ili node skriptom napisanom alatom Write. **Bash heredoc jede obrnute kose crte.**
- Verzija je 1.21.0. Izdanje ide redom push-source pa release.

## Review Focus

1. **Račun od 40+ stavki u 3 dela sa preklapanjem od 1–3 reda.** Nijedna stavka ne sme da se dupla niti da nestane. Test je u Task 1 (`mergeReceiptParts`).
2. **Popust u prvom redu ili popust veći od prethodne stavke.** Cene ne smeju biti negativne, a zbir mora da ostane tačan. Test je u Task 1 (`applyReceiptDiscounts`).
3. **Unet „Ukupno“ različit od zbira stavki za nekoliko para.** Zbir rashoda mora biti tačno „Ukupno“, bez greške u parama. Test je u Task 2 (`receiptToExpenses`).
4. **Ista stavka dvaput na računu (2× hleb) i jedna stavka „Hleb“ na listi.** Upari se samo jednom. Test je u Task 2 (`matchReceiptToShopping`).
5. **Deo računa koji nije pročitan (429/413/mreža).** Ostali delovi ostaju, poruka kaže koji deo, a „Pokušaj ponovo“ čita samo taj deo. Test je u Task 5 (smoke).

---

### Task 1: Core — uputstvo, čišćenje, spajanje delova, popusti

**Files:** Modify `budzet-core.js` (nova sekcija „Fiskalni račun“ posle sekcije kućnih računa, pre `// ---------- Provera Excel fajla`), Test `app/test/core.test.js`

**Interfaces — Produces:**
- `C.isAttachmentName(name) → boolean`. Samo ime fajla sa ekstenzijom pdf/jpg/jpeg/png/webp/heic, bez `\/:*?"<>|` i bez vodeće tačke. Ovu proveru koristi i `cleanBills`, umesto sadašnjeg inline regex-a.
- `C.itemKey(label) → string`, jednako `foldText(purchasedItemName(label))`.
- `C.receiptPrompt(categories: string[]) → string`.
- `C.cleanReceiptReading(raw, { categories }) → { store, date, total, items: Item[], low: string[] } | null`, gde je `Item = { raw, name, qty, unit, price: number|null, category, discount: boolean }`.
- `C.mergeReceiptParts(parts: Reading[]) → Reading` (prazan niz → `null`).
- `C.applyReceiptDiscounts(items) → Item[]`. Vraća stavke bez redova popusta, a cene su ≥ 0 i zbir je očuvan.

- [ ] **Step 1: Failing tests** (na kraj `app/test/core.test.js`)

```js
test('isAttachmentName i itemKey', () => {
  assert.equal(C.isAttachmentName('2026-09-30-racun-maxi-1.jpg'), true);
  assert.equal(C.isAttachmentName('x.bat'), false);
  assert.equal(C.isAttachmentName('..\\x.pdf'), false);
  assert.equal(C.isAttachmentName('.x.pdf'), false);
  assert.equal(C.itemKey('Mleko (2 kom)'), 'mleko');
  assert.equal(C.itemKey('Čokolada'), 'cokolada');
});

test('receiptPrompt i cleanReceiptReading', () => {
  const p = C.receiptPrompt(['Hrana', 'Higijena']);
  assert.match(p, /"Hrana", "Higijena"/);
  assert.match(p, /"discount"/);
  const raw = 'Evo:\n```json\n{"store":"Maxi","date":"30.09.2026","total":"1.234,50","items":[' +
    '{"raw":"MLEKO IMLEK 2,8% 1L","name":"Mleko","qty":"2","unit":"kom","price":"259,98","category":"Hrana"},' +
    '{"raw":"POPUST","name":"","price":-20,"discount":1},' +
    '{"raw":"SAPUN DOVE 100G","price":"199,00","category":"Kozmetika"},' +
    '{"raw":"","name":"","price":null}]}\n```';
  const r = C.cleanReceiptReading(raw, { categories: ['Hrana', 'Higijena'] });
  assert.equal(r.store, 'Maxi');
  assert.equal(r.date, '2026-09-30');
  assert.equal(r.total, 1234.5);
  assert.equal(r.items.length, 3);
  assert.deepEqual(r.items[0], { raw: 'MLEKO IMLEK 2,8% 1L', name: 'Mleko', qty: 2, unit: 'kom', price: 259.98, category: 'Hrana', discount: false });
  assert.equal(r.items[1].discount, true);
  assert.equal(r.items[1].price, -20);
  assert.equal(r.items[2].name, 'Sapun dove');          // kratko ime iz raw
  assert.equal(r.items[2].category, '');                // Kozmetika nije korisnikova kategorija
  assert.equal(C.cleanReceiptReading('nista', { categories: [] }), null);
  assert.deepEqual(C.cleanReceiptReading({ items: [] }, { categories: [] }).low.sort(), ['date', 'items', 'total']);
});

test('mergeReceiptParts: redosled, preklapanje do 3 reda, ukupno iz poslednjeg dela', () => {
  const it = (raw, price) => ({ raw, name: raw, qty: 1, unit: '', price, category: '', discount: false });
  const a = { store: 'Maxi', date: '2026-09-30', total: null, items: [it('A', 1), it('B', 2), it('C', 3)], low: ['total'] };
  const b = { store: '', date: '', total: 16, items: [it('B', 2), it('C', 3), it('D', 4), it('E', 6)], low: [] };
  const m = C.mergeReceiptParts([a, b]);
  assert.deepEqual(m.items.map(x => x.raw), ['A', 'B', 'C', 'D', 'E']);
  assert.equal(m.store, 'Maxi');
  assert.equal(m.total, 16);
  assert.ok(!m.low.includes('total'));
  // isto ime, druga cena -> nije preklapanje
  const c = { store: '', date: '', total: null, items: [it('C', 9), it('F', 1)], low: [] };
  assert.deepEqual(C.mergeReceiptParts([a, c]).items.map(x => x.raw), ['A', 'B', 'C', 'C', 'F']);
  assert.equal(C.mergeReceiptParts([]), null);
});

test('applyReceiptDiscounts: popust na prethodnu stavku, veci popust srazmerno, popust na pocetku', () => {
  const it = (name, price, discount) => ({ raw: name, name, qty: 1, unit: '', price, category: '', discount: !!discount });
  const r1 = C.applyReceiptDiscounts([it('A', 100), it('B', 50), it('pop', -10, 1)]);
  assert.deepEqual(r1.map(x => [x.name, x.price]), [['A', 100], ['B', 40]]);
  const r2 = C.applyReceiptDiscounts([it('A', 100), it('B', 50), it('pop', -60, 1)]);   // veci od B -> srazmerno na A i B
  assert.equal(r2.length, 2);
  assert.equal(Math.round((r2[0].price + r2[1].price) * 100), 9000);
  assert.ok(r2.every(x => x.price >= 0));
  const r3 = C.applyReceiptDiscounts([it('pop', -5, 1), it('A', 30), it('B', 20)]);    // popust pre stavki
  assert.equal(Math.round((r3[0].price + r3[1].price) * 100), 4500);
  const r4 = C.applyReceiptDiscounts([it('A', null), it('B', 20)]);                     // bez cene ostaje null
  assert.equal(r4[0].price, null);
});
```

- [ ] **Step 2: Run:** `cd /e/Vanja/app && npm test`. Očekuje se FAIL (`C.isAttachmentName is not a function`).

- [ ] **Step 3: Implement** (nova sekcija u `budzet-core.js`, pisana alatom Write u scratch i ubačena preko `ins.js ... before "  // ---------- Provera Excel fajla i fajla kopije ----------"`)

```js
  // ---------- Fiskalni racun iz prodavnice ----------
  const ATTACH_RE = /^[^\\/:*?"<>|]+\.(pdf|jpe?g|png|webp|heic)$/i;
  const isAttachmentName = n => typeof n === 'string' && n.length <= 160 && n[0] !== '.' && ATTACH_RE.test(n);
  const itemKey = label => foldText(purchasedItemName(label));
  function receiptPrompt(categories){
    return [
      'Čitaš fiskalni račun iz prodavnice (Srbija/BiH), sa slike ili iz teksta. Slika može biti samo DEO dugačkog računa.',
      'Vrati SAMO jedan JSON objekat tačno ovog oblika:',
      '{"store":"","date":"YYYY-MM-DD","total":0,"items":[{"raw":"","name":"","qty":1,"unit":"kom","price":0,"category":"","discount":0}],"confidence":{"total":"high"}}',
      'Pravila:',
      '- items: svaki red sa artiklom, redom kako stoje na računu. raw = tekst reda; name = kratko ime stvari na srpskom (npr. "Mleko", "Hleb", "Deterdžent").',
      '- price = UKUPNA cena reda (količina × jedinična cena) kao JSON broj sa tačkom. Popust u posebnom redu = stavka sa negativnom cenom i "discount":1.',
      '- category: jedna od ovih kategorija korisnika ili "": ' + (categories || []).map(c => '"' + c + '"').join(', ') + '.',
      '- total = UKUPNO za plaćanje (ako se na ovom delu ne vidi, stavi null). store i date samo ako se vide.',
      '- Ne izmišljaj redove ni cene; nečitljivo = null. Ne vraćaj PDV rekapitulaciju, načine plaćanja ni kusur kao stavke.'
    ].join('\n');
  }
  const shortItemName = raw => {
    const s = String(raw || '').replace(/\d+([.,]\d+)?\s*(%|kg|gr?|l|ml|kom|x)?\b/gi, ' ').replace(/[^\p{L}\s-]/gu, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
    return s ? s[0].toUpperCase() + s.slice(1) : '';
  };
  function cleanReceiptReading(raw, ctx){
    const o = extractJson(raw);
    if(!o) return null;
    const cats = (ctx && ctx.categories) || [];
    const catFor = c => cats.find(x => foldText(x) === foldText(c)) || '';
    const items = (Array.isArray(o.items) ? o.items : []).filter(i => i && typeof i === 'object').map(i => {
      const rawText = String(i.raw || '').trim().slice(0, 120);
      const name = (String(i.name || '').trim() || shortItemName(rawText)).slice(0, 60);
      const price = parseAmount(i.price);
      const qty = parseAmount(i.qty);
      const discount = !!i.discount || (Number.isFinite(price) && price < 0);
      return { raw: rawText, name, qty: Number.isFinite(qty) && qty > 0 ? qty : 1, unit: String(i.unit || '').trim().slice(0, 8),
        price: Number.isFinite(price) ? round2(price) : null, category: catFor(i.category), discount };
    }).filter(i => i.name || i.price != null);
    const total = parseAmount(o.total);
    const out = { store: String(o.store || '').trim().slice(0, 60), date: readDate(o.date), total: Number.isFinite(total) && total > 0 ? round2(total) : null, items, low: [] };
    if(!out.date) out.low.push('date');
    if(out.total == null) out.low.push('total');
    if(!items.length) out.low.push('items');
    return out;
  }
  function mergeReceiptParts(parts){
    const list = (parts || []).filter(Boolean);
    if(!list.length) return null;
    const key = i => foldText(i.raw || i.name) + '|' + i.price;
    const items = [];
    list.forEach(p => {
      const next = p.items.slice();
      for(let k = Math.min(3, items.length, next.length); k >= 1; k--){
        const tail = items.slice(items.length - k).map(key), head = next.slice(0, k).map(key);
        if(tail.every((x, j) => x === head[j])){ next.splice(0, k); break; }
      }
      items.push(...next);
    });
    const first = f => (list.find(p => p[f]) || {})[f] || '';
    const lastTotal = list.slice().reverse().find(p => p.total != null);
    const out = { store: first('store'), date: first('date'), total: lastTotal ? lastTotal.total : null, items, low: [] };
    if(!out.date) out.low.push('date');
    if(out.total == null) out.low.push('total');
    if(!items.length) out.low.push('items');
    return out;
  }
  // Popust (negativna stavka) se oduzima od prethodne stavke; ako je veci od nje ili nema prethodne -> srazmerno na sve sa cenom
  function applyReceiptDiscounts(items){
    const out = [];
    const spread = (targets, d) => {
      const sum = targets.reduce((s, x) => s + x.price, 0);
      if(sum <= 0) return;
      let left = Math.round(-d * 100);
      targets.forEach((x, idx) => {
        const cut = idx === targets.length - 1 ? left : Math.min(left, Math.round(-d * 100 * x.price / sum));
        x.price = round2((Math.round(x.price * 100) - cut) / 100); left -= cut;
      });
    };
    const pending = [];
    (items || []).forEach(i => {
      if(!(i.discount && i.price != null && i.price < 0)){ out.push(Object.assign({}, i)); return; }
      const prev = [...out].reverse().find(x => x.price > 0);
      if(prev && prev.price + i.price >= 0) prev.price = round2(prev.price + i.price);
      else if(out.some(x => x.price > 0)) spread(out.filter(x => x.price > 0), i.price);
      else pending.push(i.price);
    });
    pending.forEach(d => spread(out.filter(x => x.price > 0), d));
    return out;
  }
```
`cleanBills` dobija `if(isStr(b.file) && isAttachmentName(b.file)) out.file = b.file;`, umesto inline regex-a.

Izvoz: `isAttachmentName, itemKey, receiptPrompt, cleanReceiptReading, mergeReceiptParts, applyReceiptDiscounts,`

Napomena: `extractJson`, `readDate` i `purchasedItemName` su definisani ranije u fajlu (`purchasedItemName` je u sekciji „Kupljene stvari“, oko reda 884). Nova sekcija mora da stoji **posle** njih. Ako je sekcija kućnih računa ispred „Kupljene stvari“, nova sekcija ide pre „Provere Excel fajla“, jer je to kraj fajla.

- [ ] **Step 4: Run:** `npm test`. Očekuje se PASS.
- [ ] **Step 5: Commit** „Jezgro: fiskalni račun — čitanje, delovi, popusti“

---

### Task 2: Core — memorija kategorija, uparivanje, rashodi, duplikat

**Files:** `budzet-core.js`, `app/test/core.test.js`

**Interfaces — Produces:**
- `C.itemCategoryMemory(entries, shoppingItems) → Map<itemKey, category>`
- `C.matchReceiptToShopping(items, shoppingItems) → [{ receiptIndex, shoppingId }]`
- `C.receiptToExpenses(items, total) → [{ category, amount, items: Item[], itemPrices: number[] }]`. Redovi su sortirani po iznosu opadajuće. Zbir iznosa je tačno `total` kad je `total > 0`, a inače zbir cena.
- `C.findReceiptDuplicate(entries, date, total) → receiptId | null`

- [ ] **Step 1: Failing tests**

```js
test('itemCategoryMemory: poslednji rashod pobedjuje, lista ima prednost', () => {
  const entries = [
    { type: 'expense', date: '2026-08-01', category: 'Hrana', items: ['Mleko (2 kom)', 'Sapun'] },
    { type: 'expense', date: '2026-09-01', category: 'Higijena', items: ['Sapun'] },
    { type: 'income', date: '2026-09-02', category: 'Plata', items: ['Mleko'] }
  ];
  const m = C.itemCategoryMemory(entries, [{ name: 'Čokolada', category: 'Slatkiši' }, { name: 'Bez', category: '' }]);
  assert.equal(m.get('mleko'), 'Hrana');
  assert.equal(m.get('sapun'), 'Higijena');
  assert.equal(m.get('cokolada'), 'Slatkiši');
  assert.equal(m.has('bez'), false);
});

test('matchReceiptToShopping: tacno, prefiks, dijakritike, svaka stavka jednom, samo trazene', () => {
  const items = [{ name: 'Mleko', raw: 'MLEKO IMLEK' }, { name: 'Hleb', raw: 'HLEB' }, { name: 'Hleb', raw: 'HLEB' }, { name: 'Čokolada milka', raw: 'COKOLADA MILKA 100G' }, { name: 'Jaja', raw: 'JAJA 10' }];
  const list = [{ id: 's1', name: 'hleb', needed: true }, { id: 's2', name: 'Cokolada', needed: true }, { id: 's3', name: 'Mleko', needed: true }, { id: 's4', name: 'Jaja', needed: false }, { id: 's5', name: 'Mlekar', needed: true }];
  const m = C.matchReceiptToShopping(items, list);
  assert.deepEqual(m.sort((a, b) => a.receiptIndex - b.receiptIndex), [{ receiptIndex: 0, shoppingId: 's3' }, { receiptIndex: 1, shoppingId: 's1' }, { receiptIndex: 3, shoppingId: 's2' }]);
});

test('receiptToExpenses: grupe po kategoriji, razlika do ukupnog na pare tacno', () => {
  const it = (name, price, category) => ({ raw: name, name, qty: 1, unit: '', price, category, discount: false });
  const rows = C.receiptToExpenses([it('A', 100, 'Hrana'), it('B', 33.33, 'Higijena'), it('C', 50, 'Hrana'), it('D', null, 'Hrana')], 183.34);
  assert.deepEqual(rows.map(r => r.category), ['Hrana', 'Higijena']);
  assert.equal(rows[0].items.length, 3);
  assert.deepEqual(rows[0].itemPrices, [100, 50, null]);
  assert.equal(Math.round((rows[0].amount + rows[1].amount) * 100), 18334);
  const noTotal = C.receiptToExpenses([it('A', 10.1, 'X'), it('B', 20.2, 'Y')], null);
  assert.equal(Math.round(noTotal.reduce((s, r) => s + r.amount, 0) * 100), 3030);
  const scaled = C.receiptToExpenses([it('A', 10, 'X'), it('B', 10, 'Y'), it('C', 10, 'Z')], 100);
  assert.equal(Math.round(scaled.reduce((s, r) => s + r.amount, 0) * 100), 10000);
  assert.deepEqual(C.receiptToExpenses([], 50), []);
});

test('findReceiptDuplicate', () => {
  const entries = [{ type: 'expense', date: '2026-09-30', amount: 100, receiptId: 'R1' }, { type: 'expense', date: '2026-09-30', amount: 83.34, receiptId: 'R1' }, { type: 'expense', date: '2026-09-30', amount: 183.34 }];
  assert.equal(C.findReceiptDuplicate(entries, '2026-09-30', 183.5), 'R1');
  assert.equal(C.findReceiptDuplicate(entries, '2026-09-29', 183.34), null);
  assert.equal(C.findReceiptDuplicate(entries, '2026-09-30', 200), null);
});
```

- [ ] **Step 2: Run:** očekuje se FAIL.
- [ ] **Step 3: Implement**

```js
  function itemCategoryMemory(entries, shoppingItems){
    const m = new Map();
    (entries || []).filter(e => e && e.type === 'expense' && Array.isArray(e.items) && e.category)
      .slice().sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .forEach(e => e.items.forEach(l => { const k = itemKey(l); if(k) m.set(k, e.category); }));
    (shoppingItems || []).forEach(i => { const k = itemKey(i && i.name); if(k && i.category) m.set(k, i.category); });
    return m;
  }
  function matchReceiptToShopping(items, shoppingItems){
    const cands = (shoppingItems || []).filter(s => s && s.needed);
    const used = new Set(), out = [], taken = new Set();
    const pass = test => (items || []).forEach((it, idx) => {
      if(taken.has(idx)) return;
      const s = cands.find(c => !used.has(c.id) && test(it, foldText(c.name)));
      if(s){ used.add(s.id); taken.add(idx); out.push({ receiptIndex: idx, shoppingId: s.id }); }
    });
    const starts = (text, word) => { const t = foldText(text); return !!word && t.startsWith(word) && !/\p{L}/u.test(t.charAt(word.length)); };
    pass((it, w) => foldText(it.name) === w);
    pass((it, w) => starts(it.name, w) || starts(it.raw, w));
    return out;
  }
  function receiptToExpenses(items, total){
    const groups = new Map();
    (items || []).forEach(i => { const c = i.category || 'Ostalo'; if(!groups.has(c)) groups.set(c, []); groups.get(c).push(i); });
    const rows = [...groups.entries()].map(([category, its]) => ({ category, items: its, itemPrices: its.map(i => i.price != null ? i.price : null),
      cents: its.reduce((s, i) => s + (i.price > 0 ? Math.round(i.price * 100) : 0), 0) }));
    if(!rows.length) return [];
    const sumC = rows.reduce((s, r) => s + r.cents, 0);
    const target = total > 0 ? Math.round(total * 100) : sumC;
    if(sumC > 0 && target !== sumC) rows.forEach(r => { r.cents = Math.round(r.cents * target / sumC); });
    else if(sumC === 0) rows.forEach((r, i) => { r.cents = i === 0 ? target : 0; });
    rows.sort((a, b) => b.cents - a.cents || a.category.localeCompare(b.category));
    rows[0].cents += target - rows.reduce((s, r) => s + r.cents, 0);
    return rows.map(r => ({ category: r.category, amount: r.cents / 100, items: r.items, itemPrices: r.itemPrices }));
  }
  function findReceiptDuplicate(entries, date, total){
    const sums = new Map();
    (entries || []).forEach(e => { if(e && e.type === 'expense' && e.receiptId && e.date === date) sums.set(e.receiptId, (sums.get(e.receiptId) || 0) + e.amount); });
    for(const [id, s] of sums) if(Math.abs(s - total) <= 1) return id;
    return null;
  }
```
Izvoz: `itemCategoryMemory, matchReceiptToShopping, receiptToExpenses, findReceiptDuplicate,`

- [ ] **Step 4:** `npm test` → PASS. **Step 5:** Commit „Jezgro: fiskalni račun — kategorije, lista, rashodi, duplikat“

---

### Task 3: Stranica — polja na rashodu (kopija, Excel) i 📎 u Rashodima

**Files:** `budzet-tracker.html`:
- `sanitizeImportedBackup` (map za entries);
- `buildWorkbook` (Stavke);
- `parseWorkbook` (Stavke);
- `renderExpenses` (row-actions).

Uz to `app/test/smoke-checks.js` i `i18n.js`.

**Interfaces — Consumes:** `C.isAttachmentName`. **Produces:** rashod `{ receiptId?, attachments? }` preživi JSON kopiju i Excel; dugme `.att-btn[data-id]` u redu rashoda poziva `desktop.bills.openFile(attachments[0])`.

- [ ] **Step 1: Failing smoke** (pre `// Cuvanje u fajl`):
```js
    // Fiskalni racun: polja na rashodu prezive Excel i kopiju, 📎 u Rashodima
    {
      const e = { id: 'smoke-rcpt-1', type: 'expense', desc: 'Smoke Maxi', amount: 10, category: 'Hrana', date: monthKey(new Date()) + '-01', paid: true, tags: ['nabavka'], items: ['Mleko'], itemPrices: [10], receiptId: 'smokeR1', attachments: ['2026-09-30-racun-smoke-1.jpg'] };
      window.__addEntriesRaw([e]);
      const san = window.__sanitizeImportedBackup({ entries: [e, Object.assign({}, e, { id: 'smoke-rcpt-2', receiptId: '"><x', attachments: ['..\\a.pdf', 'ok.pdf'] })] });
      check('račun: kopija čuva receiptId i priloge', san.entries[0].receiptId === 'smokeR1' && san.entries[0].attachments[0] === e.attachments[0] && san.entries[1].receiptId === undefined && san.entries[1].attachments.join() === 'ok.pdf', JSON.stringify(san.entries[1]));
      const ws = window.__buildWorkbook().Sheets['Stavke'];
      const row = XLSX.utils.sheet_to_json(ws, { defval: '' }).find(r => r.ID === 'smoke-rcpt-1');
      check('račun: Excel kolone RacunID i Prilozi', !!row && row.RacunID === 'smokeR1' && row.Prilozi === e.attachments[0], JSON.stringify(row));
      go('rashodi'); await sleep(80);
      check('račun: 📎 u listi rashoda', !!document.querySelector('.att-btn[data-id="smoke-rcpt-1"]'));
      window.__deleteEntriesById(['smoke-rcpt-1']);
    }
```
Hook `__addEntriesRaw` se dodaje ako ne postoji (`grep -n "__addEntriesRaw" budzet-tracker.html`), u obliku `window.__addEntriesRaw = list => { entries.push(...list); saveEntries(); invalidate(); };`. Proveri da li `renderExpenses` prikazuje tekući mesec, jer datum smoke stavke je 1. u tekućem mesecu.

- [ ] **Step 2:** Pokreni smoke (`npm run copy-web && node test/smoke.js`, ponovi ako je rezultat prazan). Očekuje se FAIL za te tri provere.
- [ ] **Step 3: Implement.**
  - U `sanitizeImportedBackup` (entries map) dodaj:
    `if(typeof e.receiptId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(e.receiptId)) o.receiptId = e.receiptId; else delete o.receiptId;`
    `if(Array.isArray(e.attachments)){ const a = e.attachments.filter(C.isAttachmentName); if(a.length) o.attachments = a; else delete o.attachments; } else delete o.attachments;`
  - U `buildWorkbook` Stavke dodaj `RacunID: e.receiptId || '', Prilozi: (e.attachments || []).join('; ')`.
  - U `parseWorkbook` Stavke dodaj:
    `...(/^[A-Za-z0-9_-]{1,64}$/.test(String(r.RacunID||'')) ? { receiptId: String(r.RacunID) } : {}),`
    `...(String(r.Prilozi||'').split(';').map(x=> x.trim()).filter(C.isAttachmentName).length ? { attachments: String(r.Prilozi).split(';').map(x=> x.trim()).filter(C.isAttachmentName) } : {})`.
  - U `renderExpenses` row-actions, pre `edit-btn`, dodaj:
    `${e.attachments && e.attachments.length && window.desktop ? `<button class="att-btn" data-id="${e.id}" title="${escapeHtml(t('Otvori račun iz prodavnice'))}">📎</button>` : ''}`.
  - Klik se hvata delegiranjem na tabeli rashoda (pogledaj kako se vezuje `.dup-btn`, pa isto uradi za `.att-btn`): `const e = entries.find(x=> x.id === btn.dataset.id); if(e && e.attachments) window.desktop.bills.openFile(e.attachments[0]).then(r=>{ if(!r || !r.ok) appAlert(t('Prilog nije pronađen u folderu Prilozi.')); });`.
- [ ] **Step 4:** Smoke → sve ✓. **Step 5:** EN za `'Otvori račun iz prodavnice'` i `'Prilog nije pronađen u folderu Prilozi.'` (prvo `--check`), pa Commit.

---

### Task 4: Stranica — prozor „Račun iz prodavnice“, čitanje po delovima, čuvanje

**Files:** `budzet-tracker.html`:
- dugme u Nabavci (pored „Završi kupovinu“, `grep -n "finishShopBtn\|Završi kupovinu" budzet-tracker.html`);
- modal `receiptOverlay` (posle `billOverlay`);
- kod posle bloka kućnih računa;
- `drop` handler (ekran Nabavka);
- Escape handler.

Uz to `i18n.js` i `app/test/smoke-checks.js`.

**Interfaces — Consumes:**
- Task 1–2;
- `prepareBillFile`, gde se za račun iz prodavnice prosleđuje `maxSide` 2000 (proširi potpis: `prepareBillFile(file, opts)`, `opts.maxSide`, `opts.maxPages`);
- `BILL_ERR`, `saveEntries`, `saveShopping`, `showUndoToast`, `applyRoundUpSaving`, `defaultAccountId`, `shopping`, `expenseCats`, `newId`.

**Produces:**
- `addReceiptFiles(files) → Promise<void>`;
- `openReceiptReview(state) → Promise<boolean>`;
- hookovi `__addReceiptFiles`, `__fakeReceiptReading` (setter: `(req, partIndex) → {ok, content}`), `__receiptState()`, `__saveReceipt()`.

- [ ] **Step 1: Failing smoke** (pre `// Cuvanje u fajl`):
```js
    // Fiskalni racun: 2 dela sa preklapanjem, lista od 3 stavke, rashodi po kategorijama, undo
    if (typeof window.__addReceiptFiles === 'function') {
      const sh = window.__shopping();
      const mk = (name, category) => ({ id: 'smoke-sl-' + name, name, section: 'Ostalo', store: '', category, price: null, qty: '', needed: true, checked: false });
      window.__addExpenseCategory('Smoke higijena');
      sh.items.push(mk('Mleko', 'Hrana'), mk('Hleb', 'Hrana'), mk('Sapun', 'Smoke higijena')); window.__saveShopping();
      const part1 = { store: 'Smoke Maxi', date: monthKey(new Date()) + '-02', total: null, items: [{ raw: 'MLEKO 1L', name: 'Mleko', price: 129.99, category: 'Hrana' }, { raw: 'HLEB SAVA', name: 'Hleb', price: 89, category: 'Hrana' }, { raw: 'JAJA 10', name: 'Jaja', price: 250, category: 'Hrana' }] };
      const part2 = { total: 700, items: [{ raw: 'JAJA 10', name: 'Jaja', price: 250, category: 'Hrana' }, { raw: 'SAPUN DOVE', name: 'Sapun', price: 150, category: '' }, { raw: 'POPUST', price: -10, discount: 1 }, { raw: 'KESA', name: 'Kesa', price: 60.5, category: '' }] };
      const seen = [];
      window.__fakeReceiptReading = (req, i) => { seen.push({ i, n: req.images.length }); return { ok: true, content: JSON.stringify(i === 0 ? part1 : part2) }; };
      const img = await new Promise(r => { const c = document.createElement('canvas'); c.width = 300; c.height = 600; c.getContext('2d').fillRect(0, 0, 10, 10); c.toBlob(r, 'image/jpeg'); });
      const p = window.__addReceiptFiles([new File([img], 'r1.jpg', { type: 'image/jpeg' }), new File([img], 'r2.jpg', { type: 'image/jpeg' })]);
      await sleep(2500);
      const st = window.__receiptState();
      check('račun: dva dela, dva poziva po jedna slika', seen.length === 2 && seen.every(x => x.n === 1), JSON.stringify(seen));
      check('račun: preklapanje spojeno, popust primenjen', !!st && st.items.map(x => x.name).join() === 'Mleko,Hleb,Jaja,Sapun,Kesa' && st.items[3].price === 140, st && JSON.stringify(st.items.map(x => [x.name, x.price])));
      check('račun: sapun dobija kategoriju sa liste', !!st && st.items[3].category === 'Smoke higijena');
      check('račun: razlika prikazana', /Razlika/.test($('receiptDiff').textContent) && $('receiptAddDiff').style.display !== 'none', $('receiptDiff').textContent);
      $('receiptAddDiff').click(); await sleep(50);
      const n0 = entries().length;
      $('receiptSave').click(); await p; await sleep(200);
      const made = entries().slice(n0);
      const sum = Math.round(made.reduce((s, e) => s + e.amount, 0) * 100);
      check('račun: rashodi po kategorijama, zbir = ukupno', made.length >= 2 && sum === 70000 && made.every(e => e.receiptId && e.receiptId === made[0].receiptId && e.tags.includes('nabavka') && e.itemPrices.length === e.items.length), JSON.stringify(made.map(e => [e.category, e.amount])));
      check('račun: prilozi sačuvani', made.every(e => Array.isArray(e.attachments) && e.attachments.length === 2));
      const sl = window.__shopping().items.filter(i => i.id.startsWith('smoke-sl-'));
      check('račun: stavke sa liste skinute i dobile cenu', sl.every(i => !i.needed) && sl.find(i => i.name === 'Mleko').price === 129.99, JSON.stringify(sl));
      // duplikat
      window.__fakeReceiptReading = () => ({ ok: true, content: JSON.stringify({ store: 'Smoke Maxi', date: part1.date, total: 700, items: [{ name: 'X', price: 700, category: 'Hrana' }] }) });
      const p2 = window.__addReceiptFiles([new File([img], 'r3.jpg', { type: 'image/jpeg' })]); await sleep(1500);
      check('račun: duplikat upozorenje', /već unet/.test($('receiptStatus').textContent), $('receiptStatus').textContent);
      $('receiptCancel').click(); await p2;
      // undo
      window.__undoTop(); await sleep(150);
      check('račun: undo briše rashode i vraća listu', !entries().some(e => e.receiptId === made[0].receiptId) && window.__shopping().items.filter(i => i.id.startsWith('smoke-sl-')).every(i => i.needed));
      window.__shopping().items = window.__shopping().items.filter(i => !i.id.startsWith('smoke-sl-')); window.__saveShopping();
      window.__deleteExpenseCategory('Smoke higijena');
      window.__fakeReceiptReading = null;
    } else check('račun: hook postoji', false);
```
Proveri da li `window.__shopping().items` može da se prepiše (`shopping.items = …` preko objekta, jer `__shopping` vraća referencu). Ako ne može, filtriraj na licu mesta sa `splice`.

- [ ] **Step 2:** Smoke → FAIL (`račun: hook postoji`).
- [ ] **Step 3: HTML modal** (posle `billOverlay`):
```html
<div class="modal-overlay" id="receiptOverlay">
  <div class="modal-card receipt-card" role="dialog" aria-modal="true" aria-labelledby="receiptTitle" tabindex="-1">
    <h3 id="receiptTitle">Račun iz prodavnice</h3>
    <div class="bill-layout">
      <div class="bill-preview">
        <div class="bill-preview-img" id="receiptPreview"></div>
        <div class="bill-pages"><button type="button" class="btn-link" id="receiptPrev" aria-label="Prethodni deo">‹</button><span id="receiptPartLabel"></span><button type="button" class="btn-link" id="receiptNext" aria-label="Sledeći deo">›</button>
          <button type="button" class="btn-secondary" id="receiptAddPart">Dodaj još sliku</button><input type="file" id="receiptPartInput" accept="application/pdf,image/*,.heic" hidden>
          <button type="button" class="btn-link" id="receiptRetry" style="display:none;">Pokušaj ponovo</button></div>
      </div>
      <div class="bill-fields">
        <div class="import-status" id="receiptStatus" aria-live="polite"></div>
        <div class="bill-row2">
          <div><label for="receiptStore">Prodavnica</label><input type="text" id="receiptStore" maxlength="60" translate="no"></div>
          <div><label for="receiptDate">Datum</label><input type="date" id="receiptDate"></div>
        </div>
        <label for="receiptTotal">Ukupno sa računa (RSD)</label><input type="number" id="receiptTotal" step="0.01" min="0">
        <div class="receipt-items" id="receiptItems"></div>
        <button type="button" class="btn-link" id="receiptAddItem">+ stavka</button>
        <div class="receipt-sums" id="receiptSums"></div>
        <div class="receipt-diff"><span id="receiptDiff"></span> <button type="button" class="btn-link" id="receiptAddDiff" style="display:none;">Dodaj razliku kao Ostalo</button></div>
      </div>
    </div>
    <div class="modal-actions">
      <button class="cancel-btn" id="receiptCancel">Otkaži</button>
      <button class="save-btn" id="receiptSave">Sačuvaj rashode</button>
    </div>
  </div>
</div>
```
CSS (apple-theme):
```css
.receipt-card{ width: min(980px, 96vw); max-height: 94vh; overflow: auto; }
.receipt-items{ margin-top: 10px; max-height: 44vh; overflow: auto; border-top: 1px solid var(--separator); }
.receipt-row{ display: grid; grid-template-columns: 1fr 9.5em 6.5em 1.6em; gap: 6px; align-items: center; padding: 4px 0; border-bottom: 1px solid var(--separator); }
.receipt-row input, .receipt-row select{ width: 100%; }
.receipt-row .rc-matched{ font-size: 0.78em; color: var(--pos); }
.receipt-row.bill-low input[data-f="price"]{ background: color-mix(in srgb, var(--warn) 18%, var(--card)); box-shadow: inset 0 0 0 1.5px var(--warn); }
.receipt-sums{ margin-top: 8px; font-size: 0.9em; color: var(--ink-soft); }
.receipt-diff{ margin-top: 4px; font-weight: 600; color: var(--warn-text, var(--warn)); }
```
- [ ] **Step 4: Kod** (novi blok posle ekrana kućnih računa):
```js
  // ---------- Fiskalni racun iz prodavnice: slike (delovi) -> Groq po delu -> spajanje -> stavke/kategorije/lista -> rashodi ----------
  const RECEIPT_MAX_SIDE = 2000;
  let fakeReceiptReading = null;
  Object.defineProperty(window, '__fakeReceiptReading', { get: ()=> fakeReceiptReading, set: v=>{ fakeReceiptReading = v; }, configurable: true });
  let receipt = null; // { parts: [{ prep, reading, error }], items, store, date, total, page, resolve, matches }
  const rEl = id => document.getElementById(id);
  async function readReceiptPart(part, idx){
    part.error = part.prep.error || '';
    if(part.error) return;
    const canAi = !!fakeReceiptReading || !!(window.desktop && window.desktop.bills);
    if(!canAi){ part.error = BILL_ERR.nokey(); return; }
    const req = { images: part.prep.images, text: part.prep.text, prompt: C.receiptPrompt(expenseCats) };
    let res;
    try{ res = fakeReceiptReading ? await fakeReceiptReading(req, idx) : await window.desktop.bills.read(req); }
    catch(e){ res = { ok: false, kind: 'http', message: String(e && e.message || e) }; }
    if(res && res.ok){ part.reading = C.cleanReceiptReading(res.content, { categories: expenseCats }); if(!part.reading) part.error = t('AI odgovor nije mogao da se pročita. Popuni podatke ručno.'); }
    else part.error = (BILL_ERR[res && res.kind] || BILL_ERR.http)(res || {});
  }
  function rebuildReceiptItems(){
    const merged = C.mergeReceiptParts(receipt.parts.map(p=> p.reading)) || { store: '', date: '', total: null, items: [], low: [] };
    const memory = C.itemCategoryMemory(entries, shopping.items);
    const items = C.applyReceiptDiscounts(merged.items).map(i=> Object.assign({}, i, { category: memory.get(C.itemKey(i.name)) || i.category || (expenseCats.includes('Ostalo') ? 'Ostalo' : expenseCats[0]) }));
    receipt.items = items;
    if(!receipt.storeTouched) receipt.store = merged.store;
    if(!receipt.dateTouched) receipt.date = merged.date || toISODateLocal(new Date());
    if(!receipt.totalTouched) receipt.total = merged.total;
    if(!items.length) receipt.items = [{ raw: '', name: '', qty: 1, unit: '', price: null, category: expenseCats.includes('Ostalo') ? 'Ostalo' : expenseCats[0], discount: false }];
  }
  function receiptMatches(){ return C.matchReceiptToShopping(receipt.items, shopping.items); }
  function renderReceipt(){
    const p = receipt.parts[receipt.page];
    rEl('receiptPreview').innerHTML = p && p.prep.images[0] ? `<img src="${p.prep.images[0]}" alt="${escapeHtml(t('Pregled računa'))}">` : `<div class="hint" style="padding:2em;">${escapeHtml(t('Nema pregleda.'))}</div>`;
    rEl('receiptPartLabel').textContent = receipt.parts.length > 1 ? t('Deo {0} od {1}', receipt.page + 1, receipt.parts.length) : '';
    rEl('receiptRetry').style.display = p && p.error && !p.prep.error ? '' : 'none';
    rEl('receiptStore').value = receipt.store || ''; rEl('receiptDate').value = receipt.date || ''; rEl('receiptTotal').value = receipt.total != null ? String(receipt.total) : '';
    const matched = new Map(receiptMatches().map(m=> [m.receiptIndex, m.shoppingId]));
    const catOpts = sel => expenseCats.map(c=> `<option value="${escapeHtml(c)}"${c === sel ? ' selected' : ''} translate="no">${escapeHtml(c)}</option>`).join('');
    rEl('receiptItems').innerHTML = receipt.items.map((i, idx)=> `<div class="receipt-row${i.price == null ? ' bill-low' : ''}" data-i="${idx}">
      <div><input type="text" data-f="name" value="${escapeHtml(i.name)}" translate="no" aria-label="${escapeHtml(t('Stavka'))}" title="${escapeHtml(i.raw)}">${matched.has(idx) ? `<span class="rc-matched">${escapeHtml(t('sa liste ✓'))}</span>` : ''}</div>
      <select data-f="category" aria-label="${escapeHtml(t('Kategorija'))}">${catOpts(i.category)}</select>
      <input type="number" step="0.01" data-f="price" value="${i.price != null ? i.price : ''}" aria-label="${escapeHtml(t('Cena'))}">
      <button type="button" class="btn-link rc-del" aria-label="${escapeHtml(t('Ukloni stavku'))}">×</button></div>`).join('');
    renderReceiptSums();
    const errs = receipt.parts.map((p, i)=> p.error ? (receipt.parts.length > 1 ? t('Deo {0} nije pročitan ({1})', i + 1, p.error) : p.error) : '').filter(Boolean);
    const dup = receipt.date && receipt.total > 0 ? C.findReceiptDuplicate(entries, receipt.date, receipt.total) : null;
    rEl('receiptStatus').textContent = [dup ? t('Ovaj račun je možda već unet ({0}).', receipt.date) : '', ...errs].filter(Boolean).join(' ');
    receipt.duplicate = dup;
  }
  function renderReceiptSums(){
    const rows = C.receiptToExpenses(receipt.items, null);
    const sum = rows.reduce((s, r)=> s + r.amount, 0);
    rEl('receiptSums').textContent = rows.map(r=> `${r.category}: ${fmtNum(r.amount, 2)}`).join(' · ') + (rows.length ? ` · ${t('Stavke ukupno: {0}', fmtNum(Math.round(sum * 100) / 100, 2))}` : '');
    const total = parseFloat(rEl('receiptTotal').value);
    const diff = total > 0 ? Math.round((total - sum) * 100) / 100 : 0;
    rEl('receiptDiff').textContent = Math.abs(diff) >= 0.5 ? t('Razlika: {0}', fmtNum(diff, 2)) : '';
    rEl('receiptAddDiff').style.display = Math.abs(diff) >= 0.5 && diff > 0 ? '' : 'none';
    receipt.diff = diff;
  }
  async function addReceiptFiles(files){
    const list = Array.from(files || []); if(!list.length) return;
    receipt = { parts: [], items: [], page: 0 };
    rEl('receiptStatus').textContent = t('Čitam račun…'); rEl('receiptItems').innerHTML = ''; rEl('receiptPreview').innerHTML = '';
    rEl('receiptSave').disabled = true;
    rEl('receiptOverlay').classList.add('show');
    for(const f of list){ const part = { prep: await prepareBillFile(f, { maxSide: RECEIPT_MAX_SIDE, maxPages: 1 }) }; receipt.parts.push(part); await readReceiptPart(part, receipt.parts.length - 1); }
    rebuildReceiptItems(); renderReceipt();
    rEl('receiptSave').disabled = false;
    return new Promise(res=>{ receipt.resolve = res; });
  }
  window.__addReceiptFiles = addReceiptFiles;
  window.__receiptState = ()=> receipt;
  function closeReceipt(saved){ rEl('receiptOverlay').classList.remove('show'); const r = receipt && receipt.resolve; receipt = null; if(r) r(!!saved); }
  rEl('receiptItems').addEventListener('input', e=>{
    const row = e.target.closest('.receipt-row'); if(!row || !receipt) return;
    const it = receipt.items[+row.dataset.i]; const f = e.target.dataset.f;
    if(f === 'name') it.name = e.target.value; if(f === 'price'){ const v = parseFloat(e.target.value); it.price = Number.isFinite(v) ? v : null; row.classList.toggle('bill-low', it.price == null); }
    renderReceiptSums();
  });
  rEl('receiptItems').addEventListener('change', e=>{ const row = e.target.closest('.receipt-row'); if(row && receipt && e.target.dataset.f === 'category'){ receipt.items[+row.dataset.i].category = e.target.value; renderReceiptSums(); } });
  rEl('receiptItems').addEventListener('click', e=>{ const b = e.target.closest('.rc-del'); if(!b || !receipt) return; receipt.items.splice(+b.closest('.receipt-row').dataset.i, 1); renderReceipt(); });
  rEl('receiptAddItem').addEventListener('click', ()=>{ if(!receipt) return; receipt.items.push({ raw: '', name: '', qty: 1, unit: '', price: null, category: expenseCats.includes('Ostalo') ? 'Ostalo' : expenseCats[0], discount: false }); renderReceipt(); });
  rEl('receiptAddDiff').addEventListener('click', ()=>{ if(!receipt || !(receipt.diff > 0)) return; receipt.items.push({ raw: '', name: t('Razlika do ukupnog'), qty: 1, unit: '', price: receipt.diff, category: expenseCats.includes('Ostalo') ? 'Ostalo' : expenseCats[0], discount: false }); renderReceipt(); });
  rEl('receiptStore').addEventListener('input', e=>{ if(receipt){ receipt.store = e.target.value; receipt.storeTouched = true; } });
  rEl('receiptDate').addEventListener('change', e=>{ if(receipt){ receipt.date = e.target.value; receipt.dateTouched = true; renderReceipt(); } });
  rEl('receiptTotal').addEventListener('input', e=>{ if(receipt){ const v = parseFloat(e.target.value); receipt.total = Number.isFinite(v) ? v : null; receipt.totalTouched = true; renderReceiptSums(); } });
  const flipReceipt = d => { if(!receipt || receipt.parts.length < 2) return; receipt.page = (receipt.page + receipt.parts.length + d) % receipt.parts.length; renderReceipt(); };
  rEl('receiptPrev').addEventListener('click', ()=> flipReceipt(-1));
  rEl('receiptNext').addEventListener('click', ()=> flipReceipt(1));
  rEl('receiptAddPart').addEventListener('click', ()=> rEl('receiptPartInput').click());
  rEl('receiptPartInput').addEventListener('change', async e=>{
    const f = e.target.files[0]; e.target.value = ''; if(!f || !receipt) return;
    rEl('receiptStatus').textContent = t('Čitam račun…');
    const part = { prep: await prepareBillFile(f, { maxSide: RECEIPT_MAX_SIDE, maxPages: 1 }) }; receipt.parts.push(part);
    await readReceiptPart(part, receipt.parts.length - 1); receipt.page = receipt.parts.length - 1; rebuildReceiptItems(); renderReceipt();
  });
  rEl('receiptRetry').addEventListener('click', async ()=>{ if(!receipt) return; const p = receipt.parts[receipt.page]; rEl('receiptStatus').textContent = t('Čitam račun…'); await readReceiptPart(p, receipt.page); rebuildReceiptItems(); renderReceipt(); });
  rEl('receiptCancel').addEventListener('click', ()=> closeReceipt(false));
  rEl('receiptOverlay').addEventListener('click', e=>{ if(e.target.id === 'receiptOverlay') closeReceipt(false); });
  async function saveReceipt(){
    if(!receipt) return;
    const items = receipt.items.filter(i=> i.name.trim() || i.price > 0);
    const total = parseFloat(rEl('receiptTotal').value);
    if(!items.length || !items.some(i=> i.price > 0) && !(total > 0)){ rEl('receiptStatus').textContent = t('Upiši bar jednu stavku sa cenom ili ukupan iznos.'); return; }
    if(receipt.duplicate && !(await appConfirm(t('Ovaj račun je možda već unet ({0}). Ipak dodati?', receipt.date)))) return;
    rEl('receiptSave').disabled = true;
    const store = (rEl('receiptStore').value || '').trim(), date = rEl('receiptDate').value || toISODateLocal(new Date());
    // prilozi: sve slike delova; neuspeh jednog ne blokira rashode (javlja se)
    const attachments = [];
    if(window.desktop && window.desktop.bills){
      for(let i = 0; i < receipt.parts.length; i++){
        const pr = receipt.parts[i].prep; if(!pr.bytes) continue;
        const res = await window.desktop.bills.saveFile(pr.bytes, `${date}-racun-${billSlug(store || 'prodavnica')}-${i + 1}.${pr.ext}`);
        if(res && res.ok) attachments.push(res.name);
      }
    }
    const rows = C.receiptToExpenses(items, total > 0 ? total : null);
    const receiptId = newId(), accountId = accounts.length ? defaultAccountId() : undefined;
    const made = rows.map(r=>{
      const e = { id: newId(), type: 'expense', desc: store || t('Nabavka'), amount: r.amount, category: r.category, date, paid: true, tags: ['nabavka'],
        items: r.items.map(i=> C.purchaseItemLabel({ name: i.name.trim() || i.raw || t('Stavka'), qty: i.qty > 1 || i.unit ? `${fmtNum(i.qty, 3)} ${i.unit || 'kom'}` : '' })),
        itemPrices: r.itemPrices, receiptId };
      if(attachments.length) e.attachments = attachments.slice();
      if(accountId) e.accountId = accountId;
      entries.push(e); applyRoundUpSaving(r.amount);
      return e;
    });
    const matches = C.matchReceiptToShopping(items, shopping.items);
    const before = matches.map(m=> { const s = shopping.items.find(x=> x.id === m.shoppingId); return { s, needed: s.needed, checked: s.checked, price: s.price }; });
    matches.forEach(m=>{ const s = shopping.items.find(x=> x.id === m.shoppingId); const it = items[m.receiptIndex]; s.needed = false; s.checked = false; if(it.price > 0) s.price = it.price; });
    saveEntries(); saveShopping();
    closeReceipt(true); renderAll();
    showUndoToast(t('Račun iz prodavnice dodat ({0} stavki)', items.length), ()=>{
      const ids = new Set(made.map(e=> e.id)); entries = entries.filter(e=> !ids.has(e.id));
      before.forEach(b=>{ b.s.needed = b.needed; b.s.checked = b.checked; b.s.price = b.price; });
      saveEntries(); saveShopping(); renderAll();
    });
  }
  rEl('receiptSave').addEventListener('click', saveReceipt);
  window.__saveReceipt = saveReceipt;
```
Proširi `prepareBillFile(file, opts)`: `const maxSide = (opts && opts.maxSide) || BILL_MAX_SIDE, maxPages = (opts && opts.maxPages) || BILL_MAX_PAGES;` i zameni upotrebe konstanti u funkciji (i u `scaledCanvas`, preko dodatnog parametra).

Dugme u Nabavci: pored „Završi kupovinu“ dodaj `<button class="btn-secondary" id="shopReceiptBtn">Ubaci račun iz prodavnice…</button><input type="file" id="shopReceiptInput" accept="application/pdf,image/*,.heic" multiple hidden>`. Klik otvara input, a `change` poziva `addReceiptFiles(files)`.

Drop handler (iz v1.20) dobija: `if(activeScreen === 'nabavka'){ addReceiptFiles(files); return; }` pre `addBillFiles(files)`. Escape handler dobija: `if(rEl('receiptOverlay').classList.contains('show')){ closeReceipt(false); return; }`.

- [ ] **Step 5:** Smoke → sve ✓. EN za sve nove stringove, proveren preko `i18nadd.js --check`. Commit.

---

### Task 5: Završno — pravi Groq poziv, EN, snimak, pregled, izdanje

- [ ] Pravi poziv: scratch skripta po uzoru na `groq-live.js`. Na canvasu (1000×2000, 28 px font) nacrta izmišljen račun „SMOKE MARKET“ sa 5 stavki, popustom i UKUPNO, pa ga pošalje preko `__fakeReceiptReading = req => desktop.bills.read(req)`. Očekuje se: 5 stavki, tačne cene, popust primenjen, ukupno pročitano.
- [ ] EN ispis (`en-page.js` proširen na `receiptOverlay`) → nema neprevedenog teksta.
- [ ] Snimak prozora sa 6 stavki (svetla i tamna tema) → pregled.
- [ ] Završni pregled: nezavisni recenzent (opus) sa ovim Review Focus. Popravke idu u jedan prolaz, a za svaku prvo test koji pada.
- [ ] `app/release-notes/1.21.0.md`, verzija 1.21.0, `npm test` i smoke, pa push-source i release. Posle toga proveri da je Mac workflow uspeo.
- [ ] Memorija: roadmap (1 gotovo), `budget-desktop-app.md` (polja `receiptId` i `attachments`, hookovi).
