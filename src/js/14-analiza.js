  // ---- Analiza potrosnje (Izvestaji → Analiza) ----
  // Sva racunanja su u budzet-core.js (C.categoryBreakdown, C.savingsSummary...); ovde je samo crtanje.
  const analizaState = { month: null, n: 6, cat: null, open: new Set(), showAll: new Set(), whatIf: 10 };
  const analizaPeriodTxt = n => n === 3 ? t('3 meseca') : n === 12 ? t('12 meseci') : t('6 meseci');
  function analizaMonthOptions(){
    const cur = currentMonthKey();
    const first = C.firstExpenseMonth(entries) || cur;
    return C.monthRange(first < cur ? first : cur, cur).reverse();
  }
  function renderAnaliza(){
    const months = analizaMonthOptions();
    if(!analizaState.month || !months.includes(analizaState.month)) analizaState.month = months[0];
    const month = analizaState.month;
    const sel = document.getElementById('analizaMonth');
    sel.innerHTML = months.map(m=> `<option value="${m}"${m === month ? ' selected' : ''}>${monthYearLabelSr(m)}</option>`).join('');
    document.querySelectorAll('.analiza-period-btn').forEach(b=> b.classList.toggle('active', Number(b.dataset.n) === analizaState.n));
    const b = C.categoryBreakdown(entries, month, analizaState.n);
    analizaState.enough = b.enough;
    const sum = document.getElementById('analizaSummary');
    sum.dataset.n = String(analizaState.n);
    if(b.total <= 0) sum.textContent = t('{0} — {1}', monthYearLabelSr(month), t('Nema plaćenih troškova u ovom mesecu'));
    else if(!b.enough) sum.textContent = t('{0} — {1}', monthYearLabelSr(month), fmt(b.total)) + ' · ' + t('Za poređenje su potrebna bar 2 meseca podataka');
    else {
      const pct = b.avg > 0 ? Math.round((b.total - b.avg) / b.avg * 100) : 0;
      sum.textContent = t('{0} — {1} · prosek ({2}) {3} · {4}', monthYearLabelSr(month), fmt(b.total), analizaPeriodTxt(analizaState.n), fmt(b.avg), (pct > 0 ? '+' : '') + pct + '%');
    }
    if(month === currentMonthKey()) sum.textContent += t(' · mesec još traje (dan {0} od {1})', new Date().getDate(), C.daysInMonth(month));
    renderAnalizaWhere(b);
    renderAnalizaTrend(b);
    renderAnalizaFixed(month);
    renderAnalizaSave(month);
  }
  function renderAnalizaWhere(b){
    const el = document.getElementById('analizaWhereList');
    if(!b.rows.length){ el.innerHTML = `<div class="empty">${t('Nema plaćenih troškova u ovom mesecu')}</div>`; return; }
    const curMonth = b.month === currentMonthKey();
    el.innerHTML = b.rows.map(r=>{
      const share = b.total > 0 ? Math.round(r.total / b.total * 100) : 0;
      const color = catColorFor(r.cat, Math.max(0, expenseCats.indexOf(r.cat)));
      const hideBadge = r.pct == null || r.pct === 0 || (curMonth && r.diff < 0);
      const diff = hideBadge ? '' : `<span class="analiza-diff ${r.diff > 0 ? 'up' : 'down'}">${r.diff > 0 ? '▲' : '▼'} ${Math.abs(r.pct)}%</span>`;
      const open = analizaState.open.has(r.cat);
      let groups = '';
      if(open){
        const all = C.groupByDesc(entries, [b.month], e=> e.category === r.cat);
        const shown = analizaState.showAll.has(r.cat) ? all : all.slice(0, 5);
        groups = `<table class="analiza-groups">${shown.map(g=> `<tr>
            <td${g.label === C.NO_DESC ? '' : ' translate="no"'}>${escapeHtml(g.label)}</td>
            <td class="muted">${t('{0}×', g.count)} · ${t('prosečno {0}', fmt(g.avgPurchase))}</td>
            <td class="num">${fmt(g.total)}</td></tr>`).join('')}</table>
          ${all.length > 5 ? `<button class="btn-link analiza-more" data-cat="${escapeHtml(r.cat)}">${analizaState.showAll.has(r.cat) ? t('prikaži manje') : t('prikaži sve')}</button>` : ''}`;
        const bought = C.purchasedItemStats(entries, [b.month], r.cat, shopping.items).slice(0, 8);
        if(bought.length) groups += `<div class="analiza-bought"><div class="analiza-bought-title">${t('Kupljene stvari')}</div>${bought.map(s=>
          `<span class="analiza-bought-item"><span translate="no">${escapeHtml(s.name)}</span> ×${s.count}${s.amount != null ? ' · ~' + fmt(s.amount) : ''}</span>`).join('')}</div>`;
      }
      return `<div class="analiza-cat${open ? ' open' : ''}">
        <button class="analiza-cat-head" data-cat="${escapeHtml(r.cat)}">
          <span class="name">${catTagHtml(r.cat)}</span>
          <span class="analiza-bar"><i style="width:${share}%; background:${color};"></i></span>
          <span class="amt">${fmt(r.total)}</span>${diff}
        </button>${groups}</div>`;
    }).join('');
    el.querySelectorAll('.analiza-cat-head').forEach(btn=> btn.addEventListener('click', ()=>{
      const c = btn.dataset.cat;
      analizaState.open.has(c) ? analizaState.open.delete(c) : analizaState.open.add(c);
      renderAnalizaWhere(b);
    }));
    el.querySelectorAll('.analiza-more').forEach(btn=> btn.addEventListener('click', ()=>{
      const c = btn.dataset.cat;
      analizaState.showAll.has(c) ? analizaState.showAll.delete(c) : analizaState.showAll.add(c);
      renderAnalizaWhere(b);
    }));
  }
  function renderAnalizaTrend(b){
    const sel = document.getElementById('analizaTrendCat');
    const svg = document.getElementById('analizaTrendChart');
    const note = document.getElementById('analizaTrendNote');
    const cats = [...new Set(entries.filter(isPaidExpense).map(e=> e.category))];
    if(!cats.length){ sel.innerHTML = ''; svg.innerHTML = ''; note.textContent = t('Nema podataka.'); return; }
    if(!analizaState.cat || !cats.includes(analizaState.cat)) analizaState.cat = (b.rows[0] || {}).cat || cats[0];
    const cat = analizaState.cat;
    sel.innerHTML = cats.map(c=> `<option value="${escapeHtml(c)}"${c === cat ? ' selected' : ''} translate="no">${escapeHtml(c)}</option>`).join('');
    const cols = b.months.concat([b.month]);
    const vals = cols.map(m=> sumMonth(m, e=> isPaidExpense(e) && e.category === cat));
    const st = C.periodStats(entries, b.months, e=> e.category === cat);
    const W = 760, H = 200, padL = 10, padR = 10, padT = 15, padB = 30;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const max = Math.max(1, ...vals, st.avg);
    const slot = plotW / cols.length, bw = Math.min(46, slot * 0.6);
    const yFor = v => padT + plotH - v / max * plotH;
    const bars = cols.map((m, i)=>{
      const x = padL + i * slot + (slot - bw) / 2, y = yFor(vals[i]);
      const [yy, mo] = m.split('-');
      const label = new Date(yy, mo - 1, 1).toLocaleDateString(LOCALE, { month: 'short' }).replace('.', '');
      const cls = m === b.month ? 'analiza-bar-sel' : 'analiza-bar-col';
      return `<rect class="${cls}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${(padT + plotH - y).toFixed(1)}" rx="3"><title>${escapeHtml(monthYearLabelSr(m))}: ${fmt(vals[i])}</title></rect>
        <text x="${(x + bw / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="var(--ink-soft)">${label}</text>`;
    }).join('');
    const avgLine = st.enough ? `<line x1="${padL}" x2="${W - padR}" y1="${yFor(st.avg).toFixed(1)}" y2="${yFor(st.avg).toFixed(1)}" stroke="var(--ink-soft)" stroke-width="1.5" stroke-dasharray="5 4"/>` : '';
    svg.innerHTML = bars + avgLine;
    // poruka o 2 meseca stoji samo u sazetku na vrhu
    note.textContent = st.enough ? t('Isprekidana linija: prosek {0} ({1})', fmt(st.avg), analizaPeriodTxt(analizaState.n)) : '';
  }
  function renderAnalizaFixed(month){
    const s = C.splitFixedVariable(entries, month, fixedCategories);
    document.getElementById('analizaFixedCurrentHint').style.display = month === currentMonthKey() ? '' : 'none';
    const bar = document.getElementById('analizaFixedBar');
    bar.innerHTML = s.total <= 0 ? `<div class="empty">${t('Nema plaćenih troškova u ovom mesecu')}</div>` : `
      <div class="analiza-split"><i class="fixed" style="width:${s.fixedPct}%"></i><i class="variable" style="width:${100 - s.fixedPct}%"></i></div>
      <div class="analiza-split-legend">
        <span><i class="swatch fixed"></i>${t('Fiksno: {0} ({1}%)', fmt(s.fixed), s.fixedPct)}</span>
        <span><i class="swatch variable"></i>${t('Promenljivo: {0} ({1}%)', fmt(s.variable), 100 - s.fixedPct)}</span>
      </div>`;
    document.getElementById('analizaFixedCats').innerHTML = expenseCats.map(c=> `<label class="paid-checkbox-label">
        <input type="checkbox" data-cat="${escapeHtml(c)}"${fixedCategories.includes(c) ? ' checked' : ''}> ${catTagHtml(c)}</label>`).join('');
    document.querySelectorAll('#analizaFixedCats input[type="checkbox"]').forEach(box=> box.addEventListener('change', ()=>{
      setCategoryFixed(box.dataset.cat, box.checked);
      renderAnaliza();
    }));
  }
  function renderAnalizaSave(month){
    const s = C.savingsSummary(entries, recurring, fixedCategories, month, analizaState.n);
    const parts = [];
    if(s.above.length) parts.push(`<div class="analiza-above"><h3>${t('Iznad proseka · ~{0}', fmt(s.aboveTotal))}</h3>${s.above.map(r=> `<div class="analiza-save-row">
        <span>${catTagHtml(r.cat)}</span><span class="muted">${t('{0} naspram proseka {1}', fmt(r.total), fmt(r.avg))}</span><b>+${fmt(r.diff)}</b></div>`).join('')}</div>`);
    if(s.small.length) parts.push(`<div class="analiza-small"><h3>${t('Sitni česti troškovi')}</h3>${s.small.map(g=> `<div class="analiza-save-row">
        <span${g.label === C.NO_DESC ? '' : ' translate="no"'}>${escapeHtml(g.label)}</span><span class="muted">${t('~{0}× mesečno · prosečno {1}', Math.round(g.perMonth), fmt(g.avgPurchase))}</span><b>${t('{0} mesečno · {1} godišnje', fmt(g.monthly), fmt(g.yearly))}</b></div>`).join('')}</div>`);
    if(s.subscriptions.length) parts.push(`<div class="analiza-subs"><h3>${t('Pretplate i ponavljajuće')}</h3>${s.subscriptions.map(r=> `<div class="analiza-save-row">
        <span translate="no">${escapeHtml(r.desc)}</span><span class="muted">${r.creep ? `<span class="analiza-creep">${t('↑ poskupelo {0}%', r.creepPct)}</span>` : ''}</span><b>${t('{0} godišnje', fmt(r.yearly))}</b></div>`).join('')}</div>`);
    if(s.enough && !parts.length) parts.push(`<div class="empty">${t('Nema ništa upadljivo — potrošnja je u okviru proseka.')}</div>`);
    document.getElementById('analizaSaveBody').innerHTML = parts.join('');
    renderAnalizaWhatIf(month);
  }
  function renderAnalizaWhatIf(month){
    const slider = document.getElementById('analizaWhatIf');
    slider.value = String(analizaState.whatIf);
    document.getElementById('analizaWhatIfLabel').innerHTML = t('Šta ako smanjim promenljive troškove za {0}', `<b>${analizaState.whatIf}%</b>`);
    const avg = C.variableAverage(entries, month, analizaState.n, fixedCategories);
    const w = C.whatIf(avg, analizaState.whatIf, goals, new Date());
    const res = document.getElementById('analizaWhatIfResult');
    const act = document.getElementById('analizaWhatIfAction');
    act.innerHTML = '';
    slider.closest('.analiza-whatif').style.display = analizaState.enough === false ? 'none' : '';
    if(avg <= 0){ res.textContent = t('Nema promenljivih troškova za poređenje.'); return; }
    res.innerHTML = t('Ušteda: {0} mesečno · {1} godišnje', fmt(w.monthly), `<b>${fmt(w.yearly)}</b>`) +
      (w.goal ? `<div class="analiza-goal">${t('Cilj „{0}“ stižeš {1} ranije', escapeHtml(w.goal.name), monthsTxt(w.goal.sooner))}</div>` : '');
    const amount = C.planAmount(w.monthly);
    if(amount <= 0) return;
    if(!activeGoals().length){
      act.innerHTML = `<span class="muted">${t('Napravi cilj da bi ušteda išla u njega')}</span> <button class="btn-link" id="analizaWhatIfNewGoal">${t('Ciljevi')}</button>`;
      document.getElementById('analizaWhatIfNewGoal').addEventListener('click', ()=> showScreen('ciljevi'));
      return;
    }
    act.innerHTML = `<button class="btn-secondary" id="analizaWhatIfPlan">${t('Uplaćuj {0} mesečno u cilj…', fmt(amount))}</button>`;
    document.getElementById('analizaWhatIfPlan').addEventListener('click', ()=> openWhatIfPlan(amount, w.goal && w.goal.id));
  }
  const activeGoals = () => goals.filter(g=> g.current < g.target);
  // "Sta ako" -> mesecna uplata u cilj; plan uvek krece od sledeceg meseca (ovaj je vec u toku).
  function openWhatIfPlan(amount, goalId){
    const list = activeGoals();
    const pre = list.find(g=> g.id === goalId) || list[0];
    const next = C.addMonths(currentMonthKey(), 1);
    openEditModal(t('Mesečna uplata u cilj od {0}', monthYearLabelSr(next)), [
      {key:'goalName', label:'Cilj (postojeća mesečna uplata biće zamenjena)', type:'select', value: pre.name, options: list.map(g=> g.name)},
      {key:'amount', label:'Iznos mesečno (RSD)', type:'number', value: amount},
      {key:'day', label:'Dan u mesecu', type:'number', value: 1},
    ], vals=>{
      const g = list.find(x=> x.name === vals.goalName);
      if(!g || isNaN(vals.amount) || vals.amount <= 0) return;
      const prev = g.monthly;
      setGoalPlan(g, vals.amount, vals.day, true);
      saveGoals(); renderAll();
      showUndoToast(t('Mesečna uplata {0} u cilj „{1}“ od {2}', fmt(g.monthly.amount), g.name, monthYearLabelSr(g.monthly.since)), ()=>{
        if(prev) g.monthly = prev; else delete g.monthly;
        saveGoals(); renderAll();
      });
    });
  }
  document.getElementById('analizaWhatIf').addEventListener('input', e=>{ analizaState.whatIf = Number(e.target.value) || 0; renderAnalizaWhatIf(analizaState.month); });
  function openAnaliza(section, month){
    analizaState.month = month || currentMonthKey();
    analizaState.n = 6;
    showScreen('analiza');
    renderScreen('analiza');
    if(section === 'save') setTimeout(()=> document.getElementById('analizaSave').scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  }
  document.getElementById('analizaMonth').addEventListener('change', e=>{ analizaState.month = e.target.value; renderAnaliza(); });
  document.getElementById('analizaTrendCat').addEventListener('change', e=>{ analizaState.cat = e.target.value; renderAnaliza(); });
  document.querySelectorAll('.analiza-period-btn').forEach(btn=> btn.addEventListener('click', ()=>{ analizaState.n = Number(btn.dataset.n); renderAnaliza(); }));

