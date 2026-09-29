// Izvrsava se u stranici aplikacije (vidi test/smoke.js). Vraca { ok, passed, failures }.
(async () => {
  const passed = [], failures = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const $ = id => document.getElementById(id);
  const check = (name, cond, detail) => { (cond ? passed : failures).push(name + (cond || detail === undefined ? '' : ' — ' + detail)); };
  const entries = () => JSON.parse(localStorage.getItem('budzet-stavke-v2') || '[]');
  const setVal = (id, v) => { const el = $(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
  const monthKey = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  try {
    check('SheetJS 0.20.3 učitan', window.XLSX && XLSX.version === '0.20.3', window.XLSX && XLSX.version);
    check('budzet-core.js učitan', !!window.BudzetCore);
    if ($('onboardingOverlay').classList.contains('show')) $('onboardingSkipBtn').click();

    // Svi ekrani se otvaraju
    const go = s => window.__showScreen(s);
    for (const s of ['pregled', 'rashodi', 'prihodi', 'racuni', 'pretraga', 'kategorije', 'ponavljajuce', 'ciljevi', 'dugovi', 'analiza', 'izvestaj', 'uporedi', 'scenario', 'kursevi', 'nabavka', 'podesavanja']) {
      go(s); await sleep(60);
      check('ekran ' + s, $('screen-' + s).classList.contains('active') && document.querySelectorAll('.screen.active').length === 1);
    }
    check('glavni meni ima 9 stavki', document.querySelectorAll('nav.tabs button[data-group]').length === 9);
    // Kursevi: omiljena valuta se pojavljuje u izboru valute pri unosu
    go('kursevi'); await sleep(60);
    const favBtn = document.querySelector('.fx-star[data-cur="BAM"]');
    if (favBtn) {
      favBtn.click();
      check('omiljena valuta u unosu', [...$('expCurrency').options].some(o => o.value === 'BAM'));
      document.querySelector('.fx-star[data-cur="BAM"]').click();
      check('uklonjena valuta nije u unosu', ![...$('expCurrency').options].some(o => o.value === 'BAM'));
    }
    document.querySelector('nav.tabs button[data-group="ciljevi"]').click(); await sleep(50);
    check('podmeni za Ciljevi i dugovi', [...document.querySelectorAll('#subtabs button')].map(b => b.dataset.screen).join(',') === 'ciljevi,dugovi');

    // Oznaka "fiksno" po kategoriji: cuva se i prati preimenovanje/brisanje
    const fixedKey = 'budzet-fiksne-kategorije-v1';
    const fixedList = () => JSON.parse(localStorage.getItem(fixedKey) || '[]');
    check('oznaka fiksno postoji', typeof window.__setCategoryFixed === 'function');
    if (typeof window.__setCategoryFixed === 'function') {
      window.__addExpenseCategory('Smoke fiksna');
      window.__setCategoryFixed('Smoke fiksna', true);
      check('fiksna kategorija sačuvana', fixedList().includes('Smoke fiksna'), localStorage.getItem(fixedKey));
      window.__renameCategory('Smoke fiksna', 'Smoke fiksna 2');
      check('preimenovanje zadržava oznaku fiksno', fixedList().includes('Smoke fiksna 2') && !fixedList().includes('Smoke fiksna'), localStorage.getItem(fixedKey));
      window.__deleteExpenseCategory('Smoke fiksna 2');
      check('brisanje kategorije briše oznaku fiksno', !fixedList().includes('Smoke fiksna 2'), localStorage.getItem(fixedKey));
    }

    // Nabavka: stanje, preimenovanje kategorije, kategorija u upotrebi
    const shopKey = 'budzet-nabavka-v1';
    check('nabavka: stanje postoji', typeof window.__shopping === 'function' && Array.isArray(window.__shopping().sections) && window.__shopping().sections.includes('Ostalo'));
    if (typeof window.__shopping === 'function') {
      window.__addExpenseCategory('Smoke nabavka');
      const sh = window.__shopping();
      sh.items.push({ id: 'smoke-shop-1', name: 'Smoke mleko', section: 'Mlečni', store: 'Maxi', category: 'Smoke nabavka', price: 150, qty: '2 kom', needed: true, checked: false });
      window.__saveShopping();
      check('nabavka: čuva se', JSON.parse(localStorage.getItem(shopKey)).items.some(i => i.id === 'smoke-shop-1'));
      window.__renameCategory('Smoke nabavka', 'Smoke nabavka 2');
      check('nabavka: preimenovanje kategorije', window.__shopping().items.find(i => i.id === 'smoke-shop-1').category === 'Smoke nabavka 2');
      go('kategorije'); await sleep(60);
      const delBtn = [...document.querySelectorAll('#catList .del-btn')].find(b => b.dataset.cat === 'Smoke nabavka 2');
      check('nabavka: kategorija u upotrebi ne može da se obriše', !!delBtn && delBtn.disabled);
      window.__shopping().items = window.__shopping().items.filter(i => i.id !== 'smoke-shop-1');
      window.__saveShopping();
      window.__deleteExpenseCategory('Smoke nabavka 2');
      check('nabavka: test stavka uklonjena', !JSON.parse(localStorage.getItem(shopKey)).items.some(i => i.id === 'smoke-shop-1'));
    }
    // Uvoz stare rezervne kopije (bez "shopping" ključa) ne sme da obriše spisak za nabavku
    check('nabavka: sanitizeImportedBackup dostupan', typeof window.__sanitizeImportedBackup === 'function');
    if (typeof window.__sanitizeImportedBackup === 'function') {
      check('nabavka: uvoz stare kopije bez shopping ključa ne pravi praznu listu', window.__sanitizeImportedBackup({ entries: [] }).shopping === null);
    }
    // Rashod sa spiskom kupljenih stvari: prikaz u Rashodima i Excel kolona
    if (window.__desktopBridge) {
      const r = window.__desktopBridge.addEntry({ type: 'expense', desc: 'Smoke kupovina', amount: 321, currency: 'RSD', category: window.__desktopBridge.getQuickAddData().expenseCats[0] });
      const e = entries().find(x => x.desc === 'Smoke kupovina');
      if (r.ok && e) {
        window.__setEntryItems(e.id, ['Mleko (2 kom)', 'Hleb', 'Jaja', 'Sir']);
        go('rashodi'); await sleep(80);
        const row = document.querySelector(`#expenseBody tr[data-row-id="${e.id}"]`) || [...document.querySelectorAll('tr')].find(tr => tr.textContent.includes('Smoke kupovina'));
        check('rashod prikazuje kupljene stvari', !!row && /Mleko \(2 kom\), Hleb, Jaja \+1/.test(row.textContent), row && row.textContent);
        const wb = window.__buildWorkbook ? window.__buildWorkbook() : null;
        const rowX = wb && XLSX.utils.sheet_to_json(wb.Sheets['Stavke']).find(x => x.ID === e.id);
        check('Excel kolona Kupljeno', !!rowX && rowX.Kupljeno === 'Mleko (2 kom); Hleb; Jaja; Sir', JSON.stringify(rowX));
        window.__deleteEntriesById([e.id]);
      }
    }

    // Ekran Nabavka: brzo dodavanje, bez duplikata, grupisanje, stikliranje
    go('nabavka'); await sleep(80);
    const shopN0 = window.__shopping().items.length;
    setVal('shopQuickInput', 'Smoke jogurt 2 kom 120'); $('shopQuickInput').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await sleep(60);
    const jog = window.__shopping().items.find(i => i.name === 'Smoke jogurt');
    check('nabavka: brzo dodavanje', !!jog && jog.qty === '2 kom' && jog.price === 120 && jog.needed === true && window.__shopping().items.length === shopN0 + 1, JSON.stringify(jog));
    jog.needed = false; window.__saveShopping();
    setVal('shopQuickInput', 'SMOKE JOGURT'); $('shopQuickInput').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await sleep(60);
    check('nabavka: isto ime ne pravi duplikat', window.__shopping().items.length === shopN0 + 1 && window.__shopping().items.find(i => i.name === 'Smoke jogurt').needed === true);
    check('nabavka: stavka je u listi', [...document.querySelectorAll('#shopList .shop-row')].some(r => r.textContent.includes('Smoke jogurt')));
    document.querySelector('.shop-by-btn[data-by="store"]').click(); await sleep(40);
    check('nabavka: grupisanje po prodavnici', [...document.querySelectorAll('#shopList .shop-group-title')].some(h => /Bez prodavnice/.test(h.textContent)));
    document.querySelector('.shop-by-btn[data-by="section"]').click(); await sleep(40);
    const jogBox = [...document.querySelectorAll('#shopList .shop-check')].find(c => c.dataset.id === window.__shopping().items.find(i => i.name === 'Smoke jogurt').id);
    jogBox.click(); await sleep(40);
    check('nabavka: štikliranje se čuva', JSON.parse(localStorage.getItem('budzet-nabavka-v1')).items.find(i => i.name === 'Smoke jogurt').checked === true);
    $('shopSectionsBtn').click(); await sleep(40);
    const ostaloRow = [...document.querySelectorAll('#shopSectionsPanel .shop-sec-row')].find(r => r.querySelector('.shop-sec-fixed'));
    check('nabavka: Ostalo ostaje poslednji deo (dugme gore isključeno)', !!ostaloRow && ostaloRow.querySelector('.shop-sec-up').disabled);
    $('shopSectionsBtn').click(); await sleep(40);

    // Zavrsi kupovinu: dve kategorije -> dva rashoda sa items i oznakom nabavka; zbir = uneti iznos
    const catsQ = window.__desktopBridge.getQuickAddData().expenseCats;
    const sh2 = window.__shopping();
    const jog2 = sh2.items.find(i => i.name === 'Smoke jogurt');
    jog2.category = catsQ[0]; jog2.checked = true; jog2.needed = true;
    sh2.items.push({ id: 'smoke-shop-2', name: 'Smoke sapun', section: 'Higijena', store: 'dm', category: catsQ[1], price: 360, qty: '', needed: true, checked: true });
    window.__saveShopping(); await sleep(40);
    check('nabavka: procena u donjoj traci', /480/.test($('shopFooter').textContent.replace(/\D/g, '')) || /480/.test($('shopFooter').textContent), $('shopFooter').textContent);
    check('nabavka: dugme Završi kupovinu je iste visine kao primarno dugme (34px)', getComputedStyle($('shopFinishBtn')).height === '34px', getComputedStyle($('shopFinishBtn')).height);
    const nE = entries().length;
    const fin = window.__finishPurchase({ total: 1001 });
    const made = entries().filter(e => (e.tags || []).includes('nabavka') && e.items && e.items.some(x => /^Smoke (jogurt|sapun)/.test(x)));
    check('nabavka: završi kupovinu pravi dva rashoda', fin && entries().length === nE + 2 && made.length === 2, JSON.stringify(made));
    check('nabavka: zbir rashoda = uneti iznos', made.reduce((s, e) => s + e.amount, 0) === 1001);
    check('nabavka: rashod nosi kupljene stvari', made.some(e => e.items.includes('Smoke jogurt (2 kom)')) && made.some(e => e.items.includes('Smoke sapun')));
    check('nabavka: kupljeno skinuto sa liste', window.__shopping().items.filter(i => /^Smoke (jogurt|sapun)$/.test(i.name)).every(i => !i.needed && !i.checked));
    // ciscenje
    window.__deleteEntriesById(made.map(e => e.id));
    window.__shopping().items = window.__shopping().items.filter(i => !/^Smoke (jogurt|sapun)$/.test(i.name));
    window.__saveShopping();

    // Zavrsi kupovinu kroz PRAVI modal DOM: stavka bez postojece kategorije + stavka u postojecoj
    // kategoriji -> oznaka/hint u modalu, Enter u iznosu potvrdjuje, zbir rashoda = uneti iznos.
    go('nabavka'); await sleep(60);
    const shF = window.__shopping();
    shF.items.push({ id: 'smoke-finish-1', name: 'Smoke finish A', section: 'Ostalo', store: '', category: 'Nepostojeca kat', price: 200, qty: '', needed: true, checked: true });
    shF.items.push({ id: 'smoke-finish-2', name: 'Smoke finish B', section: 'Ostalo', store: '', category: catsQ[0], price: 300, qty: '', needed: true, checked: true });
    window.__saveShopping(); await sleep(60);
    const checkCircle = document.querySelector('.shop-check');
    check('nabavka: krugovi za štikliranje su okrugli (20px)', !!checkCircle && getComputedStyle(checkCircle).height === '20px', checkCircle && getComputedStyle(checkCircle).height);
    $('shopFinishBtn').click(); await sleep(80);
    check('nabavka: modal za završetak kupovine se otvara', $('finishShopOverlay').classList.contains('show'));
    setVal('finishShopTotal', '1000'); await sleep(60);
    const splitTxt = $('finishShopSplit').textContent;
    check('nabavka: modal pokazuje oznaku za stavke bez kategorije', /bez kategorije/.test(splitTxt), splitTxt);
    const nE2 = entries().length;
    $('finishShopTotal').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await sleep(100);
    check('nabavka: Enter u iznosu zatvara modal i pravi rashod(e)', !$('finishShopOverlay').classList.contains('show'));
    const made2 = entries().filter(e => (e.tags || []).includes('nabavka') && e.items && e.items.some(x => /^Smoke finish/.test(x)));
    check('nabavka: rashod(i) iz modala nose oznaku nabavka', entries().length === nE2 + made2.length && made2.length >= 1, JSON.stringify(made2));
    check('nabavka: zbir rashoda iz modala = uneti iznos', made2.reduce((s, e) => s + e.amount, 0) === 1000, JSON.stringify(made2));
    // ciscenje
    window.__deleteEntriesById(made2.map(e => e.id));
    window.__shopping().items = window.__shopping().items.filter(i => !/^Smoke finish/.test(i.name));
    window.__saveShopping();

    // Analiza: prva podkartica u Izvestajima, izbor perioda
    document.querySelector('nav.tabs button[data-group="izvestaji"]').click(); await sleep(50);
    check('Analiza je prva podkartica Izveštaja', ($('subtabs').querySelector('button') || {}).dataset?.screen === 'analiza', $('subtabs').innerHTML.slice(0, 200));
    go('analiza'); await sleep(80);
    document.querySelector('.analiza-period-btn[data-n="3"]').click(); await sleep(50);
    check('Analiza: period 3 meseca', $('analizaSummary').dataset.n === '3' && document.querySelector('.analiza-period-btn[data-n="3"]').classList.contains('active'));
    document.querySelector('.analiza-period-btn[data-n="6"]').click(); await sleep(50);
    check('Analiza: period 6 meseci', $('analizaSummary').dataset.n === '6');
    check('Analiza: sažetak i kategorije', $('analizaSummary').textContent.trim().length > 0 && !!$('analizaWhereList'));
    check('Analiza: napomena da tekući mesec još traje', $('analizaSummary').textContent.includes('mesec još traje'), $('analizaSummary').textContent);
    const firstCat = document.querySelector('#analizaWhereList .analiza-cat-head');
    if (firstCat) {
      firstCat.click(); await sleep(50);
      check('Analiza: klik na kategoriju otvara opise', !!document.querySelector('#analizaWhereList .analiza-groups'));
    }
    check('Analiza: grafikon kroz vreme', $('analizaTrendChart').querySelectorAll('rect').length > 0 || $('analizaTrendNote').textContent.length > 0);

    // Analiza: fiksno/promenljivo i usteda
    check('Analiza: traka fiksno/promenljivo', $('analizaFixedBar').textContent.trim().length > 0);
    const fixedBox = document.querySelector('#analizaFixedCats input[type="checkbox"]');
    check('Analiza: prekidači fiksno po kategoriji', !!fixedBox);
    if (fixedBox) {
      const cat = fixedBox.dataset.cat, was = fixedBox.checked;
      fixedBox.click(); await sleep(60);
      check('Analiza: prekidač fiksno se čuva', JSON.parse(localStorage.getItem('budzet-fiksne-kategorije-v1') || '[]').includes(cat) === !was);
      document.querySelector(`#analizaFixedCats input[data-cat="${CSS.escape(cat)}"]`).click(); await sleep(60);
      check('Analiza: prekidač fiksno vraćen', JSON.parse(localStorage.getItem('budzet-fiksne-kategorije-v1') || '[]').includes(cat) === was);
    }
    setVal('analizaWhatIf', '20'); await sleep(40);
    check('Analiza: klizač šta ako', /20%/.test($('analizaWhatIfLabel').textContent) && $('analizaWhatIfResult').textContent.trim().length > 0, $('analizaWhatIfResult').textContent);

    // Pregled → Analiza: isti iznos na oba mesta.
    // Pravi podaci trenutno mozda nemaju nijednu ustedu (nema reda), pa se ovde seeduje testna
    // kategorija sa zagarantovanom potrosnjom iznad proseka (dva prethodna meseca po 1.000,
    // tekuci mesec 5.000), da bi grana sa dugmetom (iznos, klik → Analiza) uvek bila izvrsena.
    go('pregled'); await sleep(50);
    const seedCat = 'Smoke analiza';
    window.__addExpenseCategory(seedCat);
    const seedDate = monthsAgo => {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - monthsAgo); d.setDate(10);
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    };
    [[2, 1000], [1, 1000], [0, 5000]].forEach(([monthsAgo, amount]) => {
      const r = window.__desktopBridge.addEntry({ type: 'expense', desc: 'Smoke analiza trošak', amount, category: seedCat, date: seedDate(monthsAgo) });
      if (!r.ok) throw new Error('Seed za Analizu nije uspeo: ' + r.error);
    });
    await sleep(80);

    const S = window.BudzetCore.savingsSummary(entries(), JSON.parse(localStorage.getItem('budzet-ponavljajuce-v1') || '[]'),
      JSON.parse(localStorage.getItem('budzet-fiksne-kategorije-v1') || '[]'), monthKey(new Date()), 6);
    check('Pregled: seed test podaci ulaze u iznad proseka', S.above.some(a => a.cat === seedCat), JSON.stringify(S.above));
    const link = $('patternsAnalizaLink');
    const linkVisible = link.style.display !== 'none' && $('patternsPanel').style.display !== 'none';
    check('Pregled: red za Analizu kad ima uštede', linkVisible, JSON.stringify({ above: S.above.length, small: S.small.length }));
    check('Pregled: tekst za 1 kategoriju iznad proseka', S.above.length === 1 && link.textContent.indexOf('1 kategorija iznad proseka') === 0, link.textContent);
    const want = Math.round(S.above.length ? S.aboveTotal : S.smallMonthly);
    check('Pregled i Analiza: isti iznos', linkVisible && Number(link.dataset.total) === want, link.dataset.total + ' vs ' + want);
    link.click(); await sleep(120);
    check('Pregled: red vodi na Analizu', $('screen-analiza').classList.contains('active') && $('analizaSummary').dataset.n === '6');
    go('pregled'); await sleep(50);

    // Ciscenje seedovanih test podataka (kategorija mora biti nekoriscena da bi se obrisala)
    const seedIds = entries().filter(e => e.category === seedCat).map(e => e.id);
    window.__deleteEntriesById(seedIds);
    window.__deleteExpenseCategory(seedCat);
    await sleep(50);

    go('pregled');

    // Izbor meseca
    const label0 = $('periodLabel').textContent;
    $('periodPrev').click(); await sleep(50);
    check('prethodni mesec menja prikaz', $('periodLabel').textContent !== label0 && $('periodToday').style.visibility === 'visible', $('periodLabel').textContent);
    $('periodToday').click(); await sleep(50);
    check('povratak na tekući mesec', $('periodLabel').textContent === label0);
    check('sažetak prikazuje iznose', /RSD$/.test($('totalIncome').textContent.trim()) && /RSD$/.test($('pendingTotal').textContent.trim()));

    // Novi rashod iz forme ("opis iznos")
    const n0 = entries().length;
    go('rashodi');
    setVal('expDesc', 'Smoke test 1.500'); setVal('expAmount', '');
    $('expenseForm').requestSubmit(); await sleep(100);
    const added = entries().find(e => e.desc === 'Smoke test');
    check('dodavanje rashoda', entries().length === n0 + 1 && added && added.amount === 1500, JSON.stringify(added));

    // Ponavljajuca stavka sa automatskim upisom (dan 1 je uvek vec prosao)
    go('ponavljajuce');
    setVal('recDesc', 'Smoke pretplata'); setVal('recAmount', '999'); setVal('recDay', '1');
    $('recAutoPay').checked = true;
    $('recurringForm').requestSubmit(); await sleep(100);
    const rec = JSON.parse(localStorage.getItem('budzet-ponavljajuce-v1') || '[]').find(r => r.desc === 'Smoke pretplata');
    const autoEntry = rec && entries().find(e => e.id === 'rec-' + rec.id + '-' + monthKey(new Date()));
    check('automatski upis ponavljajuće stavke', !!autoEntry && autoEntry.amount === 999, JSON.stringify(rec));

    // Dan 31 u kracem mesecu
    check('dan 31 → poslednji dan meseca', BudzetCore.dueDateFor({ day: 31 }, '2026-02') === '2026-02-28');

    // Uvoz izvoda (CSV sa ; i srpskim brojevima) + pregled + ponovni uvoz bez duplikata
    const csv = 'Datum;Opis;Isplata;Uplata\n01.08.2026;SMOKE MAXI;1.234,56;\n02.08.2026;SMOKE PLATA;;85.000,00\n';
    const importFile = () => {
      const input = $('csvImportInput');
      const dt = new DataTransfer();
      dt.items.add(new File([csv], 'izvod.csv', { type: 'text/csv' }));
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const n1 = entries().length;
    importFile(); await sleep(400);
    check('pregled uvoza se prikazuje', $('dialogOverlay').classList.contains('show') && /2<\/b> novih stavki/.test($('dialogBody').innerHTML), $('dialogBody').textContent.slice(0, 120));
    $('dialogOk').click(); await sleep(150);
    const maxi = entries().find(e => e.desc === 'SMOKE MAXI');
    check('uvoz: srpski iznos 1.234,56', entries().length === n1 + 2 && maxi && Math.abs(maxi.amount - 1234.56) < 0.001 && maxi.type === 'expense', JSON.stringify(maxi));
    importFile(); await sleep(400);
    check('ponovni uvoz ne pravi duplikate', $('dialogOverlay').classList.contains('show') && /već u knjizi/.test($('dialogBody').textContent), $('dialogBody').textContent.slice(0, 120));
    $('dialogOk').click(); await sleep(100);
    check('broj stavki posle ponovnog uvoza', entries().length === n1 + 2);

    // Avgust (mesec uvoza) u pregledu
    go('pregled');
    const now = new Date();
    const diff = (now.getFullYear() * 12 + now.getMonth()) - (2026 * 12 + 7);
    for (let i = 0; i < Math.abs(diff); i++) { $(diff > 0 ? 'periodPrev' : 'periodNext').click(); await sleep(20); }
    await sleep(800); // iznosi u sazetku se animiraju ~0,5 s
    const augIncome = entries().filter(e => e.type === 'income' && e.date.startsWith('2026-08')).reduce((s, e) => s + e.amount, 0);
    check('sažetak za avgust 2026 = zbir prihoda avgusta', $('totalIncome').textContent.replace(/\D/g, '') === String(Math.round(augIncome)), $('totalIncome').textContent + ' vs ' + augIncome);
    check('uvezena stavka je u listi za avgust', /SMOKE PLATA/.test($('recentBody').textContent));
    $('periodToday').click();

    // Kategorije prihoda su izmenljive
    go('kategorije');
    setVal('newIncomeCatInput', 'Smoke kategorija'); $('addIncomeCatBtn').click(); await sleep(50);
    check('nova kategorija prihoda', [...$('incCategory').options].some(o => o.value === 'Smoke kategorija'));

    // Dijalog u stilu aplikacije umesto alert()
    check('nema browserskih alert/confirm poziva', !/\balert\(|[^.\w]confirm\(/.test(document.documentElement.innerHTML.replace(/appAlert\(|appConfirm\(/g, '')));

    // Racuni i prenosi
    go('racuni');
    const addAccount = async (name, opening, type) => { setVal('accName', name); setVal('accOpening', String(opening)); $('accType').value = type || 'tekuci'; $('accountForm').requestSubmit(); await sleep(80); };
    await addAccount('Smoke tekući', 10000);
    await addAccount('Smoke štednja', 0, 'stednja');
    const accs = JSON.parse(localStorage.getItem('budzet-racuni-v1') || '[]');
    check('dodavanje računa', accs.length === 2, JSON.stringify(accs));
    check('izbor računa u formi rashoda', document.body.classList.contains('has-accounts') && getComputedStyle($('expAccount').parentElement).display !== 'none');
    $('trFrom').value = accs[0].id; $('trTo').value = accs[1].id; setVal('trAmount', '2000');
    $('transferForm').requestSubmit(); await sleep(80);
    const tr = entries().filter(e => e.type === 'transfer');
    check('prenos između računa', tr.length === 1 && tr[0].amount === 2000);
    const bal = BudzetCore.accountBalances(accs, entries(), e => e.paid !== false);
    check('stanje štednje posle prenosa', bal[accs[1].id] === 2000, JSON.stringify(bal));
    go('pregled'); await sleep(50);
    check('panel stanja na računima', $('accountsOverviewPanel').style.display !== 'none' && /Smoke štednja/.test($('accountsOverview').textContent));
    await sleep(800); // animacija iznosa u sazetku
    const m = monthKey(new Date());
    // Stavke raspoređene na više meseci (npr. plata za 2 meseca) ulaze samo mesečnim delom
    const expSum = entries().filter(e => e.type === 'expense' && e.paid !== false).reduce((s, e) => s + BudzetCore.shareInMonth(e, m), 0);
    const incSum = entries().filter(e => e.type === 'income').reduce((s, e) => s + BudzetCore.shareInMonth(e, m), 0);
    check('prenos nije ni prihod ni rashod',
      $('totalExpense').textContent.replace(/\D/g, '') === String(Math.round(expSum)) && $('totalIncome').textContent.replace(/\D/g, '') === String(Math.round(incSum)),
      `${$('totalExpense').textContent} / ${$('totalIncome').textContent} vs ${expSum} / ${incSum}`);

    // Cilj vezan za racun stednje: uplata pravi prenos
    go('ciljevi');
    setVal('goalName', 'Smoke more'); setVal('goalTarget', '50000'); $('goalAccount').value = accs[1].id;
    $('goalForm').requestSubmit(); await sleep(80);
    const goal = JSON.parse(localStorage.getItem('budzet-ciljevi-v1')).find(g => g.name === 'Smoke more');
    const inp = document.querySelector(`.goal-add-input[data-goal="${goal.id}"]`);
    inp.value = '500';
    document.querySelector(`.goal-contribute .add[data-goal="${goal.id}"]`).click(); await sleep(80);
    check('uplata u cilj pravi prenos na štednju', entries().some(e => e.type === 'transfer' && e.goalId === goal.id && e.amount === 500 && e.toAccount === accs[1].id));

    // Budzet po kategoriji (spojeni limiti i koverte)
    go('kategorije');
    const limitInput = document.querySelector('.limit-input');
    const cat = limitInput.dataset.cat;
    limitInput.value = '20000'; limitInput.dispatchEvent(new Event('change', { bubbles: true })); await sleep(50);
    check('budžet kategorije sačuvan', JSON.parse(localStorage.getItem('budzet-limiti-v1'))[cat] === 20000);
    check('nema više posebnih "koverti"', !document.querySelector('.envelope-input'));
    go('pregled'); await sleep(50);
    check('panel budžeta na pregledu', $('envelopesPanel').style.display !== 'none' && $('envelopesList').textContent.includes(cat));

    // Strana valuta (ako je kursna lista dostupna)
    for (let i = 0; i < 30 && ![...$('expCurrency').options].some(o => o.value === 'EUR'); i++) await sleep(200);
    if ([...$('expCurrency').options].some(o => o.value === 'EUR')) {
      go('rashodi');
      setVal('expDesc', 'Smoke EUR'); $('expCurrency').value = 'EUR'; setVal('expAmount', '10');
      $('expenseForm').requestSubmit(); await sleep(80);
      const eur = entries().find(e => e.desc === 'Smoke EUR');
      check('rashod u EUR preračunat po kursu', eur && eur.currency === 'EUR' && eur.origAmount === 10 && eur.amount > 1000 && Math.abs(eur.amount - 10 * eur.rate) < 0.01, JSON.stringify(eur));
    } else passed.push('(kursna lista nije dostupna — provera EUR preskočena)');

    // Plata za vise meseci: 240.000 za 3 meseca od tekuceg -> po 80.000 u svakom
    go('pregled'); await sleep(800);
    const incBefore = Number($('totalIncome').textContent.replace(/\D/g, ''));
    const nextM = BudzetCore.addMonths(monthKey(new Date()), 1);
    const nextBefore = Math.round(entries().filter(e => e.type === 'income').reduce((s, e) => s + BudzetCore.shareInMonth(e, nextM), 0));
    const totalBal = () => Object.values(BudzetCore.accountBalances(JSON.parse(localStorage.getItem('budzet-racuni-v1')), entries(), e => e.paid !== false)).reduce((s, v) => s + v, 0);
    const balBeforeQ = totalBal();
    go('prihodi');
    setVal('incDesc', 'Smoke plata Q'); $('incCurrency').value = 'RSD'; setVal('incAmount', '240000');
    $('incSpreadToggle').checked = true; $('incSpreadToggle').dispatchEvent(new Event('change', { bubbles: true }));
    setVal('incSpreadMonths', '3');
    check('hint raspodele', /80\.000/.test($('incSpreadHint').textContent), $('incSpreadHint').textContent);
    $('incomeForm').requestSubmit(); await sleep(100);
    const q = entries().find(e => e.desc === 'Smoke plata Q');
    check('plata za više meseci sačuvana', q && q.spreadMonths === 3 && q.spreadStart === monthKey(new Date()), JSON.stringify(q));
    go('pregled'); await sleep(800);
    check('tekući mesec dobija trećinu (80.000)', Number($('totalIncome').textContent.replace(/\D/g, '')) === incBefore + 80000, `${incBefore} → ${$('totalIncome').textContent}`);
    check('lista pokazuje deo od celog iznosa', /deo od 240\.000/.test($('recentBody').textContent));
    $('periodNext').click(); await sleep(800);
    check('sledeći mesec dobija trećinu', Number($('totalIncome').textContent.replace(/\D/g, '')) === nextBefore + 80000, $('totalIncome').textContent);
    $('periodToday').click();
    check('račun dobija ceo iznos odmah', Math.round((totalBal() - balBeforeQ) * 100) === 24000000, `${balBeforeQ} → ${totalBal()}`);

    // Novi unos kroz prozor za unos: dugme u zaglavlju, forme sakrivene u desktop aplikaciji
    go('rashodi'); await sleep(50);
    check('dugme za novi unos u zaglavlju', $('newEntryBtn') && getComputedStyle($('newEntryBtn')).display !== 'none' && $('newEntryLabel').textContent === 'Novi rashod');
    check('forma rashoda zamenjena prozorom za unos', getComputedStyle($('expenseForm').closest('.panel')).display === 'none');
    go('prihodi'); await sleep(30);
    check('dugme prati ekran (Novi prihod)', $('newEntryLabel').textContent === 'Novi prihod');
    const qd = window.__desktopBridge.getQuickAddData();
    check('prozor za unos dobija račune i kurs', qd.accounts.length === 2 && qd.defaultAccountId === qd.accounts[0].id && Array.isArray(qd.expenseCats));
    const nQ = entries().length;
    const cats = qd.expenseCats;
    const rs = window.__desktopBridge.addEntry({ type: 'expense', desc: 'Smoke popout', amount: 3000, currency: 'RSD', category: cats[0], paid: false,
      accountId: qd.accounts[1].id, tags: 'Test, Popout', spreadMonths: 2, split: [{ category: cats[0], amount: 1000 }, { category: cats[1], amount: 2000 }] });
    const pop = entries().filter(e => e.desc === 'Smoke popout');
    check('unos iz prozora: podela, račun, oznake, raspodela, plaćeno', rs.ok && entries().length === nQ + 2 && pop.every(e => e.accountId === qd.accounts[1].id && e.paid === false && e.spreadMonths === 2 && e.tags.join() === 'test,popout') && pop.map(e => e.amount).sort().join() === '1000,2000', JSON.stringify(pop));
    const bad = window.__desktopBridge.addEntry({ type: 'income', desc: '', amount: 5 });
    check('prozor za unos odbija prazan opis', !bad.ok && /opis/i.test(bad.error));
    if (qd.rates.EUR) {
      const re = window.__desktopBridge.addEntry({ type: 'income', desc: 'Smoke EUR prihod', amount: 100, currency: 'EUR', category: qd.incomeCats[0] });
      const ee = entries().find(e => e.desc === 'Smoke EUR prihod');
      check('unos iz prozora u EUR', re.ok && ee.currency === 'EUR' && ee.origAmount === 100 && Math.abs(ee.amount - 100 * qd.rates.EUR) < 0.01);
    }

    // Dug u stranoj valuti: pretvara se u RSD pri unosu, original se cuva
    const eurRate = window.__desktopBridge.getQuickAddData().rates.EUR;
    if (eurRate) {
      go('dugovi'); await sleep(50);
      check('dug: izbor valute', !!$('debtCurrency') && [...$('debtCurrency').options].some(o => o.value === 'EUR'));
      setVal('debtPerson', 'Smoke evro dug'); setVal('debtAmount', '100'); setVal('debtCurrency', 'EUR');
      $('debtForm').requestSubmit(); await sleep(80);
      const dbt = JSON.parse(localStorage.getItem('budzet-dugovi-v1') || '[]').find(d => d.person === 'Smoke evro dug');
      check('dug u EUR sačuvan u RSD sa originalom', !!dbt && dbt.currency === 'EUR' && dbt.origAmount === 100 && Math.abs(dbt.amount - 100 * eurRate) < 0.01, JSON.stringify(dbt));
      const card = document.querySelector(`[data-debt-id="${dbt && dbt.id}"]`);
      check('dug prikazuje originalni iznos', !!card && /€/.test(card.textContent), card && card.textContent);
    }
    // Promena meseca: liste rashoda i prihoda prikazuju samo izabrani mesec
    const curM = monthKey(new Date()), prevM = window.BudzetCore.addMonths(curM, -1);
    go('rashodi'); await sleep(60);
    check('rashodi: filter prati tekući mesec', $('filterMonth').value === curM, $('filterMonth').value);
    $('periodPrev').click(); await sleep(80);
    const expRows = [...document.querySelectorAll('#expenseBody tr[data-row-id]')].map(tr => tr.dataset.rowId);
    const expPrev = entries().filter(e => e.type === 'expense' && e.date.startsWith(prevM)).map(e => e.id);
    check('rashodi: posle promene meseca samo taj mesec', $('filterMonth').value === prevM && expRows.length === expPrev.length && expRows.every(id => expPrev.includes(id)), `${$('filterMonth').value} ${expRows.length}/${expPrev.length}`);
    go('prihodi'); await sleep(60);
    const incRows = [...document.querySelectorAll('#incomeBody tr[data-row-id]')].map(tr => tr.dataset.rowId);
    const incPrev = entries().filter(e => e.type === 'income' && e.date.startsWith(prevM)).map(e => e.id);
    check('prihodi: posle promene meseca samo taj mesec', !!$('incFilterMonth') && $('incFilterMonth').value === prevM && incRows.length === incPrev.length, `${$('incFilterMonth') && $('incFilterMonth').value} ${incRows.length}/${incPrev.length}`);
    setVal('incFilterMonth', ''); await sleep(60);
    check('prihodi: ručno Svi meseci', document.querySelectorAll('#incomeBody tr[data-row-id]').length === entries().filter(e => e.type === 'income').length);
    $('periodToday').click(); await sleep(80);
    check('prihodi: povratak na tekući mesec vraća filter', $('incFilterMonth').value === curM);
    // Buduci mesec: ponavljajuce stavke koje tek dospevaju vide se u listi rashoda kao "ocekuje se"
    const upM = window.BudzetCore.addMonths(curM, 1);
    const recs = JSON.parse(localStorage.getItem('budzet-ponavljajuce-v1') || '[]');
    const expectUp = recs.filter(r => r.type !== 'income' && window.BudzetCore.isDueInMonth(r, upM) && !entries().some(e => e.id === 'rec-' + r.id + '-' + upM));
    go('rashodi'); $('periodNext').click(); await sleep(80);
    const upRows = document.querySelectorAll('#expenseUpcoming .upcoming-row');
    check('rashodi: očekivane ponavljajuće u budućem mesecu', upRows.length === expectUp.length && (expectUp.length === 0 || $('expenseUpcoming').style.display !== 'none'), `${upRows.length}/${expectUp.length}`);
    $('periodToday').click(); await sleep(60);
    $('periodPrev').click(); await sleep(60);
    check('rashodi: "izaberi sve" je mali kvadratić kao u redovima', getComputedStyle($('selectAllExpenses')).height === '17px', getComputedStyle($('selectAllExpenses')).height);
    check('rashodi: prošli mesec nema očekivanih', document.querySelectorAll('#expenseUpcoming .upcoming-row').length === 0);
    $('periodToday').click(); await sleep(60);

    // Automatsko plaćanje za propuštene mesece (aplikacija nije bila otvarana)
    const apKey = 'budzet-autoupis-poslednji-mesec-v1';
    check('autoupis: ključ poslednjeg meseca postoji', localStorage.getItem(apKey) === curM, localStorage.getItem(apKey));
    const apRec = JSON.parse(localStorage.getItem('budzet-ponavljajuce-v1') || '[]').find(r => r.desc === 'Smoke pretplata');
    if (apRec && typeof window.__processAutoPay === 'function') {
      const m1 = window.BudzetCore.addMonths(curM, -2), m2 = window.BudzetCore.addMonths(curM, -1);
      localStorage.setItem(apKey, window.BudzetCore.addMonths(curM, -3));
      window.__processAutoPay(); await sleep(60);
      const ids = entries().map(e => e.id);
      check('autoupis: propušteni meseci su upisani', ids.includes('rec-' + apRec.id + '-' + m1) && ids.includes('rec-' + apRec.id + '-' + m2), JSON.stringify([m1, m2]));
      check('autoupis: ključ je posle obrade tekući mesec', localStorage.getItem(apKey) === curM);
      window.__deleteEntriesById(['rec-' + apRec.id + '-' + m1, 'rec-' + apRec.id + '-' + m2]);
    }

    // Sigurnost: flush vraca rezultat, uvoz pogresnog Excela je odbijen, opcije kategorija zasticene od prevoda
    const fr = await window.__desktopBridge.flush();
    check('flush vraća rezultat čuvanja', !!fr && fr.ok === true, JSON.stringify(fr));
    if (typeof window.__workbookShapeError === 'function') {
      const badWb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(badWb, XLSX.utils.aoa_to_sheet([['Datum', 'Opis', 'Iznos']]), 'Sheet1');
      check('pogrešan Excel je odbijen', typeof window.__workbookShapeError(badWb) === 'string');
      check('naš Excel prolazi proveru', window.__workbookShapeError(window.__buildWorkbook()) === null);
    } else check('provera Excel fajla postoji', false);
    check('opcije kategorija imaju vrednost i nisu za prevod', [...$('expCategory').options].every(o => o.hasAttribute('value') && o.getAttribute('translate') === 'no'));

    // Cuvanje u fajl
    await window.__desktopData.saveNow();
    check('podaci sačuvani u fajl', !!window.__desktopData.status.savedAt && !window.__desktopData.status.error, JSON.stringify(window.__desktopData.status));
    // Spisak kopija
    const list = await window.desktop.backupList();
    check('spisak rezervnih kopija radi', Array.isArray(list));
  } catch (err) {
    failures.push('izuzetak: ' + (err && err.stack || err));
  }
  return { ok: failures.length === 0, passed, failures };
})();
