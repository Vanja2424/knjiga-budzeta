  // ---------- Telegram bot: obrada poruka (glavni proces prosledi poruku, ovde se upisuje i vrati odgovor) ----------
  const TG_DONE_KEY = 'budzet-telegram-obradjeno-v1', TG_PENDING_KEY = 'budzet-telegram-cekanje-v1', TG_LOG_KEY = 'budzet-telegram-unosi-v1';
  const tgLoad = k => { try{ const v = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(v) ? v : []; } catch(e){ return []; } };
  const tgSave = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  let fakeTgCategory = null; // test: req -> { ok, content }
  if(IS_TEST) Object.defineProperty(window, '__fakeTgCategory', { get: ()=> fakeTgCategory, set: v=>{ fakeTgCategory = v; }, configurable: true });
  const tgReply = (text, extra) => ({ replies: [Object.assign({ text }, extra || {})] });
  const tgDayLabel = iso => { const today = toISODateLocal(new Date()); const y = new Date(); y.setDate(y.getDate() - 1);
    return iso === today ? t('danas') : iso === toISODateLocal(y) ? t('juče') : fmtDocDate(iso); };
  const TG_HELP = () => t('Pitaj me bilo šta o budžetu („šta treba da platimo?“, „koliko smo dali za hranu?“) ili reci šta da uradim („platila sam porez“, „vratila sam Raletu 5000“, „dodaj mleko“) — pre svake izmene tražim potvrdu. Nov unos: /nov kafa 250 (prihod: /nov +honorar 30000). Pošalji sliku ili PDF računa ili uplatnice. /ponisti poništava poslednji unos.');
  // Razgovor sa botom: samo u memoriji (posle ponovnog pokretanja pocinje iz pocetka)
  let tgHistory = [];   // [{ q, a, at }]
  let tgAwait = null;   // { kind: 'entry', at } posle praznog /nov; { kind: 'amount', proposalId, at } kad naredbi fali iznos
  const TG_AWAIT_MS = 10 * 60 * 1000, TG_HISTORY_MS = 15 * 60 * 1000;
  const tgRecentHistory = () => tgHistory.filter(h=> Date.now() - h.at < TG_HISTORY_MS).slice(-4);
  async function tgAiCategory(desc){
    if(String(desc).replace(/[^\p{L}]/gu, '').length < 4) return null;
    const req = { images: [], text: '', prompt: C.quickCategoryPrompt(expenseCats, desc) };
    const call = fakeTgCategory ? fakeTgCategory(req) : (window.desktop && window.desktop.bills ? window.desktop.bills.read(req) : null);
    if(!call) return null;
    const res = await Promise.race([Promise.resolve(call).catch(()=> null), new Promise(r=> setTimeout(()=> r(null), 3000))]);
    return res && res.ok ? C.cleanQuickCategory(res.content, expenseCats) : null;
  }
  function tgLog(ids, label, extra){
    const id = newId();
    tgSave(TG_LOG_KEY, tgLoad(TG_LOG_KEY).concat(Object.assign({ id, ids, label, at: Date.now() }, extra || {})).slice(-50));
    return id;
  }
  async function tgUndo(logId){
    const log = tgLoad(TG_LOG_KEY), item = logId ? log.find(l=> l.id === logId) : log.filter(l=> !l.undone && Date.now() - l.at < 864e5).pop();
    if(!item || item.undone) return null;
    const set = new Set(item.ids), gone = entries.filter(e=> set.has(e.id));
    gone.forEach(e=>{ if(e.type === 'expense') unapplyRoundUpSaving(e.amount); });
    if(gone.length){ entries = entries.filter(e=> !set.has(e.id)); saveEntries(); }
    (item.shopping || []).forEach(b=>{ const it = shopping.items.find(x=> x.id === b.id); if(it){ it.needed = b.needed; it.checked = b.checked; it.price = b.price; if('qty' in b) it.qty = b.qty; } });
    if((item.shopping || []).length) saveShopping();
    // radnja iz naredbe: vrati tacno prethodno stanje
    const a = item.act;
    if(a && a.kind === 'recPaid'){
      applied[a.mKey] = (applied[a.mKey] || []).filter(id=> id !== a.id);
      if(a.wasSkipped){ if(!skipped[a.mKey]) skipped[a.mKey] = []; if(!skipped[a.mKey].includes(a.id)) skipped[a.mKey].push(a.id); }
      if(!restoreWasUnpaid(a.entryId)) entries = entries.filter(e=> e.id !== a.entryId); saveApplied(); saveSkipped(); saveEntries();
    }
    if(a && a.kind === 'entryEdit'){ const e = entries.find(x=> x.id === a.id); if(e){ Object.assign(e, a.prev); if('paid' in a.prev && a.prev.paid === undefined) delete e.paid; if(a.round){ unapplyRoundUpSaving(a.round.to); applyRoundUpSaving(a.round.from); } saveEntries(); } }
    if(a && a.kind === 'skip'){ skipped[a.mKey] = (skipped[a.mKey] || []).filter(id=> id !== a.id); saveSkipped(); }
    if(a && a.kind === 'debt'){ const d = debts.find(x=> x.id === a.id); if(d){ d.paidAmount = Math.max(0, C.round2((d.paidAmount || 0) - a.amount)); saveDebts(); syncDebtInstallments(); } }
    if(a && a.kind === 'goal'){ const g = goals.find(x=> x.id === a.id); if(g){ g.current = Math.max(0, C.round2(g.current - a.amount)); saveGoals(); } }
    if(a && a.kind === 'doc'){
      const d = documents.find(x=> x.id === a.id);
      if(d && a.snap && JSON.stringify(d) !== a.snap) item.label += ' — ' + t('garancija je u međuvremenu menjana, ostala je u Dokumentima');
      else { documents = documents.filter(x=> x.id !== a.id); saveDocuments(); }
    }
    if(a && a.kind === 'shopAdd' && a.created.length){ shopping.items = shopping.items.filter(it=> !a.created.includes(it.id)); saveShopping(); }
    if(a && a.kind === 'restore' && !entries.some(e=> e.id === a.entry.id) && !log.some(l=> l.undone && (l.ids || []).includes(a.entry.id))){ entries.push(a.entry); if(a.entry.type === 'expense') applyRoundUpSaving(a.entry.amount); saveEntries(); }
    if(window.desktop && window.desktop.bills) for(const name of item.attachments || []){
      if(!entries.some(e=> (e.attachments || []).includes(name)) && !documents.some(d=> (d.files || []).includes(name))) await window.desktop.bills.deleteFile(name);
    }
    renderAll();
    item.undone = true; tgSave(TG_LOG_KEY, log);
    return item;
  }
  // Grupa: oznaka sa imenom posiljaoca ("Ana" -> ana), da se vidi ko je sta potrosio
  const tgSenderTag = p => p && p.group && p.from && p.from.name ? C.foldText(p.from.name).replace(/[^a-z0-9]+/g, '').slice(0, 20) : '';
  const tgWho = p => p && p.group && p.from && p.from.name ? p.from.name + ': ' : '';
  function tgTagEntries(ids, tag){
    if(!tag) return;
    entries.filter(e=> ids.includes(e.id)).forEach(e=>{ e.tags = [...new Set((e.tags || []).concat(tag))]; });
    saveEntries();
  }
  // Link sa QR koda fiskalnog racuna (kamera telefona) -> sazetak sa tacnim stavkama, cuvanje posle potvrde
  async function tgFiscalLink(url, p){
    const f = await readFiscal(url);
    if(!f.reading) return tgReply('✕ ' + f.error);
    const pend = { id: newId(), created: Date.now(), kind: 'receipt', fiscal: true, messageId: null, tag: tgSenderTag(p), state: mergedReceiptState([{ reading: f.reading }]) };
    tgPendingPut(pend);
    return tgReply(tgReceiptSummary(pend.state, pend), { buttons: tgButtons(pend, [{ text: '✓ ' + t('Sačuvaj'), data: 's:' + pend.id }]) });
  }
  async function tgText(text, p){
    const fiscalUrl = C.fiscalUrlFrom(text);
    if(fiscalUrl){ tgAwait = null; return tgFiscalLink(fiscalUrl, p); }
    const intent = C.telegramIntent(text);
    const wait = tgAwait && Date.now() - tgAwait.at < TG_AWAIT_MS && (!tgAwait.from || !p || !p.from || tgAwait.from === p.from.id) ? tgAwait : null;
    if(intent.kind === 'command'){
      tgAwait = null;
      if(intent.command === 'ponisti'){
        const it = await tgUndo(null);
        return tgReply(it ? t('↩ Poništeno: {0}', it.label) : t('Nema unosa iz Telegrama za poništavanje (poslednja 24 sata).'));
      }
      if(intent.command === 'nov'){
        if(!intent.rest){ tgAwait = { kind: 'entry', at: Date.now(), from: p && p.from ? p.from.id : null }; return tgReply(t('Šta da upišem? Npr. „kafa 250“.')); }
        return tgEntry(intent.rest, p);
      }
      return tgReply(TG_HELP());
    }
    if(intent.kind !== 'question') return tgReply(TG_HELP());
    if(wait){
      tgAwait = null;
      if(wait.kind === 'entry') return tgEntry(text, p, { chatRules: true });
      if(wait.kind === 'amount' && /^\s*\d[\d.,\s]*\s*(rsd|din\.?|dinara)?\s*$/i.test(text)){ const n = C.parseAmount(text); if(n > 0 && n < 1e8) return tgProposalAmount(wait.proposalId, n, p); }
    }
    return tgAsk(text, p);
  }
  // Unos iz bota (/nov kafa 250): odmah upisuje, uz Ponisti
  async function tgEntry(text, p, opts){
    const chat = !!(opts && opts.chatRules && p && p.group);   // poruka posle praznog /nov u grupi: caskanje se ne upisuje
    const data = window.__desktopBridge.getQuickAddData();
    const d = C.telegramEntryDraft(text, { today: toISODateLocal(new Date()), accounts: data.accounts || [], currencies: CURRENCIES.filter(c=> c !== 'RSD'),
      rules: data.rules, history: data.history, expenseCats, incomeCats, group: chat });   // /nov tekst je izricit unos i u grupi
    if(d.error && chat) return { replies: [] };
    if(d.error === 'noamount') return tgReply(t('Nisam našao iznos — pošalji npr. „kafa 250“.'));
    if(d.error) return tgReply(t('Napiši i šta je, npr. „kafa 250“.'));
    const category = d.category || (d.type === 'expense' ? await tgAiCategory(d.desc) : null) || '';
    const r = window.__desktopBridge.addEntry({ type: d.type, desc: d.desc, amount: d.amount, currency: d.currency || 'RSD', date: d.date, accountId: d.accountId || undefined, category, paid: true, tags: tgSenderTag(p) });
    if(!r || !r.ok) return tgReply('✕ ' + ((r && r.error) || t('Stavka nije dodata.')));
    const label = `${d.desc} · ${r.amountText}`;
    const logId = tgLog(r.ids, label);
    return tgReply(`✓ ${tgWho(p)}${d.type === 'income' ? t('Prihod') + ': ' : ''}${label} · ${r.category} · ${tgDayLabel(d.date)}`, { buttons: [[{ text: t('Poništi'), data: 'u:' + logId }]] });
  }
  // Brojke za proracune iz bota (toPay, debts, accounts, goals, forecast) — racuna stranica, AI dobija samo rezultat
  function tgSnapshot(){
    const mKey = currentMonthKey();
    const pend = C.pendingForMonth({ entries, recurring, applied, skipped, debts, mKey, currentMonth: mKey, amountOf: recurringAmountNow });
    const bal = accounts.length ? accountBalances() : null;
    let fc = null;
    try{ const f = forecastNow(); fc = { startBalance: f.startBalance, lowest: f.lowest ? { date: f.lowest.date, balance: f.lowest.balance } : null, payday: f.payday ? { date: f.payday.date } : null, beforePayday: f.beforePayday ? { date: f.beforePayday.date, balance: f.beforePayday.balance } : null, firstNegative: f.firstNegative || null }; } catch(e){ fc = null; }
    return {
      // poredjano od najveceg; total su samo stavke, dugovi su posebno (debtsTotal) i ne sabiraju se sa total
      toPay: { total: pend.expense, count: pend.count, expectedIncome: pend.income, debtsTotal: pend.debt, napomena: 'total = samo stavke za plaćanje; dugovi (debtsTotal) su posebno i NE ulaze u total',
        items: pend.items.slice().sort((a, b)=> b.amount - a.amount).map(i=> ({ desc: i.desc, amount: i.amount, rok: i.date || (i.day ? t('dan {0}', i.day) : '') })),
        debts: pend.debtItems.slice().sort((a, b)=> b.rest - a.rest).map(d=> ({ person: d.person, ostatak: d.rest })) },
      debts: debts.map(d=> ({ person: d.person, smer: d.direction === 'i_owe' ? 'ja dugujem' : 'duguju meni', ukupno: d.amount, ostatak: debtRemaining(d) })),
      accounts: bal ? { racuni: accounts.map(a=> ({ name: a.name, stanje: bal[a.id] })), ukupno: C.round2(accounts.reduce((s, a)=> s + bal[a.id], 0)) } : { ukupno: overallBalance() },
      goals: goals.map(g=> ({ name: g.name, trenutno: g.current, cilj: g.target, mesecno: g.monthly ? g.monthly.amount : null })),
      forecast: fc
    };
  }
  const TG_NOV_HINT = () => t('Unos i dalje radi: /nov kafa 250');
  // Pitanje ili naredba: isti tok kao "Pitaj svoj budzet" (plan -> lokalni proracuni -> odgovor), uz razgovor
  async function tgAsk(text, p){
    if(!askAiAvailable()) return tgReply(t('AI nije podešen (Podešavanja → AI čitanje računa).') + ' ' + TG_NOV_HINT());
    const today = toISODateLocal(new Date()), history = tgRecentHistory();
    const { first, last } = C.askMonthRange(entries, currentMonthKey());
    const r1 = await askCall({ images: [], text: '', prompt: C.askPlanPrompt({ question: text, today, first, last, expenseCats, incomeCats, history, actions: true }) }, 1);
    const tgAskErr = r => r && r.kind === 'nokey' ? t('AI nije podešen (Podešavanja → AI čitanje računa).') : '✕ ' + askErr(r);
    if(!r1 || !r1.ok) return tgReply(tgAskErr(r1) + ' ' + TG_NOV_HINT());
    const plan = C.cleanAskPlan(r1.content, { first, last, categories: expenseCats.concat(incomeCats) });
    if(!plan) return tgReply(t('Nisam razumeo — probaj drugačije.'));
    if(plan.action) return tgPropose(plan.action, text, p);
    if(plan.offTopic) return tgReply(t('Mogu da odgovorim samo na pitanja o budžetu. Za unos: /nov kafa 250'));
    if(!plan.calls.length) return tgReply(t('Za ovo pitanje nema podataka u knjizi.'));
    const results = C.runAskTools(plan.calls, { entries, recurring, today, snapshot: tgSnapshot() });
    const r2 = await askCall({ images: [], text: '', prompt: C.askAnswerPrompt({ question: text, today, results, history, lang: askLangOverride || I18N.lang, style: 'telegram' }) }, 2);
    if(!r2 || !r2.ok) return tgReply(tgAskErr(r2) + ' ' + TG_NOV_HINT());
    const answer = C.cleanAskAnswer(r2.content).slice(0, 3000);
    tgHistory = tgRecentHistory().concat({ q: String(text).slice(0, 300), a: answer, at: Date.now() }).slice(-4);
    return tgReply(answer);
  }
  // ---- Naredbe iz bota: predlog -> "✓ Potvrdi" -> izvrsenje istim funkcijama kao dugmad u aplikaciji -> "Poništi" ----
  const TG_PROP_KEY = 'budzet-telegram-potvrde-v1', TG_PROP_MS = 10 * 60 * 1000;
  const tgProps = () => tgLoad(TG_PROP_KEY).filter(x=> x && Date.now() - x.created < 864e5);
  const tgPropPut = x => { const all = tgProps().filter(y=> y.id !== x.id).concat(x), live = y=> y.until && y.until > Date.now() && y.state === 'open';
    const others = all.filter(y=> !live(y)).slice(-50); tgSave(TG_PROP_KEY, all.filter(y=> live(y) || others.includes(y))); };
  const tgConfirmButtons = x => [[{ text: '✓ ' + t('Potvrdi'), data: 'c:' + x.id }, { text: '✕ ' + t('Otkaži'), data: 'n:' + x.id }]];
  const tgMonthName = () => { const [y, m] = currentMonthKey().split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString(LOCALE, { month: 'long' }); };
  // unosi iz bota u poslednja 24 h (isti dnevnik kao /ponisti), od najstarijeg ka najnovijem
  const tgLastEntries = () => tgLoad(TG_LOG_KEY).filter(l=> !l.undone && !l.act && Date.now() - l.at < 864e5 && (l.ids || []).length === 1)
    .map(l=> entries.find(e=> e.id === l.ids[0])).filter(Boolean);
  // kandidati po vrsti naredbe: name = poredi se sa porukom, amount = prikaz i podrazumevani iznos
  function tgCandidates(kind){
    const mKey = currentMonthKey();
    if(kind === 'paid' || kind === 'skip')
      return C.pendingForMonth({ entries, recurring, applied, skipped, debts, mKey, currentMonth: mKey, amountOf: recurringAmountNow }).items
        .filter(i=> kind === 'paid' || i.kind === 'recurring').map(i=> ({ id: i.id, name: i.desc, targetKind: i.kind, amount: i.amount }));
    if(kind === 'paidAll') return recurring.filter(r=> r.type === 'expense' && C.isDueInMonth(r, mKey) && !(r.until && r.until < mKey))
      .map(r=> ({ id: r.id, name: r.desc, targetKind: 'recurring', amount: recurringAmountNow(r) }));
    if(kind === 'debtPay') return debts.filter(d=> d.direction === 'i_owe' && debtRemaining(d) > 0).map(d=> ({ id: d.id, name: d.person, targetKind: 'debt', amount: debtRemaining(d) }));
    if(kind === 'goalPay') return goals.map(g=> ({ id: g.id, name: g.name, targetKind: 'goal' }));
    if(kind === 'editLast' || kind === 'deleteLast') return tgLastEntries().map(e=> ({ id: e.id, name: e.desc, targetKind: 'entry', amount: e.amount }));
    return [];
  }
  // ime i iznos u predlogu su **podebljani** (Telegram bold)
  const tgB = v => '**' + String(v).replace(/\*/g, '∗') + '**';
  function tgProposalText(x){
    switch(x.kind){
      case 'add': return t('Upisati: {0} · {1} · {2}?', (x.draft.type === 'income' ? t('Prihod') + ': ' : '') + tgB(x.draft.desc), tgB(fmt(x.draft.amount)), x.draft.category || '—');
      case 'paid': return t('Označiti {0} ({1}) kao plaćeno za {2}?', tgB(x.label), tgB(fmt(x.amount)), tgMonthName());
      case 'skip': return t('Preskočiti {0} ({1}) za {2}?', tgB(x.label), tgB(fmt(x.amount)), tgMonthName());
      case 'debtPay': return t('Uplata {0} na dug {1}? Ostaje {2}.', tgB(fmt(x.amount)), tgB(x.label), fmt(Math.max(0, C.round2(x.rest - x.amount))));
      case 'goalPay': return t('Uplatiti {0} u cilj {1}?', tgB(fmt(x.amount)), tgB(x.label));
      case 'shopAdd': return t('Dodati na spisak: {0}?', tgB(x.items.join(', ')));
      case 'shopDone': return t('Štiklirati: {0}?', tgB(x.items.join(', '))) + (x.missing && x.missing.length ? '\n' + t('Nisam našao: {0}', x.missing.join(', ')) : '');
      case 'editLast': return t('Izmeniti {0}: {1} → {2}?', tgB(x.label), fmt(x.oldAmount), tgB(fmt(x.amount)));
      case 'deleteLast': return t('Obrisati: {0} ({1})?', tgB(x.label), fmt(x.amount));
    }
    return '';
  }
  function tgFillTarget(x, c, a){
    x.targetId = c.id; x.targetKind = c.targetKind; x.label = c.name; x.needAmount = false;
    const rec = c.targetKind === 'recurring' ? recurring.find(r=> r.id === c.id) : null;
    if(x.kind === 'paid' || x.kind === 'skip'){ x.userAmount = x.kind === 'paid' && !!a.amount; x.amount = x.userAmount ? a.amount : rec ? suggestedPayAmount(rec) : c.amount; }
    if(x.kind === 'debtPay'){ x.rest = c.amount; if(a.amount) x.amount = Math.min(a.amount, c.amount); else x.needAmount = true; }
    if(x.kind === 'goalPay' && !a.amount) x.needAmount = true;
    if(x.kind === 'editLast'){ x.oldAmount = c.amount; if(a.amount) x.amount = a.amount; else x.needAmount = true; }
    if(x.kind === 'deleteLast') x.amount = c.amount;
  }
  async function tgPropose(a, text, p){
    const x = { id: newId(), created: Date.now(), kind: a.kind, amount: a.amount, items: a.items, state: 'open' };
    if(a.kind === 'add'){
      const data = window.__desktopBridge.getQuickAddData();
      const draftOf = str => C.telegramEntryDraft(str, { today: toISODateLocal(new Date()), accounts: data.accounts || [], currencies: CURRENCIES.filter(c=> c !== 'RSD'),
        rules: data.rules, history: data.history, expenseCats, incomeCats, group: false });
      let d = draftOf(text);
      if(d.error) d = draftOf(a.target + (a.amount ? ' ' + a.amount : ''));
      if(d.error) return tgReply(t('Nisam našao iznos — pošalji npr. „/nov kafa 250“.'));
      d.category = d.category || (d.type === 'expense' ? await tgAiCategory(d.desc) : null) || '';
      x.draft = d; x.tag = tgSenderTag(p);
    } else if(a.kind === 'shopDone'){
      const need = shopping.items.filter(it=> it.needed && !it.checked).map(it=> ({ id: it.id, name: it.name }));
      x.found = []; x.missing = [];
      a.items.forEach(n=>{ const m = C.matchActionTarget(n, need); const hit = m.match; if(hit && !x.found.includes(hit.id)) x.found.push(hit.id); else x.missing.push(n); });   // samo jednoznacan pogodak; isti dvaput = drugo nije nadjeno
      if(!x.found.length) return tgReply(t('Nisam našao na spisku: {0}', a.items.join(', ')));
      x.items = x.found.map(id=> shopping.items.find(it=> it.id === id).name);
    } else if(a.kind !== 'shopAdd'){
      let cands = tgCandidates(a.kind);
      const last = a.kind === 'editLast' || a.kind === 'deleteLast';
      let m;
      if(last && !a.target) m = cands.length ? { match: cands[cands.length - 1] } : { none: true };
      else m = C.matchActionTarget(a.target, cands);
      // "poslednji": medju jednako dobrim pogocima uzmi najnoviji
      if(last && m.choices){ const ids = m.choices.map(c=> c.id); m = { match: cands.filter(c=> ids.includes(c.id)).pop() }; }
      if(a.kind === 'paid'){ const ids = new Set(cands.map(c=> c.id)); cands = cands.concat(tgCandidates('paidAll').filter(c=> !ids.has(c.id))); m = C.matchActionTarget(a.target, cands); }
      if(m.none) return tgReply(last && !a.target ? t('Nema unosa iz bota u poslednja 24 sata.') : last ? t('Nisam našao „{0}“ među unosima iz bota (poslednja 24 sata).', a.target) : t('Nisam našao „{0}“.', a.target));
      if(m.choices){
        x.choices = m.choices.map(c=> cands.find(k=> k.id === c.id)); x.req = { amount: a.amount, target: a.target };
        tgPropPut(x);
        return tgReply(t('Na šta misliš?'), { buttons: x.choices.map((c, i)=> [{ text: c.name + (c.amount ? ' · ' + fmt(c.amount) : ''), data: `h:${x.id}:${i}` }]) });
      }
      tgFillTarget(x, cands.find(k=> k.id === m.match.id), a);
      if(x.needAmount){ tgPropPut(x); tgAwait = { kind: 'amount', proposalId: x.id, at: Date.now() }; return tgReply(t('Koliko? (npr. 5000)')); }
    }
    tgPropPut(x);
    return tgReply(tgProposalText(x), { buttons: tgConfirmButtons(x) });
  }
  async function tgProposalAmount(id, n, p){
    const x = tgProps().find(y=> y.id === id && y.state === 'open');
    if(!x || Date.now() - x.created > TG_PROP_MS) return tgReply(t('Isteklo — pošalji ponovo.'));
    x.needAmount = false; x.amount = x.kind === 'debtPay' ? Math.min(n, x.rest) : n;
    tgPropPut(x);
    return tgReply(tgProposalText(x), { buttons: tgConfirmButtons(x) });
  }
  const shopSnap = list => list.map(it=> ({ id: it.id, needed: it.needed, checked: it.checked, price: it.price, qty: it.qty }));
  // Izvrsenje potvrdjenog predloga; stanje se proverava ponovo (moglo je da se promeni u aplikaciji)
  function tgExecute(x){
    const mKey = currentMonthKey();
    if(x.kind === 'add'){
      const d = x.draft;
      const r = window.__desktopBridge.addEntry({ type: d.type, desc: d.desc, amount: d.amount, currency: d.currency || 'RSD', date: d.date, accountId: d.accountId || undefined, category: d.category, paid: true, tags: x.tag });
      if(!r || !r.ok) throw new Error((r && r.error) || t('Stavka nije dodata.'));
      return { text: `${d.type === 'income' ? t('Prihod') + ': ' : ''}${d.desc} · ${r.amountText} · ${r.category}`, ids: r.ids };
    }
    if(x.kind === 'paid' && x.targetKind === 'recurring'){
      const mKey = x.mKey || currentMonthKey();   // podsetnik "sutra" moze biti u sledecem mesecu
      const r = recurring.find(y=> y.id === x.targetId);
      if(!r || isPaid(r, mKey)) return { already: true };
      const wasSkipped = isSkipped(r, mKey);
      const id = markRecurringPaid(r, mKey, x.userAmount ? x.amount : undefined);
      if(!id) return { already: true };
      saveApplied(); saveSkipped(); saveEntries();
      const e = entries.find(y=> y.id === id);
      return { text: t('{0} plaćeno ({1})', r.desc, fmt(e ? e.amount : x.amount)), ids: [], act: { kind: 'recPaid', mKey, id: r.id, entryId: id, wasSkipped } };
    }
    if(x.kind === 'paid'){
      const e = entries.find(y=> y.id === x.targetId);
      if(!e || isExpensePaid(e)) return { already: true };
      const prev = { paid: e.paid, amount: e.amount };
      e.paid = true; if(x.userAmount && x.amount && x.amount !== e.amount) e.amount = x.amount;   // inace ostaje iznos iz aplikacije (mozda ispravljen posle predloga)
      saveEntries();
      return { text: t('{0} plaćeno ({1})', e.desc, fmt(e.amount)), ids: [], act: { kind: 'entryEdit', id: e.id, prev } };
    }
    if(x.kind === 'skip'){
      const r = recurring.find(y=> y.id === x.targetId);
      if(!r || isPaid(r, mKey) || isSkipped(r, mKey)) return { already: true };
      if(!skipped[mKey]) skipped[mKey] = [];
      skipped[mKey].push(r.id); saveSkipped();
      return { text: t('{0} preskočeno za ovaj mesec', r.desc), ids: [], act: { kind: 'skip', mKey, id: r.id } };
    }
    if(x.kind === 'debtPay'){
      const d = debts.find(y=> y.id === x.targetId), rem = d ? debtRemaining(d) : 0;
      if(!d || rem <= 0) return { already: true };
      const amt = Math.min(x.amount, rem);
      d.paidAmount = C.round2((d.paidAmount || 0) + amt); saveDebts();
      if(debtRemaining(d) <= 0) syncDebtInstallments();
      return { text: t('Uplata {0} na dug {1}, ostaje {2}', fmt(amt), d.person, fmt(debtRemaining(d))), ids: [], act: { kind: 'debt', id: d.id, amount: amt } };
    }
    if(x.kind === 'goalPay'){
      const g = goals.find(y=> y.id === x.targetId);
      if(!g) return { already: true };
      const trId = contributeToGoal(g, x.amount);
      return { text: t('Uplaćeno {0} u cilj {1}', fmt(x.amount), g.name), ids: trId ? [trId] : [], act: { kind: 'goal', id: g.id, amount: x.amount } };
    }
    if(x.kind === 'shopAdd'){
      const before = shopSnap(x.items.map(n=> C.findShoppingItem(shopping.items, C.parseShoppingInput(n).name)).filter(Boolean)), created = [];
      x.items.forEach(n=>{ const r = addShoppingFromInput(n); if(r && r.created) created.push(r.item.id); });
      return { text: t('Na spisku: {0}', x.items.join(', ')), ids: [], shopping: before, act: { kind: 'shopAdd', created } };
    }
    if(x.kind === 'shopDone'){
      const its = x.found.map(id=> shopping.items.find(it=> it.id === id)).filter(it=> it && !it.checked);
      if(!its.length) return { already: true };
      const before = shopSnap(its);
      its.forEach(it=>{ it.checked = true; }); saveShopping();
      return { text: t('Štiklirano: {0}', its.map(it=> it.name).join(', ')), ids: [], shopping: before };
    }
    if(x.kind === 'editLast'){
      const e = entries.find(y=> y.id === x.targetId);
      if(!e) return { already: true };
      if(!(x.amount > 0)) return { already: true };
      const prev = { amount: e.amount, desc: e.desc }, round = e.type === 'expense' ? { from: e.amount, to: x.amount } : null;
      if(e.origAmount && e.currency && e.currency !== 'RSD' && e.amount > 0){ prev.origAmount = e.origAmount; e.origAmount = C.round2(e.origAmount * x.amount / e.amount); }
      if(round){ unapplyRoundUpSaving(round.from); applyRoundUpSaving(round.to); }
      e.amount = x.amount;
      saveEntries();
      return { text: t('Izmenjeno: {0} · {1}', e.desc, fmt(e.amount)), ids: [], act: { kind: 'entryEdit', id: e.id, prev, round } };
    }
    if(x.kind === 'warranty'){
      const entry = entries.find(y=> y.id === x.targetId);
      const item = entry && C.warrantyItems(entry, documents).find(i=> i.index === x.itemIndex);
      if(!item || item.has) return { already: true };
      const d = addWarrantyDocs([{ entry, item }], 24)[0];
      if(!d) return { already: true };
      return { text: t('Garancija: {0}, do {1}', d.title, fmtDocDate(C.documentExpiry(d))), ids: [], act: { kind: 'doc', id: d.id, snap: JSON.stringify(d) } };
    }
    if(x.kind === 'deleteLast'){
      const e = entries.find(y=> y.id === x.targetId);
      if(!e) return { already: true };
      entries = entries.filter(y=> y.id !== e.id);
      if(e.type === 'expense') unapplyRoundUpSaving(e.amount);
      saveEntries();
      return { text: t('Obrisano: {0}', e.desc), ids: [], act: { kind: 'restore', entry: e } };
    }
    return { already: true };
  }
  async function tgConfirmCallback(p, cb){
    const x = tgProps().find(y=> y.id === cb.id);
    if(!x) return { callbackText: t('Isteklo'), replies: [] };
    if(x.state !== 'open') return { callbackText: t('Već urađeno'), replies: [] };
    if(x.until ? Date.now() > x.until : Date.now() - x.created > TG_PROP_MS){ x.state = 'cancelled'; tgPropPut(x); return { callbackText: t('Isteklo'), replies: x.reminder ? [] : [{ editMessageId: p.messageId, text: t('Isteklo — pošalji ponovo.') }] }; }
    if(cb.action === 'n'){ x.state = 'cancelled'; tgPropPut(x); return { callbackText: t('Otkazano'), replies: [{ editMessageId: p.messageId, text: '✕ ' + t('Otkazano') }] }; }
    if(cb.action === 'h'){
      const c = (x.choices || [])[parseInt(cb.arg, 10)];
      if(!c) return { replies: [] };
      tgFillTarget(x, c, x.req || {});
      x.choices = null; tgPropPut(x);
      if(x.needAmount){ tgAwait = { kind: 'amount', proposalId: x.id, at: Date.now() }; return { replies: [{ editMessageId: p.messageId, text: t('Koliko? (npr. 5000)') }] }; }
      return { replies: [{ editMessageId: p.messageId, text: tgProposalText(x), buttons: tgConfirmButtons(x) }] };
    }
    if(x.needAmount || x.choices) return { callbackText: t('Koliko? (npr. 5000)'), replies: [] };
    x.state = 'done'; tgPropPut(x);   // pre izvrsenja: ponovljen klik ne ponavlja radnju
    let res;
    // podsetnik: jutarnji spisak ostaje ceo, rezultat ide kao nova poruka
    const where = x.reminder ? {} : { editMessageId: p.messageId };
    try{ res = tgExecute(x); }
    catch(e){ return { replies: [Object.assign({ text: '✕ ' + t('Nije urađeno: {0}', String(e && e.message || e)) }, where)] }; }
    renderAll();
    if(res.already) return { callbackText: t('Već urađeno'), replies: x.reminder ? [] : [{ editMessageId: p.messageId, text: t('Već urađeno — ništa nije menjano.') }] };
    const logId = tgLog(res.ids || [], res.text, { act: res.act || null, shopping: res.shopping });
    return { replies: [Object.assign({ text: '✓ ' + tgWho(p) + res.text, buttons: [[{ text: t('Poništi'), data: 'u:' + logId }]] }, where)] };
  }
  async function tgCallback(p){
    const cb = C.parseTelegramCallback(p.data);
    if(!cb) return { replies: [] };
    if(cb.action === 'u'){
      const it = await tgUndo(cb.id);
      return { callbackText: it ? t('Poništeno') : t('Već poništeno'), replies: it ? [{ editMessageId: p.messageId, text: t('↩ Poništeno: {0}', it.label) }] : [] };
    }
    if(cb.action === 'c' || cb.action === 'n' || cb.action === 'h') return tgConfirmCallback(p, cb);
    return tgFileCallback(p, cb); // Task 5
  }
  async function tgHandle(p){
    const done = tgLoad(TG_DONE_KEY);
    if(!p || done.includes(p.update_id)) return { replies: [] };
    let out = { replies: [] };
    if(p.kind === 'text') out = await tgText(p.text, p);
    else if(p.kind === 'callback') out = await tgCallback(p);
    else if(p.kind === 'file'){ tgAwait = null; out = await tgFile(p); } // Task 5
    tgSave(TG_DONE_KEY, tgLoad(TG_DONE_KEY).concat(p.update_id).slice(-500));
    if(window.__desktopBridge && window.__desktopBridge.flush){ try{ await window.__desktopBridge.flush(); } catch(e){ /* sledece cuvanje */ } }
    return out;
  }
  // ---- Jutarnji podsetnik: jednom dnevno posle zadatog vremena, samo kad ima sta da se javi ----
  const TG_MORNING_KEY = 'budzet-telegram-jutro-v1';
  const tgMorningCfg = () => { const d = { on: true, time: '09:00', last: '' }; try{ const v = JSON.parse(localStorage.getItem(TG_MORNING_KEY) || 'null'); return Object.assign(d, v && typeof v === 'object' ? v : {}); } catch(e){ return d; } };
  const tgMorningSave = c => localStorage.setItem(TG_MORNING_KEY, JSON.stringify(c));
  const tgNowIso = () => { const d = new Date(); return toISODateLocal(d) + 'T' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  async function tgMorning(nowIso){
    const cfg = tgMorningCfg();
    if(!C.morningDue(Object.assign({}, cfg, { now: nowIso }))) return { replies: [] };
    const today = nowIso.slice(0, 10);
    cfg.last = today; tgMorningSave(cfg);
    const m = C.morningReminderItems({ recurring, entries, applied, skipped, documents, today, amountOf: (r, mKey)=> suggestedPayAmount(r, mKey) });
    if(!C.morningHasItems(m)) return { replies: [] };
    const line = i => `• ${i.desc} — ${fmt(i.amount)}`;
    const head = (icon, txt) => `${icon} **${txt}**`;
    const parts = [];
    if(m.today.length) parts.push([head('🔔', t('Danas dospeva'))].concat(m.today.map(line)).join('\n'));
    if(m.tomorrow.length) parts.push([head('⏰', t('Sutra'))].concat(m.tomorrow.map(line)).join('\n'));
    if(m.overdue.length) parts.push([head('⚠️', t('Kasni'))].concat(m.overdue.map(i=> line(i) + ' (' + daysTxt(i.days) + ')')).join('\n'));
    if(m.docs.length) parts.push([head('📄', t('Dokumenti'))].concat(m.docs.map(d=> '• ' + (d.days === 0 ? t('{0} ističe danas', d.title) : t('{0} ističe za {1}', d.title, daysTxt(d.days))))).join('\n'));
    if(m.yearly.length) parts.push([head('📅', t('Uskoro (godišnji)'))].concat(m.yearly.map(y=> `• ${y.desc} — ${fmt(y.amount)}, ${fmtDocDate(y.date)}`)).join('\n'));
    // dugme po stavci koja se placa: klik odmah oznacava placeno (isti put kao naredba), vazi do kraja dana
    const until = new Date(); until.setHours(23, 59, 59, 999);
    const buttons = m.overdue.concat(m.today, m.tomorrow).slice(0, 8).map(i=>{
      const x = { id: newId(), created: Date.now(), until: until.getTime(), kind: 'paid', targetId: i.id, targetKind: i.kind, mKey: i.mKey, label: i.desc, amount: i.amount, userAmount: false, reminder: true, state: 'open' };
      tgPropPut(x);
      return [{ text: '✓ ' + String(i.desc).slice(0, 32) + ' · ' + fmt(i.amount), data: 'c:' + x.id }];
    });
    return { replies: [{ text: parts.join('\n\n'), buttons: buttons.length ? buttons : undefined, nackKey: 'morning' }] };
  }
  if(IS_TEST) window.__tgMorning = iso => tgMorning(iso);
  // ---- Mesecni rezime: prethodni mesec, iz istih brojki kao Mesecni pregled (bez AI-ja) ----
  const TG_MONTHLY_KEY = 'budzet-telegram-rezime-v1';
  const tgMonthlyCfg = () => { const d = { on: true, last: '' }; try{ const v = JSON.parse(localStorage.getItem(TG_MONTHLY_KEY) || 'null'); return Object.assign(d, v && typeof v === 'object' ? v : {}); } catch(e){ return d; } };
  const tgMonthlySave = c => localStorage.setItem(TG_MONTHLY_KEY, JSON.stringify(c));
  async function tgMonthly(nowIso){
    const cfg = tgMonthlyCfg();
    const prev = C.monthlySummaryDue({ on: cfg.on, last: cfg.last, time: tgMorningCfg().time, now: nowIso });
    if(!prev) return { replies: [] };
    cfg.last = prev; tgMonthlySave(cfg);
    const r = C.monthReview(entries, { recurring, applied, skipped, limits }, prev, 6);
    if(!r.income && !r.expense) return { replies: [] };
    const [y, mo] = prev.split('-').map(Number);
    const name = new Date(y, mo - 1, 1).toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' });
    const B = tgB;
    const head = [`📊 ${B(name.charAt(0).toUpperCase() + name.slice(1))}`, t('Prihodi: {0}', fmt(r.income))];
    const pct = r.expensePct != null && Math.abs(r.expensePct) >= 5 ? ' (' + t(r.expensePct > 0 ? '{0}% više od proseka' : '{0}% manje od proseka', Math.abs(r.expensePct)) + ')' : '';
    head.push(t('Rashodi: {0}', fmt(r.expense)) + pct);
    head.push(r.net >= 0 ? t('Ušteđeno: {0}', B(fmt(r.net))) + (r.savingsRate != null ? ` (${r.savingsRate}%)` : '') : t('Manjak: {0}', B(fmt(-r.net))));
    const parts = [head.join('\n')];
    const top = monthTotals(prev).catEntries.slice(0, 5);
    if(top.length) parts.push(['🧾 ' + B(t('Najviše potrošeno'))].concat(top.map(([c, v])=> `• ${c} — ${fmt(v)}`)).join('\n'));
    const ch = [];
    if(r.up.length) ch.push(['📈 ' + B(t('Više nego obično'))].concat(r.up.map(u=> `• ${u.cat} — +${fmt(u.diff)}`)).join('\n'));
    if(r.down) ch.push('📉 ' + t('Manje: {0} −{1}', r.down.cat, fmt(-r.down.diff)));
    if(ch.length) parts.push(ch.join('\n'));
    if(r.overBudget.length) parts.push(['🚫 ' + B(t('Preko limita'))].concat(r.overBudget.map(o=> `• ${o.cat} — ${fmt(o.spent)} / ${fmt(o.limit)}`)).join('\n'));
    const n = r.unpaidEntries.length + r.unpaidRecurring.length;
    if(n) parts.push('⚠️ ' + t('Ostalo neplaćeno: {0}, {1}', t(n === 1 ? '{0} stavka' : '{0} stavki', n), fmt(r.unpaidTotal)));
    // korpa je dodatak: greska u njoj ne sme da obori ceo rezime
    try{
      const ph = C.priceHistory(entries);
      const basket = [3, 1].map(m=> C.basketInflation(entries, nowIso.slice(0, 10), m, ph)).find(b=> b.enough);
      if(basket) parts.push('🛒 ' + t('Korpa: {0} za {1} ({2})', pctTxt(basket.pct), monthsTxt(basket.months), itemsTxt(basket.count)));
    } catch(e){ /* bez reda o korpi */ }
    return { replies: [{ text: parts.join('\n\n'), nackKey: 'monthly' }] };
  }
  // Telegram nije primio podsetnik/rezime -> ponovo pri sledecem otkucaju
  async function tgNack(keys){
    const today = toISODateLocal(new Date());
    const retry = (c, save)=>{ const n = c.retryDay === today ? (c.retries || 0) : 0; if(n >= 5) return; c.retryDay = today; c.retries = n + 1; c.last = ''; save(c); };   // najvise 5 puta dnevno
    if((keys || []).includes('morning')) retry(tgMorningCfg(), tgMorningSave);
    if((keys || []).includes('monthly')) retry(tgMonthlyCfg(), tgMonthlySave);
  }
  if(IS_TEST) window.__tgMonthly = iso => tgMonthly(iso);
  async function tgTick(){
    const out = await tgFileTick();
    const now = tgNowIso();
    try{ const m = await tgMorning(now); out.replies.push(...m.replies); } catch(e){ /* podsetnik ne sme da zaustavi ostalo */ }
    try{ const m = await tgMonthly(now); out.replies.push(...m.replies); } catch(e){ /* isto */ }
    return out;
  }
  // Podesavanja -> Telegram: jutarnji podsetnik i mesecni rezime
  (()=>{
    const on = document.getElementById('tgMorningOn'), time = document.getElementById('tgMorningTime');
    if(!on || !time) return;
    const c = tgMorningCfg(); on.checked = !!c.on; time.value = /^\d{2}:\d{2}$/.test(c.time) ? c.time : '09:00';
    const save = ()=>{ const v = tgMorningCfg(); v.on = on.checked; if(/^\d{2}:\d{2}$/.test(time.value)) v.time = time.value; tgMorningSave(v); };
    on.addEventListener('change', save); time.addEventListener('change', save);
    const mon = document.getElementById('tgMonthlyOn');
    if(mon){ mon.checked = !!tgMonthlyCfg().on; mon.addEventListener('change', ()=>{ const v = tgMonthlyCfg(); v.on = mon.checked; tgMonthlySave(v); }); }
  })();
  const tgPending = () => tgLoad(TG_PENDING_KEY);
  const tgPendingPut = p => tgSave(TG_PENDING_KEY, tgPending().filter(x=> x.id !== p.id).concat(p));
  const tgPendingDrop = id => tgSave(TG_PENDING_KEY, tgPending().filter(x=> x.id !== id));
  const tgMem = new Map(); // id -> File (dok se ne sacuva na disk ili za isti rad)
  const b64ToBytes = b64 => { const s = atob(b64), a = new Uint8Array(s.length); for(let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; };
  const TG_FILE_ERR = { type: ()=> t('Primam samo PDF, JPG, PNG ili WEBP.'), size: ()=> t('Fajl je veći od 10 MB.'), download: ()=> t('Fajl nije preuzet iz Telegrama — pošalji ga ponovo.') };
  const tgBusy = () => ['billOverlay', 'receiptOverlay', 'ipsOverlay'].some(id=> document.getElementById(id).classList.contains('show'));
  const tgButtons = (p, saveRow) => [saveRow, [{ text: '✕ ' + t('Odbaci'), data: 'x:' + p.id }, { text: t('Otvori u aplikaciji'), data: 'o:' + p.id }]].filter(Boolean);
  async function tgPendingFile(p){
    if(tgMem.has(p.id)) return tgMem.get(p.id);
    if(!p.file || !(window.desktop && window.desktop.bills && window.desktop.bills.readFile)) return null;
    const r = await window.desktop.bills.readFile(p.file);
    return r && r.ok ? new File([r.bytes], p.fileName || r.name, { type: p.mime || '' }) : null;
  }
  async function tgFile(p){
    const edit = p.progressMessageId ? { editMessageId: p.progressMessageId } : null;
    if(p.fileError || !p.file) return tgReply('✕ ' + (TG_FILE_ERR[p.fileError] || TG_FILE_ERR.download)(), edit);
    const file = new File([b64ToBytes(p.file.base64)], p.file.name, { type: p.file.mime });
    // Isti update stigne ponovo (aplikacija ugasena usred citanja, Telegram ga salje opet): isto cekanje i isti prilog, cita se ponovo
    const prev = p.update_id != null ? tgPending().find(x=> x.update_id === p.update_id) : null;
    const pend = prev || { id: newId(), update_id: p.update_id, created: Date.now(), fileName: p.file.name, mime: p.file.mime, kind: C.photoKindFromCaption(p.caption), messageId: p.progressMessageId || null, tag: tgSenderTag(p), compressed: !!p.file.compressed };
    if(prev && p.progressMessageId) pend.messageId = p.progressMessageId;
    tgPendingPut(pend); // pre cuvanja priloga: posle izlaska usred citanja zna se da prilog vec postoji
    const saveFile = fakeSaveFile || (window.desktop && window.desktop.bills && window.desktop.bills.saveFile);
    if(saveFile && !pend.file){
      const ext = ({ 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' })[p.file.mime] || (/\.(\w+)$/.exec(p.file.name) || [, 'jpg'])[1].toLowerCase();
      try{ const r = await saveFile(new Uint8Array(await file.arrayBuffer()), `${toISODateLocal(new Date())}-telegram-${pend.id}.${ext}`); if(r && r.ok) pend.file = r.name; } catch(e){ /* ostaje u memoriji */ }
    }
    tgMem.set(pend.id, file);
    tgPendingPut(pend);
    if(p.fiscalUrl){
      const f = await readFiscal(p.fiscalUrl);
      if(f.reading){
        if(pend.file && window.desktop && window.desktop.bills) window.desktop.bills.deleteFile(pend.file); // podaci su sa Poreske, slika ne treba
        delete pend.file;
        Object.assign(pend, { kind: 'receipt', fiscal: true, state: mergedReceiptState([{ reading: f.reading }]) });
        tgPendingPut(pend);
        return tgReply(tgReceiptSummary(pend.state, pend), Object.assign({}, edit, { buttons: tgButtons(pend, [{ text: '✓ ' + t('Sačuvaj'), data: 's:' + pend.id }]) }));
      }
    }
    if(!pend.kind) return tgReply(t('Šta je ovo?'), Object.assign({}, edit, { buttons: [
      [{ text: t('Račun iz prodavnice'), data: `k:${pend.id}:receipt` }], [{ text: t('Kućni račun'), data: `k:${pend.id}:bill` }],
      [{ text: t('Uplatnica'), data: `k:${pend.id}:slip` }, { text: '✕ ' + t('Odbaci'), data: 'x:' + pend.id }]] }));
    return tgRead(pend, file);
  }
  // Citanje po vrsti -> stanje na cekanju + sazetak sa dugmadima (ili poruka o gresci / ponovni pokusaj)
  async function tgRead(pend, file){
    const edit = pend.messageId ? { editMessageId: pend.messageId } : {};
    const fail = msg => { tgPendingPut(pend); return tgReply('✕ ' + msg, Object.assign({}, edit, { buttons: tgButtons(pend, null) })); };
    const busyRetry = () => { pend.retryAt = Date.now() + 60000; tgPendingPut(pend); return tgReply(t('AI je zauzet — pokušavam ponovo za minut.'), edit); };
    delete pend.retryAt;
    if(pend.kind === 'receipt'){
      const part = { prep: await prepareBillFile(file, receiptPrepOpts) };
      await readReceiptPart(part, 0);
      pend.fiscal = !!(part.reading && part.reading.source === 'fiscal');
      if(pend.fiscal && pend.file){ if(window.desktop && window.desktop.bills) window.desktop.bills.deleteFile(pend.file); delete pend.file; }
      if(part.errorKind === 'limit') return busyRetry();
      if(part.error) return fail(part.error);
      pend.state = mergedReceiptState([part]);
      tgPendingPut(pend);
      return tgReply(tgReceiptSummary(pend.state, pend), Object.assign({}, edit, { buttons: tgButtons(pend, [{ text: '✓ ' + t('Sačuvaj'), data: 's:' + pend.id }]) }));
    }
    if(pend.kind === 'bill'){
      ensureBillDefaults();
      const r = await readBill(await prepareBillFile(file));
      if(r && r.kind === 'limit') return busyRetry();
      if(!r || !r.reading || !r.reading.billTypeId) return fail((r && r.message) || t('Vrsta računa nije prepoznata — otvori ga u aplikaciji.'));
      pend.state = { reading: r.reading, source: r.source, message: r.message };
      tgPendingPut(pend);
      return tgReply(tgBillSummary(r.reading), Object.assign({}, edit, { buttons: tgButtons(pend, [{ text: '✓ ' + t('Plaćen'), data: `s:${pend.id}:p` }, { text: '✓ ' + t('Za plaćanje'), data: `s:${pend.id}:n` }]) }));
    }
    const status = { textContent: '' };
    const s = await readSlip(file, status, null);
    if(s && s.failed && s.kind === 'limit') return busyRetry();
    if(!s || s.failed) return fail(status.textContent || t('Uplatnica nije pročitana — popuni podatke ručno.'));
    pend.state = { name: s.name || '', account: s.account || '', model: s.model || '', reference: s.reference || '', purpose: s.purpose || '', code: s.code || '', amount: s.amount || 0, currency: s.currency || 'RSD' };
    tgPendingPut(pend);
    return tgReply(tgSlipSummary(pend.state), Object.assign({}, edit, { buttons: tgButtons(pend, pend.state.amount > 0 && pend.state.currency === 'RSD' ? [{ text: '✓ ' + t('Plaćeno'), data: 's:' + pend.id }] : null) }));
  }
  function tgReceiptSummary(st, pend){
    const named = st.items.filter(i=> (i.name || '').trim() || i.price != null);
    const rows = C.receiptToExpenses(named.filter(i=> i.price != null), st.total > 0 ? st.total : null);
    const sum = Math.round(named.reduce((s, i)=> s + (i.price > 0 || i.price < 0 ? i.price : 0), 0) * 100) / 100;
    const total = st.total > 0 ? st.total : sum;
    const dup = st.date && total > 0 ? C.findReceiptDuplicate(entries, st.date, total) : null;
    // puna lista stavki (do 80 redova), da se citanje proveri pre cuvanja
    const list = named.slice(0, 80).map(i=> `• ${(i.name || i.raw || '?').trim()} — ${i.price != null ? fmtNum(i.price, 2) : '?'}`);
    if(named.length > 80) list.push(t('… i još {0}', named.length - 80));
    const lines = [`🧾 ${st.store || t('Prodavnica')} · ${tgDayLabel(st.date)} · ${fmt(total)}`,
      rows.map(r=> `${r.category} ${fmt(r.amount)}`).join(', ') + ` · ${t('{0} stavki', named.length)}`];
    if(dup) lines.push('⚠ ' + t('Ovaj račun je možda već unet ({0}).', st.date));
    if(list.length) lines.push('', ...list);
    if(st.total > 0 && Math.abs(st.total - sum) >= 1) lines.push('', '⚠ ' + t('Zbir stavki je {0}, a ukupno sa računa {1} — proveri listu ili otvori u aplikaciji.', fmtNum(sum, 2), fmtNum(st.total, 2)));
    if(pend && pend.fiscal) lines.push('', '✓ ' + t('Tačni podaci sa računa Poreske uprave (QR kod).'));
    else if(pend && pend.compressed) lines.push('', '💡 ' + t('Za tačne podatke pošalji link sa QR koda (uperi kameru telefona u QR i podeli link), ili sliku kao fajl (📎 → Fajl).'));
    return lines.join('\n');
  }
  function tgBillSummary(r){
    const type = billTypeById(r.billTypeId), loc = locationById(r.locationId || (type && type.locationId));
    const dup = type && r.month ? C.findBillDuplicate(bills, type.id, r.month) : null;
    return `🏠 ${type ? type.name : '?'}${locations.length > 1 && loc ? ' · ' + loc.name : ''} · ${r.month ? monthYearLabelSr(r.month) : '?'} · ${r.amount > 0 ? fmtOrig(r.amount, loc ? loc.currency : 'RSD') : '?'}`
      + (r.dueDate ? ' · ' + t('rok {0}', fmtDocDate(r.dueDate)) : '') + (dup ? '\n⚠ ' + t('Za {0} već postoji račun ({1}).', monthYearLabelSr(r.month), fmtOrig(dup.amount, dup.currency)) : '');
  }
  function tgSlipSummary(s){
    return `🧾 ${s.name || C.formatAccount(s.account)} · ${s.amount > 0 ? fmtOrig(s.amount, s.currency) : '?'}` + (s.purpose ? '\n' + s.purpose : '') + (s.account ? '\n' + C.formatAccount(s.account) : '')
      + (s.currency !== 'RSD' ? '\n⚠ ' + t('Uplatnica nije u dinarima — otvori je u aplikaciji.') : '');
  }
  async function tgFileCallback(p, cb){
    const pend = tgPending().find(x=> x.id === cb.id);
    if(!pend) return { callbackText: t('Ovo više nije na čekanju.'), replies: [] };
    pend.messageId = p.messageId;
    if(cb.action === 'x'){
      tgPendingDrop(pend.id); tgMem.delete(pend.id);
      if(pend.file && window.desktop && window.desktop.bills) window.desktop.bills.deleteFile(pend.file);
      return { callbackText: t('Odbačeno'), replies: [{ editMessageId: p.messageId, text: '✕ ' + t('Odbačeno') }] };
    }
    if(tgBusy()) return { callbackText: t('Na računaru je otvoren prozor za račun — završi ga pa pritisni ponovo.'), replies: [] };
    const file = await tgPendingFile(pend);
    if(cb.action === 'k'){
      if(!['receipt', 'bill', 'slip'].includes(cb.arg)) return { replies: [] };
      if(!file) return tgReply('✕ ' + TG_FILE_ERR.download(), { editMessageId: p.messageId });
      pend.kind = cb.arg; tgPendingPut(pend);
      return tgRead(pend, file);
    }
    if(cb.action === 'o'){
      const dropFile = ()=>{ if(pend.file && window.desktop && window.desktop.bills) window.desktop.bills.deleteFile(pend.file); };
      tgPendingDrop(pend.id); tgMem.delete(pend.id);
      if(window.desktop && window.desktop.showWindow) window.desktop.showWindow();
      const noFileReceipt = !file && pend.kind === 'receipt' && pend.state && !pend.file;
      if(!file && !noFileReceipt){ dropFile(); return tgReply('✕ ' + TG_FILE_ERR.download(), { editMessageId: p.messageId }); }
      if(pend.kind === 'receipt' && pend.state){
        const parts = file ? [{ prep: await prepareBillFile(file, receiptPrepOpts), savedName: pend.file }] : [];
        receipt = Object.assign({ parts, page: 0, edited: true }, pend.state);
        rEl('receiptOverlay').classList.add('show'); renderReceipt();
      } else if(pend.kind === 'bill'){
        ensureBillDefaults();
        const st = pend.state || {};
        openBillReview({ prepared: await prepareBillFile(file), reading: st.reading, message: st.message, source: st.source || 'manual', savedFile: pend.file });
      } else if(pend.kind === 'slip'){
        dropFile(); // IPS prozor cuva svoju kopiju
        openIpsOneOff(file);
      } else { dropFile(); addReceiptFiles([file]); } // prozor za racun cuva svoju kopiju
      return { callbackText: t('Otvoreno u aplikaciji'), replies: [{ editMessageId: p.messageId, text: '↗ ' + t('Otvoreno u aplikaciji') }] };
    }
    if(cb.action === 's' && pend.state){
      let ids = [], label = '', undoExtra = null;
      if(pend.kind === 'receipt'){
        const r = await saveReceiptData(Object.assign({}, pend.state, { attachments: pend.file ? [pend.file] : [], confirmed: true }));
        if(!r.ok) return { callbackText: r.error || t('Nije sačuvano.'), replies: [] };
        tgTagEntries(r.ids, pend.tag);
        ids = r.ids; label = `${pend.state.store || t('Prodavnica')} · ${t('{0} stavki', r.count)}`; undoExtra = { attachments: r.attachments, shopping: r.shoppingBefore };
      } else if(pend.kind === 'bill'){
        if(billReview) return { callbackText: t('Na računaru je otvoren prozor za račun — završi ga pa pritisni ponovo.'), replies: [] };
        const rd = pend.state.reading || {};
        if(rd.billTypeId && rd.month && C.findBillDuplicate(bills, rd.billTypeId, rd.month))
          return { callbackText: t('Za {0} već postoji račun — otvori ga u aplikaciji.', monthYearLabelSr(rd.month)), replies: [] };
        openBillReview({ reading: pend.state.reading, source: pend.state.source, savedFile: pend.file, headless: true });
        if(billEl('billLinkRec')) billEl('billLinkRec').checked = true;
        const ok = await saveBillFromReview(cb.arg === 'p');
        if(!ok){ const msg = billEl('billStatus').textContent; closeBillReview(false, true); return { callbackText: msg || t('Nije sačuvano.'), replies: [] }; }
      } else {
        const s = pend.state;
        const r = window.__desktopBridge.addEntry({ type: 'expense', desc: s.name || s.purpose || t('Uplatnica'), amount: s.amount, currency: 'RSD', date: toISODateLocal(new Date()), category: '', paid: true, tags: pend.tag || '' });
        if(!r.ok) return { callbackText: r.error, replies: [] };
        const e = entries.find(x=> x.id === r.ids[0]);
        if(e){ if(pend.file) e.attachments = [pend.file]; e.payee = C.cleanPayee({ name: s.name, account: s.account, model: s.model, reference: s.reference, purpose: s.purpose, code: s.code }); saveEntries(); }
        ids = r.ids; label = `${s.name || t('Uplatnica')} · ${r.amountText}`; undoExtra = { attachments: pend.file ? [pend.file] : [] };
      }
      tgPendingDrop(pend.id); tgMem.delete(pend.id);
      const logId = ids.length ? tgLog(ids, label, undoExtra) : null;
      const replies = [{ editMessageId: p.messageId, text: '✓ ' + t('Sačuvano') + (label ? ': ' + label : ''), buttons: logId ? [[{ text: t('Poništi'), data: 'u:' + logId }]] : undefined }];
      const sug = pend.kind === 'receipt' ? warrantySuggestions(ids).slice(0, 3) : [];
      if(sug.length) replies.push({ text: '🛡 ' + t('Dodati garanciju (24 meseca)?'), buttons: sug.map(({ entry, item })=>{
        const x = { id: newId(), created: Date.now(), until: Date.now() + 864e5 - 60000, kind: 'warranty', targetId: entry.id, itemIndex: item.index, label: item.name, reminder: true, state: 'open' };
        tgPropPut(x);
        return [{ text: '🛡 ' + String(item.name).slice(0, 40), data: 'c:' + x.id }];
      }) });
      return { callbackText: t('Sačuvano'), replies };
    }
    return { replies: [] };
  }
  async function tgFileTick(){
    const { keep, expired } = C.cleanTelegramPending(tgPending(), Date.now());
    tgSave(TG_PENDING_KEY, keep);
    const replies = [];
    expired.forEach(p=>{ tgMem.delete(p.id); if(p.file && window.desktop && window.desktop.bills) window.desktop.bills.deleteFile(p.file); if(p.messageId) replies.push({ editMessageId: p.messageId, text: t('Isteklo — nije sačuvano.') }); });
    for(const p of keep.filter(x=> x.retryAt && x.retryAt <= Date.now())){
      const file = await tgPendingFile(p);
      if(!file) continue;
      const out = await tgRead(p, file);
      replies.push(...out.replies);
    }
    return { replies };
  }

