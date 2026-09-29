# IPS QR za plaćanje računa (v1.18) — dizajn

Datum: 2026-09-29 · Aplikacija: Knjiga budžeta 1.17.0 · Dizajn je korisnik odobrio u razgovoru.

## Cilj

Ponavljajući račun (struja, Infostan, telefon…) plaća se skeniranjem IPS QR koda sa ekrana u m-banking aplikaciji, bez prekucavanja brojeva. Iz uplatnice sa QR kodom sami se popunjavaju podaci za plaćanje.

## Podaci

`r.payee = { account, name, code, purpose, model, reference }` na ponavljajućem rashodu.
- `account` je broj od 18 cifara.
- `code` je podrazumevano 189.
- Podaci za plaćanje se čuvaju:
  - u JSON kopiji, preko `C.cleanPayee`;
  - u Excelu, u listu Ponavljajuce, sa kolonama PrimalacRacun, PrimalacNaziv, SifraPlacanja, SvrhaPlacanja, Model i PozivNaBroj.

## Jezgro (`budzet-core.js`, testirano)

- `normalizeAccount`: pretvara „160-12345-78“ i slične zapise u 18 cifara.
- `validAccount`: proverava kontrolni broj po ISO 7064 MOD 97-10.
- `formatAccount`: vraća zapis 3-13-2.
- `validReference97`: proverava poziv na broj po modelu 97, a slova pretvara u brojeve (A=10…).
- `ipsQrString`: pravi tekst koda.
  - Tagovi su redom K:PR, V:01, C:1, R, N (najviše 70 znakova), I (RSD, decimalni zarez, uvek dve decimale) i SF.
  - S (najviše 35 znakova) i RO (model + poziv, model 00 kad nije upisan) dodaju se samo ako postoje.
- `ipsSafe`: čisti tekst po pravilima NBS-a, koja su proverena na NBS servisu.
  - Ćirilica se preslovljava u latinicu.
  - Crtice – i — postaju -.
  - Ostala slova sa akcentima gube akcent.
  - Znakovi koje NBS ne prihvata (€, №, \\ i slični) se izbacuju.
  - Dozvoljeni su latinica sa čćžšđ, cifre, obični ASCII znakovi i „“.
- `parseIpsQr`: čita tekst sa uplatnice. Vraća null ako tekst nije K:PR.
- `ipsProblems`: vraća poruke za korisnika o računu, nazivu, šifri (prvo 1 ili 2), iznosu, modelu i pozivu po modelu 97.

## Ekran

- Dugme **QR** u redu ponavljajućeg rashoda.
  - Kad stavka ima podatke za plaćanje, dugme je plavo i otvara prozor **Plati QR kodom**:
    - QR (`qrcode-generator`, UTF-8, nivo zaštite M, belo polje i u tamnoj temi)
    - podaci ispisani uz kod
    - iznos koji može da se promeni
    - dugme **Plaćeno**, koje radi isto što i čekiranje sa tim iznosom i vidi se samo kad je stavka na redu i neplaćena
  - Kad stavka nema podatke za plaćanje, dugme otvara unos tih podataka.
- **Podaci za plaćanje** su polja sa proverom pre čuvanja i dugmetom „Učitaj QR sa uplatnice…“ (slika ili Ctrl+V). Ima i „Ukloni podatke“ sa „Poništi“.
- Forma za novu ponavljajuću stavku ima **„Sa uplatnice (QR)…“**, a Ctrl+V na ekranu Ponavljajuće radi isto. Popunjavaju se opis (naziv primaoca) i iznos, a podaci za plaćanje se čuvaju uz stavku.
- Čitanje slike radi `jsQR`. Pokušava se sa slikom smanjenom na 2000, 1000 i 600 px, a svetli i tamni kod se oba prepoznaju.

## Provera

- `npm test`: 61 test, uključujući tačan primer iz NBS dokumentacije.
- NBS servis `nbs.rs/QRcode/api/qr/v1/validate` je samo tokom razvoja proverio 5 izmišljenih primera i znakove. Svi su dobili „OK“. Aplikacija sama ništa ne šalje.
- Smoke:
  - uplatnica popunjava formu, a stavka čuva podatke
  - nacrtan kod se čita nazad u isti tekst
  - promena iznosa menja kod
  - pogrešan račun se ne čuva
  - „Plaćeno“ upisuje rashod sa izabranim iznosom
- Ručno: PNG „uplatnice“ sa QR kodom se čita u tačne podatke.
