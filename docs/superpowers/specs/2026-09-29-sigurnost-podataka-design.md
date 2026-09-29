# Paket 1 — Sigurnost podataka (v1.12) — dizajn

Datum: 2026-09-29 · Aplikacija: Knjiga budžeta 1.11.2

## Cilj

Zatvoriti rizike koji mogu tiho da pokvare ili izgube podatke. Glavno računanje prelazi u `budzet-core.js`, gde je pokriveno testovima. Korisnik ne dobija nove ekrane. Dobija tačnije zbirove i jasne poruke umesto tihog gubitka.

**Van obima:** deljenje velikog HTML fajla na module. Ne menjaju se ni izgled ni postojeći tokovi.

## 1. Automatsko plaćanje za propuštene mesece

**Problem:** `processAutoPay` upisuje samo tekući mesec. Ako aplikacija ne bude otvarana mesec ili više, stavke sa „Automatski upiši“ za propuštene mesece se nikad ne upišu.

**Rešenje:**
- Novi ključ u localStorage je `budzet-autoupis-poslednji-mesec-v1` („YYYY-MM“). U njemu stoji poslednji mesec za koji je automatsko upisivanje obrađeno.
- Pri pokretanju i u postojećoj proveri na 15 minuta obrađuju se svi meseci od (poslednji + 1) do tekućeg, najviše 24 meseca unazad.
  - U prošlim mesecima upisuju se sve dospele stavke, bez obzira na dan.
  - U tekućem mesecu važi dosadašnje pravilo: samo stavke čiji je dan dospeća prošao.
- Posle obrade ključ dobija vrednost tekućeg meseca.
- Ako ključ ne postoji (prvo pokretanje nove verzije), obrađuje se samo tekući mesec. Ne pravi se istorija pre nove verzije.
- Pravila po mesecu ostaju ista: preskočeno (`skipped`), već plaćeno (`applied`) i isključeno za taj mesec (`autoPayOptOut`) se ne dira.
- Iznos je `recurringAmountNow(r)`, kao i do sada.
- Ako su dodati upisi za prošle mesece, pojavljuje se poruka: „Automatski upisano za propuštene mesece: N stavki“.

Pravilo „šta je dospelo za mesec“ postaje čista funkcija u jezgru: `C.autoPayDue(recurring, { applied, skipped, optOut }, mKey, dayLimit)`, gde je `dayLimit` null za prošle mesece. Spisak meseci daje `C.monthsToProcess(last, current, max)`.

## 2. Bezbedno čuvanje pre ažuriranja i izlaska

**Problem:** `window.__desktopBridge.flush()` uvek vraća `true`. `installUpdateNow` zato instalira ažuriranje i kad poslednje čuvanje nije uspelo (npr. OneDrive ili antivirus zaključa fajl).

**Rešenje:**
- `flushSync()` vraća `true` ili `false`. `flush()` vraća `{ ok, error }`.
- `flushRenderer()` u main.js vraća taj rezultat. Istek od 3 s ili izuzetak računaju se kao `ok: false`.
- `installUpdateNow`: ako čuvanje ne uspe, pokušava još jednom posle 2 s. Ako ni tada ne uspe, instalacija se odlaže. Stanje ostaje „ready“, novi pokušaj je za 5 minuta, a korisnik dobija obaveštenje: „Ažuriranje je odloženo: podaci nisu mogli da se sačuvaju (fajl je zauzet). Pokušaću ponovo za 5 minuta.“
- `quitApp`: ako čuvanje ne uspe, prikazuje se dijalog sa izborom „Pokušaj ponovo“ / „Izađi bez čuvanja“ / „Otkaži“, uz srpski i engleski tekst.

## 3. Provera Excel uvoza i vraćanja kopije

**Excel uvoz** (ručni uvoz i `readExcelFileIntoLocal`):
- Pre `parseWorkbook`, funkcija `C.checkWorkbookShape(sheetNames, stavkeHeader)` proverava da postoji list „Stavke“ sa kolonama `Datum`, `Opis`, `Iznos` i `Tip`, i list „Kategorije“.
- Ako provera ne prođe, prikazuje se: „Ovo ne izgleda kao Excel fajl Knjige budžeta (nedostaje: …). Podaci nisu promenjeni.“ Ništa se ne menja.
- Rezervna kopija pre zamene sada se pravi i u browser verziji: preuzima se JSON kopija pre zamene, ako `window.__desktopData` ne postoji.

**Vraćanje celog fajla kopije** (grana `raw.app === 'Knjiga budzeta'`):
- Pre `replaceAll`, funkcija `C.checkDataFileShape(data)` proverava da je `budzet-stavke-v2` niz (ili JSON string niza). Za sve poznate ključeve proverava i da li je vrednost ispravnog tipa (niz ili objekat).
- Ako provera ne prođe, prikazuje se: „Kopija je oštećena ili nije iz Knjige budžeta (…). Podaci nisu promenjeni.“

## 4. Zaštita kategorija od prevoda

Svaka dinamički napravljena `<option>` sa korisničkim podacima (kategorije rashoda i prihoda, pravila, podela, onboarding) dobija `value="${escapeHtml(c)}"` i `translate="no"`. Engleski prevod tako više ne može da promeni sačuvanu vrednost. To su redovi sa `<option>${escapeHtml(...)}` u `budzet-tracker.html`: `populateExpenseCategorySelect`, `populateRecurringCategorySelect`, filteri, `splitRowHtml`, `renderCatRules` i onboarding.

## 5. Računanje u jezgru, uz testove

Iz HTML-a u `budzet-core.js` prelaze funkcije koje primaju podatke kao parametre:
- `monthTotals(entries, mKey)`. Zbirovi se zaokružuju na 2 decimale.
- `isRecurringPaid(applied, r, mKey)` i `isRecurringSkipped(skipped, r, mKey)`.
- `pendingRecurringItems(recurring, entries, applied, skipped, mKey, currentMonth)`, koja sada postoji kao `pendingRecurring`.
- `autoPayDue` i `monthsToProcess` iz odeljka 1.
- `checkWorkbookShape` i `checkDataFileShape` iz odeljka 3.

HTML zadržava ista imena funkcija kao tanke omotače, pa se ostatak koda ne menja.

**Zaokruživanje:** `monthTotals` i `overallBalance` vraćaju zbir zaokružen na pare (`Math.round(x*100)/100`). Time se sprečava gomilanje greške kod decimalnih brojeva, kakvu je nedavno pokazao test stanja računa.

## 6. Testiranje

- **`npm test`:**
  - `monthsToProcess`: bez ključa, jedan propušten mesec, prelaz godine, ograničenje na 24
  - `autoPayDue`: preskočeno, plaćeno, isključeno, kvartalno/godišnje, `dayLimit` za tekući mesec
  - `monthTotals`: raspoređene stavke, neplaćeno, zaokruživanje decimala
  - `pendingRecurringItems`
  - `checkWorkbookShape` i `checkDataFileShape`: ispravan i neispravan unos
- **Smoke:**
  - simuliran propušten mesec (ključ postavljen na mesec pre prošlog) upisuje stavke sa automatskim plaćanjem za propuštene mesece
  - Excel uvoz lista bez „Stavke“ je odbijen i podaci su nepromenjeni
  - vraćanje oštećene kopije je odbijeno
  - `flush()` vraća `{ ok: true }`
  - opcije kategorija imaju `value` i `translate="no"`
- **Ručno:** pokretanje sa `lang: en`, pa izbor kategorije čije ime postoji u EN rečniku (npr. privremeno napravljena „Ukupno“). Sačuvana vrednost mora ostati srpska.
