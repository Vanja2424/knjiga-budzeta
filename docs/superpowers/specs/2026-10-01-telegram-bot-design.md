# Telegram bot za unos rashoda i računa (v1.28) — dizajn

Datum: 2026-10-01 · Aplikacija: Knjiga budžeta 1.27.1 · Korisnik je odobrio dizajn u razgovoru:
- radi bez servera (varijanta 1);
- slike se potvrđuju u Telegramu (varijanta 2).

## Cilj

Korisnik šalje svom Telegram botu dve vrste poruka, a aplikacija na računaru ih upisuje:
- **tekst**, npr. „kafa 250“, koji postaje rashod ili prihod odmah;
- **slike ili PDF-ove** računa i uplatnica. Bot ih pročita i pita za potvrdu, a upisuje ih tek posle „✓ Sačuvaj“.

Ne radimo:
- server ili relay u oblaku;
- komande `/stanje` i `/lista` (one dolaze kasnije);
- više korisnika;
- glasovne poruke;
- plaćanje iz Telegrama.

## Ograničenja i pretpostavke

- **Glavni proces dobija poruke dugim pozivom** (Telegram Bot API, `getUpdates` sa `timeout=50`), i to samo dok aplikacija radi. Prozor može biti i sakriven u traci.
- **Poruke čekaju 24 sata.** Telegram čuva nepreuzete poruke toliko. Starije se gube; to piše u Podešavanjima.
- **Telegram vidi šta se šalje.** Poruke sa botom nisu šifrovane s kraja na kraj. To piše u Podešavanjima, uz postojeću napomenu o Groq-u.
- **Bot radi samo dok aplikacija radi.** Kad je „zatvaranje šalje u traku“ isključeno, Podešavanja napominju da bot ne radi posle zatvaranja prozora.

## Delovi

### `app/telegram.js` (glavni proces, testiran u `app/test/telegram.test.js`)

Fabrika je `createTelegram({ fetch, getSettings, saveSettings, safeStorage, handle, now, log })`, u istom stilu kao `bills.js`.

- **Token:**
  - čuva se kao `telegramTokenEnc` (safeStorage), pored `telegramTokenLast4`;
  - u Podešavanjima se prikazuje samo „…abcd“;
  - token se nikad ne loguje, a greške iz `fetch` se čiste od URL-a u kome je token.
- **Veza:**
  - `telegramChatId` je povezani chat, `telegramBotName` je ime bota, a `telegramOn` je uključeno ili isključeno;
  - `telegramOffset` je poslednji potvrđeni `update_id + 1`.
- **Petlja:**
  1. `getUpdates(offset, timeout 50)`.
  2. Svaki update se obrađuje redom: poziva se `handle(update)`, pa šalju odgovori, pa offset ide na `update_id + 1` i čuva se.
  3. Ako `handle` baci grešku, offset se ne pomera i petlja čeka 30 s. Ako se računar ugasi usred obrade, isti update dolazi ponovo, a `processedIds` u stranici sprečava dupli upis.
- **Greške mreže i 429:**
  - čeka se `retry_after` ili 5 → 10 → 30 → 60 s;
  - 401 znači da token ne važi: status postaje `badToken`, a petlja staje.
- **Povezivanje:**
  - `startPairing()` pravi kod od 4 cifre koji važi 10 minuta;
  - poruka sa tim kodom iz bilo kog chata, dok je kod važeći, postavlja `telegramChatId` i bot odgovara „✓ Povezano“;
  - svaki drugi chat se ignoriše, bez odgovora.
- **Slanje:**
  - `sendMessage(text, { buttons })`, gde su dugmad inline tastatura sa `callback_data` dužine najviše 64 bajta;
  - `editMessage` uklanja dugmad posle izbora;
  - `answerCallback`.
- **Preuzimanje:**
  - `downloadFile(file_id)` → `{ bytes, name, mime }`;
  - prihvata se samo pdf/jpg/png/webp, najviše 20 MB;
  - za fotografije se uzima najveća veličina iz niza `photo`.
- **IPC:**
  - `telegram:status`, `telegram:setToken`, `telegram:clear`, `telegram:pair`, `telegram:setOn`;
  - događaj `telegram:status-changed` ide ka stranici.

### `handle(update)` → stranica

Glavni proces poziva `runInMain('window.__telegramBridge.handle(<json>)')`. Stranica vraća `{ replies: [{ text, buttons?, editMessageId? }] }`. Slika ide stranici kao `{ bytes(base64), name, mime }`, tek pošto je glavni proces preuzme.

### Jezgro (`budzet-core.js`, testirano)

- **`telegramIntent(text, caption)`** → `{ kind: 'command'|'entry'|'empty', command? }`. Komande su `/start`, `/pomoc`, `/help` i `/ponisti`.
- **`photoKindFromCaption(caption)`** → `'receipt'|'bill'|'slip'|null`:
  - `bill` po ključnim rečima: struja, eps, infostan, voda, grejanje, gas, internet, telefon, račun za;
  - `slip` po rečima: uplatnica, nalog;
  - `receipt` po rečima: maxi, lidl, idea, aman, dis, univerexport, tempo, prodavnica, market, ili kad je opis samo ime prodavnice;
  - inače `null`.
- **`telegramEntryReply(entry, lang)`** → npr. „✓ Kafa · 250 RSD · Hrana · danas“.
- **`telegramReceiptSummary(state)`** → npr. „Maxi · 1.10. · 2.340 RSD — Hrana 1.890, Higijena 450 · 14 stavki“, uz eventualno upozorenje o duplikatu.
- **Isto i za kućni račun i uplatnicu:** `telegramBillSummary` i `telegramSlipSummary`.
- **`cleanTelegramPending(list, today)`:** briše stavke na čekanju starije od 7 dana.

### Stranica (`budzet-tracker.html`)

**`__telegramBridge.handle(u)`:**
1. Ako je `u.update_id` u `processedIds` (ključ `budzet-telegram-obradjeno-v1`, poslednjih 500), stranica vraća `{ replies: [] }`.
2. **Tekst:** isti put kao brzi unos. Ide `C.parseQuickSentence`, pa AI kategorija (`quickCategoryPrompt`) sa čekanjem do 3 s, pa `__desktopBridge.addEntry`.
   - Odgovor je `telegramEntryReply`, sa dugmetom **Poništi** (`u:<entryId>`).
   - Bez iznosa: „Nisam našao iznos — pošalji npr. *kafa 250*.“
3. **Slika ili PDF:**
   - fajl ide kroz `prepareBillFile`;
   - vrsta dolazi iz `photoKindFromCaption`. Ako je nema, stranica pita sa dugmadima `k:<pendingId>:receipt|bill|slip`;
   - pa se čita postojećim čitačima, kao `readReceiptPart`, čitanje računa ili `readSlip`, ali bez otvaranja prozora.
   - Posle čitanja se pravi stavka na čekanju (`budzet-telegram-cekanje-v1`: `{ id, kind, created, state, fileName }`). Slika se odmah čuva u Prilozi, kao `.obrisano` dok se ne potvrdi.
   - Stranica šalje sažetak sa dugmadima `s:<id>` (Sačuvaj), `x:<id>` (Odbaci) i `o:<id>` (Otvori u aplikaciji).
4. **Dugmad:**
   - **`s`** čuva postojećim putem: `saveReceipt` za račun iz prodavnice, čuvanje kućnog računa, a za uplatnicu jednokratni rashod koji nije plaćen i ima `payee`. Prilog se vraća iz `.obrisano`, a dugmad se uklanjaju i ostaje „✓ Sačuvano“.
   - **`x`** briše stavku na čekanju, a prilog ostaje u `.obrisano`.
   - **`o`** otvara prozor za pregled, napunjen pročitanim podacima, i prikazuje glavni prozor. Bot javlja „Otvoreno u aplikaciji“.
   - **`u`** poništava unos, isto kao opoziv.
5. **Komande:**
   - `/pomoc` daje kratko uputstvo;
   - `/ponisti` poništava poslednji unos iz Telegrama u poslednjih 24 h.
6. **Greške:**
   - za Groq 413/429 bot javlja „AI je zauzet — pokušavam ponovo za minut.“ Stavka ostaje na čekanju sa `retryAt`, i petlja je ponovo pokuša kad stigne vreme;
   - ako AI ključa nema, bot javlja „AI čitanje nije podešeno…“ i nudi samo **Otvori u aplikaciji**.

**Kod refaktora:** čuvanje računa iz prodavnice, kućnog računa i uplatnice izdvaja se iz funkcija koje rade sa prozorima u funkcije koje primaju gotovo stanje. Prozori i bot zatim zovu isti kod, a postojeći smoke testovi moraju i dalje da prolaze.

### Podešavanja → „Telegram bot“

- Kratko uputstvo u tri koraka:
  1. U Telegramu otvori @BotFather.
  2. Pošalji /newbot.
  3. Nalepi token ovde.
- Polje za token, sa dugmadima „Sačuvaj“ i „Obriši“.
- **Poveži**, koje prikazuje kod i odbrojavanje.
- Status: nije podešeno / čeka povezivanje / povezan sa @ime / token ne važi / nema interneta.
- Prekidač „Bot uključen“.
- Napomene o 24 h, privatnosti i radu u traci.

## Testiranje

- **telegram.test.js** (lažni `fetch`) proverava:
  - da offset ide napred samo posle uspešnog `handle`;
  - da greška u `handle` ne pomera offset;
  - povezivanje kodom, kod koji je istekao i ignorisan tuđi chat;
  - 429 i `retry_after`, i da 401 vodi u `badToken`;
  - da URL sa tokenom ne izlazi u porukama o grešci;
  - izbor najveće fotografije, odbijen tip ili veličinu, i oblik `callback_data`.
- **core.test.js** proverava:
  - `telegramIntent` i `photoKindFromCaption`;
  - sažetke na srpskom i engleskom;
  - `cleanTelegramPending`.
- **Smoke** (`__telegramBridge.handle` sa lažnim update-ima i lažnim čitanjem):
  - tekst postaje rashod i odgovor, a dupli `update_id` se ne upisuje dvaput;
  - **Poništi** radi;
  - slika bez opisa dobija pitanje o vrsti, pa sažetak, pa **Sačuvaj** pravi rashode i prilog;
  - **Odbaci** ne pravi ništa, a stavka na čekanju ostaje posle ponovnog učitavanja stranice;
  - **Otvori** otvara prozor za pregled;
  - postojeće provere za račune i kućne račune i dalje prolaze.
- **Živi test:** samo uz test token koji korisnik stavi u promenljivu okruženja `KNJIGA_TELEGRAM_TEST_TOKEN`, i samo sa izmišljenim podacima.
