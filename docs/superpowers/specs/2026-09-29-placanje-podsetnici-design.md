# Paket 2 — Plaćanje i podsetnici (v1.13) — dizajn

Datum: 2026-09-29 · Aplikacija: Knjiga budžeta 1.12.0

## Cilj

Manje klikova oko plaćanja i dugova:

1. zakasnele ponavljajuće stavke plaćaju se jednim potvrđivanjem
2. klik na obaveštenje vodi pravo na stavku
3. dug dobija mesečnu ratu koja se plaća kao ponavljajuća stavka i sama umanjuje dug
4. dug u stranoj valuti može da se preračuna po današnjem kursu

**Van obima:** automatsko skidanje sa računa, rate za „Duguje mi“ (tuđe dugove prema tebi) i izmene izgleda van ova četiri toka.

## 1. „Plati sve zakasnele“ (ekran Ponavljajuće)

- Iznad liste ponavljajućih je dugme **„Plati sve zakasnele (N)“**, vidljivo samo kad je N ≥ 1.
- N je broj **rashoda** iz ponavljajućih stavki u tekućem mesecu koji su dospeli, a nisu plaćeni ni preskočeni: `dan dospeća < danas`, isto kao `countOverdue`.
- Klik otvara prozor sa spiskom zakasnelih. Svaki red ima kvačicu (podrazumevano uključena), naziv, datum dospeća i iznos koji može da se menja (podrazumevano `recurringAmountNow(r)`). Na dnu je zbir izabranih.
- „Plati izabrano“ radi isto što i pojedinačno plaćanje (`togglePaid(r, true, iznos)`) za svaku izabranu stavku, ali sa jednim iscrtavanjem i jednim zvukom na kraju.
- Posle toga se prikazuje poruka „Plaćeno N stavki (X RSD)“ sa dugmetom **„Poništi“**, koje vraća sve na neplaćeno.
- Ponavljajući prihodi („naplaćeno“) ne ulaze u ovo dugme.
- Pravilo „šta je zakasnelo“ postaje čista funkcija u jezgru: `C.overdueRecurring(recurring, applied, skipped, mKey, today)`, koja vraća samo rashode.

## 2. Obaveštenje vodi na stavku

- Klik na obaveštenje za zakasnelu ili skoro dospelu ponavljajuću stavku otvara prozor, prelazi na **Ponavljajuće**, skroluje do te stavke i kratko je ističe (klasa `row-flash`, oko 1,5 s; bez animacije kad je smanjeno kretanje uključeno, samo boja).
- Obaveštenje za dug vodi na **Dugovi** i ističe tu karticu.
- Obaveštenje nosi `{ screen, rowId }`. `sendNotificationOnce` dobija treći parametar sa tim podacima.

## 3. Rata duga kao ponavljajuća stavka

- U panelu **Plan otplate**, uz svaki dug „Dugujem“ koji nema ratu, stoji dugme **„Napravi mesečnu ratu“**. Otvara modal sa poljima:
  - iznos rate (podrazumevano manje od ostatka i mesečnog kapaciteta, a ako kapacitet nije upisan, ostatak)
  - dan u mesecu (podrazumevano dan roka duga, inače 1)
  - kategorija (podrazumevano „Ostalo“, ako postoji)
- Nastaje ponavljajuća stavka: `type:'expense'`, `desc: "Rata: <osoba>"`, mesečna, sa izabranim danom i kategorijom i poljem `debtId: d.id`.
- **Plaćanje rate** (pojedinačno, iz „Plati sve zakasnele“ ili automatski) pravi običan rashod iz ponavljajuće stavke, sa poljem `debtId` na rashodu. Tako se rata vidi u Rashodima i ulazi u mesečni zbir kao pravi izlazak novca.
- **Koliko je dug otplaćen:** `C.debtPaid(d, entries)` = `d.paidAmount` (ručne uplate) + zbir plaćenih rashoda sa `debtId === d.id`.
  - Ostatak, kartica, plan otplate, „Za plaćanje“ i obaveštenja koriste tu vrednost.
  - `overallBalance` i dalje oduzima samo ručne uplate (`d.paidAmount`), jer su rate već u rashodima. Tako se ništa ne računa dvaput.
- **Poslednja rata:** kad bi rata premašila ostatak, predlaže se ostatak.
- **Kad je dug izmiren**, ponavljajuća stavka dobija `until: <tekući mesec>` i posle toga više ne dospeva. `C.isDueInMonth` poštuje `until`.
- Brisanje rashoda rate ili poništavanje plaćanja automatski vraća ostatak duga, jer se računa iz rashoda. Ako dug ponovo ima ostatak, uklanja se i `until`.
- Kartica duga prikazuje „Mesečna rata: X · sledeća DD.MM.“ ako rata postoji.

## 4. Dug u stranoj valuti po današnjem kursu

- Za dug sa `currency` (≠ RSD) i `origAmount`, kartica pokazuje: „Danas ≈ Y RSD (±Z od unosa)“, po kursu iz `fx.rates`.
- Dugme **„Preračunaj“** postavlja `d.amount = round2(origAmount × današnji kurs)` i `d.rate = današnji kurs`. Pojavljuje se poruka sa dugmetom „Poništi“.
- Kad nema kursa (npr. offline, bez kursne liste), ništa od ovoga se ne prikazuje.

## 5. Testiranje

- **`npm test`:**
  - `overdueRecurring`: samo rashodi; dan dospeća jednak danas nije zakasneo; plaćeno i preskočeno se isključuju; kvartalne stavke
  - `debtPaid`: ručne uplate + rate, zanemaruje neplaćene i tuđe rashode
  - `isDueInMonth` sa `until`
- **Smoke:**
  - „Plati sve zakasnele“ na test stavki sa danom 1 (u smoke-u, osim prvog dana u mesecu) plaća i poništava
  - rata duga: pravljenje, plaćanje (ostatak se smanjuje), izmirenje postavlja `until`, brisanje rashoda vraća ostatak
  - `sendNotificationOnce` sa odredištem otvara Ponavljajuće (test hook `window.__openNotificationTarget`)
  - preračunavanje EUR duga menja iznos, a poništavanje ga vraća
- **Engleski:** svi novi tekstovi imaju EN unos.
