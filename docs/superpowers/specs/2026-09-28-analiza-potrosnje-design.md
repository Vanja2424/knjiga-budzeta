# Analiza potrošnje — dizajn

Datum: 2026-09-28 · Aplikacija: Knjiga budžeta (trenutno 1.9.0)

## Cilj

Korisnik: „Ne vidim jasno gde ide novac.“ Novi ekran treba da odgovori na četiri pitanja:

1. Na šta tačno ide novac?
2. Kako se kategorija menja kroz vreme?
3. Koliko je fiksno, a koliko promenljivo?
4. Gde mogu da uštedim?

**Uspeh:** za oko minut korisnik vidi 2–3 konkretne uštede sa iznosima, bez ikakvog dodatnog unosa podataka. Pretpostavka je da ekran otvara nedeljno ili mesečno.

**Van obima:** podkategorije, kartica detalja kategorije na klik bilo gde u aplikaciji (moguća kasnije nadogradnja) i lista za nabavku (poseban projekat sa sopstvenom specifikacijom).

## 1. Pravila računanja

- **Period:** 3, 6 ili 12 punih meseci pre izabranog meseca, podrazumevano 6. Izabrani mesec se poredi sa prosekom perioda.
- **Šta se računa:** samo plaćeni troškovi (`type === 'expense'`, plaćeni). Raspoređeni troškovi (`spreadMonths`) ulaze samo sa delom koji pada na mesec (`C.shareInMonth`). Iznos je uvek `amount`, koji je već u RSD, pa konverzija nije potrebna.
- **Prosek perioda:** računa se samo od meseci koji imaju podatke. Meseci pre prvog unosa ne ulaze kao nula. Ako period ima manje od 2 meseca sa troškovima, poređenja se ne prikazuju.
- **Grupisanje po opisu (`normalizeDesc`):** mala i velika slova se ne razlikuju, a brojevi, razmaci i interpunkcija na kraju se brišu. Ako posle čišćenja ne ostane ništa, stavka ide u grupu „(bez opisa)“. Za svaku grupu se prikazuju ukupan iznos, broj kupovina i prosečna kupovina.
- **Iznad proseka:** kategorija se prikazuje ako je trošak u izabranom mesecu **≥ 20%** i **≥ 1.000 RSD** iznad proseka perioda. Oba uslova moraju biti ispunjena, a vrednost tačno na pragu se računa.
- **Sitni česti troškovi:** grupa po opisu sa prosečnom kupovinom **≤ 1.500 RSD** i u proseku **≥ 4 kupovine mesečno** u periodu. Prikazuju se mesečni i godišnji (×12) zbir.
- **Fiksno i promenljivo:** fiksni su troškovi nastali iz ponavljajućih stavki (id `rec-<id>-<YYYY-MM>`) i troškovi u kategorijama iz `fixedCategories`. Sve ostalo je promenljivo.
- **Pretplate:** sve ponavljajuće stavke tipa trošak, sa godišnjim troškom (`monthlyEquivalent` × 12), poređane od najskuplje. Oznaku „↑ poskupelo“ dobija stavka čije je poslednje plaćanje **> 10%** veće od prvog, ako postoje bar 3 plaćanja (isto pravilo kao u `detectSubscriptionCreep`).
- **Šta ako:** klizač od 0 do 50% za smanjenje promenljivih troškova.
  - Mesečna ušteda je prosečan promenljivi trošak perioda × X%. Godišnja ušteda je mesečna × 12.
  - Cilj za prikaz je aktivni cilj štednje (`current < target`) sa rokom u budućnosti, a ako ih ima više, onaj sa najbližim rokom.
  - Potreban mesečni tempo računa se kao u `goalSuggestionHtml`: `(target − current) / meseciDoRoka`.
  - Novi broj meseci je `ceil((target − current) / (tempo + mesečnaUšteda))`. Prikazuje se „cilj N meseci ranije“, gde je N = meseciDoRoka − novi broj meseci, samo kad je N ≥ 1.
  - Kad nema takvog cilja, prikazuje se samo godišnja ušteda.

## 2. Raspored ekrana

**Mesto:** grupa Izveštaji dobija novu **prvu** podkarticu **Analiza** (`analiza`), ispred kartica Izveštaj za štampu, Uporedi i Scenario. Unos se dodaje u `SCREEN_GROUPS.izvestaji` i `SCREEN_RENDER`, uz lenjo renderovanje kao na ostalim ekranima.

**Gornja traka:**
- izbor meseca (podrazumevano tekući)
- segmentni izbor perioda 3 / 6 / 12
- red sažetka, npr. „Ovog meseca 84.300 RSD · prosek 76.100 · +11%“

**Kartice, redom:**

1. **Na šta ide novac:**
   - kategorije izabranog meseca poređane po iznosu, sa trakom udela i razlikom prema proseku (▲/▼)
   - klik na kategoriju otvara njenih 5 najvećih grupa po opisu (iznos, broj, prosečna kupovina), a „prikaži sve“ otvara ostale
2. **Kroz vreme:**
   - izbor kategorije (podrazumevano najveća u izabranom mesecu)
   - stubičasti grafikon po mesecima perioda plus izabrani mesec
   - isprekidana linija proseka, a izabrani mesec je istaknut
3. **Fiksno / promenljivo:**
   - jedna podeljena traka sa iznosima i procentima
   - spisak kategorija sa prekidačem „fiksno“ koji upisuje u `fixedCategories`
   - troškovi iz ponavljajućih stavki su uvek fiksni i prekidač ih ne menja, što piše i u napomeni ispod trake
4. **Gde mogu da uštedim:** tri podsekcije, i svaka se prikazuje samo ako ima sadržaj:
   - kategorije iznad proseka (iznos iznad proseka = moguća ušteda)
   - sitni česti troškovi (mesečno / godišnje)
   - pretplate sa godišnjim troškom i oznakom poskupljenja

   Na dnu kartice je klizač „Šta ako“.

Klizač „Šta ako“ je namerno odvojen od ekrana Scenario. Scenario radi sa konkretnim stavkama i projekcijom stanja, a klizač je samo brza procena u procentima.

## 3. Veza sa Pregledom

- Panel **Obrasci** na Pregledu (`renderPatterns`) dobija red na dnu: „N kategorija iznad proseka · moguća ušteda ~X RSD →“. Klik otvara Izveštaji → Analiza i skroluje do kartice „Gde mogu da uštedim“.
- Red računa **ista funkcija iz `budzet-core.js`** kao Analiza, sa podrazumevanim periodom od 6 meseci i pragovima 20% i 1.000 RSD, pa se brojke uvek slažu.
- Postojeća upozorenja o anomalijama u Obrascima (`detectSpendingAnomalies`, poslednja 3 meseca) prelaze na novu funkciju, a stara logika se uklanja. Poskupljenje pretplata i prognoza ostaju nepromenjeni.
- Ako nema kategorija iznad proseka, a postoje sitni česti troškovi, red glasi „Sitni troškovi: ~X RSD mesečno →“. Ako nema ni jednog ni drugog, red se ne prikazuje.

## 4. Prazna i granična stanja

- **Manje od 2 meseca podataka u periodu:** umesto poređenja piše „Za poređenje su potrebna bar 2 meseca podataka“. Kartice „Na šta ide novac“ (bez ▲/▼) i „Fiksno/promenljivo“ i dalje rade za izabrani mesec.
- **Mesec bez troškova:** „Nema plaćenih troškova u ovom mesecu“, a izbor meseca ostaje dostupan.
- **Nema ponavljajućih stavki:** podsekcija pretplata se ne prikazuje.
- **Nema odgovarajućeg cilja štednje:** klizač pokazuje samo godišnju uštedu.
- **Opis prazan posle čišćenja:** stavka ide u grupu „(bez opisa)“.
- **`fixedCategories`:** novo polje u podaci.json (niz imena kategorija, podrazumevano `[]`).
  - Stari fajlovi bez polja rade normalno.
  - Polje se čuva u rezervnim kopijama kao i ostatak podataka.
  - `renameCategory` preimenuje i ime u nizu, a brisanje kategorije ga uklanja iz niza.

## 5. Arhitektura

- **`budzet-core.js`** dobija čiste funkcije bez DOM-a. Primaju `entries`, `recurring`, `goals`, `fixedCategories` i ključ meseca, a vraćaju obične objekte:
  - `normalizeDesc(desc)`
  - `analysisPeriod(monthKey, n)`: lista ključeva meseci
  - `categoryMonthTotals(entries, months)`
  - `periodAverage(totalsByMonth, firstDataMonth)`: `{ avg, monthsWithData, enough }`
  - `groupByDesc(entries, category, months)`
  - `aboveAverage(...)`
  - `smallFrequent(...)`
  - `splitFixedVariable(entries, month, fixedCategories)`
  - `subscriptionsYearly(recurring, entries)`
  - `whatIf(variableAvg, pct, goals, today)`
  - `savingsSummary(...)`: jedan poziv koji koriste i Pregled i Analiza
- **`budzet-tracker.html`:**
  - ekran `screen-analiza`, `renderAnaliza()` i unos u `SCREEN_GROUPS` i `SCREEN_RENDER`
  - izmena `renderPatterns`
  - čuvanje i učitavanje `fixedCategories`
  - izmene u `renameCategory` i brisanju kategorije
  - stil u sloju `apple-theme`
- **`i18n.js`:** engleski prevod za sve nove tekstove. Tekstovi sa vrednostima idu kroz `t('... {0}', x)`.

## 6. Testiranje

- **`npm test` (node:test na core funkcijama):**
  - `normalizeDesc`: velika i mala slova, brojevi i interpunkcija na kraju, prazan rezultat daje „(bez opisa)“
  - `groupByDesc` sa raspoređenim troškovima
  - `periodAverage`: preskakanje meseci pre prvog unosa, manje od 2 meseca
  - `aboveAverage`: granice 20% i 1.000 RSD, uključujući tačno na pragu
  - `smallFrequent`: granice 1.500 RSD i 4 kupovine mesečno
  - `splitFixedVariable`: `rec-…` i `fixedCategories`
  - `subscriptionsYearly`: poskupljenje > 10%, najmanje 3 plaćanja
  - `whatIf`: ušteda, broj meseci ranije, cilj bez roka, dostignut cilj, više ciljeva
- **`npm run smoke`** (na kopiji podaci.json) dobija nove provere:
  - Analiza je prva podkartica u grupi Izveštaji i otvara se
  - promena perioda 3/6/12 menja sažetak
  - prekidač „fiksno“ ostaje sačuvan posle ponovnog učitavanja
  - red na Pregledu vodi na Analizu
  - iznos na Pregledu se slaže sa onim u Analizi
- **Engleski:** pokretanje sa `settings.json` `{"lang":"en"}` i pregled vidljivog teksta.
- **Ručno:** snimak ekrana (`KNJIGA_TEST_SHOT`) na kopiji stvarnih podataka. Provera je da li se za oko minut vide 2–3 konkretne uštede.
