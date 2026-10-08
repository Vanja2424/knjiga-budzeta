  // ---------- Kucni racuni: PDF/slika -> slike + tekst -> QR (lokalno) + Groq -> prozor za potvrdu ----------
  // Besplatan Groq nivo: ~7000 ulaznih tokena u minuti; slika ~2400. PDF sa tekstom: tekst + prva strana; sken: do 2 strane.
  const BILL_MAX_SIDE = 1600, BILL_JPEG_Q = 0.85, BILL_MAX_PAGES = 2, BILL_MAX_TEXT = 6000, BILL_TEXT_PDF_MIN = 200;
  let pdfjsLib = null, pdfDocsOpen = 0;
  if(IS_TEST) window.__pdfDocsOpen = ()=> pdfDocsOpen;
  async function loadPdfJs(){
    if(pdfjsLib) return pdfjsLib;
    pdfjsLib = await import('./pdf.min.mjs');
    pdfjsLib.GlobalWorkerOptions.workerSrc = './pdf.worker.min.mjs';
    return pdfjsLib;
  }
  function scaledCanvas(src, w, h, maxSide){
    const s = Math.min(1, (maxSide || BILL_MAX_SIDE) / Math.max(w, h));
    const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(w * s)); cv.height = Math.max(1, Math.round(h * s));
    const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.drawImage(src, 0, 0, cv.width, cv.height);
    return cv;
  }
  // Fajl -> { images (JPEG data URL za AI i pregled), canvases (za QR), text (iz PDF-a), bytes (prilog), ext, error? }
  async function prepareBillFile(file, opts){
    const maxSide = (opts && opts.maxSide) || BILL_MAX_SIDE, maxPages = (opts && opts.maxPages) || BILL_MAX_PAGES;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
    const extMatch = /\.(\w+)$/.exec(file.name || '');
    const ext = isPdf ? 'pdf' : (extMatch ? extMatch[1].toLowerCase() : 'jpg');
    const empty = err => ({ images: [], canvases: [], text: '', bytes, ext, error: err });
    if(isPdf){
      let task = null;
      try{
        const lib = await loadPdfJs();
        task = lib.getDocument({ data: bytes.slice(), isEvalSupported: false }); pdfDocsOpen++;
        const doc = await task.promise;
        let text = '';
        for(let p = 1; p <= doc.numPages && text.length < BILL_MAX_TEXT * 3; p++){
          const tc = await (await doc.getPage(p)).getTextContent();
          text += tc.items.map(i=> i.str + (i.hasEOL ? '\n' : ' ')).join('') + '\n';
        }
        text = C.compactBillText(text, BILL_MAX_TEXT);
        const images = [], canvases = [];
        const pages = Math.min(text.length >= BILL_TEXT_PDF_MIN ? 1 : maxPages, doc.numPages);
        for(let p = 1; p <= pages; p++){
          const page = await doc.getPage(p);
          const vp1 = page.getViewport({ scale: 1 });
          const vp = page.getViewport({ scale: maxSide / Math.max(vp1.width, vp1.height) });
          const cv = document.createElement('canvas'); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
          const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
          await page.render({ canvasContext: ctx, viewport: vp }).promise;
          canvases.push(cv); images.push(cv.toDataURL('image/jpeg', BILL_JPEG_Q));
        }
        return { images, canvases, text, bytes, ext };
      } catch(e){
        return empty(t('PDF ne može da se otvori ({0}). Popuni podatke ručno.', e && e.name === 'PasswordException' ? t('zaštićen lozinkom') : t('oštećen fajl')));
      } finally {
        // oslobodi memoriju i radnika pdf.js (slike i tekst su vec izvuceni)
        if(task){ pdfDocsOpen--; try{ Promise.resolve(task.destroy()).catch(()=>{}); } catch(e){ /* vec zatvoren */ } }
      }
    }
    try{
      const bmp = await createImageBitmap(file);
      const cv = scaledCanvas(bmp, bmp.width, bmp.height, maxSide);
      return { images: [cv.toDataURL('image/jpeg', BILL_JPEG_Q)], canvases: [cv], text: '', bytes, ext };
    } catch(e){
      return empty(t('Slika ne može da se otvori — sačuvaj je kao JPG ili PNG pa probaj ponovo.'));
    }
  }
  async function findQrInPrepared(prep){
    for(const cv of prep.canvases){
      try{ const txt = await decodeQrImage(cv); const p = txt && C.parseIpsQr(txt); if(p) return p; } catch(e){ /* nema QR */ }
    }
    return null;
  }
  let fakeBillReading = null; // test: zamenjuje Groq poziv (req -> { ok, content })
  if(IS_TEST) Object.defineProperty(window, '__fakeBillReading', { get: ()=> fakeBillReading, set: v=>{ fakeBillReading = v; }, configurable: true });
  const BILL_ERR = {
    nokey: ()=> t('AI čitanje nije podešeno (Podešavanja → AI čitanje računa). Popuni podatke ručno.'),
    key: ()=> t('Groq ključ nije ispravan (401). Proveri ga u podešavanjima.'),
    limit: r=> r.retryAfter ? t('Groq: dostignut limit (429), pokušaj za {0} s.', r.retryAfter) : t('Groq: dostignut limit (429), pokušaj malo kasnije.'),
    model: ()=> t('Groq model ne postoji (404). Promeni ga u podešavanjima.'),
    network: ()=> t('Nema mreže — Groq nije dostupan.'),
    timeout: ()=> t('Groq nije odgovorio na vreme.'),
    toolarge: ()=> t('Račun je prevelik za besplatni Groq limit ni posle smanjivanja. Popuni podatke ručno ili probaj ponovo za minut.'),
    http: r=> t('Groq greška ({0}).', r.status || '?')
  };
  async function readBill(prep, isCurrent){
    const ctx = { locations, billTypes, currencies: CURRENCIES };
    const qr = await findQrInPrepared(prep);
    if(isCurrent && !isCurrent()) return null;   // prozor zatvoren — ne salje se ni AI-ju
    let reading = null, message = prep.error || '', res = null;
    const canAi = !!fakeBillReading || !!(window.desktop && window.desktop.bills);
    if(!prep.error && canAi && (prep.images.length || prep.text)){
      const req = { images: prep.images, text: prep.text, prompt: C.billsPrompt(locations, billTypes) };
      try{ res = fakeBillReading ? await fakeBillReading(req) : await window.desktop.bills.read(req); }
      catch(e){ res = { ok: false, kind: 'http', message: String(e && e.message || e) }; }
      if(res && res.ok){ reading = C.cleanBillReading(res.content, ctx); if(!reading) message = t('AI odgovor nije mogao da se pročita. Popuni podatke ručno.'); }
      else if(res) message = (BILL_ERR[res.kind] || BILL_ERR.http)(res);
    }
    const merged = C.mergeBillQr(reading, qr);
    if(!merged.locationId) merged.locationId = locations[0] ? locations[0].id : '';
    return { reading: merged, message, source: reading ? 'ai' : (qr ? 'qr' : 'manual'), kind: res && !res.ok ? res.kind : undefined };
  }
  // Svako zatvaranje prozora menja broj citanja: kasni rezultat zatvorenog "Citam racun..." se odbacuje (i ostali fajlovi iz istog izbora)
  let billReadGen = 0;
  async function addBillFiles(files){
    ensureBillDefaults();
    for(const f of Array.from(files || [])){
      const gen = ++billReadGen, isCurrent = ()=> gen === billReadGen;
      openBillReviewShell(t('Čitam račun…'));
      const prep = await prepareBillFile(f);
      if(!isCurrent()) return;
      renderBillPreview(prep, 0);
      const r = await readBill(prep, isCurrent);
      if(!r || !isCurrent()) return;
      await openBillReview({ prepared: prep, reading: r.reading, message: r.message, source: r.source });
    }
  }
  if(IS_TEST) window.__addBillFiles = addBillFiles;
  if(IS_TEST) window.__openBillReview = opts => openBillReview(opts);

  let billReview = null; // { prepared, bill (izmena), source, payee, recurring, page, resolve }
  const billEl = id => document.getElementById(id);
  const billTypeById = id => billTypes.find(x=> x.id === id) || null;
  const locationById = id => locations.find(l=> l.id === id) || null;
  function setBillButtons(enabled){ ['billSavePaid', 'billSavePending'].forEach(id=> { billEl(id).disabled = !enabled; }); }
  // Prozor se otvara odmah (dok traje citanje), polja se popune kad stigne odgovor
  function openBillReviewShell(msg){
    billEl('billStatus').textContent = msg || '';
    billEl('billPreview').innerHTML = '';
    billEl('billPages').style.display = 'none';
    setBillButtons(false);
    billEl('billOverlay').classList.add('show');
  }
  function renderBillPreview(prep, page){
    const imgs = prep ? prep.images : [];
    billEl('billPreview').innerHTML = imgs.length ? `<img src="${imgs[page]}" alt="${escapeHtml(t('Pregled računa'))}">` : `<div class="hint" style="padding:2em;">${escapeHtml(t('Nema pregleda.'))}</div>`;
    billEl('billPages').style.display = imgs.length > 1 ? 'flex' : 'none';
    billEl('billPageLabel').textContent = imgs.length > 1 ? `${page + 1} / ${imgs.length}` : '';
  }
  function fillBillTypeOptions(locId, selected){
    const types = billTypes.filter(x=> x.locationId === locId);
    billEl('billType').innerHTML = `<option value="">${escapeHtml(t('— izaberi —'))}</option>` + types.map(x=> `<option value="${x.id}"${x.id === selected ? ' selected' : ''} translate="no">${escapeHtml(x.name)}</option>`).join('');
  }
  function renderBillMetrics(typeId, values, low){
    const type = billTypeById(typeId);
    billEl('billMetrics').innerHTML = type ? type.metrics.map(m=> {
      const v = values && values[m.key] != null ? values[m.key] : '';
      const cls = (low && (low.includes(m.key) || v === '')) ? 'bill-low' : '';
      return `<div><label for="billM_${m.key}" translate="no">${escapeHtml(m.name)}${m.unit ? ' (' + escapeHtml(m.unit) + ')' : ''}</label><input type="number" step="0.001" min="0" id="billM_${m.key}" data-key="${m.key}" value="${v}" class="${cls}"></div>`;
    }).join('') : '';
  }
  function billFormValues(){
    const vals = {};
    billEl('billMetrics').querySelectorAll('input[data-key]').forEach(i=>{ const v = parseFloat(i.value); if(Number.isFinite(v) && v >= 0) vals[i.dataset.key] = v; });
    const loc = locationById(billEl('billLocation').value);
    return { locationId: billEl('billLocation').value, billTypeId: billEl('billType').value, month: billEl('billMonth').value,
      expenseMonth: billEl('billExpMonth').value || currentMonthKey(),
      amount: parseFloat(billEl('billAmount').value), currency: loc ? loc.currency : 'RSD', values: vals,
      periodFrom: billEl('billFrom').value, periodTo: billEl('billTo').value, dueDate: billEl('billDue').value, payeeName: billEl('billPayee').value.trim() };
  }
  function refreshBillLinks(){
    if(!billReview) return;
    const f = billFormValues(), type = billTypeById(f.billTypeId);
    const edit = billReview.bill;
    const monthOk = /^\d{4}-\d{2}$/.test(f.month);
    const dup = type && monthOk ? C.findBillDuplicate(bills, type.id, f.month, edit && edit.id) : null;
    billEl('billDupRow').style.display = dup && !edit ? '' : 'none';
    billEl('billDupLabel').textContent = dup ? t('Za {0} već postoji račun ({1}).', monthYearLabelSr(f.month), fmtOrig(dup.amount, dup.currency)) : '';
    const rec = !edit && type && monthOk ? C.findRecurringForBill(recurring, type, f.expenseMonth, { applied, skipped, entries }) : null;
    billReview.recurring = rec;
    billEl('billRecRow').style.display = rec ? '' : 'none';
    billEl('billRecLabel').textContent = rec ? t('Poveži sa ponavljajućom: {0}', rec.desc) : '';
    const loc = locationById(f.locationId);
    billEl('billCurrency').textContent = loc ? '(' + loc.currency + ')' : '';
    // valuta procitana sa racuna (AI/QR) se ne upisuje — racun je uvek u valuti lokacije, pa se razlika samo javlja
    const cur = loc ? C.billCurrencyMismatch(billReview.reading, loc.currency) : '';
    billEl('billCurWarn').textContent = cur ? t('Na računu piše valuta {0}, a lokacija „{1}“ je u {2} — iznos se upisuje u {2}. Proveri iznos ili promeni valutu lokacije u Podešavanjima.', cur, loc.name, loc.currency) : '';
  }
  // opts: { prepared?, reading?, message?, source?, bill? (izmena), typeId?, month? (rucni unos iz tabele) }
  function openBillReview(opts){
    const b = opts.bill || null;
    const r = opts.reading || C.mergeBillQr(null, null);
    billReview = { savedFile: opts.savedFile || null, prepared: opts.prepared || null, bill: b, source: opts.source || (b ? b.source : 'manual'), payee: (b ? b.payee : r.payee) || null, page: 0, reading: b ? null : r };
    const src = b ? Object.assign({}, b, { locationId: (billTypeById(b.billTypeId) || {}).locationId, low: [] }) : r;
    const locId = src.locationId || (opts.typeId && (billTypeById(opts.typeId) || {}).locationId) || (locations[0] && locations[0].id) || '';
    billEl('billTitle').textContent = b ? t('Izmeni kućni račun') : t('Kućni račun');
    billEl('billLocation').innerHTML = locations.map(l=> `<option value="${l.id}"${l.id === locId ? ' selected' : ''} translate="no">${escapeHtml(l.name)}</option>`).join('');
    fillBillTypeOptions(locId, src.billTypeId || opts.typeId || '');
    billEl('billMonth').value = src.month || opts.month || '';
    // mesec rashoda: za postojeci racun sacuvan (ili iz datuma rashoda), za nov tekuci mesec
    const linkedE = b && b.entryId ? entries.find(e=> e.id === b.entryId) : null;
    billEl('billExpMonth').value = b ? (b.expenseMonth || (linkedE && linkedE.date ? linkedE.date.slice(0, 7) : '') || b.month) : currentMonthKey();
    billEl('billDelete').style.display = b ? '' : 'none';
    billEl('billAmount').value = src.amount != null && src.amount !== 0 ? String(src.amount) : '';
    billEl('billFrom').value = src.periodFrom || ''; billEl('billTo').value = src.periodTo || ''; billEl('billDue').value = src.dueDate || '';
    billEl('billPayee').value = (billReview.payee && billReview.payee.name) || '';
    const low = (!b && opts.prepared) ? (src.low || []) : [];
    [['billType', 'billTypeId'], ['billMonth', 'month'], ['billAmount', 'amount']].forEach(([id, k])=> billEl(id).classList.toggle('bill-low', low.includes(k)));
    renderBillMetrics(billEl('billType').value, src.values, (!b && opts.prepared) ? low : null);
    billEl('billStatus').textContent = opts.message || '';
    billEl('billSavePending').style.display = b ? 'none' : '';
    billEl('billSavePaid').textContent = b ? t('Sačuvaj') : t('Sačuvaj kao plaćen');
    renderBillPreview(billReview.prepared, 0);
    refreshBillLinks();
    setBillButtons(true);
    if(!opts.headless) billEl('billOverlay').classList.add('show');
    return new Promise(res=>{ billReview.resolve = res; });
  }
  function closeBillReview(saved, keepFile){
    billReadGen++;
    billEl('billOverlay').classList.remove('show');
    // prilog otvoren iz Telegrama (vec sacuvan) ide u smece kad se odustane
    if(!saved && !keepFile && billReview && billReview.savedFile && window.desktop && window.desktop.bills) window.desktop.bills.deleteFile(billReview.savedFile);
    const res = billReview && billReview.resolve; billReview = null;
    if(res) res(!!saved);
  }
  billEl('billLocation').addEventListener('change', ()=>{ fillBillTypeOptions(billEl('billLocation').value, ''); renderBillMetrics('', {}, null); refreshBillLinks(); });
  billEl('billType').addEventListener('change', ()=>{ const old = billFormValues().values; renderBillMetrics(billEl('billType').value, old, null); billEl('billType').classList.remove('bill-low'); refreshBillLinks(); });
  billEl('billMonth').addEventListener('change', refreshBillLinks);
  billEl('billExpMonth').addEventListener('change', refreshBillLinks);
  billEl('billDelete').addEventListener('click', ()=>{ const b = billReview && billReview.bill; if(!b) return; closeBillReview(false); deleteBill(b.id); });
  ['billAmount', 'billMonth'].forEach(id=> billEl(id).addEventListener('input', ()=> billEl(id).classList.remove('bill-low')));
  billEl('billMetrics').addEventListener('input', e=>{ if(e.target.dataset.key) e.target.classList.remove('bill-low'); });
  const flipBillPage = d => { if(!billReview || !billReview.prepared) return; const n = billReview.prepared.images.length; if(n < 2) return; billReview.page = (billReview.page + n + d) % n; renderBillPreview(billReview.prepared, billReview.page); };
  billEl('billPrevPage').addEventListener('click', ()=> flipBillPage(-1));
  billEl('billNextPage').addEventListener('click', ()=> flipBillPage(1));
  billEl('billCancel').addEventListener('click', ()=> closeBillReview(false));
  billEl('billOverlay').addEventListener('click', e=>{ if(e.target.id === 'billOverlay') closeBillReview(false); });
  billEl('billSavePaid').addEventListener('click', ()=> saveBillFromReview(true));
  billEl('billSavePending').addEventListener('click', ()=> saveBillFromReview(false));

  function billAmountRsd(b){
    if(!b.currency || b.currency === 'RSD') return { amount: b.amount, rate: 1 };
    const rate = fx.rates && fx.rates[b.currency];
    return rate ? { amount: Math.round(b.amount * rate * 100) / 100, rate } : null;
  }
  const billSlug = s => C.foldText(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'racun';
  async function saveBillFromReview(paid){
    if(!billReview) return false;
    const f = billFormValues(), type = billTypeById(f.billTypeId), loc = locationById(f.locationId);
    const status = billEl('billStatus');
    if(!type || !loc){ status.textContent = t('Izaberi lokaciju i vrstu računa.'); return false; }
    if(!/^\d{4}-\d{2}$/.test(f.month)){ status.textContent = t('Upiši obračunski mesec.'); return false; }
    if(!(f.amount > 0) && !Object.keys(f.values).length){ status.textContent = t('Upiši iznos ili bar jedno merenje.'); return false; }
    if(!/^\d{4}-\d{2}$/.test(f.expenseMonth)){ status.textContent = t('Izaberi mesec u koji ide rashod.'); return false; }
    const draft = { billTypeId: type.id, month: f.month, expenseMonth: f.expenseMonth, amount: f.amount > 0 ? Math.round(f.amount * 100) / 100 : 0, currency: f.currency, values: f.values };
    const rsd = draft.amount > 0 ? billAmountRsd(draft) : { amount: 0, rate: 1 };
    if(!rsd){ status.textContent = t('Kurs za {0} nije dostupan. Otvori Kursevi i osveži kursnu listu.', f.currency); return false; }
    const edit = billReview.bill;
    const dup = !edit ? C.findBillDuplicate(bills, type.id, f.month) : null;
    const replace = !!dup && (document.querySelector('input[name="billDup"]:checked') || {}).value === 'replace';
    setBillButtons(false);
    // 1) prilog — ako ne uspe, nista se ne cuva
    let file = edit ? edit.file : (billReview.savedFile || undefined);
    const prep = billReview.prepared;
    if(!edit && !billReview.savedFile && prep && prep.bytes && window.desktop && window.desktop.bills){
      const res = await window.desktop.bills.saveFile(prep.bytes, `${f.month}-${billSlug(type.name)}-${billSlug(loc.name)}.${prep.ext}`);
      if(!res || !res.ok){ status.textContent = t('Prilog nije sačuvan ({0}). Račun nije upisan.', (res && res.error) || '?'); setBillButtons(true); return false; }
      file = res.name;
    }
    const base = edit || (replace ? dup : {});
    const bill = Object.assign({}, base, draft, { id: base.id || newId(), source: edit ? edit.source : billReview.source });
    ['periodFrom', 'periodTo', 'dueDate'].forEach(k=>{ if(f[k]) bill[k] = f[k]; else delete bill[k]; });
    if(file) bill.file = file;
    const payee = (billReview.payee || f.payeeName) ? C.cleanPayee(Object.assign({}, billReview.payee || {}, { name: f.payeeName || (billReview.payee && billReview.payee.name) || '' })) : null;
    if(payee) bill.payee = payee;
    const newFile = file && file !== (edit ? edit.file : undefined);
    if(replace && newFile && dup.file && dup.file !== file && window.desktop && window.desktop.bills) window.desktop.bills.deleteFile(dup.file);
    // 2) rashod: postojeci se azurira; ponavljajuca stavka; ili nov rashod
    const linkedEntry = bill.entryId ? entries.find(e=> e.id === bill.entryId) : null;
    const linkedRec = !linkedEntry && bill.recurringId ? recurring.find(r=> r.id === bill.recurringId) || null : null;
    const rec = linkedRec || (!edit && !replace && billReview.recurring && billEl('billLinkRec').checked ? billReview.recurring : null);
    bills = bills.filter(b=> b.id !== bill.id).concat(bill);
    const today = toISODateLocal(new Date());
    if(linkedEntry){
      // obican rashod prati racun (mesec, rok, vrsta -> kategorija; zamena i placen/za placanje);
      // rashod ponavljajuce stavke ostaje u svom mesecu i sa kategorijom stavke
      if(!/^rec-/.test(linkedEntry.id)){
        const oldType = billTypeById(base.billTypeId), typeChanged = !!oldType && oldType.id !== type.id;
        const dueChanged = (base.dueDate || '') !== (f.dueDate || '');
        if(replace || typeChanged || dueChanged || (linkedEntry.date || '').slice(0, 7) !== f.expenseMonth) linkedEntry.date = C.expenseDateFor(f.expenseMonth, f.dueDate, today);
        if(replace || typeChanged) linkedEntry.category = type.category;
        if(typeChanged && (linkedEntry.desc === oldType.name || String(linkedEntry.desc || '').startsWith(oldType.name + ' – '))) linkedEntry.desc = locations.length > 1 ? `${type.name} – ${loc.name}` : type.name;
        if(replace){ if(paid) delete linkedEntry.paid; else linkedEntry.paid = false; }
      }
      if(draft.amount > 0){
        linkedEntry.amount = rsd.amount;
        if(draft.currency !== 'RSD') Object.assign(linkedEntry, { origAmount: draft.amount, currency: draft.currency, rate: rsd.rate });
        else { delete linkedEntry.origAmount; delete linkedEntry.currency; delete linkedEntry.rate; }
      }
    } else if(rec){
      bill.recurringId = rec.id;
      if(paid && !edit){ const id = markRecurringPaid(rec, f.expenseMonth, rsd.amount > 0 ? rsd.amount : undefined); if(id) bill.entryId = id; }
    } else if(!edit && !bill.recurringId && draft.amount > 0){
      const entry = { id: newId(), type: 'expense', desc: locations.length > 1 ? `${type.name} – ${loc.name}` : type.name, amount: rsd.amount, category: type.category,
        date: C.expenseDateFor(f.expenseMonth, f.dueDate, today), tags: [], billId: bill.id };
      if(!paid) entry.paid = false;
      if(draft.currency !== 'RSD') Object.assign(entry, { origAmount: draft.amount, currency: draft.currency, rate: rsd.rate });
      if(accounts.length) entry.accountId = defaultAccountId();
      entries.push(entry);
      bill.entryId = entry.id;
    }
    saveBillsState(); saveEntries(); saveApplied();
    closeBillReview(true);
    renderAll();
    return true;
  }
  function deleteBill(id, opts){
    const b = bills.find(x=> x.id === id);
    if(!b) return;
    const hasFile = !!(b.file && window.desktop && window.desktop.bills);
    const run = ()=>{
      bills = bills.filter(x=> x.id !== id); saveBillsState();
      if(hasFile) window.desktop.bills.deleteFile(b.file);
      renderAll();
      showUndoToast(t('Račun obrisan'), ()=>{
        bills = bills.concat(b); saveBillsState();
        if(hasFile) window.desktop.bills.restoreFile(b.file).then(r=>{ if(r && r.ok && r.name && r.name !== b.file){ b.file = r.name; saveBillsState(); } });
        renderAll();
      });
    };
    if(opts && opts.confirm === false) return run();
    appConfirm(t('Obrisati ovaj račun? Priloženi fajl ide u Prilozi/.obrisano i trajno se briše posle 30 dana.'), { okText: t('Obriši'), danger: true }).then(ok=>{ if(ok) run(); });
  }
  if(IS_TEST) window.__deleteBill = deleteBill;
  if(IS_TEST) window.__bills = ()=> ({ locations, billTypes, bills });
  if(IS_TEST) window.__setBillState = s => { locations = s.locations; billTypes = s.billTypes; bills = s.bills; saveBillsState(); invalidate(); };
  if(IS_TEST) window.__ensureBillDefaults = ensureBillDefaults;
  if(IS_TEST) window.__fxRates = ()=> Object.assign({}, fx.rates);
  if(IS_TEST) window.__setFxRate = (c, v)=>{ if(v === undefined) delete fx.rates[c]; else fx.rates[c] = v; };
  // Prevlacenje PDF-a ili slike bilo gde u prozor
  const isBillFile = f => /^(application\/pdf|image\/)/.test(f.type) || /\.(pdf|heic|jpe?g|png|webp)$/i.test(f.name);
  document.addEventListener('dragover', e=>{ if(e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
  document.addEventListener('drop', e=>{
    const files = e.dataTransfer ? [...e.dataTransfer.files].filter(isBillFile) : [];
    if(!files.length || document.querySelector('.modal-overlay.show')) return;
    e.preventDefault();
    if(activeScreen === 'nabavka'){ addReceiptFiles(files); return; }
    if(activeScreen === 'dokumenti'){ addDocFiles(files); return; }
    addBillFiles(files);
  });

  // ---------- Ekran "Kucni racuni": godisnja tabela po lokacijama ----------
  let rezijeYear = new Date().getFullYear(), rezijeMetric = '';
  const monthShort = i => new Date(2000, i, 1).toLocaleDateString(LOCALE, { month: 'short' }).replace('.', '');
  const fmtNum = (v, dec) => v == null ? '' : v.toLocaleString(LOCALE, { minimumFractionDigits: dec === 2 && !Number.isInteger(v) ? 2 : 0, maximumFractionDigits: dec });
  const pad2m = i => String(i + 1).padStart(2, '0');
  function renderRezije(){
    ensureBillDefaults();
    // rashod obrisan -> racun ostaje, samo bez veze
    let unlinked = false;
    bills.forEach(b=>{ if(b.entryId && !entries.some(e=> e.id === b.entryId)){ delete b.entryId; unlinked = true; } });
    if(unlinked) saveBillsState();
    const years = [...new Set(bills.map(b=> +b.month.slice(0, 4)).concat([new Date().getFullYear(), rezijeYear]))].sort((a, b)=> b - a);
    document.getElementById('rezijeYear').innerHTML = years.map(y=> `<option value="${y}"${y === rezijeYear ? ' selected' : ''}>${y}</option>`).join('');
    document.getElementById('rezijeHint').style.display = window.desktop ? '' : 'none';
    const tb = C.billsTable(bills, billTypes, locations, rezijeYear, currentMonthKey());
    const head = `<tr><th></th>${Array.from({ length: 12 }, (_, i)=> `<th>${escapeHtml(monthShort(i))}</th>`).join('')}<th class="rz-total">${rezijeYear}</th></tr>`;
    const cell = (row, i) => {
      const cls = ['rz-cell', row.missing[i] ? 'rz-missing' : ''].filter(Boolean).join(' ');
      return `<td class="${cls}" data-type="${row.typeId}" data-month="${rezijeYear}-${pad2m(i)}" data-bill-ids="${row.billIds[i].join(',')}"${row.missing[i] ? ` title="${escapeHtml(t('Račun fali'))}"` : ''}>${fmtNum(row.cells[i], 2)}</td>`;
    };
    const html = tb.locations.map(l=>{
      const amountRows = l.rows.map(r=> `<tr><td translate="no">${escapeHtml(r.name)}</td>${r.cells.map((_, i)=> cell(r, i)).join('')}<td class="rz-total">${fmtNum(r.total, 2)}</td></tr>`).join('');
      const metricRows = l.metricRows.map(m=> `<tr><td><span translate="no">${escapeHtml(m.label)}</span>${m.unit ? ' <span class="hint" translate="no">(' + escapeHtml(m.unit) + ')</span>' : ''}</td>${m.cells.map(v=> `<td>${fmtNum(v, 3)}</td>`).join('')}<td class="rz-total">${fmtNum(m.total, 3)}</td></tr>`).join('');
      return `<tr><td class="rz-loc" colspan="14"><span translate="no">${escapeHtml(l.name)}</span> · ${escapeHtml(t('Iznos ({0}) — ukupno {1}', l.currency, fmtNum(l.total, 2)))}</td></tr>${amountRows}`
        + (metricRows ? `<tr><td class="rz-loc" colspan="14"><span translate="no">${escapeHtml(l.name)}</span> · ${escapeHtml(t('Potrošnja'))}</td></tr>${metricRows}` : '');
    }).join('');
    document.getElementById('rezijeTable').innerHTML = `<table><thead>${head}</thead><tbody>${html}</tbody></table>`;
    renderRezijeChart(tb);
  }
  function renderRezijeChart(tb){
    const all = [];
    tb.locations.forEach(l=> l.metricRows.forEach(m=> all.push({ id: m.typeId + ':' + m.key, label: (locations.length > 1 ? l.name + ' · ' : '') + m.label, unit: m.unit, typeId: m.typeId, key: m.key })));
    const sel = document.getElementById('rezijeMetric'), svg = document.getElementById('rezijeChart'), note = document.getElementById('rezijeChartNote');
    if(!all.length){ sel.innerHTML = ''; svg.innerHTML = ''; note.textContent = t('Nema merenja.'); return; }
    if(!all.some(a=> a.id === rezijeMetric)) rezijeMetric = all[0].id;
    sel.innerHTML = all.map(a=> `<option value="${a.id}"${a.id === rezijeMetric ? ' selected' : ''} translate="no">${escapeHtml(a.label)}</option>`).join('');
    const cur = all.find(a=> a.id === rezijeMetric);
    const series = y => { const row = C.billsTable(bills, billTypes, locations, y, currentMonthKey()).locations.flatMap(l=> l.metricRows).find(m=> m.typeId === cur.typeId && m.key === cur.key); return row ? row.cells : Array(12).fill(null); };
    const now = tb.locations.flatMap(l=> l.metricRows).find(m=> m.typeId === cur.typeId && m.key === cur.key).cells, prev = series(rezijeYear - 1);
    const W = 760, H = 190, padL = 10, padR = 10, padT = 22, padB = 26, plotW = W - padL - padR, plotH = H - padT - padB;
    const max = Math.max(1, ...now.map(v=> v || 0), ...prev.map(v=> v || 0));
    const slot = plotW / 12, bw = Math.min(26, slot * 0.45), yFor = v => padT + plotH - v / max * plotH;
    const bars = now.map((v, i)=>{
      const x = padL + i * slot + (slot - bw) / 2, y = yFor(v || 0);
      return `<rect class="analiza-bar-sel" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${(padT + plotH - y).toFixed(1)}" rx="3"><title>${escapeHtml(monthShort(i))}: ${fmtNum(v, 3)} ${escapeHtml(cur.unit)}</title></rect>`
        + (v != null ? `<text class="rz-val" x="${(x + bw / 2).toFixed(1)}" y="${(y - 6).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="600" fill="var(--ink)">${fmtNum(v, 1)}</text>` : '')
        + `<text x="${(x + bw / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="var(--ink-soft)">${escapeHtml(monthShort(i))}</text>`;
    }).join('');
    const pts = prev.map((v, i)=> v == null ? null : `${(padL + i * slot + slot / 2).toFixed(1)},${yFor(v).toFixed(1)}`).filter(Boolean);
    const line = pts.length > 1 ? `<polyline points="${pts.join(' ')}" fill="none" stroke="var(--ink-soft)" stroke-width="1.5" stroke-dasharray="5 4"/>` : '';
    svg.innerHTML = bars + line;
    note.textContent = pts.length > 1 ? t('Stubići: {0}. Isprekidana linija: {1}.', rezijeYear, rezijeYear - 1) : '';
  }
  document.getElementById('rezijeYear').addEventListener('change', e=>{ rezijeYear = +e.target.value; renderRezije(); });
  document.getElementById('rezijeMetric').addEventListener('change', e=>{ rezijeMetric = e.target.value; renderRezije(); });
  document.getElementById('rezijeAddBtn').addEventListener('click', ()=> document.getElementById('rezijeFileInput').click());
  document.getElementById('rezijeFileInput').addEventListener('change', e=>{ const f = [...e.target.files]; e.target.value = ''; if(f.length) addBillFiles(f); });
  document.getElementById('rezijeTable').addEventListener('click', e=>{
    const td = e.target.closest('td.rz-cell'); if(!td) return;
    const ids = td.dataset.billIds ? td.dataset.billIds.split(',') : [];
    if(!ids.length){ openBillReview({ typeId: td.dataset.type, month: td.dataset.month, source: 'manual' }); return; }
    openBillDetail(ids);
  });
  if(IS_TEST) window.__openBillDetail = ids => openBillDetail(ids);
  function openBillDetail(ids){
    const list = ids.map(id=> bills.find(b=> b.id === id)).filter(Boolean);
    const body = list.map(b=>{
      const type = billTypeById(b.billTypeId) || { metrics: [], name: '' };
      const vals = type.metrics.filter(m=> b.values[m.key] != null).map(m=> `<span translate="no">${escapeHtml(m.name)}</span>: <b>${fmtNum(b.values[m.key], 3)}</b> ${escapeHtml(m.unit)}`).join(' · ');
      return `<div class="bill-detail" data-id="${b.id}"><div><b translate="no">${escapeHtml(type.name)}</b> · ${escapeHtml(monthYearLabelSr(b.month))} · <b>${escapeHtml(fmtOrig(b.amount, b.currency))}</b></div>`
        + (vals ? `<div>${vals}</div>` : '') + (b.periodFrom ? `<div class="hint">${escapeHtml(t('Period {0} – {1}', b.periodFrom, b.periodTo || ''))}</div>` : '')
        + `<div class="file-row">${b.file && window.desktop ? `<button type="button" class="btn-secondary" data-act="open">${escapeHtml(t('Otvori prilog'))}</button>` : ''}<button type="button" class="btn-secondary" data-act="edit">${escapeHtml(t('Izmeni'))}</button><button type="button" class="btn-link" data-act="del">${escapeHtml(t('Obriši'))}</button></div></div>`;
    }).join('<hr>');
    openDialog(t('Kućni račun'), body, { html: true, alertOnly: true, okText: t('Zatvori') });
    document.querySelectorAll('#dialogBody .bill-detail button').forEach(btn=> btn.addEventListener('click', ()=>{
      const b = bills.find(x=> x.id === btn.closest('.bill-detail').dataset.id); if(!b) return;
      if(btn.dataset.act === 'open') window.desktop.bills.openFile(b.file).then(r=>{
        if(r && r.ok) return;
        const box = btn.closest('.bill-detail');
        let msg = box.querySelector('.bill-file-missing');
        if(!msg){ msg = document.createElement('div'); msg.className = 'import-status bill-file-missing'; box.appendChild(msg); }
        msg.textContent = t('Prilog nije pronađen u folderu Prilozi.');
      });
      if(btn.dataset.act === 'edit'){ closeDialog(false); openBillReview({ bill: b }); }
      if(btn.dataset.act === 'del'){ closeDialog(false); deleteBill(b.id); }
    }));
  }
  // Uvoz godisnje tabele (korisnikov Excel) — racuni bez rashoda i priloga
  function importBillsSheet(aoa, currencyByName){
    ensureBillDefaults();
    const parsed = C.parseBillsSheet(aoa);
    if(!parsed || !parsed.year) return { created: 0, duplicates: 0, error: 'shape' };
    const r = C.billsFromSheet(parsed, { locations, billTypes, bills, primaryLocationId: locations[0].id, category: defaultBillCategory(), newId, newLocationCurrency: currencyByName || {} });
    locations = locations.concat(r.newLocations);
    billTypes = billTypes.map(x=> r.changedTypes.find(c=> c.id === x.id) || x).concat(r.newTypes);
    bills = bills.concat(r.bills);
    saveBillsState(); renderAll();
    return { created: r.bills.length, duplicates: r.duplicates, year: parsed.year, newLocations: r.newLocations.map(l=> l.name) };
  }
  if(IS_TEST) window.__importBillsSheet = importBillsSheet;
  function billsSheetPreview(aoa, currencyByName){
    const parsed = C.parseBillsSheet(aoa);
    if(!parsed || !parsed.year) return '';
    const probeLocs = locations.length ? locations : [{ id: '_', name: 'Stan', currency: 'RSD' }];
    const r = C.billsFromSheet(parsed, { locations: probeLocs, billTypes, bills, primaryLocationId: probeLocs[0].id, category: defaultBillCategory(), newId, newLocationCurrency: currencyByName || {} });
    const locName = id => (probeLocs.concat(r.newLocations).find(l=> l.id === id) || {}).name || '';
    return [t('Računa za uvoz: {0} · već postoje: {1}.', r.bills.length, r.duplicates),
      r.newLocations.length ? t('Nove lokacije: {0}.', r.newLocations.map(l=> l.name).join(', ')) : '',
      r.newTypes.length ? t('Nove vrste računa: {0}.', r.newTypes.map(x=> x.name + ' (' + locName(x.locationId) + ')').join(', ')) : ''].filter(Boolean).join(' ');
  }
  if(IS_TEST) window.__billsSheetPreview = billsSheetPreview;
  function removeLocation(id){
    const typeIds = billTypes.filter(x=> x.locationId === id).map(x=> x.id);
    const gone = bills.filter(b=> typeIds.includes(b.billTypeId));
    if(window.desktop && window.desktop.bills) gone.forEach(b=>{ if(b.file) window.desktop.bills.deleteFile(b.file); });
    bills = bills.filter(b=> !typeIds.includes(b.billTypeId)); billTypes = billTypes.filter(x=> x.locationId !== id); locations = locations.filter(l=> l.id !== id);
    saveBillsState(); renderAll();
  }
  if(IS_TEST) window.__removeLocation = removeLocation;
  document.getElementById('rezijeImportBtn').addEventListener('click', ()=> document.getElementById('rezijeImportInput').click());
  document.getElementById('rezijeImportInput').addEventListener('change', async e=>{
    const f = e.target.files[0]; e.target.value = ''; if(!f) return;
    let pick = null;
    try{
      const wb = XLSX.read(new Uint8Array(await f.arrayBuffer()), { type: 'array' });
      pick = wb.SheetNames.map(n=> ({ n, aoa: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '', raw: true }) })).find(s=> C.parseBillsSheet(s.aoa));
    } catch(err){ pick = null; }
    if(!pick){ appAlert(t('U fajlu nije pronađena tabela kućnih računa (red sa mesecima „01. Januar“… i blokovi „Kućni računi“).')); return; }
    ensureBillDefaults();
    const parsed = C.parseBillsSheet(pick.aoa);
    const names = [...new Set(parsed.blocks.map(b=> b.location).filter(n=> n && !locations.some(l=> C.foldText(l.name) === C.foldText(n))))];
    const curOpts = CURRENCIES.map(x=> `<option value="${x}"${x === 'RSD' ? ' selected' : ''}>${x}</option>`).join('');
    const body = `<div>${escapeHtml(t('Godina {0}, list „{1}“.', parsed.year || '?', pick.n))}</div><div style="margin-top:.4em;" translate="no">${escapeHtml(billsSheetPreview(pick.aoa, {}))}</div>`
      + (names.length ? `<div style="margin-top:.6em;">${escapeHtml(t('Nove lokacije — izaberi valutu:'))}</div>` + names.map(n=> `<div class="file-row"><span translate="no" style="min-width:8em;">${escapeHtml(n)}</span><select data-loc="${escapeHtml(n)}">${curOpts}</select></div>`).join('') : '')
      + `<div class="hint" style="margin-top:.6em;">${escapeHtml(t('Uvezeni računi nemaju rashod ni prilog; postojeći računi za isti mesec se preskaču.'))}</div>`;
    if(!parsed.year){ appAlert(t('U tabeli nije pronađena godina (npr. „Računi 2025“ iznad meseci).')); return; }
    const pending = openDialog(t('Uvoz tabele kućnih računa'), body, { html: true, okText: t('Uvezi') });
    const selections = {};
    names.forEach(n=> selections[n] = 'RSD');
    document.querySelectorAll('#dialogBody select[data-loc]').forEach(s=> s.addEventListener('change', ()=>{ selections[s.dataset.loc] = s.value; }));
    if(!(await pending)) return;
    const res = importBillsSheet(pick.aoa, selections);
    rezijeYear = res.year || rezijeYear;
    showScreen('rezije');
    appAlert(t('Uvezeno računa: {0}. Preskočeno (već postoje): {1}.', res.created, res.duplicates));
  });

  // ---------- Podesavanja: lokacije, vrste racuna, AI citanje ----------
  // Podesavanja samo prikazuju lokacije — podrazumevana "Stan" se pravi tek kad korisnik pocne da koristi racune
  function renderBillSettings(){
    const catOpts = sel => expenseCats.map(c=> `<option value="${escapeHtml(c)}"${c === sel ? ' selected' : ''} translate="no">${escapeHtml(c)}</option>`).join('');
    const curOpts = sel => CURRENCIES.map(c=> `<option value="${c}"${c === sel ? ' selected' : ''}>${c}</option>`).join('');
    document.getElementById('billLocList').innerHTML = locations.map(l=> `
      <div class="bill-loc" data-loc="${l.id}">
        <div class="file-row"><input type="text" class="bl-name" value="${escapeHtml(l.name)}" translate="no" aria-label="${escapeHtml(t('Naziv lokacije'))}" style="max-width:200px;"><select class="bl-cur" aria-label="${escapeHtml(t('Valuta'))}">${curOpts(l.currency)}</select>${locations.length > 1 ? `<button class="btn-link bl-del">${escapeHtml(t('Obriši lokaciju'))}</button>` : ''}</div>
        ${billTypes.filter(x=> x.locationId === l.id).map(x=> `
          <div class="bill-type" data-type="${x.id}">
            <div class="file-row"><input type="text" class="bt-name" value="${escapeHtml(x.name)}" translate="no" aria-label="${escapeHtml(t('Vrsta računa'))}" style="max-width:160px;"><select class="bt-cat" aria-label="${escapeHtml(t('Kategorija'))}">${catOpts(x.category)}</select><button class="btn-link bt-del">${escapeHtml(t('Obriši'))}</button></div>
            <div class="bt-metrics">${x.metrics.map(m=> `<span class="bt-metric" data-key="${m.key}"><input type="text" class="bm-name" value="${escapeHtml(m.name)}" translate="no" aria-label="${escapeHtml(t('Merenje'))}" style="width:9em;"><input type="text" class="bm-unit" value="${escapeHtml(m.unit)}" translate="no" aria-label="${escapeHtml(t('Jedinica'))}" style="width:4em;"><button class="btn-link bm-del" aria-label="${escapeHtml(t('Ukloni merenje'))}">×</button></span>`).join('')}<button class="btn-link bm-add">${escapeHtml(t('+ merenje'))}</button></div>
          </div>`).join('')}
        <button class="btn-link bt-add">${escapeHtml(t('+ vrsta računa'))}</button>
      </div>`).join('');
  }
  const billLocList = document.getElementById('billLocList');
  billLocList.addEventListener('change', e=>{
    const locEl = e.target.closest('.bill-loc'), typeEl = e.target.closest('.bill-type'), mEl = e.target.closest('.bt-metric');
    const loc = locEl && locationById(locEl.dataset.loc), type = typeEl && billTypeById(typeEl.dataset.type);
    const v = e.target.value.trim();
    if(loc && e.target.classList.contains('bl-name') && v) loc.name = v;
    if(loc && e.target.classList.contains('bl-cur')) loc.currency = e.target.value;
    if(type && e.target.classList.contains('bt-name') && v) type.name = v;
    if(type && e.target.classList.contains('bt-cat')) type.category = e.target.value;
    if(type && mEl){ const m = type.metrics.find(x=> x.key === mEl.dataset.key); if(m && e.target.classList.contains('bm-name') && v) m.name = v; if(m && e.target.classList.contains('bm-unit')) m.unit = v; }
    saveBillsState(); invalidate();
  });
  billLocList.addEventListener('click', async e=>{
    const b = e.target.closest('button'); if(!b) return;
    const locEl = b.closest('.bill-loc'), typeEl = b.closest('.bill-type'), mEl = b.closest('.bt-metric');
    const loc = locEl && locationById(locEl.dataset.loc), type = typeEl && billTypeById(typeEl.dataset.type);
    if(b.classList.contains('bt-add') && loc){ billTypes.push({ id: newId(), locationId: loc.id, name: t('Nova vrsta'), category: defaultBillCategory(), metrics: [] }); }
    else if(b.classList.contains('bm-add') && type){ type.metrics.push({ key: C.nextMetricKey(type, bills), name: t('Merenje'), unit: '' }); }
    else if(b.classList.contains('bm-del') && type && mEl){
      const used = bills.some(x=> x.billTypeId === type.id && x.values[mEl.dataset.key] != null);
      if(used && !(await appConfirm(t('Ovo merenje ima upisane vrednosti. Ukloniti ga? Vrednosti ostaju u računima, ali se više ne prikazuju.')))) return;
      type.metrics = type.metrics.filter(x=> x.key !== mEl.dataset.key);
    }
    else if(b.classList.contains('bt-del') && type){
      const n = bills.filter(x=> x.billTypeId === type.id).length;
      if(n && !(await appConfirm(t('Vrsta „{0}“ ima {1} računa. Obrisati vrstu i te račune? (Rashodi ostaju.)', type.name, n), { okText: t('Obriši'), danger: true }))) return;
      bills.filter(x=> x.billTypeId === type.id && x.file && window.desktop && window.desktop.bills).forEach(x=> window.desktop.bills.deleteFile(x.file));
      bills = bills.filter(x=> x.billTypeId !== type.id); billTypes = billTypes.filter(x=> x.id !== type.id);
    }
    else if(b.classList.contains('bl-del') && loc){
      const typeIds = billTypes.filter(x=> x.locationId === loc.id).map(x=> x.id), n = bills.filter(x=> typeIds.includes(x.billTypeId)).length;
      if(!(await appConfirm(t('Obrisati lokaciju „{0}“ i {1} računa? (Rashodi ostaju.)', loc.name, n), { okText: t('Obriši'), danger: true }))) return;
      removeLocation(loc.id); renderBillSettings(); return;
    } else return;
    saveBillsState(); renderBillSettings(); invalidate();
  });
  document.getElementById('billAddLoc').addEventListener('click', ()=>{
    const loc = { id: newId(), name: t('Nova lokacija'), currency: 'RSD' };
    locations.push(loc);
    billTypes = billTypes.concat(C.defaultBillTypes(loc.id, defaultBillCategory(), newId));
    saveBillsState(); renderBillSettings(); invalidate();
  });
  // AI citanje (samo desktop; kljuc zna samo glavni proces)
  const aiStatus = msg => { document.getElementById('aiStatus').textContent = msg; };
  const AI_NO_ENC = () => t('Šifrovanje ključa nije dostupno na ovom računaru, pa ključ ne može da se sačuva.');
  async function renderAiSettings(){
    const box = document.getElementById('aiSettings');
    if(!(window.desktop && window.desktop.bills)){ box.style.display = 'none'; return; }
    box.style.display = '';
    const info = await window.desktop.bills.keyInfo();
    const key = document.getElementById('aiKey');
    key.value = ''; key.placeholder = info.set ? t('upisan (…{0})', info.last4) : t('nije upisan');
    document.getElementById('aiModel').value = info.model;
    document.getElementById('aiSendText').checked = info.sendText;
    if(!info.encryption) aiStatus(AI_NO_ENC());
  }
  document.getElementById('aiKeySave').addEventListener('click', async ()=>{
    const v = document.getElementById('aiKey').value.trim(); if(!v) return;
    const info = await window.desktop.bills.setKey(v);
    await renderAiSettings();
    aiStatus(info.error === 'encryption' ? AI_NO_ENC() : t('Ključ sačuvan (…{0}).', info.last4));
  });
  document.getElementById('aiKeyClear').addEventListener('click', async ()=>{ await window.desktop.bills.setKey(''); await renderAiSettings(); aiStatus(t('Ključ obrisan.')); });
  document.getElementById('aiModel').addEventListener('change', async e=>{ await window.desktop.bills.setOptions({ model: e.target.value }); renderAiSettings(); });
  document.getElementById('aiSendText').addEventListener('change', e=> window.desktop.bills.setOptions({ sendText: e.target.checked }));
  document.getElementById('aiTest').addEventListener('click', async ()=>{
    aiStatus(t('Proveravam…'));
    const r = await window.desktop.bills.testKey();
    aiStatus(r.ok ? t('Ključ radi ✓') : (BILL_ERR[r.kind] || BILL_ERR.http)(r));
  });
  document.getElementById('aiKeysLink').addEventListener('click', ()=> window.open('https://console.groq.com/keys'));
