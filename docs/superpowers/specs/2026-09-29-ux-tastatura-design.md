# Paket 5 — Izgled i tastatura (v1.16) — dizajn

Datum: 2026-09-29 · Aplikacija: Knjiga budžeta 1.15.0 · Odluke su donete bez posebnog odobrenja („samo vozi“).

## Tastatura

1. **Ctrl+Z** poništava poslednju radnju koja ima dugme „Poništi“ (vrh steka poruka). Ne radi dok je fokus u polju za unos teksta ili dok je otvoren prozor, jer tada Ctrl+Z pripada polju.
2. **?** (Shift+/) otvara prozor „Prečice na tastaturi“ sa istim spiskom kao u Podešavanjima. Ne radi dok se kuca u polje.
3. Spisak prečica je ispravljen: **Ctrl+1 … 8** (Nabavka je 8. ekran). Dodati su Ctrl+Z, ? i Esc.
4. U podnožju (samo desktop) stoji napomena „Pritisni ? za prečice na tastaturi“.

## Redovi i tabele

5. U tabelama Prihodi/Rashodi dugmad ✎ ⧉ ✕ se vide tek kad je miš iznad reda ili je fokus u redu (`(hover: hover)`). Na ekranima na dodir ostaju stalno vidljiva.
6. ✕ je odvojen razmakom od ostalih dugmadi i pocrveni kad je miš na njemu.
7. Zaglavlje Rashoda:
   - druga kolona dobija oznaku „Plaćeno“ (sitnim slovima)
   - kolona sa dugmadima dobija skriveni naziv „Radnje“ (za čitače ekrana)
   - izbor reda ostaje kvadratić „Izaberi sve“
8. **aria-label:** dugmad koja imaju samo ikonicu ili znak (tekst od najviše 2 znaka) i `title` automatski dobijaju `aria-label = title`. To radi posmatrač DOM-a, pa važi i za liste koje se kasnije iscrtavaju. `aria-label` se prevodi kao i `title` (već je u `ATTRS` u i18n.js).

## Poruke

9. **Analiza:** kad nema bar 2 meseca podataka, poruka „Za poređenje su potrebna bar 2 meseca podataka“ stoji samo u sažetku na vrhu.
   - Grafikon je bez napomene.
   - „Gde mogu da uštedim“ pokazuje samo pretplate, ili ništa.
   - Deo „šta ako“ je sakriven.
   - Kad podataka ima dovoljno, ali promenljivih troškova nema, „šta ako“ piše „Nema promenljivih troškova za poređenje.“
10. **Pregled za novog korisnika:** kad nema nijednog prihoda ni rashoda, ekran dobija klasu `pregled-empty` i sakriva se sve što bez podataka ništa ne znači: finansijsko zdravlje (bez podataka je pokazivalo „85 — Odlično“), kalendar i trend, kretanje salda, kategorije i analiza, poslednje stavke, obrasci i oznake. Umesto njih je panel „Počni ovde“ sa dugmadima „Novi rashod“, „Novi prihod“ i „Ponavljajuće stavke“.
11. **Odloženo ažuriranje** (podaci nisu sačuvani):
    - `main.js` postavlja `saveFailed: true` u stanje ažuriranja.
    - Oznaka u gornjoj traci piše „Ažuriranje odloženo — podaci nisu sačuvani“.
    - Podešavanja pišu da će pokušati ponovo za 5 minuta.
    - Uspešna instalacija i novo preuzimanje brišu `saveFailed`.
12. **Excel sinhronizacija:** kad se povezan fajl promeni spolja, a ne izgleda kao fajl Knjige budžeta, status Excela prikazuje poruku o obliku fajla umesto da je proguta. Podaci se ne menjaju.

## Testiranje

- **Smoke:**
  - Ctrl+Z vraća obrisanu stavku
  - ? otvara i Esc zatvara prozor sa prečicama
  - dugmad bez teksta imaju aria-label
  - zaglavlje „Plaćeno“
  - Analiza sa malo podataka prikazuje poruku samo jednom
  - poruka o obliku Excela je vidljiva kroz `__excelShapeStatus`
- Pregled za novog korisnika se proverava pokretanjem bez podataka (`npm run smoke` bez fajla).
- **`npm test`:** nema nove logike u jezgru.
