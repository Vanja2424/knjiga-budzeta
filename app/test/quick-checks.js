// Izvrsava se u prozoru za brzi unos (vidi test/smoke.js i KNJIGA_TEST_QUICK_SCRIPT u main.js). Vraca { passed, failures }.
(async () => {
  const passed = [], failures = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const $ = id => document.getElementById(id);
  const check = (name, cond, detail) => { (cond ? passed : failures).push('brzi unos: ' + name + (cond || detail === undefined ? '' : ' — ' + detail)); };
  const set = (id, v) => { const el = $(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
  try {
    check('jezgro učitano', !!window.BudzetCore);
    let asked = null;
    window.__fakeQuickCategory = req => { asked = req.prompt; return { ok: true, content: '{"category":"Hrana"}' }; };
    set('desc', 'smokekafa i kroasan 520 juče');
    await sleep(1600);
    const yd = new Date(); yd.setDate(yd.getDate() - 1);
    check('prepoznato ispod opisa', /520/.test($('parseHint').textContent) && new RegExp('\\b' + yd.getDate() + '\\.').test($('parseHint').textContent), $('parseHint').textContent);
    check('AI kategorija za nepoznat opis', $('category').value === 'Hrana' && /AI/.test($('catHint').textContent), $('category').value + ' | ' + $('catHint').textContent);
    check('AI dobija samo opis', !!asked && /smokekafa i kroasan/.test(asked) && !/520|juče/.test(asked), asked);
    $('addBtn').click(); await sleep(300);
    const e = window.__lastQuickEntry;
    const y = new Date(); y.setDate(y.getDate() - 1);
    const yIso = y.getFullYear() + '-' + String(y.getMonth() + 1).padStart(2, '0') + '-' + String(y.getDate()).padStart(2, '0');
    check('rečenica se pretvara u rashod', !!e && e.desc === 'smokekafa i kroasan' && e.amount === 520 && e.date === yIso && e.category === 'Hrana', JSON.stringify(e));
    // rucno izabrana kategorija se ne menja
    await sleep(1000);
    window.__resetQuickForm && window.__resetQuickForm();
    asked = null;
    $('category').value = 'Prevoz'; $('category').dispatchEvent(new Event('change', { bubbles: true }));
    set('desc', 'smokenesto novo 300');
    await sleep(1600);
    check('ručno izabrana kategorija ostaje', $('category').value === 'Prevoz' && asked === null, $('category').value + ' asked=' + !!asked);
    // iznos upisan rucno ima prednost
    window.__resetQuickForm && window.__resetQuickForm();
    $('amount').value = '999'; $('amount').dispatchEvent(new Event('input', { bubbles: true }));
    set('desc', 'smokeručak 450 danas');
    $('addBtn').click(); await sleep(300);
    const e2 = window.__lastQuickEntry;
    check('ručno upisan iznos ima prednost, brojevi ostaju u opisu', !!e2 && e2.amount === 999 && e2.desc === 'smokeručak 450', JSON.stringify(e2));
    // izabrana valuta se ne vraca na RSD
    await sleep(1000);
    window.__resetQuickForm && window.__resetQuickForm();
    if (![...$('currency').options].some(o => o.value === 'EUR')) $('currency').insertAdjacentHTML('beforeend', '<option>EUR</option>');
    $('currency').value = 'EUR'; $('currency').dispatchEvent(new Event('change', { bubbles: true }));
    set('desc', 'smokekafa 5');
    $('addBtn').click(); await sleep(300);
    const e3 = window.__lastQuickEntry;
    check('izabrana valuta ostaje', !!e3 && e3.currency === 'EUR' && e3.amount === 5, JSON.stringify(e3));
    // AI odgovor posle promene u prihod ne menja kategoriju
    await sleep(1000);
    window.__resetQuickForm && window.__resetQuickForm();
    window.__fakeQuickCategory = async () => { await sleep(300); return { ok: true, content: '{"category":"Hrana"}' }; };
    set('desc', 'smokenovi opis');
    await sleep(750);
    document.querySelector('.seg button[data-type="income"]').click();
    await sleep(900);
    check('AI ne menja kategoriju prihoda', $('catHint').textContent === '' && $('category').value !== 'Hrana', $('category').value);
    document.querySelector('.seg button[data-type="expense"]').click();
    // kratak opis ne ide AI-ju
    window.__resetQuickForm && window.__resetQuickForm();
    let askedShort = false;
    window.__fakeQuickCategory = () => { askedShort = true; return { ok: true, content: '{"category":"Hrana"}' }; };
    set('desc', 'kaf');
    await sleep(1000);
    check('opis kraći od 4 slova ne ide AI-ju', !askedShort);
    // test kuke postoje jer je KNJIGA_TEST postavljen (u produkciji ih nema)
    check('test okruženje je prepoznato', !!(window.desktop.info && window.desktop.info.test));
    // Enter pre AI pauze (700 ms): AI odgovor se saceka i ide u sacuvanu stavku
    await sleep(1000);
    window.__resetQuickForm();
    const defCat = $('category').value;
    const otherCat = [...$('category').options].map(o => o.value).find(v => v !== defCat);
    window.__fakeQuickCategory = async () => { await sleep(200); return { ok: true, content: JSON.stringify({ category: otherCat }) }; };
    set('desc', 'smokebrzi enter 150');
    $('addBtn').click(); await sleep(1000);
    const e4 = window.__lastQuickEntry;
    check('Enter pre AI pauze: AI kategorija ide u stavku', !!e4 && e4.desc === 'smokebrzi enter' && e4.amount === 150 && e4.category === otherCat, JSON.stringify(e4) + ' očekivano ' + otherCat);
    // prazan opis posle prepoznavanja: ne cuva sirovi tekst kao opis, trazi opis
    await sleep(300);
    window.__resetQuickForm();
    window.__fakeQuickCategory = null;
    const beforeEmpty = window.__lastQuickEntry;
    set('desc', '520 juče');
    $('addBtn').click(); await sleep(300);
    check('prazan opis: stavka se ne dodaje, traži se opis', window.__lastQuickEntry === beforeEmpty && $('desc').value === '' && $('amount').value === '520' && $('err').textContent.length > 0 && !$('addBtn').disabled,
      JSON.stringify({ desc: $('desc').value, amount: $('amount').value, err: $('err').textContent, same: window.__lastQuickEntry === beforeEmpty }));
    // pocetak raspodele prati prepoznat datum
    window.__resetQuickForm();
    const past = new Date(); past.setDate(1); past.setMonth(past.getMonth() - 2);
    const pastMonth = past.getFullYear() + '-' + String(past.getMonth() + 1).padStart(2, '0');
    $('spreadOn').click();
    set('desc', 'smokeosiguranje 12000 1.' + (past.getMonth() + 1) + '.' + past.getFullYear() + '.');
    check('raspodela: početak prati datum iz opisa', $('spreadStart').value === pastMonth, $('spreadStart').value + ' / ' + pastMonth);
    $('addBtn').click(); await sleep(300);
    const e5 = window.__lastQuickEntry;
    check('raspodela: sačuvan početak = mesec prepoznatog datuma', !!e5 && e5.spreadStart === pastMonth && e5.date === pastMonth + '-01' && e5.spreadMonths >= 2, JSON.stringify(e5));
    // AI kategorija ne ostaje kad kasniji AI odgovor nema kategoriju
    await sleep(1000);
    window.__resetQuickForm();
    const defCat2 = $('category').value;
    let aiAnswer = otherCat;
    window.__fakeQuickCategory = () => ({ ok: true, content: JSON.stringify({ category: aiAnswer }) });
    set('desc', 'smokeprvi nepoznat');
    await sleep(1000);
    const firstOk = $('category').value === otherCat;
    aiAnswer = '';
    set('desc', 'smokedrugi nepoznat');
    await sleep(1000);
    check('stara AI kategorija se vraća na podrazumevanu', firstOk && $('category').value === defCat2 && $('catHint').textContent === '', [firstOk, $('category').value, defCat2, $('catHint').textContent].join(' | '));
    window.__fakeQuickCategory = null;
  } catch (err) { failures.push('brzi unos: izuzetak: ' + (err && err.stack || err)); }
  return { passed, failures };
})();
