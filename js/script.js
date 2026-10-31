/* ==========================================================
   Wadi Alhuroof – Invoice & Quotation Generator
   Plain JavaScript. Team sign-in and shared storage come from
   Firebase (see js/firebase.js). Works on GitHub Pages.
   ========================================================== */
import * as backend from './firebase.js';

(() => {
  'use strict';

  /* ---------- Company settings (edit here) ---------- */
  const COMPANY = {
    name: 'WADI ALHUROOF TRANSLATION SERVICES',
    city: 'Dubai, UAE',
    phone: '0586815486',
    email: 'info@wadialhuroof.com',
    web: 'www.wadialhuroof.com'
  };

  const DEFAULT_BANK = {
    accName: 'Wadi Alhuroof Translation Services',
    accNo: '019101186753',
    iban: 'AE460330000019101186753',
    bank: 'Mashreq NEO [099]'
  };

  // Last number used; the next document gets +1. Change to match your records.
  const VAT_RATE = 0.05;   // 5% UAE VAT (quotations only, optional)

  const COUNTER_START = { invoice: 1330, quotation: 2035761 };

  const NOTES = {
    invoice: 'Note: Please provide us the payment proof (Payment Slip, Bank Transfer Slip) in order to track your payment.',
    quotation: 'This quotation is valid for 30 days from the date of issue.'
  };
  const THANKS = {
    invoice: 'We truly appreciate your business and look forward to serving you again.',
    quotation: 'Thank you for your enquiry. We look forward to working with you.'
  };

  const KEYS = {
    draft: 'wadi-draft-v2'   // unsaved work, kept per user on this device only
  };

  /* ---------- Helpers ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  const num = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };

  const money = (n) => (Math.round((n + Number.EPSILON) * 100) / 100)
    .toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const isoToday = () => {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  };

  const dmy = (iso) => {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return y && m && d ? `${d}/${m}/${y}` : iso;
  };

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  const read = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  };
  const write = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  };

  /* ---------- Amount in words (AED) ---------- */
  const ONES = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN',
    'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN'];
  const TENS = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];

  function below1000(n) {
    const parts = [];
    if (n >= 100) { parts.push(ONES[Math.floor(n / 100)], 'HUNDRED'); n %= 100; }
    if (n >= 20) { parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '')); }
    else if (n > 0) { parts.push(ONES[n]); }
    return parts.join(' ');
  }

  function words(n) {
    n = Math.floor(n);
    if (n === 0) return 'ZERO';
    const scales = [[1e9, 'BILLION'], [1e6, 'MILLION'], [1e3, 'THOUSAND']];
    const out = [];
    for (const [value, label] of scales) {
      if (n >= value) { out.push(below1000(Math.floor(n / value)), label); n %= value; }
    }
    if (n > 0) out.push(below1000(n));
    return out.join(' ');
  }

  function amountWords(total) {
    const t = Math.max(0, Math.round((total + Number.EPSILON) * 100));
    const dirhams = Math.floor(t / 100);
    const fils = t % 100;
    return `${words(dirhams)} DHS AND ${words(fils)} FILS`;
  }

  /* ---------- Session & shared data ---------- */
  let currentUser = null;
  let cloudDocs = [];
  let cloudCounters = {};
  let unsubs = [];
  let gateMessage = '';
  const warned = {};

  const draftKey = () => `${KEYS.draft}-${currentUser ? currentUser.uid : 'anon'}`;
  const nameOf = (email) => String(email || '').split('@')[0] || 'someone';

  /* ---------- Numbering ---------- */
  const counters = () => Object.assign({}, COUNTER_START, cloudCounters);

  function formatNumber(type, n) {
    if (type === 'quotation') return `WDH/${new Date().getFullYear()}/${n}`;
    return String(n);
  }
  const nextNumber = (type) => formatNumber(type, Number(counters()[type]) + 1);

  /* ---------- State ---------- */
  let state;

  function newState(type = 'invoice') {
    const today = isoToday();
    return {
      id: uid(),
      type,
      number: nextNumber(type),
      numberAuto: true,
      date: today,
      customer: '',
      address: 'Dubai, UAE',
      items: [{ date: today, desc: '', qty: 1, price: 0 }],
      discount: 0,
      paid: 0,
      credit: 0,
      notes: NOTES[type],
      bank: { ...DEFAULT_BANK },
      showStamp: true,
      showPaid: false,
      vat: false,
      baseUpdatedAt: 0
    };
  }

  function totals(s) {
    const subtotal = s.items.reduce((sum, it) => sum + num(it.qty) * num(it.price), 0);
    const net = Math.max(0, subtotal - num(s.discount));
    const vat = s.type === 'quotation' && s.vat ? Math.round(net * VAT_RATE * 100) / 100 : 0;
    const total = net + vat;                       // amount in words uses this
    const due = s.type === 'invoice' ? net - num(s.paid) - num(s.credit) : total;
    return { subtotal, net, vat, total, due };
  }

  /* ---------- Preview rendering ---------- */
  const MIN_ROWS = 6;

  function renderSheet() {
    const s = state;
    const t = totals(s);
    const isInv = s.type === 'invoice';
    const title = isInv ? 'INVOICE' : 'QUOTATION';

    const rows = s.items.map((it) => {
      const hasData = it.desc || num(it.price) || it.date;
      const lineTotal = num(it.qty) * num(it.price);
      return `<tr>
        <td>${esc(dmy(it.date))}</td>
        <td class="l">${esc(it.desc)}</td>
        <td>${hasData ? esc(num(it.qty)) : ''}</td>
        <td class="r">${hasData ? money(num(it.price)) : ''}</td>
        <td class="r">${hasData ? money(lineTotal) : ''}</td>
      </tr>`;
    });
    while (rows.length < MIN_ROWS) rows.push('<tr><td></td><td></td><td></td><td></td><td></td></tr>');

    const totalRows = isInv
      ? `<div class="row"><span>Subtotal</span><b>${money(t.subtotal)}</b></div>
         <div class="row"><span>Discount Allowed</span><b>${money(num(s.discount))}</b></div>
         <div class="row"><span>Paid</span><b>${money(num(s.paid))}</b></div>
         <div class="row"><span>Previous Credit</span><b>${money(num(s.credit))}</b></div>
         <div class="due"><span>TOTAL DUE (AED)</span><b>${money(t.due)}</b></div>`
      : `<div class="row"><span>Subtotal</span><b>${money(t.subtotal)}</b></div>
         <div class="row"><span>Discount</span><b>${money(num(s.discount))}</b></div>
         ${s.vat ? `<div class="row"><span>VAT (${VAT_RATE * 100}%)</span><b>${money(t.vat)}</b></div>` : ''}
         <div class="due"><span>${s.vat ? 'TOTAL INCL. VAT (AED)' : 'TOTAL (AED)'}</span><b>${money(t.due)}</b></div>`;

    const b = s.bank;
    $('#sheet').innerHTML = `
      <header class="doc-head">
        <div>
          <h1>${esc(COMPANY.name)}</h1>
          <p>${esc(COMPANY.city)}</p>
          <p>Tel: ${esc(COMPANY.phone)} &nbsp;|&nbsp; ${esc(COMPANY.email)}</p>
          <p>${esc(COMPANY.web)}</p>
        </div>
        <img src="assets/logo.png" alt="Company logo">
      </header>

      <div class="banner">${title}</div>

      <section class="meta">
        <div>
          <div class="lbl">${isInv ? 'Billed to' : 'Quotation to'}</div>
          <div class="name">${esc(s.customer) || '&nbsp;'}</div>
          <div class="sub">${esc(s.address)}</div>
        </div>
        <div class="right">
          <div class="lbl">${isInv ? 'Invoice No.' : 'Quotation No.'}</div>
          <div class="big">${esc(s.number)}</div>
          <div class="sub">Date: ${esc(dmy(s.date))}</div>
          <div class="sub">Currency: AED</div>
        </div>
      </section>

      <div class="items-wrap">
        <table class="items">
          <colgroup>
            <col style="width:15%"><col style="width:43%"><col style="width:9%"><col style="width:15%"><col style="width:18%">
          </colgroup>
          <thead>
            <tr><th>Date</th><th class="l">Description</th><th>Qty</th><th>Price (AED)</th><th>Total (AED)</th></tr>
          </thead>
          <tbody>${rows.join('')}</tbody>
        </table>
        ${isInv && s.showPaid ? '<img class="paid-stamp" src="assets/paid-stamp.png" alt="PAID">' : ''}
      </div>

      <section class="bottom">
        <div class="bank">
          <h3>Bank details</h3>
          <dl>
            <dt>Account Name</dt><dd>${esc(b.accName)}</dd>
            <dt>Account No.</dt><dd>${esc(b.accNo)}</dd>
            <dt>IBAN</dt><dd>${esc(b.iban)}</dd>
            <dt>Bank</dt><dd>${esc(b.bank)}</dd>
          </dl>
        </div>
        <div class="totals">${totalRows}</div>
      </section>

      <section class="words">
        <h3>Amount in words</h3>
        <p>${amountWords(t.total)}</p>
      </section>

      ${s.notes ? `<p class="notes">${esc(s.notes)}</p>` : ''}

      <section class="signoff">
        <p>${esc(THANKS[s.type])}</p>
        ${s.showStamp ? '<img src="assets/company-stamp.png" alt="Company stamp">' : ''}
      </section>

      <footer class="foot">${esc(COMPANY.name.replace(/\b(\w)(\w*)/g, (m, a, r) => a + r.toLowerCase()))} &nbsp;•&nbsp; ${esc(COMPANY.city)} &nbsp;•&nbsp; ${esc(COMPANY.web)}</footer>
    `;

    $('#liveTotal').textContent = money(t.due);
    $('#liveLabel').textContent = isInv ? 'Balance due' : 'Total';
    document.body.dataset.type = s.type;
    fitSheet();
  }

  /* Scale the A4 sheet to the available width on screen */
  function fitSheet() {
    const holder = $('#sheetHolder');
    const sheet = $('#sheet');
    const avail = holder.parentElement.clientWidth;
    if (!avail) return;               // page is hidden (signed out)
    const scale = Math.min(1, avail / 794);
    sheet.style.transform = `scale(${scale})`;
    holder.style.width = `${794 * scale}px`;
    holder.style.height = `${sheet.offsetHeight * scale}px`;
  }

  /* ---------- Editor: items ---------- */
  function renderItemsEditor() {
    const box = $('#itemsEditor');
    box.innerHTML = state.items.map((it, i) => `
      <div class="item-row" data-i="${i}">
        <label class="full"><span>Description</span>
          <input type="text" data-f="desc" value="${esc(it.desc)}" placeholder="e.g. English to Arabic Legal Translation">
        </label>
        <label><span>Date</span><input type="date" data-f="date" value="${esc(it.date)}"></label>
        <label><span>Qty</span><input type="number" min="0" step="any" data-f="qty" value="${esc(it.qty)}" inputmode="decimal"></label>
        <label><span>Price</span><input type="number" min="0" step="0.01" data-f="price" value="${esc(it.price)}" inputmode="decimal"></label>
        <button type="button" class="remove" data-remove title="Remove line" aria-label="Remove line">&times;</button>
        <div class="line-total full">Line total: <span data-lt>${money(num(it.qty) * num(it.price))}</span></div>
      </div>`).join('');
  }

  /* ---------- Editor: sync state <-> form ---------- */
  function getPath(obj, path) { return path.split('.').reduce((o, k) => (o ? o[k] : undefined), obj); }
  function setPath(obj, path, val) {
    const keys = path.split('.');
    const last = keys.pop();
    const target = keys.reduce((o, k) => o[k], obj);
    target[last] = val;
  }

  function fillForm() {
    $$('[data-k]').forEach((el) => {
      const v = getPath(state, el.dataset.k);
      if (el.type === 'checkbox') el.checked = !!v;
      else el.value = v ?? '';
    });
    $$('input[name="docType"]').forEach((r) => { r.checked = r.value === state.type; });
    renderItemsEditor();
  }

  function onFieldInput(e) {
    const el = e.target.closest('[data-k]');
    if (!el) return;
    const key = el.dataset.k;
    let val;
    if (el.type === 'checkbox') val = el.checked;
    else if (el.type === 'number') val = el.value === '' ? 0 : num(el.value);
    else val = el.value;
    setPath(state, key, val);
    if (key === 'number') state.numberAuto = false;
    changed();
  }

  function onItemInput(e) {
    const row = e.target.closest('.item-row');
    const f = e.target.dataset.f;
    if (!row || !f) return;
    const item = state.items[+row.dataset.i];
    item[f] = (f === 'qty' || f === 'price') ? (e.target.value === '' ? 0 : num(e.target.value)) : e.target.value;
    $('[data-lt]', row).textContent = money(num(item.qty) * num(item.price));
    changed();
  }

  function changed() {
    renderSheet();
    if (currentUser) write(draftKey(), state);
  }

  /* ---------- Switch type ---------- */
  function switchType(type) {
    if (type === state.type) return;
    const oldType = state.type;
    state.type = type;
    if (state.numberAuto) state.number = nextNumber(type);
    if (state.notes === NOTES[oldType] || !state.notes) state.notes = NOTES[type];
    if (type === 'quotation') state.showPaid = false;
    fillForm();
    changed();
  }

  /* ---------- Errors ---------- */
  function friendlyError(e) {
    const code = (e && (e.code || e.message)) || '';
    if (/invalid-credential|wrong-password|user-not-found|invalid-email|missing-password/.test(code)) return 'Wrong email or password.';
    if (/too-many-requests/.test(code)) return 'Too many attempts. Please wait a few minutes or reset your password.';
    if (/network|unavailable/.test(code)) return 'No internet connection. Please try again.';
    if (/permission-denied/.test(code)) return 'Access denied. Your email is not on the team list.';
    return 'Something went wrong. Please try again.';
  }

  function onDataError(e) {
    if (/permission-denied/.test((e && (e.code || e.message)) || '')) {
      gateMessage = 'Access denied. Your email is not on the team list.';
      backend.logOut().catch(() => {});
    } else {
      toast(friendlyError(e));
    }
  }

  /* ---------- Saved documents (shared with the team) ---------- */
  let filter = 'all';
  const kindName = (type) => (type === 'invoice' ? 'Invoice' : 'Quotation');

  // If this document is still on "auto number", follow the team counter.
  function refreshAutoNumber() {
    if (!state || !state.numberAuto || cloudDocs.some((d) => d.id === state.id)) return;
    const n = nextNumber(state.type);
    if (n !== state.number) {
      state.number = n;
      const input = $('#number');
      if (input) input.value = n;
      changed();
    }
  }

  // Tell the user if a teammate saved the document that is currently open.
  function checkRemoteChange() {
    const remote = cloudDocs.find((d) => d.id === state.id);
    if (!remote || !currentUser) return;
    if (remote.updatedAt > (state.baseUpdatedAt || 0) && remote.updatedBy !== currentUser.email && !warned[remote.updatedAt]) {
      warned[remote.updatedAt] = true;
      toast(`${nameOf(remote.updatedBy)} saved changes to this document. Re-open it from the list to see them.`);
    }
  }

  async function saveDoc() {
    if (!currentUser) return;
    if (!state.customer.trim()) {
      toast('Please enter the customer name before saving.');
      $('#customer').focus();
      return;
    }
    const dup = cloudDocs.find((d) => d.id !== state.id && d.type === state.type && String(d.number) === String(state.number));
    if (dup && !confirm(`${kindName(state.type)} number ${state.number} is already used for ${dup.customer || 'another customer'}.\n\nSave anyway?`)) return;

    const remote = cloudDocs.find((d) => d.id === state.id);
    if (remote && remote.updatedAt > (state.baseUpdatedAt || 0) && remote.updatedBy !== currentUser.email &&
        !confirm(`${remote.updatedBy} saved changes to this document after you opened it.\n\nOverwrite their changes?`)) return;

    const btn = $('#btnSave');
    btn.disabled = true;
    try {
      const saved = await backend.saveDoc(state, currentUser.email);
      state.baseUpdatedAt = saved.updatedAt;
      state.createdBy = saved.createdBy;
      write(draftKey(), state);
      const m = String(state.number).match(/(\d+)\s*$/);
      if (m) backend.bumpCounter(state.type, parseInt(m[1], 10)).catch(() => {});
      toast(`${kindName(state.type)} ${state.number} saved.`);
    } catch (e) {
      toast(friendlyError(e));
    } finally {
      btn.disabled = false;
    }
  }

  function renderHistory() {
    const list = $('#history');
    const docs = cloudDocs
      .filter((d) => filter === 'all' || d.type === filter)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    if (!docs.length) {
      list.innerHTML = '<li class="empty">No saved documents yet.</li>';
      return;
    }
    list.innerHTML = docs.map((d) => `
      <li data-id="${esc(d.id)}" class="${d.id === state.id ? 'current' : ''}">
        <div class="info" data-load tabindex="0" role="button">
          <b>${esc(d.customer || 'No name')}</b>
          <small><span class="badge ${d.type === 'quotation' ? 'q' : ''}">${d.type === 'invoice' ? 'INV' : 'QUO'}</span> ${esc(d.number)} · ${esc(dmy(d.date))}</small>
          <small class="by">Saved by ${esc(nameOf(d.updatedBy))}</small>
        </div>
        <span class="amt">${money(totals(d).due)}</span>
        <button type="button" class="del" data-del title="Delete" aria-label="Delete">&times;</button>
      </li>`).join('');
  }

  function loadDoc(id) {
    const d = cloudDocs.find((x) => x.id === id);
    if (!d) return;
    state = JSON.parse(JSON.stringify(d));
    state.numberAuto = false;
    state.baseUpdatedAt = d.updatedAt || 0;
    state.bank = Object.assign({}, DEFAULT_BANK, state.bank);
    fillForm();
    changed();
    renderHistory();
    toast(`Loaded ${state.number}.`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function deleteDoc(id) {
    const d = cloudDocs.find((x) => x.id === id);
    if (!d || !confirm(`Delete ${d.type} ${d.number} for ${d.customer || 'No name'}?\n\nThis removes it for the whole team.`)) return;
    try { await backend.removeDoc(id); } catch (e) { toast(friendlyError(e)); }
  }

  function newDoc() {
    if (!confirm('Start a new document? Unsaved changes will be lost.')) return;
    state = newState(state.type);
    fillForm();
    changed();
    renderHistory();
  }

  /* ---------- Backup / restore ---------- */
  function exportAll() {
    const data = { app: 'wadi-invoice-generator', version: 2, counters: counters(), docs: cloudDocs };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `wadi-documents-backup-${isoToday()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function importAll(file) {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data || !Array.isArray(data.docs)) throw new Error('bad file');
        const missing = data.docs.filter((d) => d && d.id && d.type && Array.isArray(d.items) && !cloudDocs.some((x) => x.id === d.id));
        for (const d of missing) await backend.saveDoc(d, currentUser.email);
        const best = {};
        missing.forEach((d) => {
          const m = String(d.number).match(/(\d+)\s*$/);
          if (m) best[d.type] = Math.max(best[d.type] || 0, parseInt(m[1], 10));
        });
        for (const t of Object.keys(best)) await backend.bumpCounter(t, best[t]);
        toast(`Restored ${missing.length} document${missing.length === 1 ? '' : 's'}.`);
      } catch (err) {
        toast('That file is not a valid backup.');
      }
    };
    reader.readAsText(file);
  }

  /* ---------- Print / PDF ---------- */
  function printDoc() {
    const prev = document.title;
    const kind = state.type === 'invoice' ? 'Invoice' : 'Quotation';
    const clean = (v) => String(v).replace(/[\\/:*?"<>|]+/g, '-').trim();
    document.title = clean(`${kind} ${state.number}${state.customer ? ' - ' + state.customer : ''}`);
    const restore = () => { document.title = prev; window.removeEventListener('afterprint', restore); };
    window.addEventListener('afterprint', restore);
    window.print();
  }

  /* ---------- Toast ---------- */
  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  /* ---------- Sign in / out ---------- */
  function showGate(mode) {
    $('#gateLoading').hidden = mode !== 'loading';
    $('#loginForm').hidden = mode !== 'login';
    $('#setupNotice').hidden = mode !== 'setup';
  }

  function onSignedIn(user) {
    currentUser = user;
    document.body.classList.remove('locked');
    $('#userEmail').textContent = user.email;
    $('#loginPassword').value = '';

    const draft = read(draftKey(), null);
    state = draft && Array.isArray(draft.items)
      ? Object.assign(newState(draft.type || 'invoice'), draft)
      : newState('invoice');
    state.bank = Object.assign({}, DEFAULT_BANK, state.bank);

    unsubs.forEach((f) => f());
    unsubs = [
      backend.watchCounters((c) => { cloudCounters = c || {}; refreshAutoNumber(); }, onDataError),
      backend.watchDocs((list) => { cloudDocs = list; renderHistory(); checkRemoteChange(); }, onDataError)
    ];

    fillForm();
    renderSheet();
    renderHistory();
    requestAnimationFrame(fitSheet);
  }

  function onSignedOut() {
    unsubs.forEach((f) => f());
    unsubs = [];
    currentUser = null;
    cloudDocs = [];
    cloudCounters = {};
    document.body.classList.add('locked');
    $('#userEmail').textContent = '';
    state = newState('invoice');          // clear everything from screen
    fillForm();
    renderSheet();
    $('#loginError').textContent = gateMessage;
    gateMessage = '';
    showGate('login');
  }

  /* ---------- Init ---------- */
  function init() {
    state = newState('invoice');
    fillForm();
    renderSheet();

    // Login form
    $('#loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('#btnLogin');
      $('#loginError').textContent = '';
      btn.disabled = true;
      try {
        await backend.signIn($('#loginEmail').value, $('#loginPassword').value);
      } catch (err) {
        $('#loginError').textContent = friendlyError(err);
      } finally {
        btn.disabled = false;
      }
    });
    $('#btnReset').addEventListener('click', async () => {
      const email = $('#loginEmail').value.trim();
      const out = $('#loginError');
      if (!email) { out.textContent = 'Type your email above first.'; return; }
      try {
        await backend.resetPassword(email);
        out.textContent = 'If this email is on the team, a reset link has been sent.';
      } catch (err) {
        out.textContent = friendlyError(err);
      }
    });
    $('#btnSignOut').addEventListener('click', () => backend.logOut().catch((e) => toast(friendlyError(e))));

    // Form events
    $('.panel').addEventListener('input', (e) => {
      if (e.target.closest('#itemsEditor')) onItemInput(e); else onFieldInput(e);
    });
    $('.panel').addEventListener('change', (e) => {
      if (e.target.name === 'docType') switchType(e.target.value);
      else if (e.target.closest('[data-k]')) onFieldInput(e);
    });

    // Items
    $('#btnAddItem').addEventListener('click', () => {
      const last = state.items[state.items.length - 1];
      state.items.push({ date: last ? last.date : state.date, desc: '', qty: 1, price: 0 });
      renderItemsEditor();
      changed();
      const rows = $$('.item-row');
      const input = $('[data-f="desc"]', rows[rows.length - 1]);
      if (input) input.focus();
    });
    $('#itemsEditor').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-remove]');
      if (!btn) return;
      const i = +btn.closest('.item-row').dataset.i;
      if (state.items.length === 1) {
        state.items[0] = { date: state.date, desc: '', qty: 1, price: 0 };
      } else {
        state.items.splice(i, 1);
      }
      renderItemsEditor();
      changed();
    });

    // Mark as paid
    $('#btnMarkPaid').addEventListener('click', () => {
      const t = totals(state);
      state.paid = Math.round((num(state.paid) + t.due) * 100) / 100;
      state.showPaid = true;
      fillForm();
      changed();
    });

    // Header buttons
    $('#btnNew').addEventListener('click', newDoc);
    $('#btnSave').addEventListener('click', saveDoc);
    $('#btnPrint').addEventListener('click', printDoc);

    // History
    $('#history').addEventListener('click', (e) => {
      const li = e.target.closest('li[data-id]');
      if (!li) return;
      if (e.target.closest('[data-del]')) deleteDoc(li.dataset.id);
      else if (e.target.closest('[data-load]')) loadDoc(li.dataset.id);
    });
    $('#history').addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-load]')) {
        e.preventDefault();
        loadDoc(e.target.closest('li').dataset.id);
      }
    });
    $$('.tab').forEach((tab) => tab.addEventListener('click', () => {
      filter = tab.dataset.filter;
      $$('.tab').forEach((t) => t.classList.toggle('active', t === tab));
      renderHistory();
    }));

    // Backup / restore
    $('#btnExport').addEventListener('click', exportAll);
    $('#btnImport').addEventListener('click', () => $('#importFile').click());
    $('#importFile').addEventListener('change', (e) => {
      if (e.target.files[0]) importAll(e.target.files[0]);
      e.target.value = '';
    });

    // Ctrl/Cmd + S saves
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveDoc(); }
    });

    window.addEventListener('resize', fitSheet);
    window.addEventListener('beforeprint', () => { $('#sheet').style.transform = 'none'; });
    window.addEventListener('afterprint', fitSheet);

    // Start: need Firebase settings, then wait for sign-in state
    if (!backend.configured) { showGate('setup'); return; }
    showGate('loading');
    backend.onUser((user) => (user ? onSignedIn(user) : onSignedOut()));
  }

  document.addEventListener('DOMContentLoaded', init);
})();
