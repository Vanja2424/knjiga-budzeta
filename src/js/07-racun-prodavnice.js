  // ---------- Fiskalni racun iz prodavnice: slike (delovi) -> Groq po delu -> spajanje -> stavke/kategorije/lista -> rashodi ----------
  const RECEIPT_MAX_SIDE = 2000;
  let fakeReceiptReading = null; // test: (req, partIndex) -> { ok, content }
  if(IS_TEST) Object.defineProperty(window, '__fakeReceiptReading', { get: ()=> fakeReceiptReading, set: v=>{ fakeReceiptReading = v; }, configurable: true });
  let fakeSaveFile = null; // test: (bytes, name) -> { ok, name }
  if(IS_TEST) Object.defineProperty(window, '__fakeSaveFile', { get: ()=> fakeSaveFile, set: v=>{ fakeSaveFile = v; }, configurable: true });
  let receipt = null; // { parts: [{ prep, reading, error }], items, store, date, total, page, resolve, duplicate, diff }
  const rEl = id => document.getElementById(id);
  const defaultShopCat = () => expenseCats.includes('Ostalo') ? 'Ostalo' : (expenseCats[0] || 'Ostalo');
  const emptyReceiptItem = () => ({ raw: '', name: '', qty: 1, unit: '', price: null, category: defaultShopCat(), discount: false });
  // ---- Fiskalni racun (Srbija): QR -> stranica Poreske uprave -> tacne stavke (AI samo predlaze kategorije po nazivu) ----
  let fakeFiscal = null, fakeFiscalCategories = null; // test: url -> { ok, html, spec } / req -> { ok, content }
  if(IS_TEST) Object.defineProperty(window, '__fakeFiscal', { get: ()=> fakeFiscal, set: v=>{ fakeFiscal = v; }, configurable: true });
  if(IS_TEST) Object.defineProperty(window, '__fakeFiscalCategories', { get: ()=> fakeFiscalCategories, set: v=>{ fakeFiscalCategories = v; }, configurable: true });
  async function fiscalCategories(reading){
    const names = reading.items.map(i=> i.name);
    if(!names.length) return;
    const req = { images: [], text: '', prompt: C.receiptCategoryPrompt(expenseCats, names) };
    let res = null;
    try{ res = fakeFiscalCategories ? await fakeFiscalCategories(req) : (window.desktop && window.desktop.bills ? await window.desktop.bills.read(req) : null); } catch(e){ res = null; }
    if(!res || !res.ok) return;
    C.cleanReceiptCategories(res.content, expenseCats, names.length).forEach((c, i)=>{ if(c) reading.items[i].category = c; });
  }
  async function readFiscal(url){
    let res;
    try{ res = fakeFiscal ? await fakeFiscal(url) : (window.desktop && window.desktop.bills && window.desktop.bills.fiscal ? await window.desktop.bills.fiscal(url) : { ok: false, kind: 'desktop' }); }
    catch(e){ res = { ok: false, kind: 'network' }; }
    const fail = kind => ({ error: t('Podaci sa stranice Poreske uprave nisu preuzeti ({0}). Proveri internet ili pošalji sliku računa.', kind) });
    if(!res || !res.ok) return fail(res && res.kind || '?');
    const page = C.parseSufPage(res.html);
    const items = C.sufItems(res.spec) || C.sufJournalItems(page.journal);
    if(!items.length && page.total == null) return fail(t('nema podataka o računu'));
    const reading = C.sufReading(page, items);
    reading.fiscalUrl = url;
    await fiscalCategories(reading);
    return { reading };
  }
  // QR fiskalnog racuna je gust: trazi se u punoj rezoluciji i u donjoj polovini (tamo stoji), pa umanjeno
  async function decodeFiscalQr(blob){
    const bmp = await createImageBitmap(blob);
    const W = bmp.width, H = bmp.height;
    for(const [sx, sy, sw, sh, max] of [[0, 0, W, H, 4000], [0, Math.round(H * 0.5), W, H - Math.round(H * 0.5), 3000], [0, 0, W, H, 2000], [0, 0, W, H, 1000]]){
      const scale = Math.min(1, max / Math.max(sw, sh));
      const w = Math.max(1, Math.round(sw * scale)), h = Math.max(1, Math.round(sh * scale));
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, w, h);
      const res = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'attemptBoth' });
      if(res && res.data) return res.data;
    }
    return null;
  }
  async function fiscalFromPrepared(prep){
    let txt = null;
    if(prep.bytes && prep.ext !== 'pdf' && window.desktop && window.desktop.bills && window.desktop.bills.decodeQr){
      try{ txt = await window.desktop.bills.decodeQr(prep.bytes); } catch(e){ txt = null; }
      if(!C.fiscalUrlFrom(txt)) txt = null;
    }
    if(!txt && prep.bytes && prep.ext !== 'pdf'){ try{ txt = await decodeFiscalQr(new Blob([prep.bytes])); } catch(e){ txt = null; } }
    for(const cv of (txt ? [] : prep.canvases || [])){ try{ txt = await decodeQrImage(cv); } catch(e){ txt = null; } if(txt) break; }
    const url = C.fiscalUrlFrom(txt);
    return url ? readFiscal(url) : null;
  }
  async function readReceiptPart(part, idx){
    part.error = part.prep.error || '';
    delete part.errorKind;
    part.reading = part.error ? null : part.reading;
    if(part.error) return;
    // QR fiskalnog racuna -> tacni podaci Poreske uprave; bez QR-a (ili bez interneta) cita AI kao do sada
    const fiscal = await fiscalFromPrepared(part.prep);
    if(fiscal && fiscal.reading){ part.reading = fiscal.reading; return; }
    const canAi = !!fakeReceiptReading || !!(window.desktop && window.desktop.bills);
    if(!canAi){ part.error = BILL_ERR.nokey(); return; }
    const req = { images: part.prep.images, text: part.prep.text, prompt: C.receiptPrompt(expenseCats) };
    let res;
    try{ res = fakeReceiptReading ? await fakeReceiptReading(req, idx) : await window.desktop.bills.read(req); }
    catch(e){ res = { ok: false, kind: 'http', message: String(e && e.message || e) }; }
    if(res && res.ok){
      part.reading = C.cleanReceiptReading(res.content, { categories: expenseCats });
      if(!part.reading) part.error = t('AI odgovor nije mogao da se pročita. Popuni podatke ručno.');
    } else { part.reading = null; part.errorKind = res && res.kind; part.error = (BILL_ERR[res && res.kind] || BILL_ERR.http)(res || {}); }
  }
  // stavke posle popusta, sa kategorijom trazene stavke sa liste (i po pocetku imena: "Sapun" ~ "Sapun Dove 100g"),
  // pa iz memorije (lista/istorija), pa predlog AI-ja, pa Ostalo
  function receiptItemsWithCategories(list){
    const memory = C.itemCategoryMemory(entries, shopping.items);
    const items = C.applyReceiptDiscounts(list);
    const fromList = new Map(C.matchReceiptToShopping(items, shopping.items).map(m=> [m.receiptIndex, shopCategoryOf(shopping.items.find(s=> s.id === m.shoppingId) || {})]));
    return items.map((i, idx)=> Object.assign({}, i, { category: fromList.get(idx) || memory.get(C.itemKey(i.name)) || i.category || defaultShopCat() }));
  }
  // Novi deo (dodat ili ponovo procitan): bez korisnikovih izmena -> sve iz pocetka; sa izmenama -> samo taj deo na njegovo mesto
  function applyReceiptPart(idx){
    const part = receipt.parts[idx];
    if(!receipt.edited || !part.reading){ rebuildReceiptItems(); return; }
    receipt.items = C.insertReceiptPart(receipt.items.filter(i=> (i.name || '').trim() || i.price != null), idx, receiptItemsWithCategories(part.reading.items.map(i=> Object.assign({}, i, { part: idx }))));
    if(!receipt.items.length) receipt.items = [emptyReceiptItem()];
    if(!receipt.storeTouched && !receipt.store) receipt.store = part.reading.store;
    if(!receipt.totalTouched && part.reading.total != null) receipt.total = part.reading.total;
  }
  // Spojeni delovi -> stavke (sa kategorijama), prodavnica, datum, ukupno (i za Telegram, bez prozora)
  function mergedReceiptState(parts){
    const merged = C.mergeReceiptParts(parts.map(p=> p.reading)) || { store: '', date: '', total: null, items: [] };
    const items = receiptItemsWithCategories(merged.items);
    const fiscalUrl = parts.map(p=> p.reading && p.reading.fiscalUrl).find(Boolean) || '';
    return { items: items.length ? items : [emptyReceiptItem()], store: merged.store || '', date: merged.date || toISODateLocal(new Date()), total: merged.total, fiscalUrl };
  }
  function rebuildReceiptItems(){
    const st = mergedReceiptState(receipt.parts);
    receipt.items = st.items;
    if(!receipt.storeTouched) receipt.store = st.store;
    if(!receipt.dateTouched) receipt.date = st.date;
    if(!receipt.totalTouched) receipt.total = st.total;
    receipt.fiscalUrl = st.fiscalUrl;
  }
  function renderReceipt(){
    const p = receipt.parts[receipt.page];
    rEl('receiptPreview').innerHTML = p && p.prep.images[0] ? `<img src="${p.prep.images[0]}" alt="${escapeHtml(t('Pregled računa'))}">` : `<div class="hint" style="padding:2em;">${escapeHtml(t('Nema pregleda.'))}</div>`;
    rEl('receiptPartLabel').textContent = receipt.parts.length > 1 ? t('Deo {0} od {1}', receipt.page + 1, receipt.parts.length) : '';
    ['receiptPrev', 'receiptNext'].forEach(id=> { rEl(id).style.display = receipt.parts.length > 1 ? '' : 'none'; });
    rEl('receiptRetry').style.display = p && p.error && !p.prep.error ? '' : 'none';
    setReceiptBusy(!!receipt.busy);
    rEl('receiptStore').value = receipt.store || ''; rEl('receiptDate').value = receipt.date || ''; rEl('receiptTotal').value = receipt.total != null ? String(receipt.total) : '';
    const matched = new Set(C.matchReceiptToShopping(receipt.items, shopping.items).map(m=> m.receiptIndex));
    const catOpts = sel => expenseCats.map(c=> `<option value="${escapeHtml(c)}"${c === sel ? ' selected' : ''} translate="no">${escapeHtml(c)}</option>`).join('');
    rEl('receiptItems').innerHTML = receipt.items.map((i, idx)=> `<div class="receipt-row${i.price == null ? ' bill-low' : ''}" data-i="${idx}">
      <div class="rc-name"><input type="text" data-f="name" value="${escapeHtml(i.name)}" translate="no" aria-label="${escapeHtml(t('Stavka'))}" title="${escapeHtml(i.raw)}">${matched.has(idx) ? `<span class="rc-matched">${escapeHtml(t('sa liste ✓'))}</span>` : ''}</div>
      <select data-f="category" aria-label="${escapeHtml(t('Kategorija'))}">${catOpts(i.category)}</select>
      <input type="number" step="0.01" data-f="price" value="${i.price != null ? i.price : ''}" aria-label="${escapeHtml(t('Cena'))}">
      <button type="button" class="del-btn rc-del" aria-label="${escapeHtml(t('Ukloni stavku'))}">×</button></div>`).join('');
    renderReceiptSums();
    renderReceiptStatus();
  }
  function renderReceiptStatus(){
    const errs = receipt.parts.map((pp, i)=> pp.error ? (receipt.parts.length > 1 ? t('Deo {0} nije pročitan ({1})', i + 1, pp.error) : pp.error) : '').filter(Boolean);
    const dup = receipt.date && receipt.total > 0 ? C.findReceiptDuplicate(entries, receipt.date, receipt.total) : null;
    receipt.duplicate = dup;
    rEl('receiptStatus').textContent = [dup ? t('Ovaj račun je možda već unet ({0}).', receipt.date) : '', ...errs].filter(Boolean).join(' ');
  }
  function renderReceiptSums(){
    const rows = C.receiptToExpenses(receipt.items, null);
    const sum = Math.round(rows.reduce((s, r)=> s + r.amount, 0) * 100) / 100;
    rEl('receiptSums').innerHTML = rows.length ? rows.map(r=> `<span translate="no">${escapeHtml(r.category)}</span>: ${escapeHtml(fmtNum(r.amount, 2))}`).join(' · ') + ' · ' + escapeHtml(t('Stavke ukupno: {0}', fmtNum(sum, 2))) : '';
    const total = parseFloat(rEl('receiptTotal').value);
    const diff = total > 0 ? Math.round((total - sum) * 100) / 100 : 0;
    // stavke vece od ukupnog (vise od 1%, bar 10 din): verovatno pogresno procitana cena ili propusten popust
    const over = diff < 0 && -diff >= Math.max(10, total * 0.01);
    rEl('receiptDiff').textContent = over ? t('Stavke su veće od ukupnog za {0} — proveri cene ili popust koji nedostaje.', fmtNum(-diff, 2))
      : Math.abs(diff) >= 0.5 ? t('Razlika: {0}', fmtNum(diff, 2)) : '';
    rEl('receiptAddDiff').style.display = diff >= 0.5 ? '' : 'none';
    receipt.diff = diff;
  }
  const receiptPrepOpts = { maxSide: RECEIPT_MAX_SIDE, maxPages: 1 };
  // tokom citanja: bez dodavanja dela, ponavljanja i cuvanja (redosled delova i stanje ostaju ispravni)
  function setReceiptBusy(busy){ ['receiptAddPart', 'receiptRetry', 'receiptSave'].forEach(id=> { rEl(id).disabled = !!busy; }); }
  async function addReceiptFiles(files){
    const list = Array.from(files || []); if(!list.length) return;
    receipt = { parts: [], items: [], page: 0 };
    rEl('receiptStatus').textContent = t('Čitam račun…'); rEl('receiptItems').innerHTML = ''; rEl('receiptPreview').innerHTML = ''; rEl('receiptSums').innerHTML = ''; rEl('receiptDiff').textContent = '';
    receipt.busy = true; setReceiptBusy(true);
    rEl('receiptOverlay').classList.add('show');
    const done = new Promise(res=>{ receipt.resolve = res; });
    const r = receipt;
    for(const f of list){
      if(receipt !== r) break; // zatvoren: ostali delovi se ne salju
      const part = { prep: await prepareBillFile(f, receiptPrepOpts) };
      if(receipt !== r) break;
      r.parts.push(part); await readReceiptPart(part, r.parts.length - 1);
    }
    if(receipt !== r) return done;
    r.busy = false;
    rebuildReceiptItems(); renderReceipt();
    return done;
  }
  if(IS_TEST) window.__addReceiptFiles = addReceiptFiles;
  if(IS_TEST) window.__receiptState = ()=> receipt;
  function closeReceipt(saved){
    rEl('receiptOverlay').classList.remove('show');
    if(!saved && receipt && window.desktop && window.desktop.bills) receipt.parts.forEach(p=>{ if(p.savedName) window.desktop.bills.deleteFile(p.savedName); });
    const res = receipt && receipt.resolve; receipt = null; if(res) res(!!saved);
  }
  rEl('receiptItems').addEventListener('input', e=>{
    const row = e.target.closest('.receipt-row'); if(!row || !receipt) return;
    const it = receipt.items[+row.dataset.i]; const f = e.target.dataset.f;
    receipt.edited = true;
    if(f === 'name') it.name = e.target.value;
    if(f === 'price'){ const v = parseFloat(e.target.value); it.price = Number.isFinite(v) ? v : null; row.classList.toggle('bill-low', it.price == null); }
    renderReceiptSums();
  });
  rEl('receiptItems').addEventListener('change', e=>{ const row = e.target.closest('.receipt-row'); if(row && receipt && e.target.dataset.f === 'category'){ receipt.edited = true; receipt.items[+row.dataset.i].category = e.target.value; renderReceiptSums(); } });
  rEl('receiptItems').addEventListener('click', e=>{ const b = e.target.closest('.rc-del'); if(!b || !receipt) return; receipt.edited = true; receipt.items.splice(+b.closest('.receipt-row').dataset.i, 1); if(!receipt.items.length) receipt.items.push(emptyReceiptItem()); renderReceipt(); });
  rEl('receiptAddItem').addEventListener('click', ()=>{ if(!receipt) return; receipt.edited = true; receipt.items.push(emptyReceiptItem()); renderReceipt(); });
  rEl('receiptAddDiff').addEventListener('click', ()=>{ if(!receipt || !(receipt.diff > 0)) return; receipt.edited = true; receipt.items.push(Object.assign(emptyReceiptItem(), { name: t('Razlika do ukupnog'), price: receipt.diff })); renderReceipt(); });
  rEl('receiptStore').addEventListener('input', e=>{ if(receipt){ receipt.store = e.target.value; receipt.storeTouched = true; } });
  rEl('receiptDate').addEventListener('change', e=>{ if(receipt){ receipt.date = e.target.value; receipt.dateTouched = true; renderReceipt(); } });
  rEl('receiptTotal').addEventListener('input', e=>{ if(receipt){ const v = parseFloat(e.target.value); receipt.total = Number.isFinite(v) ? v : null; receipt.totalTouched = true; renderReceiptSums(); renderReceiptStatus(); } });
  const flipReceipt = d => { if(!receipt || receipt.parts.length < 2) return; receipt.page = (receipt.page + receipt.parts.length + d) % receipt.parts.length; renderReceipt(); };
  rEl('receiptPrev').addEventListener('click', ()=> flipReceipt(-1));
  rEl('receiptNext').addEventListener('click', ()=> flipReceipt(1));
  rEl('receiptAddPart').addEventListener('click', ()=> rEl('receiptPartInput').click());
  rEl('receiptPartInput').addEventListener('change', async e=>{
    const f = e.target.files[0]; e.target.value = ''; if(!f || !receipt || receipt.busy) return;
    const r = receipt; r.busy = true; setReceiptBusy(true);
    rEl('receiptStatus').textContent = t('Čitam račun…');
    const part = { prep: await prepareBillFile(f, receiptPrepOpts) };
    if(receipt !== r) return;
    r.parts.push(part);
    await readReceiptPart(part, r.parts.length - 1);
    if(receipt !== r) return;
    r.busy = false; r.page = r.parts.length - 1; applyReceiptPart(r.page); renderReceipt();
  });
  rEl('receiptRetry').addEventListener('click', async ()=>{
    if(!receipt || receipt.busy) return;
    const r = receipt, idx = r.page, part = r.parts[idx];
    r.busy = true; setReceiptBusy(true);
    rEl('receiptStatus').textContent = t('Čitam račun…');
    await readReceiptPart(part, idx);
    if(receipt !== r) return;
    r.busy = false; applyReceiptPart(idx); renderReceipt();
  });
  rEl('receiptCancel').addEventListener('click', ()=> closeReceipt(false));
  rEl('receiptOverlay').addEventListener('click', e=>{ if(e.target.id === 'receiptOverlay') closeReceipt(false); });
  // Cuvanje racuna iz prodavnice iz stanja (prozor ili Telegram): d = { items, store, date, total, parts?, attachments?, confirmed? }
  async function saveReceiptData(d){
    const items = (d.items || []).filter(i=> (i.name || '').trim() || i.price > 0);
    const total = parseFloat(d.total);
    if(!items.some(i=> i.price > 0) && !(total > 0)) return { ok: false, error: t('Upiši bar jednu stavku sa cenom ili ukupan iznos.') };
    const store = String(d.store || '').trim(), date = d.date || toISODateLocal(new Date());
    if(!d.confirmed && total > 0 && C.findReceiptDuplicate(entries, date, total) && !(await appConfirm(t('Ovaj račun je možda već unet ({0}). Ipak dodati?', date)))) return { ok: false, cancelled: true };
    const r = { parts: d.parts || [] };
    // prilozi: sve slike delova; neuspeh priloga ne blokira rashode
    // racun sa Poreske uprave (QR/link): bez slike u Prilozima — rashod pamti link ka racunu
    const fiscalUrl = C.fiscalUrlFrom(d.fiscalUrl || '');
    const attachments = fiscalUrl ? [] : (d.attachments || []).filter(Boolean).concat(r.parts.filter(p=> p.savedName).map(p=> p.savedName));
    let photoFailed = 0, photoTotal = 0;
    const saveFile = fakeSaveFile || (window.desktop && window.desktop.bills && window.desktop.bills.saveFile);
    if(saveFile && !fiscalUrl){
      for(let i = 0; i < r.parts.length; i++){
        const pr = r.parts[i].prep; if(r.parts[i].savedName || !pr || !pr.bytes) continue;
        photoTotal++;
        let res;
        try{ res = await saveFile(pr.bytes, `${date}-racun-${billSlug(store || 'prodavnica')}-${i + 1}.${pr.ext}`); } catch(e){ res = null; }
        if(res && res.ok) attachments.push(res.name); else photoFailed++;
      }
    }
    // bez stavki: jedan rashod na ukupan iznos, bez izmisljene stavke (ne ulazi u Cene)
    let rows = items.length ? C.receiptToExpenses(items, total > 0 ? total : null) : [];
    if(!rows.length) rows = [{ category: defaultShopCat(), amount: Math.round(total * 100) / 100, items: [], itemPrices: [] }];
    const receiptId = newId(), accountId = accounts.length ? defaultAccountId() : undefined;
    // "1 kom" se ne pise (podrazumevano)
    const qtyLabel = i => { const u = C.normUnit(i.unit) || i.unit || 'kom'; return (i.qty > 1 || (u !== 'kom' && i.unit)) ? `${fmtNum(i.qty, 3)} ${u}` : ''; };
    const made = rows.map(row=>{
      const e = { id: newId(), type: 'expense', desc: store || t('Nabavka'), amount: row.amount, category: row.category, date, paid: true, tags: ['nabavka'], receiptId };
      if(fiscalUrl) e.fiscalUrl = fiscalUrl;
      // nazivi se cuvaju na srpskom (red razlike, stavka bez naziva), bez obzira na jezik aplikacije
      if(row.items.length) Object.assign(e, {
        items: row.items.map(i=> C.purchaseItemLabel({ name: C.canonicalItemName(i.name) || i.raw || 'Stavka', qty: qtyLabel(i) })),
        itemPrices: row.itemPrices, itemQty: row.items.map(i=> ({ qty: i.qty > 0 ? i.qty : 1, unit: C.normUnit(i.unit) || 'kom' })) });
      if(attachments.length) e.attachments = attachments.slice();
      if(accountId) e.accountId = accountId;
      entries.push(e); applyRoundUpSaving(row.amount);
      return e;
    });
    const matches = C.matchReceiptToShopping(items, shopping.items);
    const before = matches.map(m=>{ const s = shopping.items.find(x=> x.id === m.shoppingId); return { s, needed: s.needed, checked: s.checked, price: s.price }; });
    matches.forEach(m=>{ const s = shopping.items.find(x=> x.id === m.shoppingId); const it = items[m.receiptIndex]; s.needed = false; s.checked = false; if(it.price > 0) s.price = it.price; });
    saveEntries(); saveShopping();
    renderAll();
    if(photoFailed) appAlert(t('Rashodi su sačuvani, ali {0} od {1} slika računa nije sačuvano u Prilozi.', photoFailed, photoTotal));
    showUndoToast(t('Račun iz prodavnice dodat ({0} stavki)', items.length), ()=>{
      const ids = new Set(made.map(e=> e.id));
      entries.forEach(e=>{ if(ids.has(e.id)) unapplyRoundUpSaving(e.amount); });
      entries = entries.filter(e=> !ids.has(e.id));
      // slike ovog racuna idu u Prilozi/.obrisano (nijedan drugi rashod ih ne koristi)
      if(attachments.length && window.desktop && window.desktop.bills) attachments.filter(n=> !documents.some(d=> (d.files || []).includes(n))).forEach(n=> window.desktop.bills.deleteFile(n));
      before.forEach(b=>{ b.s.needed = b.needed; b.s.checked = b.checked; b.s.price = b.price; });
      saveEntries(); saveShopping(); renderAll();
    });
    return { ok: true, ids: made.map(e=> e.id), count: items.length, attachments: attachments.slice(),
      shoppingBefore: before.map(b=> ({ id: b.s.id, needed: b.needed, checked: b.checked, price: b.price })) };
  }
  async function saveReceipt(){
    if(!receipt || receipt.busy) return;
    const r = receipt;
    rEl('receiptSave').disabled = true;
    const res = await saveReceiptData({ items: r.items, store: rEl('receiptStore').value, date: rEl('receiptDate').value, total: rEl('receiptTotal').value, parts: r.parts, fiscalUrl: r.fiscalUrl });
    if(receipt !== r) return;
    if(!res.ok){ rEl('receiptSave').disabled = false; if(res.error) rEl('receiptStatus').textContent = res.error; return; }
    closeReceipt(true);
    const sug = warrantySuggestions(res.ids);
    if(sug.length){
      // poruka o neuspelom cuvanju slike (ako je otvorena) ide prva
      const dlg = document.getElementById('dialogOverlay');
      while(dlg && dlg.classList.contains('show')) await new Promise(r=> setTimeout(r, 150));
      openWarrantyPicker(sug, { title: t('Dodati garanciju?'), checked: true });
    }
  }
  rEl('receiptSave').addEventListener('click', saveReceipt);
  if(IS_TEST) window.__saveReceipt = saveReceipt;
  rEl('shopReceiptBtn').addEventListener('click', ()=> rEl('shopReceiptInput').click());
  rEl('shopReceiptInput').addEventListener('change', e=>{ const f = [...e.target.files]; e.target.value = ''; if(f.length) addReceiptFiles(f); });
  // Link sa QR koda fiskalnog racuna (npr. kopiran sa telefona) -> podaci Poreske uprave u prozoru racuna, bez slike
  async function openReceiptFromFiscalLink(text){
    const url = C.fiscalUrlFrom(text);
    if(!url){ appAlert(t('To nije link sa QR koda fiskalnog računa (počinje sa https://suf.purs.gov.rs/v/?vl=).')); return false; }
    const btn = rEl('shopFiscalLinkBtn');
    btn.disabled = true;
    let f;
    try{ f = await readFiscal(url); } finally { btn.disabled = false; }
    if(!f || !f.reading){ appAlert((f && f.error) || t('Podaci sa stranice Poreske uprave nisu preuzeti ({0}). Proveri internet ili pošalji sliku računa.', '?')); return false; }
    receipt = Object.assign({ parts: [], page: 0, edited: true }, mergedReceiptState([{ reading: f.reading }]));
    rEl('receiptOverlay').classList.add('show'); renderReceipt();
    return true;
  }
  rEl('shopFiscalLinkBtn').addEventListener('click', ()=> openEditModal(t('Fiskalni račun sa QR koda'),
    [{ key: 'url', label: 'Link sa QR koda računa (https://suf.purs.gov.rs/v/?vl=…)', type: 'text', value: '' }], vals=> openReceiptFromFiscalLink(vals.url)));

