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
    check('prepoznato ispod opisa', /520/.test($('parseHint').textContent) && /29/.test($('parseHint').textContent), $('parseHint').textContent);
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
    check('ručno upisan iznos ima prednost', !!e2 && e2.amount === 999 && e2.desc === 'smokeručak', JSON.stringify(e2));
    window.__fakeQuickCategory = null;
  } catch (err) { failures.push('brzi unos: izuzetak: ' + (err && err.stack || err)); }
  return { passed, failures };
})();
