  // ---- Kalendar meseca (kompaktan): boja = potrosnja dana, tacke = prihod/rashod/dospeva ----
  function renderMonthCalendar(){
    const container = document.getElementById('monthCalendarGrid');
    const mKey = viewMonth;
    const [year, month] = [Number(mKey.slice(0,4)), Number(mKey.slice(5,7)) - 1];
    const daysInMonth = C.daysInMonth(mKey);
    const firstDow = (new Date(year, month, 1).getDay() + 6) % 7;
    const todayNum = mKey === currentMonthKey() ? new Date().getDate() : -1;
    document.getElementById('monthCalendarTitle').textContent = t('Kalendar — {0}', monthYearLabelSr(mKey));
    const days = [];
    for(let day=1; day<=daysInMonth; day++){
      const dateStr = mKey + '-' + String(day).padStart(2,'0');
      const dayEntries = entries.filter(e=>e.date===dateStr && !isTransfer(e));
      const spent = dayEntries.filter(isPaidExpense).reduce((s,e)=>s+e.amount,0);
      const earned = dayEntries.filter(isIncome).reduce((s,e)=>s+e.amount,0);
      const due = recurring.filter(r=> C.effectiveDay(r.day, mKey)===day && isDueThisMonth(r, mKey) && !isPaid(r,mKey) && !isSkipped(r,mKey));
      days.push({ day, dateStr, dayEntries, spent, earned, due });
    }
    const maxSpent = Math.max(1, ...days.map(d=>d.spent));
    const label = d => {
      const parts = [parseLocalDate(d.dateStr).toLocaleDateString(LOCALE, {weekday:'long', day:'numeric', month:'long'})];
      if(d.spent) parts.push(t('rashodi {0}', fmt(d.spent)));
      if(d.earned) parts.push(t('prihodi {0}', fmt(d.earned)));
      if(d.due.length) parts.push(t('dospeva: {0}', d.due.map(r=>r.desc).join(', ')));
      if(!d.spent && !d.earned && !d.due.length) parts.push(t('nema stavki'));
      return parts.join(' · ');
    };
    let html = (I18N.lang === 'en' ? ['M','T','W','T','F','S','S'] : ['P','U','S','Č','P','S','N']).map(w=>`<div class="mcal-weekday">${w}</div>`).join('');
    for(let i=0;i<firstDow;i++) html += '<div></div>';
    days.forEach(d=>{
      const pct = d.spent > 0 ? Math.round(14 + (d.spent / maxSpent) * 56) : 0;
      const bg = pct ? ` style="background: color-mix(in srgb, var(--accent) ${pct}%, var(--fill));"` : '';
      const dots = (d.earned?'<i class="mcal-dot income"></i>':'') + (d.dayEntries.some(e=>e.type==='expense')?'<i class="mcal-dot expense"></i>':'') + (d.due.length?'<i class="mcal-dot due"></i>':'');
      html += `<button type="button" class="mcal-day ${d.day===todayNum?'today':''}" data-date="${d.dateStr}" title="${escapeHtml(label(d))}" aria-label="${escapeHtml(label(d))}"${bg}>
        <span class="mcal-daynum">${d.day}</span><span class="mcal-dots">${dots}</span></button>`;
    });
    container.innerHTML = html;
    // Broj dana dobija bolji od dva kontrasta na stvarno iscrtanoj pozadini
    container.querySelectorAll('.mcal-day[style]').forEach(el=>{
      const c = bestTextColorOn(getComputedStyle(el).backgroundColor);
      el.querySelector('.mcal-daynum').style.color = c;
    });
    container.querySelectorAll('.mcal-day').forEach(btn=> btn.addEventListener('click', ()=> openDayDetail(btn.dataset.date)));
  }

  let currentDayDetailDate = null;
  function openDayDetail(dateStr){
    currentDayDetailDate = dateStr;
    const overlay = document.getElementById('dayDetailOverlay');
    const label = parseLocalDate(dateStr).toLocaleDateString(LOCALE, {weekday:'long', day:'2-digit', month:'long', year:'numeric'});
    document.getElementById('dayDetailTitle').textContent = label;
    document.getElementById('dayQuickDesc').value = '';
    document.getElementById('dayQuickAmount').value = '';
    renderDayDetailList();
    dayDetailLastFocus = document.activeElement;
    overlay.classList.add('show');
    setTimeout(()=> document.getElementById('dayQuickDesc').focus(), 0);
  }
  function closeDayDetail(){
    document.getElementById('dayDetailOverlay').classList.remove('show');
    if(dayDetailLastFocus && typeof dayDetailLastFocus.focus === 'function') dayDetailLastFocus.focus();
    dayDetailLastFocus = null;
  }
  let dayDetailLastFocus = null;
  function renderDayDetailList(){
    const list = document.getElementById('dayDetailList');
    const dayEntries = entries.filter(e=>e.date===currentDayDetailDate && !isTransfer(e)).sort((a,b)=>a.desc.localeCompare(b.desc));
    list.innerHTML = dayEntries.map(e=>`<li data-row-id="${e.id}">
      <span class="name">${escapeHtml(e.desc)} ${catTagHtml(e.category)}</span>
      <span style="display:flex; align-items:center; gap:0.6em;">
        <span class="amount ${e.type}">${e.type==='income'?'+':'−'} ${fmt(e.amount)}</span>
        <button class="del-btn" data-id="${e.id}" title="Obriši">✕</button>
      </span>
    </li>`).join('') || '<li class="empty">Nema stavki ovog dana.</li>';
    wireDeleteButton(list, {
      rowSelector: 'li',
      find: id => entries.find(e=>e.id === id),
      onDelete: (entry, b)=>{ entries = entries.filter(e=>e.id !== b.dataset.id); unmarkRecurringEntry(b.dataset.id); saveEntries(); renderDayDetailList(); },
      undoLabel: entry => t('Obrisana stavka: "{0}"', entry.desc),
      onUndo: entry => { entries.push(entry); remarkRecurringEntry(entry.id); saveEntries(); renderDayDetailList(); }
    });
  }
  document.getElementById('dayQuickAddBtn').addEventListener('click', ()=>{
    const parsed = parseQuickAmount(document.getElementById('dayQuickDesc').value, parseFloat(document.getElementById('dayQuickAmount').value));
    const type = document.getElementById('dayQuickType').value;
    if(!parsed.desc || isNaN(parsed.amount) || parsed.amount <= 0) return;
    const category = type === 'expense' ? (expenseCats[0]||'Ostalo') : (incomeCats[0]||'Ostalo');
    const id = newId();
    entries.push({ id, type, desc: parsed.desc, amount: parsed.amount, category, date: currentDayDetailDate, paid: true, tags: [] });
    newEntryId = id;
    saveEntries(); renderAll(); renderDayDetailList();
    document.getElementById('dayQuickDesc').value = '';
    document.getElementById('dayQuickAmount').value = '';
    document.getElementById('dayQuickDesc').focus();
  });
  document.getElementById('dayDetailCloseBtn').addEventListener('click', closeDayDetail);
  document.getElementById('dayDetailOverlay').addEventListener('click', (e)=>{
    if(e.target.id === 'dayDetailOverlay') closeDayDetail();
  });



  function detectRecurringCandidates(){
    const nonRecurringPaid = entries.filter(e=> e.type==='expense' && isExpensePaid(e) && !e.id.startsWith('rec-'));
    const groups = {};
    nonRecurringPaid.forEach(e=>{
      const key = e.desc.trim().toLowerCase();
      if(!key) return;
      if(!groups[key]) groups[key] = [];
      groups[key].push(e);
    });
    const existingRecurringDescs = new Set(recurring.map(r=>r.desc.trim().toLowerCase()));
    const candidates = [];
    Object.values(groups).forEach(list=>{
      const distinctMonths = new Set(list.map(e=>monthKey(e.date)));
      const key = list[0].desc.trim().toLowerCase();
      if(distinctMonths.size >= 3 && !existingRecurringDescs.has(key)){
        const sorted = list.slice().sort((a,b)=> b.date.localeCompare(a.date));
        const latest = sorted[0];
        candidates.push({ desc: latest.desc, category: latest.category, amount: latest.amount, day: parseLocalDate(latest.date).getDate(), count: list.length });
      }
    });
    return candidates;
  }

  function renderRecurringSuggestions(){
    const el = document.getElementById('recurringSuggestions');
    const candidates = detectRecurringCandidates();
    if(candidates.length === 0){ el.innerHTML = ''; return; }
    el.innerHTML = `<h2 style="margin-top:1.6em;">Predlog</h2>` + candidates.map((c,i)=>`
      <div class="warning-item ok">
        <span class="icon">🔁</span>
        <span class="txt">${t('Trošak <b>{0}</b> se ponovio {1}x — dodati kao ponavljajuću stavku ({2}, dan {3}.)?', escapeHtml(c.desc), c.count, fmt(c.amount), c.day)}
          <button class="btn-secondary" style="margin-left:0.6em; padding:0.3em 0.7em; font-size:0.85em;" data-suggest-idx="${i}">Dodaj</button>
        </span>
      </div>`).join('');
    el.querySelectorAll('[data-suggest-idx]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const c = candidates[btn.dataset.suggestIdx];
        recurring.push({ id: newId(), type:'expense', desc: c.desc, amount: c.amount, category: c.category, day: C.clampRecurringDay(c.day) });
        saveRecurring();
        renderAll();
      });
    });
  }

  function renderDonut(catEntries){
    const svg = document.getElementById('donutChart');
    const legend = document.getElementById('donutLegend');
    const total = catEntries.reduce((s,[,v])=>s+v,0);
    if(total === 0){
      svg.innerHTML = `<circle cx="75" cy="75" r="58" fill="none" stroke="var(--paper-line)" stroke-width="16"/>`;
      legend.innerHTML = '<div class="empty" style="padding:0.5em 0;">Nema podataka.</div>';
      return;
    }
    const r = 58, cx = 75, cy = 75, circumference = 2 * Math.PI * r;
    let offset = 0, arcs = '';
    catEntries.forEach(([cat,val], i)=>{
      const frac = val / total;
      const dash = frac * circumference;
      const color = catColorFor(cat, i);
      // Kategorija koja zauzima ceo krug: pun prsten bez isprekidanosti (crtica sa razmakom 0 se ne iscrtava)
      const dashAttr = frac >= 0.9995 ? '' : `stroke-dasharray="${dash.toFixed(2)} ${(circumference-dash).toFixed(2)}"`;
      arcs += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="16"
        ${dashAttr}
        stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"
        stroke-linecap="butt"><title>${escapeHtml(cat)}: ${fmt(val)}</title></circle>`;
      offset += dash;
    });
    svg.innerHTML = arcs + `
      <text x="${cx}" y="${cy-4}" text-anchor="middle" class="donut-center-label" font-size="10" fill="var(--ink-soft)">UKUPNO</text>
      <text x="${cx}" y="${cy+13}" text-anchor="middle" class="donut-center-label" font-size="12" fill="var(--ink)">${fmt(total)}</text>`;
    legend.innerHTML = catEntries.map(([cat,val], i)=>{
      const pct = ((val/total)*100).toFixed(0);
      const color = catColorFor(cat, i);
      return `<div class="li"><span class="name"><i class="swatch" style="background:${color};"></i>${escapeHtml(cat)}</span><span class="pct">${pct}%</span></div>`;
    }).join('');
  }

  function lastNMonths(n){
    const months = []; const now = new Date();
    for(let i=n-1;i>=0;i--){
      const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
      months.push(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'));
    }
    return months;
  }
  function last6Months(){ return lastNMonths(6); }

  let trendRangeMonths = parseInt(localStorage.getItem('budzet-trend-raspon-v1')) || 6;
  function setTrendRange(n){
    trendRangeMonths = n;
    localStorage.setItem('budzet-trend-raspon-v1', String(n));
    document.querySelectorAll('.trend-range-btn').forEach(b=> b.classList.toggle('active', parseInt(b.dataset.range)===n));
    renderTrend();
  }
  document.querySelectorAll('.trend-range-btn').forEach(btn=>{
    btn.classList.toggle('active', parseInt(btn.dataset.range)===trendRangeMonths);
    btn.addEventListener('click', ()=> setTrendRange(parseInt(btn.dataset.range)));
  });

  function renderTrend(){
    const months = lastNMonths(trendRangeMonths);
    const incomeVals = months.map(m => sumMonth(m, isIncome));
    const expenseVals = months.map(m => sumMonth(m, isPaidExpense));
    const maxVal = Math.max(1, ...incomeVals, ...expenseVals);
    const W = 760, H = 220, padL = 10, padR = 10, padT = 15, padB = 30;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const stepX = plotW / (months.length - 1 || 1);
    const yFor = v => padT + plotH - (v/maxVal)*plotH;
    const xFor = i => padL + i*stepX;
    const pathFor = vals => buildLinePath(vals, xFor, yFor);
    const areaFor = vals => buildAreaPath(vals, xFor, yFor, padT+plotH);
    const gridLines = [0,0.5,1].map(f=>{
      const y = padT + plotH*(1-f);
      return `<line x1="${padL}" y1="${y}" x2="${W-padR}" y2="${y}" stroke="var(--paper-line)" stroke-width="1"/>`;
    }).join('');
    const labels = months.map((m,i)=>{
      const [y,mo] = m.split('-');
      const label = new Date(y,mo-1,1).toLocaleDateString(LOCALE,{month:'short'}).replace('.','');
      return `<text x="${xFor(i).toFixed(1)}" y="${H-8}" text-anchor="middle" font-size="10" fill="var(--ink-soft)" font-family="-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">${label}</text>`;
    }).join('');
    const dotsIncome = incomeVals.map((v,i)=>`<circle class="trend-dot" style="animation-delay:${(0.55+i*0.06).toFixed(2)}s" cx="${xFor(i).toFixed(1)}" cy="${yFor(v).toFixed(1)}" r="3" fill="var(--pos)"><title>${fmt(v)}</title></circle>`).join('');
    const dotsExpense = expenseVals.map((v,i)=>`<circle class="trend-dot" style="animation-delay:${(0.55+i*0.06).toFixed(2)}s" cx="${xFor(i).toFixed(1)}" cy="${yFor(v).toFixed(1)}" r="3" fill="var(--rust)"><title>${fmt(v)}</title></circle>`).join('');
    document.getElementById('trendChart').innerHTML = `
      <defs>
        <linearGradient id="gradIncome" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--pos)" stop-opacity="0.2"/>
          <stop offset="100%" stop-color="var(--pos)" stop-opacity="0"/>
        </linearGradient>
        <linearGradient id="gradExpense" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--rust)" stop-opacity="0.18"/>
          <stop offset="100%" stop-color="var(--rust)" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${gridLines}
      <path class="area-fade" d="${areaFor(incomeVals)}" fill="url(#gradIncome)"/>
      <path class="area-fade" d="${areaFor(expenseVals)}" fill="url(#gradExpense)"/>
      <path class="line-draw" d="${pathFor(incomeVals)}" fill="none" stroke="var(--pos)" stroke-width="2"/>
      <path class="line-draw" d="${pathFor(expenseVals)}" fill="none" stroke="var(--rust)" stroke-width="2"/>
      ${dotsIncome}${dotsExpense}
      ${labels}
    `;
    document.querySelectorAll('#trendChart .line-draw').forEach(path=>{
      const len = path.getTotalLength();
      path.style.strokeDasharray = len;
      path.style.strokeDashoffset = len;
      requestAnimationFrame(()=>{
        requestAnimationFrame(()=>{
          path.style.transition = 'stroke-dashoffset .9s ease';
          path.style.strokeDashoffset = '0';
        });
      });
    });
  }

  function balanceThroughMonth(m){
    const income = entries.filter(e=>e.type==='income' && monthKey(e.date) <= m).reduce((s,e)=>s+e.amount,0);
    const expense = entries.filter(e=>e.type==='expense' && isExpensePaid(e) && monthKey(e.date) <= m).reduce((s,e)=>s+e.amount,0);
    return income - expense;
  }

  function renderBalanceChart(){
    const months = lastNMonths(trendRangeMonths);
    const vals = months.map(balanceThroughMonth);
    const maxVal = Math.max(1, ...vals);
    const minVal = Math.min(0, ...vals);
    const range = (maxVal - minVal) || 1;
    const W = 760, H = 130, padL = 10, padR = 10, padT = 12, padB = 26;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const stepX = plotW / (months.length - 1 || 1);
    const yFor = v => padT + plotH - ((v - minVal)/range)*plotH;
    const xFor = i => padL + i*stepX;
    const zeroY = yFor(0);
    const lineColor = vals[vals.length-1] >= 0 ? 'var(--ledger)' : 'var(--rust)';
    const pathFor = () => buildLinePath(vals, xFor, yFor);
    const areaFor = () => buildAreaPath(vals, xFor, yFor, zeroY);
    const zeroLine = minVal < 0 ? `<line x1="${padL}" y1="${zeroY.toFixed(1)}" x2="${W-padR}" y2="${zeroY.toFixed(1)}" stroke="var(--paper-line)" stroke-width="1" stroke-dasharray="3 3"/>` : '';
    const labels = months.map((m,i)=>{
      const [y,mo] = m.split('-');
      const label = new Date(y,mo-1,1).toLocaleDateString(LOCALE,{month:'short'}).replace('.','');
      return `<text x="${xFor(i).toFixed(1)}" y="${H-8}" text-anchor="middle" font-size="10" fill="var(--ink-soft)" font-family="-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">${label}</text>`;
    }).join('');
    const dots = vals.map((v,i)=>`<circle class="trend-dot" style="animation-delay:${(0.55+i*0.06).toFixed(2)}s" cx="${xFor(i).toFixed(1)}" cy="${yFor(v).toFixed(1)}" r="3" fill="${lineColor}"><title>${fmt(v)}</title></circle>`).join('');
    document.getElementById('balanceChart').innerHTML = `
      <defs>
        <linearGradient id="gradBalance" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${lineColor}" stop-opacity="0.2"/>
          <stop offset="100%" stop-color="${lineColor}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${zeroLine}
      <path class="area-fade" d="${areaFor()}" fill="url(#gradBalance)"/>
      <path class="line-draw" d="${pathFor()}" fill="none" stroke="${lineColor}" stroke-width="2"/>
      ${dots}
      ${labels}
    `;
    document.querySelectorAll('#balanceChart .line-draw').forEach(path=>{
      const len = path.getTotalLength();
      path.style.strokeDasharray = len;
      path.style.strokeDashoffset = len;
      requestAnimationFrame(()=>{
        requestAnimationFrame(()=>{
          path.style.transition = 'stroke-dashoffset .9s ease';
          path.style.strokeDashoffset = '0';
        });
      });
    });
  }

