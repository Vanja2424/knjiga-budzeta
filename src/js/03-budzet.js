  // ---- Ponavljajuce stavke: rucno cekiranje ----
  function currentMonthKey(){
    const now = new Date();
    return now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  }
  function monthKeyPlus(n){
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth()+n, 1);
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  }
  // Kao monthKeyPlus, ali relativno na proizvoljni mKey string, ne na "danas" — potrebno za
  // ulancano prenosenje envelope rollover-a kroz vise preskocenih meseci.
  function nextMonthKey(mKey){
    const [y,m] = mKey.split('-').map(Number);
    const d = new Date(y, m, 1);
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  }

  // ---- Envelope/zero-based budzetiranje ----
  function categorySpentInMonth(cat, mKey){
    return sumMonth(mKey, e=> isPaidExpense(e) && e.category === cat);
  }
  // Predlog za envelope alokaciju — prosek poslednja 3 meseca (uklj. tekuci, koliko god je dosad potroseno u njemu).
  function avgMonthlySpend3(cat){
    const months = lastNMonths(3);
    const total = months.reduce((s,m)=> s + categorySpentInMonth(cat, m), 0);
    return Math.round(total / months.length);
  }
  // ---- Budzet po kategorijama (jedan sistem od v1.4) ----
  // limits[cat] = mesecni budzet kategorije. Opciono (envelopeState.rolloverEnabled) se neiskorisceni
  // ili prekoraceni iznos prenosi u sledeci mesec — ranije je to bio poseban sistem "koverti".
  const budgetCats = () => expenseCats.filter(c=> limits[c] > 0);
  const rolloverOn = () => !!envelopeState.rolloverEnabled;
  // Ulancano prenosi ostatak kroz svaki mesec izmedju poslednjeg obradjenog i tekuceg
  // (pokriva i slucaj da app nije otvarana vise meseci uzastopno).
  function processEnvelopeRollover(){
    const mKey = currentMonthKey();
    if(!envelopeState.lastRolloverMonth){ envelopeState.lastRolloverMonth = mKey; saveEnvelopeState(); return; }
    if(envelopeState.lastRolloverMonth === mKey) return;
    let cursor = envelopeState.lastRolloverMonth;
    while(cursor < mKey){
      const newRollover = {};
      if(rolloverOn()) Object.keys(limits).forEach(cat=>{
        const allocated = limits[cat] || 0;
        if(allocated <= 0) return;
        newRollover[cat] = allocated + (envelopeState.rollover[cat] || 0) - categorySpentInMonth(cat, cursor);
      });
      envelopeState.rollover = newRollover;
      cursor = nextMonthKey(cursor);
    }
    envelopeState.lastRolloverMonth = mKey;
    saveEnvelopeState();
  }
  function envelopeRemainingThisMonth(cat, mKey){
    mKey = mKey || currentMonthKey();
    const allocated = limits[cat] || 0;
    if(allocated <= 0) return null;
    const rollover = (rolloverOn() && mKey === currentMonthKey()) ? (envelopeState.rollover[cat] || 0) : 0;
    const spent = categorySpentInMonth(cat, mKey);
    return { allocated, rollover, spent, remaining: allocated + rollover - spent };
  }
  function renderEnvelopesPanel(){
    processEnvelopeRollover();
    const panel = document.getElementById('envelopesPanel');
    const cats = budgetCats();
    if(cats.length === 0 && !(monthlyBudget > 0)){ panel.style.display = 'none'; return; }
    panel.style.display = 'block';
    document.getElementById('envelopesTitle').textContent = t('Budžet — {0}', monthYearLabelSr(viewMonth));
    const isCurrent = viewMonth === currentMonthKey();
    const rows = [];
    if(monthlyBudget > 0){
      const spent = monthTotals(viewMonth).expense;
      rows.push({ name: '<b>Ukupno (svi rashodi)</b>', spent, total: monthlyBudget, rolloverTxt: '' });
    }
    cats.map(cat=> ({ cat, info: envelopeRemainingThisMonth(cat, viewMonth) }))
      .sort((a,b)=> (b.info.spent / (b.info.allocated + b.info.rollover || 1)) - (a.info.spent / (a.info.allocated + a.info.rollover || 1)))
      .forEach(({cat, info})=>{
        const rolloverTxt = info.rollover !== 0 ? ` <span style="opacity:0.65;">(${t('{0} preneto', (info.rollover>0?'+':'') + fmt(info.rollover))})</span>` : '';
        rows.push({ name: catTagHtml(cat), spent: info.spent, total: info.allocated + info.rollover, rolloverTxt });
      });
    const list = document.getElementById('envelopesList');
    list.innerHTML = rows.map(r=>{
      const remaining = r.total - r.spent;
      const pct = r.total > 0 ? r.spent / r.total * 100 : 100;
      const barClass = remaining < 0 ? 'over' : (pct >= 80 ? 'near' : 'ok');
      const right = remaining >= 0
        ? `${fmt(r.spent)} / ${fmt(r.total)} · <span style="color:var(--ink-soft);">${t('preostalo {0}', fmt(remaining))}</span>`
        : `${fmt(r.spent)} / ${fmt(r.total)} · <span style="color:var(--rust-text);">${t('prekoračeno {0}', fmt(-remaining))}</span>`;
      return `<div class="breakdown-item">
        <div class="row"><span>${r.name}${r.rolloverTxt}</span><span>${right}</span></div>
        <div class="bar-track"><div class="bar-fill ${barClass}" data-target="${Math.min(100,Math.max(0,pct)).toFixed(1)}%"></div></div>
      </div>`;
    }).join('');
    growBars(list);

    const sweepBtn = document.getElementById('envelopeSweepBtn');
    const totalSurplus = (rolloverOn() && isCurrent) ? cats.reduce((s,cat)=> s + Math.max(0, envelopeRemainingThisMonth(cat).remaining), 0) : 0;
    if(totalSurplus > 0 && goals.length > 0){
      sweepBtn.style.display = 'inline-block';
      sweepBtn.dataset.amount = totalSurplus;
      sweepBtn.textContent = t('Prebaci preostali budžet ({0}) u cilj', fmt(totalSurplus));
    } else {
      sweepBtn.style.display = 'none';
    }
  }
  document.getElementById('envelopeSweepBtn').addEventListener('click', ()=>{
    const amount = parseFloat(document.getElementById('envelopeSweepBtn').dataset.amount) || 0;
    if(amount <= 0 || goals.length === 0) return;
    openEditModal(t('Prebaci preostali budžet ({0}) u cilj', fmt(amount)), [
      {key:'goalName', label:'Cilj', type:'select', value: goals[0].name, options: goals.map(g=>g.name)},
    ], (vals)=>{
      const g = goals.find(x=>x.name === vals.goalName);
      if(!g) return;
      contributeToGoal(g, amount);
      // Ponisti tacno taj visak iz prenosa (inace bi se ista para racunala i u cilju i kao preneto)
      budgetCats().forEach(cat=>{
        const info = envelopeRemainingThisMonth(cat);
        if(info && info.remaining > 0) envelopeState.rollover[cat] = (envelopeState.rollover[cat]||0) - info.remaining;
      });
      saveEnvelopeState();
      renderAll();
    });
  });
  function recurringEntryId(r, mKey){ return 'rec-' + r.id + '-' + mKey; }
  // Najskoriji STVARNI iznos kojim je ova ponavljajuca stavka placena (npr. racun za struju koji
  // varira) — koristi se kao predlog u "Plati" modalu umesto uvek istog fiksnog default iznosa.
  function lastActualAmountFor(r){
    const prefix = 'rec-' + r.id + '-';
    const matches = entries.filter(e => e.id.startsWith(prefix)).sort((a,b)=> b.date.localeCompare(a.date));
    return matches.length ? matches[0].amount : null;
  }
  // "Zaokruzi i ustedi" — scope je namerno samo rucno unet rashod (ne recurring/CSV/Excel uvoz),
  // po istom mentalnom modelu kao bankovne round-up funkcije (zaokruzuju kartične transakcije,
  // ne fiksne mesecne racune).
  function applyRoundUpSaving(amount){
    if(!roundUpGoalId) return;
    const g = goals.find(x=>x.id === roundUpGoalId);
    if(!g) return;
    const roundup = Math.ceil(amount/100)*100 - amount;
    if(roundup <= 0) return;
    g.current += roundup;
    saveGoals();
  }  function unapplyRoundUpSaving(amount){
    if(!roundUpGoalId) return;
    const g = goals.find(x=>x.id === roundUpGoalId);
    const roundup = Math.ceil(amount/100)*100 - amount;
    if(!g || roundup <= 0) return;
    g.current = Math.max(0, Math.round((g.current - roundup) * 100) / 100);
    saveGoals();
  }

  function renderRoundUpSelect(){
    const sel = document.getElementById('roundUpGoalSelect');
    const prev = roundUpGoalId;
    sel.innerHTML = '<option value="">Isključeno</option>' + goals.map(g=>`<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('');
    if(goals.some(g=>g.id === prev)) sel.value = prev; else { roundUpGoalId = ''; localStorage.setItem(ROUNDUP_KEY, ''); }
  }
  document.getElementById('roundUpGoalSelect').addEventListener('change', (e)=>{
    roundUpGoalId = e.target.value;
    localStorage.setItem(ROUNDUP_KEY, roundUpGoalId);
  });
  // Da li se ponavljajuca stavka "desava" u datom mesecu — monthly je uvek true (stari zapisi
  // bez frequency polja se ponasaju kao monthly, bez migracije). Za quarterly/yearly, anchorMonth
  // (1-12) definise fazu: yearly pogadja tacno taj mesec, quarterly svaka 3 meseca od njega.
  const isDueThisMonth = C.isDueInMonth;
  // Dan dospeca u TEKUCEM mesecu (31 u junu = 30.)
  const dueDayNow = r => C.effectiveDay(r.day, currentMonthKey());
  function frequencyLabel(r){
    if(r.frequency === 'yearly') return 'godišnje';
    if(r.frequency === 'quarterly') return 'kvartalno';
    return null;
  }
  function monthYearLabelSr(mKey){
    const [y,mo] = mKey.split('-');
    return new Date(y,mo-1,1).toLocaleDateString(LOCALE,{month:'long', year:'numeric'});
  }
  const MONTH_NAMES_SR = ['Januar','Februar','Mart','April','Maj','Jun','Jul','Avgust','Septembar','Oktobar','Novembar','Decembar'];
  const FREQ_OPTIONS = ['Mesečno', 'Kvartalno', 'Godišnje'];
  const FREQ_TO_KEY = { 'Mesečno':'monthly', 'Kvartalno':'quarterly', 'Godišnje':'yearly' };
  const FREQ_FROM_KEY = { monthly:'Mesečno', quarterly:'Kvartalno', yearly:'Godišnje' };
  // Sledeci mesec (YYYY-MM string) kada je stavka due, pocevsi OD datog meseca (uklj. njega ako je due).
  function nextDueMonthKey(r, fromMKey){
    let cursor = fromMKey;
    for(let i=0;i<12;i++){
      if(isDueThisMonth(r, cursor)) return cursor;
      cursor = nextMonthKey(cursor);
    }
    return fromMKey;
  }
  // Obrnuto od recurringEntryId: iz "rec-<rid>-<YYYY-MM>" izvuci {rid, mKey}. r.id (newId()) nikad ne sadrzi '-',
  // pa je prvi '-' nakon "rec-" prefiksa granica izmedju rid i mKey (koji sam sadrzi '-').
  function parseRecurringEntryId(id){
    if(typeof id !== 'string' || !id.startsWith('rec-')) return null;
    const rest = id.slice(4);
    const dash = rest.indexOf('-');
    if(dash < 0) return null;
    return { rid: rest.slice(0, dash), mKey: rest.slice(dash+1) };
  }
  // Kad se obrise generisani unos ponavljajuce stavke, skloni njen trag iz applied/skipped
  // da recurring ne "ozivi" tu stavku pri sledecem reconcileAppliedEntries() ili prikazu meseca.
  function unmarkRecurringEntry(id){
    const parsed = parseRecurringEntryId(id);
    if(!parsed) return;
    const { rid, mKey } = parsed;
    let changed = false;
    if(applied[mKey] && applied[mKey].includes(rid)){ applied[mKey] = applied[mKey].filter(x=>x!==rid); changed = true; }
    if(skipped[mKey] && skipped[mKey].includes(rid)){ skipped[mKey] = skipped[mKey].filter(x=>x!==rid); changed = true; }
    if(changed){ saveApplied(); saveSkipped(); }
    const r = recurring.find(x=>x.id === rid);
    if(r && r.autoPay) optOutAutoPay(rid, mKey);
  }
  function optOutAutoPay(rid, mKey){
    if(!autoPayOptOut[mKey]) autoPayOptOut[mKey] = [];
    if(!autoPayOptOut[mKey].includes(rid)) autoPayOptOut[mKey].push(rid);
    // Cuvaj po starosti (ne po broju): processAutoPay sad ume da obradi i "last" mesec ponovo,
    // pa brisanje po pukom brojanju moze da izbrise bas taj opt-out i vrati stavku koju je korisnik namerno sklonio.
    const oldest = C.addMonths(currentMonthKey(), -25);
    Object.keys(autoPayOptOut).forEach(k=> { if(k < oldest) delete autoPayOptOut[k]; });
    localStorage.setItem(AUTOPAY_OFF_KEY, JSON.stringify(autoPayOptOut));
  }
  // Suprotno od unmarkRecurringEntry — koristi se pri undo brisanja da vrati applied trag.
  function remarkRecurringEntry(id){
    const parsed = parseRecurringEntryId(id);
    if(!parsed) return;
    const { rid, mKey } = parsed;
    if(!applied[mKey]) applied[mKey] = [];
    if(!applied[mKey].includes(rid)) applied[mKey].push(rid);
    saveApplied();
  }
  function isPaid(r, mKey){ return C.isRecurringPaid(applied, r, mKey); }
  function isSkipped(r, mKey){ return C.isRecurringSkipped(skipped, r, mKey); }
  function toggleSkipMonth(r, on){
    const mKey = currentMonthKey();
    if(!skipped[mKey]) skipped[mKey] = [];
    if(on){ if(!skipped[mKey].includes(r.id)) skipped[mKey].push(r.id); }
    else { skipped[mKey] = skipped[mKey].filter(id => id !== r.id); }
    saveSkipped();
    renderAll();
  }

  function payAheadRecurring(r, months){
    // Pronadji prvi neplaceni mesec pocev od tekuceg, pa plati tacno 'months' novih meseci od tamo nadalje
    let start = 0;
    while((applied[monthKeyPlus(start)] || []).includes(r.id)) start++;
    let paidNew = 0;
    for(let k=start; k<start+months; k++){
      const mKey = monthKeyPlus(k);
      if(!applied[mKey]) applied[mKey] = [];
      if(applied[mKey].includes(r.id)) continue;
      // Rata (r.debtId): ne pravi dalje unapred-placene mesece kad je dug vec izmiren.
      if(r.debtId){ const d = debts.find(x=> x.id === r.debtId); if(d && debtRemaining(d) <= 0) break; }
      const dateStr = C.dueDateFor(r, mKey);
      entries.push(recurringEntry(r, mKey));
      applied[mKey].push(r.id);
      paidNew++;
    }
    if(paidNew > 0){
      saveApplied(); saveEntries();
      playSuccessSound();
      justPaidId = r.id;
      renderAll();
    }
  }

  // Stavke sa "Automatski upiši": na dan dospeca (ili kasnije u istom mesecu) same se upisu kao
  // placene. Mesec koji je korisnik pauzirao ili rucno odcekirao se ne dira.
  const AUTOPAY_OFF_KEY = 'budzet-autoupis-iskljuceno-v1';
  let autoPayOptOut = JSON.parse(localStorage.getItem(AUTOPAY_OFF_KEY) || '{}');
  // Obradjuje sve mesece od poslednjeg obradjenog do tekuceg (aplikacija je mozda bila zatvorena), najvise 24 unazad.
  // U proslim mesecima upisuje sve dospelo; u tekucem samo ono ciji je dan prosao.
  const AUTOPAY_LAST_KEY = 'budzet-autoupis-poslednji-mesec-v1';
  function processAutoPay(){
    syncDebtInstallments();
    const cur = currentMonthKey();
    const today = new Date().getDate();
    const months = C.monthsToProcess(localStorage.getItem(AUTOPAY_LAST_KEY), cur, 24);
    let changed = false;
    const backfilled = [];
    months.forEach(mKey=>{
      C.autoPayDue(recurring, { applied, skipped, optOut: autoPayOptOut }, mKey, mKey === cur ? today : null).forEach(r=>{
        if(r.debtId){ const d = debts.find(x=> x.id === r.debtId); if(d && debtRemaining(d) <= 0) return; }
        if(!applied[mKey]) applied[mKey] = [];
        applied[mKey].push(r.id);
        const id = recurringEntryId(r, mKey);
        if(!entries.some(e=>e.id === id)){
          entries.push(Object.assign(recurringEntry(r, mKey), { auto: true }));
          if(mKey !== cur) backfilled.push({ id, rid: r.id, mKey });
        }
        changed = true;
      });
    });
    if(localStorage.getItem(AUTOPAY_LAST_KEY) !== cur) localStorage.setItem(AUTOPAY_LAST_KEY, cur);
    if(changed){ saveApplied(); saveEntries(); }
    if(backfilled.length){
      const showBackfillToast = ()=> showUndoToast(t('Automatski upisano za propuštene mesece: {0}', backfilled.length), ()=>{
        const ids = new Set(backfilled.map(b=> b.id));
        entries = entries.filter(e=> !ids.has(e.id));
        backfilled.forEach(b=>{ applied[b.mKey] = (applied[b.mKey] || []).filter(x=> x !== b.rid); });
        saveApplied(); saveEntries(); renderAll();
      });
      // Autostart --hidden pokrece stranicu dok prozor jos nije vidljiv: toast bi tad bio nevidljiv i
      // (u nekim slucajevima) automatski propusten. Sacekaj da stranica stvarno postane vidljiva.
      if(document.visibilityState !== 'visible'){
        document.addEventListener('visibilitychange', function onVis(){
          if(document.visibilityState !== 'visible') return;
          document.removeEventListener('visibilitychange', onVis);
          showBackfillToast();
        });
      } else {
        showBackfillToast();
      }
    }
    return changed;
  }
  if(IS_TEST) window.__processAutoPay = () => { const c = processAutoPay(); if(c) renderAll(); return c; };

  function paidThroughLabel(r){
    let lastPaidK = -1;
    for(let k=0;k<24;k++){
      if((applied[monthKeyPlus(k)]||[]).includes(r.id)) lastPaidK = k; else break;
    }
    if(lastPaidK < 1) return null;
    const mKey = monthKeyPlus(lastPaidK);
    const [y,mo] = mKey.split('-');
    const label = new Date(y, mo-1, 1).toLocaleDateString(LOCALE, {month:'long', year:'numeric'});
    return t('avansno plaćeno zaključno sa:') + ' ' + label;
  }

  function getPending(){
    const mKey = currentMonthKey();
    const paidIds = applied[mKey] || [];
    const skippedIds = skipped[mKey] || [];
    const pendingItems = recurring.filter(r => isDueThisMonth(r, mKey) && !paidIds.includes(r.id) && !skippedIds.includes(r.id));
    const pendingRecExpense = pendingItems.filter(r=>r.type==='expense').reduce((s,r)=>s+r.amount,0);
    const pendingIncome = pendingItems.filter(r=>r.type==='income').reduce((s,r)=>s+r.amount,0);
    const pendingDirect = entries.filter(e=>e.type==='expense' && e.paid===false);
    const pendingDirectExpense = pendingDirect.reduce((s,e)=>s+e.amount,0);
    const pendingExpense = pendingRecExpense + pendingDirectExpense;
    const pendingCount = pendingItems.length + pendingDirect.length;
    return { pendingItems, pendingExpense, pendingIncome, pendingCount };
  }
  function isExpensePaid(e){ return e.paid !== false; }
  // Mesecni zbirovi uzimaju u obzir stavke raspodeljene na vise meseci (C.shareInMonth).
  const isIncome = e => e.type === 'income';
  const isPaidExpense = e => e.type === 'expense' && isExpensePaid(e);
  const sumMonth = (m, pred) => entries.reduce((s,e)=> pred(e) ? s + C.shareInMonth(e, m) : s, 0);
  const isSpread = e => (parseInt(e.spreadMonths, 10) || 1) > 1;
  // "80.000 od 240.000 (jul–sep)" — oznaka za stavku koja pokriva vise meseci
  function spreadLabel(e){
    if(!isSpread(e)) return '';
    const { n, start, end } = C.spreadOf(e);
    const short = m => { const [y,mo] = m.split('-'); return new Date(y, mo-1, 1).toLocaleDateString(LOCALE, {month:'short'}).replace('.','') + (start.slice(0,4) !== end.slice(0,4) ? ' ' + y.slice(2) : ''); };
    return t('{0} mes. ({1} – {2})', n, short(start), short(end));
  }
  const spreadTag = e => isSpread(e) ? ` <span class="tag-chip" title="${t('Iznos se raspoređuje na više meseci')}">⇄ ${spreadLabel(e)}</span>` : '';

  // Oznaci ponavljajucu stavku placenom za mesec i napravi njen rashod (bez iscrtavanja/zvuka) — vraca id rashoda.
  // Rata (r.debtId) ciji je dug vec izmiren: ne pravi nista, vraca null — pozivaoci moraju da provere.
  function markRecurringPaid(r, mKey, amount){
    // Racun vezan za ovu stavku u tom mesecu ("Sacuvaj za placanje"): bez rucnog iznosa placa se iznos sa racuna
    const linkedBill = bills.find(b=> b.recurringId === r.id && (b.expenseMonth || b.month) === mKey);
    if(linkedBill && !(typeof amount === 'number' && amount > 0)){ const x = billAmountRsd(linkedBill); if(x && x.amount > 0) amount = x.amount; }
    // Rata ne sme da predje ostatak duga: izmiren dug -> nista; rucno unet veci iznos -> ostatak
    if(r.debtId){
      const d = debts.find(x=> x.id === r.debtId);
      if(d){ const rem = debtRemaining(d); if(rem <= 0) return null; if(typeof amount === 'number' && amount > rem) amount = rem; }
    }
    if(!applied[mKey]) applied[mKey] = [];
    if(!applied[mKey].includes(r.id)) applied[mKey].push(r.id);
    if(skipped[mKey] && skipped[mKey].includes(r.id)){ skipped[mKey] = skipped[mKey].filter(id => id !== r.id); saveSkipped(); }
    const entryId = recurringEntryId(r, mKey);
    const existing = entries.find(e => e.id === entryId);
    if(!existing) entries.push(recurringEntry(r, mKey, (typeof amount === 'number' && amount > 0) ? amount : undefined));
    else if(existing.paid === false){ existing.wasUnpaid = { amount: existing.amount }; existing.paid = true; if(typeof amount === 'number' && amount > 0) existing.amount = amount; }
    if(linkedBill && linkedBill.entryId !== entryId){ linkedBill.entryId = entryId; saveBillsState(); }
    return entryId;
  }
  // rashod koji je postojao pre stikliranja (bio neplacen): vrati ga na neplacen umesto brisanja
  function restoreWasUnpaid(entryId){
    const e = entries.find(x=> x.id === entryId);
    if(!e || !e.wasUnpaid) return false;
    e.amount = e.wasUnpaid.amount; e.paid = false; delete e.wasUnpaid;
    return true;
  }
  if(IS_TEST) window.__togglePaid = (rid, on) => { const r = recurring.find(x=> x.id === rid); if(r) togglePaid(r, on); };
  function togglePaid(r, checked, customAmount){
    const mKey = currentMonthKey();
    if(!applied[mKey]) applied[mKey] = [];
    const entryId = recurringEntryId(r, mKey);
    if(checked){
      const id = markRecurringPaid(r, mKey, customAmount);
      if(id){ playPaidSound(); justPaidId = r.id; }
    } else {
      applied[mKey] = applied[mKey].filter(id => id !== r.id);
      if(!restoreWasUnpaid(entryId)) entries = entries.filter(e => e.id !== entryId);
      if(r.autoPay) optOutAutoPay(r.id, mKey);
      playUnpaidSound();
    }
    saveApplied(); saveEntries();
    renderAll();
  }

