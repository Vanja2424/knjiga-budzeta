// Izvrsava se u stranici aplikacije (vidi test/smoke.js). Vraca { ok, passed, failures }.
(async () => {
  const passed = [], failures = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const $ = id => document.getElementById(id);
  const check = (name, cond, detail) => { (cond ? passed : failures).push(name + (cond || detail === undefined ? '' : ' — ' + detail)); };
  const entries = () => JSON.parse(localStorage.getItem('budzet-stavke-v2') || '[]');
  const setVal = (id, v) => { const el = $(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
  const monthKey = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  // Mali tekstualni PDF (lazni racun) — nijedan pravi racun ne ulazi u test
  function tinyPdf(lines){
    const esc = s => s.replace(/[\\()]/g, m => '\\' + m);
    const content = 'BT /F1 14 Tf 50 780 Td ' + lines.map((l, i) => (i ? '0 -20 Td ' : '') + '(' + esc(l) + ') Tj').join(' ') + ' ET';
    const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
    let out = '%PDF-1.4\n'; const offs = [];
    objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const x = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`;
    return new Blob([out], { type: 'application/pdf' });
  }
  try {
    check('SheetJS 0.20.3 učitan', window.XLSX && XLSX.version === '0.20.3', window.XLSX && XLSX.version);
    check('budzet-core.js učitan', !!window.BudzetCore);
    const pdfjs = await import('./pdf.min.mjs').catch(e => ({ err: String(e) }));
    check('pdf.js se učitava (.mjs)', !!(pdfjs && pdfjs.getDocument), pdfjs && pdfjs.err);
    check('desktop.bills postoji', !!(window.desktop && window.desktop.bills && window.desktop.bills.read));
    if ($('onboardingOverlay').classList.contains('show')) $('onboardingSkipBtn').click();

    // Svi ekrani se otvaraju
    const go = s => window.__showScreen(s);
    for (const s of ['pregled', 'rashodi', 'prihodi', 'racuni', 'pretraga', 'kategorije', 'ponavljajuce', 'ciljevi', 'dugovi', 'analiza', 'pitaj', 'rezije', 'izvestaj', 'uporedi', 'scenario', 'kursevi', 'nabavka', 'dokumenti', 'podesavanja']) {
      go(s); await sleep(60);
      check('ekran ' + s, $('screen-' + s).classList.contains('active') && document.querySelectorAll('.screen.active').length === 1);
    }
    check('glavni meni ima 9 stavki (Ponavljajuće je u Transakcijama, Dokumenti posle Nabavke)', document.querySelectorAll('nav.tabs button[data-group]').length === 9);
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

      if (typeof window.__revalueDebt === 'function') {
        const before = JSON.parse(localStorage.getItem('budzet-dugovi-v1')).find(d => d.person === 'Smoke evro dug');
        // simuliraj stari kurs: iznos kao da je unet po kursu 1% nizem
        window.__setDebtAmount(before.id, Math.round(before.origAmount * eurRate * 0.99 * 100) / 100); await sleep(40);
        check('dug EUR: prikaz današnje vrednosti', /≈/.test(document.querySelector(`[data-debt-id="${before.id}"]`).textContent));
        window.__revalueDebt(before.id); await sleep(40);
        const after = JSON.parse(localStorage.getItem('budzet-dugovi-v1')).find(d => d.id === before.id);
        check('dug EUR: preračun po današnjem kursu', Math.abs(after.amount - before.origAmount * eurRate) < 0.01);
      } else check('dug EUR: preračun postoji', false);
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
      // monthsToProcess sad obradjuje i sam kljuc poslednjeg meseca (ne samo od +1), pa je pri kljucu
      // cur-3 ocekivan i taj mesec, ne samo cur-2/cur-1.
      const m0 = window.BudzetCore.addMonths(curM, -3), m1 = window.BudzetCore.addMonths(curM, -2), m2 = window.BudzetCore.addMonths(curM, -1);
      localStorage.setItem(apKey, m0);
      window.__processAutoPay(); await sleep(60);
      const ids = entries().map(e => e.id);
      check('autoupis: propušteni meseci su upisani', ids.includes('rec-' + apRec.id + '-' + m0) && ids.includes('rec-' + apRec.id + '-' + m1) && ids.includes('rec-' + apRec.id + '-' + m2), JSON.stringify([m0, m1, m2]));
      check('autoupis: ključ je posle obrade tekući mesec', localStorage.getItem(apKey) === curM);
      window.__deleteEntriesById(['rec-' + apRec.id + '-' + m0, 'rec-' + apRec.id + '-' + m1, 'rec-' + apRec.id + '-' + m2]);
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

    // Plati sve zakasnele (radi osim prvog dana u mesecu, kad nista sa danom 1 nije zakasnelo)
    if (new Date().getDate() > 1) {
      go('ponavljajuce'); await sleep(50);
      setVal('recDesc', 'Smoke kasni'); setVal('recAmount', '321'); setVal('recDay', '1');
      $('recAutoPay').checked = false;
      $('recurringForm').requestSubmit(); await sleep(100);
      const lateRec = JSON.parse(localStorage.getItem('budzet-ponavljajuce-v1') || '[]').find(r => r.desc === 'Smoke kasni');
      const btn = $('payOverdueBtn');
      check('plati sve: dugme se vidi', !!btn && btn.style.display !== 'none' && /\(\d+\)/.test(btn.textContent), btn && btn.textContent);
      const res = window.__payOverdue({ ids: [lateRec.id] });
      const eid = 'rec-' + lateRec.id + '-' + curM;
      check('plati sve: izabrana stavka plaćena', res && entries().some(e => e.id === eid && e.amount === 321));
      $('undoBtn').click(); await sleep(80);
      check('plati sve: poništavanje vraća na neplaćeno', !entries().some(e => e.id === eid) && !(JSON.parse(localStorage.getItem('budzet-primenjeno-v1') || '{}')[curM] || []).includes(lateRec.id));
    }

    // Obavestenje vodi na stavku (i ne rusi se kad stavka vise ne postoji)
    const anyRec = JSON.parse(localStorage.getItem('budzet-ponavljajuce-v1') || '[]')[0];
    if (anyRec && typeof window.__openNotificationTarget === 'function') {
      go('pregled'); await sleep(40);
      window.__openNotificationTarget({ screen: 'ponavljajuce', rowId: anyRec.id }); await sleep(150);
      const row = document.querySelector(`#screen-ponavljajuce [data-row-id="${CSS.escape(anyRec.id)}"]`);
      check('obaveštenje otvara stavku', $('screen-ponavljajuce').classList.contains('active') && !!row && row.classList.contains('row-flash'));
      window.__openNotificationTarget({ screen: 'dugovi', rowId: 'nepostojeci-id' }); await sleep(150);
      check('obaveštenje za obrisanu stavku samo otvara ekran', $('screen-dugovi').classList.contains('active'));
    } else check('obaveštenje: hook postoji', false);

    // Rata duga: pravljenje, placanje smanjuje ostatak (stanje samo jednom), izmirenje -> until, brisanje rate -> ostatak nazad
    go('dugovi'); await sleep(40);
    setVal('debtPerson', 'Smoke rata'); setVal('debtAmount', '3000'); setVal('debtCurrency', 'RSD'); setVal('debtDirection', 'i_owe');
    $('debtForm').requestSubmit(); await sleep(80);
    const rd = JSON.parse(localStorage.getItem('budzet-dugovi-v1') || '[]').find(d => d.person === 'Smoke rata');
    const cat0 = window.__desktopBridge.getQuickAddData().expenseCats[0];
    const pendingBeforeInst = window.__pendingForMonth(curM).expense;
    const inst = rd && window.__createDebtInstallment(rd.id, { amount: 1000, day: 1, category: cat0 });
    check('rata: ponavljajuća stavka sa debtId', !!inst && inst.debtId === rd.id && inst.desc === 'Rata: Smoke rata');
    // Neplaćena rata ne sme da se doda i kao "Za plaćanje" stavka i kao deo ostatka duga (dvostruko računanje):
    // pre i posle pravljenja rate (nema uplate između), "Za plaćanje" mora ostati isto.
    check('rata: neplaćena rata se ne računa duplo u "Za plaćanje"', window.__pendingForMonth(curM).expense === pendingBeforeInst, JSON.stringify({ pendingBeforeInst, after: window.__pendingForMonth(curM).expense }));
    const balBefore = $('balanceSub').textContent;
    window.__markRecurringPaid(inst.id, 1000); await sleep(60);
    const rEntry = entries().find(e => e.id === 'rec-' + inst.id + '-' + curM);
    check('rata: plaćanje pravi rashod sa debtId', !!rEntry && rEntry.debtId === rd.id && rEntry.amount === 1000);
    check('rata: ostatak duga se smanjio', window.BudzetCore.debtPaid(JSON.parse(localStorage.getItem('budzet-dugovi-v1')).find(d => d.id === rd.id), entries()) === 1000);
    // Backup/Excel ne sme da izgubi debtId (Stavke sheet)
    if (typeof window.__buildWorkbook === 'function') {
      const wbStavke = window.__buildWorkbook();
      const wbEntryRow = XLSX.utils.sheet_to_json(wbStavke.Sheets['Stavke']).find(x => x.ID === rEntry.id);
      check('rata: Excel "Stavke" ima DugID', !!wbEntryRow && wbEntryRow.DugID === rd.id, JSON.stringify(wbEntryRow));
    }
    window.__deleteEntriesById([rEntry.id]); window.__markRecurringPaid(inst.id, 3000); await sleep(60);
    check('rata: izmiren dug -> until', JSON.parse(localStorage.getItem('budzet-ponavljajuce-v1')).find(r => r.id === inst.id).until === curM);
    // Backup/Excel ne sme da izgubi debtId/until (Ponavljajuce sheet) — rata sad ima oboje
    if (typeof window.__sanitizeImportedBackup === 'function') {
      const rawRecurring = JSON.parse(localStorage.getItem('budzet-ponavljajuce-v1'));
      const sanitized = window.__sanitizeImportedBackup({ entries: entries(), recurring: rawRecurring });
      const sInst = sanitized.recurring.find(r => r.id === inst.id);
      check('rata: sanitizeImportedBackup čuva debtId/until', !!sInst && sInst.debtId === rd.id && sInst.until === curM, JSON.stringify(sInst));
    }
    if (typeof window.__buildWorkbook === 'function') {
      const wbRata = window.__buildWorkbook();
      const wbRecRow = XLSX.utils.sheet_to_json(wbRata.Sheets['Ponavljajuce']).find(x => x.ID === inst.id);
      check('rata: Excel "Ponavljajuce" ima DugID/Do', !!wbRecRow && wbRecRow.DugID === rd.id && wbRecRow.Do === curM, JSON.stringify(wbRecRow));
    }
    window.__deleteEntriesById(['rec-' + inst.id + '-' + curM]); await sleep(60);
    check('rata: brisanje rate vraća ostatak i uklanja until', !JSON.parse(localStorage.getItem('budzet-ponavljajuce-v1')).find(r => r.id === inst.id).until);

    // Rata: markRecurringPaid ne sme da "prepuni" dug — ako je dug u međuvremenu izmiren drugim
    // putem (npr. ručna uplata), placanje rate ne sme ništa da napravi (vraća null).
    window.__setDebtAmount(rd.id, 0); await sleep(60);
    const beforeSettledCount = entries().length;
    const settledResult = window.__markRecurringPaid(inst.id, 500);
    check('rata: plaćanje rate na već izmiren dug ne pravi ništa', settledResult === null && entries().length === beforeSettledCount
      && !entries().some(e => e.id === 'rec-' + inst.id + '-' + curM),
      JSON.stringify({ settledResult, before: beforeSettledCount, after: entries().length }));
    window.__setDebtAmount(rd.id, 3000); await sleep(60);

    // Rata: brisanje ponavljajuće stavke NE sme da obriše već plaćene rate (istorija otplate duga) —
    // samo se uklanja sama stavka; plaćeni rashod ostaje i u entries i u debtPaid.
    window.__markRecurringPaid(inst.id, 1000); await sleep(60);
    const keptEntryId = 'rec-' + inst.id + '-' + curM;
    check('rata: rata ponovo plaćena (priprema za brisanje)', entries().some(e => e.id === keptEntryId));
    go('ponavljajuce'); await sleep(60);
    const instDelBtn = document.querySelector(`.recurring-item[data-row-id="${CSS.escape(inst.id)}"] .del-btn`);
    check('rata: dugme za brisanje rate postoji', !!instDelBtn);
    if (instDelBtn) {
      instDelBtn.click(); await sleep(280);
      check('rata: brisanje rate zadržava već plaćeni rashod', entries().some(e => e.id === keptEntryId));
      check('rata: brisanje rate ne menja otplaćeni iznos duga', window.BudzetCore.debtPaid(JSON.parse(localStorage.getItem('budzet-dugovi-v1')).find(d => d.id === rd.id), entries()) === 1000);
      check('rata: ponavljajuća stavka rate je uklonjena', !JSON.parse(localStorage.getItem('budzet-ponavljajuce-v1')).some(r => r.id === inst.id));
      check('rata: poruka o brisanju objašnjava da plaćene rate ostaju', ($('undoMessage').textContent || '').includes('Rata se briše'), $('undoMessage').textContent);
      $('undoBtn').click(); await sleep(80);
      check('rata: undo posle brisanja rate vraća ponavljajuću stavku', JSON.parse(localStorage.getItem('budzet-ponavljajuce-v1')).some(r => r.id === inst.id));
      check('rata: undo ne duplicira već zadržani plaćeni rashod', entries().filter(e => e.id === keptEntryId).length === 1);
      // Ručno unet iznos veći od ostatka se svodi na ostatak (ceo dug 3000 je opet otvoren)
      window.__deleteEntriesById([keptEntryId]); await sleep(60);
      window.__markRecurringPaid(inst.id, 999999); await sleep(60);
      const capped = entries().find(e => e.id === keptEntryId);
      check('rata: veći iznos od ostatka se svodi na ostatak', !!capped && capped.amount === 3000, capped && capped.amount);
      window.__deleteEntriesById([keptEntryId]); await sleep(60);
      // Promena smera duga odmah zaustavlja ratu, a vraćanje smera je nastavlja
      go('dugovi'); await sleep(60);
      const dirEl = document.querySelector(`[data-toggle-dir="${CSS.escape(rd.id)}"]`);
      if (dirEl) {
        dirEl.click(); await sleep(80);
        check('rata: promena smera duga odmah zaustavlja ratu', !!JSON.parse(localStorage.getItem('budzet-ponavljajuce-v1')).find(r => r.id === inst.id).until);
        document.querySelector(`[data-toggle-dir="${CSS.escape(rd.id)}"]`).click(); await sleep(80);
        check('rata: vraćanje smera nastavlja ratu', !JSON.parse(localStorage.getItem('budzet-ponavljajuce-v1')).find(r => r.id === inst.id).until);
      } else check('rata: dugme za smer duga postoji', false);
    }

    // Paket 3: kupovina pamti cene po stvari; Analiza pokazuje kupljene stvari; Budzet pokazuje "na listi"
    const catsP3 = window.__desktopBridge.getQuickAddData().expenseCats;
    const shP3 = window.__shopping();
    shP3.items.push({ id: 'p3-a', name: 'P3 mleko', section: 'Mlečni', store: '', category: catsP3[0], price: 150, qty: '', needed: true, checked: true },
                    { id: 'p3-b', name: 'P3 hleb', section: 'Pekara', store: '', category: catsP3[0], price: 50, qty: '', needed: true, checked: true },
                    { id: 'p3-c', name: 'P3 jogurt', section: 'Mlečni', store: '', category: catsP3[0], price: 120, qty: '', needed: true, checked: false });
    window.__saveShopping(); await sleep(40);
    go('kategorije'); await sleep(60);
    check('budžet: "na listi" za kategoriju sa stavkama', [...document.querySelectorAll('#catList li')].some(li => li.textContent.includes(catsP3[0]) && /na listi/.test(li.textContent)));
    window.__finishPurchase({ total: 400 }); await sleep(60);
    const p3e = entries().find(e => (e.items || []).includes('P3 mleko'));
    check('kupovina pamti cene po stvari', !!p3e && JSON.stringify(p3e.itemPrices) === JSON.stringify([150, 50]), p3e && JSON.stringify(p3e.itemPrices));
    go('analiza'); await sleep(80);
    const catHead = [...document.querySelectorAll('#analizaWhereList .analiza-cat-head')].find(b => b.dataset.cat === catsP3[0]);
    if (catHead) { if (!catHead.closest('.analiza-cat').classList.contains('open')) catHead.click(); await sleep(60); }
    check('analiza: kupljene stvari', /P3 mleko/.test($('analizaWhereList').textContent) && /×1/.test($('analizaWhereList').textContent));
    window.__deleteEntriesById([p3e.id]);
    window.__shopping().items = window.__shopping().items.filter(i => !/^p3-/.test(i.id)); window.__saveShopping();

    // Paket 3: predlozi "Vreme je da kupis" posle tri kupovine iste stvari
    const cat3 = window.__desktopBridge.getQuickAddData().expenseCats[0];
    const dAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
    const rsIds = [];
    for (const n of [30, 20, 10]) {
      const r = window.__desktopBridge.addEntry({ type: 'expense', desc: 'P3 radnja', amount: 100, currency: 'RSD', category: cat3, date: dAgo(n) });
      const e = entries().filter(x => x.desc === 'P3 radnja' && x.date === dAgo(n)).pop();
      if (r.ok && e) { window.__setEntryItems(e.id, ['P3 kafa (1 kom)']); rsIds.push(e.id); }
    }
    go('nabavka'); await sleep(80);
    const sug = [...document.querySelectorAll('#shopSuggest .shop-suggest-row')].find(r => /P3 kafa/.test(r.textContent));
    check('nabavka: predlog posle tri kupovine', !!sug, $('shopSuggest') && $('shopSuggest').textContent);
    if (sug) {
      sug.querySelector('.shop-suggest-add').click(); await sleep(60);
      const it = window.BudzetCore.findShoppingItem(window.__shopping().items, 'P3 kafa');
      check('nabavka: "Dodaj" stavlja stvar na listu', !!it && it.needed === true);
      it.needed = false; window.__saveShopping(); await sleep(60);
      const sug2 = [...document.querySelectorAll('#shopSuggest .shop-suggest-row')].find(r => /P3 kafa/.test(r.textContent));
      sug2 && sug2.querySelector('.shop-suggest-hide').click(); await sleep(60);
      check('nabavka: "✕" sakriva predlog', ![...document.querySelectorAll('#shopSuggest .shop-suggest-row')].some(r => /P3 kafa/.test(r.textContent)));
      window.__shopping().items = window.__shopping().items.filter(i => i.id !== it.id); window.__saveShopping();
    }
    window.__deleteEntriesById(rsIds);

    // Paket 4: mesec iza tebe (kartica na Pregledu)
    {
      const cur = monthKey(new Date());
      const prevM = window.BudzetCore.addMonths(cur, -1);
      const revCat = window.__desktopBridge.getQuickAddData().expenseCats[0];
      window.__desktopBridge.addEntry({ type: 'expense', desc: 'P4 pregled', amount: 1234, currency: 'RSD', category: revCat, date: prevM + '-05' });
      const revId = (entries().find(e => e.desc === 'P4 pregled') || {}).id;
      localStorage.removeItem('budzet-mesecni-pregled-zatvoren-v1');
      go('pregled'); await sleep(60);
      window.__monthReview(cur + '-03'); await sleep(40);
      check('pregled meseca: kartica se prikazuje prvih dana meseca', $('monthReviewPanel').style.display !== 'none' && $('monthReviewPanel').dataset.month === prevM, $('monthReviewPanel').style.display);
      check('pregled meseca: prihodi/rashodi/razlika', /Rashodi/.test($('monthReviewBody').textContent) && $('monthReviewActions').querySelector('#monthReviewAnaliza') != null, $('monthReviewBody').textContent.slice(0, 200));
      $('monthReviewAnaliza').click(); await sleep(80);
      check('pregled meseca: Detaljno otvara Analizu za taj mesec', $('screen-analiza').classList.contains('active') && $('analizaMonth').value === prevM, $('analizaMonth').value);
      go('pregled'); await sleep(60);
      window.__monthReview(cur + '-03'); await sleep(40);
      $('monthReviewClose').click(); await sleep(60);
      check('pregled meseca: Zatvori sakriva karticu', $('monthReviewPanel').style.display === 'none' && localStorage.getItem('budzet-mesecni-pregled-zatvoren-v1') === prevM);
      window.__monthReview(cur + '-11'); await sleep(40);
      localStorage.removeItem('budzet-mesecni-pregled-zatvoren-v1');
      window.__monthReview(cur + '-11'); await sleep(40);
      check('pregled meseca: posle 10. u mesecu se ne prikazuje', $('monthReviewPanel').style.display === 'none');
      window.__monthReview(null);
      if (revId) window.__deleteEntriesById([revId]);
      localStorage.setItem('budzet-mesecni-pregled-zatvoren-v1', prevM);
    }

    // Paket 4: mesecna uplata u cilj — "sta ako" pravi plan, obrada uplacuje propustene mesece, Ponisti vraca
    {
      const cur = monthKey(new Date());
      const gs = window.__goals();
      const g = { id: 'p4-goal', name: 'P4 cilj', target: 1000000, current: 0, deadline: '' };
      gs.push(g); window.__saveGoals(); await sleep(60);
      // bar 2 meseca promenljivih troskova da "sta ako" ima prosek
      const wiCat = window.__desktopBridge.getQuickAddData().expenseCats[0];
      for (const k of [-1, -2]) window.__desktopBridge.addEntry({ type: 'expense', desc: 'P4 šta ako', amount: 20000, currency: 'RSD', category: wiCat, date: window.BudzetCore.addMonths(cur, k) + '-07' });
      const wiIds = entries().filter(e => e.desc === 'P4 šta ako').map(e => e.id);
      go('analiza'); await sleep(80);
      setVal('analizaWhatIf', '20'); await sleep(40);
      const planBtn = $('analizaWhatIfPlan');
      if (planBtn) {
        planBtn.click(); await sleep(60);
        const sel = document.querySelector('#editModalFields [data-field="goalName"]');
        sel.value = 'P4 cilj';
        document.querySelector('#editModalFields [data-field="amount"]').value = '2500';
        $('editModalSave').click(); await sleep(80);
        const gg = window.__goals().find(x => x.id === 'p4-goal');
        check('šta ako: plan mesečne uplate od sledećeg meseca', !!gg.monthly && gg.monthly.amount === 2500 && gg.monthly.since === window.BudzetCore.addMonths(cur, 1), JSON.stringify(gg.monthly));
      } else check('šta ako: dugme za mesečnu uplatu postoji', /Napravi cilj/.test($('analizaWhatIfAction').textContent) || false, $('analizaWhatIfAction').innerHTML + ' | ' + $('analizaWhatIfResult').textContent);
      // plan koji je poceo pre dva meseca: obrada uplacuje 2-3 meseca
      const gg = window.__goals().find(x => x.id === 'p4-goal');
      gg.monthly = { amount: 1000, day: 1, since: window.BudzetCore.addMonths(cur, -2) };
      window.__saveGoals(); await sleep(40);
      // zaklonjen prozor (Windows: visibilityState 'hidden') ne sme da odlozi poruku u testu — ranije povremeni pad opoziva
      Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true });
      let did;
      try { did = window.__processGoalPlans(); } finally { delete document.visibilityState; }
      await sleep(60);
      const after = window.__goals().find(x => x.id === 'p4-goal');
      check('mesečna uplata: propušteni meseci se uplaćuju', did && after.current === 3000 && after.monthly.last === cur, after.current + ' ' + after.monthly.last);
      check('mesečna uplata: ponovna obrada ne uplaćuje dvaput', !window.__processGoalPlans());
      check('mesečna uplata: poruka sa opozivom je odmah na vrhu', /Automatski uplaćeno u ciljeve/.test($('undoMessage').textContent), $('undoMessage').textContent + ' / ' + document.visibilityState);
      window.__undoTop(); await sleep(80);
      const undone = window.__goals().find(x => x.id === 'p4-goal');
      check('mesečna uplata: Poništi vraća iznos i poslednji mesec', undone.current === 0 && !undone.monthly.last, undone.current + ' ' + undone.monthly.last);
      go('ciljevi'); await sleep(60);
      check('cilj: kartica pokazuje mesečnu uplatu', /Mesečna uplata: 1\.000 RSD/.test($('goalsList').textContent), $('goalsList').textContent.slice(0, 300));
      const rm = document.querySelector('.goal-plan-remove[data-id="p4-goal"]');
      rm && rm.click(); await sleep(60);
      check('cilj: Ukloni briše mesečnu uplatu', !window.__goals().find(x => x.id === 'p4-goal').monthly);
      const idx = window.__goals().findIndex(x => x.id === 'p4-goal');
      window.__goals().splice(idx, 1); window.__saveGoals(); await sleep(40);
      window.__deleteEntriesById(wiIds);
    }

    // Paket 5: tastatura i izgled
    {
      const key = (k, opts = {}) => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...opts }));
      window.__goals().push({ id: 'p5-goal', name: 'P5 cilj', target: 1000, current: 0, deadline: '' }); window.__saveGoals();
      go('ciljevi'); await sleep(80);
      const gDel = document.querySelector('.goal-card[data-goal-id="p5-goal"] .del-btn');
      gDel && gDel.click(); await sleep(400);
      if ($('dialogOverlay').classList.contains('show')) { $('dialogOk').click(); await sleep(400); }
      check('Ctrl+Z: cilj je obrisan', !window.__goals().some(g => g.id === 'p5-goal'));
      key('z', { ctrlKey: true, code: 'KeyZ' }); await sleep(80);
      check('Ctrl+Z vraća obrisano', window.__goals().some(g => g.id === 'p5-goal'));
      window.__goals().splice(window.__goals().findIndex(g => g.id === 'p5-goal'), 1); window.__saveGoals(); await sleep(40);
      key('?', { shiftKey: true }); await sleep(80);
      check('? otvara prečice na tastaturi', $('dialogOverlay').classList.contains('show') && /(Ctrl|⌘)\s*\+\s*Z/.test($('dialogBody').textContent), $('dialogBody').textContent.slice(0, 120));
      // Mac: tasteri se prikazuju kao ⌘ ⌥ ⇧ (ne Ctrl)
      if (document.documentElement.classList.contains('mac')) check('Mac: prečice sa ⌘', /⌘/.test($('dialogBody').textContent) && !/Ctrl/.test($('dialogBody').textContent) && /⌘N/.test(($('newEntryBtn') || {}).title || ''), ($('newEntryBtn') || {}).title);
      key('Escape'); await sleep(80);
      check('Esc zatvara prečice', !$('dialogOverlay').classList.contains('show'));
      check('spisak prečica: Ctrl+1…7', /1\s*…\s*7/.test(document.querySelector('#desktopShortcuts .shortcut-grid').textContent));
      go('rashodi'); await sleep(80);
      const noLabel = [...document.querySelectorAll('button[title]')].filter(b => b.textContent.trim().length <= 2 && !b.getAttribute('aria-label'));
      check('dugmad sa ikonicom imaju aria-label', noLabel.length === 0, noLabel.slice(0, 3).map(b => b.outerHTML.slice(0, 80)).join(' | '));
      check('Rashodi: kolona "Plaćeno" ima naziv', /Plaćeno/.test(document.querySelector('#screen-rashodi thead').textContent));
      go('analiza'); await sleep(80);
      const twoMonth = ($('screen-analiza').textContent.match(/bar 2 meseca podataka/g) || []).length;
      check('Analiza: poruka o 2 meseca najviše jednom', twoMonth <= 1, twoMonth);
      go('pregled'); await sleep(60);
      check('Pregled: "Počni ovde" skriven kad ima podataka', $('pregledStart').style.display === 'none' && !$('screen-pregled').classList.contains('pregled-empty'));
      check('Excel: status oblika fajla postoji', typeof window.__excelShapeStatus === 'function');
    }

    // Paket 6: Ponavljajuce u Transakcijama, uvoz vise izvoda, kopija van racunara
    {
      go('ponavljajuce'); await sleep(60);
      check('Ponavljajuće: podkartica u Transakcijama', !document.querySelector('nav.tabs button[data-group="ponavljajuce"]')
        && document.querySelector('nav.tabs button.active').dataset.group === 'transakcije'
        && !!$('subtabs').querySelector('button[data-screen="ponavljajuce"].active'));
      const cur = monthKey(new Date());
      const m1 = window.BudzetCore.addMonths(cur, -30), m2 = window.BudzetCore.addMonths(cur, -29);
      const csvA = 'Datum;Opis;Iznos\n' + m1 + '-05;P6 kafa;-250,00\n' + m1 + '-28;P6 market;-1.500,00\n';
      const csvB = 'Datum;Opis;Iznos\n' + m1 + '-28;P6 market;-1.500,00\n' + m2 + '-03;P6 plata;50.000,00\n';
      const before = entries().length;
      const p = window.__runImportText([{ name: 'a.csv', text: csvA }, { name: 'b.csv', text: csvB }]);
      await sleep(400);
      check('uvoz: pregled više izvoda', $('dialogOverlay').classList.contains('show') && /2 fajlova/.test($('dialogBody').textContent), $('dialogBody').textContent.slice(0, 200));
      $('dialogOk').click(); await p; await sleep(100);
      const added = entries().filter(e => /^P6 /.test(e.desc));
      check('uvoz: preklopljeni izvodi ne dupliraju stavku', added.length === 3 && entries().length === before + 3, added.map(e => e.desc).join(','));
      // slicna stavka: isti iznos, dan kasnije, drugi opis -> podrazumevano se ne uvozi
      const p2 = window.__runImportText([{ name: 'c.csv', text: 'Datum;Opis;Iznos\n' + m1 + '-06;KAFIC 123;-250,00\n' + m1 + '-20;P6 novo;-99,00\n' }]);
      await sleep(400);
      const nearBox = document.querySelector('#dialogBody [data-near]');
      check('uvoz: slična stavka je ponuđena, nečekirana', !!nearBox && !nearBox.checked, $('dialogBody').textContent.slice(0, 200));
      $('dialogOk').click(); await p2; await sleep(100);
      check('uvoz: slična se ne uvozi bez čekiranja', !entries().some(e => e.desc === 'KAFIC 123') && entries().some(e => e.desc === 'P6 novo'));
      window.__deleteEntriesById(entries().filter(e => /^P6 /.test(e.desc)).map(e => e.id)); await sleep(40);
      go('podesavanja'); await sleep(80);
      check('kopija van računara: podešavanje postoji', !!$('extraBackupGroup') && $('extraBackupGroup').style.display !== 'none' && /Isključeno/.test($('extraBackupStatus').textContent), $('extraBackupStatus').textContent);
    }

    // IPS QR: uplatnica -> nova ponavljajuca stavka -> QR kod (citanje nazad) -> Placeno
    {
      go('ponavljajuce'); await sleep(60);
      const slip = 'K:PR|V:01|C:1|R:845000000040484987|N:JP EPS BEOGRAD|I:RSD3596,13|SF:189|S:Uplata po racunu|RO:97163220000111111111000';
      check('IPS: uplatnica popunjava formu', window.__fillRecFromSlipText(slip) && $('recDesc').value === 'JP EPS BEOGRAD' && $('recAmount').value === '3596.13');
      setVal('recDesc', 'P7 struja'); setVal('recDay', String(new Date().getDate()));
      $('recurringForm').requestSubmit(); await sleep(120);
      const rec = JSON.parse(localStorage.getItem('budzet-ponavljajuce-v1') || '[]').find(r => r.desc === 'P7 struja');
      check('IPS: stavka čuva podatke za plaćanje', !!rec && rec.payee && rec.payee.account === '845000000040484987' && rec.payee.reference === '163220000111111111000', JSON.stringify(rec && rec.payee));
      const btn = rec && document.querySelector(`[data-ips="${CSS.escape(rec.id)}"]`);
      check('IPS: dugme QR u redu', !!btn && btn.classList.contains('has'));
      if (btn) {
        btn.click(); await sleep(120);
        const text = $('ipsQr').dataset.text;
        check('IPS: prozor sa kodom', $('ipsOverlay').classList.contains('show') && !!$('ipsQr').querySelector('svg') && text === 'K:PR|V:01|C:1|R:845000000040484987|N:JP EPS BEOGRAD|I:RSD3596,00|SF:189|S:Uplata po racunu|RO:97163220000111111111000', text);
        // Nacrtani kod se cita nazad (jsQR) — isti tekst
        const svg = $('ipsQr').querySelector('svg').outerHTML;
        const img = new Image();
        const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
        await new Promise(r => { img.onload = r; img.onerror = r; img.src = url; });
        const cv = document.createElement('canvas'); cv.width = 400; cv.height = 400;
        const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 400, 400); ctx.drawImage(img, 0, 0, 400, 400);
        const back = jsQR(ctx.getImageData(0, 0, 400, 400).data, 400, 400);
        check('IPS: nacrtan QR se čita nazad isto', !!back && back.data === text, back && back.data);
        setVal('ipsAmount', '1234.5'); await sleep(40);
        check('IPS: promena iznosa menja kod', /I:RSD1234,50/.test($('ipsQr').dataset.text));
        $('ipsEditBtn').click(); await sleep(40);
        setVal('ipsAccount', '845000000040484988');
        $('ipsPrimary').click(); await sleep(40);
        check('IPS: pogrešan račun se ne čuva', /Kontrolni broj/.test($('ipsProblems').textContent) && JSON.parse(localStorage.getItem('budzet-ponavljajuce-v1')).find(r => r.id === rec.id).payee.account === '845000000040484987');
        setVal('ipsAccount', '845-0000000404849-87');
        $('ipsPrimary').click(); await sleep(60);
        check('IPS: posle čuvanja nazad na kod', $('ipsPay').style.display !== 'none' && !!$('ipsQr').querySelector('svg'));
        setVal('ipsAmount', '3600');
        $('ipsPrimary').click(); await sleep(150);
        const paidEntry = entries().find(e => e.id === 'rec-' + rec.id + '-' + monthKey(new Date()));
        check('IPS: Plaćeno upisuje rashod sa iznosom', !$('ipsOverlay').classList.contains('show') && !!paidEntry && paidEntry.amount === 3600, JSON.stringify(paidEntry));
        if (paidEntry) window.__deleteEntriesById([paidEntry.id]);
      }
      if (rec) {
        const del = document.querySelector(`.recurring-item[data-row-id="${CSS.escape(rec.id)}"] .del-btn`);
        del && del.click(); await sleep(400);
        if ($('dialogOverlay').classList.contains('show')) { $('dialogOk').click(); await sleep(400); }
      }
    }

    // ---- Kucni racuni: fajl -> citanje (lazni Groq) -> potvrda -> cuvanje ----
    check('kućni računi: stanje postoji', typeof window.__bills === 'function');
    if (typeof window.__bills === 'function') {
      const B = () => window.__bills();
      window.__ensureBillDefaults();
      const stan = B().locations[0];
      const struja = B().billTypes.find(x => x.locationId === stan.id && x.name === 'Struja');
      check('kućni računi: podrazumevane vrste', !!struja && struja.metrics.length === 2);
      const pdf = tinyPdf(['JP EPS Snabdevanje', 'Obracunski period 01.01.2025 - 31.01.2025', 'Visa tarifa 215 kWh', 'Niza tarifa 154 kWh', 'Ukupno za uplatu 4.456,16']);
      const pdfFile = new File([pdf], 'eps-januar.pdf', { type: 'application/pdf' });
      let sent = null;
      window.__fakeBillReading = req => { sent = req; return { ok: true, content: '```json\n' + JSON.stringify({ locationId: stan.id, billTypeId: struja.id, month: '2025-01', amount: '4.456,16', values: { m1: 215, m2: 154 }, payee: { name: 'JP EPS Snabdevanje', account: '160000000000000111' }, confidence: { m2: 'low' } }) + '\n```' }; };
      const done = window.__addBillFiles([pdfFile]);
      await sleep(2500);
      check('kućni računi: AI dobija tekst PDF-a i sliku strane', !!sent && /Ukupno za uplatu/.test(sent.text) && sent.images.length === 1 && /^data:image\/jpeg/.test(sent.images[0]), sent && JSON.stringify({ t: sent.text.slice(0, 80), n: sent.images.length }));
      check('kućni računi: prozor za potvrdu otvoren', $('billOverlay').classList.contains('show'));
      check('kućni računi: iznos popunjen', $('billAmount').value === '4456.16', $('billAmount').value);
      const m2 = document.querySelector('#billMetrics input[data-key="m2"]');
      check('kućni računi: nesigurno polje žuto', !!m2 && m2.classList.contains('bill-low'));
      $('billSavePaid').click(); await done; await sleep(200);
      const saved = B().bills.find(b => b.billTypeId === struja.id && b.month === '2025-01');
      check('kućni računi: sačuvan sa prilogom', !!saved && !!saved.file && saved.values.m1 === 215, JSON.stringify(saved));
      check('kućni računi: rashod napravljen', !!saved && entries().some(e => e.id === saved.entryId && e.amount === 4456.16));
      go('rezije'); await sleep(80);
      if ($('rezijeYear')) { $('rezijeYear').value = '2025'; $('rezijeYear').dispatchEvent(new Event('change')); await sleep(80); }
      check('kućni računi: ćelija u tabeli', !!(saved && document.querySelector(`#rezijeTable td[data-bill-ids*="${saved.id}"]`)));
      // Duplikat
      window.__fakeBillReading = () => ({ ok: true, content: JSON.stringify({ locationId: stan.id, billTypeId: struja.id, month: '2025-01', amount: 100 }) });
      const d2 = window.__addBillFiles([new File([pdf], 'eps2.pdf', { type: 'application/pdf' })]); await sleep(2000);
      check('kućni računi: duplikat prepoznat', $('billDupRow').style.display !== 'none');
      $('billCancel').click(); await d2;
      // Excel: primalac racuna prezivi izvoz i ponovno citanje
      if (saved && window.__billsFromWorkbook) {
        const rt = window.__billsFromWorkbook(window.__buildWorkbook());
        const rb = rt && rt.bills.find(b => b.id === saved.id);
        check('Excel: primalac računa se čuva', !!rb && rb.payee && rb.payee.name === 'JP EPS Snabdevanje' && rb.payee.account === '160000000000000111', JSON.stringify(rb));
      } else check('Excel: hook za čitanje računa', false);
      // Zamena bez novog fajla (rucni unos) ne sme da baci postojeci prilog
      if (saved && window.__openBillReview) {
        const mp = window.__openBillReview({ typeId: struja.id, month: '2025-01' }); await sleep(100);
        setVal('billAmount', '4460');
        $('billSavePaid').click(); await mp; await sleep(150);
        const after = B().bills.find(b => b.id === saved.id);
        const opened = after && after.file ? await window.desktop.bills.openFile(after.file) : { ok: false };
        check('kućni računi: zamena bez fajla čuva prilog', !!after && after.file === saved.file && opened.ok === true && after.amount === 4460, JSON.stringify({ after, opened }));
      } else check('kućni računi: hook za ručni unos', false);
      // Ostecen PDF -> poruka, rucni unos i dalje moguc
      window.__fakeBillReading = null;
      const d3 = window.__addBillFiles([new File([new Uint8Array([1, 2, 3])], 'lose.pdf', { type: 'application/pdf' })]); await sleep(1500);
      check('kućni računi: oštećen PDF -> poruka', /PDF ne može da se otvori/.test($('billStatus').textContent), $('billStatus').textContent);
      $('billCancel').click(); await d3;
      // Valuta racuna = valuta lokacije; bez kursa se ne cuva nista
      const nBills = B().bills.length, nEntries = entries().length;
      const savedRates = window.__fxRates(); window.__setFxRate('BAM', undefined); stan.currency = 'BAM';
      window.__fakeBillReading = () => ({ ok: true, content: JSON.stringify({ billTypeId: struja.id, month: '2025-05', amount: 10 }) });
      const d4 = window.__addBillFiles([pdfFile]); await sleep(2000);
      $('billSavePaid').click(); await sleep(300);
      check('kućni računi: bez kursa se ne čuva', B().bills.length === nBills && entries().length === nEntries && /Kurs za BAM/.test($('billStatus').textContent), $('billStatus').textContent);
      $('billCancel').click(); await d4; window.__setFxRate('BAM', savedRates.BAM); stan.currency = 'RSD';
      // Mesec rashoda odvojen od obracunskog meseca
      {
        const nextM = monthKey(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1));
        window.__fakeBillReading = () => ({ ok: true, content: JSON.stringify({ locationId: stan.id, billTypeId: struja.id, month: '2025-06', amount: 1234 }) });
        const dm = window.__addBillFiles([pdfFile]); await sleep(2000);
        check('mesec rashoda: polje postoji, podrazumevano tekući mesec', !!$('billExpMonth') && $('billExpMonth').value === monthKey(new Date()), $('billExpMonth') && $('billExpMonth').value);
        if ($('billExpMonth')) { $('billExpMonth').value = nextM; $('billExpMonth').dispatchEvent(new Event('change')); }
        $('billSavePaid').click(); await dm; await sleep(150);
        const mb = B().bills.find(b => b.billTypeId === struja.id && b.month === '2025-06');
        const me = mb && entries().find(e => e.id === mb.entryId);
        check('mesec rashoda: račun ostaje pod obračunskim mesecom, rashod u izabranom', !!mb && mb.expenseMonth === nextM && !!me && me.date.slice(0, 7) === nextM, JSON.stringify({ mb, me }));
        // brisanje iz prozora za izmenu
        if (mb && window.__openBillReview) {
          const em = window.__openBillReview({ bill: mb }); await sleep(100);
          check('brisanje: dugme u prozoru za izmenu', !!$('billDelete') && $('billDelete').style.display !== 'none');
          if ($('billDelete')) { $('billDelete').click(); await sleep(150); if ($('dialogOverlay').classList.contains('show')) { $('dialogOk').click(); await sleep(200); } }
          await Promise.race([em, sleep(300)]);
          check('brisanje: račun obrisan iz prozora', !B().bills.some(b => b.id === mb.id) && !$('billOverlay').classList.contains('show'));
          if (me) window.__deleteEntriesById([me.id]);
        }
      }
      // Veza sa ponavljajucom: "za placanje" -> zamena -> "Plati" nudi iznos sa racuna, jedan rashod
      const curM = monthKey(new Date());
      const prevM = monthKey(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1));
      go('ponavljajuce'); await sleep(50);
      setVal('recDesc', 'Smoke EPS Struja'); setVal('recAmount', '3000'); setVal('recDay', '28');
      $('recCategory').value = struja.category; $('recAutoPay').checked = false;
      $('recurringForm').requestSubmit(); await sleep(100);
      const epsRec = JSON.parse(localStorage.getItem('budzet-ponavljajuce-v1') || '[]').find(r => r.desc === 'Smoke EPS Struja');
      check('veza: ponavljajuća napravljena', !!epsRec && epsRec.category === struja.category, JSON.stringify(epsRec));
      if (epsRec) {
        const nE = entries().length;
        window.__fakeBillReading = () => ({ ok: true, content: JSON.stringify({ locationId: stan.id, billTypeId: struja.id, month: prevM, amount: 4456.16 }) });
        const l1 = window.__addBillFiles([pdfFile]); await sleep(2000);
        check('veza: nudi ponavljajuću', $('billRecRow').style.display !== 'none' && $('billLinkRec').checked);
        $('billSavePending').click(); await l1; await sleep(150);
        const lb = B().bills.find(b => b.recurringId === epsRec.id);
        check('veza: račun vezan, bez rashoda', !!lb && lb.recurringId === epsRec.id && lb.month === prevM && lb.expenseMonth === curM && !lb.entryId && entries().length === nE, JSON.stringify(lb));
        window.__fakeBillReading = () => ({ ok: true, content: JSON.stringify({ locationId: stan.id, billTypeId: struja.id, month: prevM, amount: 4500 }) });
        const l2 = window.__addBillFiles([pdfFile]); await sleep(2000);
        $('billSavePending').click(); await l2; await sleep(150);
        const lb2 = B().bills.find(b => b.recurringId === epsRec.id);
        check('veza: zamena ne pravi drugi rashod', !!lb2 && lb2.amount === 4500 && lb2.recurringId === epsRec.id && entries().length === nE, JSON.stringify({ lb2, n: entries().length - nE }));
        go('ponavljajuce'); await sleep(80);
        const cb = document.querySelector(`input[type="checkbox"][data-id="${epsRec.id}"]`);
        if (cb) { cb.checked = true; cb.dispatchEvent(new Event('change')); await sleep(100); }
        check('veza: Plati nudi iznos sa računa', !!$('edit-field-amount') && $('edit-field-amount').value === '4500', $('edit-field-amount') && $('edit-field-amount').value);
        if ($('editModalOverlay').classList.contains('show')) { $('editModalSave').click(); await sleep(150); }
        const paidE = entries().find(e => e.id === 'rec-' + epsRec.id + '-' + curM);
        const lb3 = lb2 && B().bills.find(b => b.id === lb2.id);
        check('veza: plaćeno iznosom sa računa, jedan rashod', !!paidE && paidE.amount === 4500 && entries().length === nE + 1 && !!lb3 && lb3.entryId === paidE.id, JSON.stringify({ paidE, n: entries().length - nE, lb3 }));
        if (lb2) window.__deleteBill(lb2.id, { confirm: false });
        if (paidE) window.__deleteEntriesById([paidE.id]);
        go('ponavljajuce'); await sleep(80);
        const delR = document.querySelector(`.recurring-item[data-row-id="${CSS.escape(epsRec.id)}"] .del-btn`);
        if (delR) { delR.click(); await sleep(400); if ($('dialogOverlay').classList.contains('show')) { $('dialogOk').click(); await sleep(400); } }
      }
      // Brisanje i Ctrl+Z
      if (saved) {
        window.__deleteBill(saved.id, { confirm: false }); await sleep(100);
        check('kućni računi: obrisan', !B().bills.some(b => b.id === saved.id));
        window.__undoTop(); await sleep(150);
        check('kućni računi: vraćen sa Ctrl+Z', B().bills.some(b => b.id === saved.id));
        window.__deleteBill(saved.id, { confirm: false });
        window.__deleteEntriesById([saved.entryId]);
      }
      window.__fakeBillReading = null;
    }

    // Kucni racuni: ekran i uvoz godisnje tabele
    go('rezije'); await sleep(80);
    check('kućni računi: ekran ima tabelu za lokaciju', !!document.querySelector('#rezijeTable table'));
    check('kućni računi: podkartica u Izveštajima', [...document.querySelectorAll('#subtabs button')].some(b => b.dataset.screen === 'rezije'));
    if (typeof window.__importBillsSheet === 'function') {
      const before = window.__bills().bills.length;
      const pv = window.__billsSheetPreview ? window.__billsSheetPreview([['Računi 2024'], ['Mesec', '', '01. Januar', '02. Februar'], ['Kućni računi', 'Struja', 1000, 2000], ['Kućni računi (Smoke Drvar)', 'Struja', 9.99, ''], ['Kućni računi (potrošnja)', 'Struja - skupa', 100, 90]], { 'Smoke Drvar': 'BAM' }) : '';
      check('uvoz tabele: pregled pre uvoza (računi, duplikati, nove lokacije i vrste)', /za uvoz: 3\b/.test(pv) && /postoje: 0\b/.test(pv) && /Smoke Drvar/.test(pv) && /Struja/.test(pv), pv);
      const res = window.__importBillsSheet([['Računi 2024'], ['Mesec', '', '01. Januar', '02. Februar'], ['Kućni računi', 'Struja', 1000, 2000], ['Kućni računi (Smoke Drvar)', 'Struja', 9.99, ''], ['Kućni računi (potrošnja)', 'Struja - skupa', 100, 90]], { 'Smoke Drvar': 'BAM' });
      check('uvoz tabele: napravljeni računi i lokacija', res.created === 3 && window.__bills().locations.some(l => l.name === 'Smoke Drvar' && l.currency === 'BAM'), JSON.stringify(res));
      $('rezijeYear').value = '2024'; $('rezijeYear').dispatchEvent(new Event('change')); await sleep(80);
      check('uvoz tabele: vidi se u tabeli 2024', /Smoke Drvar/.test($('rezijeTable').textContent) && /1\.000|1,000/.test($('rezijeTable').textContent), $('rezijeTable').textContent.slice(0, 200));
      check('uvoz tabele: grafikon potrošnje', $('rezijeChart').querySelectorAll('rect').length === 12);
      check('grafikon: vrednosti iznad stubića', [...$('rezijeChart').querySelectorAll('text.rz-val')].some(x => x.textContent.trim() === '100'));
      const ths = [...document.querySelectorAll('#rezijeTable thead th')].slice(1, 13).map(th => Math.round(th.getBoundingClientRect().width));
      check('tabela: svi meseci iste širine', ths.length === 12 && Math.max(...ths) - Math.min(...ths) <= 1 && Math.min(...ths) > 30, JSON.stringify(ths));
      const emptyRow = [...document.querySelectorAll('#rezijeTable tbody tr')].find(tr => /^Plin/.test(tr.cells[0] && tr.cells[0].textContent.trim()) && [...tr.cells].slice(1, 13).every(c => !c.textContent.trim()));
      check('tabela: red bez podataka nema 0 u zbiru', !!emptyRow && emptyRow.cells[13].textContent.trim() === '', emptyRow && emptyRow.cells[13].textContent);
      const again = window.__importBillsSheet([['Računi 2024'], ['Mesec', '', '01. Januar', '02. Februar'], ['Kućni računi', 'Struja', 1000, 2000]], {});
      check('uvoz tabele: duplikati preskočeni', again.created === 0 && again.duplicates === 2, JSON.stringify(again));
      const B = window.__bills(); const loc = B.locations.find(l => l.name === 'Smoke Drvar');
      if (loc) window.__removeLocation(loc.id);
      window.__bills().bills.filter(b => b.month.startsWith('2024-') && b.source === 'excel').forEach(b => window.__deleteBill(b.id, { confirm: false }));
      check('uvoz tabele: pospremljeno', window.__bills().bills.length === before);
    } else check('uvoz tabele: hook postoji', false);

    // Podesavanja: lokacije/vrste i AI kljuc (kljuc se ne vraca stranici)
    go('podesavanja'); await sleep(80);
    check('podešavanja: lista lokacija', !!$('billLocList') && document.querySelectorAll('#billLocList .bill-loc').length === window.__bills().locations.length);
    if ($('billLocList')) {
      const nLoc = window.__bills().locations.length;
      $('billAddLoc').click(); await sleep(50);
      const added = window.__bills().locations[nLoc];
      check('podešavanja: dodata lokacija sa vrstama', !!added && window.__bills().billTypes.filter(x => x.locationId === added.id).length === 4);
      if (added) {
        const sel = document.querySelector(`#billLocList .bill-loc[data-loc="${added.id}"] .bl-cur`);
        sel.value = 'BAM'; sel.dispatchEvent(new Event('change', { bubbles: true }));
        check('podešavanja: valuta lokacije', window.__bills().locations.find(l => l.id === added.id).currency === 'BAM');
        window.__removeLocation(added.id);
      }
    }
    if (window.desktop && window.desktop.bills) {
      check('AI podešavanja vidljiva', $('aiSettings') && $('aiSettings').style.display !== 'none');
      const info0 = await window.desktop.bills.setKey('gsk_smoketest1234');
      check('AI ključ: sačuvan, vidi se samo kraj', info0.set === true && info0.last4 === '1234' && !JSON.stringify(info0).includes('gsk_smoke'), JSON.stringify(info0));
      check('AI ključ: nije u podacima', !Object.keys(localStorage).some(k => String(localStorage.getItem(k)).includes('gsk_smoke')));
      const info1 = await window.desktop.bills.setKey('');
      check('AI ključ: obrisan', info1.set === false);
      check('AI: podrazumevani model', info1.model === 'qwen/qwen3.8-27b', info1.model);
    }

    // Fiskalni racun: polja na rashodu prezive Excel i kopiju, 📎 u Rashodima
    if (typeof window.__addEntriesRaw === 'function') {
      const e = { id: 'smoke-rcpt-1', type: 'expense', desc: 'Smoke Maxi', amount: 10, category: 'Hrana', date: monthKey(new Date()) + '-01', paid: true, tags: ['nabavka'], items: ['Mleko'], itemPrices: [10], receiptId: 'smokeR1', attachments: ['2026-09-30-racun-smoke-1.jpg'] };
      window.__addEntriesRaw([e]);
      const san = window.__sanitizeImportedBackup({ entries: [e, Object.assign({}, e, { id: 'smoke-rcpt-2', receiptId: '"><x', attachments: ['..\\a.pdf', 'ok.pdf'] })] });
      check('račun: kopija čuva receiptId i priloge', san.entries[0].receiptId === 'smokeR1' && san.entries[0].attachments[0] === e.attachments[0] && san.entries[1].receiptId === undefined && san.entries[1].attachments.join() === 'ok.pdf', JSON.stringify(san.entries[1]));
      const ws = window.__buildWorkbook().Sheets['Stavke'];
      const row = XLSX.utils.sheet_to_json(ws, { defval: '' }).find(r => r.ID === 'smoke-rcpt-1');
      check('račun: Excel kolone RacunID i Prilozi', !!row && row.RacunID === 'smokeR1' && row.Prilozi === e.attachments[0], JSON.stringify(row));
      go('rashodi'); await sleep(80);
      check('račun: 📎 u listi rashoda', !!document.querySelector('.att-btn[data-id="smoke-rcpt-1"]'));
      window.__deleteEntriesById(['smoke-rcpt-1']);
    } else check('račun: hook __addEntriesRaw', false);

    // Fiskalni racun: 2 dela sa preklapanjem, lista od 3 stavke, rashodi po kategorijama, prilozi, duplikat, undo
    if (typeof window.__addReceiptFiles === 'function') {
      go('nabavka'); await sleep(60);
      check('račun: dugme u Nabavci', !!$('shopReceiptBtn'));
      const sh = window.__shopping();
      const mk = (name, category) => ({ id: 'smoke-sl-' + name, name, section: 'Ostalo', store: '', category, price: null, qty: '', needed: true, checked: false });
      window.__addExpenseCategory('Smoke higijena');
      sh.items.push(mk('Mleko', 'Hrana'), mk('Hleb', 'Hrana'), mk('Sapun', 'Smoke higijena')); window.__saveShopping();
      const rDate = monthKey(new Date()) + '-02';
      const part1 = { store: 'Smoke Maxi', date: rDate, total: null, items: [{ raw: 'MLEKO 1L', name: 'Mleko', price: 129.99, category: 'Hrana' }, { raw: 'HLEB SAVA', name: 'Hleb', price: 89, category: 'Hrana' }, { raw: 'JAJA 10', name: 'Jaja', price: 250, category: 'Hrana' }] };
      const part2 = { total: 700, items: [{ raw: 'JAJA 10', name: 'Jaja', price: 250, category: 'Hrana' }, { raw: 'SAPUN DOVE', name: 'Sapun', price: 150, category: '' }, { raw: 'POPUST', price: -10, discount: 1 }, { raw: 'KESA', name: 'Kesa', price: 60.5, category: '' }] };
      const seen = [];
      window.__fakeReceiptReading = (req, i) => { seen.push({ i, n: req.images.length }); return { ok: true, content: JSON.stringify(i === 0 ? part1 : part2) }; };
      const img = await new Promise(r => { const c = document.createElement('canvas'); c.width = 300; c.height = 600; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 300, 600); g.fillStyle = '#000'; g.fillRect(10, 10, 20, 20); c.toBlob(r, 'image/jpeg'); });
      const p = window.__addReceiptFiles([new File([img], 'r1.jpg', { type: 'image/jpeg' }), new File([img], 'r2.jpg', { type: 'image/jpeg' })]);
      await sleep(2500);
      const st = window.__receiptState();
      check('račun: dva dela, dva poziva po jedna slika', seen.length === 2 && seen.every(x => x.n === 1), JSON.stringify(seen));
      check('račun: preklapanje spojeno, popust primenjen', !!st && st.items.map(x => x.name).join() === 'Mleko,Hleb,Jaja,Sapun,Kesa' && st.items[3].price === 140, st && JSON.stringify(st.items.map(x => [x.name, x.price])));
      check('račun: sapun dobija kategoriju sa liste', !!st && st.items[3].category === 'Smoke higijena', st && st.items[3].category);
      check('račun: uparene stavke označene', document.querySelectorAll('#receiptItems .rc-matched').length === 3);
      check('račun: razlika prikazana', /Razlika/.test($('receiptDiff').textContent) && $('receiptAddDiff').style.display !== 'none', $('receiptDiff').textContent);
      $('receiptAddDiff').click(); await sleep(50);
      const n0 = entries().length;
      $('receiptSave').click(); await p; await sleep(200);
      const made = entries().slice(n0);
      const sum = Math.round(made.reduce((s2, e) => s2 + e.amount, 0) * 100);
      check('račun: rashodi po kategorijama, zbir = ukupno', made.length >= 2 && sum === 70000 && made.every(e => e.receiptId && e.receiptId === made[0].receiptId && e.tags.includes('nabavka') && e.itemPrices.length === e.items.length && e.date === rDate), JSON.stringify(made.map(e => [e.category, e.amount, e.date])));
      check('račun: prilozi sačuvani', made.length > 0 && made.every(e => Array.isArray(e.attachments) && e.attachments.length === 2), JSON.stringify(made[0] && made[0].attachments));
      const sl = window.__shopping().items.filter(i => i.id.startsWith('smoke-sl-'));
      check('račun: stavke sa liste skinute i dobile cenu', sl.length === 3 && sl.every(i => !i.needed) && sl.find(i => i.name === 'Mleko').price === 129.99, JSON.stringify(sl.map(i => [i.name, i.needed, i.price])));
      // duplikat
      window.__fakeReceiptReading = () => ({ ok: true, content: JSON.stringify({ store: 'Smoke Maxi', date: rDate, total: 700, items: [{ name: 'X', price: 700, category: 'Hrana' }] }) });
      const p2 = window.__addReceiptFiles([new File([img], 'r3.jpg', { type: 'image/jpeg' })]); await sleep(1500);
      check('račun: duplikat upozorenje', /već unet/.test($('receiptStatus').textContent), $('receiptStatus').textContent);
      $('receiptCancel').click(); await p2;
      // undo
      window.__undoTop(); await sleep(150);
      check('račun: undo briše rashode i vraća listu', made.length > 0 && !entries().some(e => e.receiptId === made[0].receiptId) && window.__shopping().items.filter(i => i.id.startsWith('smoke-sl-')).every(i => i.needed));
      // deo koji nije procitan: poruka + ponovi
      let calls = 0;
      window.__fakeReceiptReading = (req, i) => { calls++; return i === 1 && calls === 2 ? { ok: false, kind: 'limit', status: 429 } : { ok: true, content: JSON.stringify(i === 0 ? part1 : part2) }; };
      const p3 = window.__addReceiptFiles([new File([img], 'a.jpg', { type: 'image/jpeg' }), new File([img], 'b.jpg', { type: 'image/jpeg' })]); await sleep(2000);
      check('račun: deo 2 nije pročitan — poruka i dugme ponovi', /Deo 2/.test($('receiptStatus').textContent) && window.__receiptState().items.length === 3, $('receiptStatus').textContent);
      // izmena pre ponovnog citanja mora da ostane
      const cat0 = document.querySelector('#receiptItems .receipt-row[data-i="0"] select[data-f="category"]');
      cat0.value = 'Smoke higijena'; cat0.dispatchEvent(new Event('change', { bubbles: true }));
      const nm0 = document.querySelector('#receiptItems .receipt-row[data-i="0"] input[data-f="name"]');
      nm0.value = 'Mleko moje'; nm0.dispatchEvent(new Event('input', { bubbles: true }));
      $('receiptNext').click(); await sleep(50);
      check('račun: dugme Pokušaj ponovo za deo 2', $('receiptRetry').style.display !== 'none');
      $('receiptRetry').click(); await sleep(800);
      check('račun: posle ponavljanja svih 5 stavki', window.__receiptState().items.length === 5 && !/Deo 2/.test($('receiptStatus').textContent), JSON.stringify(window.__receiptState().items.map(x => x.name)));
      check('račun: izmene ostaju posle ponovnog čitanja', window.__receiptState().items[0].name === 'Mleko moje' && window.__receiptState().items[0].category === 'Smoke higijena', JSON.stringify(window.__receiptState().items[0]));
      $('receiptCancel').click(); await p3;
      // zatvaranje dok cita: ostali delovi se ne salju; "Dodaj jos sliku" je iskljuceno tokom citanja
      let slowCalls = 0;
      window.__fakeReceiptReading = async (req, i) => { slowCalls++; await sleep(400); return { ok: true, content: JSON.stringify(i === 0 ? part1 : part2) }; };
      const p4 = window.__addReceiptFiles([new File([img], 'a.jpg', { type: 'image/jpeg' }), new File([img], 'b.jpg', { type: 'image/jpeg' }), new File([img], 'c.jpg', { type: 'image/jpeg' })]);
      await sleep(150);
      check('račun: Dodaj još sliku isključeno tokom čitanja', $('receiptAddPart').disabled === true);
      $('receiptCancel').click(); await p4; await sleep(1200);
      check('račun: posle zatvaranja nema daljih poziva', slowCalls === 1 && !$('receiptOverlay').classList.contains('show'), 'poziva: ' + slowCalls);
      window.__shopping().items = window.__shopping().items.filter(i => !i.id.startsWith('smoke-sl-')); window.__saveShopping();
      window.__deleteExpenseCategory('Smoke higijena');
      window.__fakeReceiptReading = null;
    } else check('račun: hook __addReceiptFiles', false);

    // Uplatnica bez QR-a: AI cita (lazno), provera kontrolnog broja, ponavljajuca i jednokratno placanje
    if ('__fakeSlipReading' in window) {
      const slip = { name: 'JKP Smoke Infostan, Beograd', account: '845-0000000404849-87', code: '189', amount: '3.456,00', purpose: 'Komunalije', model: '', reference: '' };
      window.__fakeSlipReading = () => ({ ok: true, content: JSON.stringify(slip) });
      const blank = await new Promise(r => { const c = document.createElement('canvas'); c.width = 400; c.height = 200; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 400, 200); c.toBlob(r, 'image/png'); });
      const setFile = (id, f) => { const dt = new DataTransfer(); dt.items.add(f); $(id).files = dt.files; $(id).dispatchEvent(new Event('change')); };
      // 1) nova ponavljajuca sa uplatnice
      go('ponavljajuce'); await sleep(60);
      setFile('recSlipInput', new File([blank], 'u.png', { type: 'image/png' })); await sleep(1500);
      check('uplatnica: AI popunjava novu ponavljajuću', $('recDesc').value.startsWith('JKP Smoke Infostan') && $('recAmount').value === '3456' && /proveri/i.test($('recSlipStatus').textContent), $('recDesc').value + ' | ' + $('recSlipStatus').textContent);
      setVal('recDay', '5'); $('recAutoPay').checked = false; $('recurringForm').requestSubmit(); await sleep(150);
      const sr = JSON.parse(localStorage.getItem('budzet-ponavljajuce-v1') || '[]').find(r => r.desc.startsWith('JKP Smoke Infostan'));
      check('uplatnica: ponavljajuća dobija podatke za plaćanje', !!sr && !!sr.payee && sr.payee.account === '845000000040484987', JSON.stringify(sr && sr.payee));
      if (sr) {
        go('ponavljajuce'); await sleep(80);
        const delS = document.querySelector(`.recurring-item[data-row-id="${CSS.escape(sr.id)}"] .del-btn`);
        if (delS) { delS.click(); await sleep(400); if ($('dialogOverlay').classList.contains('show')) { $('dialogOk').click(); await sleep(400); } }
      }
      // 1b) pogresan racun sa AI ne sme da se sacuva uz novu ponavljajucu
      window.__fakeSlipReading = () => ({ ok: true, content: JSON.stringify(Object.assign({}, slip, { name: 'JKP Smoke Losa', account: '845-0000000404849-88' })) });
      go('ponavljajuce'); await sleep(60);
      setFile('recSlipInput', new File([blank], 'u.png', { type: 'image/png' })); await sleep(1500);
      check('uplatnica: loš račun javljen u formi', /Kontrolni broj/.test($('recSlipStatus').textContent), $('recSlipStatus').textContent);
      setVal('recDay', '5'); $('recAutoPay').checked = false; $('recurringForm').requestSubmit(); await sleep(150);
      const srBad = JSON.parse(localStorage.getItem('budzet-ponavljajuce-v1') || '[]').find(r => r.desc.startsWith('JKP Smoke Losa'));
      check('uplatnica: loš račun se ne čuva uz ponavljajuću', !!srBad && !srBad.payee, JSON.stringify(srBad && srBad.payee));
      if (srBad) {
        go('ponavljajuce'); await sleep(80);
        const delB = document.querySelector(`.recurring-item[data-row-id="${CSS.escape(srBad.id)}"] .del-btn`);
        if (delB) { delB.click(); await sleep(400); if ($('dialogOverlay').classList.contains('show')) { $('dialogOk').click(); await sleep(400); } }
      }
      window.__fakeSlipReading = () => ({ ok: true, content: JSON.stringify(slip) });
      // 2) jednokratno placanje iz Rashoda
      go('rashodi'); await sleep(60);
      check('uplatnica: dugme u Rashodima', !!$('expSlipBtn'));
      if ($('expSlipInput')) {
        setFile('expSlipInput', new File([blank], 'u2.png', { type: 'image/png' })); await sleep(1500);
        check('uplatnica: prozor u izmeni sa podacima', $('ipsOverlay').classList.contains('show') && $('ipsEdit').style.display !== 'none' && $('ipsAccount').value.replace(/\D/g, '') === '845000000040484987', $('ipsAccount').value);
        $('ipsPrimary').click(); await sleep(120);
        check('uplatnica: QR kod i iznos sa uplatnice', !!$('ipsQr').querySelector('svg') && $('ipsAmount').value === '3456', $('ipsAmount').value);
        $('ipsOneOffCat').value = 'Stanovanje';
        const nE = entries().length;
        $('ipsPrimary').click(); await sleep(250);
        const ne = entries().slice(nE)[0];
        check('uplatnica: rashod sa prilogom', !!ne && ne.amount === 3456 && ne.category === 'Stanovanje' && ne.desc.startsWith('JKP Smoke Infostan') && Array.isArray(ne.attachments) && ne.attachments.length === 1, JSON.stringify(ne));
        if (ne) window.__deleteEntriesById([ne.id]);
        // 3) pogresan kontrolni broj: ne dolazi do QR koda
        window.__fakeSlipReading = () => ({ ok: true, content: JSON.stringify(Object.assign({}, slip, { account: '845-0000000404849-88' })) });
        setFile('expSlipInput', new File([blank], 'u3.png', { type: 'image/png' })); await sleep(1500);
        check('uplatnica: pogrešan kontrolni broj odmah označen', /Kontrolni broj/.test($('ipsProblems').textContent), $('ipsProblems').textContent);
        $('ipsPrimary').click(); await sleep(120);
        check('uplatnica: bez QR koda dok se ne ispravi', $('ipsEdit').style.display !== 'none' && !$('ipsQr').querySelector('svg'));
        $('ipsClose').click();
        // 4) poziv na broj bez modela: upozorenje (ne blokira)
        window.__fakeSlipReading = () => ({ ok: true, content: JSON.stringify(Object.assign({}, slip, { reference: '1234567' })) });
        setFile('expSlipInput', new File([blank], 'u4.png', { type: 'image/png' })); await sleep(1500);
        check('uplatnica: upozorenje za neprovereni poziv na broj', /nije proveren/.test($('ipsProblems').textContent), $('ipsProblems').textContent);
        $('ipsClose').click();
        // 5) AI ne uspe: rucni unos, slika i dalje ide kao prilog
        window.__fakeSlipReading = () => ({ ok: false, kind: 'nokey' });
        setFile('expSlipInput', new File([blank], 'u5.png', { type: 'image/png' })); await sleep(1500);
        setVal('ipsAccount', '845-0000000404849-87'); setVal('ipsName', 'Smoke Rucno');
        $('ipsPrimary').click(); await sleep(120);
        setVal('ipsAmount', '500'); $('ipsOneOffCat').value = 'Stanovanje';
        const nE2 = entries().length;
        $('ipsPrimary').click(); await sleep(250);
        const ne2 = entries().slice(nE2)[0];
        check('uplatnica: bez AI slika ostaje prilog', !!ne2 && ne2.amount === 500 && Array.isArray(ne2.attachments) && ne2.attachments.length === 1, JSON.stringify(ne2));
        if (ne2) window.__deleteEntriesById([ne2.id]);
        // 6) poruka ranijeg (sporog) citanja ne prepisuje novu
        window.__fakeSlipReading = async () => { await sleep(700); return { ok: true, content: JSON.stringify(Object.assign({}, slip, { name: 'STARA uplatnica' })) }; };
        setFile('expSlipInput', new File([blank], 'u6.png', { type: 'image/png' })); await sleep(200);
        $('ipsClose').click();
        window.__fakeSlipReading = () => ({ ok: true, content: JSON.stringify(Object.assign({}, slip, { name: 'NOVA uplatnica' })) });
        setFile('expSlipInput', new File([blank], 'u7.png', { type: 'image/png' })); await sleep(1800);
        check('uplatnica: poruka ranijeg čitanja ne prepisuje novu', /NOVA/.test($('ipsImageStatus').textContent) && !/STARA/.test($('ipsImageStatus').textContent) && $('ipsName').value.startsWith('NOVA'), $('ipsImageStatus').textContent);
        $('ipsClose').click();
      }
      window.__fakeSlipReading = null;
    } else check('uplatnica: hook __fakeSlipReading', false);

    // Uvoz izvoda + AI predlozi kategorija i pravila (salju se samo opisi)
    if ('__fakeImportCategorizing' in window && typeof window.__catRules === 'function') {
      const m = monthKey(new Date());
      const rules0 = window.__catRules().slice();
      window.__setCatRules(rules0.concat([{ keyword: 'smokepoznato', category: 'Hrana' }]));
      let sentPrompt = null;
      window.__fakeImportCategorizing = req => { sentPrompt = req.prompt; return { ok: true, content: JSON.stringify({ items: [{ i: 0, category: 'Prevoz', keyword: 'SMOKEGORIVO' }, { i: 1, category: 'Zabava', keyword: 'SMOKEKINO' }, { i: 2, category: 'Nepostoji', keyword: 'SMOKEAPOTEKA' }, { i: 3, category: 'Hrana', keyword: 'nije u opisu' }] }) }; };
      const csv = 'Datum;Opis;Iznos\n' + m + '-03;POS 11 SMOKEGORIVO BG;-3000,00\n' + m + '-04;POS 12 SMOKEKINO;-800,00\n' + m + '-05;SMOKEAPOTEKA 5;-450,00\n' + m + '-06;SMOKEPEKARA ZORA;-120,00\n' + m + '-07;SMOKEPOZNATO MARKET;-999,00\n' + m + '-08;POS 11 SMOKEGORIVO BG;-2500,00\n';
      const pi = window.__runImportText([{ name: 'ai.csv', text: csv }]); await sleep(900);
      check('uvoz AI: poslati samo nepoznati opisi, bez iznosa', !!sentPrompt && /SMOKEGORIVO/.test(sentPrompt) && !/SMOKEPOZNATO/.test(sentPrompt) && !/3000|2500|800,00/.test(sentPrompt), sentPrompt && sentPrompt.slice(-300));
      const rowsAi = [...document.querySelectorAll('#dialogBody .import-ai-row')];
      check('uvoz AI: 4 predloga u pregledu', rowsAi.length === 4, String(rowsAi.length));
      const ap = rowsAi.find(r => /SMOKEAPOTEKA/.test(r.textContent));
      if (ap) { const sl = ap.querySelector('select'); sl.value = 'Zdravlje'; sl.dispatchEvent(new Event('change', { bubbles: true })); }
      const pk = rowsAi.find(r => /SMOKEPEKARA/.test(r.textContent));
      if (pk) { const cb = pk.querySelector('input[type=checkbox]'); cb.checked = false; cb.dispatchEvent(new Event('change', { bubbles: true })); }
      $('dialogOk').click(); await pi; await sleep(150);
      const imp = entries().filter(e => /SMOKE(GORIVO|KINO|APOTEKA|PEKARA|POZNATO)/.test(e.desc));
      const catOf = d => (imp.find(e => e.desc.includes(d)) || {}).category;
      check('uvoz AI: kategorije primenjene', imp.length === 6 && imp.filter(e => e.desc.includes('SMOKEGORIVO')).every(e => e.category === 'Prevoz') && catOf('SMOKEKINO') === 'Zabava' && catOf('SMOKEAPOTEKA') === 'Zdravlje' && catOf('SMOKEPEKARA') === 'Hrana' && catOf('SMOKEPOZNATO') === 'Hrana', JSON.stringify(imp.map(e => [e.desc, e.category])));
      const rules = window.__catRules();
      check('uvoz AI: pravila napravljena (bez isključenog)', rules.some(r => r.keyword === 'SMOKEGORIVO' && r.category === 'Prevoz') && rules.some(r => r.keyword === 'SMOKEAPOTEKA' && r.category === 'Zdravlje') && !rules.some(r => /SMOKEPEKARA/i.test(r.keyword)), JSON.stringify(rules));
      window.__undoTop(); await sleep(150);
      check('uvoz AI: opoziv briše stavke i nova pravila', !entries().some(e => /SMOKE(GORIVO|KINO|APOTEKA|PEKARA|POZNATO)/.test(e.desc)) && !window.__catRules().some(r => r.keyword === 'SMOKEGORIVO') && window.__catRules().some(r => r.keyword === 'smokepoznato'));
      // drugi uvoz dok prvi ceka AI: ne krece, jasna poruka; napredak se vidi
      window.__fakeImportCategorizing = async req => { await sleep(700); return { ok: true, content: JSON.stringify({ items: [{ i: 0, category: 'Prevoz', keyword: 'SMOKEGORIVO' }] }) }; };
      const pA = window.__runImportText([{ name: 'a.csv', text: 'Datum;Opis;Iznos\n' + m + '-03;POS 11 SMOKEGORIVO BG;-3000,00\n' }]); await sleep(150);
      check('uvoz AI: napredak u statusu', /AI predlaže/.test($('csvImportStatus').textContent), $('csvImportStatus').textContent);
      await window.__runImportText([{ name: 'b.csv', text: 'Datum;Opis;Iznos\n' + m + '-04;SMOKEDRUGI;-100,00\n' }]);
      check('uvoz AI: drugi uvoz ne kreće dok prvi traje', /već u toku/.test($('csvImportStatus').textContent), $('csvImportStatus').textContent);
      await sleep(900); if ($('dialogOverlay').classList.contains('show')) $('dialogCancel').click(); await pA;
      window.__setCatRules(rules0);
      window.__fakeImportCategorizing = null;
      go('podesavanja'); await sleep(80);
      check('uvoz AI: podešavanja kažu da se šalju i opisi sa izvoda', /opisi/.test($('aiSettings').textContent) && /brzom unosu/.test($('aiSettings').textContent) && /dokumen/.test($('aiSettings').textContent), $('aiSettings').textContent.slice(-200));
    } else check('uvoz AI: hook', false);

    // Dokumenti: AI unos, stanje, licna dokumenta, obnova, brisanje sa opozivom, kopija i Excel
    if (typeof window.__addDocFiles === 'function') {
      const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      const now = new Date();
      const bought = iso(new Date(now.getFullYear() - 2, now.getMonth(), now.getDate() + 10));   // garancija 24 m -> istice za ~10 dana
      let docCalls = 0;
      window.__fakeDocReading = () => { docCalls++; return { ok: true, content: JSON.stringify({ kind: 'garancija', title: 'Smoke frižider', group: 'Tehnika', issued: bought, warrantyMonths: 24, vendor: 'Smoke Tehno' }) }; };
      const png = await new Promise(r => { const c = document.createElement('canvas'); c.width = 300; c.height = 200; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 300, 200); c.toBlob(r, 'image/png'); });
      go('dokumenti'); await sleep(80);
      const pd = window.__addDocFiles([new File([png], 'g.png', { type: 'image/png' }), new File([png], 'g2.png', { type: 'image/png' }), new File([png], 'g3.png', { type: 'image/png' })]);
      check('dokumenti: Sačuvaj isključeno dok se fajlovi pripremaju', $('docSave').disabled === true, JSON.stringify({ show: $('docOverlay').classList.contains('show'), n: document.querySelectorAll('#docFiles .doc-file').length, st: $('docStatus').textContent }));
      await sleep(1500);
      check('dokumenti: AI ne čita sam, čeka dugme', docCalls === 0 && $('docReadAi').style.display !== 'none' && $('docSave').disabled === false && document.querySelectorAll('#docFiles .doc-file').length === 3, 'calls=' + docCalls);
      $('docReadAi').click(); await sleep(800);
      check('dokumenti: prozor sa AI podacima', $('docOverlay').classList.contains('show') && $('docTitle').value === 'Smoke frižider' && $('docIssued').value === bought && $('docMonths').value === '24', $('docTitle').value + ' ' + $('docIssued').value);
      $('docSave').click(); await pd; await sleep(200);
      const dz = window.__documents().find(d => d.title === 'Smoke frižider');
      check('dokumenti: sačuvan sa prilozima, uskoro ističe', !!dz && dz.files.length === 3 && window.BudzetCore.documentStatus(dz, iso(now)).state === 'soon', JSON.stringify(dz));
      check('dokumenti: red na spisku sa stanjem', !!document.querySelector(`#docList .doc-row.doc-soon[data-id="${dz && dz.id}"]`));
      // licna dokumenta: prekidac ne salje sledece fajlove
      window.__fakeDocReading = () => { docCalls++; return { ok: true, content: JSON.stringify({ kind: 'dokument', title: 'Smoke pasoš', group: 'Lična dokumenta', expires: iso(new Date(now.getFullYear() + 5, 0, 1)) }) }; };
      const pp = window.__addDocFiles([new File([png], 'p.png', { type: 'image/png' })]); await sleep(1200);
      const callsBefore = docCalls;
      $('docNoAi').checked = true; $('docNoAi').dispatchEvent(new Event('change', { bubbles: true }));
      $('docReadAi').click(); await sleep(600);
      check('dokumenti: uključen prekidač — prvi fajl ne ide AI-ju', docCalls === callsBefore, docCalls + ' ' + callsBefore);
      $('docNoAi').checked = false; $('docNoAi').dispatchEvent(new Event('change', { bubbles: true }));
      $('docReadAi').click(); await sleep(800);
      check('dokumenti: lična dokumenta uključuju „ne šalji AI-ju“', $('docNoAi').checked === true);
      const callsBefore2 = docCalls;
      const dt = new DataTransfer(); dt.items.add(new File([png], 'p2.png', { type: 'image/png' })); $('docFileInput').files = dt.files; $('docFileInput').dispatchEvent(new Event('change')); await sleep(1200);
      $('docReadAi').click(); await sleep(400);
      check('dokumenti: uz prekidač fajl ne ide AI-ju, ali se dodaje', docCalls === callsBefore2 && document.querySelectorAll('#docFiles .doc-file').length === 2, docCalls + ' ' + callsBefore2);
      $('docCancel').click(); await pp;
      // obnova sa rashodom i opozivom
      const regExp = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 10));
      const regId = window.__saveDocumentRaw({ kind: 'dokument', title: 'Smoke registracija', group: 'Auto', expires: regExp, remindDays: 30, files: [], renewal: { amount: 25000, category: 'Prevoz', months: 12 } });
      const nE = entries().length;
      window.__renewDocument(regId); await sleep(150);
      const reg = window.__documents().find(d => d.id === regId);
      const renE = entries().slice(nE)[0];
      check('dokumenti: obnova pomera rok i upisuje rashod', !!reg && reg.expires === window.BudzetCore.addMonthsToDate(regExp, 12) && !!renE && renE.amount === 25000 && renE.category === 'Prevoz' && /Obnova/.test(renE.desc), JSON.stringify({ reg, renE }));
      window.__undoTop(); await sleep(150);
      check('dokumenti: opoziv obnove vraća rok i briše rashod', window.__documents().find(d => d.id === regId).expires === regExp && entries().length === nE);
      // brisanje zapisa sa 2 priloga i opoziv
      const a1 = await window.desktop.bills.saveFile(new Uint8Array([1, 2]), 'smoke-dok-a.pdf'), a2 = await window.desktop.bills.saveFile(new Uint8Array([3]), 'smoke-dok-b.pdf');
      const delId = window.__saveDocumentRaw({ kind: 'dokument', title: 'Smoke ugovor', group: 'Ugovori', files: [a1.name, a2.name] });
      window.__deleteDocument(delId, { confirm: false }); await sleep(150);
      const gone = !window.__documents().some(d => d.id === delId) && !(await window.desktop.bills.openFile(a1.name)).ok;
      window.__undoTop(); await sleep(200);
      const back = window.__documents().some(d => d.id === delId) && (await window.desktop.bills.openFile(a1.name)).ok && (await window.desktop.bills.openFile(a2.name)).ok;
      check('dokumenti: brisanje i opoziv vraćaju zapis i oba priloga', gone && back);
      // kopija i Excel
      const sd = window.__sanitizeImportedBackup({ entries: [], documents: window.__documents() });
      check('dokumenti: JSON kopija čuva zapise', Array.isArray(sd.documents) && sd.documents.some(d => d.id === regId));
      const ws = window.__buildWorkbook().Sheets['Dokumenti'];
      check('dokumenti: Excel list Dokumenti', !!ws && XLSX.utils.sheet_to_json(ws, { defval: '' }).some(r => r.ID === regId && r.Naziv === 'Smoke registracija'));
      window.__documents().filter(d => /^Smoke /.test(d.title)).forEach(d => window.__deleteDocument(d.id, { confirm: false }));
      window.__fakeDocReading = null;
    } else check('dokumenti: hook __addDocFiles', false);

    // Dokumenti: podsetnik na Pregledu, obavestenja, garancija iz rashoda (prilog rashoda ostaje posle brisanja zapisa)
    if (typeof window.__docNotifyKeys === 'function') {
      const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      const now = new Date();
      const soonId = window.__saveDocumentRaw({ kind: 'dokument', title: 'Smoke osiguranje', group: 'Osiguranje', expires: iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 5)), remindDays: 30 });
      go('pregled'); await sleep(150);
      check('dokumenti: kartica Uskoro ističe na Pregledu', $('docReminders') && $('docReminders').style.display !== 'none' && /Smoke osiguranje/.test($('docReminders').textContent), $('docReminders') && $('docReminders').textContent.slice(0, 120));
      check('dokumenti: ključ obaveštenja', window.__docNotifyKeys().some(k => k.startsWith('doc-' + soonId + '-') && k.endsWith('-soon')), JSON.stringify(window.__docNotifyKeys()));
      const sent1 = window.__runDocNotifications(), sent2 = window.__runDocNotifications({ newDay: true });
      check('dokumenti: obaveštenje „uskoro“ samo jednom (i sledećeg dana)', sent1.some(k => k.startsWith('doc-' + soonId)) && !sent2.some(k => k.startsWith('doc-' + soonId)), JSON.stringify({ sent1, sent2 }));
      window.__deleteDocument(soonId, { confirm: false });
      const att = await window.desktop.bills.saveFile(new Uint8Array([1, 2, 3]), 'smoke-garancija.pdf');
      window.__addEntriesRaw([{ id: 'smoke-war-1', type: 'expense', desc: 'Smoke Tehno', amount: 50000, category: 'Ostalo', date: iso(now), paid: true, tags: [], items: ['Frižider Gorenje'], attachments: [att.name] }]);
      go('rashodi'); await sleep(100);
      const wb = document.querySelector('.warranty-btn[data-id="smoke-war-1"]');
      check('dokumenti: dugme + garancija kod rashoda sa prilogom', !!wb);
      if (wb) {
        wb.click(); await sleep(200);
        check('dokumenti: garancija iz rashoda popunjena', $('docOverlay').classList.contains('show') && $('docKind').value === 'garancija' && $('docIssued').value === iso(now) && $('docMonths').value === '24' && $('docTitle').value === 'Frižider Gorenje' && document.querySelectorAll('#docFiles .doc-file').length === 1, $('docTitle').value + ' ' + $('docMonths').value);
        $('docSave').click(); await sleep(250);
        const wd = window.__documents().find(d => d.entryId === 'smoke-war-1');
        check('dokumenti: garancija vezana za rashod', !!wd && wd.files[0] === att.name);
        if (wd) {
          window.__openDocReview({ doc: wd }); await sleep(150);
          document.querySelector('#docFiles .doc-file-del').click(); await sleep(50);
          $('docSave').click(); await sleep(250);
          check('dokumenti: uklanjanje deljenog priloga ne briše račun rashoda', (await window.desktop.bills.openFile(att.name)).ok === true);
        }
        if (wd) { window.__deleteDocument(wd.id, { confirm: false }); await sleep(100); }
        check('dokumenti: prilog rashoda ostaje posle brisanja garancije', (await window.desktop.bills.openFile(att.name)).ok === true);
      }
      window.__deleteEntriesById(['smoke-war-1']);
    } else check('dokumenti: hook __docNotifyKeys', false);

    // Pitaj svoj budzet: plan bez iznosa, lokalni proracun, odgovor kao tekst, offTopic, greska, dupli klik
    if ('__fakeAsk' in window) {
      const cm = monthKey(new Date());
      window.__addEntriesRaw([{ id: 'smoke-ask-1', type: 'expense', desc: 'Smoke tajna kupovina', amount: 77123, category: 'Smoke pitaj', date: cm + '-01', paid: true, tags: [] }]);
      const reqs = [];
      window.__fakeAsk = async (req, step) => { reqs.push({ step, prompt: req.prompt }); await sleep(200);
        return step === 1 ? { ok: true, content: JSON.stringify({ calls: [{ tool: 'byCategory', months: [cm] }] }) } : { ok: true, content: '<b>Odgovor</b> 123' }; };
      go('pitaj'); await sleep(80);
      $('askInput').value = 'Koliko sam potrošila na hranu?';
      $('askBtn').click(); $('askBtn').click();
      await sleep(900);
      const p1 = reqs.filter(r => r.step === 1);
      check('pitaj: dupli klik šalje jedan upit', p1.length === 1, String(p1.length));
      check('pitaj: prvi zahtev bez iznosa i opisa stavki', !!p1[0] && !/77123|77\.123|tajna kupovina/.test(p1[0].prompt), p1[0] && p1[0].prompt.slice(-200));
      const p2 = reqs.find(r => r.step === 2);
      check('pitaj: drugi zahtev nosi lokalni rezultat', !!p2 && /77123/.test(p2.prompt));
      const card = document.querySelector('#askList .ask-card');
      check('pitaj: odgovor kao tekst (bez HTML-a iz AI-ja)', !!card && /<b>Odgovor<\/b> 123/.test(card.querySelector('.ask-answer').textContent) && !card.querySelector('.ask-answer b'));
      check('pitaj: „Šta je poslato AI-ju“ sadrži oba zahteva', !!card && card.querySelectorAll('.ask-sent pre').length === 2);
      window.__fakeAsk = async (req, step) => { reqs.push({ step }); return step === 1 ? { ok: true, content: '{"calls":[],"offTopic":true}' } : { ok: true, content: 'NE SME' }; };
      const before2 = reqs.length;
      $('askInput').value = 'Kakvo je vreme?'; $('askBtn').click(); await sleep(500);
      check('pitaj: pitanje van budžeta bez drugog poziva', reqs.length === before2 + 1 && /samo na pitanja o tvom budžetu/.test(document.querySelector('#askList .ask-card').textContent));
      window.__fakeAsk = async () => ({ ok: false, kind: 'network' });
      $('askInput').value = 'Koliko imam?'; $('askBtn').click(); await sleep(500);
      check('pitaj: greška u prvom koraku daje poruku', /Nema mreže/.test(document.querySelector('#askList .ask-card').textContent));
      window.__fakeAsk = async (req, step) => step === 1 ? { ok: true, content: JSON.stringify({ calls: [{ tool: 'monthSummary', months: [cm] }] }) } : { ok: false, kind: 'toolarge', status: 413 };
      $('askInput').value = 'Pregled svega?'; $('askBtn').click(); await sleep(500);
      check('pitaj: prevelik zahtev daje poruku za Pitaj (ne za račun)', /suzi period/.test(document.querySelector('#askList .ask-card').textContent), document.querySelector('#askList .ask-card').textContent.slice(0, 120));
      window.__deleteEntriesById(['smoke-ask-1']);
      window.__fakeAsk = null;
    } else check('pitaj: hook __fakeAsk', false);

    // Pracenje cena: oznaka promene, najjeftinije, procena, prikaz Cene, istorija, kopija i Excel
    {
      const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      const ago = n => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };
      go('nabavka'); document.querySelector('.shop-show-btn[data-show="prices"]') && document.querySelector('.shop-show-btn[data-show="prices"]').click(); await sleep(80);
      const hasRc = JSON.parse(localStorage.getItem('budzet-stavke-v2') || '[]').some(e => e.receiptId && Array.isArray(e.itemPrices) && e.itemPrices.some(p => p > 0));
      check('cene: prazan prikaz ima poruku ili redove', !!$('shopPrices') && (hasRc ? !!$('shopPrices').querySelector('.price-row') : /Još nema cena/.test($('shopPrices').textContent)), $('shopPrices') && $('shopPrices').textContent.slice(0, 80));
      const R = (id, date, store, items, prices, qty) => ({ id: 'smoke-pr-' + id, type: 'expense', receiptId: 'smokePR' + id, date, desc: store, amount: prices.reduce((a, b) => a + b, 0), category: 'Hrana', paid: true, tags: ['nabavka'], items, itemPrices: prices, itemQty: qty });
      window.__addEntriesRaw([
        R('1', ago(60), 'Smoke Maxi', ['Smokemleko (2 kom)'], [238], [{ qty: 2, unit: 'kom' }]),
        R('2', ago(20), 'Smoke Lidl', ['Smokemleko'], [115], [{ qty: 1, unit: 'kom' }]),
        R('3', ago(2), 'Smoke Maxi', ['Smokemleko (2 kom)'], [258], [{ qty: 2, unit: 'kom' }])
      ]);
      const sh = window.__shopping();
      sh.items.push({ id: 'smoke-pr-item', name: 'Smokemleko', section: 'Ostalo', store: 'Smoke Maxi', category: 'Hrana', price: null, qty: '2 kom', needed: true, checked: false });
      window.__saveShopping();
      document.querySelector('.shop-show-btn[data-show="need"]').click(); await sleep(100);
      const row = document.querySelector('.shop-row[data-row-id="smoke-pr-item"]');
      check('cene: oznaka poskupljenja u redu', !!row && !!row.querySelector('.shop-price-change.up') && /8%/.test(row.querySelector('.shop-price-change.up').textContent), row && row.textContent);
      check('cene: najjeftinije u drugoj prodavnici', !!row && /Smoke Lidl/.test((row.querySelector('.shop-cheapest') || {}).textContent || ''));
      check('cene: procena po ceni sa računa', /258/.test($('shopFooter').textContent) && /po ceni sa računa/.test($('shopFooter').textContent), $('shopFooter').textContent.slice(0, 160));
      document.querySelector('.shop-show-btn[data-show="prices"]').click(); await sleep(100);
      const prow = [...document.querySelectorAll('#shopPrices .price-row')].find(r => /Smokemleko/.test(r.textContent));
      check('cene: prikaz Cene sa artiklom', !!prow);
      const down = document.querySelector('#shopPrices .price-filter[data-f="down"]');
      if (down) { down.click(); await sleep(60); }
      check('cene: filter Pojeftinilo ga skriva', ![...document.querySelectorAll('#shopPrices .price-row')].some(r => /Smokemleko/.test(r.textContent)));
      const all = document.querySelector('#shopPrices .price-filter[data-f="all"]'); if (all) { all.click(); await sleep(60); }
      const prow2 = [...document.querySelectorAll('#shopPrices .price-row')].find(r => /Smokemleko/.test(r.textContent));
      if (prow2) { prow2.click(); await sleep(120); }
      check('cene: istorija sa 3 kupovine i grafikonom', $('dialogOverlay').classList.contains('show') && $('dialogBody').querySelectorAll('tbody tr').length === 3 && !!$('dialogBody').querySelector('svg polyline'));
      if ($('dialogOverlay').classList.contains('show')) $('dialogOk').click();
      const san = window.__sanitizeImportedBackup({ entries: [R('9', ago(1), 'X', ['A', 'B'], [1, 2], [{ qty: 2, unit: 'kg' }, { qty: -1, unit: 'zz' }])] });
      check('cene: kopija čuva količine', JSON.stringify(san.entries[0].itemQty) === JSON.stringify([{ qty: 2, unit: 'kg' }, { qty: 1, unit: 'kom' }]), JSON.stringify(san.entries[0].itemQty));
      const xr = XLSX.utils.sheet_to_json(window.__buildWorkbook().Sheets['Stavke'], { defval: '' }).find(r => r.ID === 'smoke-pr-1');
      check('cene: Excel kolone CeneStavki i Kolicine', !!xr && /"qty":2/.test(xr.Kolicine) && xr.CeneStavki === '[238]', xr && (xr.CeneStavki + ' ' + xr.Kolicine));
      const back = window.__itemArraysFromCells(2, '[10,null]', '[{"qty":0.5,"unit":"kg"},{"qty":3,"unit":"xx"}]');
      check('cene: Excel se čita nazad', JSON.stringify(back) === JSON.stringify({ itemPrices: [10, null], itemQty: [{ qty: 0.5, unit: 'kg' }, { qty: 1, unit: 'kom' }] }), JSON.stringify(back));
      window.__deleteEntriesById(['smoke-pr-1', 'smoke-pr-2', 'smoke-pr-3']);
      window.__shopping().items = window.__shopping().items.filter(i => i.id !== 'smoke-pr-item'); window.__saveShopping();
      document.querySelector('.shop-show-btn[data-show="need"]').click();
    }

    // Ispravke D: dokumenti (obavestenje, tastatura, cuvanje, obnova, Excel, AI grupe), Pitaj, azuriranje, mesec iza tebe, Excel ciljevi
    {
      const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      const now = new Date();
      const cm = monthKey(now);
      // 1) klik na obavestenje istice red dokumenta
      const fId = window.__saveDocumentRaw({ kind: 'dokument', title: 'Smoke D obaveštenje', group: 'Auto', expires: iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3)), remindDays: 30 });
      go('pregled'); await sleep(40);
      window.__openNotificationTarget({ screen: 'dokumenti', rowId: fId }); await sleep(150);
      const fRow = document.querySelector(`#screen-dokumenti .doc-row[data-id="${fId}"]`);
      check('D dokumenti: obaveštenje ističe red', $('screen-dokumenti').classList.contains('active') && !!fRow && fRow.classList.contains('row-flash'), fRow && fRow.className);
      // 5) red se otvara tastaturom (Enter), i kartica na Pregledu je dostupna tastaturom
      if (fRow) { fRow.focus(); fRow.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await sleep(80); }
      check('D dokumenti: Enter na redu otvara zapis', $('docOverlay').classList.contains('show') && $('docTitle').value === 'Smoke D obaveštenje');
      if ($('docOverlay').classList.contains('show')) $('docCancel').click();
      go('pregled'); await sleep(120);
      const remRow = document.querySelector(`#docReminders .doc-row[data-id="${fId}"]`);
      check('D dokumenti: red na Pregledu ima tabindex', !!remRow && remRow.tabIndex === 0);
      if (remRow) { remRow.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })); await sleep(120); }
      check('D dokumenti: razmak na redu Pregleda otvara zapis', $('docOverlay').classList.contains('show') && $('docTitle').value === 'Smoke D obaveštenje');
      if ($('docOverlay').classList.contains('show')) $('docCancel').click();
      // 4a) Esc tokom cuvanja ne zatvara prozor, cuvanje se zavrsava
      go('dokumenti'); await sleep(60);
      const png = await new Promise(r => { const c = document.createElement('canvas'); c.width = 60; c.height = 40; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 60, 40); c.toBlob(r, 'image/png'); });
      const pEsc = window.__addDocFiles([new File([png], 'esc.png', { type: 'image/png' })]); await sleep(900);
      $('docTitle').value = 'Smoke D esc';
      $('docSave').click();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      const openAfterEsc = $('docOverlay').classList.contains('show');
      const escRes = await Promise.race([pEsc, sleep(3000).then(() => 'timeout')]);
      await sleep(100);
      check('D dokumenti: Esc tokom čuvanja ne prekida čuvanje', openAfterEsc && escRes === true && window.__documents().some(d => d.title === 'Smoke D esc') && !$('docOverlay').classList.contains('show'), JSON.stringify({ openAfterEsc, escRes }));
      // 4b) opoziv obnove posle izmene cuva izmenu
      const rExp = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 10));
      const rId = window.__saveDocumentRaw({ kind: 'dokument', title: 'Smoke D obnova', group: 'Auto', expires: rExp, remindDays: 30 });
      window.__renewDocument(rId); await sleep(80);
      const renewed = window.__documents().find(d => d.id === rId);
      window.__saveDocumentRaw(Object.assign({}, renewed, { notes: 'Smoke izmena posle obnove' })); await sleep(50);
      window.__undoTop(); await sleep(80);
      const afterUndo = window.__documents().find(d => d.id === rId);
      check('D dokumenti: opoziv obnove vraća rok, a čuva kasniju izmenu', !!afterUndo && afterUndo.expires === rExp && afterUndo.notes === 'Smoke izmena posle obnove' && !(afterUndo.history || []).length, JSON.stringify(afterUndo));
      // 6) AI-ju idu samo ugradjene grupe, ne korisnikove
      const gId = window.__saveDocumentRaw({ kind: 'dokument', title: 'Smoke D grupa', group: 'Smoke tajna grupa' });
      let docPrompt = '';
      window.__fakeDocReading = req => { docPrompt = req.prompt; return { ok: true, content: '{"kind":"dokument","title":"X"}' }; };
      const pAi = window.__addDocFiles([new File([png], 'ai.png', { type: 'image/png' })]); await sleep(900);
      $('docReadAi').click(); await sleep(400);
      check('D dokumenti: AI prompt bez korisnikovih grupa', /"Tehnika"/.test(docPrompt) && !/Smoke tajna grupa/.test(docPrompt), docPrompt.slice(0, 300));
      $('docCancel').click(); await pAi; window.__fakeDocReading = null;
      // 2) Excel datumi dokumenata (broj iz Excela, dd.mm.gggg, smece -> prazno)
      if (typeof window.__documentsFromWorkbook === 'function') {
        const serial = 46100, pd = XLSX.SSF.parse_date_code(serial);
        const isoSerial = pd.y + '-' + String(pd.m).padStart(2, '0') + '-' + String(pd.d).padStart(2, '0');
        const xwb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(xwb, XLSX.utils.json_to_sheet([
          { ID: 'smoke-xd-1', Vrsta: 'dokument', Naziv: 'Smoke X1', Grupa: 'Auto', Izdato: serial, Istice: '15.03.2027', Podsetnik: '' },
          { ID: 'smoke-xd-2', Vrsta: 'garancija', Naziv: 'Smoke X2', Grupa: 'Tehnika', Izdato: 'nije datum', Istice: '', Podsetnik: 7 }
        ]), 'Dokumenti');
        const xd = window.__documentsFromWorkbook(xwb) || [];
        const x1 = xd.find(d => d.id === 'smoke-xd-1'), x2 = xd.find(d => d.id === 'smoke-xd-2');
        check('D dokumenti: Excel datumi kroz normalizaciju', !!x1 && x1.issued === isoSerial && x1.expires === '2027-03-15' && x1.remindDays === 30 && !!x2 && !x2.issued && !x2.expires && x2.remindDays === 7, JSON.stringify(xd));
      } else check('D dokumenti: hook __documentsFromWorkbook', false);
      window.__documents().filter(d => /^Smoke D /.test(d.title)).forEach(d => window.__deleteDocument(d.id, { confirm: false }));
      void gId;

      // Pitaj: 8) poruka kad AI nije podesen, 9) opseg sa raspodelom, 10) jezik odgovora, 11) predlog dok radi
      go('pitaj'); await sleep(200);
      const ki = await window.desktop.bills.keyInfo();
      if (!ki.set) check('D pitaj: bez ključa poruka „nije podešeno“ i dugme isključeno', /nije podešeno/.test($('askHint').textContent) && $('askBtn').disabled === true, $('askHint').textContent);
      else check('D pitaj: sa ključem nema poruke „nije podešeno“', !/nije podešeno/.test($('askHint').textContent));
      window.__addEntriesRaw([{ id: 'smoke-d-spread', type: 'expense', desc: 'Smoke D osiguranje', amount: 2400, category: 'Ostalo', date: cm + '-01', paid: true, tags: [], spreadMonths: 24 }]);
      const dreqs = [];
      window.__fakeAsk = async (req, step) => { dreqs.push({ step, prompt: req.prompt }); await sleep(250);
        return step === 1 ? { ok: true, content: JSON.stringify({ calls: [{ tool: 'monthSummary', months: [cm] }] }) } : { ok: true, content: '{"odgovor":"ok"}' }; };
      window.__askLang = 'en';
      go('pregled'); await sleep(30); go('pitaj'); await sleep(50);
      $('askInput').value = 'Smoke D pitanje';
      $('askBtn').click(); await sleep(20);
      document.querySelector('.ask-suggest').click(); await sleep(20);
      check('D pitaj: predlog dok radi ne menja pitanje', $('askInput').value === 'Smoke D pitanje', $('askInput').value);
      await sleep(900);
      const d1 = dreqs.find(r => r.step === 1), d2 = dreqs.find(r => r.step === 2);
      const spreadEnd = window.BudzetCore.addMonths(cm, 23);
      check('D pitaj: opseg meseci uključuje raspodelu', !!d1 && d1.prompt.includes('do ' + spreadEnd + '.'), d1 && d1.prompt.split('\n')[1]);
      check('D pitaj: odgovor na jeziku aplikacije', !!d2 && /in English/.test(d2.prompt), d2 && d2.prompt.split('\n')[0]);
      check('D pitaj: predlog nije poslao drugo pitanje', dreqs.filter(r => r.step === 1).length === 1, String(dreqs.length));
      window.__askLang = null; window.__fakeAsk = null;
      window.__deleteEntriesById(['smoke-d-spread']);
      // 12) Podesavanja: pominju opise stavki za najvece troskove / ponavljajuce
      go('podesavanja'); await sleep(60);
      check('D podešavanja: AI tekst pominje opise za najveće troškove i ponavljajuće', /najveće troškove i ponavljajuće stavke/.test($('aiSettings').textContent) && /njihovi opisi/.test($('aiSettings').textContent), $('aiSettings').textContent.slice(-260));

      // 13) traka azuriranja kaze kad je instalacija odlozena zbog cuvanja
      if (typeof window.__renderUpdate === 'function') {
        window.__renderUpdate({ status: 'ready', version: '9.9.9', current: window.desktop.info.version, saveFailed: true });
        check('D ažuriranje: traka kaže da je odloženo zbog čuvanja', /odloženo/.test($('tbUpdateText').textContent) && /nisu mogli da se sačuvaju/.test($('deskUpdateStatus').textContent), $('tbUpdateText').textContent);
        window.__renderUpdate(await window.desktop.update.get());
      }

      // 15) mesec iza tebe: dugme za placanje zaostalih ponavljajucih
      if (window.__recurringRaw) {
        const prevM = window.BudzetCore.addMonths(cm, -1), prev2 = window.BudzetCore.addMonths(cm, -2);
        const rr = { id: 'smoke-d-rec', desc: 'Smoke D struja', amount: 4321, category: 'Ostalo', type: 'expense', day: 5, frequency: 'monthly', anchorMonth: 1 };
        window.__recurringRaw.list().push(rr);
        const ap = window.__recurringRaw.applied(); ap[prev2] = (ap[prev2] || []).concat(rr.id);
        window.__recurringRaw.save();
        window.__addEntriesRaw([{ id: 'smoke-d-prev', type: 'expense', desc: 'Smoke D prošli', amount: 100, category: 'Ostalo', date: prevM + '-03', paid: true, tags: [] }]);
        localStorage.removeItem('budzet-mesecni-pregled-zatvoren-v1');
        go('pregled'); await sleep(60);
        window.__monthReview(cm + '-03'); await sleep(60);
        const payBtn = $('monthReviewPayRec');
        check('D mesec iza tebe: dugme za plaćanje zaostalih ponavljajućih', !!payBtn, $('monthReviewActions').textContent);
        const recEid = 'rec-' + rr.id + '-' + prevM;
        if (payBtn) { payBtn.click(); await sleep(100); }
        check('D mesec iza tebe: plaćanje upisuje rashod za taj mesec', entries().some(e => e.id === recEid && e.amount === 4321 && e.date.startsWith(prevM)) && (window.__recurringRaw.applied()[prevM] || []).includes(rr.id));
        window.__undoTop(); await sleep(80);
        check('D mesec iza tebe: opoziv vraća neplaćeno', !entries().some(e => e.id === recEid) && !(window.__recurringRaw.applied()[prevM] || []).includes(rr.id));
        window.__monthReview(null);
        const list = window.__recurringRaw.list(); list.splice(list.findIndex(r => r.id === rr.id), 1);
        Object.keys(ap).forEach(k => { ap[k] = ap[k].filter(id => id !== rr.id); });
        window.__recurringRaw.save();
        window.__deleteEntriesById(['smoke-d-prev']);
        localStorage.setItem('budzet-mesecni-pregled-zatvoren-v1', prevM);
      } else check('D mesec iza tebe: hook __recurringRaw', false);

      // 16) Excel ciljevi cuvaju racun
      if (typeof window.__goalsFromWorkbook === 'function') {
        const gl = window.__goals();
        gl.push({ id: 'smoke-d-goal', name: 'Smoke D cilj', target: 1000, current: 10, deadline: '', accountId: 'smoke-d-acc' });
        const row = XLSX.utils.sheet_to_json(window.__buildWorkbook().Sheets['Ciljevi'], { defval: '' }).find(r => r.ID === 'smoke-d-goal');
        gl.splice(gl.findIndex(g => g.id === 'smoke-d-goal'), 1);
        const gwb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(gwb, XLSX.utils.json_to_sheet([row || {}]), 'Ciljevi');
        const back = (window.__goalsFromWorkbook(gwb) || []).find(g => g.id === 'smoke-d-goal');
        check('D Excel: cilj čuva račun (izvoz i uvoz)', !!row && row.RacunID === 'smoke-d-acc' && !!back && back.accountId === 'smoke-d-acc', JSON.stringify({ row, back }));
      } else check('D Excel: hook __goalsFromWorkbook', false);
    }
    // Ispravke: racun iz prodavnice (popust, kategorija sa liste, duplikat, razlika, prilozi, undo) i pracenje cena
    if (typeof window.__addReceiptFiles === 'function') {
      const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      const ago = n => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };
      const typeIn = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
      go('nabavka'); await sleep(60);
      window.__addExpenseCategory('Smoke rc2');
      const sh = window.__shopping();
      sh.items.push({ id: 'smoke-fx-sapun', name: 'Smokesapun', section: 'Ostalo', store: '', category: 'Smoke rc2', price: null, qty: '', needed: true, checked: false });
      window.__saveShopping();
      const dA = monthKey(new Date()) + '-03', dB = monthKey(new Date()) + '-04';
      window.__addEntriesRaw([{ id: 'smoke-fx-dup', type: 'expense', desc: 'Smoke dup', amount: 999, category: 'Hrana', date: dA, paid: true, receiptId: 'smokeFxDup' }]);
      const img = await new Promise(r => { const c = document.createElement('canvas'); c.width = 200; c.height = 300; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 200, 300); c.toBlob(r, 'image/jpeg'); });
      window.__fakeReceiptReading = () => ({ ok: true, content: JSON.stringify({ store: 'Smoke Fx', date: dA, total: 160, items: [
        { raw: 'SMOKESAPUN DOVE 100G', name: 'Smokesapun Dove 100g', price: 150, category: '' },
        { raw: 'SMOKEKESA', name: 'Smokekesa', qty: 1, unit: 'kom', price: 10, category: '' }] }) });
      const pA = window.__addReceiptFiles([new File([img], 'fx.jpg', { type: 'image/jpeg' })]); await sleep(1200);
      const stA = window.__receiptState();
      check('račun fix: kategorija sa liste i kad je upareno po početku imena', !!stA && stA.items[0].category === 'Smoke rc2', stA && stA.items[0].category);
      setVal('receiptTotal', '999'); await sleep(30);
      check('račun fix: upozorenje o duplikatu posle izmene ukupnog', /već unet/.test($('receiptStatus').textContent), $('receiptStatus').textContent);
      setVal('receiptTotal', '100'); await sleep(30);
      check('račun fix: upozorenje kad su stavke veće od ukupnog', /veće od ukupnog/.test($('receiptDiff').textContent) && !/već unet/.test($('receiptStatus').textContent), $('receiptDiff').textContent + ' | ' + $('receiptStatus').textContent);
      setVal('receiptTotal', '160'); await sleep(30);
      // rucno upisano: popust -5 i red "Difference to total" 5
      const addRow = async (name, price) => {
        $('receiptAddItem').click(); await sleep(30);
        const rows = document.querySelectorAll('#receiptItems .receipt-row'), row = rows[rows.length - 1];
        typeIn(row.querySelector('input[data-f="name"]'), name); typeIn(row.querySelector('input[data-f="price"]'), price);
      };
      await addRow('Smokepopust', '-5');
      await addRow('Difference to total', '5');
      const n0 = entries().length;
      $('receiptSave').click(); await pA; await sleep(250);
      const madeA = entries().slice(n0);
      const allItems = [].concat(...madeA.map(e => e.items || [])), allPrices = [].concat(...madeA.map(e => e.itemPrices || []));
      check('račun fix: negativna upisana cena je popust, ne ide u itemPrices', madeA.length > 0 && allPrices.every(p => p == null || p >= 0) && !allItems.some(l => /Smokepopust/.test(l)) && allPrices[allItems.indexOf('Smokekesa')] === 5, JSON.stringify(madeA.map(e => [e.items, e.itemPrices])));
      check('račun fix: red razlike se čuva na srpskom', allItems.includes('Razlika do ukupnog') && !allItems.includes('Difference to total'), JSON.stringify(allItems));
      check('račun fix: bez oznake "1 kom"', allItems.includes('Smokekesa') && !allItems.some(l => /\(1 kom\)/.test(l)), JSON.stringify(allItems));
      const attA = (madeA[0] && madeA[0].attachments) || [];
      window.__undoTop(); await sleep(200);
      let restored = attA.length > 0;
      for (const n of attA) { const r = await window.desktop.bills.restoreFile(n); restored = restored && !!(r && r.ok); await window.desktop.bills.deleteFile(n); }
      check('račun fix: undo sklanja slike iz Priloga', restored && !entries().some(e => madeA.some(m => m.id === e.id)), JSON.stringify(attA));
      // racun bez stavki (samo ukupno) + neuspelo cuvanje slike
      window.__fakeReceiptReading = () => ({ ok: true, content: JSON.stringify({ store: 'Smoke Fx2', date: dB, total: 77, items: [] }) });
      window.__fakeSaveFile = () => ({ ok: false, error: 'test' });
      const pB = window.__addReceiptFiles([new File([img], 'fx2.jpg', { type: 'image/jpeg' })]); await sleep(1200);
      const n1 = entries().length;
      $('receiptSave').click(); await pB; await sleep(250);
      window.__fakeSaveFile = null;
      const madeB = entries().slice(n1);
      check('račun fix: neuspelo čuvanje slike se javlja', $('dialogOverlay').classList.contains('show') && /nije sačuvan/.test($('dialogBody').textContent), $('dialogBody').textContent);
      if ($('dialogOverlay').classList.contains('show')) $('dialogOk').click();
      check('račun fix: račun bez stavki ne pravi lažni artikal', madeB.length === 1 && madeB[0].amount === 77 && !(madeB[0].items && madeB[0].items.length) && !BudzetCore.priceObservations(entries()).some(o => o.date === dB && o.store === 'Smoke Fx2'), JSON.stringify(madeB));
      window.__undoTop(); await sleep(100);
      // dupliranje rashoda sa racuna: bez receiptId i priloga, nema nove cene
      const src = { id: 'smoke-fx-src', type: 'expense', desc: 'Smoke Fx3', amount: 50, category: 'Hrana', date: ago(1), paid: true, tags: ['nabavka'], items: ['Smokedupli'], itemPrices: [50], receiptId: 'smokeFx3', attachments: ['smoke-nema.jpg'] };
      window.__addEntriesRaw([src]);
      const nObs = BudzetCore.priceObservations(entries()).filter(o => o.key === 'smokedupli').length;
      if (typeof window.__duplicateEntry === 'function') window.__duplicateEntry(src);
      const copy = entries().find(e => e.desc === 'Smoke Fx3' && e.id !== src.id);
      check('račun fix: kopija rashoda bez receiptId i priloga', !!copy && copy.receiptId === undefined && copy.attachments === undefined && BudzetCore.priceObservations(entries()).filter(o => o.key === 'smokedupli').length === nObs, JSON.stringify(copy));
      window.__deleteEntriesById(['smoke-fx-dup', 'smoke-fx-src'].concat(copy ? [copy.id] : []));
      // cene: istorija se racuna jednom po prikazu, a osvezava posle promene
      const R = (id, date, store, items, prices, qty) => ({ id: 'smoke-fx-' + id, type: 'expense', receiptId: 'smokeFxR' + id, date, desc: store, amount: prices.reduce((a, b) => a + b, 0), category: 'Hrana', paid: true, tags: ['nabavka'], items, itemPrices: prices, itemQty: qty });
      window.__addEntriesRaw([
        R('d1', ago(0), 'Smoke Lidl', ['Smokedanas'], [100], [{ qty: 1, unit: 'kom' }]),
        R('d2', ago(0), 'Smoke Maxi', ['Smokedanas'], [120], [{ qty: 1, unit: 'kom' }]),
        R('s1', ago(10), 'Smoke Maxi', ['Smokesir'], [800], [{ qty: 1, unit: 'kg' }]),
        R('s2', ago(5), 'Smoke Lidl', ['Smokesir'], [300], [{ qty: 1, unit: 'kom' }])
      ]);
      sh.items.push({ id: 'smoke-fx-danas', name: 'Smokedanas', section: 'Ostalo', store: '', category: 'Hrana', price: null, qty: '', needed: true, checked: false },
        { id: 'smoke-fx-sir', name: 'Smokesir', section: 'Ostalo', store: 'Smoke Maxi', category: 'Hrana', price: null, qty: '', needed: true, checked: false });
      window.__saveShopping();
      const origPH = BudzetCore.priceHistory; let phCalls = 0;
      BudzetCore.priceHistory = (...a) => { phCalls++; return origPH(...a); };
      document.querySelector('.shop-show-btn[data-show="need"]').click(); await sleep(60);
      document.querySelector('.shop-show-btn[data-show="need"]').click(); await sleep(60);
      const callsTwo = phCalls;
      window.__addEntriesRaw([R('n1', ago(0), 'Smoke Maxi', ['Smokenovo'], [10], [{ qty: 1, unit: 'kom' }])]);
      sh.items.push({ id: 'smoke-fx-novo', name: 'Smokenovo', section: 'Ostalo', store: '', category: 'Hrana', price: null, qty: '', needed: true, checked: false }); window.__saveShopping();
      document.querySelector('.shop-show-btn[data-show="need"]').click(); await sleep(60);
      BudzetCore.priceHistory = origPH;
      const rowNovo = document.querySelector('.shop-row[data-row-id="smoke-fx-novo"]');
      check('cene fix: istorija cena jednom za dva prikaza, osvežena posle novog računa', callsTwo <= 1 && !!rowNovo && /~/.test(rowNovo.textContent), 'poziva: ' + callsTwo + ' | ' + (rowNovo && rowNovo.textContent));
      const rowD = document.querySelector('.shop-row[data-row-id="smoke-fx-danas"]');
      const ch = rowD && rowD.querySelector('.shop-cheapest');
      check('cene fix: kupovina danas piše "danas"', !!ch && /danas/.test(ch.textContent) && !/pre 0/.test(ch.textContent), ch && ch.textContent);
      const rowS = document.querySelector('.shop-row[data-row-id="smoke-fx-sir"]');
      const tip = rowS && rowS.querySelector('.shop-meta span[title]');
      check('cene fix: jedinica u opisu procene je iz korišćene kupovine', !!tip && /RSD\/kg/.test(tip.title), tip && tip.title);
      window.__deleteEntriesById(['smoke-fx-d1', 'smoke-fx-d2', 'smoke-fx-s1', 'smoke-fx-s2', 'smoke-fx-n1']);
      // preimenovanje stavke liste ne gubi istoriju kupovina; sakrivanje predloga cisti stara sakrivanja
      const P = (id, n) => ({ id: 'smoke-fx-p' + id, type: 'expense', desc: 'Smoke Fx4', amount: 10, category: 'Hrana', date: ago(n), paid: true, items: ['Smokepreime'] });
      window.__addEntriesRaw([P('1', 74), P('2', 67), P('3', 60)]);
      sh.items.push({ id: 'smoke-fx-pre', name: 'Smokepreime', section: 'Ostalo', store: '', category: 'Hrana', price: null, qty: '', needed: false, checked: false });
      sh.dismissed = Object.assign({}, sh.dismissed, { 'smoke stara stvar': '2020-01-01' });
      window.__saveShopping();
      document.querySelector('.shop-show-btn[data-show="all"]').click(); await sleep(80);
      const editBtn = document.querySelector('.shop-edit[data-id="smoke-fx-pre"]');
      if (editBtn) {
        editBtn.click(); await sleep(60);
        $('edit-field-name').value = 'Smokepreime novo';
        $('editModalSave').click(); await sleep(100);
      }
      const sugg = [...document.querySelectorAll('#shopSuggest .shop-suggest-row')].find(r => /Smokepreime/.test(r.textContent));
      check('nabavka fix: preimenovana stavka zadržava istoriju kupovina', !!sugg && /Smokepreime novo/.test(sugg.textContent) && (window.__shopping().items.find(i => i.id === 'smoke-fx-pre').aliases || []).includes('Smokepreime'), sugg ? sugg.textContent : 'nema predloga');
      if (sugg) { sugg.querySelector('.shop-suggest-hide').click(); await sleep(60); }
      const dis = window.__shopping().dismissed || {};
      check('nabavka fix: sakrivanje predloga čisti zastarela sakrivanja', !!dis['smokepreime novo'] && !('smoke stara stvar' in dis), JSON.stringify(dis));
      window.__deleteEntriesById(['smoke-fx-p1', 'smoke-fx-p2', 'smoke-fx-p3']);
      window.__shopping().items = window.__shopping().items.filter(i => !i.id.startsWith('smoke-fx-'));
      delete window.__shopping().dismissed['smokepreime novo'];
      window.__saveShopping();
      document.querySelector('.shop-show-btn[data-show="need"]').click();
      window.__deleteExpenseCategory('Smoke rc2');
      window.__fakeReceiptReading = null;
    } else check('račun fix: hook __addReceiptFiles', false);

    // ---- Popravke: kucni racuni i uplatnica ----
    if (typeof window.__setBillState === 'function') {
      const B = () => window.__bills();
      const waitFor = async (cond, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (cond()) return true; await sleep(50); } return false; };
      const billReady = () => waitFor(() => $('billOverlay').classList.contains('show') && !$('billSavePaid').disabled, 6000);
      const slipReady = () => waitFor(() => /Pročitano/.test($('ipsImageStatus').textContent), 6000);
      const recs = () => JSON.parse(localStorage.getItem('budzet-ponavljajuce-v1') || '[]');
      const delRec = async id => {
        go('ponavljajuce'); await sleep(80);
        const del = document.querySelector(`.recurring-item[data-row-id="${CSS.escape(id)}"] .del-btn`);
        if (del) { del.click(); await sleep(400); if ($('dialogOverlay').classList.contains('show')) { $('dialogOk').click(); await sleep(400); } }
      };
      // 1) Podesavanja ne prave lokaciju "Stan" korisniku koji ne koristi racune
      const snap = JSON.parse(JSON.stringify(B()));
      window.__setBillState({ locations: [], billTypes: [], bills: [] });
      go('podesavanja'); await sleep(80);
      check('fix: Podešavanja ne prave podrazumevanu lokaciju', B().locations.length === 0 && B().billTypes.length === 0, JSON.stringify(B().locations));
      $('billAddLoc').click(); await sleep(50);
      check('fix: Dodaj lokaciju bez lokacija pravi jednu sa vrstama', B().locations.length === 1 && B().billTypes.length === 4, B().locations.length + '/' + B().billTypes.length);
      window.__setBillState(snap);
      window.__ensureBillDefaults();
      const stan = B().locations[0];
      const struja = B().billTypes.find(x => x.locationId === stan.id && x.name === 'Struja');
      const voda = B().billTypes.find(x => x.locationId === stan.id && x.name === 'Voda');
      const pdfFile = new File([tinyPdf(['Smoke popravke', 'Ukupno za uplatu 40'])], 'fix.pdf', { type: 'application/pdf' });
      const read = obj => () => ({ ok: true, content: JSON.stringify(Object.assign({ locationId: stan.id, billTypeId: struja.id }, obj)) });
      // 3) valuta sa racuna razlicita od valute lokacije -> upozorenje; 6) pdf.js dokument se zatvara
      window.__fakeBillReading = read({ month: '2023-03', amount: 40, currency: 'EUR' });
      const c1 = window.__addBillFiles([pdfFile]); await billReady();
      check('fix: upozorenje kad je valuta sa računa druga od valute lokacije', !!$('billCurWarn') && /EUR/.test($('billCurWarn').textContent) && /RSD/.test($('billCurWarn').textContent), $('billCurWarn') && $('billCurWarn').textContent);
      check('fix: pdf.js dokument zatvoren posle čitanja', typeof window.__pdfDocsOpen === 'function' && window.__pdfDocsOpen() === 0, typeof window.__pdfDocsOpen === 'function' && window.__pdfDocsOpen());
      $('billCancel').click(); await c1;
      window.__fakeBillReading = read({ month: '2023-03', amount: 40 });
      const c2 = window.__addBillFiles([pdfFile]); await billReady();
      check('fix: bez pročitane valute nema upozorenja', !$('billCurWarn') || !$('billCurWarn').textContent, $('billCurWarn') && $('billCurWarn').textContent);
      $('billCancel').click(); await c2;
      // 5) zatvoren prozor "Citam racun..." odbacuje kasni rezultat
      window.__fakeBillReading = async () => { await sleep(900); return read({ month: '2023-04', amount: 77 })(); };
      const c3 = window.__addBillFiles([pdfFile]); await sleep(300);
      $('billCancel').click(); await sleep(1300);
      check('fix: zatvaranje prozora tokom čitanja odbacuje kasni rezultat', !$('billOverlay').classList.contains('show'));
      if ($('billOverlay').classList.contains('show')) $('billCancel').click();
      await Promise.race([c3, sleep(300)]);
      // 4) zamena i izmena racuna azuriraju povezani rashod (placen, kategorija, datum)
      const oldCat = struja.category;
      const newCat = [...$('recCategory').options].map(o => o.value).find(v => v && v !== oldCat);
      window.__fakeBillReading = read({ month: '2023-05', amount: 100 });
      const r1 = window.__addBillFiles([pdfFile]); await billReady();
      $('billExpMonth').value = '2023-06'; $('billExpMonth').dispatchEvent(new Event('change'));
      $('billSavePending').click(); await r1; await sleep(150);
      const b1 = B().bills.find(b => b.billTypeId === struja.id && b.month === '2023-05');
      const e1 = b1 && entries().find(e => e.id === b1.entryId);
      check('fix: račun za plaćanje -> neplaćen rashod', !!e1 && e1.paid === false && e1.date === '2023-06-30', JSON.stringify(e1));
      struja.category = newCat;
      window.__fakeBillReading = read({ month: '2023-05', amount: 120, dueDate: '2023-07-15' });
      const r2 = window.__addBillFiles([pdfFile]); await billReady();
      $('billExpMonth').value = '2023-07'; $('billExpMonth').dispatchEvent(new Event('change'));
      $('billSavePaid').click(); await r2; await sleep(150);
      const e2 = b1 && entries().find(e => e.id === b1.entryId);
      check('fix: zamena ažurira povezani rashod (plaćen, kategorija, datum, iznos)', !!e2 && e2.paid !== false && e2.category === newCat && e2.date === '2023-07-15' && e2.amount === 120
        && B().bills.filter(b => b.billTypeId === struja.id && b.month === '2023-05').length === 1, JSON.stringify(e2));
      const b2 = b1 && B().bills.find(b => b.id === b1.id);
      if (b2 && voda) {
        const ed = window.__openBillReview({ bill: b2 }); await sleep(100);
        $('billType').value = voda.id; $('billType').dispatchEvent(new Event('change'));
        $('billDue').value = '2023-07-20';
        $('billSavePaid').click(); await ed; await sleep(150);
        const e3 = entries().find(e => e.id === b1.entryId);
        check('fix: izmena računa (vrsta, rok) ažurira kategoriju i datum rashoda', !!e3 && e3.category === voda.category && e3.date === '2023-07-20', JSON.stringify(e3));
      }
      struja.category = oldCat;
      if (b1) { window.__deleteBill(b1.id, { confirm: false }); window.__deleteEntriesById([b1.entryId]); }
      // 7) "Otvori prilog" bez fajla javlja poruku
      const ghost = { id: 'smoke-ghost-bill', billTypeId: struja.id, month: '2023-08', amount: 5, currency: 'RSD', values: {}, source: 'manual', file: 'smoke-nema-ovog-fajla.pdf' };
      window.__setBillState({ locations: B().locations, billTypes: B().billTypes, bills: B().bills.concat(ghost) });
      if (typeof window.__openBillDetail === 'function') {
        window.__openBillDetail([ghost.id]); await sleep(100);
        const ob = document.querySelector('#dialogBody .bill-detail [data-act="open"]');
        if (ob) { ob.click(); await sleep(400); }
        check('fix: „Otvori prilog“ javlja kad fajl ne postoji', /nije pronađen/.test($('dialogBody').textContent), $('dialogBody').textContent.slice(0, 200));
        if ($('dialogOverlay').classList.contains('show')) $('dialogOk').click();
      } else check('fix: hook __openBillDetail', false);
      window.__setBillState({ locations: B().locations, billTypes: B().billTypes, bills: B().bills.filter(b => b.id !== ghost.id) });
      // 8) IPS placanje uzima poziv na broj sa racuna ovog meseca
      go('ponavljajuce'); await sleep(60);
      setVal('recDesc', '');
      window.__fillRecFromSlipText('K:PR|V:01|C:1|R:845000000040484987|N:Smoke Ref Primalac|I:RSD100,00|SF:189');
      setVal('recDay', '28'); $('recAutoPay').checked = false;
      $('recurringForm').requestSubmit(); await sleep(150);
      const refRec = recs().find(r => r.desc === 'Smoke Ref Primalac');
      if (refRec) {
        const rb = { id: 'smoke-ref-bill', billTypeId: struja.id, month: monthKey(new Date()), expenseMonth: monthKey(new Date()), amount: 100, currency: 'RSD', values: {}, source: 'qr', recurringId: refRec.id,
          payee: { account: '845000000040484987', name: 'Smoke Ref Primalac', code: '189', purpose: '', model: '', reference: '2023555' } };
        window.__setBillState({ locations: B().locations, billTypes: B().billTypes, bills: B().bills.concat(rb) });
        window.__openIps(refRec.id, 'pay'); await sleep(100);
        check('fix: IPS plaćanje koristi poziv na broj sa računa', /RO:002023555/.test($('ipsQr').dataset.text || '') && /2023555/.test($('ipsInfo').textContent), $('ipsQr').dataset.text);
        $('ipsClose').click();
        window.__setBillState({ locations: B().locations, billTypes: B().billTypes, bills: B().bills.filter(b => b.id !== rb.id) });
        await delRec(refRec.id);
      } else check('fix: ponavljajuća sa uplatnice napravljena', false);
      window.__fakeBillReading = null;
      // 9, 11, 13) jednokratna uplatnica
      const slip = { name: 'JKP Smoke Jednokratno', account: '845-0000000404849-87', code: '189', amount: 300, purpose: 'Komunalije', model: '', reference: '' };
      window.__fakeSlipReading = () => ({ ok: true, content: JSON.stringify(slip) });
      const blank = await new Promise(r => { const c = document.createElement('canvas'); c.width = 400; c.height = 200; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 400, 200); c.toBlob(r, 'image/png'); });
      const setFile = (id, f) => { const dt = new DataTransfer(); dt.items.add(f); $(id).files = dt.files; $(id).dispatchEvent(new Event('change')); };
      const otherCat = [...$('recCategory').options].map(o => o.value).find(v => v && v !== 'Stanovanje');
      const made = [];
      go('rashodi'); await sleep(60);
      setFile('expSlipInput', new File([blank], 'f1.png', { type: 'image/png' })); await slipReady();
      $('ipsPrimary').click(); await sleep(120);
      check('fix: posle „Dalje“ fokus je na iznosu (ne na dugmetu „Plaćeno“)', document.activeElement === $('ipsAmount'), document.activeElement && document.activeElement.id);
      setVal('ipsAmount', '1234.567'); $('ipsOneOffCat').value = otherCat;
      $('ipsMakeRec').checked = true;
      let nE = entries().length;
      $('ipsPrimary').click(); $('ipsMakeRec').checked = false;
      await waitFor(() => entries().length > nE && !$('ipsOverlay').classList.contains('show'), 4000);
      const sr = recs().filter(r => r.desc === 'JKP Smoke Jednokratno');
      const se = entries().slice(nE);
      se.forEach(e => made.push(e.id));
      check('fix: „Sačuvaj i kao ponavljajuću“ se čita u trenutku klika', sr.length === 1, String(sr.length));
      check('fix: iznos ponavljajuće i rashoda zaokružen na pare', sr.length === 1 && sr[0].amount === 1234.57 && se.length === 1 && se[0].amount === 1234.57, JSON.stringify({ r: sr[0] && sr[0].amount, e: se.map(e => e.amount) }));
      check('fix: dugme „Plaćeno“ ponovo aktivno', !$('ipsPrimary').disabled);
      setFile('expSlipInput', new File([blank], 'f2.png', { type: 'image/png' })); await slipReady();
      $('ipsPrimary').click(); await sleep(120);
      check('fix: nova uplatnica ne nasleđuje kategoriju prethodne', $('ipsOneOffCat').value !== otherCat, $('ipsOneOffCat').value);
      setVal('ipsAmount', '500'); $('ipsMakeRec').checked = true;
      nE = entries().length;
      $('ipsPrimary').click(); await waitFor(() => entries().length > nE && !$('ipsOverlay').classList.contains('show'), 4000);
      entries().slice(nE).forEach(e => made.push(e.id));
      check('fix: ne pravi duplu ponavljajuću za istog primaoca', recs().filter(r => r.desc === 'JKP Smoke Jednokratno').length === 1 && entries().length === nE + 1, recs().filter(r => r.desc === 'JKP Smoke Jednokratno').length + ' / ' + (entries().length - nE));
      if ($('ipsOverlay').classList.contains('show')) $('ipsClose').click();
      // isti primalac i naziv, drugi poziv na broj: pita pre nove ponavljajuce; "Samo rashod" ne pravi novu
      if ($('ipsOverlay').classList.contains('show')) $('ipsClose').click();
      if ($('dialogOverlay').classList.contains('show')) $('dialogOk').click();
      await sleep(60);
      const prevFake = window.__fakeSlipReading;
      const twinSlip = ref => () => ({ ok: true, content: JSON.stringify(Object.assign({}, slip, { name: 'JKP Smoke Dva Stana', model: '', reference: ref })) });
      const paySlip = async (ref, amt, name) => {
        window.__fakeSlipReading = twinSlip(ref);
        setFile('expSlipInput', new File([blank], name, { type: 'image/png' })); await slipReady();
        $('ipsPrimary').click(); await sleep(120);
        setVal('ipsAmount', amt); $('ipsMakeRec').checked = true;
        $('ipsPrimary').click();
      };
      nE = entries().length;
      await paySlip('111', '700', 'f3.png');
      await waitFor(() => entries().length > nE && !$('ipsOverlay').classList.contains('show'), 4000);
      entries().slice(nE).forEach(e => made.push(e.id));
      const twins = () => recs().filter(r => r.payee && r.payee.name === 'JKP Smoke Dva Stana');
      nE = entries().length;
      await paySlip('987654', '800', 'f4.png');
      await waitFor(() => $('dialogOverlay').classList.contains('show'), 3000);
      check('fix: drugi poziv na broj pita pre nove ponavljajuće', twins().length === 1 && $('dialogOverlay').classList.contains('show') && /drugim pozivom na broj/.test($('dialogBody').textContent), twins().length + ' ' + $('dialogBody').textContent.slice(0, 120));
      if ($('dialogOverlay').classList.contains('show')) $('dialogCancel').click();
      await waitFor(() => entries().length > nE && !$('ipsOverlay').classList.contains('show'), 4000);
      entries().slice(nE).forEach(e => made.push(e.id));
      check('fix: „Samo rashod“ pravi rashod bez nove ponavljajuće', twins().length === 1 && entries().length === nE + 1, twins().length + ' / ' + (entries().length - nE));
      window.__fakeSlipReading = prevFake;
      // 10) valuta sa uplatnice
      window.__fakeSlipReading = () => ({ ok: true, content: JSON.stringify(Object.assign({}, slip, { amount: 10, currency: 'EUR' })) });
      setFile('expSlipInput', new File([blank], 'f3.png', { type: 'image/png' })); await slipReady();
      check('fix: uplatnica u stranoj valuti -> upozorenje', /EUR/.test($('ipsProblems').textContent), $('ipsProblems').textContent);
      $('ipsPrimary').click(); await sleep(120);
      check('fix: iznos u EUR se ne nudi kao dinari', $('ipsAmount').value !== '10', $('ipsAmount').value);
      $('ipsClose').click();
      go('ponavljajuce'); await sleep(60);
      setVal('recDesc', '');
      window.__fillRecFromSlipText('K:PR|V:01|C:1|R:845000000040484987|N:Smoke Evro|I:EUR10,00|SF:189');
      check('fix: nova ponavljajuća sa uplatnice dobija valutu uplatnice', $('recCurrency').value === 'EUR', $('recCurrency').value);
      $('recCurrency').value = 'RSD'; $('recCurrency').dispatchEvent(new Event('change')); setVal('recDesc', ''); setVal('recAmount', '');
      window.__fakeSlipReading = null;
      window.__deleteEntriesById(made);
      for (const r of recs().filter(r => r.desc === 'JKP Smoke Jednokratno')) await delRec(r.id);
      for (const r of recs().filter(r => r.payee && r.payee.name === 'JKP Smoke Dva Stana')) await delRec(r.id);
      // 12) 📎 za uplatnicu
      window.__addEntriesRaw([{ id: 'smoke-slip-att', type: 'expense', desc: 'Smoke uplatnica', amount: 5, category: 'Stanovanje', date: monthKey(new Date()) + '-01', paid: true, tags: [], attachments: ['2026-10-01-uplatnica-smoke.png'] }]);
      go('rashodi'); await sleep(80);
      const ab = document.querySelector('.att-btn[data-id="smoke-slip-att"]');
      check('fix: 📎 uplatnice kaže „Otvori uplatnicu“, bez „+ garancija“', !!ab && ab.title === 'Otvori uplatnicu' && !ab.closest('tr').querySelector('.warranty-btn'), ab && ab.title);
      window.__deleteEntriesById(['smoke-slip-att']);
    } else check('fix: hook __setBillState', false);

    // Uvoz AI posle pregleda: delimican neuspeh se vidi, poruka bez "racuna", nema pravila za Ostalo,
    // izmena kategorije ne vraca iskljucenu stiklicu, sukob kljucnih reci se prijavljuje, pregled prati izmenu
    if ('__fakeImportCategorizing' in window && typeof window.__catRules === 'function') {
      const m = monthKey(new Date());
      const rules0 = window.__catRules().slice();
      const catsI = window.__desktopBridge.getQuickAddData().expenseCats;
      const fb = catsI.includes('Ostalo') ? 'Ostalo' : catsI[0];
      const pickAi = d => /SMOKEDUPLA A/.test(d) ? { category: 'Hrana', keyword: 'SMOKEDUPLA' } : /SMOKEDUPLA B/.test(d) ? { category: 'Zabava', keyword: 'SMOKEDUPLA' }
        : /SMOKEOSTALO/.test(d) ? { category: fb, keyword: 'SMOKEOSTALO' } : /SMOKEPREGLED/.test(d) ? { category: 'Prevoz', keyword: 'SMOKEPREGLED' }
        : /SMOKESTIK/.test(d) ? { category: 'Zabava', keyword: 'SMOKESTIK' } : { category: '', keyword: '' };
      let aiCalls = 0;
      window.__fakeImportCategorizing = req => {
        aiCalls++;
        if (!/SMOKEPREGLED/.test(req.prompt)) return { ok: false, kind: 'toolarge' };
        const items = req.prompt.split('\n').map(l => /^(\d+): (.*)$/.exec(l)).filter(Boolean).map(x => Object.assign({ i: +x[1] }, pickAi(x[2])));
        return { ok: true, content: JSON.stringify({ items }) };
      };
      const letters = k => String.fromCharCode(65 + Math.floor(k / 26)) + String.fromCharCode(65 + k % 26);
      let csvB = 'Datum;Opis;Iznos\n';
      ['SMOKEDUPLA A', 'SMOKEDUPLA B', 'SMOKEOSTALO X', 'SMOKEPREGLED Y', 'SMOKESTIK Z'].forEach((d, k) => { csvB += m + '-01;' + d + ';-' + (4100 + k) + ',37\n'; });
      for (let k = 0; k < 60; k++) csvB += m + '-' + String(2 + k % 20).padStart(2, '0') + ';SMOKEPUN ' + letters(k) + ';-' + (5100 + k) + ',37\n';
      const pB = window.__runImportText([{ name: 'ai2.csv', text: csvB }]); await sleep(900);
      const body = $('dialogBody');
      const rowB = re => [...body.querySelectorAll('.import-ai-row')].find(r => re.test(r.textContent));
      const errEl = body.querySelector('.import-ai-error');
      check('uvoz AI: delimičan neuspeh se prikazuje', aiCalls === 2 && !!rowB(/SMOKEPREGLED/) && !!errEl && errEl.textContent.length > 0, aiCalls + ' ' + (errEl ? errEl.textContent : 'nema poruke'));
      check('uvoz AI: poruka o grešci ne pominje račun', !!errEl && !/račun/i.test(errEl.textContent), errEl && errEl.textContent);
      const osR = rowB(/SMOKEOSTALO/), osCb = osR && osR.querySelector('input[type=checkbox]');
      check('uvoz AI: predlog za Ostalo nije štikliran', !!osCb && !osCb.checked);
      if (osCb) { osCb.checked = true; osCb.dispatchEvent(new Event('change', { bubbles: true })); }
      const stR = rowB(/SMOKESTIK/);
      if (stR) {
        const cb = stR.querySelector('input[type=checkbox]'); cb.checked = false; cb.dispatchEvent(new Event('change', { bubbles: true }));
        const sl = stR.querySelector('select'); sl.value = 'Hrana'; sl.dispatchEvent(new Event('change', { bubbles: true }));
        check('uvoz AI: promena kategorije ne vraća isključenu štiklicu', !cb.checked);
      } else check('uvoz AI: red SMOKESTIK', false);
      const prR = rowB(/SMOKEPREGLED/);
      if (prR) { const sl = prR.querySelector('select'); sl.value = 'Zdravlje'; sl.dispatchEvent(new Event('change', { bubbles: true })); }
      const prevRow = [...body.querySelectorAll('table tr')].find(tr => /SMOKEPREGLED/.test(tr.textContent));
      check('uvoz AI: pregled prikazuje izmenjenu kategoriju', !!prevRow && prevRow.children[2].textContent === 'Zdravlje', prevRow && prevRow.textContent);
      $('dialogOk').click(); await pB; await sleep(150);
      const rulesB = window.__catRules();
      check('uvoz AI: nema pravila za Ostalo', !rulesB.some(r => /SMOKEOSTALO/i.test(r.keyword)), JSON.stringify(rulesB.slice(-6)));
      check('uvoz AI: isključeno pravilo nije napravljeno', !rulesB.some(r => /SMOKESTIK/i.test(r.keyword)) && (entries().find(e => /SMOKESTIK/.test(e.desc)) || {}).category === 'Hrana');
      check('uvoz AI: sukob ključnih reči se prijavljuje', rulesB.filter(r => /SMOKEDUPLA/i.test(r.keyword)).length === 1 && /SMOKEDUPLA/.test($('csvImportStatus').textContent), $('csvImportStatus').textContent);
      check('uvoz AI: izmenjena kategorija ide u stavku', (entries().find(e => /SMOKEPREGLED/.test(e.desc)) || {}).category === 'Zdravlje');
      window.__undoTop(); await sleep(150);
      window.__setCatRules(rules0);
      window.__fakeImportCategorizing = null;
    } else check('uvoz AI posle pregleda: hook', false);

    // Telegram: tekst -> rashod, dupli update, ponisti, komande, bez iznosa, podesavanja
    {
      check('telegram: most postoji', !!window.__telegramBridge && typeof window.__telegramBridge.handle === 'function');
      if (window.__telegramBridge) {
        const B = window.__telegramBridge;
        const ents = () => JSON.parse(localStorage.getItem('budzet-stavke-v2') || '[]');
        window.__fakeTgCategory = async () => ({ ok: true, content: JSON.stringify({ kategorija: 'Ostalo' }) });
        const n0 = ents().length;
        const r1 = await B.handle({ update_id: 900001, kind: 'text', text: 'Smoke tg kafa 250' });
        const e1 = ents().find(e => e.desc === 'Smoke tg kafa');
        check('telegram: tekst postaje rashod', !!e1 && e1.amount === 250 && e1.type === 'expense', JSON.stringify(e1));
        check('telegram: odgovor sa iznosom i dugmetom Poništi', /✓/.test(r1.replies[0].text) && /250/.test(r1.replies[0].text) && /^u:/.test(r1.replies[0].buttons[0][0].data), JSON.stringify(r1));
        const r1b = await B.handle({ update_id: 900001, kind: 'text', text: 'Smoke tg kafa 250' });
        check('telegram: isti update se ne upisuje dvaput', ents().length === n0 + 1 && r1b.replies.length === 0);
        const r2 = await B.handle({ update_id: 900002, kind: 'callback', data: r1.replies[0].buttons[0][0].data, messageId: 5 });
        check('telegram: Poništi briše rashod i menja poruku', !ents().some(e => e.desc === 'Smoke tg kafa') && r2.replies[0].editMessageId === 5, JSON.stringify(r2));
        const r3 = await B.handle({ update_id: 900003, kind: 'text', text: 'Smoke tg kafa' });
        check('telegram: bez iznosa ne upisuje', ents().length === n0 && /iznos/i.test(r3.replies[0].text), r3.replies[0] && r3.replies[0].text);
        const r4 = await B.handle({ update_id: 900004, kind: 'text', text: '/pomoc' });
        check('telegram: /pomoc daje uputstvo', /kafa 250/.test(r4.replies[0].text));
        await B.handle({ update_id: 900005, kind: 'text', text: '+Smoke tg honorar 3000' });
        check('telegram: + znači prihod', ents().some(e => e.desc === 'Smoke tg honorar' && e.type === 'income' && e.amount === 3000));
        const r6 = await B.handle({ update_id: 900006, kind: 'text', text: '/ponisti' });
        check('telegram: /ponisti poništava poslednji unos', !ents().some(e => e.desc === 'Smoke tg honorar') && /Poništeno/.test(r6.replies[0].text), r6.replies[0] && r6.replies[0].text);
        window.__fakeTgCategory = null;
      }
      go('podesavanja'); await sleep(150);
      check('telegram: podešavanja imaju odeljak', !!$('tgSettings') && $('tgSettings').style.display !== 'none' && !!$('tgToken') && !!$('tgPair'));
    }

    // Telegram: slika -> vrsta -> sazetak -> Sacuvaj/Odbaci/Otvori; cekanje posle osvezavanja; zauzet prozor; dupli klik
    if (window.__telegramBridge) {
      const B = window.__telegramBridge;
      const ents = () => JSON.parse(localStorage.getItem('budzet-stavke-v2') || '[]');
      const pend = () => JSON.parse(localStorage.getItem('budzet-telegram-cekanje-v1') || '[]');
      const png = await new Promise(r => { const c = document.createElement('canvas'); c.width = 40; c.height = 40; c.getContext('2d').fillRect(0, 0, 40, 40); c.toBlob(b => b.arrayBuffer().then(a => r(new Uint8Array(a))), 'image/png'); });
      const b64 = btoa(String.fromCharCode(...png));
      const file = { base64: b64, name: 'telegram.png', mime: 'image/png' };
      window.__fakeReceiptReading = () => ({ ok: true, content: JSON.stringify({ store: 'Smoke TG Maxi', date: '2026-09-28', total: 300, items: [{ name: 'Smoke TG hleb', qty: 1, unit: 'kom', price: 100, category: 'Hrana' }, { name: 'Smoke TG sapun', qty: 1, unit: 'kom', price: 200, category: 'Hrana' }] }) });
      // bez opisa -> pitanje o vrsti
      const a1 = await B.handle({ update_id: 900101, kind: 'file', caption: '', progressMessageId: 41, file });
      const ask = a1.replies[0];
      check('telegram: slika bez opisa pita za vrstu', ask.editMessageId === 41 && ask.buttons.flat().some(b => /^k:.+:receipt$/.test(b.data)), JSON.stringify(a1));
      const kData = ask.buttons.flat().find(b => /:receipt$/.test(b.data)).data;
      const a2 = await B.handle({ update_id: 900102, kind: 'callback', data: kData, messageId: 41 });
      const sum = a2.replies[0];
      check('telegram: sažetak računa sa dugmadima', /Smoke TG Maxi/.test(sum.text) && /300/.test(sum.text) && sum.buttons.flat().some(b => /^s:/.test(b.data)), sum.text);
      const sData = sum.buttons.flat().find(b => /^s:/.test(b.data)).data;
      // zauzet prozor: korisnik ima otvoren prozor za racun -> nista se ne dira
      $('receiptOverlay').classList.add('show');
      const busy = await B.handle({ update_id: 900103, kind: 'callback', data: sData, messageId: 41 });
      check('telegram: Sačuvaj dok je prozor otvoren ne dira prozor', !ents().some(e => e.desc === 'Smoke TG Maxi') && !!busy.callbackText && $('receiptOverlay').classList.contains('show'), JSON.stringify(busy));
      $('receiptOverlay').classList.remove('show');
      const a3 = await B.handle({ update_id: 900104, kind: 'callback', data: sData, messageId: 41 });
      const saved = ents().filter(e => e.desc === 'Smoke TG Maxi');
      check('telegram: Sačuvaj upisuje račun sa prilogom', saved.length === 1 && saved[0].amount === 300 && (saved[0].attachments || []).length === 1 && /✓/.test(a3.replies[0].text), JSON.stringify(saved));
      const a4 = await B.handle({ update_id: 900105, kind: 'callback', data: sData, messageId: 41 });
      check('telegram: dupli klik Sačuvaj ne upisuje dvaput', ents().filter(e => e.desc === 'Smoke TG Maxi').length === 1 && /više nije na čekanju/.test(a4.callbackText || '') && a4.replies.length === 0, JSON.stringify(a4));
      // opis "struja" -> kucni racun; Odbaci; cekanje ostaje posle ponovnog citanja iz localStorage
      const stT = window.__bills().billTypes.find(x => /struja/i.test(x.name));
      window.__fakeBillReading = () => ({ ok: true, content: JSON.stringify({ locationId: stT && stT.locationId, billTypeId: stT && stT.id, month: '2026-09', amount: 4321, dueDate: '2026-10-15' }) });
      const b1 = await B.handle({ update_id: 900106, kind: 'file', caption: 'struja', progressMessageId: 42, file });
      check('telegram: opis „struja“ odmah čita kućni račun', /4[.,]?321/.test(b1.replies[0].text) && b1.replies[0].buttons.flat().some(b => /^s:.+:n$/.test(b.data)), b1.replies[0].text);
      check('telegram: na čekanju je sačuvano', pend().some(p => p.kind === 'bill'));
      const xData = b1.replies[0].buttons.flat().find(b => /^x:/.test(b.data)).data;
      const b2 = await B.handle({ update_id: 900107, kind: 'callback', data: xData, messageId: 42 });
      check('telegram: Odbaci ne pravi ništa', !pend().some(p => p.kind === 'bill') && /Odbačeno/.test(b2.replies[0].text) && !window.__bills().bills.some(b => b.amount === 4321), b2.replies[0].text);
      // Otvori u aplikaciji -> prozor za racun iz prodavnice sa procitanim stavkama
      const c1 = await B.handle({ update_id: 900108, kind: 'file', caption: 'maxi', progressMessageId: 43, file });
      const oData = c1.replies[0].buttons.flat().find(b => /^o:/.test(b.data)).data;
      await B.handle({ update_id: 900109, kind: 'callback', data: oData, messageId: 43 }); await sleep(300);
      check('telegram: Otvori otvara prozor za pregled', $('receiptOverlay').classList.contains('show') && window.__receiptState().items.length === 2, String(window.__receiptState() && window.__receiptState().items.length));
      $('receiptCancel').click(); await sleep(80);
      // AI zauzet -> ponovni pokusaj u tick
      window.__fakeReceiptReading = () => ({ ok: false, kind: 'limit', retryAfter: 30 });
      const d1 = await B.handle({ update_id: 900110, kind: 'file', caption: 'maxi', progressMessageId: 44, file });
      check('telegram: AI zauzet -> poruka i čekanje', /zauzet/.test(d1.replies[0].text) && pend().some(p => p.retryAt), d1.replies[0].text);
      const pl = pend(); pl.forEach(p => { if (p.retryAt) p.retryAt = Date.now() - 1; }); localStorage.setItem('budzet-telegram-cekanje-v1', JSON.stringify(pl));
      window.__fakeReceiptReading = () => ({ ok: true, content: JSON.stringify({ store: 'Smoke TG Lidl', date: '2026-09-28', total: 50, items: [{ name: 'Smoke TG voda', price: 50, category: 'Hrana' }] }) });
      const t1 = await B.tick();
      check('telegram: tick ponovo čita i šalje sažetak', t1.replies.some(r => r.editMessageId === 44 && /Smoke TG Lidl/.test(r.text)), JSON.stringify(t1));
      // isticanje posle 7 dana
      const pl2 = pend(); pl2.forEach(p => { p.created = Date.now() - 8 * 864e5; }); localStorage.setItem('budzet-telegram-cekanje-v1', JSON.stringify(pl2));
      const t2 = await B.tick();
      check('telegram: posle 7 dana ističe', pend().length === 0 && t2.replies.some(r => /Isteklo/.test(r.text)), JSON.stringify(t2));
      // los fajl
      const f1 = await B.handle({ update_id: 900111, kind: 'file', caption: '', progressMessageId: 45, fileError: 'type' });
      check('telegram: nepodržan fajl dobija objašnjenje', /PDF|JPG/i.test(f1.replies[0].text), f1.replies[0].text);
      window.__fakeReceiptReading = null; window.__fakeBillReading = null;
      window.__deleteEntriesById(ents().filter(e => /^Smoke TG/.test(e.desc)).map(e => e.id));
    }

    // Telegram posle pregleda: kucni racun ne menja postojeci, Otvori po vrsti, Ponisti vraca sliku i listu, ekstenzija iz vrste fajla
    if (window.__telegramBridge) {
      const B = window.__telegramBridge;
      const ents = () => JSON.parse(localStorage.getItem('budzet-stavke-v2') || '[]');
      const pend = () => JSON.parse(localStorage.getItem('budzet-telegram-cekanje-v1') || '[]');
      const png = await new Promise(r => { const c = document.createElement('canvas'); c.width = 40; c.height = 40; c.getContext('2d').fillRect(0, 0, 40, 40); c.toBlob(b => b.arrayBuffer().then(a => r(new Uint8Array(a))), 'image/png'); });
      const file = { base64: btoa(String.fromCharCode(...png)), name: 'telegram.png', mime: 'image/png' };
      const btn = (out, re) => (out.replies[0].buttons || []).flat().find(b => re.test(b.data));
      const stT = window.__bills().billTypes.find(x => /struja/i.test(x.name));
      // 4) isti mesec vec ima racun -> Sacuvaj iz Telegrama ne menja postojeci
      window.__fakeBillReading = () => ({ ok: true, content: JSON.stringify({ locationId: stT.locationId, billTypeId: stT.id, month: '2024-03', amount: 1111 }) });
      const g1 = await B.handle({ update_id: 900201, kind: 'file', caption: 'struja', progressMessageId: 51, file });
      await B.handle({ update_id: 900202, kind: 'callback', data: btn(g1, /^s:.+:n$/).data, messageId: 51 });
      const first = window.__bills().bills.find(b => b.month === '2024-03' && b.billTypeId === stT.id);
      check('telegram pregled: kućni račun sačuvan', !!first && first.amount === 1111, JSON.stringify(first));
      window.__fakeBillReading = () => ({ ok: true, content: JSON.stringify({ locationId: stT.locationId, billTypeId: stT.id, month: '2024-03', amount: 2222 }) });
      const g2 = await B.handle({ update_id: 900203, kind: 'file', caption: 'struja', progressMessageId: 52, file });
      const r2 = await B.handle({ update_id: 900204, kind: 'callback', data: btn(g2, /^s:.+:n$/).data, messageId: 52 });
      const now2 = window.__bills().bills.filter(b => b.month === '2024-03' && b.billTypeId === stT.id);
      check('telegram pregled: postojeći račun za isti mesec se ne zamenjuje', now2.length === 1 && now2[0].amount === 1111 && /već postoji/.test(r2.callbackText || ''), JSON.stringify({ n: now2.map(b => b.amount), cb: r2.callbackText }));
      const x2 = btn(g2, /^x:/); if (x2) await B.handle({ update_id: 900205, kind: 'callback', data: x2.data, messageId: 52 });
      if (first && window.__deleteBill) window.__deleteBill(first.id);
      // 5) kucni racun koji AI nije procitao -> Otvori otvara prozor za kucni racun (ne racun iz prodavnice)
      window.__fakeBillReading = () => ({ ok: false, kind: 'http', status: 500 });
      const h1 = await B.handle({ update_id: 900206, kind: 'file', caption: 'struja', progressMessageId: 53, file });
      const o1 = btn(h1, /^o:/);
      if (o1) { await B.handle({ update_id: 900207, kind: 'callback', data: o1.data, messageId: 53 }); await sleep(300); }
      check('telegram pregled: Otvori nepročitanog kućnog računa otvara prozor za kućni račun', !!o1 && $('billOverlay').classList.contains('show') && !$('receiptOverlay').classList.contains('show'));
      if ($('billOverlay').classList.contains('show')) $('billCancel').click();
      if ($('receiptOverlay').classList.contains('show')) $('receiptCancel').click();
      await sleep(80);
      // 6) Ponisti racun iz Telegrama: rashodi, slika i lista za kupovinu se vracaju
      const sh = window.__shopping();
      sh.items.push({ id: 'smoke-tg-li', name: 'Smoke TG mleko', section: 'Ostalo', store: '', category: 'Hrana', price: null, qty: '', needed: true, checked: false });
      window.__saveShopping();
      window.__fakeReceiptReading = () => ({ ok: true, content: JSON.stringify({ store: 'Smoke TG Undo', date: '2026-09-27', total: 120, items: [{ name: 'Smoke TG mleko', price: 120, category: 'Hrana' }] }) });
      const u1 = await B.handle({ update_id: 900208, kind: 'file', caption: 'maxi', progressMessageId: 54, file });
      const u2 = await B.handle({ update_id: 900209, kind: 'callback', data: btn(u1, /^s:/).data, messageId: 54 });
      const ue = ents().find(e => e.desc === 'Smoke TG Undo');
      const att = ue && (ue.attachments || [])[0];
      const liAfterSave = window.__shopping().items.find(i => i.id === 'smoke-tg-li');
      check('telegram pregled: račun skida stavku sa liste', !!ue && !!att && liAfterSave && liAfterSave.needed === false, JSON.stringify({ ue: !!ue, att, li: liAfterSave }));
      await B.handle({ update_id: 900210, kind: 'callback', data: u2.replies[0].buttons[0][0].data, messageId: 54 });
      const back = att ? await window.desktop.bills.readFile(att) : { ok: true };
      const liAfterUndo = window.__shopping().items.find(i => i.id === 'smoke-tg-li');
      check('telegram pregled: Poništi briše rashod, sliku i vraća listu', !ents().some(e => e.desc === 'Smoke TG Undo') && back.ok === false && liAfterUndo && liAfterUndo.needed === true, JSON.stringify({ back: back.ok, li: liAfterUndo }));
      window.__shopping().items = window.__shopping().items.filter(i => i.id !== 'smoke-tg-li'); window.__saveShopping();
      // ekstenzija priloga iz vrste fajla (PDF bez ekstenzije u imenu)
      const p1 = await B.handle({ update_id: 900211, kind: 'file', caption: '', progressMessageId: 55, file: { base64: file.base64, name: 'dokument', mime: 'application/pdf' } });
      const pp = pend().find(p => p.messageId === 55);
      check('telegram pregled: PDF bez ekstenzije se čuva kao .pdf', !!pp && /\.pdf$/.test(pp.file || ''), pp && pp.file);
      const x3 = btn(p1, /^x:/); if (x3) await B.handle({ update_id: 900212, kind: 'callback', data: x3.data, messageId: 55 });
      window.__fakeReceiptReading = null; window.__fakeBillReading = null;
    }

    // Telegram grupa: oznaka posiljaoca, ime u odgovoru, caskanje bez broja se ignorise, racun iz grupe, uputstvo u podesavanjima
    if (window.__telegramBridge) {
      const B = window.__telegramBridge;
      const ents = () => JSON.parse(localStorage.getItem('budzet-stavke-v2') || '[]');
      const ana = { id: 5, name: 'Ana' };
      const g1 = await B.handle({ update_id: 900301, kind: 'text', text: 'Smoke grupa kafa 180', group: true, from: ana });
      const ge = ents().find(e => e.desc === 'Smoke grupa kafa');
      check('telegram grupa: rashod dobija oznaku pošiljaoca', !!ge && (ge.tags || []).includes('ana'), JSON.stringify(ge && ge.tags));
      check('telegram grupa: odgovor kaže ko je poslao', /^✓ Ana: /.test(g1.replies[0].text), g1.replies[0].text);
      const n0 = ents().length;
      const g2 = await B.handle({ update_id: 900302, kind: 'text', text: 'idemo večeras u bioskop?', group: true, from: ana });
      check('telegram grupa: ćaskanje bez iznosa se ignoriše', g2.replies.length === 0 && ents().length === n0, JSON.stringify(g2));
      const g3 = await B.handle({ update_id: 900303, kind: 'text', text: 'idemo večeras u bioskop?', group: false, from: ana });
      check('telegram privatno: bez iznosa i dalje objašnjava', /iznos/i.test((g3.replies[0] || {}).text || ''));
      const png = await new Promise(r => { const c = document.createElement('canvas'); c.width = 40; c.height = 40; c.getContext('2d').fillRect(0, 0, 40, 40); c.toBlob(b => b.arrayBuffer().then(a => r(new Uint8Array(a))), 'image/png'); });
      window.__fakeReceiptReading = () => ({ ok: true, content: JSON.stringify({ store: 'Smoke grupa Maxi', date: '2026-09-26', total: 90, items: [{ name: 'Smoke grupa jaja', price: 90, category: 'Hrana' }] }) });
      const r1 = await B.handle({ update_id: 900304, kind: 'file', caption: 'maxi', progressMessageId: 61, group: true, from: { id: 6, name: 'Vanja' }, file: { base64: btoa(String.fromCharCode(...png)), name: 'telegram.png', mime: 'image/png' } });
      const sb = (r1.replies[0].buttons || []).flat().find(b => /^s:/.test(b.data));
      if (sb) await B.handle({ update_id: 900305, kind: 'callback', data: sb.data, messageId: 61, group: true, from: ana });
      const re = ents().find(e => e.desc === 'Smoke grupa Maxi');
      check('telegram grupa: račun iz grupe dobija oznaku onog ko ga je poslao', !!re && (re.tags || []).includes('vanja') && (re.tags || []).includes('nabavka'), JSON.stringify(re && re.tags));
      window.__fakeReceiptReading = null;
      window.__deleteEntriesById(ents().filter(e => /^Smoke grupa/.test(e.desc)).map(e => e.id));
      go('podesavanja'); await sleep(120);
      check('telegram grupa: podešavanja objašnjavaju /setprivacy', /setprivacy/.test($('tgSettings').textContent));
    }

    // Telegram: puna lista stavki u sazetku, zbir != ukupno, predlog za slanje kao fajl
    if (window.__telegramBridge) {
      const B = window.__telegramBridge;
      const png = await new Promise(r => { const c = document.createElement('canvas'); c.width = 40; c.height = 40; c.getContext('2d').fillRect(0, 0, 40, 40); c.toBlob(b => b.arrayBuffer().then(a => r(new Uint8Array(a))), 'image/png'); });
      const b64 = btoa(String.fromCharCode(...png));
      window.__fakeReceiptReading = () => ({ ok: true, content: JSON.stringify({ store: 'Smoke lista', date: '2026-09-25', total: 500, items: [{ name: 'Smoke jabuke', price: 120.5, category: 'Hrana' }, { name: 'Smoke sapun', price: 80, category: 'Hrana' }] }) });
      const L1 = await B.handle({ update_id: 900401, kind: 'file', caption: 'maxi', progressMessageId: 71, file: { base64: b64, name: 'telegram.jpg', mime: 'image/png', compressed: true } });
      const txt = L1.replies[0].text;
      check('telegram: sažetak ima punu listu stavki sa cenama', /Smoke jabuke — 120,50/.test(txt) && /Smoke sapun — 80/.test(txt), txt);
      check('telegram: sažetak javlja kad se zbir stavki ne slaže sa ukupnim', /Zbir stavki/.test(txt), txt);
      check('telegram: za kompresovanu fotografiju predlaže slanje kao fajl', /kao fajl/.test(txt), txt);
      const x = (L1.replies[0].buttons || []).flat().find(b => /^x:/.test(b.data));
      if (x) await B.handle({ update_id: 900402, kind: 'callback', data: x.data, messageId: 71 });
      window.__fakeReceiptReading = () => ({ ok: true, content: JSON.stringify({ store: 'Smoke lista 2', date: '2026-09-25', total: 200.5, items: [{ name: 'Smoke jabuke', price: 120.5, category: 'Hrana' }, { name: 'Smoke sapun', price: 80, category: 'Hrana' }] }) });
      const L2 = await B.handle({ update_id: 900403, kind: 'file', caption: 'maxi', progressMessageId: 72, file: { base64: b64, name: 'racun.png', mime: 'image/png' } });
      check('telegram: bez upozorenja kad se zbir slaže i slika je fajl', !/Zbir stavki/.test(L2.replies[0].text) && !/kao fajl/.test(L2.replies[0].text), L2.replies[0].text);
      const x2 = (L2.replies[0].buttons || []).flat().find(b => /^x:/.test(b.data));
      if (x2) await B.handle({ update_id: 900404, kind: 'callback', data: x2.data, messageId: 72 });
      window.__fakeReceiptReading = null;
    }

    // Fiskalni racun: link botu -> tacni podaci Poreske uprave; neuspeh; slika sa QR kodom ide preko Poreske uprave (ne AI)
    if (window.__telegramBridge) {
      const B = window.__telegramBridge;
      const ents = () => JSON.parse(localStorage.getItem('budzet-stavke-v2') || '[]');
      const SUF_HTML = ["<script>viewModel.InvoiceNumber('SMK-1'); viewModel.Token('tok');</script>", '<span id="shopFullNameLabel">7654321-SMOKE FISKAL</span>',
        '<span id="totalAmountLabel">1.249,98</span>', '<span id="sdcDateTimeLabel">7.9.2026. 09:05:01</span>', '<pre>Назив   Цена   Кол.   Укупно', 'X', '   1,00   1   1,00', '------</pre>'].join('\n');
      const SUF_SPEC = { success: true, items: [{ name: 'MLEKO SVEZE 2.8% 1L (Е)/kom', quantity: 2, total: 259.98, unitPrice: 129.99 }, { name: 'SIR GAUDA NAREZAK (Ђ)/kg ', quantity: 0.9, total: 990, unitPrice: 1100 }] };
      let fiscalCalls = 0, aiCalls = 0;
      window.__fakeFiscal = url => { fiscalCalls++; return /vl=SMOKE/.test(url) ? { ok: true, html: SUF_HTML, spec: SUF_SPEC } : { ok: false, kind: 'network' }; };
      window.__fakeFiscalCategories = () => ({ ok: true, content: JSON.stringify({ kategorije: ['Hrana', 'Hrana'] }) });
      window.__fakeReceiptReading = () => { aiCalls++; return { ok: true, content: JSON.stringify({ store: 'AI pogresno', total: 318, items: [{ name: 'Porez', price: 318 }] }) }; };
      const f1 = await B.handle({ update_id: 900501, kind: 'text', text: 'https://suf.purs.gov.rs/v/?vl=SMOKE%2B1%3D' });
      const t1 = f1.replies[0].text || '';
      check('fiskalni: link botu daje tačan sažetak sa svim stavkama', /Smoke fiskal/.test(t1) && /Mleko sveze 2\.8% 1l — 259,98/.test(t1) && /Sir gauda narezak — 990/.test(t1) && /Poreske uprave/.test(t1) && aiCalls === 0, t1);
      const sb = (f1.replies[0].buttons || []).flat().find(b => /^s:/.test(b.data));
      if (sb) await B.handle({ update_id: 900502, kind: 'callback', data: sb.data, messageId: 1 });
      const fe = ents().filter(e => e.desc === 'Smoke fiskal');
      check('fiskalni: Sačuvaj upisuje tačan iznos i stavke', fe.length === 1 && fe[0].amount === 1249.98 && (fe[0].items || []).length === 2 && fe[0].category === 'Hrana', JSON.stringify(fe.map(e => [e.amount, e.category, e.items])));
      const f2 = await B.handle({ update_id: 900503, kind: 'text', text: 'https://suf.purs.gov.rs/v/?vl=NEMA' });
      check('fiskalni: neuspelo preuzimanje daje jasnu poruku', /Poreske uprave/.test(f2.replies[0].text) && /✕/.test(f2.replies[0].text), f2.replies[0].text);
      // slika sa QR kodom fiskalnog racuna -> Poreska uprava, bez AI citanja slike
      const qr = qrcode(0, 'L'); qr.addData('https://suf.purs.gov.rs/v/?vl=SMOKE%2B2%3D'); qr.make();
      const qrUrl = qr.createDataURL(8, 16);
      const b64 = qrUrl.split(',')[1];
      aiCalls = 0;
      const f3 = await B.handle({ update_id: 900504, kind: 'file', caption: 'maxi', progressMessageId: 81, file: { base64: b64, name: 'racun.gif', mime: 'image/gif' } });
      const t3 = f3.replies[0].text || '';
      check('fiskalni: QR na slici -> podaci Poreske uprave, AI ne čita sliku', /Smoke fiskal/.test(t3) && /Poreske uprave/.test(t3) && aiCalls === 0, t3 + ' ai=' + aiCalls);
      const x3 = (f3.replies[0].buttons || []).flat().find(b => /^x:/.test(b.data)); if (x3) await B.handle({ update_id: 900505, kind: 'callback', data: x3.data, messageId: 81 });
      window.__fakeFiscal = null; window.__fakeFiscalCategories = null; window.__fakeReceiptReading = null;
      window.__deleteEntriesById(ents().filter(e => e.desc === 'Smoke fiskal').map(e => e.id));
    }

    // QR (ZXing u glavnom procesu): slika iz Telegrama sa procitanim QR-om -> Poreska uprava; citac radi kroz IPC
    if (window.__telegramBridge) {
      const B = window.__telegramBridge;
      const ents = () => JSON.parse(localStorage.getItem('budzet-stavke-v2') || '[]');
      const SUF_HTML = ["<script>viewModel.InvoiceNumber('SMK-2'); viewModel.Token('tok');</script>", '<span id="shopFullNameLabel">7654321-SMOKE QR</span>',
        '<span id="totalAmountLabel">259,98</span>', '<span id="sdcDateTimeLabel">8.9.2026. 10:00:00</span>'].join('\n');
      let aiCalls = 0;
      window.__fakeFiscal = () => ({ ok: true, html: SUF_HTML, spec: { success: true, items: [{ name: 'MLEKO (Е)/kom', quantity: 2, total: 259.98 }] } });
      window.__fakeFiscalCategories = () => ({ ok: true, content: '{"kategorije":["Hrana"]}' });
      window.__fakeReceiptReading = () => { aiCalls++; return { ok: true, content: '{"store":"AI","total":1,"items":[{"name":"x","price":1}]}' }; };
      const c = document.createElement('canvas'); c.width = 40; c.height = 40; c.getContext('2d').fillRect(0, 0, 40, 40);
      const b64 = c.toDataURL('image/png').split(',')[1];
      const q1 = await B.handle({ update_id: 900601, kind: 'file', caption: '', progressMessageId: 91, fiscalUrl: 'https://suf.purs.gov.rs/v/?vl=SMOKE%2B3%3D', file: { base64: b64, name: 'telegram.jpg', mime: 'image/png', compressed: true } });
      const t1 = q1.replies[0].text || '';
      check('QR iz bota: slika sa pročitanim QR-om daje podatke Poreske uprave (bez pitanja i bez AI)', /Smoke qr/.test(t1) && /Poreske uprave/.test(t1) && aiCalls === 0 && q1.replies[0].editMessageId === 91, t1);
      const sb = (q1.replies[0].buttons || []).flat().find(b => /^s:/.test(b.data));
      if (sb) await B.handle({ update_id: 900602, kind: 'callback', data: sb.data, messageId: 91 });
      const qe = ents().find(e => e.desc === 'Smoke qr');
      check('QR iz bota: sačuvan račun ima i sliku', !!qe && qe.amount === 259.98 && (qe.attachments || []).length === 1, JSON.stringify(qe));
      window.__deleteEntriesById(ents().filter(e => e.desc === 'Smoke qr').map(e => e.id));
      window.__fakeFiscal = null; window.__fakeFiscalCategories = null; window.__fakeReceiptReading = null;
    }
    if (window.desktop && window.desktop.bills && window.desktop.bills.decodeQr) {
      const url = 'https://suf.purs.gov.rs/v/?vl=' + 'Q'.repeat(500) + '%3D';
      const q = qrcode(0, 'L'); q.addData(url); q.make();
      const n = q.getModuleCount(), px = 3, m = 4, size = (n + 2 * m) * px;
      const cv = document.createElement('canvas'); cv.width = size; cv.height = size;
      const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, size, size); g.fillStyle = '#000';
      for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) g.fillRect((m + k) * px, (m + r) * px, px, px);
      const bytes = new Uint8Array(await (await new Promise(res => cv.toBlob(res, 'image/png'))).arrayBuffer());
      const got = await window.desktop.bills.decodeQr(bytes);
      check('QR: ZXing u glavnom procesu čita gust QR (PNG)', got === url, String(got).slice(0, 60));
      check('QR: neispravna slika daje null', (await window.desktop.bills.decodeQr(new Uint8Array([1, 2, 3]))) === null);
    } else check('QR: desktop.bills.decodeQr postoji', false);

    // Telegram popravke: grupno caskanje sa brojem, ponovljen update posle izlaska usred citanja, AI zauzet za uplatnicu
    if (window.__telegramBridge) {
      const B = window.__telegramBridge;
      const ents = () => JSON.parse(localStorage.getItem('budzet-stavke-v2') || '[]');
      const pend = () => JSON.parse(localStorage.getItem('budzet-telegram-cekanje-v1') || '[]');
      const ana = { id: 5, name: 'Ana' };
      const n0 = ents().length;
      const k1 = await B.handle({ update_id: 900701, kind: 'text', text: 'vidimo se u 8', group: true, from: ana });
      check('telegram fix: u grupi „vidimo se u 8“ nije rashod i bot ćuti', k1.replies.length === 0 && ents().length === n0, JSON.stringify(k1));
      const k2 = await B.handle({ update_id: 900702, kind: 'text', text: '250', group: true, from: ana });
      check('telegram fix: u grupi samo broj bez opisa — bot ćuti', k2.replies.length === 0 && ents().length === n0, JSON.stringify(k2));
      const k3 = await B.handle({ update_id: 900703, kind: 'text', text: 'Smoke fix sok 8', group: false, from: ana });
      check('telegram fix: privatno „sok 8“ je i dalje rashod', ents().some(e => e.desc === 'Smoke fix sok' && e.amount === 8), JSON.stringify(k3));
      const k4 = await B.handle({ update_id: 900704, kind: 'text', text: 'plata za majstora smokefix 5000' });
      check('telegram fix: „plata za majstora“ je rashod', ents().some(e => e.desc === 'plata za majstora smokefix' && e.type === 'expense'), JSON.stringify(k4.replies[0] && k4.replies[0].text));
      window.__deleteEntriesById(ents().filter(e => /^Smoke fix|smokefix$/.test(e.desc)).map(e => e.id));
      // isti update stigne ponovo (aplikacija ugasena usred citanja) -> isto cekanje, bez drugog priloga
      const png = await new Promise(r => { const c = document.createElement('canvas'); c.width = 40; c.height = 40; c.getContext('2d').fillRect(0, 0, 40, 40); c.toBlob(b => b.arrayBuffer().then(a => r(new Uint8Array(a))), 'image/png'); });
      const file = { base64: btoa(String.fromCharCode(...png)), name: 'telegram.png', mime: 'image/png' };
      const saved = [];
      window.__fakeSaveFile = async (bytes, name) => { const r = await window.desktop.bills.saveFile(bytes, name); if (r && r.ok) saved.push(r.name); return r; };
      window.__fakeReceiptReading = () => ({ ok: true, content: JSON.stringify({ store: 'Smoke fix Maxi', date: '2026-09-28', total: 40, items: [{ name: 'Smoke fix hleb', price: 40, category: 'Hrana' }] }) });
      const d1 = await B.handle({ update_id: 900705, kind: 'file', caption: 'maxi', progressMessageId: 101, file });
      const doneKey = 'budzet-telegram-obradjeno-v1';
      localStorage.setItem(doneKey, JSON.stringify(JSON.parse(localStorage.getItem(doneKey) || '[]').filter(id => id !== 900705)));
      const d2 = await B.handle({ update_id: 900705, kind: 'file', caption: 'maxi', progressMessageId: 102, file });
      const same = pend().filter(p => p.update_id === 900705);
      check('telegram fix: ponovljen update posle izlaska ne pravi drugo čekanje ni drugi prilog', same.length === 1 && saved.length === 1 && same[0].file === saved[0] && d2.replies[0].editMessageId === 102 && /Smoke fix Maxi/.test(d2.replies[0].text), JSON.stringify({ n: same.length, saved, d2: d2.replies[0] }));
      const xd = (d2.replies[0].buttons || []).flat().find(b => /^x:/.test(b.data)); if (xd) await B.handle({ update_id: 900706, kind: 'callback', data: xd.data, messageId: 102 });
      for (const n of saved) await window.desktop.bills.deleteFile(n);
      window.__fakeSaveFile = null; window.__fakeReceiptReading = null;
      // uplatnica: AI zauzet (429) -> ponovni pokusaj u tick, kao racun
      const slip = { name: 'Smoke fix JKP', account: '840-0000000012345-67', model: '97', reference: '1234', purpose: 'Smoke fix voda', code: '189', amount: 777, currency: 'RSD' };
      window.__fakeSlipReading = () => ({ ok: false, kind: 'limit', retryAfter: 30 });
      const s1 = await B.handle({ update_id: 900707, kind: 'file', caption: 'uplatnica', progressMessageId: 103, file });
      const sp = pend().find(p => p.messageId === 103);
      check('telegram fix: uplatnica — AI zauzet -> poruka i ponovni pokušaj', /zauzet/.test(s1.replies[0].text) && !!sp && !!sp.retryAt, JSON.stringify({ r: s1.replies[0], sp }));
      const pl = pend(); pl.forEach(p => { if (p.messageId === 103 && p.retryAt) p.retryAt = Date.now() - 1; }); localStorage.setItem('budzet-telegram-cekanje-v1', JSON.stringify(pl));
      window.__fakeSlipReading = () => ({ ok: true, content: JSON.stringify(slip) });
      const t1 = await B.tick();
      const tr = t1.replies.find(r => r.editMessageId === 103);
      check('telegram fix: uplatnica — tick ponovo čita i šalje sažetak', !!tr && /Smoke fix JKP/.test(tr.text), JSON.stringify(t1));
      const sx = tr && (tr.buttons || []).flat().find(b => /^x:/.test(b.data)); if (sx) await B.handle({ update_id: 900708, kind: 'callback', data: sx.data, messageId: 103 });
      window.__fakeSlipReading = null;
    }

    // fix2-R: Cene spajaju preimenovane stavke; opoziv racuna vraca zaokruzivanje; link sa QR koda u aplikaciji; opoziv zaostalih ponavljajucih
    {
      const ents = () => JSON.parse(localStorage.getItem('budzet-stavke-v2') || '[]');
      const cm = monthKey(new Date()), Cx = window.BudzetCore;
      // 8) Nabavka -> Cene: staro i novo ime preimenovane stavke su jedan artikal
      {
        const sh = window.__shopping();
        sh.items.push({ id: 'smoke-r8', name: 'Smoke R8 novo', aliases: ['Smoke R8 staro'], section: 'Ostalo', store: '', category: 'Hrana', price: null, qty: '', needed: false, checked: false });
        window.__saveShopping();
        const rc = (id, date, name, price) => ({ id, type: 'expense', desc: 'Smoke R8 prodavnica', amount: price, category: 'Hrana', date, paid: true, tags: ['nabavka'], receiptId: 'rcpt-' + id, items: [name], itemPrices: [price], itemQty: [{ qty: 1, unit: 'kom' }] });
        window.__addEntriesRaw([rc('smoke-r8-a', cm + '-01', 'Smoke R8 staro', 100), rc('smoke-r8-b', cm + '-02', 'Smoke R8 novo', 120)]);
        go('nabavka'); await sleep(60);
        const prevShow = document.querySelector('.shop-show-btn.active');
        const pricesBtn = document.querySelector('.shop-show-btn[data-show="prices"]');
        if (pricesBtn) { pricesBtn.click(); await sleep(80); }
        const names = [...document.querySelectorAll('#shopPrices .price-row .shop-name')].map(x => x.textContent).filter(n => /Smoke R8/.test(n));
        check('Cene: preimenovana stavka je jedan artikal pod novim imenom', names.length === 1 && names[0] === 'Smoke R8 novo', JSON.stringify(names));
        const row = [...document.querySelectorAll('#shopPrices .price-row')].find(r => /Smoke R8/.test(r.textContent));
        check('Cene: promena cene računa i staru kupovinu', !!row && /↑20%/.test(row.textContent), row && row.textContent.replace(/\s+/g, ' '));
        const listBtn = prevShow && prevShow.dataset.show !== 'prices' ? prevShow : document.querySelector('.shop-show-btn[data-show="need"]');
        if (listBtn) { listBtn.click(); await sleep(40); }
        window.__deleteEntriesById(['smoke-r8-a', 'smoke-r8-b']);
        sh.items.splice(sh.items.findIndex(i => i.id === 'smoke-r8'), 1); window.__saveShopping();
      }
      // 9) Racun iz prodavnice (PC): opoziv vraca i zaokruzivanje u cilj
      if (typeof window.__addReceiptFiles === 'function') {
        const gs = window.__goals();
        gs.push({ id: 'smoke-r9-goal', name: 'Smoke R9 cilj', target: 100000, current: 0, deadline: '' }); window.__saveGoals(); await sleep(40);
        go('ciljevi'); await sleep(60);
        setVal('roundUpGoalSelect', 'smoke-r9-goal');
        check('račun (PC): cilj za zaokruživanje izabran', $('roundUpGoalSelect').value === 'smoke-r9-goal');
        window.__fakeReceiptReading = () => ({ ok: true, content: JSON.stringify({ store: 'Smoke R9 prodavnica', date: cm + '-03', total: 150.37, items: [{ name: 'Smoke R9 stvar', price: 150.37, category: 'Hrana' }] }) });
        const img = await new Promise(r => { const c = document.createElement('canvas'); c.width = 60; c.height = 60; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 60, 60); c.toBlob(r, 'image/png'); });
        window.__addReceiptFiles([new File([img], 'r9.png', { type: 'image/png' })]);
        await sleep(1500);
        await window.__saveReceipt(); await sleep(80);
        const goal = () => window.__goals().find(g => g.id === 'smoke-r9-goal');
        const made = ents().filter(e => e.desc === 'Smoke R9 prodavnica');
        check('račun (PC): zaokruživanje ide u cilj', made.length === 1 && Math.abs(goal().current - 49.63) < 0.001, made.length + ' ' + goal().current);
        window.__undoTop(); await sleep(80);
        check('račun (PC): opoziv vraća i zaokruživanje', !ents().some(e => e.desc === 'Smoke R9 prodavnica') && goal().current === 0, String(goal().current));
        window.__fakeReceiptReading = null;
        setVal('roundUpGoalSelect', '');
        gs.splice(gs.findIndex(g => g.id === 'smoke-r9-goal'), 1); window.__saveGoals(); await sleep(40);
      } else check('račun (PC): hook __addReceiptFiles', false);
      // 10) Nabavka: link sa QR koda fiskalnog racuna otvara prozor racuna sa podacima Poreske uprave
      {
        go('nabavka'); await sleep(60);
        const SUF_HTML = ["<script>viewModel.InvoiceNumber('SMK-10'); viewModel.Token('tok');</script>", '<span id="shopFullNameLabel">7654321-SMOKE LINK</span>',
          '<span id="totalAmountLabel">259,98</span>', '<span id="sdcDateTimeLabel">9.9.2026. 10:00:00</span>'].join('\n');
        const urls = [];
        window.__fakeFiscal = url => { urls.push(url); return /vl=SMOKE/.test(url) ? { ok: true, html: SUF_HTML, spec: { success: true, items: [{ name: 'MLEKO (Е)/kom', quantity: 2, total: 259.98 }] } } : { ok: false, kind: 'network' }; };
        window.__fakeFiscalCategories = () => ({ ok: true, content: '{"kategorije":["Hrana"]}' });
        const btn = $('shopFiscalLinkBtn');
        check('link sa QR koda: dugme u Nabavci', !!btn);
        if (btn) {
          btn.click(); await sleep(60);
          const inp = document.querySelector('#editModalFields input');
          check('link sa QR koda: prozor sa poljem za link', $('editModalOverlay').classList.contains('show') && !!inp);
          if (inp) { inp.value = 'nije link'; $('editModalSave').click(); await sleep(80); }
          check('link sa QR koda: pogrešan tekst daje poruku, bez preuzimanja', $('dialogOverlay').classList.contains('show') && /suf\.purs\.gov\.rs/.test($('dialogBody').textContent) && !urls.length, $('dialogBody').textContent);
          if ($('dialogOverlay').classList.contains('show')) $('dialogOk').click();
          btn.click(); await sleep(60);
          const inp2 = document.querySelector('#editModalFields input');
          if (inp2) { inp2.value = ' https://suf.purs.gov.rs/v/?vl=SMOKE%2B10%3D '; $('editModalSave').click(); }
          await sleep(400);
          const st = window.__receiptState();
          check('link sa QR koda: otvara račun sa podacima Poreske uprave', $('receiptOverlay').classList.contains('show') && !!st && st.store === 'Smoke link' && st.total === 259.98 && st.items.length === 1 && urls[0] === 'https://suf.purs.gov.rs/v/?vl=SMOKE%2B10%3D',
            JSON.stringify(st && { store: st.store, total: st.total, n: st.items.length }) + ' ' + urls.join());
          if ($('receiptOverlay').classList.contains('show')) $('receiptCancel').click();
          await sleep(40);
          btn.click(); await sleep(60);
          const inp3 = document.querySelector('#editModalFields input');
          if (inp3) { inp3.value = 'https://suf.purs.gov.rs/v/?vl=NEMA'; $('editModalSave').click(); }
          await sleep(300);
          check('link sa QR koda: neuspelo preuzimanje daje poruku', $('dialogOverlay').classList.contains('show') && /Poreske uprave/.test($('dialogBody').textContent) && !$('receiptOverlay').classList.contains('show'), $('dialogBody').textContent);
          if ($('dialogOverlay').classList.contains('show')) $('dialogOk').click();
        }
        window.__fakeFiscal = null; window.__fakeFiscalCategories = null;
      }
      // 11) Mesec iza tebe: opoziv placanja zaostalih vraca preskakanje i vezu racuna sa rashodom
      if (window.__recurringRaw && typeof window.__setBillState === 'function') {
        const prevM = Cx.addMonths(cm, -1), prev2 = Cx.addMonths(cm, -2);
        const rr = { id: 'smoke-r11', desc: 'Smoke R11 voda', amount: 1234, category: 'Ostalo', type: 'expense', day: 5, frequency: 'monthly', anchorMonth: 1 };
        window.__recurringRaw.list().push(rr);
        const ap = window.__recurringRaw.applied(); ap[prev2] = (ap[prev2] || []).concat(rr.id);
        window.__recurringRaw.save();
        window.__addEntriesRaw([{ id: 'smoke-r11-prev', type: 'expense', desc: 'Smoke R11 prošli', amount: 100, category: 'Ostalo', date: prevM + '-03', paid: true, tags: [] },
          { id: 'smoke-r11-old', type: 'expense', desc: 'Smoke R11 staro', amount: 1234, category: 'Ostalo', date: prevM + '-04', paid: true, tags: [] }]);
        window.__ensureBillDefaults();
        const B = window.__bills;
        const bill = { id: 'smoke-r11-bill', billTypeId: B().billTypes[0].id, month: prevM, expenseMonth: prevM, amount: 1234, currency: 'RSD', values: {}, source: 'manual', recurringId: rr.id, entryId: 'smoke-r11-old' };
        window.__setBillState({ locations: B().locations, billTypes: B().billTypes, bills: B().bills.concat(bill) });
        localStorage.removeItem('budzet-mesecni-pregled-zatvoren-v1');
        go('pregled'); await sleep(60);
        window.__monthReview(cm + '-03'); await sleep(60);
        const payBtn = $('monthReviewPayRec');
        check('R11: dugme za plaćanje zaostalih', !!payBtn, $('monthReviewActions').textContent);
        // u medjuvremenu (kartica vec prikazana) stavka je pauzirana za taj mesec
        const sk = window.__recurringRaw.skipped ? window.__recurringRaw.skipped() : null;
        check('R11: hook za preskočene', !!sk);
        if (sk) sk[prevM] = (sk[prevM] || []).concat(rr.id);
        const recEid = 'rec-' + rr.id + '-' + prevM;
        if (payBtn) { payBtn.click(); await sleep(100); }
        const billNow = () => B().bills.find(b => b.id === 'smoke-r11-bill');
        check('R11: plaćanje upisuje rashod i vezuje račun', ents().some(e => e.id === recEid) && billNow().entryId === recEid && !(sk && (sk[prevM] || []).includes(rr.id)), billNow().entryId);
        window.__undoTop(); await sleep(80);
        check('R11: opoziv vraća preskakanje', !!sk && (sk[prevM] || []).includes(rr.id), sk && JSON.stringify(sk[prevM]));
        check('R11: opoziv vraća vezu računa sa rashodom', billNow().entryId === 'smoke-r11-old', billNow().entryId);
        check('R11: opoziv briše rashod i plaćeno', !ents().some(e => e.id === recEid) && !(window.__recurringRaw.applied()[prevM] || []).includes(rr.id));
        window.__monthReview(null);
        if (sk) Object.keys(sk).forEach(k => { sk[k] = sk[k].filter(id => id !== rr.id); });
        const list = window.__recurringRaw.list(); list.splice(list.findIndex(r => r.id === rr.id), 1);
        Object.keys(ap).forEach(k => { ap[k] = ap[k].filter(id => id !== rr.id); });
        window.__recurringRaw.save();
        window.__setBillState({ locations: B().locations, billTypes: B().billTypes, bills: B().bills.filter(b => b.id !== 'smoke-r11-bill') });
        window.__deleteEntriesById(['smoke-r11-prev', 'smoke-r11-old']);
        localStorage.setItem('budzet-mesecni-pregled-zatvoren-v1', prevM);
      } else check('R11: hookovi __recurringRaw/__setBillState', false);
      // 12) test kuke postoje samo u test pokretanju
      check('test kuke: desktop.info.test je uključen u smoke testu', !!(window.desktop && window.desktop.info && window.desktop.info.test) && typeof window.__undoTop === 'function');
    }

    // Prognoza do plate: kartica na Pregledu, rucna plata u Podesavanjima, istekla plata, podkartica Prognoza, JSON kopija
    if (window.__forecast) {
      const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      const inDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
      window.__setPayday({ mode: 'auto' });
      go('pregled'); await sleep(200);
      const f0 = window.__forecast(), card = $('forecastCard');
      const expect0 = f0.firstNegative && (!f0.payday || f0.firstNegative.date < f0.payday.date) ? /ulaziš u minus/ : (f0.payday ? /Do plate/ : /Za 60 dana/);
      check('prognoza: kartica na Pregledu odgovara proračunu', !!card && card.style.display !== 'none' && expect0.test(card.textContent), card && card.textContent.slice(0, 120));
      // rucna plata kroz Podesavanja
      go('podesavanja'); await sleep(150);
      const manualRadio = document.querySelector('input[name="paydayMode"][value="manual"]');
      if (manualRadio) { manualRadio.checked = true; manualRadio.dispatchEvent(new Event('change', { bubbles: true })); }
      $('paydayDate').value = inDays(10); $('paydayAmount').value = '123456'; $('paydaySave').click(); await sleep(100);
      const f1 = window.__forecast();
      check('prognoza: ručna plata iz Podešavanja', !!f1.payday && f1.payday.source === 'manual' && f1.payday.amount === 123456 && f1.payday.date === inDays(10), JSON.stringify(f1.payday));
      check('prognoza: ručna plata je u prognozi tačno jednom', f1.events.filter(e => e.kind === 'payday').length === 1);
      go('pregled'); await sleep(150);
      check('prognoza: kartica prati ručnu platu', /Do plate|ulaziš u minus/.test($('forecastCard').textContent));
      // istekla rucna plata
      window.__setPayday({ mode: 'manual', date: inDays(-2), amount: 1000 });
      go('pregled'); await sleep(150);
      check('prognoza: istekla ručna plata daje napomenu', /prošla/.test($('forecastCard').textContent), $('forecastCard').textContent.slice(0, 160));
      window.__setPayday({ mode: 'auto' });
      // podkartica Prognoza
      go('prognoza'); await sleep(250);
      const f2 = window.__forecast();
      check('prognoza: grafikon sa linijom stanja', !!document.querySelector('#forecastChart polyline'));
      check('prognoza: tabela predstojećih stavki', document.querySelectorAll('#forecastBody tr.fc-event').length === f2.events.length, document.querySelectorAll('#forecastBody tr.fc-event').length + ' / ' + f2.events.length);
      // JSON kopija
      const san = window.__sanitizeImportedBackup({ entries: [], payday: { mode: 'manual', date: '2026-12-01', amount: 5000 } });
      const bad = window.__sanitizeImportedBackup({ entries: [], payday: { mode: 'x', date: 'juce', amount: -1 } });
      check('prognoza: JSON kopija čuva platu', JSON.stringify(san.payday) === JSON.stringify({ mode: 'manual', date: '2026-12-01', amount: 5000 }) && bad.payday.mode === 'auto', JSON.stringify([san.payday, bad.payday]));
    } else check('prognoza: test kuka __forecast', false);

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
