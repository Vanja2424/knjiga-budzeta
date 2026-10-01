# Pitaj svoj budžet (v1.26) — dizajn

Datum: 2026-10-01 · Aplikacija: Knjiga budžeta 1.25.0 · Dizajn je korisnik odobrio u razgovoru (varijanta 3: lokalni proračuni, AI samo planira i piše).

## Cilj

Korisnik postavi pitanje običnim rečima, npr. „zašto je septembar skuplji od avgusta?“ ili „koliko trošim na hranu leti u odnosu na zimu?“, i dobije odgovor na srpskom. Brojeve u odgovoru računa aplikacija, a AI samo bira koji proračuni su potrebni i opisuje rezultat. Groq-u se šalje najmanje moguće podataka.

Ovaj posao ne obuhvata:
- čuvanje istorije razgovora (odgovori važe samo dok je ekran otvoren);
- predviđanje budućnosti (to je posebna stavka: prognoza do plate);
- izmenu podataka iz razgovora.

## Tok

1. **Plan**, prvi poziv Groq-u (`bills:read`, bez slika i teksta). Uputstvo sastavlja `C.askPlanPrompt({ question, today, months, categories })`. Šalje se:
   - pitanje;
   - današnji datum;
   - prvi i poslednji mesec sa podacima;
   - nazivi kategorija rashoda i prihoda;
   - opis dostupnih proračuna.

   Nijedan iznos ne ide u ovom koraku. Model vraća `{"calls":[{"tool":"…","months":["YYYY-MM",…],"monthsB":[…],"category":"",…}],"offTopic":false}`. Plan čisti `C.cleanAskPlan(raw, ctx)`:
   - prolaze samo poznati alati;
   - meseci moraju biti u obliku `YYYY-MM` i unutar raspona sa podacima;
   - prolaze samo poznate kategorije;
   - najviše 4 poziva po pitanju, a najviše 24 meseca po pozivu;
   - `top.n` ide do 10.
2. **Lokalni proračuni.** `C.runAskTools(calls, { entries, recurring })` vraća `[{ tool, args, result }]`. Za podatke se koristi postojeća logika: `monthTotals`, `isPaidExp` i raspodela po mesecima (`shareInMonth`).
3. **Odgovor**, drugi poziv. Uputstvo sastavlja `C.askAnswerPrompt({ question, results })`, a šalju se pitanje i JSON rezultata. Model vraća običan tekst, najviše oko 8 rečenica, sa iznosima u RSD formatiranim kao u aplikaciji. U uputstvu stoji da ne izmišlja brojeve koji nisu u rezultatima.

## Alati

| tool | argumenti | rezultat |
|---|---|---|
| `monthSummary` | `months` | `[{ month, income, expense, net }]` |
| `byCategory` | `months`, `type` ('expense' po podrazumevanju) | `[{ category, total, perMonth: {mKey: iznos} }]` (opadajuće) |
| `compare` | `months`, `monthsB` | `[{ category, a, b, diff, pct }]` (po apsolutnoj razlici, do 15) |
| `top` | `months`, `category?`, `n ≤ 10` | `[{ desc, amount, category, month }]` (bez dana i računa) |
| `average` | `months`, `category?` | `[{ category, avgPerMonth }]` |
| `recurring` | — | `{ monthly, yearly, items: [{ desc, amount, frequency, category }] }` (samo rashodi) |

## Ekran

- Nova podkartica je **Izveštaji → „Pitaj“** (id `pitaj`).
- Ekran ima:
  - polje za pitanje sa dugmetom „Pitaj“ (Enter šalje);
  - 4 predložena pitanja kao dugmad;
  - spisak odgovora, najnoviji na vrhu. Uz svaki odgovor stoje pitanje, tekst odgovora, uvlačni deo „Šta je poslato AI-ju“ (oba zahteva tačno kako su poslati, bez ključa) i, ako je bilo grešaka, napomena.
- **Bez ključa** stoji poruka sa uputstvom gde se ključ upisuje. U browser verziji ekran prikazuje da je ova funkcija dostupna samo u desktop aplikaciji.
- **Pitanje van budžeta** (`offTopic`) dobija odgovor bez drugog poziva: „Mogu da odgovorim samo na pitanja o tvom budžetu.“
- **Tok rada:** dok traje upit, dugme je isključeno i prikazuje se „Razmišljam…“. Drugi upit ne može da krene dok prvi ne završi.

## Privatnost

- Prvi poziv ne sadrži nijedan iznos ni opis stavke.
- Drugi poziv sadrži samo rezultate izabranih proračuna. Opisi stavki idu samo uz alat `top` ili uz spisak ponavljajućih stavki (`recurring`).
- Tekst o privatnosti u Podešavanjima dobija rečenicu o „Pitaj“.

## Delovi koda

- **budzet-core.js** (sa testovima): `ASK_TOOLS`, `askPlanPrompt`, `cleanAskPlan`, `runAskTools`, `askAnswerPrompt`.
- **budzet-tracker.html:** ekran `pitaj`, poziv kroz `desktop.bills.read` (hook `__fakeAsk(req, step)`), prikaz i i18n.

## Testiranje

- **node:test** pokriva:
  - svaki alat nad malim skupom stavki, uključujući rashod raspodeljen na više meseci i neplaćeni rashod koji se ne broji;
  - `cleanAskPlan` za nepoznat alat, pogrešan mesec, mesec van raspona, više od 4 poziva i `n` preko 10;
  - to da `askPlanPrompt` ne sadrži nijedan iznos.
- **Smoke** pokriva:
  - pitanje → dva lažna odgovora → prikaz odgovora i „Šta je poslato“, u kome je prvi zahtev bez cifara iznosa;
  - `offTopic`;
  - grešku iz prvog koraka;
  - blokadu dvostrukog slanja.
- **Pravi Groq poziv** sa izmišljenim stavkama, uz EN proveru.
