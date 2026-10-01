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
      const did = window.__processGoalPlans(); await sleep(60);
      const after = window.__goals().find(x => x.id === 'p4-goal');
      check('mesečna uplata: propušteni meseci se uplaćuju', did && after.current === 3000 && after.monthly.last === cur, after.current + ' ' + after.monthly.last);
      check('mesečna uplata: ponovna obrada ne uplaćuje dvaput', !window.__processGoalPlans());
      $('undoBtn').click(); await sleep(80);
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
      await sleep(20);
      check('dokumenti: Sačuvaj isključeno dok se fajlovi pripremaju', $('docSave').disabled === true);
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
