  // ---- Notifikacije (kasna placanja) ----
  // Jedna notifikacija po stavci PO DANU (tag + dnevni log) da ne spamuje pri svakom otvaranju app-a.
  const NOTIFIED_KEY = 'budzet-notif-poslato-v1';
  let notifiedLog = JSON.parse(localStorage.getItem(NOTIFIED_KEY) || 'null') || { date: '', keys: [] };
  const saveNotifiedLog = () => localStorage.setItem(NOTIFIED_KEY, JSON.stringify(notifiedLog));
  function sendNotificationOnce(key, title, body, target){
    const todayStr = toISODateLocal(new Date());
    if(notifiedLog.date !== todayStr){ notifiedLog = { date: todayStr, keys: [] }; }
    if(notifiedLog.keys.includes(key)) return;
    notifiedLog.keys.push(key);
    saveNotifiedLog();
    try{
      const n = new Notification(title, { body, tag: key });
      n.onclick = ()=>{ if(window.desktop) window.desktop.showWindow(); openNotificationTarget(target); };
    } catch(e){ /* Notification API nedostupan/blokiran - ignorisano */ }
  }
  // Klik na obavestenje: otvori ekran, skroluj do reda i kratko ga istakni (red mozda vise ne postoji)
  function openNotificationTarget(target){
    if(!target || !target.screen) return;
    showScreen(target.screen);
    if(!target.rowId) return;
    setTimeout(()=>{
      const el = document.querySelector(`#screen-${target.screen} [data-row-id="${CSS.escape(target.rowId)}"]`);
      if(!el) return;
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.classList.remove('row-flash'); void el.offsetWidth; el.classList.add('row-flash');
      setTimeout(()=> el.classList.remove('row-flash'), 1600);
    }, 60);
  }
  if(IS_TEST) window.__openNotificationTarget = openNotificationTarget;
  function checkAndSendNotifications(){
    if(!('Notification' in window) || Notification.permission !== 'granted') return;
    runDocNotifications();
    const todayDay = new Date().getDate();
    const curMonthKey = currentMonthKey();
    recurring.forEach(r=>{
      if(!isDueThisMonth(r, curMonthKey) || isPaid(r, curMonthKey) || isSkipped(r, curMonthKey)) return;
      const diff = dueDayNow(r) - todayDay;
      if(diff < 0){
        const verb = r.type === 'income' ? 'naplaćeno' : 'plaćeno';
        sendNotificationOnce(`rec-${r.id}-${curMonthKey}`, t('Kasni plaćanje'), t(r.type === 'income' ? '{0} je trebalo da bude naplaćeno pre {1}.' : '{0} je trebalo da bude plaćeno pre {1}.', r.desc, daysTxt(Math.abs(diff))), { screen: 'ponavljajuce', rowId: r.id });
      } else if(diff <= 1 && r.type === 'expense' && !r.autoPay){
        // Podsetnik unapred: dan pre i na dan dospeca
        sendNotificationOnce(`due-${r.id}-${curMonthKey}-${diff}`, diff === 0 ? t('Danas dospeva') : t('Sutra dospeva'), `${r.desc} — ${fmt(r.debtId ? suggestedPayAmount(r) : r.amount)}.`, { screen: 'ponavljajuce', rowId: r.id });
      }
    });
    const todayStr = toISODateLocal(new Date());
    debts.forEach(d=>{
      const remaining = debtRemaining(d);
      if(remaining <= 0 || !d.due || d.due >= todayStr) return;
      sendNotificationOnce(`debt-${d.id}-${d.due}`, t('Dug/pozajmica kasni'), t('{0}: rok za {1} je prošao.', d.person, fmt(remaining)), { screen: 'dugovi', rowId: d.id });
    });
  }
  document.getElementById('enableNotifBtn').addEventListener('click', async ()=>{
    const statusEl = document.getElementById('notifStatus');
    if(!('Notification' in window)){ statusEl.textContent = 'Ovaj browser ne podržava notifikacije.'; return; }
    const perm = await Notification.requestPermission();
    if(perm === 'granted'){ statusEl.textContent = 'Notifikacije su omogućene.'; checkAndSendNotifications(); }
    else statusEl.textContent = 'Dozvola nije data.';
  });
  if('Notification' in window && Notification.permission === 'granted') checkAndSendNotifications();
  setInterval(checkAndSendNotifications, 60*60*1000);

  // ---- Finansijsko zdravlje ----
  // Svodi vec postojece signale (isti kao u renderWarnings/renderInsights — stopa stednje, disciplina
  // limita/mesecnog budzeta, urednost dugova, progres ciljeva, tacnost placanja ponavljajucih stavki)
  // u jedan skor 0-100 sa ponderima, i pamti istoriju po mesecima da bi se vidio trend kroz vreme.
  function computeHealthScore(){
    const mKey = currentMonthKey();
    const todayStr = toISODateLocal(new Date());
    const todayDay = new Date().getDate();

    const { income: thisInc, expense: thisExp, byCat: monthByCat } = monthTotals(mKey);
    const savingsPct = thisInc > 0 ? ((thisInc-thisExp)/thisInc*100) : 0;
    const savingsScore = Math.max(0, Math.min(100, 50 + savingsPct*2.5));

    const catTotals = monthByCat;
    const withLimits = Object.keys(catTotals).filter(cat=>limits[cat]);
    const catScore = withLimits.length ? (withLimits.filter(cat=>catTotals[cat] <= limits[cat]).length / withLimits.length * 100) : null;
    const budgetCapScore = monthlyBudget > 0 ? (thisExp <= monthlyBudget ? 100 : Math.max(0, 100 - (thisExp-monthlyBudget)/monthlyBudget*100)) : null;
    const budgetParts = [catScore, budgetCapScore].filter(v=>v!=null);
    const budgetScore = budgetParts.length ? budgetParts.reduce((s,v)=>s+v,0)/budgetParts.length : 100;

    const activeDebts = debts.filter(d => debtRemaining(d) > 0);
    const overdueDebts = activeDebts.filter(d => d.due && d.due < todayStr);
    const debtScore = activeDebts.length ? Math.max(0, 100 - (overdueDebts.length/activeDebts.length*100)) : 100;

    const goalScore = goals.length ? (goals.reduce((s,g)=> s + Math.min(100, g.target>0 ? (g.current/g.target*100) : 0), 0) / goals.length) : 100;

    const dueRecurring = recurring.filter(r => isDueThisMonth(r, mKey));
    const pendingRecurring = dueRecurring.filter(r => !isPaid(r, mKey) && !isSkipped(r, mKey));
    const overdueRecurring = pendingRecurring.filter(r => dueDayNow(r) < todayDay);
    const recurringScore = dueRecurring.length ? Math.max(0, 100 - (overdueRecurring.length/dueRecurring.length*100)) : 100;

    const breakdown = { savings: savingsScore, budget: budgetScore, debts: debtScore, goals: goalScore, recurring: recurringScore };
    const score = Math.round(savingsScore*0.30 + budgetScore*0.25 + debtScore*0.20 + goalScore*0.15 + recurringScore*0.10);
    return { score, breakdown };
  }

  function upsertHealthSnapshot(){
    const mKey = currentMonthKey();
    const { score, breakdown } = computeHealthScore();
    const entry = { month: mKey, score, breakdown };
    const idx = healthHistory.findIndex(h=>h.month===mKey);
    if(idx === -1) healthHistory.push(entry); else healthHistory[idx] = entry;
    healthHistory.sort((a,b)=> a.month.localeCompare(b.month));
    if(healthHistory.length > 24) healthHistory = healthHistory.slice(-24);
    saveHealthHistory();
    return entry;
  }

  function renderHealthScore(){
    const { score, breakdown } = upsertHealthSnapshot();
    const ring = document.getElementById('healthScoreRing');
    const tier = score >= 75 ? {label:'Odlično', token:'--pos'}
      : score >= 55 ? {label:'Dobro', token:'--pos'}
      : score >= 35 ? {label:'Prosečno', token:'--warn'}
      : {label:'Slabo', token:'--neg'};
    ring.style.setProperty('--ring', `var(${tier.token})`);
    ring.style.setProperty('--pct', Math.max(0, Math.min(100, score)));
    ring.setAttribute('aria-label', t('Finansijsko zdravlje: {0} od 100 ({1})', score, t(tier.label)));
    document.getElementById('healthScoreNum').textContent = score;
    document.getElementById('healthScoreLabel').textContent = tier.label;

    const rows = [
      ['Ušteda', breakdown.savings],
      ['Disciplina budžeta', breakdown.budget],
      ['Urednost dugova', breakdown.debts],
      ['Progres ciljeva', breakdown.goals],
      ['Redovne uplate', breakdown.recurring],
    ];
    const breakdownEl = document.getElementById('healthBreakdown');
    breakdownEl.innerHTML = rows.map(([label,val])=>{
      const cls = val >= 70 ? 'ok' : (val >= 40 ? 'near' : 'over');
      return `<div class="health-breakdown-row"><span class="hb-label">${label}</span>
        <div class="bar-track"><div class="bar-fill ${cls}" data-target="${Math.max(0,Math.min(100,val)).toFixed(0)}%"></div></div></div>`;
    }).join('');
    growBars(breakdownEl);

    const tips = {
      savings: 'Pokušaj da odvojiš makar mali procenat prihoda pre nego što potrošiš ostatak — i 5-10% redovno pravi veliku razliku kroz vreme.',
      budget: 'Nekoliko kategorija je premašilo limit/budžet ovog meseca — pogledaj "Rashodi po kategorijama" da vidiš gde najviše curi.',
      debts: 'Imaš dug/pozajmicu sa prošlim rokom — dogovori novi rok ili isplati deo da ne kasni dalje.',
      goals: 'Ciljevi štednje sporo napreduju — probaj redovnu manju uplatu (npr. mesečno) umesto povremenih velikih.',
      recurring: 'Neke ponavljajuće stavke kasne sa plaćanjem — obeleži ih kao plaćene ili pauziraj mesec ako se ne odnose na tebe sada.',
    };
    const labels = { savings:'Ušteda', budget:'Disciplina budžeta', debts:'Urednost dugova', goals:'Progres ciljeva', recurring:'Redovne uplate' };
    const weakestKey = Object.keys(breakdown).reduce((worst,k)=> breakdown[k] < breakdown[worst] ? k : worst, Object.keys(breakdown)[0]);
    const recEl = document.getElementById('healthRecommendation');
    if(breakdown[weakestKey] >= 70){
      recEl.textContent = 'Sve komponente su solidne ovog meseca — nema konkretne preporuke, samo nastavi tako.';
    } else {
      recEl.innerHTML = t('<b>{0}</b> je trenutno najslabija tačka ({1}/100): {2}', t(labels[weakestKey]), Math.round(breakdown[weakestKey]), t(tips[weakestKey]));
    }

    const svg = document.getElementById('healthTrendSvg');
    const recent = healthHistory.slice(-6);
    if(recent.length < 2){
      svg.innerHTML = '';
    } else {
      const W = 150, H = 50, pad = 4;
      const xFor = i => pad + i*((W-pad*2)/(recent.length-1));
      const yFor = v => H-pad - (v/100)*(H-pad*2);
      const vals = recent.map(h=>h.score);
      const path = buildLinePath(vals, xFor, yFor);
      const lastColor = score >= 55 ? 'var(--pos)' : (score >= 35 ? 'var(--warn)' : 'var(--neg)');
      const dots = vals.map((v,i)=>`<circle cx="${xFor(i).toFixed(1)}" cy="${yFor(v).toFixed(1)}" r="2.5" fill="${lastColor}"><title>${recent[i].month}: ${v}</title></circle>`).join('');
      svg.innerHTML = `<path d="${path}" fill="none" stroke="${lastColor}" stroke-width="2"/>${dots}`;
    }
  }

