  // ---- IPS QR: placanje racuna skeniranjem (NBS standard) ----
  // Pravila (tekst koda, provere racuna i poziva na broj) su u budzet-core.js; ovde prozor, crtanje i citanje slike.
  let ipsState = { r: null, mode: 'pay', lastFocus: null };
  let pendingSlipPayee = null;
  const ipsEl = id => document.getElementById(id);
  function ipsFieldsToPayee(){
    return { account: ipsEl('ipsAccount').value, name: ipsEl('ipsName').value, code: ipsEl('ipsCode').value.trim() || '189',
      purpose: ipsEl('ipsPurpose').value, model: ipsEl('ipsModel').value.trim(), reference: ipsEl('ipsReference').value.trim() };
  }
  function ipsFillFields(p){
    ipsEl('ipsAccount').value = p.account ? C.formatAccount(p.account) : '';
    ipsEl('ipsName').value = p.name || ''; ipsEl('ipsCode').value = p.code || '189';
    ipsEl('ipsPurpose').value = p.purpose || ''; ipsEl('ipsModel').value = p.model || ''; ipsEl('ipsReference').value = p.reference || '';
  }
  function ipsQrSvg(text){
    const qr = qrcode(0, 'M');
    qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
    qr.addData(text, 'Byte');
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
  }
  function ipsDueNow(r){
    const mKey = currentMonthKey();
    return isDueThisMonth(r, mKey) && !isPaid(r, mKey);
  }
  // Racun ovog meseca vezan za stavku ("Sacuvaj za placanje") nosi poziv na broj tog racuna
  function ipsPayee(r){
    if(r.oneOff) return r.payee;
    const mKey = currentMonthKey();
    const b = bills.find(x=> x.recurringId === r.id && (x.expenseMonth || x.month) === mKey && !x.entryId && x.payee);
    return C.payeeWithBillReference(r.payee, b && b.payee);
  }
  function renderIpsPay(){
    const r = ipsState.r, payee = ipsPayee(r);
    const p = Object.assign({}, payee, { amount: parseFloat(ipsEl('ipsAmount').value) });
    const problems = C.ipsProblems(p);
    const text = problems.length ? '' : C.ipsQrString(p);
    ipsEl('ipsQr').innerHTML = problems.length ? `<div class="ips-problems">${problems.map(x=> `<div>${escapeHtml(t(x))}</div>`).join('')}</div>` : ipsQrSvg(text);
    ipsEl('ipsQr').dataset.text = text;
    const row = (k, v) => v ? `<div><span>${k}</span><b translate="no">${escapeHtml(v)}</b></div>` : '';
    ipsEl('ipsInfo').innerHTML = row(t('Primalac'), payee.name) + row(t('Račun'), C.formatAccount(payee.account)) + row(t('Iznos'), fmt(p.amount || 0))
      + row(t('Šifra'), payee.code) + row(t('Svrha'), payee.purpose) + row(t('Poziv na broj'), payee.reference ? (payee.model ? payee.model + ' ' : '') + payee.reference : '');
  }
  function setIpsMode(mode){
    ipsState.mode = mode;
    const r = ipsState.r;
    ipsEl('ipsPay').style.display = mode === 'pay' ? '' : 'none';
    ipsEl('ipsEdit').style.display = mode === 'edit' ? '' : 'none';
    ipsEl('ipsTitle').textContent = r.oneOff ? t('Plati uplatnicu: {0}', r.desc) : mode === 'pay' ? t('Plati QR kodom: {0}', r.desc) : t('Podaci za plaćanje: {0}', r.desc);
    ipsEl('ipsEditBtn').style.display = mode === 'pay' ? '' : 'none';
    ipsEl('ipsRemoveBtn').style.display = mode === 'edit' && r.payee && !r.oneOff ? '' : 'none';
    ipsEl('ipsOneOff').style.display = r.oneOff && mode === 'pay' ? '' : 'none';
    const primary = ipsEl('ipsPrimary');
    if(mode === 'edit'){ primary.style.display = ''; primary.textContent = r.oneOff ? t('Dalje') : t('Sačuvaj'); ipsEl('ipsProblems').innerHTML = ''; if(!r.oneOff) ipsEl('ipsImageStatus').textContent = ''; ipsFillFields(r.payee || {}); }
    else {
      const due = r.oneOff || ipsDueNow(r);
      primary.style.display = due ? '' : 'none';
      primary.textContent = t('Plaćeno');
      ipsEl('ipsPayHint').textContent = due ? t('Otvori aplikaciju svoje banke, izaberi skeniranje IPS QR koda i usmeri telefon na ekran. Posle plaćanja klikni „Plaćeno“.')
        : t('Ova stavka je za ovaj mesec već plaćena ili nije na redu — kod možeš da iskoristiš ako plaćaš ranije.');
      const amt = r.oneOff ? (r.slipAmount || 0) : suggestedPayAmount(r);
      ipsEl('ipsAmount').value = amt > 0 ? String(Math.round(amt * 100) / 100) : '';
      if(r.oneOff){
        const cat = ipsEl('ipsOneOffCat').value || (expenseCats.includes('Stanovanje') ? 'Stanovanje' : expenseCats[0]);
        ipsEl('ipsOneOffCat').innerHTML = expenseCats.map(c=> `<option value="${escapeHtml(c)}"${c === cat ? ' selected' : ''} translate="no">${escapeHtml(c)}</option>`).join('');
        if(!ipsEl('ipsOneOffDate').value) ipsEl('ipsOneOffDate').value = toISODateLocal(new Date());
      }
      renderIpsPay();
    }
  }
  function openIps(r, mode){
    ipsState = { r, mode, lastFocus: document.activeElement };
    ipsEl('ipsOverlay').classList.add('show');
    setIpsMode(mode);
    setTimeout(()=> (mode === 'edit' ? ipsEl('ipsAccount') : ipsEl('ipsAmount')).focus(), 0);
  }
  function closeIps(){
    ipsEl('ipsOverlay').classList.remove('show');
    if(ipsState.lastFocus && ipsState.lastFocus.focus) ipsState.lastFocus.focus();
  }
  if(IS_TEST) window.__openIps = (rid, mode) => { const r = recurring.find(x=> x.id === rid); if(r) openIps(r, mode || (r.payee ? 'pay' : 'edit')); };
  ipsEl('ipsAmount').addEventListener('input', renderIpsPay);
  ipsEl('ipsClose').addEventListener('click', closeIps);
  ipsEl('ipsOverlay').addEventListener('click', e=>{ if(e.target.id === 'ipsOverlay') closeIps(); });
  ipsEl('ipsEditBtn').addEventListener('click', ()=> setIpsMode('edit'));
  ipsEl('ipsRemoveBtn').addEventListener('click', ()=>{
    const r = ipsState.r, prev = r.payee;
    delete r.payee; saveRecurring(); closeIps(); renderAll();
    showUndoToast(t('Uklonjeni podaci za plaćanje: {0}', r.desc), ()=>{ r.payee = prev; saveRecurring(); renderAll(); });
  });
  ipsEl('ipsPrimary').addEventListener('click', async ()=>{
    const r = ipsState.r;
    if(ipsState.mode === 'edit'){
      const p = ipsFieldsToPayee();
      const problems = C.ipsProblems(Object.assign({}, p, { amount: 1 }));
      if(problems.length){ ipsEl('ipsProblems').innerHTML = problems.map(x=> `<div>${escapeHtml(t(x))}</div>`).join(''); return; }
      r.payee = C.cleanPayee(p);
      // fokus ide na iznos, da Enter na "Dalje"/"Sacuvaj" ne bi odmah pritisnuo "Placeno" na istom dugmetu
      if(r.oneOff){ r.desc = (r.payee.name || '').split(',')[0].trim() || t('Uplatnica'); setIpsMode('pay'); ipsEl('ipsAmount').focus(); return; }
      saveRecurring(); renderAll();
      setIpsMode('pay'); ipsEl('ipsAmount').focus();
      return;
    }
    const amount = parseFloat(ipsEl('ipsAmount').value);
    if(r.oneOff){ await payOneOffSlip(r, amount); return; }
    closeIps();
    togglePaid(r, true, amount > 0 ? amount : undefined);
  });
  // Jednokratna uplatnica: rashod (sa slikom uplatnice kao prilogom), po zelji i nova ponavljajuca stavka
  async function payOneOffSlip(r, amount){
    if(!(amount > 0)){ ipsEl('ipsPayHint').textContent = t('Upiši iznos veći od nule.'); return; }
    const primary = ipsEl('ipsPrimary');
    if(primary.disabled) return;
    amount = Math.round(amount * 100) / 100;
    // sve iz forme se cita pre cekanja na cuvanje priloga
    const category = ipsEl('ipsOneOffCat').value || expenseCats[0];
    const date = /^\d{4}-\d{2}-\d{2}$/.test(ipsEl('ipsOneOffDate').value) ? ipsEl('ipsOneOffDate').value : toISODateLocal(new Date());
    let makeRec = ipsEl('ipsMakeRec').checked;
    const dupRec = makeRec ? C.findRecurringByPayee(recurring, r.payee) : null;
    // isti primalac i naziv, drugi poziv na broj: pitaj pre nove ponavljajuce (drugi stan ili poziv koji se menja svakog meseca)
    const nameTwin = makeRec && !dupRec && r.payee ? C.findRecurringByPayee(recurring, { account: r.payee.account, name: r.payee.name }) : null;
    if(nameTwin && !(await appConfirm(t('Već postoji ponavljajuća „{0}“ za istog primaoca, sa drugim pozivom na broj. Napraviti još jednu?', nameTwin.desc), { okText: t('Napravi novu'), cancelText: t('Samo rashod') }))){
      makeRec = false;
    }
    primary.disabled = true;
    let attachment = null;
    try{
      const prep = r.slipPrep;
      if(prep && prep.bytes && window.desktop && window.desktop.bills){
        const res = await window.desktop.bills.saveFile(prep.bytes, `${date}-uplatnica-${billSlug(r.desc)}.${prep.ext}`);
        if(res && res.ok) attachment = res.name;
      }
    } catch(e){ attachment = null; }
    finally { primary.disabled = false; }
    let entryId, rec = null;
    if(makeRec && !dupRec){
      rec = { id: newId(), desc: r.desc, amount, category, type: 'expense', day: C.clampRecurringDay(parseInt(date.slice(8), 10)), frequency: 'monthly', anchorMonth: 1, isSubscription: false, autoPay: false, payee: r.payee };
      if(accounts.length) rec.accountId = defaultAccountId();
      recurring.push(rec);
      entryId = markRecurringPaid(rec, date.slice(0, 7), amount);
    } else {
      const e = { id: newId(), type: 'expense', desc: r.desc, amount, category, date, paid: true, tags: [] };
      if(accounts.length) e.accountId = defaultAccountId();
      entries.push(e); entryId = e.id;
    }
    const entry = entries.find(e=> e.id === entryId);
    if(entry && attachment) entry.attachments = [attachment];
    saveEntries(); saveRecurring(); saveApplied();
    closeIps(); renderAll();
    showUndoToast(dupRec ? t('Plaćena uplatnica: {0}. Ponavljajuća za ovog primaoca već postoji ({1}), pa nova nije napravljena.', r.desc, dupRec.desc) : t('Plaćena uplatnica: {0}', r.desc), ()=>{
      entries = entries.filter(e=> e.id !== entryId);
      if(rec){ recurring = recurring.filter(x=> x.id !== rec.id); Object.keys(applied).forEach(k=> { applied[k] = (applied[k] || []).filter(id=> id !== rec.id); }); }
      saveEntries(); saveRecurring(); saveApplied(); renderAll();
    });
  }
  // Prilog jednokratne uplatnice (ime iz payOneOffSlip) — nije racun iz prodavnice, nema garancije
  const isSlipAttachment = name => /-uplatnica-/.test(String(name || ''));
  // Jednokratno: prozor se otvara odmah (izmena), podaci stizu sa uplatnice
  async function openIpsOneOff(file){
    const r = { id: null, desc: t('Uplatnica'), oneOff: true, payee: null, slipAmount: 0, slipPrep: null };
    ipsState = { r, mode: 'edit', lastFocus: document.activeElement };
    ipsEl('ipsQr').innerHTML = ''; ipsEl('ipsProblems').innerHTML = ''; ipsEl('ipsMakeRec').checked = false; ipsEl('ipsOneOffDate').value = '';
    ipsEl('ipsOneOffCat').innerHTML = '';   // kategorija prethodne uplatnice se ne prenosi
    ipsEl('ipsOverlay').classList.add('show');
    setIpsMode('edit');
    setTimeout(()=> ipsEl('ipsAccount').focus(), 0);
    if(file) await applySlipToEdit(file);
  }
  if(IS_TEST) window.__openIpsOneOff = openIpsOneOff;
  document.getElementById('expSlipBtn').addEventListener('click', ()=> document.getElementById('expSlipInput').click());
  document.getElementById('expSlipInput').addEventListener('change', e=>{ const f = e.target.files[0]; e.target.value = ''; if(f) openIpsOneOff(f); });
  // Slika -> tekst QR koda (jsQR); veliki snimci se prvo smanje, pa se proba jos jednom manje
  async function decodeQrImage(blob){
    const bmp = await createImageBitmap(blob);
    for(const max of [2000, 1000, 600]){
      const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
      const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(bmp, 0, 0, w, h);
      const res = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'attemptBoth' });
      if(res && res.data) return res.data;
    }
    return null;
  }
  let fakeSlipReading = null; // test: zamenjuje Groq poziv za uplatnicu (req -> { ok, content })
  if(IS_TEST) Object.defineProperty(window, '__fakeSlipReading', { get: ()=> fakeSlipReading, set: v=>{ fakeSlipReading = v; }, configurable: true });
  // Uplatnica (slika ili PDF): prvo IPS QR lokalno, a bez QR-a AI procita polja naloga (proverava ih ipsProblems)
  async function readSlip(blob, statusEl, isCurrent){
    const say = msg => { if(!isCurrent || isCurrent()) statusEl.textContent = msg; };
    say(t('Čitam uplatnicu…'));
    const isPdf = blob.type === 'application/pdf' || /\.pdf$/i.test(blob.name || '');
    let p = null, notIps = false;
    if(!isPdf){ try{ const txt = await decodeQrImage(blob); p = txt ? C.parseIpsQr(txt) : null; notIps = !!txt && !p; } catch(e){ /* nije slika */ } }
    let prep = null;
    try{ prep = await prepareBillFile(blob); } catch(e){ prep = null; }
    if(!p && prep && prep.canvases.length) p = await findQrInPrepared(prep);
    if(p){ p.source = 'qr'; p.prep = prep; say(t('Pročitano: {0}{1}', p.name || C.formatAccount(p.account), p.amount ? ' · ' + fmt(p.amount) : '')); return p; }
    if(!prep || prep.error){ say((prep && prep.error) || t('QR kod nije pronađen na slici — probaj oštriji ili veći snimak.')); return prep ? { failed: true, prep } : null; }
    if(!(fakeSlipReading || (window.desktop && window.desktop.bills))){
      say(notIps ? t('Ovo nije IPS QR kod uplatnice.') : t('QR kod nije pronađen, a AI čitanje nije podešeno (Podešavanja → AI čitanje računa).'));
      return { failed: true, prep };
    }
    say(t('QR kod nije pronađen — čitam uplatnicu preko AI…'));
    const req = { images: prep.images, text: prep.text, prompt: C.slipPrompt() };
    let res;
    try{ res = fakeSlipReading ? await fakeSlipReading(req) : await window.desktop.bills.read(req); }
    catch(e){ res = { ok: false, kind: 'http', message: String(e && e.message || e) }; }
    if(!res || !res.ok){ say((BILL_ERR[res && res.kind] || BILL_ERR.http)(res || {})); return prep ? { failed: true, prep, kind: (res && res.kind) || 'http' } : null; } // kind 'limit' = AI zauzet (Telegram pokusava ponovo)
    const got = C.cleanSlipReading(res.content);
    if(!got){ say(t('Uplatnica nije pročitana — popuni podatke ručno.')); return prep ? { failed: true, prep } : null; }
    p = Object.assign(got, { source: 'ai', prep });
    say(t('Pročitano sa slike (AI) — proveri podatke: {0}{1}', p.name || C.formatAccount(p.account), p.amount ? ' · ' + fmt(p.amount) : ''));
    return p;
  }
  const slipProblemsHtml = p => C.ipsProblems(Object.assign({}, p, { amount: p.amount || 1 })).map(x=> `<div>${escapeHtml(t(x))}</div>`).join('')
    + C.slipWarnings(p).map(x=> `<div class="ips-warn">${escapeHtml(t(x))}</div>`).join('');
  if(IS_TEST) window.__readSlipText = text => C.parseIpsQr(text);
  if(IS_TEST) window.__readSlipBlob = blob => readSlip(blob, document.getElementById('recSlipStatus'));
  async function applySlipToEdit(blob){
    const st = ipsState;
    const isCurrent = ()=> ipsState === st && ipsEl('ipsOverlay').classList.contains('show');
    const p = await readSlip(blob, ipsEl('ipsImageStatus'), isCurrent);
    if(!p || !isCurrent()) return;
    if(p.failed){ if(st.r && st.r.oneOff) st.r.slipPrep = p.prep || null; return; }
    ipsFillFields(p);
    const sc = slipCurrency(p);
    ipsEl('ipsProblems').innerHTML = (p.source === 'ai' ? slipProblemsHtml(p) : '') + (sc ? `<div class="ips-warn">${escapeHtml(sc.text)}</div>` : '');
    if(st.r && st.r.oneOff){ st.r.slipAmount = sc ? sc.amount : (p.amount || 0); st.r.slipPrep = p.prep || null; }
  }
  // IPS QR placa samo u dinarima: uplatnica u drugoj valuti -> iznos po srednjem kursu (ili prazan bez kursa) i upozorenje
  function slipCurrency(p){
    const cur = p && p.currency && p.currency !== 'RSD' ? p.currency : '';
    if(!cur) return null;
    const rate = fx.rates && fx.rates[cur];
    const amount = rate && p.amount > 0 ? Math.round(p.amount * rate * 100) / 100 : 0;
    return { cur, amount, text: amount
      ? t('Uplatnica je u valuti {0} ({1}) — IPS QR plaća samo u dinarima, pa je iznos preračunat po srednjem kursu NBS. Proveri ga pre plaćanja.', cur, fmtOrig(p.amount, cur))
      : t('Uplatnica je u valuti {0} — IPS QR plaća samo u dinarima. Upiši iznos u dinarima.', cur) };
  }
  async function applySlipToNew(blob){
    const p = await readSlip(blob, document.getElementById('recSlipStatus'));
    if(!p || p.failed) return;
    const aiMsg = document.getElementById('recSlipStatus').textContent;
    fillRecFormFromSlip(p);
    if(p.source === 'ai'){
      const probs = C.ipsProblems(Object.assign({}, p, { amount: p.amount || 1 }));
      // podaci sa greskom se ne cuvaju uz stavku; ispravljaju se kasnije u prozoru "Podaci za placanje"
      if(probs.length) pendingSlipPayee = null;
      const notes = probs.map(x=> t(x)).concat(C.slipWarnings(p).map(x=> t(x)));
      document.getElementById('recSlipStatus').textContent = aiMsg + (notes.length ? ' ' + notes.join(' ') : '')
        + (probs.length ? ' ' + t('Podaci za plaćanje nisu sačuvani uz stavku — dodaj ih ispravne preko dugmeta QR.') : '');
    }
  }
  function fillRecFormFromSlip(p){
    if(currentRecType !== 'expense') document.getElementById('recTypeExpense').click();
    const desc = document.getElementById('recDesc');
    if(!desc.value.trim()) desc.value = p.name.split(',')[0].trim();
    if(p.amount) document.getElementById('recAmount').value = String(p.amount);
    // valuta sa uplatnice (stavka se preracunava u dinare kao i rucno uneta u stranoj valuti)
    const recCur = document.getElementById('recCurrency');
    const slipCur = p.currency && [...recCur.options].some(o=> o.value === p.currency) ? p.currency : 'RSD';
    if(recCur.value !== slipCur){ recCur.value = slipCur; updateCurrencyHint('rec'); }
    pendingSlipPayee = C.cleanPayee(p);
    document.getElementById('recSlipStatus').textContent = t('Podaci za plaćanje sa uplatnice biće sačuvani uz stavku ({0}).', C.formatAccount(p.account));
    desc.focus();
  }
  if(IS_TEST) window.__fillRecFromSlipText = text => { const p = C.parseIpsQr(text); if(p) fillRecFormFromSlip(p); return !!p; };
  ipsEl('ipsFromImageBtn').addEventListener('click', ()=> ipsEl('ipsImageInput').click());
  ipsEl('ipsImageInput').addEventListener('change', e=>{ const f = e.target.files[0]; e.target.value = ''; if(f) applySlipToEdit(f); });
  document.getElementById('recFromSlipBtn').addEventListener('click', ()=> document.getElementById('recSlipInput').click());
  document.getElementById('recSlipInput').addEventListener('change', e=>{ const f = e.target.files[0]; e.target.value = ''; if(f) applySlipToNew(f); });
  // Ctrl+V sa slikom: u prozoru za podatke o placanju, ili na ekranu Ponavljajuce (nova stavka)
  document.addEventListener('paste', e=>{
    const item = [...(e.clipboardData ? e.clipboardData.items : [])].find(i=> i.type && i.type.startsWith('image/'));
    if(!item) return;
    const blob = item.getAsFile();
    if(ipsEl('ipsOverlay').classList.contains('show') && ipsState.mode === 'edit'){ e.preventDefault(); applySlipToEdit(blob); return; }
    if(activeScreen === 'ponavljajuce' && !document.querySelector('.modal-overlay.show')){ e.preventDefault(); applySlipToNew(blob); }
  });

