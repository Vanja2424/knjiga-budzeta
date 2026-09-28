# Nabavka (lista za kupovinu) — dizajn

Datum: 2026-09-28 · Aplikacija: Knjiga budžeta (trenutno 1.10.0)

## Cilj

Lista za kupovinu u Knjizi budžeta, samo na računaru. Treba da reši četiri problema:

1. **Zaboravljanje:** lista je podsetnik šta treba kupiti.
2. **Prekoračenje:** pre kupovine se vidi procena troška i koliko je ostalo u budžetu kategorije.
3. **Ponovno kucanje:** postoji stalni spisak stvari, pa se pre kupovine samo uključi šta ti treba.
4. **Ručni unos rashoda:** posle kupovine izabereš šta si kupio, upišeš ukupan iznos sa računa, i nastaje rashod sa spiskom kupljenih stvari.

**Uspeh:** lista za nedeljnu nabavku napravi se za oko minut, pre polaska se zna približan trošak, a rashod nastaje jednim prozorom.

**Van obima:**
- telefon ili mobilna verzija
- štampa liste
- više posebnih lista ili šablona
- strane valute
- menjanje cena stavki na osnovu iznosa sa računa
- **učitavanje fiskalnih računa** (QR → suf.purs.gov.rs). To je poseban kasniji projekat i traži pravi link sa računa. Popuniće isto polje `items`.

## 1. Podaci

### Stalni spisak stavki
Ključ u localStorage je `budzet-nabavka-v1`. Desktop verzija ga automatski upisuje u podaci.json, pa ulazi i u dnevne i mesečne kopije. Vrednost:

```json
{
  "items": [
    { "id": "…", "name": "Mleko 2,8%", "section": "Mlečni", "store": "Maxi", "category": "Hrana",
      "price": 150, "qty": "2 kom", "needed": true, "checked": false }
  ],
  "sections": ["Voće i povrće", "Pekara", "Mlečni", "Meso", "Suvi program", "Piće", "Smrznuto", "Higijena", "Kućna hemija", "Ostalo"]
}
```

- `name` je obavezan i jedinstven bez obzira na velika i mala slova (poređenje sa `trim().toLowerCase()`).
- `section` je jedan od `sections`. Podrazumevano je „Ostalo“.
- `store` je neobavezan slobodan tekst. Pri unosu se predlažu prodavnice koje su već korišćene.
- `category` je kategorija rashoda iz budžeta. Podrazumevano je ona sa poslednje dodate stavke, a na početku „Hrana“, ako postoji. Ako ne postoji, uzima se prva kategorija rashoda.
- `price` je neobavezan broj, RSD po stavci, i služi samo za procenu.
- `qty` je neobavezan tekst.
- `needed` znači da je stavka na listi za kupovinu.
- `checked` znači da je štiklirana kao kupljena u trenutnoj kupovini. Čuva se i posle zatvaranja aplikacije.
- Kad ključ ne postoji, koristi se `{ items: [], sections: <podrazumevani> }`. „Ostalo“ je uvek u `sections` i ne može se obrisati.
- Ključ ide u JSON rezervnu kopiju, pri izvozu i uvozu (sa proverom podataka). Ne ide u Excel.

### Rashod dobija spisak kupljenih stavki
- Novo neobavezno polje na rashodu: `items`, niz tekstova, npr. `["Mleko (2 kom)", "Hleb"]`.
- Rashodi prikazuju skraćeni spisak ispod opisa, npr. „Mleko, Hleb, Jaja +3“, a klik ili tooltip pokazuje ceo spisak.
- Izmena rashoda zadržava `items`.
- Excel: list „Stavke“ dobija kolonu **Kupljeno** (stavke razdvojene sa „, “). Uvoz iz Excela čita tu kolonu nazad u `items`.
- JSON rezervna kopija čuva `items` na rashodu. Provera podataka propušta samo nizove tekstova.

### Kategorije budžeta
- `renameCategory` preimenuje i `category` na stavkama nabavke.
- Kategorija rashoda se ne može obrisati dok je koriste stavke nabavke, isto kao kad je koriste rashodi ili ponavljajuće stavke.
- Brisanje dela prodavnice prebacuje njegove stavke u „Ostalo“.

## 2. Ekran Nabavka

**Mesto:** nova grupa u bočnom meniju, **Nabavka**, sa ikonom korpe, odmah ispod Kurseva.
- `SCREEN_GROUPS.nabavka = [['nabavka','Nabavka']]` i `SCREEN_RENDER.nabavka`.
- U `main.js` `SCREENS` dobija `['nabavka','Nabavka']` ispred Podešavanja, pa je prečica **Ctrl+8**. Podešavanja ostaju na Ctrl+,.
- Prečica `/` fokusira polje za brzo dodavanje (`QUICK_FOCUS_BY_SCREEN`).

**Gornja traka:**
- **Polje za brzo dodavanje:** Enter doda stavku (pravila su u odeljku 4). Ako stavka sa istim imenom postoji, samo joj se uključi `needed` (i osveže se cena i količina, ako su upisane), bez pravljenja duplikata. Nova stavka dobija `needed: true`.
- **Grupiši po:** segmentni izbor Deo prodavnice / Prodavnica / Kategorija. Pamti se lokalno. Stavke bez prodavnice idu u grupu „Bez prodavnice“.
- **Prikaži:** Za kupovinu (`needed`) / Sve stavke.

**Lista:**
- Grupe imaju naslov i broj stavki.
- Redosled grupa za deo prodavnice je redosled iz `sections`, a za ostale kriterijume abecedni. U grupi su stavke poređane abecedno.
- Red stavke ima:
  - kružić „kupljeno“ (`checked`), u stilu Reminders kao kod ponavljajućih stavki. Pojavljuje se samo za `needed` stavke.
  - naziv, a sitno i sivo količinu i cenu
  - u prikazu „Sve stavke“ prekidač „treba“
  - dugme za izmenu (modal za sva polja) i dugme za brisanje
- Deo prodavnice može da se uredi: dodavanje, preimenovanje, brisanje i redosled strelicama gore/dole. Uređuje se u malom modalu „Delovi prodavnice“.

**Donja traka (uvek vidljiva kad postoji bar jedna `needed` stavka):**
- „Za kupovinu: N stavki · procena ~X RSD“ i, ako neke nemaju cenu, „(K bez cene)“. Procena je zbir `price` za `needed` stavke koje imaju cenu. Količina se ne množi, jer je slobodan tekst.
- Za svaku kategoriju budžeta koja se javlja među `needed` stavkama:
  - sa budžetom (`limits[cat] > 0`): „Hrana: ostalo 12.000 od 30.000 · nabavka ~4.300“, gde je ostatak isti kao na ekranu Budžet (`envelopeRemainingThisMonth`). Red je narandžast kad je procena veća od ostatka.
  - bez budžeta: samo „Hrana: nabavka ~4.300“.
- Dugme **„Završi kupovinu (M)“**, gde je M broj štikliranih stavki. Aktivno je kad je M ≥ 1.

**Prazno stanje:** „Lista je prazna. Dodaj prve stavke, npr. Mleko, Hleb, Jaja.“ U prikazu „Za kupovinu“ bez `needed` stavki: „Nema ništa za kupovinu. Uključi „treba“ u prikazu Sve stavke ili dodaj novu stavku.“

## 3. Završi kupovinu → rashod

**Modal:**
- **Iznos sa računa** (RSD, obavezan, > 0).
- **Datum** (podrazumevano danas).
- **Račun** (samo ako ih ima više; podrazumevano kao kod rashoda).
- **Prodavnica** (predlaže se ona koja se najčešće javlja među štikliranim stavkama; ako ih ima više sa istim brojem, prva po abecedi; može se ostaviti prazno).
- **Raspodela po kategorijama:** prikazuje se samo ako štiklirane stavke imaju više od jedne kategorije.
  - Jedan red po kategoriji (redom po predloženom iznosu, opadajuće), sa iznosom koji se može menjati.
  - Predlog se računa srazmerno težini kategorije. Težina je zbir cena njenih štikliranih stavki, a stavka bez cene ima težinu jednaku prosečnoj ceni štikliranih stavki koje imaju cenu. Ako nijedna štiklirana stavka nema cenu, težina je broj stavki.
  - Iznosi se zaokružuju na ceo dinar, a poslednji red dobija ostatak, tako da zbir tačno odgovara ukupnom iznosu.
  - Ispod piše „Za raspodelu: D RSD“. Potvrda je moguća samo kad je D = 0 i svaki red > 0.
- Kad je ukupan iznos izmenjen, predlog se računa ponovo, ali samo dok korisnik nije ručno menjao redove.

**Rezultat potvrde:**
- Po jedan rashod za svaku kategoriju (jedan ako je kategorija jedna):
  - `type: 'expense'`, `paid: true`
  - `desc` = prodavnica ili „Nabavka“
  - `tags` sadrži `nabavka`
  - `category`, `amount`, `date`, a `accountId` ako postoje računi
  - `items` = štiklirane stavke te kategorije, kao „Naziv (količina)“ ili samo „Naziv“
  - Postojeće zaokruživanje za štednju (`applyRoundUpSaving`) primenjuje se po iznosu rashoda, kao kod ručnog unosa.
- Sve štiklirane stavke dobijaju `needed: false` i `checked: false`. Nekupljene `needed` stavke ostaju.
- Poruka: „Rashod X RSD dodat (N stavki)“. Ispravka se radi u Rashodima, kao za svaki rashod.

## 4. Pravila i granični slučajevi

- **Brzo dodavanje** (`parseShoppingInput`):
  - Poslednji broj u tekstu, ako iza njega nema jedinice, jeste **cena** (`C.parseAmount`, npr. „150“, „1.250“).
  - Broj za kojim sledi jedinica (`kom`, `kg`, `g`, `l`, `ml`, `pak`, bez obzira na velika i mala slova) jeste **količina**, npr. „2 kom“, „1,5 kg“.
  - Ostatak, bez viška razmaka, je naziv.
  - Primeri:
    - „Mleko 2 kom 150“ → Mleko, 2 kom, 150
    - „Jaja 10 kom“ → Jaja, 10 kom, bez cene
    - „Hleb“ → Hleb
    - „Jaja 10“ → Jaja, cena 10 (pravilo je namerno jednostavno)
  - Prazan naziv posle parsiranja → ništa se ne dodaje.
- **Jedinstvenost naziva:** pri izmeni, naziv koji već postoji kod druge stavke daje „Stavka sa tim imenom već postoji“.
- **Kategorija stavke koja više ne postoji** (npr. posle uvoza iz Excela): stavka se prikazuje u grupi „Bez kategorije“, a u Završi kupovinu se tretira kao prva kategorija rashoda. U modalu je to jasno označeno i može se promeniti preko reda raspodele.
- Stari podaci bez `budzet-nabavka-v1` i rashodi bez `items` rade kao pre.
- **Engleski:**
  - Svi novi statički tekstovi i t() šabloni dobijaju EN unos.
  - Podrazumevani delovi prodavnice se prikazuju prevedeni dok ih korisnik ne preimenuje. Prikazuju se bez `translate="no"` samo dok su tačno jednaki podrazumevanom imenu.
  - Nazivi stavki, prodavnice i kategorije su korisnički podaci i ne prevode se.

## 5. Arhitektura

- **`budzet-core.js`** (čiste funkcije, testovi u `app/test/core.test.js`):
  - `parseShoppingInput(text) → { name, qty, price }`
  - `findShoppingItem(items, name) → item|undefined` (poređenje bez obzira na velika i mala slova)
  - `groupShoppingItems(items, by, sections) → [{ key, label, items }]`, gde je `by` jedno od `'section'|'store'|'category'`
  - `shoppingEstimate(items) → { count, total, unpriced, byCategory: { [cat]: number } }` (samo `needed` stavke)
  - `splitPurchase(checkedItems, total) → [{ category, amount, items }]` (težine i zaokruživanje iz odeljka 3)
  - `mostCommonStore(items) → string`
  - `purchaseItemLabel(item) → string` („Naziv (količina)“)
- **`budzet-tracker.html`:**
  - stanje `shopping` (učitavanje, `saveShopping`) i ekran `screen-nabavka` sa `renderShopping()`
  - modal „Završi kupovinu“ i modal „Delovi prodavnice“
  - prikaz `items` u Rashodima
  - Excel kolona „Kupljeno“ (izvoz i uvoz)
  - JSON rezervna kopija (izvoz, provera i uvoz)
  - `renameCategory` i zabrana brisanja kategorije u upotrebi
  - CSS u sloju `apple-theme`
- **`app/main.js`:** nova stavka u `SCREENS` (meni i Ctrl+8).
- **`i18n.js`:** EN unosi.

## 6. Testiranje

- **`npm test`:**
  - `parseShoppingInput`: primeri iz odeljka 4, decimalna količina, cena sa tačkom za hiljade, prazan tekst
  - `findShoppingItem`: velika i mala slova, razmaci
  - `groupShoppingItems`: redosled delova, „Bez prodavnice“, „Bez kategorije“
  - `shoppingEstimate`: stavke bez cene i zbir po kategorijama
  - `splitPurchase`: jedna kategorija, srazmerna raspodela, stavka bez cene (prosek), nijedna cena (po broju), zaokruživanje (zbir jednak ukupnom, poslednji red preuzima ostatak)
  - `mostCommonStore` (i nerešen broj) i `purchaseItemLabel`
- **Smoke:**
  - ekran Nabavka se otvara, a meni ima 9 stavki
  - brzo dodavanje pravi stavku, a ponovljeno ime ne pravi duplikat
  - promena „Grupiši po“ menja naslove grupa
  - štikliranje ostaje sačuvano
  - Završi kupovinu sa dve kategorije pravi dva rashoda sa `items`, oznakom `nabavka` i zbirom jednakim unetom iznosu, a štiklirane stavke gube `needed`
  - preimenovanje kategorije se prenosi na stavke
  - sav test sadržaj se na kraju briše (radi se na privremenoj kopiji)
- **Engleski:** pokretanje sa `lang: en` i pregled vidljivog teksta ekrana Nabavka.
- **Ručno:** snimak ekrana sa test podacima, SR i EN.
