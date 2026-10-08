  // ---- Summary ----
  let prevSummaryVals = { income: 0, expense: 0, pending: 0, balance: 0 };
  function animateNumber(el, from, to, duration){
    duration = duration || 550;
    if(Math.round(from) === Math.round(to)){ el.textContent = fmt(to); return; }
    const start = performance.now();
    function step(now){
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = fmt(from + (to - from) * eased);
      if(t < 1) requestAnimationFrame(step); else el.textContent = fmt(to);
    }
    requestAnimationFrame(step);
  }
  // Otplaceno/ostatak duga: rucne uplate + placene rate (rashodi sa debtId). overallBalance i dalje koristi samo d.paidAmount.
  const debtRemaining = d => Math.max(0, C.round2(d.amount - C.debtPaid(d, entries)));
  const debtInstallment = d => recurring.find(r => r.debtId === d.id);
  // Predlozeni/prikazani iznos za placanje stavke — za ratu (r.debtId) ogranicen na ostatak duga,
  // da predlog/podsetnik ne navode na iznos koji bi "prepunio" dug.
  // Racun sacuvan "za placanje" i vezan za stavku u tom mesecu -> njegov iznos (RSD) je predlog za placanje
  const linkedBillAmount = (r, mKey) => {
    const b = bills.find(x=> x.recurringId === r.id && (x.expenseMonth || x.month) === (mKey || currentMonthKey()) && !x.entryId);
    const a = b && b.amount > 0 ? billAmountRsd(b) : null;
    return a ? a.amount : null;
  };
  const suggestedPayAmount = (r, mKey) => {
    const fromBill = linkedBillAmount(r, mKey);
    if(fromBill != null) return fromBill;
    if(!r.debtId) return recurringAmountNow(r);
    const d = debts.find(x=> x.id === r.debtId);
    return d ? Math.min(recurringAmountNow(r), debtRemaining(d)) : recurringAmountNow(r);
  };
  // Rata prestaje kad je dug izmiren (until = tekuci mesec ako je rata za taj mesec vec placena,
  // inace prethodni mesec — da autoplaćanje ne naplati ratu za vec izmiren dug); kad dug ponovo ima ostatak, nastavlja se.
  function syncDebtInstallments(){
    let changed = false;
    const cur = currentMonthKey();
    recurring.forEach(r=>{
      if(!r.debtId) return;
      const d = debts.find(x=> x.id === r.debtId);
      if(!d) return;
      // Dug obrnutog smera (owed_to_me) se za ratu tretira kao izmiren — ne dospeva ("i ja dugujem"
      // vise ne vazi); vraca se kad se dug ponovo prevede na i_owe sa ostatkom.
      const done = debtRemaining(d) <= 0 || d.direction !== 'i_owe';
      if(done && !r.until){ r.until = isPaid(r, cur) ? cur : C.addMonths(cur, -1); changed = true; }
      else if(!done && r.until){ delete r.until; changed = true; }
    });
    if(changed) saveRecurring();
  }
  function createDebtInstallment(d, o){
    const r = { id: newId(), type: 'expense', desc: 'Rata: ' + d.person, amount: Math.round(o.amount), category: o.category, day: C.clampRecurringDay(o.day), frequency: 'monthly', anchorMonth: 1, isSubscription: false, autoPay: false, debtId: d.id };
    recurring.push(r); saveRecurring(); renderAll();
    return r;
  }
  if(IS_TEST) window.__createDebtInstallment = (id, o) => { const d = debts.find(x=> x.id === id); return d ? createDebtInstallment(d, o) : null; };
  if(IS_TEST) window.__markRecurringPaid = (rid, amount) => { const r = recurring.find(x=> x.id === rid); if(!r) return null; const id = markRecurringPaid(r, currentMonthKey(), amount); if(id){ saveApplied(); saveEntries(); renderAll(); } return id; };

  // Dugovi gde JA dugujem ('i_owe') se racunaju u ukupne cifre isto kao obican rashod: uplaceni
  // deo (paidAmount) je "stvarno potroseno" -> RASHODI, a preostali deo je obaveza koja tek treba
  // da se plati -> NA CEKANJU. Dugovi gde NEKO DRUGI duguje meni ('owed_to_me') se ne racunaju
  // ovde — to je potrazivanje, ne rashod.
  function debtExpenseTotals(){
    const owedByMe = debts.filter(d => d.direction === 'i_owe');
    const paid = owedByMe.reduce((s,d)=> s + Math.min(d.paidAmount||0, d.amount), 0);
    return { paid };
  }
  // Zbirovi za jedan mesec — jedini izvor brojki za sazetak, Pregled, upozorenja i analizu.
  function monthTotals(mKey){ return C.monthTotals(entries, mKey); }
  // Ukupno stanje (sve do danas): prihodi − placeni rashodi − vec vraceni deo mojih dugova.
  function overallBalance(){
    const income = entries.filter(e=>e.type==='income').reduce((s,e)=>s+e.amount,0);
    const expense = entries.filter(e=>e.type==='expense' && isExpensePaid(e)).reduce((s,e)=>s+e.amount,0);
    return C.round2(income - expense - debtExpenseTotals().paid);
  }
  // "Za placanje" za izabrani mesec: neplaceni rashodi tog meseca (za tekuci mesec i svi raniji
  // neplaceni — oni kasne) + ponavljajuci rashodi koji tek dospevaju + (tekuci mesec) moji dugovi.
  // Ocekivani prihodi se prikazuju odvojeno, ne sabiraju se sa rashodima.
  // Ponavljajuce stavke koje u mesecu (tekucem ili buducem) tek dospevaju: nisu placene, preskocene ni upisane kao rashod
  function pendingRecurring(mKey){
    return C.pendingRecurringItems(recurring, entries, applied, skipped, mKey, currentMonthKey());
  }
  function pendingForMonth(mKey){
    return C.pendingForMonth({ entries, recurring, applied, skipped, debts, mKey, currentMonth: currentMonthKey(), amountOf: recurringAmountNow });
  }
  if(IS_TEST) window.__pendingForMonth = pendingForMonth;
  function renderSummary(){
    const cur = currentMonthKey();
    const mt = monthTotals(viewMonth);
    const prev = monthTotals(C.addMonths(viewMonth, -1));
    animateNumber(document.getElementById('totalIncome'), prevSummaryVals.income, mt.income);
    animateNumber(document.getElementById('totalExpense'), prevSummaryVals.expense, mt.expense);
    const balEl = document.getElementById('totalBalance');
    balEl.className = 'value balance ' + (mt.net >= 0 ? 'pos' : 'neg');
    animateNumber(balEl, prevSummaryVals.balance, mt.net);
    const diffTxt = (now, before) => before > 0 ? t(now >= before ? '{0}% više nego mesec ranije' : '{0}% manje nego mesec ranije', Math.abs(Math.round((now-before)/before*100))) : '';
    document.getElementById('incomeSub').textContent = diffTxt(mt.income, prev.income);
    document.getElementById('expenseSub').textContent = diffTxt(mt.expense, prev.expense);
    let balanceNow;
    if(accounts.length){ const bal = accountBalances(); balanceNow = t('Na računima: {0}', fmt(accounts.reduce((s,a)=> s + bal[a.id], 0))); }
    else balanceNow = t('Ukupno stanje: {0}', fmt(overallBalance()));
    document.getElementById('balanceSub').textContent = balanceNow;

    const p = pendingForMonth(viewMonth);
    animateNumber(document.getElementById('pendingTotal'), prevSummaryVals.pending, p.expense);
    document.getElementById('pendingTotal').classList.toggle('zero', p.expense === 0);
    prevSummaryVals = { income: mt.income, expense: mt.expense, pending: p.expense, balance: mt.net };
    const parts = [];
    parts.push(p.count ? t(p.count===1?'{0} stavka':'{0} stavki', p.count) : t(viewMonth < cur ? 'ništa neplaćeno' : 'sve plaćeno'));
    if(p.income > 0) parts.push(t('očekuje se +{0}', fmt(p.income)));
    if(p.debt > 0) parts.push(t('dugovi: {0} ({1})', fmt(p.debt), p.debtCount));
    document.getElementById('pendingSub').textContent = parts.join(' · ');
    renderPeriodBar();
  }
  function renderPeriodBar(){
    const cur = currentMonthKey();
    document.getElementById('periodLabel').textContent = monthYearLabelSr(viewMonth);
    document.getElementById('periodToday').style.visibility = viewMonth === cur ? 'hidden' : 'visible';
  }
  function setViewMonth(mKey){
    viewMonth = mKey;
    viewMonthFollowsToday = mKey === currentMonthKey();
    expListMonth = incListMonth = mKey;
    dirtyScreens.add('rashodi'); dirtyScreens.add('prihodi');
    renderSummary(); renderPregled();
    if(activeScreen === 'rashodi' || activeScreen === 'prihodi') renderScreen(activeScreen);
  }
  document.getElementById('periodPrev').addEventListener('click', ()=> setViewMonth(C.addMonths(viewMonth, -1)));
  document.getElementById('periodNext').addEventListener('click', ()=> setViewMonth(C.addMonths(viewMonth, 1)));
  document.getElementById('periodToday').addEventListener('click', ()=> setViewMonth(currentMonthKey()));
  document.addEventListener('keydown', (e)=>{
    if(!e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    if(document.querySelector('.modal-overlay.show')) return;
    e.preventDefault();
    setViewMonth(C.addMonths(viewMonth, e.key === 'ArrowLeft' ? -1 : 1));
  });

  // ---- Racuni, prenosi i valute ----
  const defaultAccountId = () => accounts[0] ? accounts[0].id : null;
  const accountById = id => accounts.find(a=> a.id === id);
  const accountName = id => { const a = accountById(id); return a ? a.name : (accounts[0] ? accounts[0].name : ''); };
  const accountBalances = () => C.accountBalances(accounts, entries, isExpensePaid);
  const isTransfer = e => e.type === 'transfer';
  const ACCOUNT_TYPE_LABEL = { tekuci: 'Tekući račun', gotovina: 'Gotovina', stednja: 'Štednja', kartica: 'Kreditna kartica' };
  function populateAccountSelects(){
    document.body.classList.toggle('has-accounts', accounts.length >= 2);
    document.querySelectorAll('.account-select').forEach(sel=>{
      const prev = sel.value;
      const none = sel.dataset.allowNone ? '<option value="">— bez računa —</option>' : '';
      sel.innerHTML = none + accounts.map(a=> `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('');
      if([...sel.options].some(o=> o.value === prev)) sel.value = prev;
    });
    const trTo = document.getElementById('trTo');
    if(trTo && trTo.value === document.getElementById('trFrom').value && accounts[1]) trTo.value = accounts.find(a=> a.id !== trTo.value).id;
  }
  function populateCurrencySelects(){
    document.querySelectorAll('.currency-select').forEach(sel=>{
      const prev = sel.value || 'RSD';
      // omiljene valute + trenutno izabrana (npr. pri izmeni stavke u valuti koja vise nije omiljena)
      const available = CURRENCIES.filter(c=> c === 'RSD' || (fx.rates[c] && (fxFavorites.includes(c) || c === prev)));
      sel.innerHTML = available.map(c=> `<option value="${c}">${CURRENCY_SYMBOL[c] === c ? c : c + ' ' + CURRENCY_SYMBOL[c]}</option>`).join('');
      sel.value = available.includes(prev) ? prev : 'RSD';
      sel.style.display = available.length > 1 ? '' : 'none';
    });
  }
  const fmtRate = r => r.toLocaleString(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  const fmtOrig = (amount, cur) => amount.toLocaleString(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + (CURRENCY_SYMBOL[cur] || cur);
  // Iznos iz forme: vraca { amount (RSD), foreign: {origAmount, currency, rate} | null }
  function readAmountField(prefix){
    const raw = parseFloat(document.getElementById(prefix + 'Amount').value);
    const cur = (document.getElementById(prefix + 'Currency') || {}).value || 'RSD';
    if(cur === 'RSD' || isNaN(raw)) return { amount: raw, foreign: null };
    const rate = fx.rates[cur];
    if(!rate) return { amount: NaN, foreign: null };
    return { amount: Math.round(raw * rate * 100) / 100, foreign: { origAmount: raw, currency: cur, rate } };
  }
  function updateCurrencyHint(prefix){
    const hint = document.getElementById(prefix + 'CurrencyHint');
    if(!hint) return;
    const cur = document.getElementById(prefix + 'Currency').value;
    const raw = parseFloat(document.getElementById(prefix + 'Amount').value);
    if(cur === 'RSD' || !fx.rates[cur]){ hint.textContent = ''; return; }
    const dateTxt = fx.date ? parseLocalDate(fx.date).toLocaleDateString(LOCALE, {day:'2-digit', month:'2-digit'}) : '';
    hint.textContent = (isNaN(raw) ? '' : `≈ ${fmt(raw * fx.rates[cur])} · `) + t(fx.source === 'fallback' ? 'kurs {0}' : 'kurs NBS {0}', fmtRate(fx.rates[cur])) + (dateTxt ? ' (' + dateTxt + ')' : '');
  }
  ['inc', 'exp', 'rec', 'debt'].forEach(p=>{
    ['input', 'change'].forEach(ev=>{
      document.getElementById(p + 'Amount').addEventListener(ev, ()=> updateCurrencyHint(p));
      document.getElementById(p + 'Currency').addEventListener(ev, ()=> updateCurrencyHint(p));
    });
  });
  // Polja "pokriva vise meseci" u formama prihoda/rashoda
  function readSpreadField(prefix){
    if(!document.getElementById(prefix + 'SpreadToggle').checked) return null;
    const n = Math.max(2, Math.min(60, parseInt(document.getElementById(prefix + 'SpreadMonths').value, 10) || 2));
    const start = document.getElementById(prefix + 'SpreadStart').value;
    return { spreadMonths: n, spreadStart: /^\d{4}-\d{2}$/.test(start) ? start : null };
  }
  function updateSpreadHint(prefix){
    const hint = document.getElementById(prefix + 'SpreadHint');
    const s = readSpreadField(prefix);
    document.getElementById(prefix + 'SpreadRow').style.display = s ? 'grid' : 'none';
    if(!s){ hint.textContent = ''; return; }
    const date = document.getElementById(prefix + 'Date').value || toISODateLocal(new Date());
    const startInput = document.getElementById(prefix + 'SpreadStart');
    if(!startInput.value) startInput.value = date.slice(0, 7);
    const amount = readAmountField(prefix).amount;
    const probe = { amount: isNaN(amount) ? 0 : amount, date, spreadMonths: s.spreadMonths, spreadStart: startInput.value };
    const { start, end } = C.spreadOf(probe);
    hint.textContent = `${monthYearLabelSr(start)} – ${monthYearLabelSr(end)}` + (probe.amount > 0 ? t(' — po {0} mesečno', fmt(probe.amount / s.spreadMonths)) : '') + t('. Na račun se ceo iznos računa na dan uplate.');
  }
  ['inc', 'exp'].forEach(p=>{
    [p + 'SpreadToggle', p + 'SpreadMonths', p + 'SpreadStart', p + 'Amount', p + 'Currency', p + 'Date'].forEach(id=>{
      document.getElementById(id).addEventListener('input', ()=> updateSpreadHint(p));
      document.getElementById(id).addEventListener('change', ()=> updateSpreadHint(p));
    });
  });
  function resetSpreadField(prefix){
    document.getElementById(prefix + 'SpreadToggle').checked = false;
    document.getElementById(prefix + 'SpreadMonths').value = 3;
    document.getElementById(prefix + 'SpreadStart').value = '';
    updateSpreadHint(prefix);
  }
  const origTag = e => (e.currency && e.currency !== 'RSD' && e.origAmount) ? `<span class="orig-amt">${fmtOrig(e.origAmount, e.currency)}</span>` : '';
  const accountTag = e => (accounts.length >= 2 && !isTransfer(e)) ? ` <span class="tag-chip" style="color:var(--ink-soft);">${escapeHtml(accountName(e.accountId))}</span>` : '';
  // Iznos ponavljajuce stavke u RSD po danasnjem kursu (za stavke u stranoj valuti, npr. kirija u EUR)
  function recurringAmountNow(r){
    if(r.currency && r.currency !== 'RSD' && r.origAmount && fx.rates[r.currency]) return Math.round(r.origAmount * fx.rates[r.currency]);
    return r.amount;
  }
  function recurringEntry(r, mKey, amount){
    let amt = amount;
    // Rata (r.debtId): nikad ne "prepuni" dug — ako je dug vec izmiren, iznos je 0 (poziocima je
    // markRecurringPaid koji vec zaustavlja stvaranje unosa u tom slucaju; ovo je odbrambena granica).
    if(amt == null && r.debtId){
      const d = debts.find(x=> x.id === r.debtId);
      amt = d ? Math.min(recurringAmountNow(r), debtRemaining(d)) : recurringAmountNow(r);
    }
    const e = { id: recurringEntryId(r, mKey), type: r.type, desc: r.desc, amount: amt != null ? amt : recurringAmountNow(r), category: r.category, date: C.dueDateFor(r, mKey) };
    if(r.debtId) e.debtId = r.debtId;
    if(r.spreadPeriod && (r.frequency === 'quarterly' || r.frequency === 'yearly')){ e.spreadMonths = r.frequency === 'yearly' ? 12 : 3; e.spreadStart = mKey; }
    if(r.accountId) e.accountId = r.accountId;
    if(r.currency && r.currency !== 'RSD' && r.origAmount && fx.rates[r.currency]){
      e.currency = r.currency; e.rate = fx.rates[r.currency];
      e.origAmount = Math.round(e.amount / e.rate * 100) / 100;
    }
    return e;
  }
  async function refreshRates(force){
    if(!window.desktop || !window.desktop.getRates) return;
    try{
      const r = await window.desktop.getRates(!!force);
      if(r && r.rates && r.rates.EUR){
        fx = { date: r.date, rates: r.rates, buy: r.buy || {}, sell: r.sell || {}, source: r.source || 'nbs', stale: !!r.stale };
        localStorage.setItem(FX_KEY, JSON.stringify({ date: fx.date, rates: fx.rates, buy: fx.buy, sell: fx.sell, source: fx.source }));
        // Ponavljajuce stavke u stranoj valuti: osvezi procenu u RSD po novom kursu
        let changed = false;
        recurring.forEach(rec=>{ const now = recurringAmountNow(rec); if(now !== rec.amount){ rec.amount = now; changed = true; } });
        if(changed) saveRecurring();
      }
      lastRatesResult = r;
      renderRatesInfo(r);
      populateCurrencySelects();
      if(force) renderAll(); else invalidate();
    } catch(e){ renderRatesInfo({ error: e.message }); }
  }
  let lastRatesResult = null;
  function renderRatesInfo(r){
    const el = document.getElementById('ratesInfo');
    if(!el) return;
    const has = Object.keys(fx.rates || {}).length > 0;
    const dateTxt = fx.date ? parseLocalDate(fx.date).toLocaleDateString(LOCALE) : '';
    const fallback = fx.source === 'fallback';
    el.textContent = has
      ? (fallback ? t('Tržišni kurs (rezervni izvor){0}', dateTxt ? t(' za {0}', dateTxt) : '') : t('Srednji kurs NBS{0}', dateTxt ? t(' za {0}', dateTxt) : ''))
        + (r && r.stale ? t(' — nema interneta, prikazan je poslednji preuzet kurs.') : (dateTxt.endsWith('.') ? '' : '.'))
      : t('Kursna lista još nije preuzeta') + (r && r.error ? ` (${r.error})` : '') + '.';
    const note = document.getElementById('ratesSourceNote');
    if(note) note.textContent = fallback
      ? t('Izvor NBS kursa (kurs.resenje.org) trenutno ne odgovara, pa se koristi open.er-api.com. Kurs je blizu NBS, ali nije zvaničan; čim NBS izvor proradi, aplikacija se sama vraća na njega.')
      : t('Izvor: kurs.resenje.org (zvanična kursna lista NBS). Ako ne radi, koristi se rezervni izvor open.er-api.com.');
  }
  // ---- Ekran Kursevi ----
  function fxToRsd(c){ return c === 'RSD' ? 1 : fx.rates[c]; }
  function renderRatesScreen(){
    renderRatesInfo(lastRatesResult);
    const avail = CURRENCIES.filter(c=> c === 'RSD' || fx.rates[c]);
    const opt = c => `<option value="${c}">${c} — ${escapeHtml(currencyName(c))}</option>`;
    ['fxConvFrom', 'fxConvTo'].forEach((id, i)=>{
      const sel = document.getElementById(id);
      const prev = sel.value || (i === 0 ? 'EUR' : 'RSD');
      sel.innerHTML = avail.map(opt).join('');
      sel.value = avail.includes(prev) ? prev : avail[i === 0 ? Math.min(1, avail.length - 1) : 0];
    });
    updateFxConverter();
    const q = (document.getElementById('ratesFilter').value || '').trim().toLowerCase();
    const rows = CURRENCIES.filter(c=> c !== 'RSD' && fx.rates[c])
      .filter(c=> !q || c.toLowerCase().includes(q) || currencyName(c).toLowerCase().includes(q))
      .sort((a, b)=> (fxFavorites.includes(b) - fxFavorites.includes(a)) || CURRENCIES.indexOf(a) - CURRENCIES.indexOf(b));
    const cell = v => v ? fmtRate(v) : '<span class="muted">—</span>';
    document.getElementById('ratesTableBody').innerHTML = rows.length ? rows.map(c=>{
      const fav = fxFavorites.includes(c);
      return `<tr class="${fav ? 'is-fav' : ''}">
        <td class="c-star"><button class="fx-star" data-cur="${c}" aria-pressed="${fav}" title="${fav ? t('Ukloni iz unosa') : t('Nudi pri unosu')}">${fav ? '★' : '☆'}</button></td>
        <td><span class="fx-code" translate="no">${c}</span> <span class="fx-name">${escapeHtml(currencyName(c))}</span></td>
        <td class="num">${fmtRate(fx.rates[c])}</td><td class="num">${cell((fx.buy || {})[c])}</td><td class="num">${cell((fx.sell || {})[c])}</td>
      </tr>`;
    }).join('') : `<tr><td colspan="5" class="muted" style="padding:1.2em 0;">${Object.keys(fx.rates || {}).length ? t('Nema valute za tu pretragu.') : t('Kursna lista još nije preuzeta.')}</td></tr>`;
  }
  function updateFxConverter(){
    const from = document.getElementById('fxConvFrom').value, to = document.getElementById('fxConvTo').value;
    const amount = parseFloat(document.getElementById('fxConvAmount').value);
    const out = document.getElementById('fxConvResult'), hint = document.getElementById('fxConvHint');
    const a = fxToRsd(from), b = fxToRsd(to);
    if(!a || !b){ out.textContent = '—'; hint.textContent = ''; return; }
    const val = isNaN(amount) ? NaN : amount * a / b;
    out.textContent = isNaN(val) ? '—' : val.toLocaleString(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    hint.textContent = `1 ${from} = ${fmtRate(a / b)} ${to}` + (from !== to ? ` · 1 ${to} = ${fmtRate(b / a)} ${from}` : '');
  }
  ['input', 'change'].forEach(ev=> ['fxConvAmount', 'fxConvFrom', 'fxConvTo'].forEach(id=> document.getElementById(id).addEventListener(ev, updateFxConverter)));
  document.getElementById('fxConvSwap').addEventListener('click', ()=>{
    const f = document.getElementById('fxConvFrom'), to = document.getElementById('fxConvTo');
    const tmp = f.value; f.value = to.value; to.value = tmp;
    updateFxConverter();
  });
  document.getElementById('ratesFilter').addEventListener('input', renderRatesScreen);
  document.getElementById('ratesTableBody').addEventListener('click', (e)=>{
    const btn = e.target.closest('.fx-star');
    if(!btn) return;
    const c = btn.dataset.cur;
    fxFavorites = fxFavorites.includes(c) ? fxFavorites.filter(x=> x !== c) : [...fxFavorites, c];
    saveFxFavorites();
    populateCurrencySelects();
    renderRatesScreen();
  });

  function renderAccountsOverview(){
    const panel = document.getElementById('accountsOverviewPanel');
    if(accounts.length === 0){ panel.style.display = 'none'; return; }
    panel.style.display = 'block';
    const bal = accountBalances();
    const total = accounts.reduce((s,a)=> s + bal[a.id], 0);
    document.getElementById('accountsOverview').innerHTML = accounts.map(a=>
      `<div class="account-tile"><div class="name">${escapeHtml(a.name)}</div><div class="bal" style="${bal[a.id] < 0 ? 'color:var(--rust-text);' : ''}">${fmt(bal[a.id])}</div></div>`).join('')
      + (accounts.length > 1 ? `<div class="account-tile total"><div class="name">Ukupno</div><div class="bal">${fmt(total)}</div></div>` : '');
  }
  function renderAccounts(){
    const bal = accountBalances();
    const list = document.getElementById('accountsList');
    document.getElementById('accountsEmpty').style.display = accounts.length ? 'none' : 'block';
    const usedIds = new Set();
    entries.forEach(e=>{ if(e.accountId) usedIds.add(e.accountId); if(e.fromAccount) usedIds.add(e.fromAccount); if(e.toAccount) usedIds.add(e.toAccount); });
    recurring.forEach(r=>{ if(r.accountId) usedIds.add(r.accountId); });
    list.innerHTML = accounts.map((a,i)=>{
      const inUse = usedIds.has(a.id) || (i === 0 && accounts.length > 1);
      return `<li data-row-id="${a.id}"><span class="name"><b>${escapeHtml(a.name)}</b> <span class="cat-tag">${ACCOUNT_TYPE_LABEL[a.type] || a.type}</span>${i === 0 ? ' <span class="tag-chip" style="color:var(--ink-soft);">podrazumevani</span>' : ''}</span>
        <span style="font-variant-numeric:tabular-nums; font-weight:600; ${bal[a.id] < 0 ? 'color:var(--rust-text);' : ''}">${fmt(bal[a.id])}</span>
        <button class="edit-btn" data-acc="${a.id}" title="Uredi">✎</button>
        ${i > 0 ? `<button class="edit-btn" data-acc-default="${a.id}" title="Postavi kao podrazumevani">★</button>` : ''}
        <button class="del-btn" data-acc-del="${a.id}" ${inUse ? 'disabled title="Račun se koristi u stavkama"' : 'title="Obriši račun"'}>✕</button></li>`;
    }).join('');
    list.querySelectorAll('[data-acc]').forEach(b=> b.addEventListener('click', ()=>{
      const a = accountById(b.dataset.acc);
      const current = bal[a.id];
      openEditModal('Uredi račun', [
        {key:'name', label:'Naziv', type:'text', value:a.name},
        {key:'type', label:'Vrsta', type:'select', value:ACCOUNT_TYPE_LABEL[a.type], options:Object.values(ACCOUNT_TYPE_LABEL)},
        {key:'actual', label: t('Stvarno stanje danas (RSD) — sada u aplikaciji: {0}', fmt(current)), type:'number', value:Math.round(current)},
      ], (vals)=>{
        const name = (vals.name||'').trim();
        if(!name) return;
        if(accounts.some(x=> x.id !== a.id && x.name.toLowerCase() === name.toLowerCase())){ appAlert('Račun sa tim imenom već postoji.'); return; }
        a.name = name;
        a.type = Object.keys(ACCOUNT_TYPE_LABEL).find(k=> ACCOUNT_TYPE_LABEL[k] === vals.type) || a.type;
        // Uskladjivanje sa bankom: razlika ide u pocetno stanje
        if(!isNaN(vals.actual) && Math.round(vals.actual) !== Math.round(current)) a.openingBalance = (Number(a.openingBalance)||0) + (vals.actual - current);
        saveAccounts(); populateAccountSelects(); renderAll();
      });
    }));
    list.querySelectorAll('[data-acc-default]').forEach(b=> b.addEventListener('click', ()=>{
      const a = accountById(b.dataset.accDefault);
      // Stavke bez racuna pripadaju podrazumevanom — pre promene ih vezi za dosadasnji podrazumevani
      const oldDefault = defaultAccountId();
      entries.forEach(e=>{ if(!isTransfer(e) && !e.accountId) e.accountId = oldDefault; });
      accounts = [a, ...accounts.filter(x=> x.id !== a.id)];
      saveEntries(); saveAccounts(); populateAccountSelects(); renderAll();
    }));
    list.querySelectorAll('[data-acc-del]:not([disabled])').forEach(b=> b.addEventListener('click', ()=>{
      accounts = accounts.filter(x=> x.id !== b.dataset.accDel);
      saveAccounts(); populateAccountSelects(); renderAll();
    }));

    const section = document.getElementById('transferSection');
    section.style.display = accounts.length >= 2 ? 'grid' : 'none';
    const transfers = entries.filter(isTransfer).sort((a,b)=> b.date.localeCompare(a.date)).slice(0, 30);
    const tl = document.getElementById('transfersList');
    tl.innerHTML = transfers.map(e=> `<li data-row-id="${e.id}"><span class="name">${parseLocalDate(e.date).toLocaleDateString(LOCALE,{day:'2-digit',month:'2-digit',year:'numeric'})} · ${escapeHtml(accountName(e.fromAccount))} → ${escapeHtml(accountName(e.toAccount))}${e.desc ? ' · ' + escapeHtml(e.desc) : ''}</span>
      <span style="font-variant-numeric:tabular-nums;">${fmt(e.amount)}</span>
      <button class="del-btn" data-id="${e.id}" title="Obriši">✕</button></li>`).join('') || '<li class="empty">Još nema prenosa.</li>';
    wireDeleteButton(tl, {
      rowSelector: 'li',
      find: id => entries.find(e=> e.id === id),
      onDelete: (entry)=>{ entries = entries.filter(e=> e.id !== entry.id); saveEntries(); },
      undoLabel: () => t('Obrisan prenos'),
      onUndo: entry => { entries.push(entry); saveEntries(); }
    });
  }
  document.getElementById('accountForm').addEventListener('submit', function(e){
    e.preventDefault();
    const name = document.getElementById('accName').value.trim();
    if(!name) return;
    if(accounts.some(a=> a.name.toLowerCase() === name.toLowerCase())){ appAlert('Račun sa tim imenom već postoji.'); return; }
    accounts.push({ id: newId(), name, type: document.getElementById('accType').value, openingBalance: parseFloat(document.getElementById('accOpening').value) || 0 });
    saveAccounts(); populateAccountSelects();
    this.reset();
    renderAll();
  });
  document.getElementById('trDate').value = toISODateLocal(new Date());
  document.getElementById('transferForm').addEventListener('submit', function(e){
    e.preventDefault();
    const from = document.getElementById('trFrom').value, to = document.getElementById('trTo').value;
    const amount = parseFloat(document.getElementById('trAmount').value);
    const date = document.getElementById('trDate').value;
    if(!from || !to || from === to){ appAlert('Izaberi dva različita računa.'); return; }
    if(isNaN(amount) || amount <= 0 || !date) return;
    entries.push({ id: newId(), type: 'transfer', desc: document.getElementById('trDesc').value.trim(), amount, date, fromAccount: from, toAccount: to });
    saveEntries();
    this.reset(); document.getElementById('trDate').value = toISODateLocal(new Date());
    populateAccountSelects();
    renderAll();
  });
  // Uplata u cilj: ako je cilj vezan za racun, napravi i prenos sa podrazumevanog racuna na taj racun
  // Vraca id napravljenog prenosa (ili null). opts: { date, auto } — za mesecnu uplatu iz plana.
  function contributeToGoal(g, amount, fromAccount, opts){
    opts = opts || {};
    g.current = C.round2(g.current + amount);
    let transferId = null;
    if(g.accountId && accountById(g.accountId)){
      const from = fromAccount || (accounts.find(a=> a.id !== g.accountId) || {}).id;
      if(from && from !== g.accountId){
        transferId = newId();
        const tr = { id: transferId, type: 'transfer', desc: t('Uplata u cilj: {0}', g.name), amount, date: opts.date || toISODateLocal(new Date()), fromAccount: from, toAccount: g.accountId, goalId: g.id };
        if(opts.auto) tr.autoGoal = true;
        entries.push(tr);
        saveEntries();
      }
    }
    saveGoals();
    return transferId;
  }

