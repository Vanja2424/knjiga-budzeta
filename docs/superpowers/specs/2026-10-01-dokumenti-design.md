# Dokumenti: garancije i dokumenti sa rokom, uz podsetnike (v1.25) — dizajn

Datum: 2026-10-01 · Aplikacija: Knjiga budžeta 1.24.0 · Dizajn je korisnik odobrio u razgovoru.

## Cilj

Na jednom mestu se čuvaju garancije za stvari (telefon, bela tehnika) i dokumenti sa rokom (registracija, osiguranje, pasoš, lična karta, ugovori). Uz svaki zapis idu prilozi (slike/PDF), a aplikacija podseća pre isteka. Za dokumente se može upisati cena obnove, a jedan klik na „Obnovi“ upisuje rashod i pomera rok.

Van ovog posla ostaju: sinhronizacija sa kalendarom, deljenje dokumenata i OCR bez AI-ja.

## Podaci

Ključ `budzet-dokumenti-v1` sadrži niz zapisa:

```
{ id, kind: 'garancija'|'dokument', title, group, issued?: 'YYYY-MM-DD', expires?: 'YYYY-MM-DD',
  warrantyMonths?: number, vendor?, notes?, files: [ime priloga], remindDays: number (podrazumevano 30),
  renewal?: { amount, category, months }, history?: [{ expires, renewedAt, entryId? }], entryId? }
```

- **Grupe:** podrazumevane su `Tehnika, Auto, Osiguranje, Lična dokumenta, Ugovori, Ostalo`. Korisnik može da upiše i svoju grupu.
- **Rok:** važi `expires`. Ako `expires` nije upisan, a postoje `issued` i `warrantyMonths`, rok se izračuna kao `C.addMonthsToDate(issued, warrantyMonths)`, uz zaokruživanje na kraj meseca (31.1. + 1 mesec daje 28./29.2.).
- **Stanje** (`C.documentStatus(doc, today)`):
  - `{ state: 'ok'|'soon'|'expired'|'none', days }`;
  - `soon` važi kad je `0 ≤ days ≤ remindDays`;
  - `expired` važi kad je `days < 0`;
  - `none` je zapis bez roka.
- **Čuvanje i provera:** zapisi idu u JSON kopiju i u Excel (list `Dokumenti`, polja liste se zapisuju kao JSON). Čiste se preko `C.cleanDocuments`, koji proverava id (`isId`), datume, priloge (`isAttachmentName`) i brojeve.

## Ekran „Dokumenti“

- Nova grupa u bočnom meniju (deveta), sa ikonom dokumenta.
- Filter *Sve / Garancije / Dokumenti*.
- Spisak je poređan po roku: najpre istekli i oni koji uskoro ističu, zatim važeći, a na kraju zapisi bez roka.
- Svaki red sadrži:
  - naziv i grupu;
  - oznaku stanja: zelenu „važi do D“, žutu „ističe za N dana“ ili crvenu „isteklo pre N dana“;
  - 📎 za prvi prilog;
  - dugme „Obnovi“ (samo za dokumente).
- Klik na red otvara prozor za izmenu.
- Na vrhu je dugme „Dodaj dokument…“, koje prihvata više fajlova (slike ili PDF).
- Prevlačenje fajla na ekran Dokumenti otvara isti tok.

## Prozor za unos i izmenu

- **Polja:**
  - vrsta;
  - naziv;
  - grupa (izbor sa mogućnošću upisa);
  - datum kupovine ili izdavanja;
  - za garanciju: trajanje u mesecima ili datum isteka;
  - datum isteka;
  - prodavac ili izdavalac;
  - podsetnik (broj dana);
  - napomena;
  - za dokument: cena obnove, kategorija i period u mesecima;
  - lista priloga, uz dugmad „Dodaj prilog“ i „Ukloni“.
- **Čitanje fajla:**
  - koristi isti `prepareBillFile` i `bills:read` (Groq);
  - uputstvo daje `C.documentPrompt(groups)`, a čišćenje radi `C.cleanDocumentReading(raw, groups)`, koji vraća `{ kind, title, group, issued, expires, warrantyMonths, vendor, low[] }`;
  - nesigurna polja su žuta.
- **Lična dokumenta:** kad korisnik izabere grupu „Lična dokumenta“, ili kada AI vrati tu grupu, prikaže se napomena da je za lična dokumenta bolje ručno uneti podatke. Prekidač **„Ne šalji ovaj fajl AI-ju“** je tada podrazumevano uključen za sledeće dodate fajlove. Pre prvog čitanja fajla prekidač je vidljiv uvek.
- **Bez AI-ja** (nema ključa ili AI ne uspe), prozor ostaje sa praznim poljima, a prilog se čuva.
- **Brisanje** zapisa traži potvrdu i može da se opozove (undo). Prilozi idu u `.obrisano`.

## Podsetnici

- **Kartica na Pregledu:** „Uskoro ističe“ prikazuje zapise u stanju `soon` ili `expired` (istekli u poslednjih 30 dana), sa vezom ka ekranu Dokumenti. Kartica se ne vidi kad takvih zapisa nema.
- **Obaveštenja:** šalju se kroz postojeći `checkAndSendNotifications` / `sendNotificationOnce`, uz ključ koji obuhvata rok:
  - `doc-<id>-<expires>-soon`: jednom, kad zapis uđe u `soon`;
  - `doc-<id>-<expires>-day`: na dan isteka.
- **Odabir zapisa:** zapise za podsetnik i obaveštenje bira čista funkcija `C.documentReminders(docs, today)` → `[{ doc, status, notifyKey }]`.

## Obnovi

`C.renewDocument(doc, today, months)` vraća novi zapis:
- `expires` je stari rok + `months` (podrazumevano `renewal.months` ili 12), računato od starog roka ako on nije stariji od 60 dana, a inače od danas;
- u `history` ide zapis `{ expires: stari, renewedAt: today }`.

Ako `renewal.amount > 0`, nastaje rashod `{ desc: 'Obnova: ' + title, amount, category, date: today }`, a njegov `entryId` ide u istoriju. Obnova se može opozvati (undo).

## Garancija iz rashoda

U Rashodima, za rashod sa `attachments`, uz 📎 stoji dugme **„+ garancija“**. Ono otvara prozor za nov zapis sa sledećim poljima:
- vrsta: garancija;
- naziv: prva stavka ili opis;
- datum kupovine: datum rashoda;
- prodavac: opis rashoda;
- prilozi: prilozi rashoda;
- trajanje: 24 meseca;
- veza sa rashodom (`entryId`).

## Delovi koda

- **budzet-core.js** (sa testovima):
  - `DOC_GROUPS`, `addMonthsToDate`, `documentExpiry`, `documentStatus`, `documentReminders`;
  - `renewDocument`, `cleanDocuments`, `documentPrompt`, `cleanDocumentReading`.
- **budzet-tracker.html:**
  - ekran `dokumenti`, prozor `docOverlay`, kartica na Pregledu, obaveštenja;
  - dugme „+ garancija“ u Rashodima;
  - JSON kopija i Excel, prevlačenje fajlova, i18n (uz proveru sudara).
- **app/bills.js:** bez izmena.

## Testiranje

- **node:test:**
  - meseci garancije sa krajem meseca i prestupnom godinom;
  - stanja na granicama (`days = 0`, `remindDays`, −1);
  - podsetnici i njihovi ključevi;
  - obnova od starog roka i od danas;
  - čišćenje zapisa i AI odgovora.
- **Smoke:**
  - unos sa lažnim AI odgovorom (`__fakeDocReading`) i spisak sa stanjima;
  - kartica na Pregledu;
  - obnova sa rashodom i opozivom;
  - garancija iz rashoda sa prilogom;
  - prekidač za lična dokumenta;
  - kopija i Excel.
- **Jedan pravi Groq poziv** sa izmišljenim garantnim listom, uz EN proveru i snimak ekrana.
