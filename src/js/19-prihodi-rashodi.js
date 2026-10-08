  // ---- Prihodi ----
  function updateIncomeBulkBar(){
    [...selectedIncomeIds].forEach(id=>{ if(!entries.some(e=>e.id===id)) selectedIncomeIds.delete(id); });
    const bar = document.getElementById('incomeBulkBar');
    const n = selectedIncomeIds.size;
    bar.style.display = n > 0 ? 'flex' : 'none';
    document.getElementById('incomeBulkCount').textContent = t('Izabrano: {0}', n);
  }

  function renderIncome(){
    const allIncome = entries.filter(e=>e.type==='income');
    fillListMonthSelect(document.getElementById('incFilterMonth'), allIncome, incListMonth);
    const list = allIncome.filter(e=> !incListMonth || monthKey(e.date) === incListMonth).sort((a,b)=> b.date.localeCompare(a.date));
    const body = document.getElementById('incomeBody');
    const emptyEl = document.getElementById('incomeEmpty');
    emptyEl.textContent = incListMonth ? t('Nema prihoda u ovom mesecu.') : t('Još nema unesenih prihoda.');
    const selectAllCb = document.getElementById('selectAllIncome');
    if(list.length === 0){
      body.innerHTML=''; emptyEl.style.display='block';
      selectAllCb.checked = false;
    } else {
      emptyEl.style.display='none';
      body.innerHTML = list.map(e=>{
        const d = parseLocalDate(e.date).toLocaleDateString(LOCALE, {day:'2-digit', month:'2-digit', year:'numeric'});
        return `<tr data-row-id="${e.id}" class="${newEntryId===e.id?'row-enter':''}">
          <td class="paid-check"><input type="checkbox" class="row-select" data-id="${e.id}" ${selectedIncomeIds.has(e.id)?'checked':''} title="Izaberi"></td>
          <td>${d}</td><td>${escapeHtml(e.desc)}</td><td>${catTagHtml(e.category)}${tagsHtml(e.tags)}${accountTag(e)}${spreadTag(e)}</td>
          <td class="amount income">+ ${fmt(e.amount)}${origTag(e)}</td>
          <td class="row-actions"><button class="edit-btn" data-id="${e.id}" title="Uredi">✎</button><button class="dup-btn" data-id="${e.id}" title="Dupliraj">⧉</button><button class="del-btn" data-id="${e.id}" title="Obriši">✕</button></td></tr>`;
      }).join('');
      selectAllCb.checked = list.every(e=>selectedIncomeIds.has(e.id));
      body.querySelectorAll('.row-select').forEach(cb=>{
        cb.addEventListener('change', ()=>{
          if(cb.checked) selectedIncomeIds.add(cb.dataset.id); else selectedIncomeIds.delete(cb.dataset.id);
          updateIncomeBulkBar();
          selectAllCb.checked = list.every(e=>selectedIncomeIds.has(e.id));
        });
      });
      wireDeleteButton(body, {
        rowSelector: 'tr',
        find: id => entries.find(e=>e.id === id),
        onDelete: (entry, b)=>{ entries = entries.filter(e=>e.id !== b.dataset.id); unmarkRecurringEntry(b.dataset.id); saveEntries(); },
        undoLabel: entry => t('Obrisan prihod: "{0}"', entry.desc),
        onUndo: entry => { entries.push(entry); remarkRecurringEntry(entry.id); saveEntries(); }
      });
      body.querySelectorAll('.dup-btn').forEach(b=>{
        b.addEventListener('click', ()=>{
          const entry = entries.find(e=>e.id === b.dataset.id);
          if(entry) duplicateEntry(entry);
        });
      });
      wireEditButton(body, {
        find: id => entries.find(e=>e.id === id),
        title: 'Uredi prihod',
        buildFields: entry => [
          {key:'desc', label:'Opis', type:'text', value:entry.desc},
          {key:'amount', label:'Iznos (RSD)', type:'number', value:entry.amount},
          {key:'category', label:'Kategorija', type:'select', value:entry.category, options:incomeCats},
          {key:'date', label:'Datum', type:'date', value:entry.date},
          {key:'tags', label:'Oznake (odvojene zarezom)', type:'text', value:(entry.tags||[]).join(', ')},
          {key:'spreadMonths', label:'Pokriva meseci (1 = samo mesec uplate)', type:'number', value: parseInt(entry.spreadMonths, 10) || 1},
          {key:'spreadStart', label:'Od meseca (za više meseci)', type:'month', value: entry.spreadStart || entry.date.slice(0,7)},
          ...accountEditField(entry.accountId),
        ],
        onSave: (entry, vals)=>{
          if(!vals.desc || !vals.desc.trim() || isNaN(vals.amount) || vals.amount <= 0 || !vals.date) return;
          entry.desc = vals.desc.trim(); applyAmountEdit(entry, vals.amount); entry.category = vals.category; entry.date = vals.date;
          applyAccountEdit(entry, vals);
          applySpreadEdit(entry, vals);
          entry.tags = parseTagsInput(vals.tags);
          saveEntries(); renderAll();
        }
      });
    }
    selectAllCb.onchange = () => {
      if(selectAllCb.checked) list.forEach(e=>selectedIncomeIds.add(e.id));
      else list.forEach(e=>selectedIncomeIds.delete(e.id));
      renderIncome();
      updateIncomeBulkBar();
    };
    updateIncomeBulkBar();
  }

  document.getElementById('incomeBulkDeleteBtn').addEventListener('click', ()=>{
    const ids = [...selectedIncomeIds];
    if(ids.length === 0) return;
    const removed = entries.filter(e=> ids.includes(e.id));
    entries = entries.filter(e=> !ids.includes(e.id));
    ids.forEach(unmarkRecurringEntry);
    selectedIncomeIds.clear();
    saveEntries();
    playDeleteSound();
    renderAll();
    showUndoToast(t('Obrisano {0} prihoda', removed.length), ()=>{ entries.push(...removed); removed.forEach(e=>remarkRecurringEntry(e.id)); saveEntries(); renderAll(); });
  });

  document.getElementById('incomeForm').addEventListener('submit', function(e){
    e.preventDefault();
    const fa = readAmountField('inc');
    const parsed = parseQuickAmount(document.getElementById('incDesc').value, fa.amount);
    const desc = parsed.desc;
    const amount = parsed.amount;
    const category = document.getElementById('incCategory').value;
    const date = document.getElementById('incDate').value;
    const tags = parseTagsInput(document.getElementById('incTags').value);
    if(!desc || isNaN(amount) || amount <= 0 || !date) return;
    const id = newId();
    const entry = { id, type:'income', desc, amount, category, date, tags };
    if(fa.foreign && fa.amount === amount) Object.assign(entry, fa.foreign);
    if(accounts.length) entry.accountId = document.getElementById('incAccount').value || defaultAccountId();
    const spread = readSpreadField('inc');
    if(spread){ entry.spreadMonths = spread.spreadMonths; if(spread.spreadStart) entry.spreadStart = spread.spreadStart; }
    entries.push(entry);
    newEntryId = id;
    saveEntries(); renderAll();
    const incAcc = document.getElementById('incAccount').value, incCur = document.getElementById('incCurrency').value;
    this.reset(); document.getElementById('incDate').value = toISODateLocal(new Date()); document.getElementById('incDesc').focus();
    document.getElementById('incAccount').value = incAcc; document.getElementById('incCurrency').value = incCur; updateCurrencyHint('inc');
    resetSpreadField('inc');
  });

  // ---- Rashodi ----
  function populateExpenseCategorySelect(){
    const sel = document.getElementById('expCategory');
    const prev = sel.value;
    sel.innerHTML = expenseCats.map(c=>userOption(c)).join('');
    if(expenseCats.includes(prev)) sel.value = prev;
    const incSel = document.getElementById('incCategory');
    const prevInc = incSel.value;
    incSel.innerHTML = incomeCats.map(c=>userOption(c)).join('');
    if(incomeCats.includes(prevInc)) incSel.value = prevInc;
  }

  // ---- Autocomplete opisa + predlog kategorije na osnovu istorije ----
  function populateDescDatalists(){
    const incList = document.getElementById('incDescList');
    const expList = document.getElementById('expDescList');
    const incDescs = [...new Set(entries.filter(e=>e.type==='income').map(e=>e.desc))];
    const expDescs = [...new Set(entries.filter(e=>e.type==='expense').map(e=>e.desc))];
    incList.innerHTML = incDescs.map(d=>`<option value="${escapeHtml(d)}"></option>`).join('');
    expList.innerHTML = expDescs.map(d=>`<option value="${escapeHtml(d)}"></option>`).join('');
  }
  function suggestCategoryFromDesc(descInputId, categorySelectId, type){
    const desc = parseQuickAmount(document.getElementById(descInputId).value, NaN).desc.trim().toLowerCase();
    if(!desc) return;
    const ruleCat = type === 'expense' ? categoryFromRules(desc) : null;
    const match = entries.filter(e=> e.type===type && e.desc.trim().toLowerCase()===desc).sort((a,b)=> b.date.localeCompare(a.date))[0];
    const cat = ruleCat || (match && match.category);
    if(!cat) return;
    const sel = document.getElementById(categorySelectId);
    if([...sel.options].some(o=>o.value===cat)) sel.value = cat;
  }
  document.getElementById('expDesc').addEventListener('input', ()=> suggestCategoryFromDesc('expDesc','expCategory','expense'));
  document.getElementById('incDesc').addEventListener('input', ()=> suggestCategoryFromDesc('incDesc','incCategory','income'));
  function populateRecurringCategorySelect(){
    const sel = document.getElementById('recCategory');
    const prev = sel.value;
    if(currentRecType === 'expense'){
      sel.innerHTML = expenseCats.map(c=>userOption(c)).join('');
    } else {
      sel.innerHTML = incomeCats.map(c=>userOption(c)).join('');
    }
    if([...sel.options].some(o=>o.value===prev)) sel.value = prev;
  }

  // Izbor meseca za listu: "Svi meseci" + meseci sa stavkama + izabrani mesec i kad jos nema stavki
  function fillListMonthSelect(sel, list, selected){
    const months = [...new Set(list.map(e=>monthKey(e.date)).concat(selected ? [selected] : []))].sort().reverse();
    sel.innerHTML = `<option value="">${t('Svi meseci')}</option>` + months.map(m=> `<option value="${m}">${monthYearLabelSr(m)}</option>`).join('');
    sel.value = selected || '';
  }
  function populateExpenseFilters(){
    const expenseOnly = entries.filter(e=>e.type==='expense');
    const monthSel = document.getElementById('filterMonth');
    const catSel = document.getElementById('filterCategory');
    fillListMonthSelect(monthSel, expenseOnly, expListMonth);
    const prevCat = catSel.value;
    catSel.innerHTML = '<option value="">Sve kategorije</option>' + expenseCats.map(c=>userOption(c)).join('');
    if(expenseCats.includes(prevCat)) catSel.value = prevCat;
  }

  function getFilteredExpenses(){
    const m = expListMonth;
    const c = document.getElementById('filterCategory').value;
    const p = document.getElementById('filterPaid').value;
    return entries.filter(e=> e.type==='expense' && (!m || monthKey(e.date)===m) && (!c || e.category===c)
      && (!p || (p==='pending' ? !isExpensePaid(e) : isExpensePaid(e))))
      .sort((a,b)=> b.date.localeCompare(a.date));
  }

  function duplicateEntry(entry){
    const copy = Object.assign({}, entry, { id: newId(), date: toISODateLocal(new Date()) });
    // kopija je nova kupovina: nije isti racun (duplikat, Cene) i nema njegove slike
    delete copy.receiptId; delete copy.attachments;
    if(Array.isArray(copy.items)) copy.items = copy.items.slice();
    if(Array.isArray(copy.itemPrices)) copy.itemPrices = copy.itemPrices.slice();
    if(Array.isArray(copy.itemQty)) copy.itemQty = copy.itemQty.map(q=> Object.assign({}, q));
    delete copy.fiscalUrl;
    entries.push(copy);
    newEntryId = copy.id;
    saveEntries(); renderAll();
  }

  if(IS_TEST) window.__duplicateEntry = duplicateEntry;
  function updateExpenseBulkBar(){
    [...selectedExpenseIds].forEach(id=>{ if(!entries.some(e=>e.id===id)) selectedExpenseIds.delete(id); });
    const bar = document.getElementById('expenseBulkBar');
    const n = selectedExpenseIds.size;
    bar.style.display = n > 0 ? 'flex' : 'none';
    document.getElementById('expenseBulkCount').textContent = t('Izabrano: {0}', n);
  }

  function renderExpenses(){
    fillListMonthSelect(document.getElementById('filterMonth'), entries.filter(e=>e.type==='expense'), expListMonth);
    const filtered = getFilteredExpenses();
    const body = document.getElementById('expenseBody');
    const emptyEl = document.getElementById('expenseEmpty');
    const upcoming = renderExpenseUpcoming();
    emptyEl.textContent = expListMonth ? t('Nema rashoda u ovom mesecu.') : t('Nema rashoda za prikaz.');
    if(upcoming.length) emptyEl.textContent += ' ' + t('Očekuje se {0} ponavljajućih ({1}) — vidi ispod.', upcoming.length, fmt(upcoming.reduce((s, r)=> s + r.amount, 0)));
    const selectAllCb = document.getElementById('selectAllExpenses');
    if(filtered.length === 0){
      body.innerHTML=''; emptyEl.style.display='block';
      selectAllCb.checked = false;
    } else {
      emptyEl.style.display='none';
      body.innerHTML = filtered.map(e=>{
        const d = parseLocalDate(e.date).toLocaleDateString(LOCALE, {day:'2-digit', month:'2-digit', year:'numeric'});
        const paid = isExpensePaid(e);
        return `<tr data-row-id="${e.id}" class="${newEntryId===e.id?'row-enter':''} ${!paid?'expense-pending':''}">
          <td class="paid-check"><input type="checkbox" class="row-select" data-id="${e.id}" ${selectedExpenseIds.has(e.id)?'checked':''} title="Izaberi"></td>
          <td class="paid-check"><input type="checkbox" data-paid-id="${e.id}" ${paid?'checked':''} title="Plaćeno"></td>
          <td>${d}</td><td>${escapeHtml(e.desc)}${itemsDetailsHtml(e)}</td><td>${catTagHtml(e.category)}${!paid?'<span class="pending-inline-tag">na čekanju</span>':''}${tagsHtml(e.tags)}${accountTag(e)}${spreadTag(e)}</td>
          <td class="amount expense">− ${fmt(e.amount)}${origTag(e)}</td>
          <td class="row-actions">${e.fiscalUrl ? `<button class="att-btn fiscal-btn" data-id="${e.id}" title="${escapeHtml(t('Otvori račun na sajtu Poreske uprave'))}">🧾</button>` : ''}${!e.fiscalUrl && e.attachments && e.attachments.length && window.desktop ? (isSlipAttachment(e.attachments[0])
            ? `<button class="att-btn" data-id="${e.id}" title="${escapeHtml(t('Otvori uplatnicu'))}">📎</button>`
            : `<button class="att-btn" data-id="${e.id}" title="${escapeHtml(t('Otvori račun iz prodavnice'))}">📎</button>`) : ''}${hasWarrantySource(e) ? `<button class="btn-link warranty-btn" data-id="${e.id}" title="${escapeHtml(t('Dodaj garanciju za ovu kupovinu'))}">${escapeHtml(t('+ garancija'))}</button>` : ''}<button class="edit-btn" data-id="${e.id}" title="Uredi">✎</button><button class="dup-btn" data-id="${e.id}" title="Dupliraj">⧉</button><button class="del-btn" data-id="${e.id}" title="Obriši">✕</button></td></tr>`;
      }).join('');
      selectAllCb.checked = filtered.every(e=>selectedExpenseIds.has(e.id));
      body.querySelectorAll('.row-select').forEach(cb=>{
        cb.addEventListener('change', ()=>{
          if(cb.checked) selectedExpenseIds.add(cb.dataset.id); else selectedExpenseIds.delete(cb.dataset.id);
          updateExpenseBulkBar();
          selectAllCb.checked = filtered.every(e=>selectedExpenseIds.has(e.id));
        });
      });
      wireDeleteButton(body, {
        rowSelector: 'tr',
        find: id => entries.find(e=>e.id === id),
        onDelete: (entry, b)=>{ entries = entries.filter(e=>e.id !== b.dataset.id); unmarkRecurringEntry(b.dataset.id); saveEntries(); },
        undoLabel: entry => t('Obrisan rashod: "{0}"', entry.desc),
        onUndo: entry => { entries.push(entry); remarkRecurringEntry(entry.id); saveEntries(); }
      });
      body.querySelectorAll('.dup-btn').forEach(b=>{
        b.addEventListener('click', ()=>{
          const entry = entries.find(e=>e.id === b.dataset.id);
          if(entry) duplicateEntry(entry);
        });
      });
      body.querySelectorAll('.warranty-btn').forEach(b=>{
        b.addEventListener('click', ()=>{ const entry = entries.find(e=> e.id === b.dataset.id); if(entry) openWarrantyFromEntry(entry); });
      });
      body.querySelectorAll('.fiscal-btn').forEach(b=>{
        b.addEventListener('click', ()=>{ const entry = entries.find(e=> e.id === b.dataset.id); const url = entry && C.fiscalUrlFrom(entry.fiscalUrl); if(url) window.open(url); });
      });
      body.querySelectorAll('.att-btn:not(.fiscal-btn)').forEach(b=>{
        b.addEventListener('click', async ()=>{
          const entry = entries.find(e=>e.id === b.dataset.id);
          if(!entry || !entry.attachments || !window.desktop || !window.desktop.bills) return;
          const r = await window.desktop.bills.openFile(entry.attachments[0]);
          if(!r || !r.ok) appAlert(t('Prilog nije pronađen u folderu Prilozi.'));
        });
      });
      wireEditButton(body, {
        find: id => entries.find(e=>e.id === id),
        title: 'Uredi rashod',
        buildFields: entry => [
          {key:'desc', label:'Opis', type:'text', value:entry.desc},
          {key:'amount', label:'Iznos (RSD)', type:'number', value:entry.amount},
          {key:'category', label:'Kategorija', type:'select', value:entry.category, options:expenseCats},
          {key:'date', label:'Datum', type:'date', value:entry.date},
          {key:'tags', label:'Oznake (odvojene zarezom)', type:'text', value:(entry.tags||[]).join(', ')},
          {key:'paid', label:'Već plaćeno', type:'checkbox', value:isExpensePaid(entry)},
          {key:'spreadMonths', label:'Pokriva meseci (1 = samo mesec uplate)', type:'number', value: parseInt(entry.spreadMonths, 10) || 1},
          {key:'spreadStart', label:'Od meseca (za više meseci)', type:'month', value: entry.spreadStart || entry.date.slice(0,7)},
          ...accountEditField(entry.accountId),
          {key:'remember', label:'Ubuduće ovaj opis uvek stavljaj u izabranu kategoriju (pravilo za uvoz i brzi unos)', type:'checkbox', value:false},
        ],
        onSave: (entry, vals)=>{
          if(!vals.desc || !vals.desc.trim() || isNaN(vals.amount) || vals.amount <= 0 || !vals.date) return;
          entry.desc = vals.desc.trim(); applyAmountEdit(entry, vals.amount); entry.category = vals.category; entry.date = vals.date; entry.paid = vals.paid;
          applyAccountEdit(entry, vals);
          applySpreadEdit(entry, vals);
          entry.tags = parseTagsInput(vals.tags);
          if(vals.remember) rememberCategoryRule(entry.desc, entry.category);
          saveEntries(); renderAll();
        }
      });
      body.querySelectorAll('[data-paid-id]').forEach(cb=>{
        cb.addEventListener('change', ()=>{
          const entry = entries.find(e=>e.id === cb.dataset.paidId);
          if(!entry) return;
          entry.paid = cb.checked;
          saveEntries();
          if(cb.checked) playPaidSound(); else playUnpaidSound();
          renderAll();
        });
      });
    }
    selectAllCb.onchange = () => {
      if(selectAllCb.checked) filtered.forEach(e=>selectedExpenseIds.add(e.id));
      else filtered.forEach(e=>selectedExpenseIds.delete(e.id));
      renderExpenses();
      updateExpenseBulkBar();
    };
    updateExpenseBulkBar();
  }
  // Ispod liste rashoda: ponavljajuce stavke koje u izabranom mesecu tek dospevaju (iste koje broji "Za placanje").
  // Nisu pravi rashodi dok se ne plate — klik vodi na ekran Ponavljajuce.
  function renderExpenseUpcoming(){
    const box = document.getElementById('expenseUpcoming');
    const cat = document.getElementById('filterCategory').value;
    const paidFilter = document.getElementById('filterPaid').value;
    const items = (!expListMonth || paidFilter === 'paid') ? [] : pendingRecurring(expListMonth)
      .filter(r=> r.type === 'expense' && (!cat || r.category === cat))
      .sort((a, b)=> C.effectiveDay(a.day, expListMonth) - C.effectiveDay(b.day, expListMonth));
    if(!items.length){ box.style.display = 'none'; box.innerHTML = ''; return items; }
    box.style.display = '';
    box.innerHTML = `<h3 class="upcoming-title">${t('Očekuje se (ponavljajuće) · {0} · {1}', items.length, fmt(items.reduce((s, r)=> s + r.amount, 0)))}</h3>
      ${items.map(r=>{ const due = C.dueDateFor(r, expListMonth), late = due < toISODateLocal(new Date());
        return `<button type="button" class="upcoming-row${late ? ' late' : ''}" title="${t('Otvori Ponavljajuće')}">
        <span class="upcoming-date">${parseLocalDate(due).toLocaleDateString(LOCALE, {day:'2-digit', month:'2-digit'})}${late ? ` <span class="upcoming-late">${t('kasni')}</span>` : ''}</span>
        <span class="upcoming-desc" translate="no">${escapeHtml(r.desc)}</span>
        <span>${catTagHtml(r.category)}</span>
        <span class="upcoming-amt">− ${fmt(r.amount)}</span></button>`; }).join('')}`;
    box.querySelectorAll('.upcoming-row').forEach(b=> b.addEventListener('click', ()=> showScreen('ponavljajuce')));
    return items;
  }

  document.getElementById('markVisiblePaidBtn').addEventListener('click', ()=>{
    const visible = getFilteredExpenses().filter(e=> !isExpensePaid(e));
    if(visible.length === 0) return;
    visible.forEach(e=> e.paid = true);
    saveEntries();
    playPaidSound();
    renderAll();
  });

  document.getElementById('expenseBulkDeleteBtn').addEventListener('click', ()=>{
    const ids = [...selectedExpenseIds];
    if(ids.length === 0) return;
    const removed = entries.filter(e=> ids.includes(e.id));
    entries = entries.filter(e=> !ids.includes(e.id));
    ids.forEach(unmarkRecurringEntry);
    selectedExpenseIds.clear();
    saveEntries();
    playDeleteSound();
    renderAll();
    showUndoToast(t('Obrisano {0} rashoda', removed.length), ()=>{ entries.push(...removed); removed.forEach(e=>remarkRecurringEntry(e.id)); saveEntries(); renderAll(); });
  });

  // ---- Podela rashoda na vise kategorija ----
  function splitRowHtml(){
    return `<div class="split-row">
      <select class="split-cat">${expenseCats.map(c=>userOption(c)).join('')}</select>
      <input type="number" class="split-amount" placeholder="Iznos" min="0" step="1">
      <button type="button" class="del-btn split-remove-row" title="Ukloni">✕</button>
    </div>`;
  }
  function updateSplitTotal(){
    const total = [...document.querySelectorAll('.split-amount')].reduce((s,i)=> s + (parseFloat(i.value) || 0), 0);
    document.getElementById('expSplitTotal').textContent = t('Ukupno: {0}', fmt(total));
  }
  function addSplitRow(){
    const wrap = document.createElement('div');
    wrap.innerHTML = splitRowHtml();
    const row = wrap.firstElementChild;
    document.getElementById('expSplitRowsInner').appendChild(row);
    row.querySelector('.split-remove-row').addEventListener('click', ()=>{ row.remove(); updateSplitTotal(); });
    row.querySelector('.split-amount').addEventListener('input', updateSplitTotal);
    updateSplitTotal();
  }
  document.getElementById('expSplitToggle').addEventListener('change', function(){
    document.getElementById('expSplitRows').style.display = this.checked ? 'block' : 'none';
    if(this.checked && document.getElementById('expSplitRowsInner').children.length === 0){
      addSplitRow(); addSplitRow();
    }
  });
  document.getElementById('expSplitAddRow').addEventListener('click', addSplitRow);

  document.getElementById('expenseForm').addEventListener('submit', function(e){
    e.preventDefault();
    const fa = readAmountField('exp');
    const parsed = parseQuickAmount(document.getElementById('expDesc').value, fa.amount);
    const desc = parsed.desc;
    const amount = parsed.amount;
    const accountId = accounts.length ? (document.getElementById('expAccount').value || defaultAccountId()) : undefined;
    const category = document.getElementById('expCategory').value;
    const date = document.getElementById('expDate').value;
    const paid = document.getElementById('expPaid').checked;
    const tags = parseTagsInput(document.getElementById('expTags').value);
    const splitOn = document.getElementById('expSplitToggle').checked;
    if(!desc || !date) return;
    if(splitOn){
      const rows = [...document.querySelectorAll('.split-row')].map(row=>({
        category: row.querySelector('.split-cat').value,
        amount: parseFloat(row.querySelector('.split-amount').value)
      }));
      if(rows.length === 0 || rows.some(r=> isNaN(r.amount) || r.amount <= 0)) return;
      rows.forEach(r=>{
        const id = newId();
        const e = { id, type:'expense', desc, amount:r.amount, category:r.category, date, paid, tags };
        if(accountId) e.accountId = accountId;
        const spread = readSpreadField('exp');
        if(spread){ e.spreadMonths = spread.spreadMonths; if(spread.spreadStart) e.spreadStart = spread.spreadStart; }
        entries.push(e);
        newEntryId = id;
        applyRoundUpSaving(r.amount);
      });
      saveEntries(); renderAll();
      document.getElementById('expSplitToggle').checked = false;
      document.getElementById('expSplitRows').style.display = 'none';
      document.getElementById('expSplitRowsInner').innerHTML = '';
      const expAcc = document.getElementById('expAccount').value, expCur = document.getElementById('expCurrency').value;
      this.reset(); document.getElementById('expDate').value = toISODateLocal(new Date());
      document.getElementById('expPaid').checked = true;
      document.getElementById('expAccount').value = expAcc; document.getElementById('expCurrency').value = expCur; updateCurrencyHint('exp');
    resetSpreadField('exp');
      populateExpenseCategorySelect(); document.getElementById('expDesc').focus();
      return;
    }
    if(isNaN(amount) || amount <= 0 || !category) return;
    const id = newId();
    const entry = { id, type:'expense', desc, amount, category, date, paid, tags };
    if(fa.foreign && fa.amount === amount) Object.assign(entry, fa.foreign);
    if(accountId) entry.accountId = accountId;
    const spread = readSpreadField('exp');
    if(spread){ entry.spreadMonths = spread.spreadMonths; if(spread.spreadStart) entry.spreadStart = spread.spreadStart; }
    entries.push(entry);
    newEntryId = id;
    applyRoundUpSaving(amount);
    saveEntries(); renderAll();
    const expAcc = document.getElementById('expAccount').value, expCur = document.getElementById('expCurrency').value;
    this.reset(); document.getElementById('expDate').value = toISODateLocal(new Date());
    document.getElementById('expPaid').checked = true;
    document.getElementById('expAccount').value = expAcc; document.getElementById('expCurrency').value = expCur; updateCurrencyHint('exp');
    resetSpreadField('exp');
    populateExpenseCategorySelect(); document.getElementById('expDesc').focus();
  });

  document.getElementById('filterMonth').addEventListener('change', e=>{ expListMonth = e.target.value; renderExpenses(); });
  document.getElementById('incFilterMonth').addEventListener('change', e=>{ incListMonth = e.target.value; renderIncome(); });
  document.getElementById('filterCategory').addEventListener('change', renderExpenses);
  document.getElementById('filterPaid').addEventListener('change', renderExpenses);

