# Praćenje cena iz računa i tačnija procena nabavke (v1.27) — dizajn

Datum: 2026-10-01 · Aplikacija: Knjiga budžeta 1.26.0 · Dizajn je korisnik odobrio u razgovoru (varijanta 3: poslednja cena + najjeftinija prodavnica).

## Cilj

Iz slikanih računa iz prodavnice prati se cena svakog artikla, i to po jedinici i po prodavnici. U Nabavci se vidi:
- da li je artikal poskupeo ili pojeftinio;
- gde je bio najjeftiniji u poslednjih 90 dana.

Procena troška nabavke koristi te stvarne cene umesto ručno upisanih.

Van ovog posla ostaju: obaveštenja o poskupljenju, poređenje sa javnim cenovnicima i AI.

## Izvor podataka

- **Uzimaju se:** samo rashodi sa `receiptId` (račun iz prodavnice). „Završi kupovinu“ i ručne cene se ne uzimaju.
- **Jedno opažanje** je stavka jednog rashoda: `{ date, store: e.desc, name: purchasedItemName(label), key: itemKey(label), qty, unit, total: itemPrices[i], unitPrice }`.
- **Količina:** od v1.27 račun čuva i `e.itemQty = [{ qty, unit }]`, poravnato sa `items`. Za starije račune količina se čita iz oznake „Mleko (2 kom)“ / „(1,5 kg)“ / „(500 g)“; ako je nema, uzima se 1 kom.
- **Jedinice:** `g → kg` (/1000), `ml → l` (/1000), `kom`, `pak`. Cena po jedinici je `total / qty` (u kg ili l za merne jedinice), zaokružena na pare.
- **Šta se preskače:** stavke bez cene (`null`), sa cenom ≤ 0 i redovi „Razlika do ukupnog“. Njihovo ime nije artikal.

## Jezgro (`budzet-core.js`, testirano)

- `parseItemQty(label) → { qty, unit }`
- `priceObservations(entries) → [opažanje]`, poređano po datumu
- `priceHistory(entries) → Map<key, { key, name, obs: [...] }>`
- `priceInsight(hist, today) → { key, name, last: obs, change: { pct, vs: 'store'|'avg', prev } | null, cheapest: { store, unitPrice, date } | null, unit }`. Pravila:
  - promena se računa prema prethodnom opažanju **u istoj prodavnici**; ako ga nema, prema proseku poslednja 3 opažanja (bilo koja prodavnica) pre poslednjeg;
  - promena se prikazuje samo kad je `|pct| ≥ 3`;
  - najjeftinija cena se traži među opažanjima iz poslednjih 90 dana, u istoj jedinici. Vraća se samo ako je jeftinija od poslednje cene za bar 1% i ako je iz druge prodavnice ili starija od poslednje kupovine.
- `estimateShoppingItem(item, history, preferredStore) → { amount, source: 'store'|'last'|'manual'|null, unitPrice? }`:
  - redosled izvora je: poslednja cena u `item.store` (ili `preferredStore`), pa poslednja cena bilo gde, pa `item.price`, pa ništa;
  - količina sa liste (`item.qty` tipa „2 kom“ / „1,5 kg“ / „500 g“) množi cenu po jedinici, uz pretvaranje jedinica; ako se jedinice ne slažu (npr. lista „2 kom“, a račun u kg), uzima se cena jednog poslednjeg reda (`total`).
- `shoppingEstimate(items, opts)` dobija opcioni `opts.history` i `opts.preferredStore`. Postojeći poziv bez `opts` radi kao do sada (testovi to čuvaju), a rezultat dobija `fromReceipts` (broj stavki sa cenom sa računa).

## Stranica

- **Čuvanje računa** (`saveReceipt`) dodaje na rashod `itemQty`. Isto važi za JSON kopiju (`sanitizeImportedBackup`: niz `{qty>0, unit iz QTY_UNITS}` iste dužine kao `items`) i za Excel (kolona `Kolicine` kao JSON, čita se nazad).
- **Red na listi Nabavke:**
  - uz cenu stoji oznaka, npr. „129,99/kom ↑8%“ (crveno za rast, zeleno za pad);
  - ispod, sitno, „najjeftinije: Lidl 119,00 (pre 12 dana)“;
  - kad je izvor cena sa računa, umesto ručne cene prikazuje se procena za količinu.
- **Prikaz „Cene“:** treće dugme u grupi „Za kupovinu / Sve stavke / Cene“.
  - Spisak artikala ima kolone: ime, poslednja cena po jedinici + prodavnica + datum, promena, najjeftinije.
  - Filter je *Sve / Poskupelo / Pojeftinilo*. Redosled je po apsolutnoj promeni (najveća prva), a zatim po imenu.
  - Klik na artikal otvara dijalog sa istorijom (datum, prodavnica, količina, cena po jedinici) i malim SVG grafikonom cene po jedinici kroz vreme.
- **Podnožje Nabavke:** zbir koristi `shoppingEstimate` sa istorijom, uz tekst „X od Y po ceni sa računa“.

## Testiranje

- **node:test:**
  - `parseItemQty`;
  - opažanja (preskakanje stavki bez cene i razlike, g → kg);
  - promena u istoj prodavnici i pad na prosek;
  - prag od 3%;
  - najjeftinije u 90 dana (starije se ne računa);
  - redosled izvora u proceni, množenje količine i nepoklapanje jedinica;
  - `shoppingEstimate` bez `opts` radi kao ranije.
- **Smoke:**
  - dva rashoda sa `receiptId` u dve prodavnice i dva datuma;
  - oznaka ↑ i „najjeftinije“ na listi;
  - prikaz „Cene“ sa filterom i istorijom;
  - procena u podnožju „po ceni sa računa“;
  - `itemQty` se čuva u kopiji i Excelu.
