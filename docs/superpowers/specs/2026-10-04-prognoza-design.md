# Prognoza do plate (v1.32) — dizajn

Datum: 2026-10-04 · Aplikacija: Knjiga budžeta 1.31.1 · Dizajn je korisnik odobrio u razgovoru. Za izvor plate izabrao je varijantu 3: plata se uzima automatski iz Ponavljajućih, uz mogućnost ručne zamene.

## Cilj

- **Koliko ostaje do plate.** Korisnik vidi koliko će mu novca ostati do sledeće plate i koliko dnevno sme da troši.
- **Upozorenje na minus.** Ako će pre plate ući u minus, vidi to unapred, sa datumom: „Oko 24. oktobra ulaziš u minus“.

Grafikon prikazuje narednih 60 dana. Sve se računa lokalno, bez AI-ja.

Van ovog posla ostaju:
- obaveštenja (notifikacije) o minusu;
- više scenarija;
- prognoza po pojedinačnom računu.

## Računanje (jezgro, `budzet-core.js`, testirano)

```
cashForecast({ today, days = 60, startBalance, recurring, entries, applied, skipped, goals,
               dailySpend, payday }) → {
  points: [{ date, balance }],              // kraj svakog dana: danas, pa narednih `days` dana
  events: [{ date, desc, amount, kind }],   // amount: + prihod, − rashod; kind: 'recurring'|'entry'|'goal'|'payday'
  payday: { date, amount, source: 'recurring'|'manual' } | null,
  beforePayday: { date, balance } | null,   // dan pre plate
  daily: number | null,                     // koliko dnevno sme da se troši do plate
  lowest: { date, balance },
  firstNegative: { date, balance } | null
}
```

### Početno stanje

- Uzima se zbir stanja svih računa osim tipa `stednja`, zaključno sa danas. Novac namenjen štednji se ne troši.
- Ako korisnik nema račune, uzima se `overallBalance()`.
- Stranica izračuna početno stanje i preda ga jezgru (`startBalance`), da bi jezgro ostalo čisto.

### Događaji, po danu

1. **Ponavljajuće stavke** (prihodi i rashodi, uključujući rate dugova koje su ponavljajuće sa `debtId`) za svaki mesec u prozoru:
   - ulaze samo one koje dospevaju u tom mesecu (`isDueInMonth`);
   - preskaču se one koje su plaćene, preskočene ili već upisane kao stavka;
   - datum je `dueDateFor`;
   - ako je stavka dospela pre danas, a nije plaćena, ulazi **danas**.
2. **Upisane neplaćene stavke** (`paid === false`) ulaze na svoj datum, a ako je datum prošao, ulaze danas. Upisani prihodi sa budućim datumom ulaze na svoj datum.
3. **Mesečne uplate u ciljeve** (`g.monthly`: iznos i dan) ulaze kao odliv na taj dan svakog meseca, dok cilj nije ispunjen.
4. **Svakodnevna potrošnja** se oduzima svakog dana posle danas. To je `dailySpend` = prosek promenljivih troškova iz poslednja 3 meseca (`variableAverage`), podeljen sa 30,4. Fiksne kategorije nisu uključene, jer su već u ponavljajućim.
5. **Plata:**
   - **Automatski:** plata je najveći ponavljajući prihod, a njen prvi sledeći datum u prozoru je dan plate.
   - **Ručno:** korisnik zadaje `payday = { date, amount }`, koje važi dok datum ne prođe. Tada se ta stavka **zamenjuje**: najveći ponavljajući prihod se ne računa u prozoru do ručnog datuma, da plata ne bi bila uračunata dvaput. Umesto njega ulazi ručni iznos na ručni datum. Posle tog datuma ponavljajući prihod se ponovo računa normalno.
6. **„Dnevno do plate“**:
   - to je najniže stanje pre plate računato **bez** svakodnevne potrošnje (samo stvarni računi i uplate), podeljeno brojem dana do plate;
   - ako to stanje nije pozitivno, vrednost je 0;
   - ako nema plate, vrednost je `null`.

### Zaokruživanje

Sva stanja se zaokružuju na pare (`round2`).

## Stranica

- **Pregled, kartica „Do plate“**:
  - ako se ulazi u minus pre plate, piše „⚠ Oko {datum} ulaziš u minus ({iznos})“ i naglašeno je;
  - inače piše „Do plate ({datum}) ostaje ~{iznos} · možeš ~{dnevno} dnevno“;
  - bez plate piše „Za 60 dana: ~{stanje}“ i ima link „Podesi platu“;
  - klik na karticu vodi na Izveštaji → Prognoza.
- **Izveštaji → nova podkartica „Prognoza“**:
  - SVG grafikon za 60 dana sa nultom linijom (crvena oblast ispod nule), oznakom plate i tačkama za događaje veće od 3% početnog stanja (ili veće od 2.000 RSD). Prelaz preko tačke pokazuje opis i iznos.
  - Ispod je tabela predstojećih događaja (datum, opis, iznos, stanje posle) i red „svakodnevna potrošnja ~X dnevno (prosek 3 meseca)“.
- **Podešavanja → „Plata“**:
  - „Sledeća plata“ ima dve mogućnosti: **Automatski** (iz Ponavljajućih; prikazuje koja stavka i datum) ili **Ručno** (datum + iznos);
  - ručna vrednost važi do datuma, a posle toga se vraća na automatski, uz napomenu na kartici „Plata je prošla — upiši sledeću ili vrati na automatski“;
  - ključ je `budzet-plata-v1` = `{ mode: 'auto'|'manual', date, amount }` i ulazi u JSON kopiju i u proveru oblika fajla.

## Testiranje

- **node:test (`cashForecast`)**:
  - početno stanje i svakodnevna potrošnja;
  - ponavljajući rashod u dva meseca (preskočen, plaćen, već upisan);
  - dospela neplaćena stavka ide danas;
  - tromesečna i godišnja stavka;
  - uplata u cilj;
  - automatska plata (najveći prihod) i ručna plata bez duplog računanja;
  - prvi dan u minusu i najniže stanje;
  - vrednost „dnevno do plate“ kad je stanje bez potrošnje negativno (0) i kad nema plate (`null`).
- **Smoke**:
  - kartica na Pregledu u oba slučaja (minus i „ostaje“);
  - podkartica Prognoza sa grafikonom i tabelom;
  - ručna plata u Podešavanjima menja karticu;
  - JSON kopija čuva `budzet-plata-v1`.
