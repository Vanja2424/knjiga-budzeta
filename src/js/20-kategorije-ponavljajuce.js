  // ---- Kategorije ----
  function categorySparklineSvg(cat){
    const months = lastNMonths(6);
    const vals = months.map(m => categorySpentInMonth(cat, m));
    if(vals.every(v=>v===0)) return '<span class="cat-sparkline-empty" title="Nema podataka poslednjih meseci"></span>';
    const max = Math.max(1, ...vals);
    const W = 56, H = 20;
    const stepX = W / (vals.length - 1 || 1);
    const pts = vals.map((v,i)=> `${(i*stepX).toFixed(1)},${(H-2-(v/max)*(H-4)).toFixed(1)}`).join(' ');
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="cat-sparkline" title="Poslednjih 6 meseci"><polyline points="${pts}" fill="none" stroke="var(--ledger)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }

  function renderBudgetSummary(){
    const total = budgetCats().reduce((s,c)=> s + limits[c], 0);
    const months = lastNMonths(4).slice(0, 3);
    const avgIncome = months.reduce((s,m)=> s + monthTotals(m).income, 0) / months.length;
    const parts = [];
    if(total > 0) parts.push(`Zbir budžeta po kategorijama: <b>${fmt(total)}</b>`);
    if(monthlyBudget > 0 && total > monthlyBudget) parts.push(`<span style="color:var(--rust-text);">${t('veći je od ukupnog mesečnog budžeta ({0})', fmt(monthlyBudget))}</span>`);
    if(avgIncome > 0 && total > 0) parts.push(t('prosečan prihod poslednja 3 meseca: {0}', fmt(avgIncome)) + (total > avgIncome ? ` — <span style="color:var(--rust-text);">${t('budžet je veći od prihoda')}</span>` : ''));
    document.getElementById('budgetSummary').innerHTML = parts.join(' · ');
  }
  function renderCategories(){
    renderIncomeCategories();
    renderBudgetSummary();
    document.getElementById('rolloverToggle').checked = rolloverOn();
    if(document.activeElement !== monthlyBudgetInput) monthlyBudgetInput.value = monthlyBudget > 0 ? monthlyBudget : '';
    const usedCats = new Set(entries.filter(e=>e.type==='expense').map(e=>e.category));
    const usedInRecurring = new Set(recurring.filter(r=>r.type==='expense').map(r=>r.category));
    const shopEst = shopEstimateNow().byCategory;
    const list = document.getElementById('catList');
    list.innerHTML = expenseCats.map((c,i)=>{
      const inUse = usedCats.has(c) || usedInRecurring.has(c) || shoppingCategoryInUse(c);
      const disabledAttr = inUse ? 'disabled title="Kategorija se koristi u postojećim rashodima, ponavljajućim stavkama ili listi za nabavku"' : 'title="Obriši kategoriju"';
      const limitVal = limits[c] != null ? limits[c] : '';
      const colorVal = catColorFor(c, i);
      const suggestion = avgMonthlySpend3(c);
      const suggestBtn = (!limitVal && suggestion > 0)
        ? `<button class="envelope-suggest-btn" data-cat="${escapeHtml(c)}" data-suggest="${suggestion}" title="${t('Predlog na osnovu proseka poslednja 3 meseca: {0}', fmt(suggestion))}">💡</button>`
        : '<span class="envelope-suggest-btn" style="visibility:hidden;" aria-hidden="true">💡</span>';
      const onList = shopEst[c] > 0 ? `<span class="shop-on-list${(()=>{ const env = envelopeRemainingThisMonth(c); return env && shopEst[c] > env.remaining ? ' over' : ''; })()}">${t('na listi ~{0}', fmt(shopEst[c]))}</span>` : '';
      return `<li><span class="name">${escapeHtml(c)}</span>${onList}
        ${categorySparklineSvg(c)}
        <input type="color" class="cat-color-input" data-cat="${escapeHtml(c)}" value="${colorVal}" title="Boja kategorije">
        <button class="edit-btn cat-color-reset" data-cat="${escapeHtml(c)}" title="Vrati automatsku boju" ${catColors[c]?'':'style="visibility:hidden;"'}>⟲</button>
        <input type="number" class="limit-input" data-cat="${escapeHtml(c)}" placeholder="Budžet/mes." title="Mesečni budžet (RSD)" aria-label="${t('Mesečni budžet za {0}', escapeHtml(c))}" value="${limitVal}" min="0" step="1">
        ${suggestBtn}
        <button class="edit-btn" data-cat="${escapeHtml(c)}" title="Preimenuj">✎</button>
        <button class="del-btn" data-cat="${escapeHtml(c)}" ${disabledAttr}>✕</button></li>`;
    }).join('');
    list.querySelectorAll('.del-btn:not([disabled])').forEach(b=>{
      b.addEventListener('click', ()=> deleteExpenseCategory(b.dataset.cat));
    });
    list.querySelectorAll('.edit-btn:not(.cat-color-reset)').forEach(b=>{
      b.addEventListener('click', ()=>{
        const oldName = b.dataset.cat;
        openEditModal('Preimenuj kategoriju', [
          {key:'name', label:'Naziv kategorije', type:'text', value:oldName}
        ], (vals)=>{
          renameCategory(oldName, vals.name);
        });
      });
    });
    list.querySelectorAll('.cat-color-input').forEach(inp=>{
      // 'change' (commit), ne 'input' — native color picker salje 'input' desetine puta u
      // sekundi dok se boja pomera, a renderCategories() bi svaki put unistio i ponovo
      // napravio bas TAJ <input> preko innerHTML, zatvarajuci otvoren picker popup.
      inp.addEventListener('change', ()=>{
        catColors[inp.dataset.cat] = inp.value;
        saveCatColors(); renderAll();
      });
    });
    list.querySelectorAll('.cat-color-reset').forEach(b=>{
      b.addEventListener('click', ()=>{
        delete catColors[b.dataset.cat];
        saveCatColors(); renderAll();
      });
    });
    list.querySelectorAll('.limit-input').forEach(inp=>{
      inp.addEventListener('change', ()=>{
        const cat = inp.dataset.cat;
        const val = parseFloat(inp.value);
        if(isNaN(val) || val <= 0) delete limits[cat]; else limits[cat] = val;
        // Ne crtaj ponovo listu dok korisnik prelazi Tab-om na sledece polje
        saveLimits(); invalidate(); renderBudgetSummary();
      });
    });
    list.querySelectorAll('.envelope-suggest-btn').forEach(b=>{
      b.addEventListener('click', ()=>{
        const cat = b.dataset.cat;
        const val = parseFloat(b.dataset.suggest);
        if(isNaN(val) || val <= 0) return;
        limits[cat] = val;
        saveLimits(); renderAll();
      });
    });
  }

  function renderIncomeCategories(){
    const used = new Set(entries.filter(e=>e.type==='income').map(e=>e.category).concat(recurring.filter(r=>r.type==='income').map(r=>r.category)));
    const list = document.getElementById('incomeCatList');
    list.innerHTML = incomeCats.map(c=>{
      const inUse = used.has(c);
      return `<li><span class="name">${escapeHtml(c)}</span>
        <button class="edit-btn" data-inc-cat="${escapeHtml(c)}" title="Preimenuj">✎</button>
        <button class="del-btn" data-inc-cat="${escapeHtml(c)}" ${inUse ? 'disabled title="Kategorija se koristi u postojećim prihodima"' : 'title="Obriši kategoriju"'}>✕</button></li>`;
    }).join('');
    list.querySelectorAll('.del-btn:not([disabled])').forEach(b=>{
      b.addEventListener('click', ()=>{
        if(incomeCats.length <= 1) return;
        incomeCats = incomeCats.filter(c=> c !== b.dataset.incCat);
        saveIncomeCats(); populateExpenseCategorySelect(); populateRecurringCategorySelect(); renderIncomeCategories();
      });
    });
    list.querySelectorAll('.edit-btn').forEach(b=>{
      b.addEventListener('click', ()=>{
        const oldName = b.dataset.incCat;
        openEditModal('Preimenuj kategoriju prihoda', [{key:'name', label:'Naziv kategorije', type:'text', value:oldName}], (vals)=>{
          const newName = (vals.name || '').trim();
          if(!newName || newName === oldName) return;
          if(incomeCats.some(c=> c.toLowerCase() === newName.toLowerCase() && c !== oldName)){ appAlert('Kategorija sa tim imenom već postoji.'); return; }
          incomeCats = incomeCats.map(c=> c === oldName ? newName : c);
          entries.forEach(e=>{ if(e.type==='income' && e.category === oldName) e.category = newName; });
          recurring.forEach(r=>{ if(r.type==='income' && r.category === oldName) r.category = newName; });
          saveIncomeCats(); saveEntries(); saveRecurring();
          populateExpenseCategorySelect(); populateRecurringCategorySelect();
          renderAll();
        });
      });
    });
  }
  function addIncomeCategory(){
    const input = document.getElementById('newIncomeCatInput');
    const name = input.value.trim();
    if(!name) return;
    input.value = '';
    if(incomeCats.some(c=> c.toLowerCase() === name.toLowerCase())) return;
    incomeCats.push(name);
    saveIncomeCats(); populateExpenseCategorySelect(); populateRecurringCategorySelect(); renderIncomeCategories();
  }
  document.getElementById('addIncomeCatBtn').addEventListener('click', addIncomeCategory);
  document.getElementById('newIncomeCatInput').addEventListener('keydown', e=>{ if(e.key === 'Enter'){ e.preventDefault(); addIncomeCategory(); } });

  function deleteExpenseCategory(cat){
    expenseCats = expenseCats.filter(c => c !== cat);
    delete limits[cat];
    delete catColors[cat];
    delete envelopeState.rollover[cat];
    fixedCategories = fixedCategories.filter(c => c !== cat);
    saveCats(); saveLimits(); saveCatColors(); saveEnvelopeState(); saveFixedCategories();
    populateExpenseCategorySelect(); populateExpenseFilters(); populateRecurringCategorySelect(); renderCatRules();
    renderAll();
  }
  function setCategoryFixed(cat, on){
    fixedCategories = fixedCategories.filter(c => c !== cat);
    if(on) fixedCategories.push(cat);
    saveFixedCategories();
    invalidate();
  }
  if(IS_TEST) window.__setCategoryFixed = setCategoryFixed;
  if(IS_TEST) window.__renameCategory = (a, b) => renameCategory(a, b);
  if(IS_TEST) window.__deleteExpenseCategory = cat => deleteExpenseCategory(cat);
  // Samo za automatske provere: uklanja stavke po id-u (npr. da bi se izbrisala test kategorija posle).
  if(IS_TEST) window.__deleteEntriesById = ids => { entries = entries.filter(e => !ids.includes(e.id)); saveEntries(); syncDebtInstallments(); invalidate(); };
  if(IS_TEST) window.__setEntryAmount = (id, amount) => { const e = entries.find(x=> x.id === id); if(e){ e.amount = amount; saveEntries(); invalidate(); } };
  if(IS_TEST) window.__setEntryItems = (id, items) => { const e = entries.find(x=> x.id === id); if(e){ e.items = items.slice(); saveEntries(); invalidate(); } };
  function renameCategory(oldName, newName){
    newName = (newName || '').trim();
    if(!newName || newName === oldName) return;
    if(expenseCats.some(c => c.toLowerCase() === newName.toLowerCase() && c !== oldName)){
      appAlert('Kategorija sa tim imenom već postoji.');
      return;
    }
    expenseCats = expenseCats.map(c => c === oldName ? newName : c);
    if(limits[oldName] != null){ limits[newName] = limits[oldName]; delete limits[oldName]; }
    if(catColors[oldName] != null){ catColors[newName] = catColors[oldName]; delete catColors[oldName]; }
    if(envelopeState.rollover[oldName] != null){ envelopeState.rollover[newName] = envelopeState.rollover[oldName]; delete envelopeState.rollover[oldName]; }
    fixedCategories = fixedCategories.map(c => c === oldName ? newName : c);
    shopping.items.forEach(i=>{ if(i.category === oldName) i.category = newName; });
    entries.forEach(e=>{ if(e.type==='expense' && e.category === oldName) e.category = newName; });
    recurring.forEach(r=>{ if(r.type==='expense' && r.category === oldName) r.category = newName; });
    saveCats(); saveLimits(); saveCatColors(); saveEnvelopeState(); saveEntries(); saveRecurring(); saveFixedCategories(); saveShopping();
    populateExpenseCategorySelect(); populateExpenseFilters(); populateRecurringCategorySelect(); renderCatRules();
    renderAll();
  }

  document.getElementById('addCatBtn').addEventListener('click', addCategory);
  document.getElementById('newCatInput').addEventListener('keydown', e=>{ if(e.key === 'Enter'){ e.preventDefault(); addCategory(); } });
  function addCategory(){
    const input = document.getElementById('newCatInput');
    const name = input.value.trim();
    if(!name) return;
    if(expenseCats.some(c => c.toLowerCase() === name.toLowerCase())){ input.value=''; return; }
    expenseCats.push(name);
    saveCats();
    input.value = '';
    populateExpenseCategorySelect(); populateExpenseFilters(); populateRecurringCategorySelect(); renderCatRules();
    renderCategories();
  }
  if(IS_TEST) window.__addExpenseCategory = name => { document.getElementById('newCatInput').value = name; addCategory(); };

  // ---- Ponavljajuce ----
  document.getElementById('recTypeExpense').addEventListener('click', ()=>{
    currentRecType = 'expense';
    document.getElementById('recTypeExpense').style.opacity = 1;
    document.getElementById('recTypeIncome').style.opacity = 0.5;
    populateRecurringCategorySelect();
  });
  document.getElementById('recTypeIncome').addEventListener('click', ()=>{
    currentRecType = 'income';
    document.getElementById('recTypeIncome').style.opacity = 1;
    document.getElementById('recTypeExpense').style.opacity = 0.5;
    populateRecurringCategorySelect();
  });

  document.getElementById('recurringForm').addEventListener('submit', function(e){
    e.preventDefault();
    const fa = readAmountField('rec');
    const parsed = parseQuickAmount(document.getElementById('recDesc').value, fa.amount);
    const desc = parsed.desc;
    const amount = parsed.amount;
    const category = document.getElementById('recCategory').value;
    const day = C.clampRecurringDay(document.getElementById('recDay').value);
    const frequency = document.getElementById('recFrequency').value;
    const anchorMonth = parseInt(document.getElementById('recAnchorMonth').value) || 1;
    const isSubscription = document.getElementById('recIsSubscription').checked;
    const autoPay = document.getElementById('recAutoPay').checked;
    const spreadPeriod = frequency !== 'monthly' && document.getElementById('recSpreadPeriod').checked;
    if(!desc || isNaN(amount) || amount <= 0) return;
    const rec = { id: newId(), type: currentRecType, desc, amount: Math.round(amount), category, day, frequency, anchorMonth, isSubscription, autoPay };
    if(spreadPeriod) rec.spreadPeriod = true;
    if(fa.foreign && fa.amount === amount){ rec.currency = fa.foreign.currency; rec.origAmount = fa.foreign.origAmount; }
    if(accounts.length) rec.accountId = document.getElementById('recAccount').value || defaultAccountId();
    if(pendingSlipPayee && currentRecType === 'expense') rec.payee = pendingSlipPayee;
    pendingSlipPayee = null; document.getElementById('recSlipStatus').textContent = '';
    recurring.push(rec);
    saveRecurring();
    processAutoPay();
    this.reset(); document.getElementById('recDay').value = 1;
    document.getElementById('recFrequency').value = 'monthly';
    document.getElementById('recAnchorMonthRow').style.display = 'none';
    renderAll();
  });
  document.getElementById('recFrequency').addEventListener('change', (e)=>{
    document.getElementById('recAnchorMonthRow').style.display = e.target.value === 'monthly' ? 'none' : 'block';
  });

  // Mesecni "ekvivalent" cene bez obzira na ucestalost — omogucava fer poredjenje/sabiranje
  // godisnjih i kvartalnih pretplata sa mesecnim.
  const monthlyEquivalent = C.monthlyEquivalent;
  function renderSubscriptionsPanel(){
    const panel = document.getElementById('subscriptionsPanel');
    const subs = recurring.filter(r => r.isSubscription && r.type === 'expense');
    if(subs.length === 0){ panel.style.display = 'none'; return; }
    panel.style.display = 'block';
    const withCost = subs.map(r => ({ r, monthly: monthlyEquivalent(r) })).sort((a,b)=> b.monthly - a.monthly);
    const totalMonthly = withCost.reduce((s,x)=>s+x.monthly, 0);
    document.getElementById('subMonthlyTotal').textContent = fmt(totalMonthly);
    document.getElementById('subYearlyTotal').textContent = fmt(totalMonthly * 12);
    document.getElementById('subscriptionsList').innerHTML = withCost.map(({r,monthly})=>{
      const freqNote = (!r.frequency || r.frequency === 'monthly') ? '' : ` <span style="opacity:0.65;">(${frequencyLabel(r)}, ${fmt(r.amount)})</span>`;
      return `<li><span class="name">${escapeHtml(r.desc)}${freqNote}</span><span>${fmt(monthly)}/mes.</span></li>`;
    }).join('');
  }

  // Skrivene pretplate: rashodi koji se ponavljaju svakog meseca, a nisu u Ponavljajucim -> "Dodaj" / "Nije"
  const HIDDEN_SUBS_KEY = 'budzet-pretplate-odbijene-v1';
  const hiddenSubsDismissed = () => { try{ const v = JSON.parse(localStorage.getItem(HIDDEN_SUBS_KEY) || '[]'); return Array.isArray(v) ? v.filter(x=> typeof x === 'string') : []; } catch(e){ return []; } };
  function renderHiddenSubs(){
    const panel = document.getElementById('hiddenSubsPanel'); if(!panel) return;
    const list = C.findHiddenSubscriptions({ entries, recurring, today: toISODateLocal(new Date()), dismissed: hiddenSubsDismissed() });
    panel.style.display = list.length ? '' : 'none';
    if(!list.length){ panel.innerHTML = ''; return; }
    panel.innerHTML = `<h3 style="margin-top:0;">🔍 ${escapeHtml(t('Možda su pretplate'))}</h3>`
      + `<div class="hint">${escapeHtml(t('Ovi rashodi se ponavljaju svakog meseca, a nisu u ponavljajućim stavkama. Kad dodaš pretplatu, ubuduće je samo štikliraj ovde — nemoj je upisivati i ručno.'))}</div>`
      + list.map((x, i)=> `<div class="hidden-sub" data-i="${i}"><span><b translate="no">${escapeHtml(x.desc)}</b> — ${escapeHtml(t('{0} mesečno, oko {1}. ({2})', fmt(x.amount), x.day, monthsTxt(x.months)))}</span>`
        + `<span class="hidden-sub-actions"><button type="button" class="btn-secondary hidden-sub-add">${escapeHtml(t('Dodaj'))}</button><button type="button" class="btn-link hidden-sub-no">${escapeHtml(t('Nije pretplata'))}</button></span></div>`).join('');
    panel.querySelectorAll('.hidden-sub').forEach(row=>{
      const x = list[+row.dataset.i];
      row.querySelector('.hidden-sub-add').addEventListener('click', ()=> addHiddenSub(x));
      row.querySelector('.hidden-sub-no').addEventListener('click', ()=>{
        localStorage.setItem(HIDDEN_SUBS_KEY, JSON.stringify([...new Set(hiddenSubsDismissed().concat(x.key))]));
        renderHiddenSubs();
      });
    });
  }
  function addHiddenSub(x){
    const mKey = currentMonthKey();
    const r = { id: newId(), type: 'expense', desc: x.desc, amount: Math.round(x.amount), category: expenseCats.includes(x.category) ? x.category : (expenseCats[0] || 'Ostalo'),
      day: C.clampRecurringDay(x.day), frequency: 'monthly', anchorMonth: 1, isSubscription: true, autoPay: false };
    recurring.push(r);
    // ovomesecni rashod je vec upisan: on postaje uplata ove pretplate za tekuci mesec (id rec-<id>-<mesec>),
    // pa se ne racuna dvaput ni posle uskladjivanja pri pokretanju; placen -> stavka je placena, neplacen ostaje "na cekanju"
    const e = x.thisMonthId ? entries.find(y=> y.id === x.thisMonthId) : null;
    const oldId = e ? e.id : null, newEntryId = recurringEntryId(r, mKey);
    const relink = (from, to)=>{
      let b = false, d = false;
      bills.forEach(x=>{ if(x.entryId === from){ x.entryId = to; b = true; } });
      documents.forEach(x=>{ if(x.entryId === from){ x.entryId = to; d = true; } });
      if(b) saveBillsState(); if(d) saveDocuments();
    };
    if(e){
      e.id = newEntryId; relink(oldId, newEntryId);
      if(isExpensePaid(e)){ if(!applied[mKey]) applied[mKey] = []; applied[mKey].push(r.id); saveApplied(); }
      saveEntries();
    }
    saveRecurring(); renderAll();
    showUndoToast(t('Pretplata dodata: {0}. Ubuduće je štikliraj u Ponavljajućim umesto ručnog unosa.', x.desc), ()=>{
      recurring = recurring.filter(y=> y.id !== r.id);
      if(applied[mKey]) applied[mKey] = applied[mKey].filter(id=> id !== r.id);
      const back = entries.find(y=> y.id === newEntryId);
      if(back && oldId){ back.id = oldId; relink(newEntryId, oldId); }
      saveRecurring(); saveApplied(); saveEntries(); renderAll();
    });
  }
  function renderRecurring(){
    renderSubscriptionsPanel();
    renderHiddenSubs();
    const list = document.getElementById('recurringList');
    const emptyEl = document.getElementById('recurringEmpty');
    const pendingLine = document.getElementById('pendingSummaryLine');
    if(recurring.length === 0){
      list.innerHTML=''; emptyEl.style.display='block'; pendingLine.style.display='none'; updatePayOverdueBtn(); return;
    }
    emptyEl.style.display='none';
    const mKey = currentMonthKey();
    list.innerHTML = recurring.map(r=>{
      const paid = isPaid(r, mKey);
      const skippedThisMonth = isSkipped(r, mKey);
      const throughLabel = paidThroughLabel(r);
      const due = isDueThisMonth(r, mKey);
      const freqLabel = frequencyLabel(r);
      const freqTag = freqLabel ? ` <span class="cat-tag" style="background:transparent;border:1px solid var(--paper-line);">${t(freqLabel)}${r.spreadPeriod ? ' · ' + t('raspoređeno') : ''}</span>` : '';
      const subTag = r.isSubscription ? ` <span class="cat-tag" style="background:transparent;border:1px solid var(--gold);color:var(--gold-text);">🔔 pretplata</span>` : '';
      let statusHtml;
      if(paid) statusHtml = '<span class="paid-tag">plaćeno ✓</span>';
      else if(skippedThisMonth) statusHtml = '<span class="paid-tag" style="color:var(--ink-soft);">pauzirano ⏸</span>';
      else if(!due) statusHtml = (r.until && r.until < mKey) ? t('završeno') : t('sledeći put: {0}', monthYearLabelSr(nextDueMonthKey(r, mKey)));
      else statusHtml = t('dan {0}.', dueDayNow(r));
      const showAheadRow = due && !paid && !skippedThisMonth;
      const showPayAheadControls = showAheadRow && (!r.frequency || r.frequency === 'monthly');
      return `
      <div class="recurring-item ${justPaidId===r.id?'just-paid':''}" data-row-id="${r.id}">
        <div class="recurring-row ${paid?'paid':''} ${skippedThisMonth?'skipped':''}">
          <label class="check-label">
            <input type="checkbox" data-id="${r.id}" ${paid?'checked':''} ${!due && !paid ? 'disabled title="Nije na redu ovog meseca"' : ''}>
            <span>${escapeHtml(r.desc)}${freqTag}${subTag}<br>${catTagHtml(r.category)}</span>
          </label>
          <span class="rtype ${r.type}">${r.type==='income'?'Prihod':'Rashod'}</span>
          <span style="font-family:var(--font);font-variant-numeric:tabular-nums;">${fmt(recurringAmountNow(r))}${(r.currency && r.currency !== 'RSD' && r.origAmount) ? `<span class="orig-amt">${fmtOrig(r.origAmount, r.currency)}</span>` : ''}</span>
          <span style="font-family:var(--font);font-variant-numeric:tabular-nums; color:var(--ink-soft);">${statusHtml}</span>
          <span style="display:flex; gap:0.3em;">
            ${r.type === 'expense' ? `<button class="ips-btn${r.payee ? ' has' : ''}" data-ips="${r.id}" title="${r.payee ? t('Plati QR kodom') : t('Dodaj podatke za plaćanje (QR)')}">QR</button>` : ''}
            <button class="edit-btn" data-id="${r.id}" title="Uredi">✎</button>
            <button class="del-btn" data-id="${r.id}" title="Obriši">✕</button>
          </span>
        </div>
        ${skippedThisMonth ? `<div class="paid-through">${t('⏸ Pauzirano za ovaj mesec — ')}<a href="#" class="skip-undo-link" data-id="${r.id}">${t('vrati')}</a></div>` : (showAheadRow ? `
        <div class="ahead-row">
          ${showPayAheadControls ? `
          <span style="font-family:var(--font);font-variant-numeric:tabular-nums; font-size:0.78em; color:var(--ink-soft);">Plati unapred:</span>
          <input type="number" min="1" max="24" value="2" data-ahead-input="${r.id}">
          <span style="font-family:var(--font);font-variant-numeric:tabular-nums; font-size:0.78em; color:var(--ink-soft);">meseci</span>
          <button data-ahead-btn="${r.id}">Plati</button>` : ''}
          <button type="button" class="skip-month-btn" data-id="${r.id}">${t(freqLabel ? '⏸ Pauziraj ovaj termin' : '⏸ Pauziraj mesec')}</button>
        </div>` : '')}
        ${throughLabel ? `<div class="paid-through">${throughLabel}</div>` : ''}
      </div>`;
    }).join('');
    justPaidId = null;
    list.querySelectorAll('[data-ips]').forEach(b=> b.addEventListener('click', ()=>{
      const r = recurring.find(x=> x.id === b.dataset.ips);
      if(r) openIps(r, r.payee ? 'pay' : 'edit');
    }));
    list.querySelectorAll('.skip-month-btn').forEach(b=>{
      b.addEventListener('click', ()=>{
        const r = recurring.find(x=>x.id === b.dataset.id);
        if(r) toggleSkipMonth(r, true);
      });
    });
    list.querySelectorAll('.skip-undo-link').forEach(a=>{
      a.addEventListener('click', (e)=>{
        e.preventDefault();
        const r = recurring.find(x=>x.id === a.dataset.id);
        if(r) toggleSkipMonth(r, false);
      });
    });
    list.querySelectorAll('input[type="checkbox"]').forEach(cb=>{
      cb.addEventListener('change', ()=>{
        const r = recurring.find(x=>x.id === cb.dataset.id);
        if(!r) return;
        if(cb.checked){
          cb.checked = false;
          const lastAmount = lastActualAmountFor(r);
          const foreign = r.currency && r.currency !== 'RSD' && r.origAmount;
          const nowAmount = recurringAmountNow(r);
          const billAmount = linkedBillAmount(r);
          const hasDifferentHistory = !foreign && lastAmount != null && lastAmount !== r.amount;
          const label = billAmount != null ? t('Iznos (RSD) — sa računa') : foreign
            ? t('Iznos (RSD) — {0} po današnjem kursu NBS', fmtOrig(r.origAmount, r.currency))
            : (hasDifferentHistory ? t('Iznos (RSD) — poslednji put: {0}', fmt(lastAmount)) : t('Iznos (RSD)'));
          openEditModal(t('Plati: {0}', r.desc), [
            {key:'amount', label, type:'number', value: billAmount != null ? billAmount : r.debtId ? suggestedPayAmount(r) : (hasDifferentHistory ? lastAmount : nowAmount)}
          ], (vals)=>{
            if(isNaN(vals.amount) || vals.amount <= 0) return;
            togglePaid(r, true, vals.amount);
          });
        } else {
          togglePaid(r, false);
        }
      });
    });
    wireEditButton(list, {
      find: id => recurring.find(x=>x.id === id),
      title: 'Uredi ponavljajuću stavku',
      buildFields: r => [
        {key:'desc', label:'Opis', type:'text', value:r.desc},
        (r.currency && r.currency !== 'RSD')
          ? {key:'amount', label: t('Iznos ({0}) — u RSD po današnjem kursu ≈ {1}', r.currency, fmt(recurringAmountNow(r))), type:'number', value:r.origAmount}
          : {key:'amount', label:'Iznos (RSD)', type:'number', value:r.amount},
        ...accountEditField(r.accountId),
        {key:'category', label:'Kategorija', type:'select', value:r.category, options: r.type === 'expense' ? expenseCats : incomeCats},
        {key:'day', label:'Dan u mesecu (1–31; 31 = poslednji dan)', type:'number', value:r.day},
        {key:'frequency', label:'Učestalost', type:'select', value: FREQ_FROM_KEY[r.frequency] || 'Mesečno', options: FREQ_OPTIONS},
        {key:'anchorMonth', label:'Mesec (za kvartalno/godišnje)', type:'select', value: MONTH_NAMES_SR[(r.anchorMonth||1)-1], options: MONTH_NAMES_SR},
        {key:'isSubscription', label:'Ovo je pretplata (Netflix, Spotify...)', type:'checkbox', value: !!r.isSubscription},
        {key:'autoPay', label:'Automatski upiši kao plaćeno na dan dospeća', type:'checkbox', value: !!r.autoPay},
        {key:'spreadPeriod', label:'Kvartalno/godišnje: iznos pokriva ceo period (raspodeli na 3/12 meseci)', type:'checkbox', value: !!r.spreadPeriod},
      ],
      onSave: (r, vals)=>{
        if(!vals.desc || !vals.desc.trim() || isNaN(vals.amount) || vals.amount <= 0) return;
        r.autoPay = vals.autoPay;
        if(vals.spreadPeriod) r.spreadPeriod = true; else delete r.spreadPeriod;
        applyAccountEdit(r, vals);
        if(r.currency && r.currency !== 'RSD'){ r.origAmount = vals.amount; r.amount = recurringAmountNow(r); }
        else r.amount = vals.amount;
        r.desc = vals.desc.trim(); r.category = vals.category;
        r.day = C.clampRecurringDay(parseInt(vals.day) || 1);
        r.frequency = FREQ_TO_KEY[vals.frequency] || 'monthly';
        r.anchorMonth = MONTH_NAMES_SR.indexOf(vals.anchorMonth) + 1 || 1;
        r.isSubscription = vals.isSubscription;
        saveRecurring(); processAutoPay(); renderAll();
      }
    });
    wireDeleteButton(list, {
      rowSelector: '.recurring-item',
      find: id => recurring.find(x=>x.id === id),
      onDelete: (r, b)=>{
        const snapshot = r ? removeAllRecurringOccurrences(r) : null;
        recurring = recurring.filter(x=>x.id !== b.dataset.id);
        saveRecurring();
        return snapshot;
      },
      undoLabel: r => (r && r.debtId) ? t('Rata se briše, ali već plaćene rate ostaju u rashodima i u otplati duga.') : t('Obrisana ponavljajuća stavka: "{0}"', r ? r.desc : ''),
      onUndo: (r, snapshot) => { if(r){ recurring.push(r); if(snapshot) restoreRecurringOccurrences(r, snapshot); } saveRecurring(); }
    });
    list.querySelectorAll('[data-ahead-btn]').forEach(b=>{
      b.addEventListener('click', ()=>{
        const r = recurring.find(x=>x.id === b.dataset.aheadBtn);
        const input = list.querySelector(`[data-ahead-input="${b.dataset.aheadBtn}"]`);
        const months = Math.min(24, Math.max(1, parseInt(input.value) || 1));
        if(r) payAheadRecurring(r, months);
      });
    });

    const { pendingItems, pendingExpense, pendingIncome } = getPending();
    if(pendingItems.length){
      pendingLine.style.display = 'flex';
      pendingLine.innerHTML = `<span>${t('Na čekanju ovaj mesec')}</span><span>${t('rashodi {0} · prihodi {1}', fmt(pendingExpense), fmt(pendingIncome))}</span>`;
    } else {
      pendingLine.style.display = 'none';
    }
    updatePayOverdueBtn();
  }

