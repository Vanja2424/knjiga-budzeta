  // ---- Uporedi ----
  function populateCompareSelects(){
    const allMonths = [...new Set(entries.map(e=>monthKey(e.date)))].sort().reverse();
    const selA = document.getElementById('compareMonthA');
    const selB = document.getElementById('compareMonthB');
    const labelFor = m => { const [y,mo]=m.split('-'); return new Date(y,mo-1,1).toLocaleDateString(LOCALE,{month:'long',year:'numeric'}); };
    const opts = '<option value="">Izaberi mesec</option>' + allMonths.map(m=>`<option value="${m}">${labelFor(m)}</option>`).join('');
    const prevA = selA.value, prevB = selB.value;
    selA.innerHTML = opts; selB.innerHTML = opts;
    if(allMonths.includes(prevA)) selA.value = prevA; else if(allMonths[0]) selA.value = allMonths[0];
    if(allMonths.includes(prevB)) selB.value = prevB; else if(allMonths[1]) selB.value = allMonths[1];
  }

  function renderCompare(){
    populateCompareSelects();
    const mA = document.getElementById('compareMonthA').value;
    const mB = document.getElementById('compareMonthB').value;
    const body = document.getElementById('compareBody');
    const emptyEl = document.getElementById('compareEmpty');
    if(!mA || !mB){ body.innerHTML=''; emptyEl.style.display='block'; return; }
    emptyEl.style.display='none';
    const sumByCat = (m) => {
      const map = {};
      Object.assign(map, monthTotals(m).byCat);
      return map;
    };
    const a = sumByCat(mA), b = sumByCat(mB);
    const cats = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    if(cats.length === 0){ body.innerHTML=''; emptyEl.style.display='block'; return; }
    body.innerHTML = cats.map(cat=>{
      const va = a[cat]||0, vb = b[cat]||0, diff = vb-va;
      const diffClass = diff > 0 ? 'pos' : (diff < 0 ? 'neg' : '');
      const sign = diff > 0 ? '+' : '';
      return `<tr><td>${escapeHtml(cat)}</td><td class="amount">${fmt(va)}</td><td class="amount">${fmt(vb)}</td>
        <td class="amount diff ${diffClass}">${sign}${fmt(diff)}</td></tr>`;
    }).join('');
  }
  document.getElementById('compareMonthA').addEventListener('change', renderCompare);
  document.getElementById('compareMonthB').addEventListener('change', renderCompare);

  // ---- Uporedi: godisnji pregled (grupisani bar chart) ----
  let compareMode = 'meseci';
  function setCompareMode(mode){
    compareMode = mode;
    document.querySelectorAll('.compare-mode-btn').forEach(b=> b.classList.toggle('active', b.dataset.mode===mode));
    document.getElementById('compareMonthsSection').style.display = mode==='meseci' ? '' : 'none';
    document.getElementById('compareYearSection').style.display = mode==='godina' ? '' : 'none';
    if(mode==='meseci') renderCompare(); else renderYearCompare();
  }
  document.querySelectorAll('.compare-mode-btn').forEach(btn=>{
    btn.addEventListener('click', ()=> setCompareMode(btn.dataset.mode));
  });

  function populateCompareYearSelect(){
    const years = [...new Set(entries.map(e=>e.date.slice(0,4)))].sort().reverse();
    const sel = document.getElementById('compareYearSelect');
    const prev = sel.value;
    sel.innerHTML = years.map(y=>`<option value="${y}">${y}</option>`).join('') || '<option value="">Nema podataka</option>';
    if(years.includes(prev)) sel.value = prev;
  }

  function renderYearCompare(){
    populateCompareYearSelect();
    const y = document.getElementById('compareYearSelect').value;
    const svg = document.getElementById('yearBarChart');
    const emptyEl = document.getElementById('compareYearEmpty');
    if(!y){ svg.innerHTML=''; emptyEl.style.display='block'; return; }
    const months = Array.from({length:12}, (_,i)=> y+'-'+String(i+1).padStart(2,'0'));
    const incomeVals = months.map(m=> sumMonth(m, isIncome));
    const expenseVals = months.map(m=> sumMonth(m, isPaidExpense));
    if(incomeVals.every(v=>v===0) && expenseVals.every(v=>v===0)){ svg.innerHTML=''; emptyEl.style.display='block'; return; }
    emptyEl.style.display='none';
    const maxVal = Math.max(1, ...incomeVals, ...expenseVals);
    const W=760, H=260, padL=10, padR=10, padT=15, padB=30;
    const plotW = W-padL-padR, plotH = H-padT-padB;
    const groupW = plotW/12;
    const barW = groupW*0.34;
    const gridLines = [0,0.5,1].map(f=>{
      const y2 = padT + plotH*(1-f);
      return `<line x1="${padL}" y1="${y2}" x2="${W-padR}" y2="${y2}" stroke="var(--paper-line)" stroke-width="1"/>`;
    }).join('');
    let bars = '';
    months.forEach((m,i)=>{
      const gx = padL + i*groupW + (groupW - barW*2 - 3)/2;
      const hInc = (incomeVals[i]/maxVal)*plotH;
      const hExp = (expenseVals[i]/maxVal)*plotH;
      bars += `<rect class="year-bar" x="${gx.toFixed(1)}" y="${(padT+plotH-hInc).toFixed(1)}" width="${barW.toFixed(1)}" height="${hInc.toFixed(1)}" fill="var(--pos)" rx="3" style="animation-delay:${(i*0.03).toFixed(2)}s"><title>${fmt(incomeVals[i])}</title></rect>`;
      bars += `<rect class="year-bar" x="${(gx+barW+3).toFixed(1)}" y="${(padT+plotH-hExp).toFixed(1)}" width="${barW.toFixed(1)}" height="${hExp.toFixed(1)}" fill="var(--rust)" rx="2" style="animation-delay:${(i*0.03+0.03).toFixed(2)}s"><title>${fmt(expenseVals[i])}</title></rect>`;
    });
    const labels = months.map((m,i)=>{
      const gx = padL + i*groupW + groupW/2;
      const [yy,mo] = m.split('-');
      const label = new Date(yy,mo-1,1).toLocaleDateString(LOCALE,{month:'short'}).replace('.','');
      return `<text x="${gx.toFixed(1)}" y="${H-8}" text-anchor="middle" font-size="10" fill="var(--ink-soft)" font-family="-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">${label}</text>`;
    }).join('');
    svg.innerHTML = gridLines + bars + labels;
  }
  document.getElementById('compareYearSelect').addEventListener('change', renderYearCompare);

  // ---- Pretraga ----
  function renderSearch(){
    const q = document.getElementById('searchInput').value.trim().toLowerCase();
    const dateFrom = document.getElementById('searchDateFrom').value;
    const dateTo = document.getElementById('searchDateTo').value;
    const amountMin = parseFloat(document.getElementById('searchAmountMin').value);
    const amountMax = parseFloat(document.getElementById('searchAmountMax').value);
    const body = document.getElementById('searchBody');
    const emptyEl = document.getElementById('searchEmpty');
    const list = entries
      .filter(e=> !isTransfer(e))
      .filter(e=> !q || e.desc.toLowerCase().includes(q) || e.category.toLowerCase().includes(q) || (e.tags||[]).some(t=>t.includes(q)))
      .filter(e=> !dateFrom || e.date >= dateFrom)
      .filter(e=> !dateTo || e.date <= dateTo)
      .filter(e=> isNaN(amountMin) || e.amount >= amountMin)
      .filter(e=> isNaN(amountMax) || e.amount <= amountMax)
      .sort((a,b)=> b.date.localeCompare(a.date));
    if(list.length === 0){ body.innerHTML=''; emptyEl.style.display='block'; }
    else {
      emptyEl.style.display='none';
      body.innerHTML = list.map(e=>{
        const d = parseLocalDate(e.date).toLocaleDateString(LOCALE, {day:'2-digit', month:'2-digit', year:'numeric'});
        const sign = e.type === 'income' ? '+' : '−';
        return `<tr><td>${d}</td><td>${escapeHtml(e.desc)}</td><td>${catTagHtml(e.category)}${tagsHtml(e.tags)}</td>
          <td>${e.type==='income'?'Prihod':'Rashod'}</td><td class="amount ${e.type}">${sign} ${fmt(e.amount)}</td></tr>`;
      }).join('');
    }

    const recurringMatches = q ? recurring.filter(r=> r.desc.toLowerCase().includes(q) || r.category.toLowerCase().includes(q)) : [];
    const recSection = document.getElementById('searchRecurringSection');
    recSection.style.display = recurringMatches.length ? 'block' : 'none';
    document.getElementById('searchRecurringList').innerHTML = recurringMatches.map(r=>
      `<div class="breakdown-item"><div class="row"><span>${escapeHtml(r.desc)} ${catTagHtml(r.category)}</span><span>${fmt(r.amount)} · ${r.type==='income'?'prihod':'rashod'}, dan ${r.day}.</span></div></div>`
    ).join('');

    const goalMatches = q ? goals.filter(g=> g.name.toLowerCase().includes(q)) : [];
    const goalsSection = document.getElementById('searchGoalsSection');
    goalsSection.style.display = goalMatches.length ? 'block' : 'none';
    document.getElementById('searchGoalsList').innerHTML = goalMatches.map(g=>
      `<div class="breakdown-item"><div class="row"><span>${escapeHtml(g.name)}</span><span>${fmt(g.current)} / ${fmt(g.target)}</span></div></div>`
    ).join('');
  }
  document.getElementById('searchInput').addEventListener('input', renderSearch);
  ['searchDateFrom','searchDateTo','searchAmountMin','searchAmountMax'].forEach(id=>{
    document.getElementById(id).addEventListener('input', renderSearch);
  });

  // ---- Izvestaj (stampa) ----
  function populateReportSelectors(){
    const monthSel = document.getElementById('reportMonth');
    const yearSel = document.getElementById('reportYear');
    const months = [...new Set(entries.map(e=>monthKey(e.date)))].sort().reverse();
    const years = [...new Set(entries.map(e=>e.date.slice(0,4)))].sort().reverse();
    const labelForMonth = m => { const [y,mo]=m.split('-'); return new Date(y,mo-1,1).toLocaleDateString(LOCALE,{month:'long',year:'numeric'}); };
    const prevMonth = monthSel.value, prevYear = yearSel.value;
    monthSel.innerHTML = months.map(m=>`<option value="${m}">${labelForMonth(m)}</option>`).join('') || '<option value="">Nema podataka</option>';
    yearSel.innerHTML = years.map(y=>`<option value="${y}">${y}</option>`).join('') || '<option value="">Nema podataka</option>';
    if(months.includes(prevMonth)) monthSel.value = prevMonth;
    if(years.includes(prevYear)) yearSel.value = prevYear;
  }

  // Stavke perioda za izvestaj: iznos = deo koji pripada periodu (raspodeljene stavke se dele)
  function periodEntries(months){
    return entries.filter(e=> !isTransfer(e)).map(e=>{
      const share = C.shareInMonths(e, months);
      if(!share) return null;
      return isSpread(e) ? Object.assign({}, e, { amount: share, fullAmount: e.amount }) : e;
    }).filter(Boolean);
  }
  function renderReport(){
    populateReportSelectors();
    const scope = document.getElementById('reportScope').value;
    document.getElementById('reportMonth').style.display = scope==='month' ? '' : 'none';
    document.getElementById('reportYear').style.display = scope==='year' ? '' : 'none';
    const preview = document.getElementById('reportPreview');
    let rangeEntries, label;
    if(scope === 'month'){
      const m = document.getElementById('reportMonth').value;
      if(!m){ preview.innerHTML = '<div class="empty">Nema podataka za prikaz.</div>'; return; }
      rangeEntries = periodEntries([m]);
      const [y,mo] = m.split('-');
      label = new Date(y,mo-1,1).toLocaleDateString(LOCALE,{month:'long',year:'numeric'});
    } else {
      const y = document.getElementById('reportYear').value;
      if(!y){ preview.innerHTML = '<div class="empty">Nema podataka za prikaz.</div>'; return; }
      rangeEntries = periodEntries(C.monthRange(y + '-01', y + '-12'));
      label = t('{0}. godina', y);
    }
    const income = rangeEntries.filter(e=>e.type==='income').reduce((s,e)=>s+e.amount,0);
    const expense = rangeEntries.filter(e=>e.type==='expense' && isExpensePaid(e)).reduce((s,e)=>s+e.amount,0);
    const pending = rangeEntries.filter(e=>e.type==='expense' && !isExpensePaid(e)).reduce((s,e)=>s+e.amount,0);
    const balance = income - expense;

    const byCat = {};
    rangeEntries.filter(e=>e.type==='expense' && isExpensePaid(e)).forEach(e=>{ byCat[e.category] = (byCat[e.category]||0)+e.amount; });
    const catRows = Object.entries(byCat).sort((a,b)=>b[1]-a[1]);
    const listRows = rangeEntries.slice().sort((a,b)=> a.date.localeCompare(b.date));

    // "Godina u brojkama" — samo za godisnji opseg, retrospektiva iznad standardnog izvestaja.
    let yearRecapHtml = '';
    if(scope === 'year'){
      const y = document.getElementById('reportYear').value;
      const prevYear = String(parseInt(y,10)-1);
      const prevEntries = periodEntries(C.monthRange(prevYear + '-01', prevYear + '-12'));
      const prevExpense = prevEntries.filter(e=>e.type==='expense' && isExpensePaid(e)).reduce((s,e)=>s+e.amount,0);
      const savingsRate = income > 0 ? ((income-expense)/income*100) : 0;
      const biggestExpense = rangeEntries.filter(e=>e.type==='expense' && isExpensePaid(e)).sort((a,b)=>b.amount-a.amount)[0];
      const topCatShare = (catRows.length && expense > 0) ? (catRows[0][1]/expense*100) : 0;
      const cards = [];
      cards.push(`<div class="insight-card"><div class="big">${savingsRate.toFixed(0)}%</div><div class="small">Stopa uštede — od prihoda ove godine, toliko je ostalo posle svih rashoda.</div></div>`);
      if(catRows.length) cards.push(`<div class="insight-card"><div class="big">${escapeHtml(catRows[0][0])}</div><div class="small">${t('Najveća kategorija rashoda — {0}% svih rashoda ({1}).', topCatShare.toFixed(0), fmt(catRows[0][1]))}</div></div>`);
      if(biggestExpense) cards.push(`<div class="insight-card"><div class="big">${fmt(biggestExpense.amount)}</div><div class="small">${t('Najveći pojedinačni trošak — "{0}" ({1}).', escapeHtml(biggestExpense.desc), parseLocalDate(biggestExpense.date).toLocaleDateString(LOCALE,{day:'2-digit',month:'2-digit',year:'numeric'}))}</div></div>`);
      if(prevEntries.length && prevExpense > 0){
        const expDiff = ((expense-prevExpense)/prevExpense*100);
        cards.push(`<div class="insight-card"><div class="big">${expDiff>=0?'+':''}${expDiff.toFixed(0)}%</div><div class="small">${t('Rashodi u odnosu na {0}. godinu.', prevYear)}</div></div>`);
      }
      cards.push(`<div class="insight-card"><div class="big">${rangeEntries.length}</div><div class="small">Ukupno unetih stavki (prihoda i rashoda) ove godine.</div></div>`);
      yearRecapHtml = `<div class="report-section-title">Godina u brojkama</div>${cards.join('')}`;
    }

    preview.innerHTML = `
      <div class="report-title">${t('Izveštaj — {0}', escapeHtml(label))}</div>
      <div class="report-sub">${t('Generisano:')} ${new Date().toLocaleDateString(LOCALE,{day:'2-digit',month:'2-digit',year:'numeric'})}</div>
      <div class="report-grid">
        <div class="cell"><div class="label">PRIHODI</div><div class="value" style="color:var(--pos-text);">${fmt(income)}</div></div>
        <div class="cell"><div class="label">RASHODI</div><div class="value" style="color:var(--rust-text);">${fmt(expense)}</div></div>
        <div class="cell"><div class="label">NA ČEKANJU</div><div class="value" style="color:var(--gold-text);">${fmt(pending)}</div></div>
        <div class="cell"><div class="label">SALDO</div><div class="value">${fmt(balance)}</div></div>
      </div>
      ${yearRecapHtml}
      <div class="report-section-title">Rashodi po kategorijama</div>
      ${catRows.length ? `<div class="table-scroll"><table><thead><tr><th>Kategorija</th><th style="text-align:right;">Iznos</th></tr></thead><tbody>
        ${catRows.map(([cat,val])=>`<tr><td>${escapeHtml(cat)}</td><td class="amount">${fmt(val)}</td></tr>`).join('')}
      </tbody></table></div>` : '<div class="empty">Nema rashoda u ovom periodu.</div>'}
      <div class="report-section-title">Sve stavke</div>
      ${listRows.length ? `<div class="table-scroll"><table><thead><tr><th>Datum</th><th>Opis</th><th>Kategorija</th><th>Tip</th><th style="text-align:right;">Iznos</th></tr></thead><tbody>
        ${listRows.map(e=>{
          const d = parseLocalDate(e.date).toLocaleDateString(LOCALE,{day:'2-digit',month:'2-digit',year:'numeric'});
          const sign = e.type==='income' ? '+' : '−';
          const pendingNote = (e.type==='expense' && !isExpensePaid(e)) ? ' (na čekanju)' : '';
          const spreadNote = e.fullAmount ? t(' (deo od {0}, {1})', fmt(e.fullAmount), spreadLabel(e)) : '';
          return `<tr><td>${d}</td><td>${escapeHtml(e.desc)}${spreadNote}</td><td>${escapeHtml(e.category)}</td><td>${t(e.type==='income'?'Prihod':'Rashod')}${pendingNote ? ' ' + t('(na čekanju)') : ''}</td><td class="amount ${e.type}">${sign} ${fmt(e.amount)}</td></tr>`;
        }).join('')}
      </tbody></table></div>` : '<div class="empty">Nema stavki u ovom periodu.</div>'}
    `;
  }
  document.getElementById('reportScope').addEventListener('change', renderReport);
  document.getElementById('reportMonth').addEventListener('change', renderReport);
  document.getElementById('reportYear').addEventListener('change', renderReport);
  document.getElementById('printReportBtn').addEventListener('click', ()=> window.print());

  // ---- CSV export ----
  document.getElementById('exportBtn').addEventListener('click', ()=>{
    const rows = [['Datum','Opis','Kategorija','Tip','Iznos','Plaćeno','Oznake']];
    entries.filter(e=> e.type === 'income' || e.type === 'expense').forEach(e=> rows.push([e.date, e.desc, e.category, e.type, e.amount.toFixed(0), e.type==='expense' ? (isExpensePaid(e)?'da':'ne') : '', (e.tags||[]).join(', ')]));
    const csv = rows.map(r=> r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], {type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'budzet-' + toISODateLocal(new Date()) + '.csv'; a.click();
    URL.revokeObjectURL(url);
  });

