# Veliki godišnji troškovi (v1.33) — dizajn

Datum: 2026-10-05 · Aplikacija: Knjiga budžeta 1.32.0 · Korisnik je odobrio predlog u razgovoru i izabrao varijantu 3: prikaz uvek, a cilj štednje jednim klikom.

## Cilj

Godišnji i tromesečni troškovi ne treba da iznenade: registracija, osiguranje, porez na imovinu, godišnje pretplate. Korisnik unapred vidi kad koji dolazi i koliko mesečno treba da odvaja da novac bude spreman.

Ko želi da novac stvarno stoji sa strane, jednim klikom pravi cilj „Godišnji troškovi“ sa mesečnom uplatom. Kad račun stigne, plaća ga iz tog cilja.

Van ovog posla ostaju:
- novi tipovi učestalosti (npr. polugodišnje);
- ručno raspoređivanje fonda po stavkama;
- uvoz iz Excela.

## Podaci

- **Izvor:** ponavljajući rashodi sa `frequency` = `yearly` ili `quarterly`. Završeni (`until`) se ne računaju.
- **Prečica „Dodaj godišnji trošak“** traži naziv, iznos, mesec i dan (podrazumevano 1.) i kategoriju (podrazumevano prva kategorija rashoda). Pravi običnu godišnju ponavljajuću stavku: `frequency: 'yearly'`, `anchorMonth` je izabrani mesec.
- **Fond:** cilj sa oznakom `g.yearlyFund = true` (najviše jedan). To je običan cilj, sa računom (ako ga korisnik izabere) i sa mesečnim planom `g.monthly`, kao i do sada.
  - Ciljni iznos fonda je zbir godišnjih troškova u narednih 12 meseci.
  - Mesečni plan je iznos „mesečnog odvajanja“ (vidi dole).
  - Kad se trošak plati iz fonda, `g.current` se umanjuje.

## Jezgro (`budzet-core.js`, testirano)

### `yearlyCosts(recurring, today, months = 12)`

```
→ { months: [{ mKey, items: [{ id, desc, amount, date }], total }],   // narednih 12 meseci, počev od tekućeg
    items:  [{ id, desc, amount, frequency, next, monthsLeft, perMonth }],
    steady, catchUp, heavy: [mKey] }
```

- `next` je prvi sledeći datum dospeća; ako je u tekućem mesecu prošao, a stavka nije plaćena, to je i dalje taj datum.
- `monthsLeft` je broj meseci do dospeća, najmanje 1. Na primer, do novembra je 2 kad je danas oktobar.
- `perMonth` = `amount / monthsLeft`: koliko mesečno treba odvojiti da baš ta stavka stigne na vreme.
- `steady` = zbir `monthlyEquivalent`, odnosno `amount/12` za godišnje i `amount/3` za tromesečne. To je dugoročni mesečni iznos.
- `catchUp`: najveći iznos koji je u nekom trenutku potreban da bi sve stiglo na vreme. Računa se uz uzimanje u obzir trenutnog stanja fonda (`fundBalance`, opcioni argument): za svaki mesec m u narednih 12, (zbir troškova do m − fond) / meseci do m. „Mesečno odvajanje“ je `max(steady, catchUp)`, zaokruženo naviše na 100 RSD.
- `heavy`: meseci čiji je zbir veći od 1,5 × prosečnog meseca sa troškovima, i bar 10.000 RSD.

### `yearlyReminders(recurring, today, days = 30, minAmount = 5000)`

Vraća stavke koje dospevaju u narednih 30 dana, sa iznosom od bar 5.000 RSD i bez oznake plaćeno ili preskočeno.

### Prognoza (`cashForecast`)

Novi opcioni argument `fund: { current, monthly, itemIds }`. Pojava godišnjeg ili tromesečnog troška iz `itemIds` se **ne oduzima** od raspoloživog stanja do iznosa koji tada stoji u fondu, jer se plaća iz fonda. Stanje fonda se prati kroz prozor: početno + mesečne uplate − plaćeno. Deo koji fond ne pokriva oduzima se normalno. Mesečne uplate u fond se i dalje oduzimaju, kao i do sada za ciljeve.

## Stranica

### Izveštaji → nova podkartica „Godišnji troškovi“ (posle „Prognoza“)

- **Zaglavlje:**
  - „Mesečno odvajanje: ~{iznos}“, sa objašnjenjem (dugoročno {steady}; da sve stigne na vreme {catchUp});
  - dugme **„Dodaj godišnji trošak“**.
- **Traka za 12 meseci:** jedan red ili kolona po mesecu, sa nazivom meseca, stavkama i zbirom. Teški meseci su naglašeni.
- **Tabela stavki:** naziv, iznos, učestalost, sledeći put, meseci do tada, „odvoji mesečno“. Za stavku koja je dospela ili dospeva u narednih 30 dana, a fond postoji, tu je i dugme **„Plati iz fonda“**.
- **Fond:**
  - bez fonda stoji dugme **„Napravi cilj ‘Godišnji troškovi’“**. Ono traži račun štednje (opciono, kao kod ciljeva), pa pravi cilj sa ciljnim iznosom i mesečnim planom;
  - sa fondom se prikazuje stanje fonda i plan;
  - dugme **„Uskladi plan“** postavlja mesečni plan na trenutno mesečno odvajanje.
- **„Plati iz fonda“:**
  - ponavljajuća stavka se označava kao plaćena za taj mesec (rashod se upisuje kao i do sada), a ako fond ima račun, rashod ide sa tog računa;
  - `g.current` se umanjuje za iznos (najviše do nule; razlika ide sa podrazumevanog računa);
  - može da se poništi.

### Pregled

U kartici „Do plate“, ili kao zasebna mala kartica ispod nje, piše: „Uskoro: {naziv} {iznos} ({datum})“, za stavke iz `yearlyReminders`, najviše 3.

### JSON kopija i Excel

`yearlyFund` se čuva na cilju u JSON kopiji. U Excelu ciljevi dobijaju kolonu `GodisnjiFond` (da/ne).

## Testiranje

- **node:test:**
  - `yearlyCosts` sa godišnjom stavkom u prošlosti i budućnosti, tromesečnom i završenom stavkom;
  - `monthsLeft`, `perMonth`, `steady`, `catchUp` (sa fondom i bez njega);
  - teški meseci;
  - `yearlyReminders` (prag iznosa, plaćeno ili preskočeno);
  - `cashForecast` sa fondom: pokriveno, delimično pokriveno i fond koji raste uplatama.
- **Smoke:**
  - podkartica sa trakom i tabelom;
  - prečica „Dodaj godišnji trošak“ pravi godišnju ponavljajuću stavku;
  - „Napravi cilj“ pravi fond sa planom;
  - „Plati iz fonda“ označava plaćeno i smanjuje fond, a poništavanje vraća stanje;
  - podsetnik na Pregledu;
  - JSON kopija i Excel čuvaju `yearlyFund`.
