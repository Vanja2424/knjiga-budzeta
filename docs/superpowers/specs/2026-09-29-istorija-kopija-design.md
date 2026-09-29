# Paket 6 — Uvoz istorije, kopija van računara, Ponavljajuće u Transakcijama (v1.17) — dizajn

Datum: 2026-09-29 · Aplikacija: Knjiga budžeta 1.16.0 · Odluke su donete bez posebnog odobrenja („samo vozi“). Premeštanje Ponavljajućih je tražio korisnik.

## 1. Uvoz starijih izvoda (istorija)

- Polje za uvoz prima **više fajlova odjednom** (`multiple`). Svi se čitaju i prikazuju u jednom pregledu. Fajl koji ne može da se pročita navodi se u pregledu, a ostali se ipak uvoze.
- **Izvodi koji se preklapaju:** `C.mergeImportBatches(batches)` uzima, za svaku kombinaciju tip, datum, iznos i opis, najveći broj ponavljanja u jednom fajlu.
  - Stavka koja se nalazi u dva izvoda uvozi se jednom.
  - Dve iste kafe u istom izvodu ostaju dve.
- **Tačni duplikati** sa knjigom se preskaču kao i do sada (`splitDuplicates`).
- **Slične stavke:** `C.findNearDuplicates(rows, existing, 3)` traži stavke sa istim tipom i istim iznosom na dinar, sa datumom do 3 dana razlike. Opis može biti drugačiji: banka piše „TRAJNI NALOG“, a u knjizi stoji „Kirija“.
  - Postojeća stavka se upari samo jednom.
  - Slične stavke se prikazuju u pregledu sa kvačicom koja je **isključena**.
  - Dugme za uvoz pokazuje broj koji će se uvesti.
- **Pregled po mesecima:** `C.monthCoverage(rows)` daje oznaku za svaki mesec sa brojem stavki. Meseci koji već imaju stavke u knjizi su podvučeni.
- Posle uvoza status navodi koliko je uvezeno i koliko je duplikata i sličnih preskočeno. Dugme „Poništi“ briše ceo uvoz (`importId`).

## 2. Kopija van računara (USB disk ili drugi folder)

- Podešavanja, grupa „Kopija van računara“, sa dugmadima:
  - „Izaberi folder…“ (Windows dijalog za folder)
  - „Kopiraj sada“
  - „Otvori folder“
  - „Isključi“
- `main.js` čuva `settings.extraBackupDir` i `settings.extraBackupLast` i pravi kopiju u `runExtraBackup(force)`:
  - kopira `podaci.json` u `<folder>\Knjiga budzeta kopije\Podaci-YYYY-MM-DD.json`
  - najviše jednom dnevno, osim kad se klikne „Kopiraj sada“
  - čuva poslednjih 60 kopija
- Pokušaj ide 20 s posle pokretanja, pa na svakih 15 minuta. Kad se USB priključi, kopija nastaje u roku od 15 minuta. Kad folder nije dostupan, ništa se ne dešava.
- **Upozorenje:** kad je folder izabran, a kopije nema 14 ili više dana, na Pregledu stoji „Kopija van računara nije napravljena N dana — priključi disk“, a status u Podešavanjima je narandžast.
- IPC kanali: `backup:extra-info|now|choose|clear|open` i događaj `desktop:extra-backup`.

## 3. Ponavljajuće u Transakcijama

- `SCREEN_GROUPS.transakcije` = Rashodi, Prihodi, **Ponavljajuće**, Računi i prenosi, Pretraga. Grupa `ponavljajuce` i njeno dugme u bočnom meniju su uklonjeni.
- Podkartica Ponavljajuće dobija crveni broj zakasnelih (`C.overdueRecurring`).
- `main.js SCREENS` gubi Ponavljajuće, pa ekrani sada idu **Ctrl+1 … 7**. Spisak prečica je ispravljen.
- Obaveštenja, dugme „Ponavljajuće stavke“ na Pregledu i redovi „Očekuje se“ i dalje vode na `showScreen('ponavljajuce')`.

## Testiranje

- **`npm test`:**
  - `findNearDuplicates`: prozor od 3 dana, isti tip, jedno uparivanje, iznos na dinar
  - `monthCoverage`
  - `mergeImportBatches`
- **Smoke:**
  - podkartica Ponavljajuće u Transakcijama, 8 stavki u meniju
  - uvoz dva preklopljena CSV-a daje 3 stavke
  - slična stavka je ponuđena, isključena i ne uvozi se
  - grupa za kopiju van računara postoji
- **Ručno (pokretanje sa `settings.extraBackupDir`):** „Kopiraj sada“ pravi `Knjiga budzeta kopije\Podaci-<danas>.json`.
