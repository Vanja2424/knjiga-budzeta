# Paket 4 — Mesečni pregled i „šta ako“ → uplata u cilj (v1.15) — dizajn

Datum: 2026-09-29 · Aplikacija: Knjiga budžeta 1.14.0 · Korisnik je rekao „samo vozi“, pa su odluke donete bez posebnog odobrenja.

## Cilj

1. Na početku meseca na Pregledu se pojavljuje kartica sa kratkim pregledom prethodnog meseca: šta se desilo, šta je iskočilo i šta treba uraditi.
2. U Analizi se „šta ako“ ušteda jednim klikom pretvara u mesečnu uplatu u cilj.
3. Cilj dobija **mesečnu uplatu**: stalni iznos koji se sam uplaćuje na izabrani dan u mesecu.

**Van obima:** planovi uplate za prihode, više planova po jednom cilju i uplate koje se ne dešavaju jednom mesečno.

## 1. Mesečna uplata u cilj

- Plan se čuva na cilju: `g.monthly = { amount, day, since, last }`.
  - `since` je prvi mesec u kom se uplaćuje (`YYYY-MM`).
  - `last` je poslednji uplaćeni mesec, ili ga nema.
- Uplata se radi preko `contributeToGoal(g, amount, from, date)`. Ako je cilj vezan za račun, nastaje prenos sa datumom dospeća, `goalId` i oznakom `autoGoal: true`.
- **Obrada** (`processGoalPlans`, uz `processAutoPay`, i na startu i na svakih 15 minuta):
  - Uplata se pravi za svaki mesec od `max(since, last+1)` do tekućeg, a najviše 24 meseca unazad.
  - Tekući mesec se uplaćuje tek kad je dan prošao (`effectiveDay`), kao kod automatskog upisa.
  - Poslednja uplata ne prelazi ostatak do cilja. Kad je cilj ostvaren, ništa se ne uplaćuje, a plan ostaje dok ga korisnik ne ukloni.
  - Čista funkcija: `C.goalPlanDue(goal, currentMonth, todayDay)` vraća `[{ mKey, amount, day }]`.
- Posle obrade se prikazuje poruka „Automatski uplaćeno u ciljeve: N (X RSD)“ sa dugmetom „Poništi“. Poništavanje vraća `current`, briše napravljene prenose i vraća `last`.
- **Kartica cilja** prikazuje „Mesečna uplata: X · sledeća DD.MM.“ i dugme „Ukloni“ (sa „Poništi“).
- **Uređivanje cilja** ima polja „Mesečna uplata (RSD, 0 = bez)“ i „Dan u mesecu“:
  - Nov plan kreće od sledećeg meseca ako je dan u ovom mesecu već prošao, a od tekućeg ako nije.
  - Za postojeći plan se menjaju samo iznos i dan.
- Plan se čuva u JSON kopiji (sa proverom tipova) i u Excelu (kolone „MesecnaUplata“, „DanUplate“, „UplataOd“, „PoslednjaUplata“).

## 2. „Šta ako“ → mesečna uplata (Analiza)

- Ispod rezultata klizača je dugme „Uplaćuj {X} mesečno u cilj…“.
  - X je ušteda zaokružena na 100 (najmanje 100): `C.planAmount`.
  - Dugme se ne prikazuje kad je ušteda 0 ili nema podataka.
- Ako nema aktivnog cilja (neostvaren), umesto dugmeta stoji tekst „Napravi cilj da bi ušteda išla u njega“ i dugme koje vodi na Ciljeve.
- Klik otvara modal sa poljima:
  - cilj (podrazumevano cilj iz `whatIf.goal`, inače prvi aktivan)
  - iznos
  - dan (podrazumevano 1)
  - Napomena na vrhu: „ako cilj već ima plan, biće zamenjen“.
- Plan uvek kreće od **sledećeg meseca**, jer je ušteda tek odluka i ovaj mesec je već u toku.
- Posle čuvanja se prikazuje poruka „Mesečna uplata X u cilj „Y“ od {mesec}“ sa dugmetom „Poništi“.

## 3. Kartica „Mesec iza tebe“ (Pregled)

- Prikazuje se na vrhu Pregleda **od 1. do 10. dana u mesecu**, za prethodni mesec, ako taj mesec ima bar jedan prihod ili plaćen rashod i korisnik je nije zatvorio. Ključ `budzet-mesecni-pregled-zatvoren-v1` čuva mesec zatvorene kartice.
- Sadržaj dolazi iz čiste funkcije `C.monthReview(entries, state, mKey, n)`:
  - prihodi, rashodi, razlika i stopa štednje (razlika/prihodi, ako ima prihoda)
  - rashodi naspram proseka 6 meseci pre tog meseca (samo ako ima bar 2 meseca podataka)
  - do 3 kategorije iznad proseka (`aboveAverage`) i najveći pad (bar 1.000 RSD manje od proseka)
  - kategorije preko limita: `limits[cat] > 0 && potrošeno > limit`. Prenos nije uključen, jer je pregled jednostavan.
  - neplaćeno iz tog meseca: rashodi sa `paid === false` datirani u tom mesecu, plus ponavljajući rashodi koji su dospeli, a nisu plaćeni, preskočeni ni upisani. Broje se samo stavke koje su u nekom ranijem mesecu bile plaćene ili preskočene, jer je stavka bez toga verovatno dodata posle tog meseca. Nazivi (do 3) se prikazuju u redu.
- Dugmad:
  - „Detaljno u Analizi“ otvara Analizu za taj mesec.
  - „Prebaci višak u cilj“ se prikazuje ako je razlika > 0 i postoji aktivan cilj. Otvara modal sa ciljem i iznosom (podrazumevano razlika) i uplaćuje; kartica se posle toga zatvara.
  - „Pogledaj neplaćeno“ vodi na Rashode za taj mesec. Prikazuje se samo kad ima neplaćenih rashoda; ponavljajuće stavke su samo navedene.
  - „Zatvori“ (✕).
- Pravilo „kada se prikazuje“ je čista funkcija `C.monthReviewMonth(todayISO, dismissed)`: vraća prethodni mesec ili `null`.

## 4. Testiranje

- **`npm test`:**
  - `goalPlanDue`: počinje od `since`, nastavlja od `last+1`, tekući mesec tek posle dana, poslednja uplata ograničena ostatkom, ostvaren cilj daje ništa, najviše 24 meseca, dan 31 u februaru
  - `planAmount`
  - `monthReview`: zbirovi, stopa, iznad proseka, pad, limiti, neplaćeno (i preskočeno se ne broji)
  - `monthReviewMonth`: dan 10 da, dan 11 ne, zatvoren ne, januar vraća decembar prethodne godine
- **Smoke:**
  - kartica se prikazuje, Zatvori je sakriva
  - „šta ako“ dugme pravi plan sa `since` = sledeći mesec
  - plan sa prošlim `since` uplaćuje pri obradi, a Poništi vraća
  - uređivanje cilja uklanja plan
