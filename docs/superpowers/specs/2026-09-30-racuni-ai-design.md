# Računi: ubacivanje PDF-a i slike, AI čitanje i pregled po lokacijama (v1.20) — dizajn

Datum: 2026-09-30 · Aplikacija: Knjiga budžeta 1.19.1 · Dizajn je korisnik odobrio u razgovoru, u tri dela.

## Cilj

Korisnik vodi godišnju tabelu kućnih računa ručno u Excelu. Tabela ima dve lokacije (stan i Drvar). Za svaku lokaciju prati iznos po računu (struja, plin, voda, internet) i potrošnju (struja skupa i jeftina u kWh, plin i voda u m³), po mesecima i sa godišnjim zbirom.

Posle ove izmene korisnik ubaci PDF ili sliku računa. Aplikacija pročita iznos, period i potrošnju, prikaže sve na potvrdu, sačuva račun sa priloženim fajlom, napravi ili poveže rashod i upiše vrednosti u tabelu „Računi“.

Nije deo ovog posla:
- lokalni AI modeli (Ollama);
- drugi AI dobavljači osim Groq-a;
- OCR bez AI-ja;
- provera obračuna (kWh × cena);
- fiskalni računi iz prodavnica.

## Podaci

Svi novi podaci su deo podaci.json. Čuvaju se i vraćaju isto kao ostali podaci, preko JSON kopije i provere oblika (`C.checkDataFileShape`).

**Lokacije:** `locations = [{ id, name, currency }]`
- `currency` je šifra sa postojeće liste `CURRENCIES` (npr. RSD, BAM, EUR).
- Na početku postoji jedna lokacija, `{ name: 'Stan', currency: 'RSD' }`.

**Vrste računa:** `billTypes = [{ id, locationId, name, category, metrics: [{ key, name, unit }] }]`
- `category` je kategorija rashoda.
- `key` je stabilan (npr. `m1`). Ne menja se kad se merenje preimenuje.
- Unapred ponuđene vrste za novu lokaciju (korisnik može da ih menja i briše):
  - Struja: Skupa (kWh), Jeftina (kWh);
  - Plin: Potrošnja (m³);
  - Voda: Potrošnja (m³);
  - Internet: bez merenja.

**Računi:** `bills = [{ id, billTypeId, month, periodFrom?, periodTo?, amount, currency, values: { [metricKey]: number }, dueDate?, payee?, entryId?, file?, source }]`
- `month` je obračunski mesec, u obliku `YYYY-MM`.
- `amount` je u valuti računa. Rashod dobija iznos u RSD po postojećoj logici za valute (`currency`, `origAmount`, `rate`).
- `payee` ima isti oblik kao `r.payee` iz IPS QR-a i čisti se preko `C.cleanPayee`.
- `entryId` je veza ka rashodu. To je ili nov rashod ili rashod ponavljajuće stavke (`rec-<id>-<mKey>`).
- `file` je samo naziv fajla u folderu `Prilozi`, na primer `2026-09-struja-stan-<id>.pdf`.
- `source` je `'ai' | 'qr' | 'manual' | 'excel'`.

**Prilozi:** folder `Prilozi` pored podaci.json.
- OneDrive ga sinhronizuje zajedno sa podacima.
- Dnevna i mesečna rezervna kopija čuvaju samo JSON. Dodatna kopija (`runExtraBackup`) kopira i folder `Prilozi`, ali samo fajlove koji nedostaju ili su promenjeni.

**Brisanje:**
- Brisanje računa briše i njegov prilog. Pre toga traži potvrdu, a opozvati se može preko Ctrl+Z (`undoStack`). Prilog se zato prvo premešta u `Prilozi/.obrisano` i trajno se briše posle 30 dana.
- Brisanje rashoda ne briše račun. Računu se samo uklanja `entryId`.

**Excel izvoz:** tri nova lista, Lokacije, VrsteRacuna i Racuni. Vrednosti merenja idu u jednu kolonu, kao JSON.

## Podešavanja → AI čitanje računa

- Dobavljač je Groq. Pored njega stoji link ka `https://console.groq.com/keys`.
- **API ključ** se upisuje u polje za lozinku.
  - Čuva se u settings.json kao `groqKeyEnc`, šifrovan preko `safeStorage.encryptString`.
  - Nikad ne ide u podaci.json, rezervne kopije ni Excel, a stranica ga ne dobija nazad.
  - Stranica vidi samo „ključ je upisan“ i poslednja 4 znaka.
  - Kad safeStorage ne radi, ključ se ne čuva, a stranica prikaže poruku.
- **Model** je podrazumevano `qwen/qwen3.8-27b`, jedini Groq model za slike na dan 2026-09-30. Polje može da se menja, jer Groq često gasi modele.
- Dugme **„Proveri ključ“** šalje jedan mali zahtev i javlja uspeh ili tačan razlog greške.
- Prekidač **„Šalji tekst iz PDF-a uz slike“** je podrazumevano uključen.
- Napomena: „Fajl računa se šalje Groq-u na čitanje. Ostali podaci ostaju samo na ovom računaru.“
- Ekran za lokacije i vrste računa (dodaj, preimenuj, obriši, merenja) nalazi se u istom delu podešavanja.

## Tok ubacivanja

**Ulaz**
- Dugme **„Dodaj račun“** na ekranu Računi, ili prevlačenje fajlova u prozor.
- Prihvata PDF, JPG, PNG, WEBP i HEIC. HEIC se pretvara preko `<img>`/canvas ako Chromium to podržava. Ako ne podržava, javlja „sačuvaj sliku kao JPG“.
- Više fajlova se obrađuje jedan za drugim, a prozor za potvrdu se otvara za svaki.

**Obrada**
1. **PDF** (pdf.js u stranici):
   - izvlači tekst sa svih strana, najviše 20.000 znakova;
   - prve 3 strane pretvara u JPEG, sa dužom stranom do 1600 px.
   **Slika:** smanjuje se na dužu stranu do 1600 px, u JPEG kvaliteta 0.85.
2. **IPS QR** se traži u slikama postojećom logikom (jsQR i `C.parseIpsQr`).
3. **Groq** (`bills:read` u glavnom procesu, `app/bills.js`):
   - poziva `https://api.groq.com/openai/v1/chat/completions` sa `response_format: { type: 'json_object' }` i najviše 3 slike (base64);
   - šalje i tekst iz PDF-a ako je prekidač uključen, kao i spisak lokacija i vrsta računa sa merenjima (id, naziv, jedinica);
   - vremensko ograničenje je 60 s.
   Model vraća sledeće:
   ```json
   { "locationId": "", "billTypeId": "", "month": "YYYY-MM", "periodFrom": "", "periodTo": "",
     "amount": 0, "currency": "", "dueDate": "", "values": { "m1": 0 },
     "payee": { "name": "", "account": "", "reference": "" },
     "confidence": { "amount": "high|low", "...": "..." } }
   ```
4. **Jezgro** proverava i čisti odgovor (`C.cleanBillReading`):
   - JSON se izvlači i kad oko njega ima teksta;
   - brojevi tipa „4.456,16“ i „4,456.16“ postaju 4456.16;
   - nepoznat id se odbacuje;
   - mesec se proverava, a nedostaje li, računa se iz perioda;
   - nepoznata valuta se zamenjuje valutom lokacije.
   Zatim se odgovor spaja sa QR podacima (`C.mergeBillQr`). Iznos, račun primaoca i poziv na broj iz QR-a imaju prednost. Kad se iznosi razlikuju, polje dobija oznaku „low“.

**Prozor za potvrdu**
- Levo je pregled: slika ili prva strana PDF-a, sa listanjem strana.
- Desno su polja: lokacija, vrsta, mesec, period, iznos (u valuti lokacije), merenja vrste, rok i primalac.
- Polja sa oznakom `low` ili bez vrednosti su obeležena žuto.
- Promena vrste menja spisak merenja. Vrednosti za merenja sa istim ključem ostaju.
- Dugmad:
  - **Sačuvaj kao plaćen**: rashod sa današnjim datumom, `paid` nije postavljen.
  - **Sačuvaj za plaćanje**: rashod sa `paid: false` i datumom na rok (ili danas). Ulazi u „Za plaćanje“ po postojećoj logici.
  - **Otkaži**: ništa se ne čuva, a privremeni fajl se briše.
- **Ponavljajuća stavka** (`C.findRecurringForBill`) je stavka čija kategorija odgovara vrsti, a naziv sadrži naziv vrste (bez obzira na mala i velika slova i dijakritike). Ako takva stavka dospeva u mesecu računa, nije preskočena i nema upisan rashod, račun se veže za nju:
  - „plaćen“ znači `markRecurringPaid(r, mKey, iznosRSD)`;
  - „za plaćanje“ ne pravi rashod, nego samo pamti `billId` na stavci za taj mesec, da „Plati“ kasnije upotrebi iznos sa računa.
  Pre čuvanja se prikaže napomena „Povezuje se sa ponavljajućom: Struja“, uz mogućnost da se veza isključi.
- **Duplikat** je račun iste vrste i meseca (`C.findBillDuplicate`). Aplikacija pita „Zameni postojeći“ ili „Zadrži oba“. Zamena briše stari prilog, a rashod zadržava i ažurira.
- Posle čuvanja, prilog se kopira u `Prilozi` pod konačnim imenom (`bills:saveFile`). Ako snimanje ne uspe, račun se ne sačuva i prikaže se greška.

**Bez ključa, mreže ili odgovora**
- Prozor se otvara sa praznim poljima i onim što je dao QR.
- Poruka navodi razlog: „nema ključa“, „ključ nije ispravan (401)“, „dostignut limit (429), pokušaj za N s“, „model ne postoji (404), promeni ga u podešavanjima“, „nema mreže“ ili „isteklo vreme“.

## Ekran „Računi“ (Izveštaji → podkartica Računi)

- Na vrhu su izbor godine, dugme „Dodaj račun“ i „Uvezi iz Excela“.
- Za svaku lokaciju prikazuju se dva bloka:
  - **Iznos**: redovi su vrste, kolone su meseci 1–12, a desno je godišnji zbir. Iznosi su u valuti lokacije, a ispod bloka je zbir lokacije.
  - **Potrošnja**: redovi su merenja svih vrsti (npr. „Struja – Skupa“, „Plin“), a desno je godišnji zbir.
- Ćelija sa računom se otvara klikom. Prikazuje detalje, dugme „Otvori prilog“ (`shell.openPath`), „Izmeni“ i „Obriši“. Ako račun ima više zapisa u istom mesecu („Zadrži oba“), ćelija prikazuje zbir.
- Prazna ćelija za mesec pre tekućeg je obeležena kao „fali“, ali samo za vrste koje u toj godini imaju bar jedan račun. Klik nudi ručni unos.
- Ispod je grafikon potrošnje po mesecima za izabrano merenje, uz liniju za prethodnu godinu. Iscrtava ga postojeći način crtanja grafikona u aplikaciji.
- Logiku tabele računa `C.billsTable(bills, billTypes, locations, year)` → `{ locations: [{ id, rows: [{ typeId, cells[12], total }], metricRows: [...], total }] }`.

## Uvoz postojeće Excel tabele

- „Uvezi iz Excela“ čita list u obliku korisnikove tabele (`C.parseBillsSheet`):
  - red sa mesecima „01. Januar“…„12. Decembar“;
  - blokovi čija prva kolona počinje sa „Kućni računi“, sa kolonom „Račun“.
  - Blokovi sa „(potrošnja)“ su merenja, a ostali su iznosi.
  - Naziv u zagradi (npr. „Drvar“) je lokacija. Blok bez zagrade je prva lokacija.
  - Redovi „Struja - skupa“ i „Struja - jeftina“ postaju merenja vrste Struja.
- Pre uvoza se prikaže pregled: lokacije i vrste koje će biti napravljene, broj računa i duplikati. Uvezeni računi imaju `source: 'excel'` i nemaju rashod ni prilog.

## Delovi koda

- **budzet-core.js** (testirano): `cleanBillReading`, `parseLooseNumber`, `mergeBillQr`, `findRecurringForBill`, `findBillDuplicate`, `billsTable`, `parseBillsSheet`, `defaultBillTypes`, provera oblika za `locations`, `billTypes` i `bills` u `checkDataFileShape`, i `billsPrompt`, koji pravi uputstvo i JSON šemu za model.
- **app/bills.js** (novo, glavni proces):
  - `bills:key-set`, `bills:key-info`, `bills:key-test`;
  - `bills:read(images, text, schema)`;
  - `bills:saveFile(tempPath|bytes, name)`, `bills:openFile(name)`, `bills:deleteFile(name)`;
  - čišćenje `.obrisano`.
  main.js ga samo učitava, a preload izlaže `desktop.bills`.
- **pdf.js** (`pdfjs-dist` legacy build, `pdf.min.js` + `pdf.worker.min.js`) ide u koren repoa, a copy-web ga kopira.
- **budzet-tracker.html**: ekran Računi, prozor za potvrdu, podešavanja, prevlačenje fajlova, i18n za sav novi tekst.
- **Browser verzija** (bez `window.desktop`): ekran Računi i ručni unos rade, a dugme za AI čitanje i prilozi su skriveni.

## Testiranje

- **node:test** za sve funkcije iz core-a. Slučajevi uključuju:
  - JSON u \`\`\`json bloku i tekst oko njega;
  - decimalni zarez i tačku za hiljade;
  - nepoznat id;
  - mesec koji nedostaje i računa se iz perioda;
  - razliku između QR i AI iznosa;
  - duplikat;
  - uparivanje sa ponavljajućom stavkom (sa dijakritikama);
  - tabelu sa dve lokacije i dve valute;
  - parsiranje tabele iz korisnikovog primera, sa praznim i crvenim ćelijama.
- **Smoke** (`test/smoke-checks.js`) sa test hookom `__fakeBillReading`, koji zamenjuje Groq poziv:
  - ubacuje PDF i PNG iz `test/fixtures` (lažni račun napravljen za test);
  - proverava prozor za potvrdu i žuta polja;
  - proverava čuvanje, prilog u `Prilozi`, ćeliju u tabeli i vezu sa ponavljajućom stavkom;
  - proverava brisanje i Ctrl+Z.
- **Jedan pravi poziv Groq-u** sa lažnim računom (ne sa podacima korisnika), da se potvrdi oblik zahteva i odgovora. Korisnik zatim proverava na svojim računima.
- **EN prevod** se proverava postojećim načinom (`settings.json` `lang: en`).
