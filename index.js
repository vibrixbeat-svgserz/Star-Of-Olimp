const express = require('express');
const cors = require('cors');
const path = require('path');
const { v4: uuid } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const db = {
  users: {},
  tasks: [],
  contests: [],
  auctions: [],
  messages: [],
  withdraws: [],
  wins: [],
  promos: [],
  supportId: null,
  admins: new Set()
};

function getUser(req) {
  const id = req.headers['x-user-id'];
  if (!id || !db.users[id]) return null;
  return db.users[id];
}

function requireUser(req, res) {
  const u = getUser(req);
  if (!u) { res.status(401).json({ error: 'Нужна авторизация' }); return null; }
  if (u.banned) { res.status(403).json({ error: 'Аккаунт заблокирован' }); return null; }
  return u;
}

function publicUser(u) {
  return {
    id: u.id, name: u.name, balance: u.balance, tickets: u.tickets,
    isAdmin: u.isAdmin || db.admins.has(u.id),
    isSupport: u.isSupport || db.supportId === u.id,
    created: u.created, done: u.done, refCode: u.refCode, refs: u.refs || 0,
    dailyLast: u.dailyLast || null, streak: u.streak || 0,
    channelDone: !!u.channelDone, shareDone: !!u.shareDone, storyDone: !!u.storyDone
  };
}

function genCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

app.post('/api/auth', (req, res) => {
  const { name, telegramId, refCode } = req.body;
  let id = telegramId ? 'tg' + telegramId : null;
  if (id && db.users[id]) return res.json({ user: publicUser(db.users[id]) });
  if (!id) id = 'u' + uuid().slice(0, 8);

  const user = {
    id,
    name: name || ('User_' + Math.floor(Math.random() * 9000 + 1000)),
    balance: 0,
    tickets: 10,
    isAdmin: false,
    isSupport: false,
    banned: false,
    created: 0,
    done: 0,
    refCode: genCode(),
    refs: 0,
    usedRef: false,
    dailyLast: null,
    streak: 0,
    channelDone: false,
    shareDone: false,
    storyDone: false,
    usedPromos: []
  };

  // referral bonus for invitee
  if (refCode && !user.usedRef) {
    const inviter = Object.values(db.users).find(u => u.refCode === String(refCode).toUpperCase());
    if (inviter && inviter.id !== id) {
      user.balance += 20;
      user.usedRef = true;
      inviter.balance += 30;
      inviter.refs = (inviter.refs || 0) + 1;
      if (inviter.refs % 5 === 0) inviter.balance += 50;
    }
  }

  db.users[id] = user;
  res.json({ user: publicUser(user) });
});

app.get('/api/me', (req, res) => {
  const u = requireUser(req, res);
  if (!u) return;
  res.json({ user: publicUser(u) });
});

app.get('/api/tasks', (req, res) => {
  res.json({ tasks: [...db.tasks].sort((a, b) => b.ts - a.ts) });
});

app.post('/api/tasks', (req, res) => {
  const u = requireUser(req, res);
  if (!u) return;
  const { title, desc, reward, slots, link } = req.body;
  if (!title || !desc || reward < 1 || slots < 1) return res.status(400).json({ error: 'Некорректные данные' });
  const total = reward * slots;
  if (u.balance < total) return res.status(400).json({ error: 'Недостаточно звёзд' });
  u.balance -= total;
  u.created++;
  let normLink = '';
  if (link && String(link).trim()) {
    const l = String(link).trim();
    normLink = /^https?:\/\//i.test(l) ? l : ('https://' + l);
  }
  const task = {
    id: 't' + uuid().slice(0, 8),
    title, desc, link: normLink, reward, slots, taken: 0,
    author: u.name, authorId: u.id, status: 'open', ts: Date.now()
  };
  db.tasks.unshift(task);
  res.json({ task, user: publicUser(u) });
});

app.post('/api/tasks/:id/do', (req, res) => {
  const u = requireUser(req, res);
  if (!u) return;
  const task = db.tasks.find(t => t.id === req.params.id);
  if (!task || task.taken >= task.slots) return res.status(400).json({ error: 'Мест нет' });
  if (task.authorId === u.id) return res.status(400).json({ error: 'Нельзя своё' });
  task.taken++;
  u.balance += task.reward;
  u.done++;
  if (task.taken >= task.slots) task.status = 'closed';
  let bonusTicket = false;
  if (Math.random() < 0.25) { u.tickets++; bonusTicket = true; }
  res.json({ task, user: publicUser(u), bonusTicket });
});

app.post('/api/shop/buy', (req, res) => {
  const u = requireUser(req, res);
  if (!u) return;
  const { tickets, price } = req.body;
  if (!tickets || !price || u.balance < price) return res.status(400).json({ error: 'Недостаточно звёзд' });
  u.balance -= price;
  u.tickets += tickets;
  res.json({ user: publicUser(u) });
});

app.post('/api/topup', (req, res) => {
  const u = requireUser(req, res);
  if (!u) return;
  const { amount, bonus = 0 } = req.body;
  if (!amount || amount < 1) return res.status(400).json({ error: 'Некорректная сумма' });
  u.balance += amount + bonus;
  res.json({ user: publicUser(u) });
});

app.post('/api/withdraw', (req, res) => {
  const u = requireUser(req, res);
  if (!u) return;
  const { amount, details } = req.body;
  if (amount < 50) return res.status(400).json({ error: 'Минимум 50' });
  if (amount > u.balance) return res.status(400).json({ error: 'Недостаточно' });
  if (!details) return res.status(400).json({ error: 'Укажи реквизиты' });
  u.balance -= amount;
  const w = { id: 'w' + uuid().slice(0, 8), user: u.name, userId: u.id, amount, details, status: 'pending', ts: Date.now() };
  db.withdraws.push(w);
  res.json({ withdraw: w, user: publicUser(u) });
});

app.get('/api/contests', (req, res) => res.json({ contests: db.contests.filter(c => c.active) }));
app.post('/api/contests', (req, res) => {
  const u = requireUser(req, res);
  if (!u) return;
  if (!u.isAdmin && !db.admins.has(u.id)) return res.status(403).json({ error: 'Только админ' });
  const { title, desc, prize, cost } = req.body;
  if (!title || prize < 1 || cost < 1) return res.status(400).json({ error: 'Заполни поля' });
  const c = { id: 'c' + uuid().slice(0, 8), title, desc, prize, cost, parts: [], active: true };
  db.contests.unshift(c);
  res.json({ contest: c });
});
app.post('/api/contests/:id/join', (req, res) => {
  const u = requireUser(req, res);
  if (!u) return;
  const c = db.contests.find(x => x.id === req.params.id);
  if (!c || !c.active) return res.status(400).json({ error: 'Не найден' });
  if (c.parts.includes(u.id)) return res.status(400).json({ error: 'Уже участвуешь' });
  if (u.tickets < c.cost) return res.status(400).json({ error: 'Нужно ' + c.cost + ' билет(ов)' });
  u.tickets -= c.cost;
  c.parts.push(u.id);
  res.json({ contest: c, user: publicUser(u) });
});

app.get('/api/auctions', (req, res) => res.json({ auctions: db.auctions.filter(a => a.active) }));
app.post('/api/auctions', (req, res) => {
  const u = requireUser(req, res);
  if (!u) return;
  if (!u.isAdmin && !db.admins.has(u.id)) return res.status(403).json({ error: 'Только админ' });
  const { title, prize, min } = req.body;
  if (!title || prize < 1 || min < 1) return res.status(400).json({ error: 'Заполни поля' });
  const a = { id: 'a' + uuid().slice(0, 8), title, prize, min, bids: [], highest: 0, highestUser: null, active: true };
  db.auctions.unshift(a);
  res.json({ auction: a });
});
app.post('/api/auctions/:id/bid', (req, res) => {
  const u = requireUser(req, res);
  if (!u) return;
  const a = db.auctions.find(x => x.id === req.params.id);
  if (!a || !a.active) return res.status(400).json({ error: 'Не найден' });
  const val = +req.body.amount;
  const min = (a.highest || a.min) + 1;
  if (val < min) return res.status(400).json({ error: 'Минимум ' + min });
  if (u.balance < val) return res.status(400).json({ error: 'Недостаточно звёзд' });
  u.balance -= val;
  a.highest = val;
  a.highestUser = u.name;
  a.highestUserId = u.id;
  a.bids.push({ user: u.name, amount: val, ts: Date.now() });
  res.json({ auction: a, user: publicUser(u) });
});

app.get('/api/messages', (req, res) => res.json({ messages: db.messages.slice(-80) }));
app.post('/api/messages', (req, res) => {
  const u = requireUser(req, res);
  if (!u) return;
  const text = (req.body.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Пустое' });
  const msg = { id: Date.now(), user: u.name, userId: u.id, text, ts: Date.now() };
  db.messages.push(msg);
  if (db.messages.length > 200) db.messages.shift();
  res.json({ message: msg });
});

app.get('/api/wins', (req, res) => res.json({ wins: db.wins }));

function todayKey() {
  const d = new Date();
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}

app.post('/api/daily', (req, res) => {
  const u = requireUser(req, res);
  if (!u) return;
  if (!u.channelDone || !u.shareDone || !u.storyDone) {
    return res.status(400).json({ error: 'Сначала выполни: подписка, поделиться и сторис' });
  }
  if (u.dailyLast === todayKey()) {
    return res.status(400).json({ error: 'Уже забрано сегодня' });
  }
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yKey = yesterday.getFullYear() + '-' + (yesterday.getMonth() + 1) + '-' + yesterday.getDate();
  if (u.dailyLast === yKey) u.streak = (u.streak || 0) + 1;
  else u.streak = 1;
  u.dailyLast = todayKey();
  const tickets = 1 + Math.floor(Math.random() * 5);
  u.tickets = (u.tickets || 0) + tickets;
  let bonusStars = 0;
  let extraTickets = 0;
  if (u.streak >= 7) {
    bonusStars = 50;
    extraTickets = 3;
    u.balance += bonusStars;
    u.tickets += extraTickets;
    u.streak = 0;
  }
  res.json({
    user: publicUser(u),
    tickets,
    extraTickets,
    bonusStars,
    streak: u.streak
  });
});

app.post('/api/bonus/channel', (req, res) => {
  const u = requireUser(req, res);
  if (!u) return;
  if (u.channelDone) return res.status(400).json({ error: 'Уже получено' });
  u.channelDone = true;
  u.balance += 25;
  res.json({ user: publicUser(u) });
});

app.post('/api/bonus/share', (req, res) => {
  const u = requireUser(req, res);
  if (!u) return;
  if (u.shareDone) return res.status(400).json({ error: 'Уже получено' });
  u.shareDone = true;
  u.balance += 10;
  res.json({ user: publicUser(u) });
});

app.post('/api/bonus/story', (req, res) => {
  const u = requireUser(req, res);
  if (!u) return;
  if (u.storyDone) return res.status(400).json({ error: 'Уже получено' });
  u.storyDone = true;
  u.balance += 20;
  res.json({ user: publicUser(u) });
});

app.get('/api/promos', (req, res) => {
  const u = requireUser(req, res);
  if (!u) return;
  if (!u.isAdmin && !db.admins.has(u.id)) return res.status(403).json({ error: 'Нет доступа' });
  res.json({ promos: db.promos });
});

app.post('/api/promos', (req, res) => {
  const u = requireUser(req, res);
  if (!u) return;
  if (!u.isAdmin && !db.admins.has(u.id)) return res.status(403).json({ error: 'Нет доступа' });
  const code = String(req.body.code || '').trim().toUpperCase().replace(/\s+/g, '');
  const stars = Math.max(0, +req.body.stars || 0);
  const tickets = Math.max(0, +req.body.tickets || 0);
  const maxUses = Math.max(0, +req.body.maxUses || 0);
  const note = String(req.body.note || '').trim();
  if (!code || code.length < 3) return res.status(400).json({ error: 'Код минимум 3 символа' });
  if (stars <= 0 && tickets <= 0) return res.status(400).json({ error: 'Укажи звёзды или билеты' });
  if (db.promos.some(p => p.code === code)) return res.status(400).json({ error: 'Такой код уже есть' });
  const promo = {
    id: 'p' + uuid().slice(0, 8),
    code, stars, tickets, maxUses, used: 0, note, active: true, ts: Date.now()
  };
  db.promos.unshift(promo);
  res.json({ promo });
});

app.post('/api/promos/:id/toggle', (req, res) => {
  const u = requireUser(req, res);
  if (!u) return;
  if (!u.isAdmin && !db.admins.has(u.id)) return res.status(403).json({ error: 'Нет доступа' });
  const p = db.promos.find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'Не найден' });
  p.active = !p.active;
  res.json({ promo: p });
});

app.delete('/api/promos/:id', (req, res) => {
  const u = requireUser(req, res);
  if (!u) return;
  if (!u.isAdmin && !db.admins.has(u.id)) return res.status(403).json({ error: 'Нет доступа' });
  const idx = db.promos.findIndex(x => x.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Не найден' });
  db.promos.splice(idx, 1);
  res.json({ ok: true });
});

app.post('/api/promos/redeem', (req, res) => {
  const u = requireUser(req, res);
  if (!u) return;
  if (!Array.isArray(u.usedPromos)) u.usedPromos = [];
  const code = String(req.body.code || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!code) return res.status(400).json({ error: 'Введи промокод' });
  const p = db.promos.find(x => x.code === code);
  if (!p) return res.status(404).json({ error: 'Промокод не найден' });
  if (p.active === false) return res.status(400).json({ error: 'Промокод отключён' });
  if (p.maxUses > 0 && (p.used || 0) >= p.maxUses) return res.status(400).json({ error: 'Лимит активаций исчерпан' });
  if (u.usedPromos.includes(p.id) || u.usedPromos.includes(p.code)) {
    return res.status(400).json({ error: 'Ты уже активировал этот код' });
  }
  p.used = (p.used || 0) + 1;
  u.usedPromos.push(p.id);
  if (p.stars > 0) u.balance += p.stars;
  if (p.tickets > 0) u.tickets = (u.tickets || 0) + p.tickets;
  res.json({ user: publicUser(u), stars: p.stars, tickets: p.tickets });
});

app.post('/api/admin/login', (req, res) => {
  const u = requireUser(req, res);
  if (!u) return;
  const { login, password } = req.body;
  if (login === 'dominik' && password === '9944191qqq') {
    u.isAdmin = true;
    u.name = 'Dominik';
    db.admins.add(u.id);
    return res.json({ user: publicUser(u) });
  }
  res.status(401).json({ error: 'Неверный логин/пароль' });
});

app.get('/api/admin/users', (req, res) => {
  const u = requireUser(req, res);
  if (!u) return;
  if (!u.isAdmin && !db.admins.has(u.id)) return res.status(403).json({ error: 'Нет доступа' });
  res.json({ users: Object.values(db.users).map(publicUser), supportId: db.supportId });
});

app.post('/api/admin/make-admin', (req, res) => {
  const u = requireUser(req, res);
  if (!u) return;
  if (!u.isAdmin && !db.admins.has(u.id)) return res.status(403).json({ error: 'Нет доступа' });
  const { userId } = req.body;
  if (!db.users[userId]) return res.status(404).json({ error: 'Не найден' });
  db.users[userId].isAdmin = true;
  db.admins.add(userId);
  res.json({ ok: true });
});

app.post('/api/admin/ban', (req, res) => {
  const u = requireUser(req, res);
  if (!u) return;
  if (!u.isAdmin && !db.admins.has(u.id)) return res.status(403).json({ error: 'Нет доступа' });
  const { userId } = req.body;
  if (!db.users[userId]) return res.status(404).json({ error: 'Не найден' });
  db.users[userId].banned = !db.users[userId].banned;
  res.json({ banned: db.users[userId].banned });
});

app.post('/api/admin/support', (req, res) => {
  const u = requireUser(req, res);
  if (!u) return;
  if (!u.isAdmin && !db.admins.has(u.id)) return res.status(403).json({ error: 'Нет доступа' });
  db.supportId = req.body.userId || null;
  if (db.supportId && db.users[db.supportId]) db.users[db.supportId].isSupport = true;
  res.json({ supportId: db.supportId });
});

app.get('/api/admin/withdraws', (req, res) => {
  const u = requireUser(req, res);
  if (!u) return;
  if (!u.isAdmin && !db.admins.has(u.id)) return res.status(403).json({ error: 'Нет доступа' });
  res.json({ withdraws: db.withdraws.filter(w => w.status === 'pending') });
});

app.post('/api/admin/withdraws/:id', (req, res) => {
  const u = requireUser(req, res);
  if (!u) return;
  if (!u.isAdmin && !db.admins.has(u.id)) return res.status(403).json({ error: 'Нет доступа' });
  const w = db.withdraws.find(x => x.id === req.params.id);
  if (!w) return res.status(404).json({ error: 'Не найдено' });
  if (req.body.action === 'approve') w.status = 'ok';
  else if (req.body.action === 'reject') {
    w.status = 'no';
    if (db.users[w.userId]) db.users[w.userId].balance += w.amount;
  }
  res.json({ withdraw: w });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => console.log('Star of Olimp on port', PORT));
