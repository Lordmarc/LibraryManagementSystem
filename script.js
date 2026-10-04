/* =====================================================
   script.js  -  the LOGIC of the library system
   (structure lives in index.html, looks live in style.css)
   ===================================================== */

/* ---------- 1. DATA: talks to the C server (swap for Supabase later) ---------- */
const store = {
  async load() {
    try { const r = await fetch('/api/data'); if (r.ok) { const d = await r.json(); if (d) return d; } } catch (e) {}
    try { return JSON.parse(localStorage.getItem('lib-data') || 'null'); } catch (e) { return null; }
  },
  save(d) {
    try { localStorage.setItem('lib-data', JSON.stringify(d)); } catch (e) {}
    fetch('/api/data', { method: 'POST', body: JSON.stringify(d) }).catch(() => {});
  }
};
const seed = () => ({
  books: [
    { id: 'b1', title: 'Noli Me Tangere', author: 'José Rizal', isbn: '9789712715242', copies: 3 },
    { id: 'b2', title: 'Clean Code', author: 'Robert C. Martin', isbn: '9780132350884', copies: 2 },
    { id: 'b3', title: 'The Pragmatic Programmer', author: 'Hunt & Thomas', isbn: '9780135957059', copies: 1 },
    { id: 'b4', title: 'Introduction to Algorithms', author: 'Cormen et al.', isbn: '9780262046305', copies: 2 }],
  members: [
    { id: 'm1', name: 'Ana Reyes', sid: '2024-001', pw: '1234', email: 'ana@school.edu' },
    { id: 'm2', name: 'Ben Santos', sid: '2024-002', pw: '1234', email: 'ben@school.edu' }],
  loans: [
    { id: 'l1', bookId: 'b2', memberId: 'm1', borrowed: '2026-09-10', due: '2026-09-24', returned: null },
    { id: 'l2', bookId: 'b1', memberId: 'm2', borrowed: '2026-09-28', due: '2026-10-12', returned: null }]
});
let D = seed();                       // D = all the library data
const save = () => store.save(D);

/* ---------- 2. SMALL HELPERS ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 9);
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
const active = id => D.loans.filter(l => l.bookId === id && !l.returned).length;
const avail = b => b.copies - active(b.id);
const overdue = l => !l.returned && l.due < today();
const book = id => D.books.find(b => b.id === id) || { title: '(deleted)' };
const mem = id => D.members.find(m => m.id === id) || { name: '(deleted)' };
const has = (text, q) => text.toLowerCase().includes(q.trim().toLowerCase());
const tag = (cls, text) => `<span class="tag ${cls}">${text}</span>`;
const status = l => l.returned ? tag('warn', 'Returned ' + l.returned) : overdue(l) ? tag('bad', 'Overdue') : tag('ok', 'Borrowed');
const show = (el, yes) => el.classList.toggle('hidden', !yes);
const val = id => $('#' + id).value;

// Put rows into a table that already exists in index.html (<tbody id="NAME-body">)
function fill(name, rows) {
  $('#' + name + '-body').innerHTML = rows.join('');
  show($('#' + name + '-empty'), rows.length === 0);
}

/* ---------- 3. LOGIN ---------- */
const MAX_LOANS = 3, ADMIN_PW = 'admin123';
const adminPages = ['dashboard', 'books', 'members', 'loans'];
const studentPages = ['browse', 'mine'];
let user = null, page = 'dashboard';
try { user = JSON.parse(sessionStorage.getItem('lib-session') || 'null'); } catch (e) {}
const setSession = () => { try { user ? sessionStorage.setItem('lib-session', JSON.stringify(user)) : sessionStorage.removeItem('lib-session'); } catch (e) {} };

$('#login-form').addEventListener('submit', e => {
  e.preventDefault();
  const id = val('login-id').trim().toLowerCase(), pw = val('login-pw');
  if (id === 'admin' && pw === ADMIN_PW) user = { role: 'admin' };
  else {
    const m = D.members.find(m => (m.sid.toLowerCase() === id || m.email.toLowerCase() === id) && m.pw === pw);
    if (!m) { $('#login-error').textContent = 'Wrong ID or password.'; return; }
    user = { role: 'student', id: m.id };
  }
  $('#login-error').textContent = ''; $('#login-form').reset();
  page = user.role === 'admin' ? 'dashboard' : 'browse';
  setSession(); render();
});
function logout() { user = null; setSession(); render(); }

/* ---------- 4. PAGES: each one fills its tables ---------- */
const renders = {
  dashboard() {
    const on = D.loans.filter(l => !l.returned);
    $('#stat-copies').textContent = D.books.reduce((a, b) => a + b.copies, 0);
    $('#stat-members').textContent = D.members.length;
    $('#stat-loans').textContent = on.length;
    $('#stat-overdue').textContent = on.filter(overdue).length;
    fill('dash', [...on].sort((a, b) => a.due.localeCompare(b.due)).slice(0, 6).map(l =>
      `<tr><td>${esc(book(l.bookId).title)}</td><td>${esc(mem(l.memberId).name)}</td><td>${l.due}</td><td>${status(l)}</td></tr>`));
  },
  books() {
    fill('books', D.books.filter(b => has(b.title + b.author + b.isbn, val('books-search'))).map(b => {
      const a = avail(b);
      return `<tr><td>${esc(b.title)}</td><td>${esc(b.author)}</td><td>${esc(b.isbn)}</td>
        <td>${a ? tag('ok', a + ' / ' + b.copies) : tag('bad', 'Out')}</td>
        <td><button class="btn" data-act="borrow-for" data-id="${b.id}" ${a ? '' : 'disabled'}>Borrow</button>
            <button class="btn" data-act="edit-book" data-id="${b.id}">Edit</button>
            <button class="btn danger" data-act="del-book" data-id="${b.id}">Delete</button></td></tr>`;
    }));
  },
  members() {
    fill('members', D.members.filter(m => has(m.name + m.sid + m.email, val('members-search'))).map(m =>
      `<tr><td>${esc(m.name)}</td><td>${esc(m.sid)}</td><td>${esc(m.email)}</td>
        <td>${D.loans.filter(l => l.memberId === m.id && !l.returned).length}</td>
        <td><button class="btn" data-act="edit-member" data-id="${m.id}">Edit</button>
            <button class="btn danger" data-act="del-member" data-id="${m.id}">Delete</button></td></tr>`));
  },
  loans() {
    const f = val('loans-filter');
    let list = [...D.loans].reverse();
    if (f === 'active') list = list.filter(l => !l.returned);
    if (f === 'overdue') list = list.filter(overdue);
    fill('loans', list.map(l =>
      `<tr><td>${esc(book(l.bookId).title)}</td><td>${esc(mem(l.memberId).name)}</td><td>${l.borrowed}</td><td>${l.due}</td>
        <td>${status(l)}</td>
        <td>${l.returned ? '' : `<button class="btn" data-act="return" data-id="${l.id}">Return</button>`}</td></tr>`));
  },
  browse() {
    const n = D.loans.filter(l => l.memberId === user.id && !l.returned).length;
    $('#browse-count').textContent = `You have borrowed ${n} of ${MAX_LOANS} books.`;
    fill('browse', D.books.filter(b => has(b.title + b.author + b.isbn, val('browse-search'))).map(b => {
      const a = avail(b);
      return `<tr><td>${esc(b.title)}</td><td>${esc(b.author)}</td>
        <td>${a ? tag('ok', a + ' / ' + b.copies) : tag('bad', 'Out')}</td>
        <td><button class="btn" data-act="borrow" data-id="${b.id}" ${a ? '' : 'disabled'}>Borrow</button></td></tr>`;
    }));
  },
  mine() {
    fill('mine', D.loans.filter(l => l.memberId === user.id).reverse().map(l =>
      `<tr><td>${esc(book(l.bookId).title)}</td><td>${l.borrowed}</td><td>${l.due}</td><td>${status(l)}</td></tr>`));
  }
};

// Show the right screen (login / librarian / student) and fill the current page
function render() {
  show($('#login-page'), !user);
  show($('#app'), !!user);
  if (!user) return;
  const admin = user.role === 'admin', pages = admin ? adminPages : studentPages;
  show($('#nav-admin'), admin);
  show($('#nav-student'), !admin);
  $('#who').textContent = admin ? 'Librarian' : mem(user.id).name;
  if (!pages.includes(page)) page = pages[0];
  document.querySelectorAll('.page').forEach(p => show(p, p.id === 'page-' + page));
  document.querySelectorAll('aside button[data-page]').forEach(b => b.classList.toggle('on', b.dataset.page === page));
  renders[page]();
}

/* ---------- 5. POP-UP FORMS (their HTML is in index.html) ---------- */
let editingId = null;       // id of the book/member being edited (null = adding new)

function openBook(id) {
  editingId = id || null;
  const b = D.books.find(x => x.id === id) || { title: '', author: '', isbn: '', copies: 1 };
  $('#book-heading').textContent = id ? 'Edit book' : 'Add book';
  $('#book-title').value = b.title; $('#book-author').value = b.author;
  $('#book-isbn').value = b.isbn; $('#book-copies').value = b.copies;
  $('#book-dialog').showModal();
}
$('#book-form').addEventListener('submit', e => {
  e.preventDefault();
  const v = { title: val('book-title'), author: val('book-author'), isbn: val('book-isbn'), copies: +val('book-copies') };
  editingId ? Object.assign(D.books.find(b => b.id === editingId), v) : D.books.push({ id: uid(), ...v });
  save(); $('#book-dialog').close(); render();
});
function delBook(id) {
  if (active(id)) return alert('This book is currently on loan.');
  if (confirm('Delete this book?')) { D.books = D.books.filter(b => b.id !== id); save(); render(); }
}

function openMember(id) {
  editingId = id || null;
  const m = D.members.find(x => x.id === id) || { name: '', sid: '', email: '', pw: '' };
  $('#member-heading').textContent = id ? 'Edit member' : 'Add member';
  $('#member-name').value = m.name; $('#member-sid').value = m.sid;
  $('#member-email').value = m.email; $('#member-pw').value = m.pw;
  $('#member-dialog').showModal();
}
$('#member-form').addEventListener('submit', e => {
  e.preventDefault();
  const v = { name: val('member-name'), sid: val('member-sid'), email: val('member-email'), pw: val('member-pw') };
  editingId ? Object.assign(D.members.find(m => m.id === editingId), v) : D.members.push({ id: uid(), ...v });
  save(); $('#member-dialog').close(); render();
});
function delMember(id) {
  if (D.loans.some(l => l.memberId === id && !l.returned)) return alert('Member still has borrowed books.');
  if (confirm('Delete this member?')) { D.members = D.members.filter(m => m.id !== id); save(); render(); }
}

function openLoan(bookId) {
  const bs = D.books.filter(b => avail(b) > 0);
  if (!bs.length) return alert('No copies available.');
  if (!D.members.length) return alert('Add a member first.');
  $('#loan-book').innerHTML = bs.map(b => `<option value="${b.id}">${esc(b.title)} (${avail(b)} left)</option>`).join('');
  $('#loan-member').innerHTML = D.members.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('');
  if (bookId) $('#loan-book').value = bookId;
  $('#loan-days').value = 14;
  $('#loan-dialog').showModal();
}
$('#loan-form').addEventListener('submit', e => {
  e.preventDefault();
  D.loans.push({ id: uid(), bookId: val('loan-book'), memberId: val('loan-member'), borrowed: today(), due: addDays(today(), +val('loan-days')), returned: null });
  save(); $('#loan-dialog').close(); render();
});
function returnLoan(id) { D.loans.find(l => l.id === id).returned = today(); save(); render(); }

/* ---------- 6. STUDENT BORROWING ---------- */
function selfBorrow(id) {
  const b = book(id), mine = D.loans.filter(l => l.memberId === user.id && !l.returned);
  if (mine.some(overdue)) return alert('You have an overdue book. Please return it first.');
  if (mine.length >= MAX_LOANS) return alert('You can borrow up to ' + MAX_LOANS + ' books at a time.');
  if (mine.some(l => l.bookId === id)) return alert('You already borrowed this book.');
  if (avail(b) < 1) return alert('No copies available.');
  if (!confirm('Borrow "' + b.title + '"? It will be due in 14 days.')) return;
  D.loans.push({ id: uid(), bookId: id, memberId: user.id, borrowed: today(), due: addDays(today(), 14), returned: null });
  save(); render();
}

/* ---------- 7. CLICKS: every button in index.html has data-act or data-page ---------- */
const actions = {
  'add-book': openBook, 'edit-book': openBook, 'del-book': delBook,
  'add-member': openMember, 'edit-member': openMember, 'del-member': delMember,
  'new-loan': openLoan, 'borrow-for': openLoan, 'return': returnLoan,
  'borrow': selfBorrow, 'logout': logout,
  'close': (id, btn) => btn.closest('dialog').close()
};
document.addEventListener('click', e => {
  const nav = e.target.closest('[data-page]');
  if (nav) { page = nav.dataset.page; render(); return; }
  const btn = e.target.closest('[data-act]');
  if (btn) actions[btn.dataset.act](btn.dataset.id, btn);
});
['#books-search', '#members-search', '#browse-search'].forEach(s => $(s).addEventListener('input', render));
$('#loans-filter').addEventListener('change', render);

/* ---------- 8. START ---------- */
store.load().then(d => {
  if (d) D = d;
  D.members.forEach((m, i) => { m.sid = m.sid || '2024-' + String(i + 1).padStart(3, '0'); m.pw = m.pw || '1234'; });
  render();
});