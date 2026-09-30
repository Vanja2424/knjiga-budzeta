# Fiskalni račun iz prodavnice → stavke, cene, kategorije i Nabavka (v1.21) — dizajn

Datum: 2026-09-30 · Aplikacija: Knjiga budžeta 1.20.2 · Dizajn je korisnik odobrio u razgovoru, u dva dela.

## Cilj

Korisnik slika fiskalni račun iz prodavnice (jednu ili više slika za dugačak račun) ili ubaci PDF e-računa. AI pročita:
- prodavnicu i datum;
- ukupan iznos;
- stavke sa cenama.

Aplikacija zatim:
- svakoj stavci dodeli kategoriju;
- upari stavke sa listom za kupovinu, ako na njoj ima stavki;
- prikaže sve na potvrdu;
- sačuva po jedan rashod po kategoriji, sa stavkama i cenama, kao što danas radi „Završi kupovinu“;
- sačuva sliku računa kao prilog.

Cene ulaze u postojeću istoriju „Kupljene stvari“ i u predloge „Vreme je da kupiš“.

Van ovog posla ostaju:
- preuzimanje podataka preko fiskalnog QR koda (suf.purs.gov.rs);
- automatsko sečenje jedne dugačke slike (korisnik šalje više slika);
- druge vrste dokumenata (uplatnice, garancije), koje su posebne stavke na spisku.

## Tok

**Ulaz**
- U Nabavci je dugme **„Ubaci račun iz prodavnice…“**, koje prihvata više fajlova (slike ili PDF).
- Više fajlova izabranih odjednom smatra se **jednim** računom (delovi 1…N).
- U prozoru za potvrdu postoji i dugme **„Dodaj još sliku“** za naredni deo.
- **Prevlačenje u prozor:** na ekranu Nabavka prevučeni fajlovi idu u tok fiskalnog računa. Na ostalim ekranima ostaje tok kućnih računa (v1.20).

**Čitanje** (Groq, isti ključ i isti `bills:read` kao kod kućnih računa)
- **Slike** se smanjuju tako da duža strana ima najviše 2000 px, JPEG 0.85. Svaka slika je **zaseban poziv**, jer jedna slika staje u limit.
- **PDF** šalje sažet tekst (`C.compactBillText`) i prvu stranu, kao kod kućnih računa.
- Posle poziva sa greškom 429 aplikacija sačeka (logika iz v1.20.1, u glavnom procesu). Između delova nema dodatnog čekanja.
- **Uputstvo** (`C.receiptPrompt(categories)`) traži JSON oblika:
  `{ "store": "", "date": "YYYY-MM-DD", "total": 0, "items": [ { "raw": "MLEKO IMLEK 2,8% 1L", "name": "Mleko", "qty": 1, "unit": "kom", "price": 129.99, "category": "Hrana", "discount": 0 } ], "confidence": {…} }`.
  - `price` je ukupna cena reda: količina × jedinična cena, posle popusta ako je popust u istom redu.
  - Popust u posebnom redu vraća se kao stavka sa negativnom cenom i `"discount": 1`.
  - `category` je jedna od kategorija rashoda koje korisnik ima, ili `""`.
- **Spajanje delova** (`C.mergeReceiptParts(parts)`):
  - prodavnica, datum i ukupno uzimaju se iz prvog dela koji ih ima; ukupno iz poslednjeg dela ima prednost, jer je zbir na dnu računa;
  - stavke se nadovezuju redom delova;
  - **preklapanje:** ako se poslednjih k stavki jednog dela (k ≤ 3) poklapa sa prvih k stavki sledećeg po `raw` (ili `name`) i ceni, one se računaju jednom.
- **Čišćenje** (`C.cleanReceiptReading(raw, ctx)`):
  - izvlači JSON (`extractJson`) i brojeve (`parseAmount`), a datum čita preko `readDate`;
  - stavka bez imena i bez cene se odbacuje;
  - kategorija koje korisnik nema postaje `''`;
  - `name` se svodi na kratko ime; ako ga nema, uzima se `raw` bez brojeva i jedinica.
- **Popusti** (`C.applyReceiptDiscounts(items)`): stavka sa negativnom cenom oduzima se od prethodne pozitivne stavke. Ako je popust veći od te stavke, raspoređuje se srazmerno na sve prethodne. Ambalaža (pozitivna stavka „povratna ambalaža“) ostaje posebna stavka.

**Kategorije** (`C.itemCategoryMemory(entries, shoppingItems)` → mapa `purchasedItemKey(name) → category`)
- Uzima se kategorija **poslednjeg** rashoda sa `items` u kome se ta stvar pojavila.
- Za stavke sa liste za kupovinu ima prednost kategorija sa liste (`item.category`), ako je postoji.
- Redosled: memorija, pa predlog AI-ja, pa `Ostalo` ili prva kategorija.
- Izmena kategorije u prozoru za potvrdu se pamti kroz sačuvani rashod, kao sledeći „poslednji“. Posebno skladište nije potrebno.

**Uparivanje sa listom** (`C.matchReceiptToShopping(items, shoppingItems)`)
- Kandidati su samo stavke sa liste koje su `needed` (tražene), štiklirane ili ne.
- Uparuje se po `normShoppingName` + `foldText` imena:
  1. tačno poklapanje kratkog imena;
  2. ime sa liste je početak kratkog imena ili `raw` naziva („Mleko“ ↔ „Mleko Imlek 2,8%“).
- Svaka stavka sa liste upari se najviše jednom.
- Vraća `[{ receiptIndex, shoppingId }]`.
- Posle čuvanja, uparene stavke sa liste dobijaju `needed = false`, `checked = false`, a cena sa računa ide u `item.price`. Ceo taj korak može da se opozove kroz undo, kao kod „Završi kupovinu“.

**Prozor za potvrdu**
- Levo je pregled slika, sa listanjem delova i dugmetom „Dodaj još sliku“.
- Desno su:
  - **Prodavnica**, **Datum**, **Ukupno sa računa**;
  - **tabela stavki**: ime (menja se), kategorija (izbor), cena (menja se), oznaka „sa liste ✓“ i dugme × za brisanje reda; uz tabelu je dugme „+ stavka“.
- Nečitljive stavke (bez cene ili sa `low`) su žute.
- Ispod tabele stoji zbir po kategorijama i **„Razlika: X“** kad se zbir stavki ne slaže sa „Ukupno“ (tolerancija 0,5 din). Dugme **„Dodaj razliku kao Ostalo“** dodaje red, a čuvanje nije blokirano.
- **Duplikat** (`C.findReceiptDuplicate(entries, store, date, total)`) je već postojeći skup rashoda sa istim `receiptId` grupom, istim datumom i istim zbirom (± 1 din). Tada se prikaže upozorenje „Ovaj račun je možda već unet“ i čuvanje traži potvrdu.
- **Čuvanje:** rashodi po kategoriji (`C.receiptToExpenses(items, total)` → `[{ category, amount, items, itemPrices }]`). Iznos kategorije je **zbir cena stavki**. Ako se unet „Ukupno“ razlikuje od zbira stavki, razlika ide srazmerno na kategorije. Svaki rashod dobija:
  - `desc: store || 'Nabavka'`, `tags: ['nabavka']`;
  - `items`: labela sa količinom, preko postojećeg `purchaseItemLabel`;
  - `itemPrices`, `date`, `paid: true`;
  - `receiptId` (zajednički za ceo račun);
  - `attachment` (ime prvog priloga).

  Na kraju se prikaže undo toast „Račun iz prodavnice dodat (N stavki)“.
- **Prilozi:** sve slike računa se čuvaju u `Prilozi` (`bills:save-file`, isti skup dozvoljenih ekstenzija) pod imenom `YYYY-MM-DD-racun-<prodavnica>-<n>.jpg`. Na rashodu stoji `attachments: [imena]`.
- **U listi rashoda**, rashod sa `attachments` ima dugme 📎 „Otvori račun“ (`bills:open-file`).
- **Brisanje** rashoda ne briše prilog, kao ni kod kućnih računa.

**Kad nešto ne uspe**
- Bez ključa ili mreže, ili ako je odgovor nečitljiv, prozor se otvori sa jednim praznim redom i porukom (`BILL_ERR`).
- Deo koji nije pročitan: poruka „Deo N nije pročitan (razlog)“. Ostali delovi se prikazuju, a deo možeš da ponoviš dugmetom „Pokušaj ponovo“.
- Slika koja ne može da se otvori (HEIC) daje istu poruku kao kod kućnih računa.

**Šta se šalje Groq-u:** slike ili tekst računa i nazivi kategorija rashoda. Ništa drugo.

## Čuvanje i kopije

- Nema novih ključeva: rashodi idu u `budzet-stavke-v2`, a lista u `budzet-nabavka-v1`.
- Nova polja na rashodu su `receiptId` i `attachments`. Čuvaju se u JSON kopiji preko `sanitizeImportedBackup`: `receiptId` prema `isId`, `attachments` kao niz imena koja prolaze proveru imena priloga.
- U Excelu, list Stavke dobija kolone `RacunID` i `Prilozi` (imena odvojena sa `; `), a iste kolone se čitaju nazad.

## Delovi koda

- **budzet-core.js** (sa testovima):
  - `receiptPrompt`, `cleanReceiptReading`, `mergeReceiptParts`, `applyReceiptDiscounts`;
  - `itemCategoryMemory`, `matchReceiptToShopping`, `receiptToExpenses`, `findReceiptDuplicate`;
  - proveru imena priloga izdvojenu u `isAttachmentName`, koju koriste `cleanBills` i novo.
- **app/bills.js:** bez izmena. `read` i `save-file` su dovoljni.
- **budzet-tracker.html:**
  - dugme u Nabavci, prozor `receiptOverlay`, čitanje po delovima, čuvanje i undo;
  - 📎 u listi rashoda;
  - prevlačenje na ekranu Nabavka;
  - Excel i JSON kopija;
  - i18n. Stringove proveriti na sudar sa postojećim ključevima („Račun“, „Novi račun“, „Obriši račun“ već znače bankovni račun).

## Testiranje

- **node:test** za sve nove funkcije u jezgru:
  - JSON sa tekstom oko njega, zarez u ceni, nepoznata kategorija;
  - popust u posebnom redu i popust veći od stavke;
  - preklapanje delova;
  - memorija kategorija (poslednja pobeđuje, lista ima prednost);
  - uparivanje sa dijakritikama i prefiksom, uz pravilo da se stavka sa liste upari samo jednom;
  - raspodela razlike na kategorije i zaokruživanje na pare;
  - duplikat.
- **Smoke** sa `__fakeReceiptReading` (po delu):
  - lista od 3 stavke i račun od 5 stavki u 2 dela sa preklapanjem;
  - očekuju se 3 uparene stavke skinute sa liste i rashodi po kategorijama sa tačnim iznosima i `itemPrices`;
  - „Kupljene stvari“ vide cenu, prilog je sačuvan, a undo vraća listu i briše rashode;
  - razlika u zbiru daje dugme za dodavanje razlike;
  - duplikat daje upozorenje.
- **Jedan pravi Groq poziv** sa izmišljenim računom nacrtanim na canvasu (5 stavki, popust, zbir).
- **EN provera** i **snimak ekrana** prozora za potvrdu.
