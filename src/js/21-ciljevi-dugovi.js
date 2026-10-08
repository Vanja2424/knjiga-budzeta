  // ---- Ciljevi ----
  document.getElementById('goalForm').addEventListener('submit', function(e){
    e.preventDefault();
    const name = document.getElementById('goalName').value.trim();
    const target = parseFloat(document.getElementById('goalTarget').value);
    const deadline = document.getElementById('goalDeadline').value;
    if(!name || isNaN(target) || target <= 0) return;
    const goal = { id: newId(), name, target, current: 0, deadline };
    const accId = document.getElementById('goalAccount').value;
    if(accId) goal.accountId = accId;
    goals.push(goal);
    saveGoals();
    this.reset();
    renderAll();
  });

  function goalSuggestionHtml(g){
    if(!g.deadline || g.current >= g.target) return '';
    const today = new Date();
    const deadline = parseLocalDate(g.deadline);
    if(deadline < today) return '<div class="goal-suggestion overdue">Rok je prošao — vreme je da dopuniš cilj.</div>';
    let months = (deadline.getFullYear()-today.getFullYear())*12 + (deadline.getMonth()-today.getMonth());
    if(deadline.getDate() < today.getDate()) months -= 1;
    months = Math.max(1, months);
    const monthly = (g.target - g.current) / months;
    return `<div class="goal-suggestion">${t('Predlog: uplaćuj ~{0}/mesečno da stigneš do roka ({1} mes.).', fmt(monthly), months)}</div>`;
  }

  function renderGoals(){
    renderRoundUpSelect();
    const list = document.getElementById('goalsList');
    const emptyEl = document.getElementById('goalsEmpty');
    if(goals.length === 0){ list.innerHTML=''; emptyEl.style.display='block'; return; }
    emptyEl.style.display='none';
    list.innerHTML = goals.map(g=>{
      const pct = Math.min(100, (g.current/g.target*100));
      const barClass = pct >= 100 ? 'ok' : (pct >= 70 ? 'near' : '');
      const deadlineTxt = g.deadline ? parseLocalDate(g.deadline).toLocaleDateString(LOCALE,{day:'2-digit',month:'2-digit',year:'numeric'}) : t('bez roka');
      return `<div class="goal-card ${justCompletedId===g.id?'celebrate':''}" data-goal-id="${g.id}" data-row-id="${g.id}">
        <div class="goal-head">
          <span class="goal-name">${escapeHtml(g.name)}</span>
          <span style="display:flex; gap:0.3em;">
            <button class="edit-btn" data-id="${g.id}" title="Uredi">✎</button>
            <button class="del-btn" data-id="${g.id}" title="Obriši">✕</button>
          </span>
        </div>
        <div class="goal-amounts">${fmt(g.current)} / ${fmt(g.target)} — ${pct.toFixed(0)}%</div>
        <div class="bar-track"><div class="bar-fill ${barClass}" data-target="${pct.toFixed(1)}%"></div></div>
        <div class="goal-meta"><span>${t('Rok: {0}', deadlineTxt)}${g.accountId && accountById(g.accountId) ? t(' · račun: {0}', escapeHtml(accountName(g.accountId))) : ''}</span><span>${pct>=100?'<span class="done-label"><svg class="goal-check" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7"/></svg>' + t('Cilj ostvaren') + '</span>':t('{0} preostalo', fmt(g.target-g.current))}</span></div>
        ${goalSuggestionHtml(g)}
        ${g.monthly ? `<div class="goal-plan"><span>${pct >= 100 ? t('Mesečna uplata: {0} · cilj je ostvaren', fmt(g.monthly.amount)) : t('Mesečna uplata: {0} · sledeća {1}', fmt(g.monthly.amount), goalPlanNextDate(g).toLocaleDateString(LOCALE,{day:'2-digit',month:'2-digit'}))}</span><button class="btn-link goal-plan-remove" data-id="${g.id}">Ukloni</button></div>` : ''}
        <div class="goal-contribute">
          <input type="number" placeholder="Iznos uplate (RSD)" min="1" data-goal="${g.id}" class="goal-add-input">
          <button class="add" data-goal="${g.id}">Dodaj uplatu</button>
        </div>
      </div>`;
    }).join('');
    growBars(list);
    if(justCompletedId){
      const cardEl = list.querySelector(`.goal-card[data-goal-id="${justCompletedId}"]`);
      if(cardEl) cardEl.classList.add('celebrate');
      justCompletedId = null;
    }
    wireEditButton(list, {
      find: id => goals.find(x=>x.id === id),
      title: 'Uredi cilj',
      buildFields: g => [
        {key:'name', label:'Naziv cilja', type:'text', value:g.name},
        {key:'target', label:'Ciljani iznos (RSD)', type:'number', value:g.target},
        {key:'current', label:'Trenutno sakupljeno (RSD)', type:'number', value:g.current},
        {key:'deadline', label:'Rok (opciono)', type:'date', value:g.deadline || ''},
        ...(accounts.length >= 2 ? [{key:'account', label:'Novac za cilj je na računu', type:'select', value: g.accountId ? accountName(g.accountId) : '— bez računa —', options: ['— bez računa —', ...accounts.map(a=>a.name)]}] : []),
        {key:'planAmount', label:'Mesečna uplata (RSD, 0 = bez)', type:'number', value: g.monthly ? g.monthly.amount : 0},
        {key:'planDay', label:'Dan u mesecu za uplatu', type:'number', value: g.monthly ? g.monthly.day : 1},
      ],
      onSave: (g, vals)=>{
        if(!isNaN(vals.planAmount)){
          if(vals.planAmount <= 0) delete g.monthly;
          else if(g.monthly){ g.monthly.amount = C.round2(vals.planAmount); g.monthly.day = C.clampRecurringDay(vals.planDay); }
          else setGoalPlan(g, vals.planAmount, vals.planDay);
        }
        if(vals.account !== undefined){ const a = accounts.find(x=> x.name === vals.account); g.accountId = a ? a.id : undefined; }
        if(!vals.name || !vals.name.trim() || isNaN(vals.target) || vals.target <= 0) return;
        g.name = vals.name.trim(); g.target = vals.target;
        g.current = isNaN(vals.current) ? g.current : Math.max(0, vals.current);
        g.deadline = vals.deadline || '';
        saveGoals(); renderAll();
      }
    });
    wireDeleteButton(list, {
      rowSelector: '.goal-card',
      find: id => goals.find(g=>g.id === id),
      onDelete: (g, b)=>{ goals = goals.filter(x=>x.id !== b.dataset.id); saveGoals(); },
      undoLabel: g => t('Obrisan cilj: "{0}"', g.name),
      onUndo: g => { goals.push(g); saveGoals(); }
    });
    list.querySelectorAll('.goal-plan-remove').forEach(btn=> btn.addEventListener('click', ()=>{
      const g = goals.find(x=> x.id === btn.dataset.id);
      if(!g || !g.monthly) return;
      const plan = g.monthly;
      delete g.monthly;
      saveGoals(); renderAll();
      showUndoToast(t('Uklonjena mesečna uplata za „{0}“', g.name), ()=>{ g.monthly = plan; saveGoals(); renderAll(); });
    }));
    wireContributeButton(list, 'goal', 'goal-add-input', (id, val)=>{
      const goal = goals.find(g=>g.id === id);
      if(!goal) return;
      const wasComplete = goal.current >= goal.target;
      contributeToGoal(goal, val);
      if(!wasComplete && goal.current >= goal.target){
        justCompletedId = goal.id;
        playSuccessSound();
      }
      renderGoals();
    });
  }
  function spawnConfetti(cardEl){
    const emojis = ['🎉','✨','🎊','💰'];
    for(let i=0;i<6;i++){
      const span = document.createElement('span');
      span.className = 'confetti-emoji';
      span.textContent = emojis[i % emojis.length];
      span.style.left = (10 + Math.random()*80) + '%';
      span.style.top = '0px';
      span.style.animationDelay = (Math.random()*0.15) + 's';
      cardEl.appendChild(span);
      setTimeout(()=> span.remove(), 1300);
    }
  }

  // ---- Dugovi i pozajmice ----
  document.getElementById('debtForm').addEventListener('submit', function(e){
    e.preventDefault();
    const person = document.getElementById('debtPerson').value.trim();
    // Strana valuta se kao kod rashoda odmah pretvara u RSD po danasnjem kursu; original ostaje zapisan
    const fa = readAmountField('debt');
    const amount = fa.amount;
    const direction = document.getElementById('debtDirection').value;
    const date = document.getElementById('debtDate').value;
    const due = document.getElementById('debtDue').value;
    const note = document.getElementById('debtNote').value.trim();
    if(!person || isNaN(amount) || amount <= 0 || !date) return;
    debts.push(Object.assign({ id: newId(), person, amount, direction, date, due, note, paidAmount: 0 }, fa.foreign || {}));
    saveDebts(); renderDebts(); renderSummary();
    this.reset(); document.getElementById('debtDate').value = toISODateLocal(new Date());
    updateCurrencyHint('debt');
  });
  document.getElementById('debtDate').value = toISODateLocal(new Date());

  const DEBT_CAPACITY_KEY = 'budzet-otplata-kapacitet-v1';
  // Snowball: sortira dugove (samo 'i_owe') po preostalom iznosu rastuce, pa svakog meseca
  // najmanji dobija prioritet — kad se otplati, njegov deo kapaciteta "prelazi" na sledeci.
  function computeDebtPayoffPlan(monthlyCapacity){
    return C.debtPayoffPlan(debts.filter(d => d.direction === 'i_owe').map(d => ({ id: d.id, person: d.person, remaining: debtRemaining(d) })), monthlyCapacity);
  }
  function renderDebtPlan(){
    const panel = document.getElementById('debtPlanPanel');
    const owed = debts.filter(d => d.direction === 'i_owe' && debtRemaining(d) > 0);
    if(owed.length === 0){ panel.style.display = 'none'; return; }
    panel.style.display = 'block';
    const input = document.getElementById('debtMonthlyCapacity');
    if(document.activeElement !== input) input.value = localStorage.getItem(DEBT_CAPACITY_KEY) || '';
    const capacity = parseFloat(input.value) || 0;
    const resultEl = document.getElementById('debtPlanResult');
    if(capacity <= 0){
      resultEl.innerHTML = '<div class="empty" style="padding:0;">Unesi mesečni kapacitet da vidiš plan otplate.</div>';
      return;
    }
    const { balances, months, payoffMonth } = computeDebtPayoffPlan(capacity);
    const order = balances.map((d,i)=>`<li><span class="name">${i+1}. ${escapeHtml(d.person)}</span><span>${t('otplaćeno za {0}. mesec', payoffMonth[d.id]||'—')}</span></li>`).join('');
    resultEl.innerHTML = `<p style="margin:0 0 0.6em;">${t('Uz {0}/mesečno, svi dugovi su otplaćeni za <b>{1}</b>.', fmt(capacity), monthsTxt(months))}</p>
      <ul class="cat-list">${order}</ul>`;
  }
  document.getElementById('debtMonthlyCapacity').addEventListener('input', (e)=>{
    localStorage.setItem(DEBT_CAPACITY_KEY, e.target.value);
    renderDebtPlan();
  });

  function renderDebts(){
    renderDebtPlan();
    const list = document.getElementById('debtsList');
    const emptyEl = document.getElementById('debtsEmpty');
    if(!list) return;
    if(debts.length === 0){ list.innerHTML=''; emptyEl.style.display='block'; return; }
    emptyEl.style.display='none';
    const todayStr = toISODateLocal(new Date());
    list.innerHTML = debts.map(d=>{
      const paidTotal = C.debtPaid(d, entries);
      const remaining = debtRemaining(d);
      const settled = remaining <= 0;
      const dirLabel = d.direction === 'owed_to_me' ? 'Duguje mi' : 'Dugujem';
      const dueTxt = d.due ? parseLocalDate(d.due).toLocaleDateString(LOCALE,{day:'2-digit',month:'2-digit',year:'numeric'}) : '';
      const overdue = d.due && !settled && d.due < todayStr;
      const fxNow = (d.currency && d.currency !== 'RSD' && d.origAmount && fx.rates[d.currency]) ? C.round2(d.origAmount * fx.rates[d.currency]) : null;
      const fxDiff = fxNow != null ? C.round2(fxNow - d.amount) : 0;
      const fxHtml = (fxNow != null && Math.abs(fxDiff) >= 1)
        ? `<div class="goal-meta debt-fx"><span>${t('Danas ≈ {0} ({1} od unosa)', fmt(fxNow), (fxDiff > 0 ? '+' : '−') + fmt(Math.abs(fxDiff)))}</span><button class="btn-secondary debt-revalue" data-id="${d.id}">${t('Preračunaj')}</button></div>` : '';
      const inst = (d.direction === 'i_owe' && !settled) ? debtInstallment(d) : null;
      const instHtml = (d.direction === 'i_owe' && !settled)
        ? (inst
          ? `<div class="goal-meta">${t('Mesečna rata: {0} · sledeća {1}', fmt(inst.amount), nextInstallmentDueLabel(inst))}</div>`
          : `<button class="btn-secondary debt-installment-btn" data-id="${d.id}">${t('Napravi mesečnu ratu')}</button>`)
        : '';
      return `<div class="goal-card" data-debt-id="${d.id}" data-row-id="${d.id}">
        <div class="goal-head">
          <span class="goal-name">${escapeHtml(d.person)} <span class="rtype ${d.direction==='owed_to_me'?'income':'expense'}" data-toggle-dir="${d.id}" title="Klikni da promeniš smer" style="margin-left:0.5em; cursor:pointer;">${dirLabel}</span></span>
          <span style="display:flex; gap:0.3em;">
            <button class="edit-btn" data-id="${d.id}" title="Uredi">✎</button>
            <button class="del-btn" data-id="${d.id}" title="Obriši">✕</button>
          </span>
        </div>
        <div class="goal-amounts">${fmt(paidTotal)} / ${fmt(d.amount)}${origTag(d)}${settled?' — izmireno ✓':''}</div>
        ${fxHtml}
        <div class="bar-track"><div class="bar-fill ${settled?'ok':''}" data-target="${Math.min(100,(paidTotal/d.amount*100)).toFixed(1)}%"></div></div>
        <div class="goal-meta">
          <span>${d.note ? escapeHtml(d.note) : ''}</span>
          <span style="${overdue?'color:var(--rust-text);':''}">${dueTxt ? t('Rok: {0}', dueTxt) : ''}</span>
        </div>
        ${instHtml}
        ${!settled ? `<div class="goal-contribute">
          <input type="number" placeholder="Iznos uplate (RSD)" min="1" data-debt="${d.id}" class="debt-add-input">
          <button class="add" data-debt="${d.id}">Dodaj uplatu</button>
        </div>` : ''}
      </div>`;
    }).join('');
    growBars(list);
    list.querySelectorAll('.debt-revalue').forEach(b=> b.addEventListener('click', ()=> revalueDebt(b.dataset.id)));
    list.querySelectorAll('.debt-installment-btn').forEach(b=> b.addEventListener('click', ()=> openDebtInstallmentModal(b.dataset.id)));
    list.querySelectorAll('[data-toggle-dir]').forEach(el=>{
      el.addEventListener('click', ()=>{
        const d = debts.find(x=>x.id === el.dataset.toggleDir);
        if(!d) return;
        d.direction = d.direction === 'owed_to_me' ? 'i_owe' : 'owed_to_me';
        saveDebts(); renderAll(); // renderAll pokrece syncDebtInstallments (rata staje/nastavlja se odmah)
      });
    });
    wireEditButton(list, {
      find: id => debts.find(x=>x.id === id),
      title: 'Uredi dug/pozajmicu',
      buildFields: d => [
        {key:'person', label:'Osoba', type:'text', value:d.person},
        {key:'amount', label:'Iznos (RSD)', type:'number', value:d.amount},
        {key:'paidAmount', label:'Uplaćeno do sada (RSD)', type:'number', value:d.paidAmount||0},
        {key:'due', label:'Rok (opciono)', type:'date', value:d.due||''},
        {key:'note', label:'Napomena', type:'text', value:d.note||''},
      ],
      onSave: (d, vals)=>{
        if(!vals.person || !vals.person.trim() || isNaN(vals.amount) || vals.amount <= 0) return;
        d.person = vals.person.trim(); applyAmountEdit(d, vals.amount);
        d.paidAmount = isNaN(vals.paidAmount) ? (d.paidAmount||0) : Math.max(0, vals.paidAmount);
        d.due = vals.due || ''; d.note = (vals.note||'').trim();
        saveDebts(); renderAll();
      }
    });
    wireDeleteButton(list, {
      rowSelector: '.goal-card',
      find: id => debts.find(d=>d.id === id),
      onDelete: (d, b)=>{
        debts = debts.filter(x=>x.id !== b.dataset.id); saveDebts();
        // Obrisan dug: njegova rata (ako postoji) prestaje odmah — bez ovoga bi ostala "obesena"
        // i i dalje dospevala u punom iznosu (syncDebtInstallments je ovde nema cemu da preskoci).
        const cutoff = C.addMonths(currentMonthKey(), -1);
        let changed = false;
        recurring.forEach(r=>{ if(r.debtId === d.id && r.until !== cutoff){ r.until = cutoff; changed = true; } });
        if(changed) saveRecurring();
      },
      undoLabel: d => t('Obrisano: "{0}"', d.person),
      onUndo: d => { debts.push(d); saveDebts(); }
    });
    wireContributeButton(list, 'debt', 'debt-add-input', (id, val)=>{
      const d = debts.find(x=>x.id === id);
      if(!d) return;
      d.paidAmount = (d.paidAmount||0) + val;
      saveDebts();
      if(debtRemaining(d) <= 0) playSuccessSound();
      renderAll();
    });
  }
  // Sledeci datum dospeca rate: tekuci mesec ako jos nije placena, inace sledeci mesec.
  function nextInstallmentDueLabel(r){
    const mKeyNow = currentMonthKey();
    const mKey = isPaid(r, mKeyNow) ? C.addMonths(mKeyNow, 1) : mKeyNow;
    return parseLocalDate(C.dueDateFor(r, mKey)).toLocaleDateString(LOCALE, {day:'2-digit', month:'2-digit'});
  }
  function openDebtInstallmentModal(id){
    const d = debts.find(x=> x.id === id);
    if(!d) return;
    const remaining = debtRemaining(d);
    const capacity = parseFloat(localStorage.getItem(DEBT_CAPACITY_KEY));
    const defaultAmount = (!isNaN(capacity) && capacity > 0) ? Math.min(remaining, capacity) : remaining;
    const defaultDay = d.due ? parseLocalDate(d.due).getDate() : 1;
    const defaultCategory = expenseCats.includes('Ostalo') ? 'Ostalo' : expenseCats[0];
    openEditModal(t('Mesečna rata'), [
      {key:'amount', label: t('Iznos rate (RSD)'), type:'number', value: defaultAmount},
      {key:'day', label: t('Dan u mesecu'), type:'number', value: defaultDay},
      {key:'category', label: t('Kategorija'), type:'select', value: defaultCategory, options: expenseCats},
    ], (vals)=>{
      if(!(vals.amount > 0)) return;
      createDebtInstallment(d, { amount: vals.amount, day: vals.day || 1, category: vals.category });
    });
  }
  function revalueDebt(id){
    const d = debts.find(x=> x.id === id); if(!d || !d.origAmount || !fx.rates[d.currency]) return;
    const prev = { amount: d.amount, rate: d.rate };
    d.amount = C.round2(d.origAmount * fx.rates[d.currency]); d.rate = fx.rates[d.currency];
    saveDebts(); renderAll();
    showUndoToast(t('Dug preračunat po današnjem kursu: {0}', fmt(d.amount)), ()=>{ d.amount = prev.amount; d.rate = prev.rate; saveDebts(); renderAll(); });
  }
  if(IS_TEST) window.__revalueDebt = revalueDebt;
  if(IS_TEST) window.__setDebtAmount = (id, amt) => { const d = debts.find(x=> x.id === id); if(d){ d.amount = amt; saveDebts(); renderAll(); } };

