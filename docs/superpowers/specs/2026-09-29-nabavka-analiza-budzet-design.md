# Paket 3 — Nabavka ↔ Analiza ↔ Budžet (v1.14) — dizajn

Datum: 2026-09-29 · Aplikacija: Knjiga budžeta 1.13.0

## Cilj

Povezati Nabavku sa ostatkom aplikacije:

1. Analiza pokazuje **šta kupuješ**: koliko često i približno koliko košta, iz kupovina preko Nabavke.
2. Ekran Budžet pokazuje koliko je na listi za kupovinu po kategoriji.
3. Nabavka predlaže stvari koje obično kupuješ, a vreme je da ih opet kupiš.

**Van obima:** čitanje fiskalnih računa (i dalje čeka link sa računa) i cene po stvari u Excelu.

## 1. Podaci

- Rashod iz „Završi kupovinu“ pored `items` (nazivi) dobija `itemPrices`: niz iste dužine, sa cenom sa liste u trenutku kupovine (`number` ili `null`).
- Stari rashodi i ručno uneti rashodi nemaju `itemPrices`. Sve radi i bez tog polja, samo bez iznosa po stvari.
- `itemPrices` ide u JSON rezervnu kopiju. Provera pri uvozu propušta samo niz iste dužine kao `items`, sa brojevima ≥ 0 ili `null`. Ne ide u Excel, jer kolona „Kupljeno“ ostaje samo sa nazivima.
- Nazivi se porede bez količine u zagradi i bez obzira na velika slova: „Mleko (2 kom)“ i „mleko“ su ista stvar (`C.purchasedItemName`).

## 2. Analiza — „Šta kupuješ“

`C.purchasedItemStats(entries, months, category?)` gleda plaćene rashode sa `items` u datim mesecima (po datumu rashoda) i vraća, po stvari:
- `count`: broj kupovina u kojima se stvar javlja
- `amount`: deo stvarnog iznosa rashoda. Iznos svakog rashoda deli se srazmerno cenama sa liste. Stvar bez cene u rashodu koji ima cene dobija prosečnu cenu ostalih stvari iz tog rashoda. Rashod bez ijedne cene ne daje iznos. `amount` je `null` ako nijedan rashod sa tom stvari nema cene.
- `withAmount`: u koliko je tih kupovina iznos bio poznat

Na ekranu Analiza, kad otvoriš kategoriju u „Na šta ide novac“, ispod najvećih grupa po opisu stoji deo **„Kupljene stvari“**. Prikazuje do 8 stvari iz te kategorije u izabranom mesecu, npr. „Mleko ×4 · ~620 RSD“. Kad iznos nije poznat, piše samo „×4“. Deo se ne prikazuje ako u toj kategoriji nema kupovina preko Nabavke.

## 3. Budžet — procena sa liste

Na ekranu Budžet i kategorije, u redu kategorije koja ima stvari na listi za kupovinu (`needed`), pored budžeta piše sitno: „na listi ~X“. Brojka je ista kao u donjoj traci Nabavke (`C.shoppingEstimate(...).byCategory`). Kad bi procena prešla ostatak budžeta, oznaka je narandžasta.

## 4. Nabavka — predlozi na osnovu navika

`C.restockSuggestions(entries, shoppingItems, todayISO)`:
- Za svaku stvar iz kupovina preko Nabavke uzimaju se datumi kupovine (jedinstveni dani, plaćeni rashodi sa `items`).
- Potrebne su bar **3 kupovine**. Interval je **medijan** razmaka u danima. Stvar se predlaže kad je od poslednje kupovine prošlo **≥ interval** dana.
- Ne predlaže se stvar koja je u stalnom spisku i već ima `needed`.
- Vraća `[{ name, key, intervalDays, daysSince, itemId|null }]`, poređano po `daysSince / intervalDays` opadajuće, najviše 5.

Na ekranu Nabavka, iznad liste, stoji kartica **„Vreme je da kupiš“** sa predlozima, npr. „Mleko · kupuješ na ~7 dana, poslednji put pre 9 dana“. Uz svaki predlog su dva dugmeta:
- **„Dodaj“**: stavka iz spiska dobija `needed`. Ako je nema u spisku, pravi se nova (deo „Ostalo“, podrazumevana kategorija).
- **„✕“**: sakriva predlog do sledeće kupovine te stvari. Čuva se u `shopping.dismissed = { key: poslednjiDatum }`, a predlog se vraća tek kad postoji novija kupovina.

Kartica se ne prikazuje kad nema predloga.

## 5. Testiranje

- **`npm test`:**
  - `purchasedItemName`: zagrade, velika i mala slova, razmaci
  - `purchasedItemStats`: srazmerna raspodela, stvar bez cene, rashod bez cena, neplaćeno, filter po kategoriji i mesecu
  - `restockSuggestions`: manje od 3 kupovine, medijan, prag „prošlo ≥ interval“, isključenje `needed`, `dismissed`, najviše 5
- **Smoke:**
  - „Završi kupovinu“ upisuje `itemPrices`
  - Analiza prikazuje „Kupljene stvari“ za kategoriju sa kupovinom
  - Budžet prikazuje „na listi ~X“
  - predlog se pojavljuje posle tri simulirane kupovine, a „Dodaj“ i „✕“ rade
- **Engleski:** svi novi tekstovi imaju EN unos.
