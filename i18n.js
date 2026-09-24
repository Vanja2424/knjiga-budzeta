// Knjiga budzeta — prevodi (srpski je izvorni jezik, engleski se bira u Podesavanjima).
// Staticki tekst u HTML-u i u sablonima prevodi se automatski (tacno poklapanje, posmatrac DOM-a).
// Poruke sa vrednostima idu kroz I18N.t('... {0} ...', vrednost).
// Korisnicki podaci (kategorije, opisi, racuni, oznake) se ne prevode.
(function(root){
  const EN = {
    // ---- Opste ----
    'Knjiga budžeta': 'Budget Book', 'Nova verzija': 'New version', 'Ažuriraj sada': 'Update now', 'Kasnije': 'Later',
    'Pregled': 'Overview', 'Transakcije': 'Transactions', 'Budžet': 'Budget', 'Ponavljajuće': 'Recurring', 'Ciljevi i dugovi': 'Goals & debts',
    'Izveštaji': 'Reports', 'Podešavanja': 'Settings', 'Novi rashod': 'New expense', 'Novi prihod': 'New income', 'Tekući mesec': 'This month',
    'Prihodi': 'Income', 'Rashodi': 'Expenses', 'Za plaćanje': 'To pay', 'Saldo meseca': 'Monthly balance', 'Stanje na računima': 'Account balances',
    'Prihod': 'Income', 'Rashod': 'Expense', 'Dospeva': 'Due', 'Datum': 'Date', 'Opis': 'Description', 'Iznos': 'Amount', 'Kategorija': 'Category',
    'Račun': 'Account', 'Uredi': 'Edit', 'Otkaži': 'Cancel', 'Sačuvaj': 'Save', 'Potvrda': 'Confirm', 'U redu': 'OK', 'Obaveštenje': 'Notice',
    'Dodaj': 'Add', 'Obriši': 'Delete', 'Zatvori': 'Close', 'Dalje': 'Next', 'Nazad': 'Back', 'Gotovo': 'Done', 'Izaberi': 'Select', 'Izaberi sve': 'Select all',
    'Ukupno': 'Total', 'UKUPNO': 'TOTAL', 'Vrati': 'Restore', 'Učitaj': 'Load', 'Dan': 'Day', 'Mesec': 'Month', 'Meseci': 'Months', 'Godina': 'Year',
    'Tip': 'Type', 'Oznake': 'Tags', 'Plaćeno': 'Paid', 'na čekanju': 'pending', '(na čekanju)': '(pending)', 'NA ČEKANJU': 'PENDING',
    'Predlog': 'Suggestion', 'Trošak': 'Expense', 'Cilj': 'Goal', 'Isključeno': 'Off', 'isključeno': 'off', 'plaćeno': 'paid', 'naplaćeno': 'received',
    'plaćeno ✓': 'paid ✓', 'dan': 'day', 'dana': 'days', 'mesec': 'month', 'meseci': 'months', 'više': 'more', 'manje': 'less',
    'godišnje': 'yearly', 'kvartalno': 'quarterly', 'Mesečno': 'Monthly', 'Kvartalno': 'Quarterly', 'Godišnje': 'Yearly', 'MESEČNO': 'MONTHLY', 'GODIŠNJE': 'YEARLY',
    'Kvartalno (svaka 3 meseca)': 'Quarterly (every 3 months)', 'Status čuvanja — klikni za detalje': 'Save status — click for details',
    'Meni': 'Menu', 'Glavni meni': 'Main menu', 'Podmeni': 'Submenu', 'Svetla / tamna tema': 'Light / dark theme', 'Promeni temu': 'Change theme',
    'Novi unos (Ctrl+N)': 'New entry (Ctrl+N)', 'Novi rashod (Ctrl+N)': 'New expense (Ctrl+N)', 'Novi prihod (Ctrl+Shift+N)': 'New income (Ctrl+Shift+N)',
    'Prethodni mesec (Alt+←)': 'Previous month (Alt+←)', 'Prethodni mesec': 'Previous month', 'Sledeći mesec (Alt+→)': 'Next month (Alt+→)', 'Sledeći mesec': 'Next month',
    'Nema podataka.': 'No data.', 'Nema podataka': 'No data', 'Nema podataka za prikaz.': 'Nothing to show.', 'Nema rezultata.': 'No results.',
    'Nema dovoljno podataka.': 'Not enough data.', 'Obriši izabrano': 'Delete selected', 'Mesec A': 'Month A', 'Mesec B': 'Month B', 'Razlika': 'Difference',
    'Sve stavke': 'All items', 'Ponavljajuće stavke': 'Recurring items', 'Ciljevi': 'Goals', 'Scenario': 'Scenario', 'Trend': 'Trend', 'Uporedi': 'Compare',
    'Pretraga': 'Search', 'Izveštaj': 'Report', 'Dugovi': 'Debts', 'Kategorije': 'Categories',

    // ---- Podmeni ----
    'Računi i prenosi': 'Accounts & transfers', 'Budžet i kategorije': 'Budget & categories', 'Ciljevi štednje': 'Savings goals',
    'Dugovi i pozajmice': 'Debts & loans', 'Izveštaj za štampu': 'Printable report', 'Scenario „šta ako“': '“What if” scenario',

    // ---- Pregled ----
    'Finansijsko zdravlje': 'Financial health', 'Finansijsko zdravlje: ': 'Financial health: ', 'Kretanje salda': 'Balance over time',
    'Poslednje stavke': 'Recent items', 'Rashodi po kategorijama': 'Expenses by category', 'Rashodi po oznakama': 'Expenses by tag',
    'Analiza': 'Insights', 'Upozorenja': 'Warnings', 'Obrasci i anomalije': 'Patterns & anomalies', 'Kalendar': 'Calendar',
    'Jača boja = veća potrošnja. Klikni na dan za detalje i brzi unos.': 'Stronger color = more spending. Click a day for details and quick entry.',
    '6 meseci': '6 months', '12 meseci': '12 months', 'Nema stavki u ovom mesecu.': 'No items this month.',
    'Nema plaćenih rashoda u ovom mesecu.': 'No paid expenses this month.', 'Prebaci višak u cilj': 'Move surplus to a goal',
    'Ukupno (svi rashodi)': 'Total (all expenses)', 'Budžet': 'Budget', 'nema stavki': 'no items', 'Nema stavki ovog dana.': 'No items on this day.',
    'Opis (ili Opis 1500)': 'Description (or Description 1500)', 'Odlično': 'Excellent', 'Dobro': 'Good', 'Prosečno': 'Average', 'Slabo': 'Weak',
    'Ušteda': 'Savings', 'Disciplina budžeta': 'Budget discipline', 'Urednost dugova': 'Debts on time', 'Progres ciljeva': 'Goal progress', 'Redovne uplate': 'Bills on time',
    'Pokušaj da odvojiš makar mali procenat prihoda pre nego što potrošiš ostatak — i 5-10% redovno pravi veliku razliku kroz vreme.': 'Try to set aside even a small share of income before spending the rest — 5–10% regularly makes a big difference over time.',
    'Nekoliko kategorija je premašilo limit/budžet ovog meseca — pogledaj "Rashodi po kategorijama" da vidiš gde najviše curi.': 'Some categories went over budget this month — check "Expenses by category" to see where most of it goes.',
    'Imaš dug/pozajmicu sa prošlim rokom — dogovori novi rok ili isplati deo da ne kasni dalje.': 'You have an overdue debt — agree on a new due date or pay part of it.',
    'Ciljevi štednje sporo napreduju — probaj redovnu manju uplatu (npr. mesečno) umesto povremenih velikih.': 'Savings goals are progressing slowly — try a smaller regular contribution (e.g. monthly) instead of occasional big ones.',
    'Neke ponavljajuće stavke kasne sa plaćanjem — obeleži ih kao plaćene ili pauziraj mesec ako se ne odnose na tebe sada.': 'Some recurring items are overdue — mark them as paid or pause the month if they don’t apply now.',
    'Sve komponente su solidne ovog meseca — nema konkretne preporuke, samo nastavi tako.': 'Everything looks solid this month — no specific tip, just keep it up.',
    'Stopa uštede — od prihoda ovog meseca, toliko je ostalo posle rashoda.': 'Savings rate — the share of this month’s income left after expenses.',
    'Prosečna dnevna potrošnja u ovom mesecu.': 'Average daily spending this month.', 'Procena ukupne potrošnje do kraja meseca, po dosadašnjem tempu.': 'Projected total spending by month end at the current pace.',
    'Nedelja': 'Sunday', 'Ponedeljak': 'Monday', 'Utorak': 'Tuesday', 'Sreda': 'Wednesday', 'Četvrtak': 'Thursday', 'Petak': 'Friday', 'Subota': 'Saturday',
    'Budžet izgleda <b>uravnoteženo</b> — nema upozorenja u ovom trenutku.': 'Your budget looks <b>balanced</b> — no warnings right now.',

    // ---- Transakcije ----
    'Dodaj prihod': 'Add income', 'Dodaj rashod': 'Add expense', 'Još nema unesenih prihoda.': 'No income entered yet.', 'Nema rashoda za prikaz.': 'No expenses to show.',
    'Svi prihodi': 'All income', 'Svi rashodi': 'All expenses', 'Svi meseci': 'All months', 'Sve kategorije': 'All categories',
    'Plaćeno i na čekanju': 'Paid and pending', 'Samo na čekanju': 'Pending only', 'Samo plaćeno': 'Paid only', 'Obeleži sve vidljivo kao plaćeno': 'Mark all visible as paid',
    'Podeli na više kategorija': 'Split into several categories', '+ Dodaj kategoriju': '+ Add category', 'Već plaćeno': 'Already paid',
    'Uplata pokriva više meseci (npr. plata za tri meseca odjednom)': 'Payment covers several months (e.g. three months of pay at once)',
    'Trošak pokriva više meseci (npr. godišnje osiguranje)': 'Expense covers several months (e.g. yearly insurance)', 'Broj meseci': 'Number of months', 'Od meseca': 'From month',
    'Oznake (odvojene zarezom, opciono)': 'Tags (comma separated, optional)', 'Oznake (odvojene zarezom)': 'Tags (comma separated)',
    'Kvačica u prvoj koloni znači da je rashod plaćen. Odčekiraj je za planirane rashode koje tek treba da platiš (npr. za sledeći mesec) — dok je nečekirana, ne ulazi u ukupne brojke, samo u "na čekanju".': 'A check in the first column means the expense is paid. Uncheck it for planned expenses you still have to pay (e.g. next month) — while unchecked it only counts as "pending".',
    'Uredi prihod': 'Edit income', 'Uredi rashod': 'Edit expense', 'Dupliraj': 'Duplicate', 'Pokriva meseci (1 = samo mesec uplate)': 'Covers months (1 = payment month only)',
    'Od meseca (za više meseci)': 'From month (for several months)', 'Ubuduće ovaj opis uvek stavljaj u izabranu kategoriju (pravilo za uvoz i brzi unos)': 'Always put this description in the chosen category (rule for import and quick entry)',
    'Iznos se raspoređuje na više meseci': 'The amount is spread over several months', 'Iznos (RSD)': 'Amount (RSD)',
    'Novi račun': 'New account', 'Naziv': 'Name', 'Vrsta': 'Type', 'Tekući račun': 'Current account', 'Gotovina': 'Cash', 'Štednja': 'Savings', 'Kreditna kartica': 'Credit card',
    'Početno stanje (RSD)': 'Opening balance (RSD)', 'Dodaj račun': 'Add account', 'Računi': 'Accounts', 'podrazumevani': 'default',
    'Početno stanje = koliko je na računu bilo pre prve stavke u aplikaciji. Kasnije ga možeš ispraviti tako da se stanje poklopi sa bankom.': 'Opening balance = what the account held before the first item in the app. You can correct it later so the balance matches your bank.',
    'Još nema računa. Dodaj bar jedan (npr. „Tekući račun“) da vidiš stanje; sa dva ili više računa možeš da biraš račun za svaku stavku i da praviš prenose (npr. na štednju).': 'No accounts yet. Add at least one (e.g. “Current account”) to see its balance; with two or more you can pick an account per item and make transfers (e.g. to savings).',
    'npr. Tekući račun, Gotovina, Štednja': 'e.g. Current account, Cash, Savings', 'Prenos između računa': 'Transfer between accounts', 'Sa računa': 'From account', 'Na račun': 'To account',
    'Opis (opciono)': 'Description (optional)', 'npr. Podizanje gotovine': 'e.g. Cash withdrawal', 'Prenesi': 'Transfer', 'Poslednji prenosi': 'Recent transfers',
    'Prenos nije ni prihod ni rashod — samo menja stanje dva računa.': 'A transfer is neither income nor expense — it only moves money between two accounts.',
    'Još nema prenosa.': 'No transfers yet.', 'Izaberi dva različita računa.': 'Choose two different accounts.', 'Račun sa tim imenom već postoji.': 'An account with that name already exists.',
    'Račun se koristi u stavkama': 'The account is used by items', 'Obriši račun': 'Delete account', 'Uredi račun': 'Edit account', 'Postavi kao podrazumevani': 'Set as default',
    '— bez računa —': '— no account —', 'Obrisan prenos': 'Transfer deleted',
    'Pretraga stavki': 'Search items', 'Pretraži po opisu ili kategoriji...': 'Search by description or category...', 'Od datuma': 'From date', 'Do datuma': 'To date',
    'Min iznos (RSD)': 'Min amount (RSD)', 'Max iznos (RSD)': 'Max amount (RSD)',

    // ---- Budzet ----
    'Budžet po kategorijama': 'Budget by category', 'Ukupan mesečni budžet (svi rashodi):': 'Total monthly budget (all expenses):', 'bez limita': 'no limit',
    'Prenosi ostatak u sledeći mesec (neiskorišćen budžet se dodaje, prekoračenje oduzima)': 'Carry over to next month (unused budget is added, overspending is subtracted)',
    'Upiši mesečni budžet (RSD) za kategorije koje želiš da pratiš — na Pregledu vidiš koliko je potrošeno i koliko je preostalo. 💡 predlaže iznos na osnovu proseka poslednja 3 meseca. Prazno = bez budžeta. Kategorija se ne može obrisati dok se koristi.': 'Enter a monthly budget (RSD) for the categories you want to track — the Overview shows how much is spent and left. 💡 suggests an amount from the last 3 months’ average. Empty = no budget. A category can’t be deleted while it’s in use.',
    'Kategorije prihoda': 'Income categories', 'Nova kategorija...': 'New category...', 'Nova kategorija prihoda...': 'New income category...',
    'Kategorija se koristi u postojećim rashodima ili ponavljajućim stavkama': 'The category is used by expenses or recurring items', 'Kategorija se koristi u postojećim prihodima': 'The category is used by income items',
    'Obriši kategoriju': 'Delete category', 'Vrati automatsku boju': 'Reset to automatic color', 'Boja kategorije': 'Category color', 'Budžet/mes.': 'Budget/mo.',
    'Mesečni budžet (RSD)': 'Monthly budget (RSD)', 'Preimenuj': 'Rename', 'Preimenuj kategoriju': 'Rename category', 'Preimenuj kategoriju prihoda': 'Rename income category',
    'Naziv kategorije': 'Category name', 'Kategorija sa tim imenom već postoji.': 'A category with that name already exists.',
    'Nema podataka poslednjih meseci': 'No data in recent months', 'Poslednjih 6 meseci': 'Last 6 months', 'Zbir budžeta po kategorijama:': 'Sum of category budgets:',
    'budžet je veći od prihoda': 'the budget is higher than income',

    // ---- Ponavljajuce ----
    'Nova ponavljajuća stavka': 'New recurring item', 'Dan u mesecu (1–31; 31 = poslednji dan)': 'Day of month (1–31; 31 = last day)', 'Učestalost': 'Frequency',
    'Mesec (za kvartalno/godišnje)': 'Month (for quarterly/yearly)', 'Iznos pokriva ceo period (raspodeli na 3 odnosno 12 meseci)': 'The amount covers the whole period (spread over 3 or 12 months)',
    'Ovo je pretplata (Netflix, Spotify...)': 'This is a subscription (Netflix, Spotify...)', 'Automatski upiši kao plaćeno na dan dospeća': 'Automatically record as paid on the due date',
    'Dodaj ponavljajuću stavku': 'Add recurring item', 'Ovaj mesec': 'This month', 'Nema definisanih ponavljajućih stavki.': 'No recurring items defined.',
    'Stavka se upiše u knjigu kad je čekiraš (tada možeš i da promeniš iznos, npr. za račun za struju). Za stavke koje se uvek plaćaju isto i automatski (trajni nalog, pretplata na karticu) uključi "Automatski upiši" — tada se upisuju same na dan dospeća.': 'An item is recorded when you check it (you can change the amount then, e.g. for an electricity bill). For items always paid the same way automatically (standing order, card subscription) turn on "Record automatically" — they’ll record themselves on the due date.',
    'Čekiraj stavku kad je platiš/naplatiš — tek tada ulazi u ukupne brojke. Dok je nečekirana, računa se kao "na čekanju" u vrhu stranice. Koristi "Plati unapred" ako želiš odmah da podmiriš dva ili više meseci (npr. stanarinu unapred).': 'Check an item when you pay/receive it — only then does it count in the totals. While unchecked it counts as "pending". Use "Pay ahead" to settle two or more months at once (e.g. rent in advance).',
    'Pretplate': 'Subscriptions', 'Plati unapred:': 'Pay ahead:', 'Plati': 'Pay', 'Nije na redu ovog meseca': 'Not due this month', 'pauzirano ⏸': 'paused ⏸',
    'Uredi ponavljajuću stavku': 'Edit recurring item', 'Kvartalno/godišnje: iznos pokriva ceo period (raspodeli na 3/12 meseci)': 'Quarterly/yearly: the amount covers the whole period (spread over 3/12 months)',
    'Na čekanju ovaj mesec': 'Pending this month', 'avansno plaćeno zaključno sa:': 'paid in advance through:', 'raspoređeno': 'spread', '🔔 pretplata': '🔔 subscription',
    'Automatski upiši': 'Record automatically', 'Januar': 'January', 'Februar': 'February', 'Mart': 'March', 'April': 'April', 'Maj': 'May', 'Jun': 'June',
    'Jul': 'July', 'Avgust': 'August', 'Septembar': 'September', 'Oktobar': 'October', 'Novembar': 'November', 'Decembar': 'December',

    // ---- Ciljevi i dugovi ----
    'Novi cilj štednje': 'New savings goal', 'Naziv cilja': 'Goal name', 'npr. Putovanje na more': 'e.g. Summer vacation', 'Ciljani iznos (RSD)': 'Target amount (RSD)',
    'Rok (opciono)': 'Deadline (optional)', 'Novac za cilj je na računu (opciono)': 'Money for the goal is kept in (optional)', 'Novac za cilj je na računu': 'Money for the goal is kept in',
    'Ako izabereš račun (npr. Štednja), svaka uplata u cilj pravi i prenos na taj račun — pa se novac ne računa dvaput.': 'If you choose an account (e.g. Savings), every goal contribution also transfers money to it — so it isn’t counted twice.',
    'Dodaj cilj': 'Add goal', 'Moji ciljevi': 'My goals', 'Još nema definisanih ciljeva.': 'No goals defined yet.', 'Zaokruži i uštedi': 'Round up and save',
    'Svaki rashod se zaokruži na sledećih 100 RSD, a razlika automatski ide u izabrani cilj — pasivna štednja bez dodatnog razmišljanja.': 'Each expense is rounded up to the next 100 RSD and the difference goes to the chosen goal — effortless saving.',
    'Cilj za zaokruživanje': 'Round-up goal', 'Rok je prošao — vreme je da dopuniš cilj.': 'The deadline has passed — time to top up the goal.', 'Iznos uplate (RSD)': 'Contribution (RSD)',
    'Cilj ostvaren': 'Goal reached', 'Dodaj uplatu': 'Add payment', 'Uredi cilj': 'Edit goal', 'Trenutno sakupljeno (RSD)': 'Saved so far (RSD)', 'bez roka': 'no deadline',
    'Novi dug/pozajmica': 'New debt/loan', 'Osoba': 'Person', 'npr. Marko': 'e.g. Mark', 'Smer': 'Direction', 'Duguje mi': 'Owes me', 'Dugujem': 'I owe',
    'Napomena (opciono)': 'Note (optional)', 'Napomena': 'Note', 'npr. za koncert': 'e.g. for the concert', 'Dugovi i pozajmice ': 'Debts & loans', 'Nema unetih dugova ni pozajmica.': 'No debts or loans entered.',
    'Plan otplate': 'Payoff plan', 'Snowball metod — najmanji dug se otplaćuje prvi (brza pobeda), ostatak kapaciteta prelazi na sledeći. Odnosi se samo na ono što ti duguješ (ne na ono što tebi duguju).': 'Snowball method — the smallest debt is paid first (a quick win), then the freed capacity moves to the next. Applies only to what you owe.',
    'Mesečni kapacitet za otplatu (RSD)': 'Monthly payoff capacity (RSD)', 'npr. 20000': 'e.g. 20000', 'Unesi mesečni kapacitet da vidiš plan otplate.': 'Enter a monthly capacity to see the payoff plan.',
    'Klikni da promeniš smer': 'Click to change direction', 'Uredi dug/pozajmicu': 'Edit debt/loan', 'Uplaćeno do sada (RSD)': 'Paid so far (RSD)', ' — izmireno ✓': ' — settled ✓',

    // ---- Izvestaji ----
    'Izaberi dva meseca sa podacima za poređenje.': 'Choose two months with data to compare.', 'Nema podataka za izabranu godinu.': 'No data for the selected year.', 'Izaberi mesec': 'Choose a month',
    'Jedan mesec': 'One month', 'Cela godina': 'Whole year', 'Odštampaj izveštaj': 'Print report', 'Sačuvaj kao PDF': 'Save as PDF',
    'Izveštaj se generiše iz stavki (rashodi računaju samo plaćene). Dugme otvara standardni dijalog za štampu/PDF — u dijalogu izaberi "Sačuvaj kao PDF" ako želiš fajl umesto papira.': 'The report is built from your items (only paid expenses count). The button opens the standard print dialog — choose "Save as PDF" there for a file instead of paper.',
    'Izveštaj se generiše iz stavki (rashodi računaju samo plaćene). "Sačuvaj kao PDF" pravi PDF fajl direktno, bez dijaloga za štampu.': 'The report is built from your items (only paid expenses count). "Save as PDF" creates a PDF file directly, without the print dialog.',
    'Godina u brojkama': 'The year in numbers', 'Stopa uštede — od prihoda ove godine, toliko je ostalo posle svih rashoda.': 'Savings rate — the share of this year’s income left after all expenses.',
    'Ukupno unetih stavki (prihoda i rashoda) ove godine.': 'Items entered (income and expenses) this year.', 'Nema rashoda u ovom periodu.': 'No expenses in this period.',
    'Nema stavki u ovom periodu.': 'No items in this period.', 'PRIHODI': 'INCOME', 'RASHODI': 'EXPENSES', 'SALDO': 'BALANCE', 'Generisano:': 'Generated:',
    'Scenario planer': 'Scenario planner', 'Isprobaj "šta ako" izmene (otkazivanje pretplate, novi trošak, promena budžeta) i vidi kako bi to uticalo na bilans u narednih 6 meseci — ništa se ne upisuje u prave podatke dok ne klikneš "Primeni".': 'Try “what if” changes (cancelling a subscription, a new expense, a budget change) and see how the balance would look over the next 6 months — nothing touches your real data until you click "Apply".',
    'Pokreni scenario': 'Start scenario', 'Sačuvani scenariji': 'Saved scenarios', 'Projekcija bilansa (narednih 6 meseci)': 'Balance projection (next 6 months)', 'Sačuvaj kao...': 'Save as...',
    'Odštampaj scenario': 'Print scenario', 'Odbaci scenario': 'Discard scenario', 'Primeni na stvarne podatke': 'Apply to real data', 'Bazna linija (bez izmena)': 'Baseline (no changes)',
    'Bazna linija': 'Baseline', 'Hipotetičke ponavljajuće stavke': 'Hypothetical recurring items', '+ Dodaj ponavljajuću stavku': '+ Add recurring item', 'Jednokratne izmene': 'One-time changes',
    '+ Dodaj jednokratnu stavku': '+ Add one-time item', 'Mesečni budžet u scenariju (RSD, 0 = bez limita)': 'Monthly budget in the scenario (RSD, 0 = no limit)', 'Nema ponavljajućih stavki.': 'No recurring items.',
    'Nema jednokratnih izmena.': 'No one-time changes.', 'Sačuvaj scenario kao': 'Save scenario as', 'Dodaj hipotetičku ponavljajuću stavku': 'Add hypothetical recurring item',
    'Ovo je prihod (ne rashod)': 'This is income (not an expense)', 'Dodaj jednokratnu hipotetičku stavku': 'Add hypothetical one-time item', 'Scenario je primenjen na stvarne podatke.': 'The scenario was applied to your real data.',
    'Ukloni u scenariju': 'Remove in scenario',

    // ---- Podesavanja ----
    'Izgled': 'Appearance', 'Prebaci na tamnu/svetlu temu': 'Switch dark/light theme', 'Zvučni efekti (plaćeno, brisanje, cilj ostvaren)': 'Sound effects (paid, delete, goal reached)',
    'Jezik': 'Language', 'Desktop aplikacija': 'Desktop app', 'Pokreni automatski sa Windows-om (tiho, u pozadini)': 'Start with Windows (quietly, in the background)',
    'Zatvaranje prozora ostavlja aplikaciju u system tray-u': 'Closing the window keeps the app in the system tray',
    'Dok aplikacija radi u pozadini, podsetnici za kasna plaćanja i dugove stižu i kad je prozor zatvoren, a ikonica na taskbaru pokazuje broj kasnih plaćanja.': 'While the app runs in the background, reminders for late payments and debts arrive even with the window closed, and the taskbar icon shows how many are late.',
    'Prečica za brzi unos (radi iz bilo kog programa):': 'Quick entry shortcut (works from any program):', 'Ctrl + Shift + Razmak': 'Ctrl + Shift + Space',
    'Podaci': 'Data', 'Svi podaci (stavke, kategorije, ponavljajuće stavke, ciljevi, dugovi, pravila, scenariji, podešavanja) čuvaju se automatski u jednom fajlu:': 'All data (items, categories, recurring items, goals, debts, rules, scenarios, settings) is saved automatically in one file:',
    'Prikaži fajl u folderu': 'Show file in folder', 'Automatske rezervne kopije': 'Automatic backups', 'Napravi kopiju sada': 'Back up now', 'Otvori folder sa kopijama': 'Open backups folder',
    'Svakog dana kad nešto izmeniš automatski se čuva kopija (poslednjih 30 dana), plus po jedna kopija za svaki mesec (poslednjih 12 meseci). Pre svakog vraćanja kopije pravi se i kopija trenutnog stanja, pa se ništa ne može izgubiti.': 'On every day you change something a backup is saved automatically (last 30 days), plus one per month (last 12 months). Before any restore the current state is backed up too, so nothing can be lost.',
    'Ažuriranja': 'Updates', 'Proveri sada': 'Check now', 'Restartuj i ažuriraj': 'Restart and update', 'Prečice na tastaturi': 'Keyboard shortcuts',
    'Novi rashod (prozor za unos)': 'New expense (entry window)', 'Brzi unos iz bilo kog programa': 'Quick entry from any program', 'Prelazak na ekran (Pregled, Transakcije, Budžet…)': 'Go to screen (Overview, Transactions, Budget…)',
    'Prethodni / sledeći mesec u sažetku': 'Previous / next month in the summary', 'Pretraga stavki ': 'Search items', 'Fokus na polje za unos na trenutnom ekranu': 'Focus the entry field on the current screen',
    'Sačuvaj izveštaj kao PDF': 'Save report as PDF', 'Uvećaj / umanji / stvarna veličina': 'Zoom in / out / actual size', 'Ceo ekran': 'Full screen',
    'Zatvori prozor (app ostaje u tray-u)': 'Close window (app stays in the tray)', 'Izađi iz aplikacije': 'Quit the app', 'Skupi / proširi bočni meni': 'Collapse / expand the sidebar',
    'Kursna lista': 'Exchange rates', 'Kursna lista još nije preuzeta.': 'Exchange rates haven’t been downloaded yet.', 'Kursna lista još nije preuzeta': 'Exchange rates haven’t been downloaded yet', 'Osveži kurs': 'Refresh rates',
    'Za iznose u EUR, USD, CHF ili GBP (npr. kirija u evrima) izaberi valutu pored iznosa — preračunava se u dinare po srednjem kursu NBS i pamti se originalni iznos.': 'For amounts in EUR, USD, CHF or GBP (e.g. rent in euros) pick the currency next to the amount — it’s converted to dinars at the NBS middle rate and the original amount is kept.',
    'Vodič za podešavanje': 'Setup guide', 'Pokreni vodič': 'Start guide', 'Notifikacije': 'Notifications', 'Omogući notifikacije za kasna plaćanja': 'Enable late payment notifications',
    'Radi i offline — čim otvoriš app, provera se pokreće za dospele/kasnije ponavljajuće stavke i dugove sa prošlim rokom.': 'Works offline — whenever you open the app it checks for due/late recurring items and overdue debts.',
    'Notifikacije su uključene — podsetnici za kasna plaćanja i dugove stižu i kad je prozor zatvoren (dok aplikacija radi u tray-u).': 'Notifications are on — reminders for late payments and debts arrive even with the window closed (while the app runs in the tray).',
    'Excel fajl kao izvor podataka': 'Excel file as data source', 'Excel izvoz / uvoz': 'Excel export / import', 'Izvezi u Excel': 'Export to Excel', 'Preuzmi Excel fajl': 'Download Excel file',
    'Izvoz pravi Excel fajl sa svim stavkama, kategorijama, ponavljajućim stavkama, ciljevima i dugovima (npr. za analizu). Uvoz iz Excel fajla ZAMENJUJE te podatke u aplikaciji.': 'Export creates an Excel file with all items, categories, recurring items, goals and debts (e.g. for analysis). Importing an Excel file REPLACES that data in the app.',
    'Kreiraj novi Excel fajl': 'Create new Excel file', 'Otvori postojeći Excel fajl': 'Open existing Excel file', 'Ponovo poveži': 'Reconnect',
    'Nije povezan nijedan Excel fajl — podaci se čuvaju lokalno u browseru dok se ne poveže fajl.': 'No Excel file connected — data is stored locally in the browser until a file is connected.',
    'Fajl je promenjen na drugom uređaju/tabu OTKAD si ovde nešto izmenio/la — da ne bi jedna strana tiho prepisala drugu, izaberi šta da uradiš:': 'The file was changed on another device/tab SINCE you edited here — so neither side silently overwrites the other, choose what to do:',
    'Zadrži moje izmene (prepiši fajl)': 'Keep my changes (overwrite the file)', 'Preuzmi iz fajla (odbaci moje najnovije izmene)': 'Take the file (discard my latest changes)',
    'Ovaj browser ne podržava automatsko čuvanje direktno u fajl (ta opcija radi u Chrome i Edge). Ovde preuzmeš Excel fajl i kasnije ga ponovo učitaš da nastaviš.': 'This browser can’t save directly to a file (that works in Chrome and Edge). Download the Excel file here and load it again later to continue.',
    'Uvoz izvoda banke (CSV, Excel, OFX, QIF)': 'Import bank statement (CSV, Excel, OFX, QIF)', 'Uvezi na račun': 'Import into account',
    'Izaberi izvod banke (CSV ili Excel sa kolonama datum/opis/iznos, ili odvojenim kolonama Isplata/Uplata), OFX/QFX ili QIF, ili CSV izvezen iz ove aplikacije. Srpski zapis brojeva (1.234,56) i fajlovi sa tačka-zarezom se prepoznaju automatski. Pre uvoza vidiš pregled, a stavke koje već postoje se preskaču.': 'Choose a bank statement (CSV or Excel with date/description/amount columns, or separate Debit/Credit columns), OFX/QFX or QIF, or a CSV exported from this app. Serbian number format (1.234,56) and semicolon-separated files are detected automatically. You see a preview first, and items that already exist are skipped.',
    'Pravila ispod (ako opis sadrži reč → kategorija) imaju prioritet nad kolonom kategorije iz CSV-a.': 'The rules below (if the description contains a word → category) take priority over the category column in the CSV.',
    'npr. Wolt': 'e.g. Wolt', 'Dodaj pravilo': 'Add rule', 'Obriši pravilo': 'Delete rule', 'Nema definisanih pravila.': 'No rules defined.',
    'Rezervna kopija (JSON, svi podaci)': 'Backup (JSON, all data)', 'Izvezi JSON rezervnu kopiju': 'Export JSON backup',
    'Izvoz čuva stavke, kategorije, limite, boje kategorija, ponavljajuće stavke, ciljeve, dugove i mesečni budžet. Uvoz zamenjuje trenutne podatke u ovom browseru.': 'Export saves items, categories, limits, category colors, recurring items, goals, debts and the monthly budget. Import replaces the current data.',
    'CSV izvoz stavki': 'CSV export of items', 'Izvezi kao CSV': 'Export as CSV', 'Provera podataka': 'Data check', 'Proveri i popravi neusklađenosti': 'Check and fix inconsistencies',
    'Koristi ovo ako brojke u vrhu stranice deluju netačno (npr. posle plaćanja unapred) — dopunjuje stavke koje nedostaju za već obeležene plaćene mesece.': 'Use this if the totals look wrong (e.g. after paying ahead) — it fills in missing items for months already marked as paid.',
    'Arhiviranje starih stavki': 'Archive old items', 'Ukloni stavke starije od': 'Remove items older than', 'godina': 'years', 'Arhiviraj i ukloni': 'Archive and remove',
    'Prvo preuzima JSON fajl sa svim stavkama koje se uklanjaju (kao rezervnu kopiju), pa ih tek onda briše iz aktivnog spiska — korisno da app ostane brz kad istorija naraste.': 'First downloads a JSON file with all items being removed (as a backup), then removes them from the active list — keeps the app fast as history grows.',
    'Podaci se čuvaju lokalno u ovom browseru (localStorage) — nikamo se ne šalju.': 'Data is stored locally in this browser (localStorage) — it’s never sent anywhere.',
    'Podaci se čuvaju u fajlu na ovom računaru — nikamo se ne šalju.': 'Data is stored in a file on this computer — it’s never sent anywhere.',
    'Sve je već usklađeno — ništa nije trebalo popraviti.': 'Everything is already consistent — nothing needed fixing.',
    'Greška pri čuvanju — klikni za detalje': 'Save error — click for details', 'Sačuvano': 'Saved', 'Čuva se…': 'Saving…', 'Poslednje čuvanje nije uspelo:': 'The last save failed:',
    '— pokušava se ponovo automatski.': '— retrying automatically.', 'Poslednje čuvanje:': 'Last saved:', 'PDF je sačuvan:': 'PDF saved:', 'Greška pri čuvanju PDF-a:': 'Error saving PDF:',
    'dnevna': 'daily', 'mesečna': 'monthly', 'ručna': 'manual', 'pre vraćanja': 'before restore', 'Još nema kopija.': 'No backups yet.', 'Kopija ne može da se pročita:': 'The backup can’t be read:',
    'Rezervna kopija je napravljena.': 'Backup created.', 'Greška pri pravljenju rezervne kopije:': 'Error creating backup:', 'Vraćanje kopije': 'Restore backup', 'Vrati kopiju': 'Restore',
    'Rezervna kopija je uspešno učitana.': 'The backup was loaded.', 'Greška pri učitavanju rezervne kopije:': 'Error loading the backup:',
    'Brzi unos je i dalje dostupan iz tray menija i sa desnim klikom na ikonicu na taskbaru.': 'Quick entry is still available from the tray menu and by right-clicking the taskbar icon.',
    'Pritisni prečicu bilo gde u Windows-u da otvoriš mali prozor za brzi unos rashoda.': 'Press the shortcut anywhere in Windows to open the small quick-entry window.',
    'Ovu prečicu već koristi neki drugi program — izaberi drugu.': 'Another program already uses this shortcut — choose a different one.',
    'Nove verzije se proveravaju automatski (posle starta i na svaka 2 sata) i instaliraju same.': 'New versions are checked automatically (after start and every 2 hours) and install themselves.',
    'Proveravam da li postoji nova verzija…': 'Checking for a new version…', 'Imaš najnoviju verziju. Nove verzije se instaliraju automatski.': 'You have the latest version. New versions install automatically.',
    'Provera nije uspela (možda nema interneta) — pokušaću ponovo kasnije.': 'The check failed (maybe no internet) — I’ll try again later.',
    'Dobrodošao/la': 'Welcome', 'Preskoči vodič': 'Skip guide', 'Dobrodošao/la u Knjigu budžeta': 'Welcome to Budget Book', 'Prvi prihod': 'First income', 'Kategorije rashoda': 'Expense categories',
    'Cilj štednje': 'Savings goal', 'Budžet po kategoriji': 'Category budget', 'Spreman/na si!': 'You’re all set!',
    'Ovaj kratak vodič (5 koraka, može se preskočiti bilo kad) te vodi kroz osnovno podešavanje: prvi prihod, kategorije rashoda, cilj štednje i budžet po kategoriji.': 'This short guide (5 steps, skip any time) walks you through the basics: first income, expense categories, a savings goal and a category budget.',
    'Opis prihoda': 'Income description', 'npr. Plata': 'e.g. Salary', 'Opciono — možeš i preskočiti i uneti kasnije na tabu "Prihodi".': 'Optional — you can skip this and add it later under "Income".',
    'Ovo su podrazumevane kategorije rashoda — isključi one koje ti ne trebaju, ili dodaj svoju.': 'These are the default expense categories — turn off the ones you don’t need or add your own.',
    'Dodaj svoju kategoriju': 'Add your own category', 'Naziv cilja štednje': 'Savings goal name', 'npr. Fond za slučaj nužde': 'e.g. Emergency fund', 'Opciono — samo ako već imaš nešto na umu.': 'Optional — only if you already have something in mind.',
    'Postavi mesečni budžet za jednu kategoriju (npr. Hrana) da na Pregledu vidiš koliko ti je preostalo tokom meseca.': 'Set a monthly budget for one category (e.g. Food) to see on the Overview how much is left during the month.',
    'Mesečni budžet (RSD) ': 'Monthly budget (RSD)', 'Opciono — može se podesiti i kasnije na tabu "Budžet".': 'Optional — you can set it later under "Budget".',
    'Spreman/na si! Sve što si podesio/la je već sačuvano. Ostatak (ponavljajuće stavke, dugovi, Excel sinhronizacija...) pronađi kroz tabove kad ti zatreba.': 'You’re all set! Everything is already saved. Find the rest (recurring items, debts, Excel...) in the tabs when you need it.',
    'Greška pri čitanju fajla:': 'Error reading the file:', 'U fajlu nije pronađena nijedna stavka.': 'No items were found in the file.',
    'Kategorije su dodeljene po pravilima i ranijim stavkama sa istim opisom — posle uvoza ih možeš promeniti.': 'Categories were assigned from your rules and earlier items with the same description — you can change them after import.',
    'Ništa novo za uvoz.': 'Nothing new to import.', 'Uvoz je otkazan.': 'Import cancelled.', 'Uvoz je poništen.': 'Import undone.', 'Uvoz izvoda': 'Statement import',
    'Uvoz iz Excela': 'Excel import', 'Zameni podatke': 'Replace data', 'Arhiviranje': 'Archiving', 'Arhiviraj': 'Archive',
    'Uvoz iz Excel fajla ZAMENJUJE stavke, kategorije, ponavljajuće stavke, ciljeve i dugove u aplikaciji podacima iz fajla. Nastaviti?': 'Importing from Excel REPLACES the items, categories, recurring items, goals and debts in the app with the file’s data. Continue?',
    'Excel fajl je uspešno učitan.': 'The Excel file was loaded.', 'Greška pri čitanju Excel fajla:': 'Error reading the Excel file:', 'Greška:': 'Error:',
    'Još nikad nisi izvezao/la JSON rezervnu kopiju — podaci postoje samo u ovom browseru.': 'You’ve never exported a JSON backup — the data exists only in this browser.',
    'Potrebna je ponovna dozvola za pristup fajlu — koristi "Ponovo poveži".': 'File access needs permission again — use "Reconnect".', 'Greška pri čuvanju u Excel:': 'Error saving to Excel:',
    'Konflikt: fajl je promenjen na drugom uređaju dok si ovde imao neposlate izmene.': 'Conflict: the file changed on another device while you had unsaved changes here.',
    'Ovaj browser ne podržava notifikacije.': 'This browser doesn’t support notifications.', 'Notifikacije su omogućene.': 'Notifications are enabled.', 'Dozvola nije data.': 'Permission was not granted.',
    'Kasni plaćanje': 'Late payment', 'Danas dospeva': 'Due today', 'Sutra dospeva': 'Due tomorrow', 'Dug/pozajmica kasni': 'Debt overdue',
    'Unesi opis.': 'Enter a description.', 'Svaka kategorija u podeli treba iznos veći od nule.': 'Each category in the split needs an amount above zero.', 'Unesi iznos veći od nule.': 'Enter an amount above zero.',
    'npr. Plata za avgust (ili Plata 50000)': 'e.g. August salary (or Salary 50000)', 'npr. Stanarina (ili Stanarina 30000)': 'e.g. Rent (or Rent 30000)',
    'Jezik / Language': 'Language / Jezik',
    'Opozovi': 'Undo', 'npr. posao, honorar': 'e.g. work, freelance', 'Brzi unos': 'Quick entry',
    'najnovija': 'latest', 'v{0} → {1} (preuzima se)': 'v{0} → {1} (downloading)', 'Nova verzija {0} se preuzima.': 'New version {0} is downloading.',
    'Ažuriraj na {0}': 'Update to {0}', 'Instalirana je {0}, a dostupna je {1} — klikni da ažuriraš.': 'Installed: {0}, available: {1} — click to update.',
    'Srpski': 'Srpski', 'English': 'English', 'Aplikacija će se ponovo pokrenuti da bi se promenio jezik.': 'The app will restart to change the language.',
    'Skupi bočni meni': 'Collapse sidebar', 'Proširi bočni meni': 'Expand sidebar',

    // ---- Prozor za unos ----
    'Novi unos': 'New entry', 'Više opcija': 'More options', 'Pokriva više meseci': 'Covers several months', 'dodaj ·': 'add ·', 'dodaj i nastavi ·': 'add and continue ·',
    'Zatvori (Esc)': 'Close (Esc)', 'Glavni prozor još nije spreman — pokušaj ponovo za trenutak.': 'The main window isn’t ready yet — try again in a moment.',
    'Stavka nije dodata.': 'The item wasn’t added.', 'npr. Namirnice (ili Namirnice 1500)': 'e.g. Groceries (or Groceries 1500)', 'npr. putovanje, posao': 'e.g. travel, work',
    'Oznake (odvojene zarezom) ': 'Tags (comma separated)', 'Vrsta ': 'Type', 'Valuta': 'Currency', 'Ukloni': 'Remove', 'Dodato': 'Added', 'Rashod dodat:': 'Expense added:', 'Prihod dodat:': 'Income added:',

    // ---- Poruke sa vrednostima (I18N.t) ----
    '{0} (+{1} još na čekanju)': '{0} (+{1} more pending)', 'prekoračeno {0}': 'over by {0}', 'preostalo {0}': '{0} left',
    'Prebaci preostali budžet ({0}) u cilj': 'Move remaining budget ({0}) to a goal', '{0}% više nego mesec ranije': '{0}% more than last month', '{0}% manje nego mesec ranije': '{0}% less than last month',
    'očekuje se +{0}': 'expected +{0}', '{0} stavka': '{0} item', '{0} stavki': '{0} items', 'ništa neplaćeno': 'nothing unpaid', 'sve plaćeno': 'all paid',
    'Na računima: {0}': 'In accounts: {0}', 'Ukupno stanje: {0}': 'Overall balance: {0}', 'Budžet — {0}': 'Budget — {0}', 'Kalendar — {0}': 'Calendar — {0}',
    'Poslednje stavke — {0}': 'Recent items — {0}', 'Rashodi po kategorijama — {0}': 'Expenses by category — {0}',
    'kurs NBS {0}': 'NBS rate {0}', ' — po {0} mesečno': ' — {0} per month', '{0} – {1}': '{0} – {1}', '. Na račun se ceo iznos računa na dan uplate.': '. The full amount counts toward the account on the payment date.',
    'Srednji kurs NBS{0}: {1}{2}': 'NBS middle rate{0}: {1}{2}', ' za {0}': ' for {0}', ' (nema interneta — prikazan poslednji preuzet kurs)': ' (offline — showing the last downloaded rates)',
    'Stvarno stanje danas (RSD) — sada u aplikaciji: {0}': 'Actual balance today (RSD) — in the app now: {0}',
    'Procena ukupnih rashoda za sledeći mesec, na osnovu trenda poslednjih {0} meseci.': 'Estimated total expenses next month, based on the trend of the last {0} months.',
    '<b>{0}</b> je poskupeo za {1}% od prve naplate ({2} → {3}) — vredi proveriti da li je i dalje isplativ.': '<b>{0}</b> has gone up {1}% since the first charge ({2} → {3}) — worth checking if it’s still worth it.',
    'Kategorija <b>{0}</b> je ovog meseca {1}% iznad proseka poslednja 3 meseca ({2} naspram proseka {3}).': 'Category <b>{0}</b> is {1}% above its 3-month average this month ({2} vs. an average of {3}).',
    'Trošak <b>{0}</b> se ponovio {1}x — dodati kao ponavljajuću stavku ({2}, dan {3}.)?': 'The expense <b>{0}</b> repeated {1}× — add it as a recurring item ({2}, day {3})?',
    '{0} ({1}, {2}) — novo': '{0} ({1}, {2}) — new', 'prihod': 'income', 'rashod': 'expense', '{0} ({1}, {2})': '{0} ({1}, {2})',
    'Najveći trošak ovog meseca — <b>{0}%</b> svih rashoda ({1}).': 'Biggest expense this month — <b>{0}%</b> of all expenses ({1}).',
    'Ovaj mesec trošiš <b>{0}% {1}</b> nego mesec ranije (a mesec još traje).': 'This month you’re spending <b>{0}% {1}</b> than last month (and the month isn’t over).',
    'U ovom mesecu potrošeno je <b>{0}% {1}</b> nego mesec ranije.': 'This month <b>{0}% {1}</b> was spent than the month before.',
    'Dan u nedelji kad u proseku trošiš najviše ({0} po danu).': 'The weekday you spend the most on average ({0} per day).',
    '{0} dan': '{0} day', '{0} dana': '{0} days', 'Niz dana zaredom bez prekoračenja tvog dnevnog proseka ({0}).': 'Days in a row without going over your daily average ({0}).',
    'Ovog meseca <b>trošiš više nego što zarađuješ</b> — za {0}.': 'This month you’re <b>spending more than you earn</b> — by {0}.',
    'U ovom mesecu <b>rashodi su bili veći od prihoda</b> — za {0}.': 'This month <b>expenses were higher than income</b> — by {0}.',
    'Kategorija <b>{0}</b> guta {1}% svih rashoda — ozbiljna neravnoteža budžeta.': 'Category <b>{0}</b> takes {1}% of all expenses — a serious imbalance.',
    'Kategorija <b>{0}</b> čini {1}% rashoda — vredi držati je na oku.': 'Category <b>{0}</b> makes up {1}% of expenses — worth keeping an eye on.',
    'Potrošnja je skočila za <b>{0}%</b> u odnosu na prošli mesec.': 'Spending jumped <b>{0}%</b> compared to last month.',
    'Nisi uneo nijedan <b>prihod</b> za tekući mesec.': 'You haven’t entered any <b>income</b> for this month.', 'Za ovaj mesec nema unetih <b>prihoda</b>.': 'No <b>income</b> entered for this month.',
    'Ušteda je ispod <b>10%</b> prihoda ovog meseca — tanka je margina.': 'Savings are below <b>10%</b> of this month’s income — a thin margin.',
    'Premašen limit za <b>{0}</b>: {1} od {2}.': 'Budget exceeded for <b>{0}</b>: {1} of {2}.', 'Blizu si limita za <b>{0}</b>: {1} od {2}.': 'Close to the budget for <b>{0}</b>: {1} of {2}.',
    'Premašen ukupan mesečni budžet: {0} od {1}.': 'Total monthly budget exceeded: {0} of {1}.', 'Blizu si ukupnog mesečnog budžeta: {0} od {1}.': 'Close to the total monthly budget: {0} of {1}.',
    'Trebalo je da platiš <b>{0}</b> pre {1} (dan {2}. u mesecu).': 'You should have paid <b>{0}</b> {1} ago (day {2} of the month).',
    'Trebalo je da naplatiš <b>{0}</b> pre {1} (dan {2}. u mesecu).': 'You should have received <b>{0}</b> {1} ago (day {2} of the month).',
    '<b>{0}</b> dospeva danas.': '<b>{0}</b> is due today.', '<b>{0}</b> dospeva za {1}.': '<b>{0}</b> is due in {1}.',
    '<b>{0}</b> je trebalo da ti vrati {1} — rok je prošao.': '<b>{0}</b> was supposed to pay you back {1} — the due date has passed.',
    '<b>{0}</b> je trebalo da vratiš {1} — rok je prošao.': 'You were supposed to pay <b>{0}</b> back {1} — the due date has passed.',
    'Moguć duplikat: {0} identične stavke {1} "{2}" ({3}, {4}).': 'Possible duplicate: {0} identical {1} items "{2}" ({3}, {4}).', 'prihoda': 'income', 'rashoda': 'expense',
    'Ukloni suvišne ({0})': 'Remove extras ({0})', 'Obrisano {0} dupliranih stavki': 'Deleted {0} duplicate items',
    '{0} je trebalo da bude plaćeno pre {1}.': '{0} should have been paid {1} ago.', '{0} je trebalo da bude naplaćeno pre {1}.': '{0} should have been received {1} ago.',
    '{0}: rok za {1} je prošao.': '{0}: the due date for {1} has passed.', '{0} — {1}.': '{0} — {1}.',
    '<b>{0}</b> je trenutno najslabija tačka ({1}/100): {2}': '<b>{0}</b> is currently the weakest area ({1}/100): {2}', 'Finansijsko zdravlje: {0} od 100 ({1})': 'Financial health: {0} of 100 ({1})',
    'Obrisan prihod: "{0}"': 'Deleted income: "{0}"', 'Obrisan rashod: "{0}"': 'Deleted expense: "{0}"', 'Obrisano {0} prihoda': 'Deleted {0} income items', 'Obrisano {0} rashoda': 'Deleted {0} expenses',
    'Obrisana stavka: "{0}"': 'Deleted item: "{0}"', 'Obrisana ponavljajuća stavka: "{0}"': 'Deleted recurring item: "{0}"', 'Obrisan cilj: "{0}"': 'Deleted goal: "{0}"', 'Obrisano: "{0}"': 'Deleted: "{0}"',
    'Ukupno: {0}': 'Total: {0}', 'Izabrano: {0}': 'Selected: {0}', '{0} neplaćenih rashoda': '{0} unpaid expenses',
    'veći je od ukupnog mesečnog budžeta ({0})': 'is more than the total monthly budget ({0})', 'prosečan prihod poslednja 3 meseca: {0}': 'average income over the last 3 months: {0}',
    'Predlog na osnovu proseka poslednja 3 meseca: {0}': 'Suggestion from the last 3 months’ average: {0}', 'Mesečni budžet za {0}': 'Monthly budget for {0}',
    'sledeći put: {0}': 'next: {0}', 'dan {0}.': 'day {0}', 'Plati: {0}': 'Pay: {0}', 'Iznos (RSD) — poslednji put: {0}': 'Amount (RSD) — last time: {0}',
    'Iznos (RSD) — {0} po današnjem kursu NBS': 'Amount (RSD) — {0} at today’s NBS rate', 'Iznos ({0}) — u RSD po današnjem kursu ≈ {1}': 'Amount ({0}) — in RSD at today’s rate ≈ {1}',
    '⏸ Pauziraj mesec': '⏸ Pause month', '⏸ Pauziraj ovaj termin': '⏸ Pause this time', '⏸ Pauzirano za ovaj mesec — ': '⏸ Paused for this month — ', 'vrati': 'undo',
    'rashodi {0} · prihodi {1}': 'expenses {0} · income {1}', 'Predlog: uplaćuj ~{0}/mesečno da stigneš do roka ({1} mes.).': 'Tip: contribute ~{0}/month to reach it by the deadline ({1} mo.).',
    'Rok: {0}': 'Deadline: {0}', ' · račun: {0}': ' · account: {0}', '{0} preostalo': '{0} to go', 'otplaćeno za {0}. mesec': 'paid off in month {0}',
    'Uz {0}/mesečno, svi dugovi su otplaćeni za <b>{1}</b>.': 'At {0}/month, all debts are paid off in <b>{1}</b>.', '{0} mesec': '{0} month', '{0} meseci': '{0} months',
    '{0} · {1}, dan {2}.': '{0} · {1}, day {2}',
    'Najveća kategorija rashoda — {0}% svih rashoda ({1}).': 'Largest expense category — {0}% of all expenses ({1}).',
    'Najveći pojedinačni trošak — "{0}" ({1}).': 'Largest single expense — "{0}" ({1}).', 'Rashodi u odnosu na {0}. godinu.': 'Expenses compared to {0}.',
    'Izveštaj — {0}': 'Report — {0}', '{0}. godina': 'Year {0}', ' (deo od {0}, {1})': ' (part of {0}, {1})', 'deo od {0}': 'part of {0}', '{0} mes. ({1} – {2})': '{0} mo. ({1} – {2})',
    'Sve stavke iz ovog fajla ({0}) su već u knjizi — nema ništa novo za uvoz.': 'All items in this file ({0}) are already in the book — nothing new to import.',
    'Format: <b>{0}</b> · period {1} – {2}': 'Format: <b>{0}</b> · period {1} – {2}',
    '<b>{0}</b> novih stavki: {1} rashoda ({2}) i {3} prihoda ({4}).': '<b>{0}</b> new items: {1} expenses ({2}) and {3} income ({4}).',
    'Preskače se <b>{0}</b> stavki koje već postoje u knjizi.': 'Skipping <b>{0}</b> items that already exist.', 'Preskočeno {0} redova bez datuma ili iznosa.': 'Skipped {0} rows without a date or amount.',
    '…i još {0}.': '…and {0} more.', 'Uvezi {0}': 'Import {0}', 'Uvezeno {0} stavki': 'Imported {0} items', 'Uvezeno {0} stavki, preskočeno {1} duplikata.': 'Imported {0} items, skipped {1} duplicates.',
    'Uvezeno {0} stavki.': 'Imported {0} items.', 'Poslednji backup je bio pre {0} dana — vredi izvesti novi.': 'The last backup was {0} days ago — worth exporting a new one.',
    'Vratiti sve podatke iz ove kopije (sačuvana: {0})?\n\nTrenutni podaci biće zamenjeni. Pre toga se automatski pravi kopija trenutnog stanja.': 'Restore all data from this backup (saved: {0})?\n\nThe current data will be replaced. A backup of the current state is made first.',
    'Vratiti sve podatke na stanje od {0}?\n\nSve izmene posle tog trenutka biće zamenjene. Pre vraćanja se automatski čuva kopija trenutnog stanja, pa se i ovo može poništiti.': 'Restore all data to {0}?\n\nAll changes after that moment will be replaced. The current state is backed up first, so this can be undone too.',
    'Popravljeno: dopunjeno {0} nedostajućih stavki. Brojke su ažurirane.': 'Fixed: filled in {0} missing items. The totals are updated.',
    'Nema stavki starijih od {0} — ništa nije arhivirano.': 'No items older than {0} — nothing was archived.',
    'Preuzeće se rezervni JSON fajl sa {0} stavki starijih od {1}, a zatim će biti uklonjene iz aktivnog spiska. Nastaviti?': 'A JSON backup with {0} items older than {1} will be downloaded, then they’ll be removed from the active list. Continue?',
    'Arhivirano i uklonjeno {0} stavki (fajl je preuzet).': 'Archived and removed {0} items (the file was downloaded).',
    'Poslednja kopija: {0} · {1} fajlova u {2}': 'Last backup: {0} · {1} files in {2}', 'Još nema kopija — prva se pravi automatski. Folder: {0}': 'No backups yet — the first is made automatically. Folder: {0}',
    '{0} stavki': '{0} items', 'Instalirana verzija: {0}': 'Installed version: {0}', 'Preuzimam verziju {0}… {1}': 'Downloading version {0}… {1}',
    'Verzija {0} je spremna — instaliraće se čim skloniš prozor (tray ili minimizuj) ili zatvoriš aplikaciju.': 'Version {0} is ready — it will install as soon as you hide the window (tray or minimize) or quit the app.',
    'Verzija {0} je spremna i instaliraće se automatski za nekoliko trenutaka.': 'Version {0} is ready and will install automatically in a moment.', 'Instaliram verziju {0}…': 'Installing version {0}…',
    'Provera nije uspela (možda nema interneta) — pokušaću ponovo kasnije. {0}': 'The check failed (maybe no internet) — I’ll try again later. {0}',
    'Instaliram {0}…': 'Installing {0}…', 'Verzija {0} se instalira za {1} s': 'Version {0} installs in {1} s', 'Verzija {0} je spremna': 'Version {0} is ready',
    'Šta je novo u {0}:\n{1}': 'What’s new in {0}:\n{1}', 'Aplikacija je ažurirana na verziju {0} — šta je novo pogledaj u Podešavanjima.': 'The app was updated to version {0} — see what’s new in Settings.',
    'Kurs za {0} nije dostupan.': 'The rate for {0} isn’t available.', '{0} dodat: {1}': '{0} added: {1}', ' ({0} kategorije)': ' ({0} categories)',
    'Ukupno: {0} {1}': 'Total: {0} {1}', ' (iznos gore: {0})': ' (amount above: {0})', '≈ {0} · ': '≈ {0} · ',
    'Sačuvano {0}': 'Saved {0}', 'Prebaci višak ({0}) u cilj': 'Move surplus ({0}) to a goal', 'Predlog na osnovu proseka: {0}': 'Suggestion: {0}',
    'Uplata u cilj: {0}': 'Goal contribution: {0}', 'Pokreni automatski ': 'Start automatically',
    'dospeva: {0}': 'due: {0}', 'rashodi {0}': 'expenses {0}', 'prihodi {0}': 'income {0}', '{0} preneto': '{0} carried over', '{0} / {1} · ': '{0} / {1} · ',
  };

  // Spajanja teksta koja nisu kroz t() (prefiks + vrednost)
  const PATTERNS = [
    [/^(\d+) kasn(?:o plaćanje|ih plaćanja)$/, '$1 late payment(s)'],
  ];

  const LANG_KEY = 'budzet-jezik-v1';
  let lang = 'sr';
  try{
    if(root.desktop && root.desktop.info && root.desktop.info.lang) lang = root.desktop.info.lang;
    else lang = root.localStorage.getItem(LANG_KEY) || 'sr';
  } catch(e){ /* nedostupno skladiste */ }
  if(lang !== 'en') lang = 'sr';
  const locale = lang === 'en' ? 'en-GB' : 'sr-Latn-RS';

  const norm = s => s.replace(/\s+/g, ' ').trim();
  function lookup(s){
    const k = norm(s);
    if(!k) return null;
    if(Object.prototype.hasOwnProperty.call(EN, k)) return EN[k];
    for(const [re, rep] of PATTERNS){ if(re.test(k)) return k.replace(re, rep); }
    return null;
  }
  function t(sr){
    const args = Array.prototype.slice.call(arguments, 1);
    const s = (lang === 'en' && Object.prototype.hasOwnProperty.call(EN, sr)) ? EN[sr] : sr;
    return s.replace(/\{(\d+)\}/g, (m, i) => args[i] !== undefined ? args[i] : m);
  }
  // Korisnicki podaci se ne prevode: nazivi kategorija/oznaka i sve sa translate="no"
  const SKIP_SELECTOR = '[translate="no"], .cat-tag, .tag-chip, script, style, textarea, code, kbd';
  const ATTRS = ['title', 'placeholder', 'aria-label'];
  function translateText(node){
    const v = node.nodeValue;
    if(!v || !/[A-Za-zčćžšđČĆŽŠĐ]/.test(v)) return;
    const tr = lookup(v);
    if(tr == null || tr === norm(v)) return;
    const lead = v.match(/^\s*/)[0], trail = v.match(/\s*$/)[0];
    node.nodeValue = lead + tr + trail;
  }
  function translateEl(el){
    if(el.closest && el.closest(SKIP_SELECTOR)) return;
    ATTRS.forEach(a => {
      const v = el.getAttribute && el.getAttribute(a);
      if(v){ const tr = lookup(v); if(tr != null) el.setAttribute(a, tr); }
    });
  }
  function translateDom(root){
    if(lang !== 'en' || !root) return;
    if(root.nodeType === 3){ const p = root.parentElement; if(!p || !p.closest(SKIP_SELECTOR)) translateText(root); return; }
    if(root.nodeType !== 1) return;
    if(root.closest(SKIP_SELECTOR)) return;
    translateEl(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(n){ if(n.nodeType === 1 && n.matches(SKIP_SELECTOR)) return NodeFilter.FILTER_REJECT; return NodeFilter.FILTER_ACCEPT; }
    });
    let n;
    while((n = walker.nextNode())){ if(n.nodeType === 3) translateText(n); else translateEl(n); }
  }
  let observer = null;
  function start(){
    // Polja za datum koriste lang atribut: en-GB = dan/mesec/godina (ne americki mesec/dan)
    document.documentElement.lang = locale;
    if(lang !== 'en') return;
    const title = lookup(document.title); if(title) document.title = title;
    translateDom(document.body);
    observer = new MutationObserver(muts => {
      for(const m of muts){
        if(m.type === 'childList') m.addedNodes.forEach(translateDom);
        else if(m.type === 'characterData') translateDom(m.target);
        else if(m.type === 'attributes') translateEl(m.target);
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  root.I18N = { lang, locale, t, lookup, translateDom, start, LANG_KEY, EN };
})(typeof self !== 'undefined' ? self : this);
