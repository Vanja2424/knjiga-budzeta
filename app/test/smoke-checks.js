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
    for (const s of ['pregled', 'rashodi', 'prihodi', 'racuni', 'pretraga', 'kategorije', 'ponavljajuce', 'ciljevi', 'dugovi', 'izvestaj', 'uporedi', 'scenario', 'podesavanja']) {
      go(s); await sleep(60);
      check('ekran ' + s, $('screen-' + s).classList.contains('active') && document.querySelectorAll('.screen.active').length === 1);
    }
    check('glavni meni ima 7 stavki', document.querySelectorAll('nav.tabs button[data-group]').length === 7);
    document.querySelector('nav.tabs button[data-group="ciljevi"]').click(); await sleep(50);
    check('podmeni za Ciljevi i dugovi', [...document.querySelectorAll('#subtabs button')].map(b => b.dataset.screen).join(',') === 'ciljevi,dugovi');
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
    const expSum = entries().filter(e => e.type === 'expense' && e.paid !== false && e.date.startsWith(m)).reduce((s, e) => s + e.amount, 0);
    const incSum = entries().filter(e => e.type === 'income' && e.date.startsWith(m)).reduce((s, e) => s + e.amount, 0);
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
