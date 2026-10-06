# Razgovor sa botom i naredbe (v1.35) — dizajn

Datum: 2026-10-06 · Aplikacija: Knjiga budžeta 1.34.0 · Korisnik je odobrio sva tri dela dizajna u razgovoru.

## Cilj

Telegram bot postaje sagovornik. Korisnik ga pita („šta treba da platimo?“, „koliko smo dali za hranu?“, „a prošlog meseca?“) i daje mu naredbe rečima („platila sam porez“, „vratila sam Raletu 5000“). Bot svaku izmenu prvo predloži, a izvrši je tek posle klika na „✓ Potvrdi“.

Unos troška više nije podrazumevan: ide preko `/nov`. Slike, PDF i linkovi Poreske uprave rade kao i do sada.

Bot je u privatnom razgovoru i u zajedničkoj grupi (grupa služi samo za bota) — u oba svaka poruka bez komande je pitanje ili naredba.

Van ovog posla:
- brisanje starijih stavki, izmena podešavanja, kategorija i ponavljajućih stavki preko bota;
- podsetnici koje bot sam šalje (v1.36) i mesečni rezime (v1.37) — oni će koristiti ista dugmad.

## Usmeravanje poruka

| Poruka | Ponašanje |
|---|---|
| `/nov kafa 250`, `/nov +plata 120000` | Unos odmah, kao dosadašnji tekst (`telegramEntryDraft`), uz „Poništi“. U grupi važe ista pravila nacrta kao do sada (iznos ≥ 10 i opis). |
| `/nov` bez teksta | Bot odgovara „Šta da upišem?“. Sledeća tekstualna poruka iz istog chata (u roku od 10 min) je unos. |
| Slika, PDF | Kao do sada. |
| Tekst sa linkom Poreske uprave | Kao do sada (fiskalni račun). |
| `/ponisti` | Kao do sada (poslednji unos ili radnja iz bota, 24 h). |
| `/pomoc`, `/start`, `/help` | Novo uputstvo: pitanja, naredbe, `/nov`, slike. |
| Druga komanda | Uputstvo. |
| Sve ostalo | Pitanje ili naredba (AI). |

`C.telegramIntent(text)` vraća `{ kind: 'command', command: 'nov', rest }`, `pomoc`, `ponisti`, `nepoznata`, ili `{ kind: 'question' }`. `/nov@ime_bota tekst` se prihvata.

## Tok pitanja (`tgAsk`)

Isti princip kao „Pitaj svoj budžet“: AI ne dobija iznose u prvom koraku, aplikacija računa lokalno.

1. **Plan.** `C.askPlanPrompt` dobija pitanje, kategorije, opseg meseci i **kontekst razgovora**: do 4 prethodne razmene iz istog chata, ne starije od 15 minuta. Razmena = pitanje + odgovor skraćen na 300 znakova. AI vraća JSON:
   ```
   { "calls": [...], "action": null | { "kind": "", "target": "", "amount": null, "items": [] }, "offTopic": false }
   ```
2. **Proračuni** (`calls`) — postojeći (`monthSummary`, `byCategory`, `compare`, `top`, `average`, `recurring`) i novi:
   - `toPay {}` — spisak „Za plaćanje“ za tekući mesec: stavke (opis, iznos, rok, vrsta: rashod/ponavljajuća/rata), zbir, dugovi (osoba, ostatak).
   - `debts {}` — moji dugovi i dugovanja meni: osoba, ukupno, ostatak.
   - `accounts {}` — stanje po računu i ukupno.
   - `goals {}` — cilj, trenutno, ciljni iznos, mesečni plan.
   - `forecast {}` — prognoza do plate: najniže stanje i dan, stanje na dan plate, upozorenje.

   Novi proračuni ne traže mesece. Stranica ih računa svojim postojećim funkcijama i prosleđuje gotove rezultate u `C.runAskTools(calls, { ..., snapshot })`, da se ništa ne računa dva puta.
3. **Odgovor.** `C.askAnswerPrompt` kao do sada (jezik aplikacije), uz kontekst razgovora. Odgovor ide u chat (najviše 3000 znakova). Razmena se dodaje u kontekst.
4. **Naredba** (`action` različit od null) ima prednost nad proračunima: bot ne zove drugi AI korak, već lokalno traži metu i šalje predlog sa potvrdom.

`offTopic` → „Mogu da odgovorim samo na pitanja o budžetu. Za unos: /nov kafa 250“. Prazan plan → „Za ovo pitanje nema podataka u knjizi.“

## Naredbe

`action.kind` je jedno od: `add`, `paid`, `skip`, `debtPay`, `goalPay`, `shopAdd`, `shopDone`, `editLast`, `deleteLast`. Nepoznata vrsta se odbacuje (plan bez naredbe). `amount` mora biti broj > 0 i < 100.000.000, inače se briše. `items` najviše 20 naziva po 60 znakova. `target` najviše 60 znakova.

AI nikad ne dobija imena ponavljajućih stavki, dugova, ciljeva ni spiska Nabavke. Metu traži aplikacija: `C.matchActionTarget(target, candidates)`.

### Poklapanje imena

`matchActionTarget(text, candidates)` — kandidati su `{ id, name }`.
- Poređenje posle `foldText` (mala slova, bez dijakritika) i skidanja padežnog nastavka svake reči (najduži od: `ima, ama, ovi, ove, ova, om, em, u, a, e, i, o`, ako ostaje ≥ 3 slova).
- Bodovi: celo ime = 3; sve reči imena su u tekstu = 2; reč teksta je početak reči imena (≥ 3 slova) = 1.
- Rezultat: `{ match }` kad je jedan najbolji, `{ choices }` (najviše 6) kad ih je više sa istim bodovima, `{ none: true }` kad nema poena.

### Ponašanje po naredbi

Za svaku naredbu bot šalje **predlog** sa dugmićima „✓ Potvrdi“ i „✕ Otkaži“. Izvršava se istim funkcijama kao dugmad u aplikaciji. Posle potvrde predlog se menja u rezultat sa dugmetom „Poništi“.

| Vrsta | Kandidati | Predlog | Izvršenje |
|---|---|---|---|
| `add` | — | „Upisati rashod: kafa 250 · Hrana?“ (nacrt iz `telegramEntryDraft` nad `target` + iznos) | Kao `/nov`. |
| `paid` | Prvo stavke iz „Za plaćanje“ (neplaćeni rashodi + ponavljajuće koje dospevaju ovog meseca); ako nema pogotka, sve aktivne ponavljajuće rashodne stavke | „Označiti Porez (8.000) kao plaćen za oktobar?“ | Ponavljajuća: `markRecurringPaid(r, mKey, amount)` (iznos iz naredbe ili predložen). Neplaćen rashod: `paid = true` (iznos se menja ako je naveden). |
| `skip` | Ponavljajuće koje dospevaju ovog meseca, nisu plaćene ni preskočene | „Preskočiti Nokti (4.000) za oktobar?“ | Isto što i „Preskoči“ u Ponavljajućim. |
| `debtPay` | Dugovi `i_owe` sa ostatkom > 0 | „Uplata 5.000 na dug Rale? Ostaje 7.000.“ | `d.paidAmount += iznos` (najviše do ostatka). Bez iznosa: bot pita „Koliko?“, sledeći broj iz chata (10 min) je iznos. |
| `goalPay` | Ciljevi | „Uplatiti 10.000 u cilj Letovanje?“ | `contributeToGoal(g, iznos)`. Bez iznosa: kao kod duga. |
| `shopAdd` | — (stavke iz `items`) | „Dodati na spisak: mleko, hleb?“ | Isto što i dodavanje u Nabavci; postojeća stavka se označi kao „treba“. |
| `shopDone` | Stavke spiska označene kao „treba“ | „Štiklirati: mleko?“ | Isto što i štikliranje u Nabavci. Stavke bez pogotka se navedu u predlogu („nisam našao: jaja“). |
| `editLast` | Unosi iz bota u poslednja 24 h (dnevnik `/ponisti`) | „Kafa 250 → 300?“ | Menja iznos (ili opis) unosa. |
| `deleteLast` | Isto | „Obrisati: kafa 250?“ | Briše unos (kao `/ponisti`). |

`editLast`/`deleteLast` bez mete gađaju poslednji unos iz bota.

Više kandidata → poruka „Na šta misliš?“ sa dugmetom po kandidatu; klik pravi predlog za izabrani. Nijedan → „Nisam našao „porez“ među …“.

### Potvrde

- Predlog se čuva u `budzet-telegram-potvrde-v1`: `{ id, chatId, action, targetId, amount, items, created, state }`, rok 10 minuta, najviše 50 (stariji se brišu). Nije u Excelu ni u proveri oblika rezervne kopije kao obavezan ključ.
- Dugmad (`C.parseTelegramCallback`): `c:<id>` potvrdi, `n:<id>` otkaži, `h:<id>:<idx>` izbor kandidata.
- Pre izvršenja se proverava da li je stanje i dalje isto (npr. Porez je u međuvremenu plaćen u aplikaciji): ako nije, bot odgovara „Već urađeno“ i ne menja ništa.
- Istekao ili već iskorišćen predlog → „Isteklo“ / „Već urađeno“ (callback tekst).
- U grupi svako može da potvrdi; rezultat nosi ime onoga ko je potvrdio („✓ Ana: Porez plaćen“).

### Poništi

Dnevnik `/ponisti` (`tgLog`) dobija zapis radnje: `{ kind, ids, prev }`, gde `prev` čuva prethodno stanje (npr. `paid` i iznos rashoda, `applied`/`skipped` za mesec, `paidAmount` duga, `current` cilja i id prenosa, stanje stavki Nabavke, stari iznos/opis unosa, obrisan unos). Poništavanje vraća tačno to stanje. Rok 24 h, kao do sada.

## Razgovor

Kontekst se čuva samo u memoriji stranice, po chatu: najviše 4 razmene, starije od 15 minuta se odbacuju. Posle ponovnog pokretanja aplikacije razgovor počinje iz početka. Predlozi i odgovori na naredbe ne ulaze u kontekst.

## Meni komandi

`app/telegram.js` posle uspešnog `getMe` šalje `setMyCommands` sa `/nov` („Nov unos: /nov kafa 250“), `/ponisti`, `/pomoc` (srpski; engleski opis kad je jezik aplikacije engleski). Greška se ignoriše (ne zaustavlja bota).

## Greške

- AI nije podešen → „AI nije podešen (Podešavanja → AI). Unos i dalje radi: /nov kafa 250“.
- Groq 429/413/mreža → kratka poruka o zauzetosti, uz podsećanje na `/nov`.
- Plan ne može da se pročita → „Nisam razumeo — probaj drugačije.“
- Izvršenje ne uspe (npr. stavka obrisana) → „✕ Nije urađeno: …“ i predlog se zatvara.

## Testovi

**Jedinični (`app/test/core.test.js`):**
- `telegramIntent`: `/nov` sa i bez teksta, `/nov@bot`, pitanje, komande.
- `cleanAskPlan`: nova polja `action` (dozvoljene vrste, iznos, items, target), novi proračuni bez meseci, kontekst se ne meša u plan.
- `askPlanPrompt`: sadrži kontekst razgovora i nove proračune; ne sadrži iznose.
- `matchActionTarget`: padeži („Raletu“ → „Rale“, „letovanje“ → „Letovanje“), dijakritike, celo ime pobeđuje, izbor kod nerešenog, ništa.
- `runAskTools` sa `snapshot` za nove proračune.
- `parseTelegramCallback`: `c`, `n`, `h` sa indeksom.

**Smoke (`app/test/smoke-checks.js`)** kroz `__telegramBridge.handle` i lažne AI odgovore (`__fakeAsk`):
- svaka od 9 vrsta naredbi: predlog → potvrda → promena u podacima → „Poništi“ vraća stanje;
- otkazivanje, istek, dupla potvrda;
- izbor između dva kandidata;
- „Već urađeno“ kad je stavka plaćena u aplikaciji pre potvrde;
- grupa: ime potvrđivača u rezultatu;
- pitanje „šta treba da platimo“ → `toPay` i odgovor;
- `/nov kafa 250` upisuje odmah; „kafa 250“ bez `/nov` daje predlog `add`.

**Pre objave:** nezavisan pregled, provera upakovane aplikacije. Pravi Telegram test radi korisnik posle ažuriranja.
