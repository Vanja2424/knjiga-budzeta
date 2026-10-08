  // ---------- Pitaj svoj budzet: AI bira proracune, aplikacija racuna lokalno, AI pise odgovor ----------
  let fakeAsk = null; // test: (req, step) -> { ok, content }
  if(IS_TEST) Object.defineProperty(window, '__fakeAsk', { get: ()=> fakeAsk, set: v=>{ fakeAsk = v; }, configurable: true });
  let askBusy = false;
  let askKeySet = null; // null = jos nije provereno (kljuc zna samo glavni proces)
  let askLangOverride = null; // test: jezik odgovora
  if(IS_TEST) Object.defineProperty(window, '__askLang', { get: ()=> askLangOverride, set: v=>{ askLangOverride = v; }, configurable: true });
  const ASK_HINT = 'Aplikacija sama računa brojeve; AI dobija samo pitanje i rezultate potrebnih proračuna (vidi „Šta je poslato AI-ju“ uz svaki odgovor).';
  const askAiAvailable = ()=> !!(fakeAsk || (window.desktop && window.desktop.bills && askKeySet !== false));
  function renderAsk(){
    const ok = askAiAvailable();
    document.getElementById('askBtn').disabled = askBusy || !ok;
    document.getElementById('askHint').textContent = ok ? t(ASK_HINT) : window.desktop ? t('AI čitanje nije podešeno (Podešavanja → AI čitanje računa).') : t('Ova funkcija radi samo u desktop aplikaciji.');
    if(!fakeAsk && window.desktop && window.desktop.bills && window.desktop.bills.keyInfo)
      window.desktop.bills.keyInfo().then(i=>{ const v = !!(i && i.set); if(v !== askKeySet){ askKeySet = v; renderAsk(); } }).catch(()=>{});
  }
  // greska za "Pitaj": prevelik zahtev nije "racun"
  const askErr = r => r && r.kind === 'toolarge' ? t('Pitanje traži previše podataka za besplatni Groq limit — suzi period ili pokušaj za minut.') : (BILL_ERR[r && r.kind] || BILL_ERR.http)(r || {});
  async function askCall(req, step){
    try{ return fakeAsk ? await fakeAsk(req, step) : await window.desktop.bills.read(req); }
    catch(e){ return { ok: false, kind: 'http', message: String(e && e.message || e) }; }
  }
  function addAskCard(question, answer, sent, notes, isError){
    const card = document.createElement('div');
    card.className = 'ask-card' + (isError ? ' ask-error' : '');
    const q = document.createElement('div'); q.className = 'ask-q'; q.textContent = question;
    const a = document.createElement('div'); a.className = 'ask-answer'; a.textContent = answer;
    card.append(q, a);
    if(notes && notes.length){ const n = document.createElement('div'); n.className = 'hint'; n.textContent = t('Napomena: {0}', notes.join('; ')); card.append(n); }
    if(sent.length){
      const d = document.createElement('details'); d.className = 'ask-sent';
      const sm = document.createElement('summary'); sm.textContent = t('Šta je poslato AI-ju');
      d.append(sm);
      sent.forEach(txt=>{ const pre = document.createElement('pre'); pre.textContent = txt; d.append(pre); });
      card.append(d);
    }
    document.getElementById('askList').prepend(card);
  }
  async function askBudget(question){
    question = String(question || '').trim();
    if(!question || askBusy) return;
    if(!askAiAvailable()){ renderAsk(); return; }
    askBusy = true; renderAsk();
    const btn = document.getElementById('askBtn'); const prevLabel = btn.textContent; btn.textContent = t('Razmišljam…');
    try{
      const { first, last } = C.askMonthRange(entries, currentMonthKey());
      const req1 = { images: [], text: '', prompt: C.askPlanPrompt({ question, today: toISODateLocal(new Date()), first, last, expenseCats, incomeCats }) };
      const r1 = await askCall(req1, 1);
      if(!r1 || !r1.ok){ addAskCard(question, askErr(r1), [req1.prompt], null, true); return; }
      const plan = C.cleanAskPlan(r1.content, { first, last, categories: expenseCats.concat(incomeCats) });
      if(!plan){ addAskCard(question, t('AI odgovor nije mogao da se pročita.'), [req1.prompt], null, true); return; }
      if(plan.offTopic){ addAskCard(question, t('Mogu da odgovorim samo na pitanja o tvom budžetu.'), [req1.prompt], plan.notes); return; }
      if(!plan.calls.length){ addAskCard(question, t('Za ovo pitanje nema podataka u knjizi.'), [req1.prompt], plan.notes); return; }
      const results = C.runAskTools(plan.calls, { entries, recurring, today: toISODateLocal(new Date()), snapshot: tgSnapshot() });
      const req2 = { images: [], text: '', prompt: C.askAnswerPrompt({ question, today: toISODateLocal(new Date()), results, lang: askLangOverride || I18N.lang }) };
      const r2 = await askCall(req2, 2);
      if(!r2 || !r2.ok){ addAskCard(question, askErr(r2), [req1.prompt, req2.prompt], plan.notes, true); return; }
      addAskCard(question, C.cleanAskAnswer(r2.content).slice(0, 3000), [req1.prompt, req2.prompt], plan.notes);
    } finally {
      askBusy = false; btn.textContent = prevLabel; renderAsk();
    }
  }
  document.getElementById('askBtn').addEventListener('click', ()=> askBudget(document.getElementById('askInput').value));
  document.getElementById('askInput').addEventListener('keydown', e=>{ if(e.key === 'Enter' && !e.isComposing){ e.preventDefault(); askBudget(e.target.value); } });
  document.querySelectorAll('.ask-suggest').forEach(b=> b.addEventListener('click', ()=>{ if(askBusy) return; document.getElementById('askInput').value = b.textContent; askBudget(b.textContent); }));

  // ---- Plati sve zakasnele ----
  let payOverdueLastFocus = null;
  const overdueNow = () => C.overdueRecurring(recurring, applied, skipped, currentMonthKey(), new Date().getDate());
  function updatePayOverdueBtn(){
    const btn = document.getElementById('payOverdueBtn');
    const n = overdueNow().length;
    btn.style.display = n ? '' : 'none';
    btn.textContent = t('Plati sve zakasnele ({0})', n);
  }
  function openPayOverdue(){
    const items = overdueNow(); if(!items.length) return;
    const mKey = currentMonthKey();
    payOverdueLastFocus = document.activeElement;
    // Klik na labelu (opis/datum) čekira/otčekira kućicu; broj-polje samo obrađuje svoj klik (input ne prosleđuje klik labeli).
    document.getElementById('payOverdueList').innerHTML = items.map(r=> `<label class="pay-overdue-row">
        <input type="checkbox" class="pay-overdue-check" data-id="${r.id}" checked>
        <span class="pay-overdue-desc" translate="no">${escapeHtml(r.desc)}</span>
        <span class="muted">${parseLocalDate(C.dueDateFor(r, mKey)).toLocaleDateString(LOCALE, {day:'2-digit', month:'2-digit'})}</span>
        <input type="number" class="pay-overdue-amt" data-id="${r.id}" value="${suggestedPayAmount(r)}" min="0" step="1" aria-label="${escapeHtml(r.desc)}">
      </label>`).join('');
    const upd = ()=>{
      const sum = [...document.querySelectorAll('.pay-overdue-check')].filter(c=> c.checked)
        .reduce((s, c)=> s + (parseFloat(document.querySelector(`.pay-overdue-amt[data-id="${CSS.escape(c.dataset.id)}"]`).value) || 0), 0);
      document.getElementById('payOverdueTotal').textContent = t('Izabrano ukupno: {0}', fmt(sum));
    };
    document.querySelectorAll('#payOverdueList input').forEach(i=> i.addEventListener('input', upd));
    upd();
    document.getElementById('payOverdueOverlay').classList.add('show');
    setTimeout(()=> document.getElementById('payOverdueSave').focus(), 0);
  }
  function closePayOverdue(){
    document.getElementById('payOverdueOverlay').classList.remove('show');
    if(payOverdueLastFocus && typeof payOverdueLastFocus.focus === 'function') payOverdueLastFocus.focus();
    payOverdueLastFocus = null;
  }
  // opts (smoke): { ids: [...] } plati te stavke po predlozenom iznosu bez modala
  // Ne dozvoli da rucno unet iznos za ratu prekorači ostatak duga (prepunjavanje).
  function capDebtAmount(r, amount){
    if(amount == null || !r.debtId) return amount;
    const d = debts.find(x=> x.id === r.debtId);
    return d ? Math.min(amount, debtRemaining(d)) : amount;
  }
  function confirmPayOverdue(opts){
    const mKey = currentMonthKey();
    const items = overdueNow();
    let chosen;
    if(opts && opts.ids) chosen = items.filter(r=> opts.ids.includes(r.id)).map(r=> ({ r, amount: undefined }));
    else chosen = [...document.querySelectorAll('.pay-overdue-check')].filter(c=> c.checked).map(c=>{
      const r = items.find(x=> x.id === c.dataset.id);
      const v = parseFloat(document.querySelector(`.pay-overdue-amt[data-id="${CSS.escape(c.dataset.id)}"]`).value);
      return r ? { r, amount: capDebtAmount(r, v > 0 ? v : undefined) } : null;
    }).filter(Boolean);
    if(!chosen.length){ closePayOverdue(); return false; }
    // markRecurringPaid vraca null za ratu ciji je dug u medjuvremenu izmiren — takve preskoci (nista nije nastalo).
    const restore = recurringPayUndo(chosen.map(c=> c.r.id), mKey);
    const made = chosen.map(({ r, amount })=> ({ rid: r.id, entryId: markRecurringPaid(r, mKey, amount) })).filter(m=> m.entryId != null);
    if(!made.length){ closePayOverdue(); return false; }
    saveApplied(); saveEntries(); closePayOverdue(); playPaidSound(); renderAll();
    const total = made.reduce((s, m)=> s + ((entries.find(e=> e.id === m.entryId) || {}).amount || 0), 0);
    showUndoToast(t('Plaćeno {0} stavki ({1})', made.length, fmt(total)), ()=>{
      const ids = new Set(made.map(m=> m.entryId));
      entries = entries.filter(e=> !ids.has(e.id));
      restore();
      saveEntries(); renderAll();
    });
    return true;
  }
  if(IS_TEST) window.__payOverdue = opts => confirmPayOverdue(opts);
  document.getElementById('payOverdueBtn').addEventListener('click', openPayOverdue);
  document.getElementById('payOverdueCancel').addEventListener('click', closePayOverdue);
  document.getElementById('payOverdueSave').addEventListener('click', ()=> confirmPayOverdue());
  document.getElementById('payOverdueOverlay').addEventListener('click', e=>{ if(e.target.id === 'payOverdueOverlay') closePayOverdue(); });

  // Brisanje ponavljajuće stavke mora ocistiti SVE mesece (proslost i buducnost, npr. placeno
  // unapred preko payAheadRecurring), ne samo tekuci — inace osirotele generisane stavke za
  // buduce mesece ostaju zauvek u entries jer reconcileAppliedEntries() samo dodaje, nikad ne brise.
  // Rata (r.debtId): vec placene rate su STVARNI rashodi koji ulaze u otplatu duga (C.debtPaid) —
  // brisanje stavke ne sme da ih obrise (to bi "vratilo" dug). Zadrzava se samo ono placeno za
  // tekuci/prosli mesec; neplaceno i unapred-placeno (buduce) se brise zajedno sa samom stavkom.
  function removeAllRecurringOccurrences(r){
    const prefix = 'rec-' + r.id + '-';
    const cur = currentMonthKey();
    // Placene rate (i unapred placene) su otplata duga — ostaju; brisu se samo neplacene
    const isKeptForDebt = e => r.debtId && applied[e.id.slice(prefix.length)] && applied[e.id.slice(prefix.length)].includes(r.id);
    const removedEntries = entries.filter(e => e.id.startsWith(prefix) && !isKeptForDebt(e));
    entries = entries.filter(e => !e.id.startsWith(prefix) || isKeptForDebt(e));
    const removedApplied = {};
    Object.keys(applied).forEach(mKey=>{
      if(applied[mKey] && applied[mKey].includes(r.id) && !r.debtId){
        removedApplied[mKey] = true;
        applied[mKey] = applied[mKey].filter(id=>id!==r.id);
      }
    });
    const removedSkipped = {};
    Object.keys(skipped).forEach(mKey=>{
      if(skipped[mKey] && skipped[mKey].includes(r.id)){
        removedSkipped[mKey] = true;
        skipped[mKey] = skipped[mKey].filter(id=>id!==r.id);
      }
    });
    saveEntries(); saveApplied(); saveSkipped();
    return { removedEntries, removedApplied, removedSkipped };
  }
  function restoreRecurringOccurrences(r, snapshot){
    entries.push(...snapshot.removedEntries);
    Object.keys(snapshot.removedApplied).forEach(mKey=>{
      if(!applied[mKey]) applied[mKey] = [];
      if(!applied[mKey].includes(r.id)) applied[mKey].push(r.id);
    });
    Object.keys(snapshot.removedSkipped).forEach(mKey=>{
      if(!skipped[mKey]) skipped[mKey] = [];
      if(!skipped[mKey].includes(r.id)) skipped[mKey].push(r.id);
    });
    saveEntries(); saveApplied(); saveSkipped();
  }

