"use strict";
/* Панель Mini App. Без сборки: один файл, обычный DOM. */

const tg = window.Telegram && window.Telegram.WebApp;
const S = {
  me: null, tab: "bot", status: null, config: null, bosses: null, works: null,
  logs: [], logSince: 0, logFilter: null, timers: [], friends: null,
  bossFloor: "Все", onlyAvail: false, onlyEnabled: false,
};
const TABS = [
  ["bot", "Бот"], ["bosses", "Боссы"], ["char", "Персонаж"], ["gear", "Снаряжение"],
  ["eco", "Экономика"], ["log", "Лог"], ["login", "Вход"],
];
const CUR = { gold: "💰", pills: "💊", dollar: "💵" };
const CUR_RU = { gold: "Золото", pills: "Пилюли", dollar: "Доллары" };
const LOG_CATS = {
  general: "Общее", bosses: "Боссы", works: "Работы", pvp: "PvP", invitations: "Приглашения",
  friends: "Друзья", chests: "Сундуки", businesses: "Бизнесы", stats: "Статы", debug: "Отладка",
};
const STAT_RU = {
  battles: "Боёв", wins: "Побед", losses: "Поражений", total_damage: "Урон всего",
  token_refreshes: "Обновлений токена", tasks_done: "Задач", work_cycles: "Циклов работ",
  pvp_wins: "PvP побед", pvp_losses: "PvP поражений", friends_invited: "Приглашено",
  friend_requests_accepted: "Заявок принято", invitations_accepted: "Приглашений принято",
  weapons_repaired: "Починок", stats_upgraded: "Статов прокачано", consumables_bought: "Куплено расходников",
};

/* ---------------- утилиты ---------------- */
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "value") el.value = v;
    else if (k === "checked") el.checked = !!v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat(9)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
const fmt = (n) => (n === null || n === undefined || n === "") ? "—" :
  Number(n).toLocaleString("ru-RU");
const dur = (s) => {
  s = Math.max(0, Math.floor(s || 0));
  if (s >= 3600) return `${Math.floor(s / 3600)} ч ${String(Math.floor(s % 3600 / 60)).padStart(2, "0")} мин`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const ago = (s) => s < 0 ? "нет" : s < 60 ? `${s} сек назад` : s < 3600 ? `${Math.floor(s / 60)} мин назад` :
  s < 86400 ? `${Math.floor(s / 3600)} ч назад` : `${Math.floor(s / 86400)} дн назад`;

function toast(text, kind) {
  const el = h("div", { class: "toast " + (kind || "") , text });
  document.getElementById("toasts").append(el);
  setTimeout(() => el.remove(), kind === "bad" ? 5000 : 2600);
  if (tg && tg.HapticFeedback) {
    try { tg.HapticFeedback.notificationOccurred(kind === "bad" ? "error" : "success"); } catch (e) {}
  }
}

/* адрес сервера API: пусто — тот же сайт; на GitHub Pages его задаёт config.js */
const API_BASE = String(window.MINIAPP_API || "").replace(/\/+$/, "");

async function api(path, body) {
  const resp = await fetch(API_BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Telegram-Init-Data": (tg && tg.initData) || "" },
    body: JSON.stringify(body || {}),
  });
  let data;
  try { data = await resp.json(); } catch (e) { throw new Error(`сервер ответил ${resp.status}`); }
  if (!data.ok) throw new Error(data.error || "ошибка");
  return data;
}
const call = async (method, params) => (await api("/api/call", { method, params })).result;

/* выполнить действие с кнопкой и тостом */
async function act(btn, fn, okText) {
  const old = btn && btn.textContent;
  if (btn) { btn.disabled = true; btn.textContent = "⏳"; }
  try {
    const r = await fn();
    if (okText) toast(typeof okText === "function" ? okText(r) : okText, "ok");
    return r;
  } catch (e) {
    toast(e.message, "bad");
    throw e;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = old; }
  }
}
const quiet = (p) => p.catch(() => {});

function toggle(checked, onchange) {
  const input = h("input", { type: "checkbox", checked });
  input.addEventListener("change", () => onchange(input.checked, input));
  return h("label", { class: "toggle" }, input, h("i"));
}
function sw(label, checked, onchange, note) {
  return h("div", { class: "sw" },
    h("div", { class: "lbl" }, label, note ? h("small", { text: note }) : null),
    toggle(checked, onchange));
}
function numField(label, value, onsave, opts) {
  const input = h("input", { type: "number", class: "num", value: value ?? 0,
    min: opts && opts.min, max: opts && opts.max, inputmode: "numeric" });
  let t;
  input.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => onsave(parseInt(input.value || "0", 10), input), 700);
  });
  return h("div", { class: "sw" },
    h("div", { class: "lbl" }, label, opts && opts.note ? h("small", { text: opts.note }) : null), input);
}
function select(options, value, onchange) {
  const el = h("select", {}, options.map(([v, t]) => h("option", { value: v, text: t })));
  el.value = value;
  el.addEventListener("change", () => onchange(el.value));
  return el;
}
function seg(options, value, onpick) {
  const box = h("div", { class: "seg" });
  for (const [v, t] of options) {
    box.append(h("button", { class: v === value ? "on" : "", text: t, onclick: () => onpick(v) }));
  }
  return box;
}
function bar(color, fraction, text) {
  return h("div", { class: "bar" },
    h("i", { style: `width:${Math.max(0, Math.min(1, fraction || 0)) * 100}%;background:${color}` }),
    h("span", { text }));
}
async function saveCfg(values) {
  try {
    await call("set_config", { values });
    Object.assign(S.config || (S.config = {}), values);
  } catch (e) { toast(e.message, "bad"); }
}

/* ---------------- лист снизу ---------------- */
function sheet(title, body, actions) {
  const root = document.getElementById("sheet-root");
  const close = () => { root.innerHTML = ""; if (tg && tg.BackButton) tg.BackButton.hide(); };
  const bg = h("div", { class: "sheet-bg", onclick: (e) => { if (e.target === bg) close(); } },
    h("div", { class: "sheet" },
      h("div", { class: "head" }, h("h3", { text: title }),
        h("button", { class: "btn small", text: "✕", onclick: close })),
      body, actions ? h("div", { class: "btns", style: "margin-top:12px" }, actions) : null));
  root.innerHTML = "";
  root.append(bg);
  if (tg && tg.BackButton) { tg.BackButton.show(); tg.BackButton.onClick(close); }
  return close;
}

/* ---------------- старт ---------------- */
async function boot() {
  if (tg) {
    tg.ready();
    tg.expand();
    try { tg.setHeaderColor("bg_color"); } catch (e) {}
  }
  const app = document.getElementById("app");
  if (!tg || !tg.initData) {
    app.replaceChildren(h("div", { class: "gate" }, h("h2", { text: "Откройте через Telegram" }),
      h("p", { text: "Эта панель работает только внутри Telegram: кнопка «Панель» в чате с ботом." })));
    return;
  }
  try {
    S.me = await api("/api/me");
  } catch (e) {
    app.replaceChildren(h("div", { class: "gate" }, h("h2", { text: "Нет связи с сервером" }),
      h("p", { text: e.message })));
    return;
  }
  const st = S.me.user.status;
  if (st !== "approved") {
    const clan = S.me.clan || "клан";
    const reasons = {
      not_in_clan: `Панель только для участников: ${clan}. Ваш username Telegram не найден в составе клана. ` +
        "Если вы в клане и недавно меняли username — напишите администратору.",
      no_username: `Панель только для участников: ${clan}. У вас нет username в Telegram, поэтому сверить вас с кланом ` +
        "автоматически нельзя. Задайте username (Настройки → Имя пользователя) и откройте панель снова, или дождитесь администратора.",
      clan_unknown: "Сейчас не получилось проверить состав клана. Администратор получил заявку; можно также попробовать позже.",
      limit: "Свободных мест в панели нет. Администратор получил заявку.",
      left_clan: `Доступ приостановлен: вас нет в составе — ${clan}. Бот остановлен. Вернитесь в клан и откройте панель снова.`,
    };
    const reason = reasons[S.me.user.pending_reason];
    app.replaceChildren(h("div", { class: "gate" },
      h("h2", { text: st === "blocked" ? "Доступ закрыт" : S.me.user.pending_reason === "left_clan" ? "Доступ приостановлен" : "Заявка отправлена" }),
      h("p", { text: st === "blocked" ? "Администратор закрыл доступ к панели."
        : reason || "Администратор получил уведомление. Когда он одобрит доступ, бот пришлёт сообщение." }),
      st === "pending" ? h("button", { class: "btn primary", text: "Проверить снова", onclick: () => location.reload() }) : null));
    return;
  }
  if (S.me.admin) TABS.push(["admin", "Админ"]);
  S.tab = S.me.user.mode === "none" ? "login" : (sessionStorage.getItem("tab") || "bot");
  if (!TABS.some(([k]) => k === S.tab)) S.tab = "bot";
  render();
  tick();
  S.timers.push(setInterval(tick, 2500));
  quiet(loadConfig());
}

async function loadConfig() {
  S.config = await call("get_config");
  if (S.tab === "bot") renderTab();
}

async function tick() {
  if (document.hidden) return;
  try {
    S.status = await call("status");
    renderHeader();
    if (S.tab === "bosses") renderBattle();
    sharedCacheChanged(S.status.caches || {});
  } catch (e) { /* молча: сеть могла моргнуть */ }
  try {
    const r = await call("get_logs", { since: S.logSince });
    if (r.gap) S.logs = [];
    if (r.items.length) {
      S.logs.push(...r.items);
      if (S.logs.length > 3000) S.logs.splice(0, S.logs.length - 3000);
      S.logSince = r.items[r.items.length - 1].id;
      if (S.tab === "log") appendLog(r.items);
    }
  } catch (e) {}
}

/* Общий кеш (боссы, работы, кланы) обновил кто-то из пользователей —
   подтягиваем без перезагрузки панели. */
function sharedCacheChanged(ver) {
  const prev = S.cacheVer;
  S.cacheVer = ver;
  if (!prev) return;
  if (ver.bosses !== prev.bosses && S.reloadBosses && S.tab === "bosses") {
    quiet(S.reloadBosses());
    toast("Список боссов обновлён", "ok");
  }
  if (ver.works !== prev.works && S.reloadWorks && S.tab === "bot") {
    quiet(S.reloadWorks());
    toast("Список работ обновлён", "ok");
  }
}

/* ---------------- каркас ---------------- */
let headerEl, mainEl;
function render() {
  headerEl = h("div", { class: "top" });
  mainEl = h("main");
  document.getElementById("app").replaceChildren(headerEl, mainEl);
  renderHeader();
  renderTab();
}

function renderHeader() {
  const st = S.status || {};
  const p = st.player || {};
  const state = st.state || "stopped";
  const stateText = { running: "работает", stopping: "остановка…", stopped: "не работает" }[state];
  const startBtn = h("button", { class: "btn ok small", text: "▶ Старт", disabled: state !== "stopped",
    onclick: (e) => act(e.target, () => call("start"), "Бот запущен").then(tick) });
  const stopBtn = h("button", { class: "btn bad small", text: state === "stopping" ? "⛔ Сразу" : "⏹ Стоп",
    disabled: state === "stopped",
    onclick: (e) => act(e.target, () => call("stop", { hard: state === "stopping" })).then(tick) });
  const en = p.energy, enMax = p.energy_max;
  const enText = enMax ? `⚡ ${en}/${enMax}` + (en < enMax && p.energy_next ? `  +1 через ${dur(p.energy_next)}` : "") : "⚡ —";
  const exText = p.exp_next ? `★ ${fmt(p.exp)}/${fmt(p.exp_next)}` : "★ —";
  let tokenNote = "";
  if (st.has_token === false) tokenNote = "нет токена";
  else if (st.token_ok === false) tokenNote = "токен истёк";
  else if (st.mode === "manual" && st.token_seconds && st.token_seconds < 6 * 3600) tokenNote = `токен ещё ${dur(st.token_seconds)}`;
  const tabs = h("div", { class: "tabs" }, TABS.map(([k, t]) =>
    h("button", { class: "tab" + (k === S.tab ? " on" : ""), text: t, onclick: () => switchTab(k) })));
  headerEl.replaceChildren(
    h("div", { class: "row" },
      h("span", { class: "brand", text: "БЕЗУМИЕ" }),
      h("span", { class: "lvl", text: p.level ? `ур. ${p.level}` : "" }),
      p.nickname ? h("span", { class: "lvl", text: p.nickname }) : null,
      h("span", { class: "spacer" }),
      h("span", { class: "state " + state, text: stateText }),
      startBtn, stopBtn),
    h("div", { class: "chips" },
      h("span", { class: "chip", text: `💰 ${fmt(p.gold)}` }),
      h("span", { class: "chip", text: `💵 ${fmt(p.dollar)}` }),
      h("span", { class: "chip", text: `💊 ${fmt(p.pills)}` }),
      tokenNote ? h("span", { class: "chip warn", text: "⚠ " + tokenNote, onclick: () => switchTab("login") }) : null),
    h("div", { class: "bars" },
      bar("var(--energy)", enMax ? en / enMax : 0, enText),
      bar("var(--exp)", p.exp_next ? p.exp / p.exp_next : 0, exText)),
    h("div", { class: "activity", text: st.activity || "" }),
    tabs);
}

function switchTab(k) {
  S.tab = k;
  sessionStorage.setItem("tab", k);
  renderHeader();
  renderTab();
  window.scrollTo(0, 0);
}

function renderTab() {
  const fn = { bot: tabBot, bosses: tabBosses, char: tabChar, gear: tabGear, eco: tabEco,
    log: tabLog, login: tabLogin, admin: tabAdmin }[S.tab];
  mainEl.replaceChildren();
  fn(mainEl);
}

/* =================================================================
   БОТ: работа и общие настройки
   ================================================================= */
function tabBot(root) {
  const c = S.config;
  if (!c) { root.append(h("div", { class: "card hint", text: "Загрузка настроек…" })); return; }
  const set = (k) => (v) => saveCfg({ [k]: v });

  const workSel = h("select");
  const workInfo = h("div", { class: "hint" });
  const loadWorks = async () => {
    S.works = await call("works");
    workSel.replaceChildren(...(S.works.list.length ? S.works.list.map((w) =>
      h("option", { value: w.id, text: `${w.name} (id=${w.id})` })) : [h("option", { value: 0, text: "— кеш пуст, нажмите ⇣ —" })]));
    workSel.value = c.work_id || "";
    showWork();
  };
  const showWork = async () => {
    const id = parseInt(workSel.value || "0", 10);
    if (!id) return;
    workInfo.textContent = "⏳";
    try {
      const d = await call("work_info", { id });
      workInfo.replaceChildren(...workSummary(d));
    } catch (e) { workInfo.textContent = e.message; }
  };
  workSel.addEventListener("change", () => { saveCfg({ work_id: parseInt(workSel.value, 10) }); showWork(); });
  S.reloadWorks = loadWorks;
  quiet(loadWorks());

  root.append(
    h("div", { class: "card" }, h("h3", { text: "⚒ Работа" }),
      sw("Выполнять работу", c.work_enabled, set("work_enabled")),
      h("div", { class: "field" }, h("span", { text: "Работа" }),
        h("div", { class: "row" }, workSel,
          h("button", { class: "btn small", text: "⇣ Скан", onclick: (e) => act(e.target, () => call("scan", { what: "works" }),
            "Сканирую работы — список обновится через минуту").then(() => setTimeout(() => quiet(loadWorks()), 60000)) }))),
      workInfo,
      numField("Всего циклов", c.max_work_cycles, set("max_work_cycles"), { min: 0, note: "0 — без лимита" }),
      sw("Дефибрилляторы", c.use_work_defibrillators, set("use_work_defibrillators"), "тратить на энергию для работы")),
    h("div", { class: "card" }, h("h3", { text: "⚙ Общие" }),
      numField("Пауза между боями, сек", c.delay, set("delay"), { min: 0, max: 3600 }),
      sw("PvP", c.enable_pvp, set("enable_pvp")),
      sw("Принимать заявки в друзья", c.auto_accept_friend_requests, set("auto_accept_friend_requests")),
      sw("Чинить оружие", c.auto_repair_weapons, set("auto_repair_weapons"))),
    h("div", { class: "card" }, h("h3", { text: "📦 Сбор и прокачка" }),
      sw("Сундуки мутагенов", c.auto_collect_chests, set("auto_collect_chests")),
      numField("Интервал сундуков, сек", c.chests_collect_interval, set("chests_collect_interval"), { min: 60 }),
      sw("Бизнесы", c.auto_collect_businesses, set("auto_collect_businesses")),
      numField("Интервал бизнесов, сек", c.businesses_collect_interval, set("businesses_collect_interval"), { min: 60 }),
      sw("Автопрокачка статов", c.auto_upgrade_stats, set("auto_upgrade_stats")),
      numField("Интервал прокачки, сек", c.upgrade_stats_interval, set("upgrade_stats_interval"), { min: 60 }),
      sw("· Безумие", c.upgrade_stats_madness, set("upgrade_stats_madness")),
      sw("· Агрессия", c.upgrade_stats_aggression, set("upgrade_stats_aggression")),
      sw("· Ярость", c.upgrade_stats_rage, set("upgrade_stats_rage"))),
    h("div", { class: "card" }, h("h3", { text: "🎯 Что выбивать с боссов" }),
      sw("Комнаты", c.boss_hunt_rooms, set("boss_hunt_rooms")),
      sw("Одежда", c.boss_hunt_clothing, set("boss_hunt_clothing")),
      sw("Украшения", c.boss_hunt_ornaments, set("boss_hunt_ornaments")),
      sw("Питомцы", c.boss_hunt_pets, set("boss_hunt_pets")),
      sw("Оружие", c.boss_hunt_weapons, set("boss_hunt_weapons")),
      sw("Бить, пока не выбито всё", c.boss_hunt_until_all_dropped, set("boss_hunt_until_all_dropped"))),
    statsCard());
}

function workSummary(d) {
  if (!d || !Object.keys(d).length) return ["нет данных"];
  const out = [];
  const title = d.title || d.name;
  if (title) out.push(h("div", { text: title }));
  const prog = d.progress || {};
  if (d.completedCycles !== undefined) out.push(h("div", { text: `Завершено циклов: ${d.completedCycles}` }));
  const tasks = d.tasks || [];
  if (tasks.length) {
    out.push(h("div", { text: `Задач: ${tasks.length} · ` + tasks.map((t) =>
      `${t.title || "?"} ${t.progress ? (t.progress.current ?? 0) + "/" + (t.progress.required ?? "?") : ""} ⚡${t.energyCost ?? "?"}`).join(", ") }));
  }
  if (prog.current !== undefined) out.push(h("div", { text: `Прогресс: ${prog.current}/${prog.required ?? prog.max ?? "?"}` }));
  return out.length ? out : ["нет данных"];
}

function statsCard() {
  const box = h("div", { class: "grid3" });
  const st = (S.status && S.status.stats) || {};
  for (const [k, v] of Object.entries(st)) {
    if (!v) continue;
    box.append(h("div", { class: "tile" }, h("b", { text: fmt(v) }), h("small", { text: STAT_RU[k] || k })));
  }
  return h("div", { class: "card" }, h("h3", { text: "📊 За этот запуск" }),
    box.children.length ? box : h("div", { class: "hint", text: "Пока пусто." }));
}

/* =================================================================
   БОССЫ
   ================================================================= */
let battleEl, bossListEl;
function tabBosses(root) {
  battleEl = h("div", { class: "card battle" });
  bossListEl = h("div", { class: "list" });
  const tools = h("div", { class: "card" });
  root.append(battleEl, tools, bossListEl);
  renderBattle();
  const reload = async () => {
    S.bosses = await call("bosses");
    renderBossTools(tools, reload);
    renderBossList();
  };
  tools.append(h("div", { class: "hint", text: "Загрузка…" }));
  S.reloadBosses = reload;
  quiet(reload());
}

function renderBattle() {
  if (!battleEl) return;
  const snap = S.status && S.status.battle;
  if (!snap || !snap.boss) {
    battleEl.replaceChildren(h("h3", { text: "⚔ Бой" }), h("div", { class: "hint", text: (S.status && S.status.activity) || "Сейчас боя нет." }));
    return;
  }
  const players = snap.players || [];
  battleEl.replaceChildren(
    h("h3", { text: `⚔ ${snap.boss}` }),
    bar("#c0504a", snap.boss_max ? snap.boss_hp / snap.boss_max : 0, `Босс ${fmt(snap.boss_hp)}/${fmt(snap.boss_max)}`),
    h("div", { style: "height:4px" }),
    bar("#2a9a3a", snap.player_max ? snap.player_hp / snap.player_max : 0, `Я ${fmt(snap.player_hp)}/${fmt(snap.player_max)}`),
    h("div", { class: "hint", style: "margin-top:6px", text:
      `Мой урон: ${fmt(snap.my_damage)}/${fmt(snap.drop_required)} · удар #${snap.turn ?? "?"} · игроков: ${players.length}` }),
    players.length ? h("details", {}, h("summary", { text: "Состав боя" }),
      h("table", { class: "t" }, players.map((pl) => h("tr", {},
        h("td", { text: (pl.leader ? "👑 " : "") + (pl.name || "?") }),
        h("td", { text: fmt(pl.damage) }), h("td", { text: `${fmt(pl.hp)}/${fmt(pl.max_hp)}` }))))) : null);
}

function bossFloors() {
  const floors = [];
  for (const b of S.bosses.list) if (!floors.includes(b.floor || "?")) floors.push(b.floor || "?");
  return floors.sort();
}

function renderBossTools(box, reload) {
  const cfgs = S.bosses.config;
  const enabledFloors = new Set(S.bosses.list.filter((b) => (cfgs[b.id] || {}).enabled).map((b) => b.floor || "?"));
  const floors = [["Все", "Все"], ...bossFloors().map((f) => [f, f + (enabledFloors.has(f) ? "•" : "")])];
  box.replaceChildren(
    h("div", { class: "row wrap" },
      h("label", { class: "row" }, toggle(S.onlyAvail, (v) => { S.onlyAvail = v; renderBossList(); }), h("span", { class: "hint", text: "доступные" })),
      h("label", { class: "row" }, toggle(S.onlyEnabled, (v) => { S.onlyEnabled = v; renderBossList(); }), h("span", { class: "hint", text: "включённые" }))),
    h("div", { class: "btns", style: "margin:8px 0" },
      h("button", { class: "btn small", text: "⚙ Общие", onclick: () => bossSettingsSheet(null, reload) }),
      h("button", { class: "btn small", text: "✓ Включить видимых", onclick: (e) => act(e.target,
        () => call("bosses_bulk", { action: "enable", ids: visibleBosses().map((b) => b.id) }), "Включено").then(reload) }),
      h("button", { class: "btn small", text: "✕ Выключить все", onclick: (e) => act(e.target,
        () => call("bosses_bulk", { action: "disable_all" }), "Все выключены").then(reload) }),
      h("button", { class: "btn small", text: "↺ Счётчики", onclick: (e) => confirmDo("Обнулить счётчики убийств и стартов?",
        () => act(e.target, () => call("bosses_bulk", { action: "reset_counters" }), "Сброшено").then(reload)) }),
      h("button", { class: "btn small", text: "🧹 Очистить", onclick: (e) => confirmDo("Удалить настройки всех боссов?",
        () => act(e.target, () => call("bosses_bulk", { action: "clear" }), "Очищено").then(reload)) }),
      h("button", { class: "btn small", text: "⇣ Скан", onclick: (e) => act(e.target, () => call("scan", { what: "bosses" }),
        "Сканирую боссов — это пара минут").then(() => setTimeout(() => quiet(reload()), 90000)) }),
      h("button", { class: "btn small", text: "↻", onclick: (e) => act(e.target, reload) })),
    seg(floors, S.bossFloor, (f) => { S.bossFloor = f; renderBossTools(box, reload); renderBossList(); }),
    h("div", { class: "hint", style: "margin-top:6px", text: S.bosses.list.length
      ? `Список из кэша, ${ago(S.bosses.age)}` : "Кеш пуст — нажмите ⇣ Скан" }));
  box._reload = reload;
}

function visibleBosses() {
  const cfgs = S.bosses.config;
  return S.bosses.list.filter((b) =>
    (S.bossFloor === "Все" || (b.floor || "?") === S.bossFloor) &&
    (!S.onlyAvail || b.is_available !== false) &&
    (!S.onlyEnabled || (cfgs[b.id] || {}).enabled));
}

function renderBossList() {
  const rows = visibleBosses();
  bossListEl.replaceChildren();
  let floor = null;
  const group = {};
  for (const b of rows) (group[b.floor || "?"] = group[b.floor || "?"] || []).push(b);
  for (const f of Object.keys(group).sort()) {
    bossListEl.append(h("div", { class: "floor", text: `Этаж ${f} · боссов: ${group[f].length}` }));
    for (const b of group[f]) bossListEl.append(bossCard(b));
  }
  if (!rows.length) bossListEl.append(h("div", { class: "card hint", text: "Нет боссов под фильтр." }));
}

function bossCard(b) {
  const cfg = S.bosses.config[b.id] || (S.bosses.config[b.id] = {});
  const card = h("div", { class: "boss" + (cfg.enabled ? " on" : "") + (b.is_available === false ? " locked" : "") });
  const save = async (values) => {
    try { await call("set_boss", { id: b.id, values }); Object.assign(cfg, values); }
    catch (e) { toast(e.message, "bad"); }
  };
  const limit = cfg.create_battles_count || 0, started = cfg.battles_started || 0;
  const numIn = (val, key) => {
    const i = h("input", { type: "number", value: val || 0, min: 0 });
    let t; i.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => save({ [key]: parseInt(i.value || "0", 10) }), 700); });
    return i;
  };
  card.append(
    toggle(cfg.enabled, (v) => { save({ enabled: v }); card.classList.toggle("on", v); }),
    h("div", {},
      h("div", { class: "name", text: b.name || `Босс ${b.id}` }),
      h("div", { class: "meta", text: `id ${b.id} · ур. ${b.required_level || 0}+` + (b.is_available === false ? " · 🔒 недоступен" : "") }),
      h("div", { class: "cnt" },
        h("span", { text: `сам ${cfg.kills_self || 0}` }), h("span", { text: `пригл. ${cfg.kills_invited || 0}` }),
        h("span", { class: limit && started >= limit ? "lim" : "", text: limit ? `старт ${started}/${limit}` : `старт ${started}` }))),
    h("div", { class: "ctl" },
      h("label", {}, "Прио", numIn(cfg.priority, "priority")),
      h("label", {}, "Лимит", numIn(cfg.create_battles_count, "create_battles_count")),
      h("label", {}, toggle(cfg.accept_invitations, (v) => save({ accept_invitations: v })), "приглашения"),
      h("span", { class: "spacer" }),
      h("button", { class: "btn small", text: "✎", onclick: () => bossSettingsSheet(b, () => bossListEl.parentNode && renderBossList()) })));
  return card;
}

function confirmDo(text, fn) {
  if (tg && tg.showConfirm) tg.showConfirm(text, (ok) => ok && fn());
  else if (confirm(text)) fn();
}

/* форма настроек боя — общие или особые для босса */
function fightForm(src) {
  const v = Object.assign({
    accept_from_mode: "all", accept_from_ids: [], invite_mode: "none", invite_ids: [],
    min_damage_mode: "norm", min_damage_value: 0, use_screams: false, screams_limit: 0,
    use_healing: false, healing_type: "smart", max_heals_per_battle: 0, buy_consumables: false,
    buy_consumables_currency: "auto", buy_consumables_max_by_reward: true, random_order: false,
  }, JSON.parse(JSON.stringify(src || {})));
  const dmgVal = h("input", { type: "number", class: "num", value: v.min_damage_value, min: 0 });
  dmgVal.addEventListener("input", () => { v.min_damage_value = parseInt(dmgVal.value || "0", 10); });
  const num = (key) => { const i = h("input", { type: "number", class: "num", value: v[key] || 0, min: 0 });
    i.addEventListener("input", () => { v[key] = parseInt(i.value || "0", 10); }); return i; };
  const pickBtn = (key, title) => {
    const b = h("button", { class: "btn small", text: `выбрать (${(v[key] || []).length})` });
    b.addEventListener("click", () => friendPicker(title, v[key] || [], (ids) => { v[key] = ids; b.textContent = `выбрать (${ids.length})`; }));
    return b;
  };
  const modes = [["none", "Никого"], ["all", "Всех"], ["selected", "Выбранных"]];
  const el = h("div", {},
    h("h4", { text: "Приглашения" }),
    h("div", { class: "sw" }, h("div", { class: "lbl" }, "Принимать от"),
      select(modes, v.accept_from_mode, (x) => { v.accept_from_mode = x; }), pickBtn("accept_from_ids", "От кого принимать")),
    h("div", { class: "sw" }, h("div", { class: "lbl" }, "Приглашать"),
      select(modes, v.invite_mode, (x) => { v.invite_mode = x; }), pickBtn("invite_ids", "Кого приглашать")),
    h("h4", { text: "Урон" }),
    h("div", { class: "sw" }, h("div", { class: "lbl" }, "Бить до"),
      select([["minimum", "минимум"], ["norm", "норма"], ["to_end", "до конца"], ["specify", "указать"]],
        v.min_damage_mode, (x) => { v.min_damage_mode = x; }), dmgVal),
    sw("Крики", v.use_screams, (x) => { v.use_screams = x; }),
    h("div", { class: "sw" }, h("div", { class: "lbl" }, "Лимит криков", h("small", { text: "0 — без лимита" })), num("screams_limit")),
    h("h4", { text: "Лечение и расходники" }),
    sw("Лечиться в бою", v.use_healing, (x) => { v.use_healing = x; }),
    h("div", { class: "sw" }, h("div", { class: "lbl" }, "Тип лечения"),
      select([["smart", "Умное"], ["heal_full", "Полное"], ["heal_10", "10%"]], v.healing_type, (x) => { v.healing_type = x; })),
    h("div", { class: "sw" }, h("div", { class: "lbl" }, "Хилок за бой", h("small", { text: "0 — без лимита" })), num("max_heals_per_battle")),
    sw("Докупать расходники", v.buy_consumables, (x) => { v.buy_consumables = x; }),
    h("div", { class: "sw" }, h("div", { class: "lbl" }, "Валюта покупки"),
      select([["auto", "Умное"], ["gold", "Золото"], ["pills", "Пилюли"], ["dollar", "Доллары"]],
        v.buy_consumables_currency, (x) => { v.buy_consumables_currency = x; })),
    sw("Не дороже награды", v.buy_consumables_max_by_reward, (x) => { v.buy_consumables_max_by_reward = x; }));
  return { el, value: () => v };
}

async function bossSettingsSheet(b, after) {
  if (!b) {
    const f = fightForm(S.bosses.general);
    const close = sheet("Общие настройки боссов", h("div", {},
      sw("Случайный порядок боссов", f.value().random_order, (x) => { f.value().random_order = x; }), f.el),
    [h("button", { class: "btn primary", text: "Применить", onclick: (e) => act(e.target, async () => {
      await call("set_general_boss", { values: f.value() });
      S.bosses.general = f.value(); close(); after && after();
    }, "Общие настройки сохранены") })]);
    return;
  }
  const cfg = S.bosses.config[b.id] || {};
  const v = { enabled: !!cfg.enabled, accept_invitations: !!cfg.accept_invitations,
    create_battles_count: cfg.create_battles_count || 0, accept_invitations_count: cfg.accept_invitations_count || 0,
    priority: cfg.priority || 0, end_on_all_unlocked: !!cfg.end_on_all_unlocked, use_special: !!cfg.use_special };
  const f = fightForm(cfg.special || S.bosses.general);
  const num = (key, note) => { const i = h("input", { type: "number", class: "num", value: v[key], min: 0 });
    i.addEventListener("input", () => { v[key] = parseInt(i.value || "0", 10); }); return i; };
  const info = h("div", { class: "hint", text: "⏳ загрузка информации…" });
  const special = h("div", { style: v.use_special ? "" : "display:none" }, f.el);
  const close = sheet(b.name || `Босс ${b.id}`, h("div", {},
    info,
    sw("Создавать бои", v.enabled, (x) => { v.enabled = x; }),
    h("div", { class: "sw" }, h("div", { class: "lbl" }, "Сколько боёв создать", h("small", { text: "0 — без лимита" })), num("create_battles_count")),
    sw("Принимать приглашения", v.accept_invitations, (x) => { v.accept_invitations = x; }),
    h("div", { class: "sw" }, h("div", { class: "lbl" }, "Сколько приглашений принять", h("small", { text: "0 — без лимита" })), num("accept_invitations_count")),
    h("div", { class: "sw" }, h("div", { class: "lbl" }, "Приоритет", h("small", { text: "0 — высший" })), num("priority")),
    sw("Закончить, когда выбито всё", v.end_on_all_unlocked, (x) => { v.end_on_all_unlocked = x; }),
    sw("Особые настройки боя", v.use_special, (x) => { v.use_special = x; special.style.display = x ? "" : "none"; }, "иначе — общие"),
    special),
  [h("button", { class: "btn primary", text: "Применить", onclick: (e) => act(e.target, async () => {
    const values = Object.assign({}, v, { special: f.value() });
    await call("set_boss", { id: b.id, values });
    Object.assign(S.bosses.config[b.id] = S.bosses.config[b.id] || {}, values, { kill_limit: values.create_battles_count });
    close(); after && after();
  }, "Настройки босса сохранены") })]);
  try {
    const d = await call("boss_info", { id: b.id });
    info.replaceChildren(...bossInfo(d));
  } catch (e) { info.textContent = e.message; }
}

function bossInfo(d) {
  if (!d || !d.maxHp) return [h("div", { text: "Данные недоступны." })];
  const r = d.rewardPreview || {};
  const reward = [r.gold && `${fmt(r.gold)} 💰`, r.pills && `${r.pills} 💊`, r.exp && `${r.exp} exp`, r.dollar && `${r.dollar} 💵`].filter(Boolean).join(", ") || "нет";
  const drops = {};
  for (const x of d.possibleDrops || []) drops[x.type] = (drops[x.type] || 0) + 1;
  const dropRu = { mutagen: "мутагены", room: "комнаты", weapon: "оружие", clothing_item: "одежда", pet: "питомцы", ornament: "тату" };
  return [
    h("div", { text: `HP ${fmt(d.maxHp)} · урон ${d.damageMin}-${d.damageMax} · ур. ${d.requiredLevel}+ (награда до ${d.rewardUntilLevel})` }),
    h("div", { text: `Бой ${Math.floor((d.maxFightDurationSeconds || 0) / 60)} мин · участников до ${d.maxParticipants || "?"} · награда: ${reward}` }),
    Object.keys(drops).length ? h("div", { text: "Дроп: " + Object.entries(drops).map(([k, n]) => `${dropRu[k] || k} ${n}`).join(", ") }) : null,
  ];
}

async function friendPicker(title, selected, onsave) {
  const chosen = new Set(selected);
  const list = h("div", {}, h("div", { class: "hint", text: "⏳ загрузка друзей…" }));
  const search = h("input", { type: "text", placeholder: "поиск по имени или id" });
  const count = h("span", { class: "hint" });
  let rows = [];
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    list.replaceChildren(...rows.filter((r) => !q || String(r.name).toLowerCase().includes(q) || String(r.id).includes(q))
      .slice(0, 400).map((r) => {
        const cb = h("input", { type: "checkbox", checked: chosen.has(r.id) });
        cb.addEventListener("change", () => { cb.checked ? chosen.add(r.id) : chosen.delete(r.id); count.textContent = `выбрано ${chosen.size}`; });
        return h("label", { class: "pick" }, cb, h("span", { class: "spacer", text: r.name }),
          h("span", { class: "hint", text: `ур.${r.level} 🧠${r.madness} 🔥${r.aggression} 💢${r.rage}` }));
      }));
    count.textContent = `выбрано ${chosen.size}`;
  };
  search.addEventListener("input", draw);
  const load = async (force) => {
    const r = await call("friends", { force });
    rows = r.list || [];
    draw();
  };
  const close = sheet(title, h("div", {}, h("div", { class: "row" }, search,
    h("button", { class: "btn small", text: "↻", onclick: (e) => act(e.target, () => load(true)) })), count, list),
  [h("button", { class: "btn small", text: "Снять все", onclick: () => { chosen.clear(); draw(); } }),
    h("button", { class: "btn primary", text: "Готово", onclick: () => { onsave([...chosen]); close(); } })]);
  quiet(load(false));
}

/* =================================================================
   ПЕРСОНАЖ
   ================================================================= */
function tabChar(root) {
  const p = (S.status && S.status.player) || {};
  const ups = p.upgrades || {};
  const statCard = (key, icon, title) => {
    const u = ups[key] || {};
    const wallet = p[u.currency] || 0;
    const canMoney = u.cost ? Math.floor(wallet / u.cost) : 0;
    const max = Math.min(u.remaining || 0, canMoney);
    const run = (amount) => (e) => act(e.target, () => call("upgrade_stat", { stat: key, amount }),
      `${title}: прокачка запущена, ход — в логе`);
    return h("div", { class: "tile" },
      h("b", { text: `${icon} ${fmt(p[key])}` }), h("small", { text: title }),
      h("div", { class: "hint", text: u.cost ? `след. ${fmt(u.cost)} ${CUR[u.currency] || u.currency} · сегодня ${u.remaining ?? "?"}/${u.limit ?? "?"}` : "нет данных" }),
      h("div", { class: "btns", style: "margin-top:6px" },
        h("button", { class: "btn small", text: "+1", disabled: max < 1, onclick: run(1) }),
        h("button", { class: "btn small", text: "+5", disabled: max < 5, onclick: run(5) }),
        h("button", { class: "btn small", text: `макс ${max}`, disabled: max < 1, onclick: run(max) })));
  };
  root.append(
    h("div", { class: "card" }, h("h3", { text: "🧍 Характеристики" }),
      h("div", { class: "grid3" },
        h("div", { class: "tile" }, h("b", { text: `❤ ${fmt(p.hp)}` }), h("small", { text: "HP" })),
        h("div", { class: "tile" }, h("b", { text: `⚔ ${fmt(p.damage)}` }), h("small", { text: "Урон" })),
        h("div", { class: "tile" }, h("b", { text: `💥 ${p.crit ?? "—"}%` }), h("small", { text: `Крит ×${p.crit_mult ?? "?"}` }))),
      h("div", { class: "btns", style: "margin-top:8px" },
        h("button", { class: "btn small", text: "↻ Обновить профиль", onclick: (e) => act(e.target, () => call("load_player"), "Профиль обновлён").then(() => tick().then(renderTab)) }))),
    h("div", { class: "card" }, h("h3", { text: "📈 Прокачка статов" }),
      h("div", { class: "grid3" }, statCard("madness", "🧠", "Безумие"), statCard("aggression", "🔥", "Агрессия"), statCard("rage", "💢", "Ярость"))),
    healCard());
}

function healCard() {
  const v = { item: "heal_10", currency: "gold", max: 0 };
  const info = h("span", { class: "hint", text: "…" });
  const qty = h("input", { type: "number", class: "num", value: 1, min: 1 });
  const buy = h("button", { class: "btn primary", text: "Купить" });
  const refresh = async () => {
    info.textContent = "⏳";
    try { v.max = (await call("heal_limit", v)).max; info.textContent = `доступно ${v.max}`; buy.disabled = v.max < 1; }
    catch (e) { info.textContent = e.message; }
  };
  buy.addEventListener("click", () => act(buy, () => call("buy_heals", { ...v, qty: Math.min(parseInt(qty.value || "0", 10), v.max) }),
    (r) => `Куплено: ${r.bought}`).then(refresh));
  quiet(refresh());
  return h("div", { class: "card" }, h("h3", { text: "💉 Купить хилки" }),
    h("div", { class: "grid2" },
      select([["heal_10", "10%"], ["heal_full", "Полное"]], v.item, (x) => { v.item = x; refresh(); }),
      select([["gold", "Золото"], ["pills", "Пилюли"], ["dollar", "Доллары"]], v.currency, (x) => { v.currency = x; refresh(); })),
    h("div", { class: "row", style: "margin-top:8px" }, qty, info, h("span", { class: "spacer" }), buy));
}

/* =================================================================
   СНАРЯЖЕНИЕ: оружие, питомцы, мутагены
   ================================================================= */
function tabGear(root) {
  const sub = sessionStorage.getItem("gear") || "weapon";
  const body = h("div", { class: "list" });
  root.append(seg([["weapon", "⚔ Оружие"], ["pet", "🐾 Питомцы"], ["mutagens", "🧬 Мутагены"]], sub, (x) => {
    sessionStorage.setItem("gear", x); renderTab(); }), body);
  if (sub === "mutagens") mutagensView(body); else itemsView(body, sub);
}

async function itemsView(root, kind) {
  root.append(h("div", { class: "card hint", text: "⏳ загрузка…" }));
  let data;
  try { data = await call("equipment", { kind }); } catch (e) { root.replaceChildren(h("div", { class: "card err", text: e.message })); return; }
  root.replaceChildren(h("div", { class: "btns" }, h("button", { class: "btn small", text: "↻ Обновить", onclick: () => renderTab() })));
  if (data.error) root.append(h("div", { class: "card err", text: "Игра не ответила — попробуйте обновить." }));
  else if (!data.items.length) root.append(h("div", { class: "card hint", text: "Нет предметов." }));
  for (const it of data.items) {
    const b = it.bonus || {};
    const autoCur = h("select", {}, ["gold", "pills", "dollar"].map((c) => h("option", { value: c, text: CUR_RU[c] })));
    const job = `auto_${kind}`;
    const done = it.level >= it.max;
    root.append(h("div", { class: "item" },
      h("div", { class: "row" }, h("span", { class: "name", text: it.name }), h("span", { class: "spacer" }),
        h("span", { class: "hint", text: `ур. ${it.level}/${it.max}` })),
      h("div", { class: "hint", text: `🧠+${b.madness || 0} 🔥+${b.aggression || 0} 💢+${b.rage || 0}` +
        (b.attackCooldownSeconds ? ` · КД ${b.attackCooldownSeconds}с` : "") +
        (it.mutagen ? ` · мутаген ${it.mutagen.name}` : "") }),
      done ? h("div", { class: "hint", text: "✅ максимальный уровень" }) : h("div", { class: "btns" },
        it.options.map((o) => h("button", { class: "btn small" + (o.currency === "dollar" ? " ok" : ""),
          text: `${CUR[o.currency] || o.currency} ${fmt(o.cost)} (${o.chance}%)`,
          onclick: (e) => act(e.target, () => call("upgrade_item", { kind, id: it.id, currency: o.currency }),
            (r) => r.success ? `Прокачано до ур. ${r.level}` : `Не удалось (−${r.charged})`).then(() => renderTab()) }))),
      done ? null : h("div", { class: "row" }, autoCur,
        h("button", { class: "btn small", text: "🚀 До макс.", onclick: (e) => act(e.target, () => call("auto_upgrade_item",
          { kind, id: it.id, currency: autoCur.value, target: it.max, level: it.level }), "Авто-прокачка запущена, ход — в логе") }),
        h("button", { class: "btn small", text: "⏹", onclick: () => call("stop_job", { job }).then(() => toast("Остановлю после текущей попытки")) })),
      !it.mutagen && it.supports_mutagen ? itemMutagenRow(kind, it) : null));
  }
}

function itemMutagenRow(kind, it) {
  const type = h("select", {}, ["I", "A", "X", "F", "S", "Z", "W"].map((t) => h("option", { value: t, text: "тип " + t })));
  const mut = h("select", {}, h("option", { value: "", text: "— выберите тип —" }));
  const load = async () => {
    mut.replaceChildren(h("option", { value: "", text: "⏳" }));
    const r = await call("mutagens", { type: type.value });
    const av = r.mutagens.filter((m) => m.qty > 0);
    mut.replaceChildren(...(av.length ? av.map((m) => h("option", { value: m.id, text: `${m.name} (${m.bonus}) ×${m.qty}` }))
      : [h("option", { value: "", text: "нет в наличии" })]));
  };
  type.addEventListener("change", () => quiet(load()));
  return h("details", {}, h("summary", { text: "Поставить мутаген", onclick: () => mut.options.length <= 1 && quiet(load()) }),
    h("div", { class: "grid2", style: "margin-top:6px" }, type, mut),
    h("button", { class: "btn small", style: "margin-top:6px", text: "Поставить", onclick: (e) => {
      if (!mut.value) return toast("Мутаген не выбран", "bad");
      act(e.target, () => call("mutagen_action", { action: "install_item", kind, item_id: it.id, mutagen_id: parseInt(mut.value, 10), type: type.value }),
        "Ставлю мутаген").then(() => setTimeout(renderTab, 2500));
    } }));
}

async function mutagensView(root) {
  const type = (S.config && S.config.mutagen_view_type) || "A";
  root.append(seg(["I", "A", "X", "F", "S", "Z", "W"].map((t) => [t, t]), type, (t) => {
    saveCfg({ mutagen_view_type: t }).then(renderTab); }));
  const card = h("div", { class: "card" }, h("div", { class: "hint", text: "⏳ загрузка…" }));
  root.append(card);
  let d;
  try { d = await call("mutagens", { type }); } catch (e) { card.replaceChildren(h("div", { class: "err", text: e.message })); return; }
  const av = d.mutagens.filter((m) => m.qty > 0);
  const pick = h("select", {}, av.length ? av.map((m) => h("option", { value: m.id, text: `${m.name} (${m.bonus}) ×${m.qty}` }))
    : h("option", { value: "", text: "нет в наличии" }));
  const best = av.reduce((a, m) => (!a || (m.level || 0) > (a.level || 0) ? m : a), null);
  if (best) pick.value = best.id;
  const level = h("input", { type: "number", class: "num", value: 20, min: 0 });
  const run = (action, extra, note) => (e) => act(e.target, () => call("mutagen_action",
    { action, type, mutagen_id: parseInt(pick.value || "0", 10), level: parseInt(level.value || "0", 10), ...(extra || {}) }),
    note || "Запущено, ход — в логе").then(() => setTimeout(renderTab, 4000));
  const chests = d.chests.map((c) => h("div", { text: `${c.type}: ${c.qty} шт. ` + (c.ready ? "✅ готов" : c.left ? `⏳ ${dur(c.left)}` : "") }));
  card.replaceChildren(
    h("h3", { text: `🧬 Мутагены, тип ${type}` }),
    h("div", { class: "hint", text: `💊 Пилюль: ${fmt(d.pills)} · видов в наличии: ${av.length}` }),
    h("h4", { text: "Сундуки" }), chests.length ? chests : h("div", { class: "hint", text: "нет" }),
    h("button", { class: "btn small", style: "margin-top:6px", text: "📦 Собрать и открыть", onclick: run("chests") }),
    h("h4", { text: "В наличии" }),
    av.length ? h("table", { class: "t" }, av.map((m) => h("tr", {}, h("td", { text: m.name }), h("td", { text: `×${m.qty}` }),
      h("td", { text: m.bonus }), h("td", { text: `${m.cost}💊` })))) : h("div", { class: "hint", text: "нет мутагенов этого типа" }),
    h("h4", { text: "Установка" }), pick,
    h("div", { class: "btns", style: "margin-top:6px" },
      h("button", { class: "btn small", text: "Поставить", onclick: run("install") }),
      h("button", { class: "btn small", text: "Во все свободные", onclick: run("install_max") }),
      h("button", { class: "btn small", text: "✨ Автоустановка лучших", onclick: run("auto_install") })),
    h("h4", { text: "Порог уровня" }),
    h("div", { class: "row" }, level, h("span", { class: "hint", text: "для снятия, замены и улучшения" })),
    h("div", { class: "btns", style: "margin-top:6px" },
      h("button", { class: "btn small", text: "Снять ниже порога", onclick: (e) => confirmDo(`Снять мутагены типа ${type} ниже уровня ${level.value}?`, () => run("extract_below")(e)) }),
      h("button", { class: "btn small", text: "Заменить ниже порога", onclick: (e) => confirmDo(`Заменить мутагены типа ${type} ниже уровня ${level.value} на выбранный?`, () => run("replace_below")(e)) }),
      h("button", { class: "btn small", text: "🔄 Улучшать до порога", onclick: run("upgrade") })),
    h("h4", { text: "Предметы с мутагенами" }),
    h("button", { class: "btn small", text: "Показать", onclick: (e) => act(e.target, async () => {
      const r = await call("mutagen_items");
      const kinds = { clothing: "Одежда", weapon: "Оружие", pet: "Питомец" };
      sheet("Предметы с мутагенами", h("table", { class: "t" }, r.items.map((x) => h("tr", {},
        h("td", { text: `${kinds[x.kind] || ""} ${x.name}` }), h("td", { text: `${x.mutagenName || "мутаген"} ${x.mutagenType || ""} ур.${x.level}` }),
        h("td", { text: `M+${x.madness} A+${x.aggression} R+${x.rage}` })))));
    }) }));
}

/* =================================================================
   ЭКОНОМИКА: магазин, бизнесы, клан
   ================================================================= */
function tabEco(root) {
  const shopBox = h("div", { class: "hint", text: "Нажмите «Сканировать», чтобы увидеть, что можно купить." });
  const bizBox = h("div", { class: "hint", text: "Нажмите «Обновить»." });
  const c = S.config || {};
  root.append(
    h("div", { class: "card" }, h("h3", { text: "🛒 Магазин" }),
      sw("Тратить доллары", c.shop_buy_dollars, (v) => saveCfg({ shop_buy_dollars: v })),
      h("div", { class: "btns", style: "margin:8px 0" },
        h("button", { class: "btn small", text: "Сканировать", onclick: (e) => act(e.target, async () => {
          const d = await call("shop"); shopBox.replaceChildren(...shopSummary(d)); }) }),
        h("button", { class: "btn primary small", text: "Купить всё доступное", onclick: (e) => confirmDo("Купить всё, на что хватает ресурсов?",
          () => act(e.target, () => call("shop_buy"), "Покупка запущена, итог — в логе")) })),
      shopBox),
    h("div", { class: "card" }, h("h3", { text: "🏢 Бизнесы" }),
      h("div", { class: "btns", style: "margin-bottom:8px" },
        h("button", { class: "btn small", text: "Обновить", onclick: (e) => act(e.target, async () => {
          const d = await call("businesses"); bizBox.replaceChildren(...bizSummary(d)); }) }),
        h("button", { class: "btn primary small", text: "💰 Собрать всё", onclick: (e) => act(e.target, () => call("businesses_collect"),
          (r) => `Собрано ${r.collected}: +${fmt(r.total_gold)}💰 +${fmt(r.total_pills)}💊 +${fmt(r.total_exp)} exp`) })),
      bizBox),
    clanCard());
}

function shopSummary(d) {
  const items = d.items || [];
  if (!items.length) return [h("div", { text: "Нечего покупать." })];
  const t = { madness: 0, aggression: 0, rage: 0, damage: 0 };
  for (const it of items) for (const k of Object.keys(t)) t[k] += (it.bonuses || {})[k] || 0;
  return [
    h("div", { text: `Доступно: ${items.length} · стоимость ${fmt(d.total_gold)}💰 ${fmt(d.total_pills)}💊 ${fmt(d.total_dollar)}💵` }),
    h("div", { text: `Прирост: 🧠+${t.madness} 🔥+${t.aggression} 💢+${t.rage} ⚔+${t.damage}` }),
    h("table", { class: "t" }, items.slice(0, 60).map((it) => h("tr", {},
      h("td", { text: it.name }), h("td", { text: `${fmt((it.price || {}).amount)} ${CUR[(it.price || {}).currency] || ""}` }),
      h("td", { text: it.in_set ? `набор ${it.set_owned}/${it.set_total}` : "" })))),
  ];
}

function bizSummary(d) {
  const inc = d.total_income || {};
  const out = [h("div", { text: `Этажей: ${(d.floors || []).length} · готово к сбору: ${d.total_ready || 0} · ` +
    `прибыль ${fmt(inc.gold)}💰 ${fmt(inc.pills)}💊 ${fmt(inc.dollar)}💵 ${fmt(inc.exp)} exp` })];
  for (const f of d.floors || []) {
    out.push(h("h4", { text: `[${f.code}] ${f.name}: ` + (f.total_ready ? `🎁 ${f.ready_count}/${f.total_ready}` : "✓ всё собрано") }));
    for (const b of f.businesses || []) {
      if (!b.can_collect) continue;
      const r = b.current_rewards || {};
      out.push(h("div", { text: `• ${b.title} (ур. ${b.level}/${b.max_level}): +${fmt(r.gold)}💰 +${fmt(r.pills)}💊 +${fmt(r.exp)} exp` }));
    }
  }
  return out;
}

function clanCard() {
  const sel = h("select", {}, h("option", { value: "", text: "— загрузите список —" }));
  const target = h("input", { type: "text", placeholder: "@канал, @юзер или ID" });
  const load = async (force) => {
    const r = await call("clans", { force });
    sel.replaceChildren(...r.list.map((c) => h("option", { value: c.id, text: `#${c.rank} [${c.tag || "—"}] ${c.name} (${c.members}/${c.max})` })));
    if (r.selected) sel.value = r.selected;
    target.value = r.target || "";
  };
  const linked = S.me && S.me.user.mode === "telethon";
  return h("div", { class: "card" }, h("h3", { text: "🏰 Клан" }),
    h("div", { class: "row" }, sel, h("button", { class: "btn small", text: "↻", onclick: (e) => act(e.target, () => load(true)) })),
    h("div", { class: "field" }, h("span", { text: "Куда отправить таблицу участников" }), target),
    h("button", { class: "btn small", text: "Отправить", disabled: !linked, onclick: (e) => {
      if (!sel.value) return toast("Клан не выбран", "bad");
      act(e.target, () => call("clan_send", { clan_id: parseInt(sel.value, 10), target: target.value,
        title: sel.options[sel.selectedIndex].text }), (r) => `Отправлено: ${r.sent} участников`);
    } }),
    linked ? h("div", { class: "hint", text: "Сообщение уйдёт от вашего Telegram." })
      : h("div", { class: "hint", text: "Нужен вход через Telegram (вкладка «Вход»)." }),
    h("button", { class: "btn small", style: "margin-top:6px", text: "Загрузить список", onclick: (e) => act(e.target, () => load(false)) }));
}

/* =================================================================
   ЛОГ
   ================================================================= */
let logEl;
function tabLog(root) {
  const cats = Object.assign(Object.fromEntries(Object.keys(LOG_CATS).map((k) => [k, k !== "debug"])),
    (S.config && S.config.log_categories) || {});
  S.logFilter = cats;
  const counter = h("span", { class: "hint" });
  logEl = h("div", { class: "log" });
  const filters = h("div", { class: "filters" }, Object.entries(LOG_CATS).map(([k, t]) => {
    const cb = h("input", { type: "checkbox", checked: cats[k] });
    cb.addEventListener("change", () => { cats[k] = cb.checked; saveCfg({ log_categories: { [k]: cb.checked } }); redraw(); });
    return h("label", { class: "c-" + k }, cb, t);
  }));
  const redraw = () => {
    logEl.replaceChildren();
    appendLog(S.logs, true);
    counter.textContent = `строк: ${logEl.children.length}`;
  };
  root.append(h("div", { class: "card" }, filters,
    h("div", { class: "btns", style: "margin:8px 0" },
      h("button", { class: "btn small", text: "📋 Копировать", onclick: () => {
        const text = S.logs.filter((r) => cats[r.category] !== false).map((r) => `[${r.time}] ${r.text}`).join("\n");
        navigator.clipboard.writeText(text).then(() => toast("Скопировано", "ok"), () => toast("Не удалось скопировать", "bad"));
      } }),
      h("button", { class: "btn small", text: "🧹 Очистить", onclick: () => call("clear_logs").then(() => { S.logs = []; redraw(); }) }),
      h("span", { class: "spacer" }), counter),
    logEl));
  redraw();
}

function appendLog(items, initial) {
  if (!logEl || !logEl.isConnected) return;
  const atBottom = initial || logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 40;
  const cats = S.logFilter || {};
  const frag = document.createDocumentFragment();
  for (const r of items) {
    if (cats[r.category] === false) continue;
    frag.append(h("div", { class: "c-" + r.category }, h("span", { class: "t", text: r.time + " " }), r.text));
  }
  logEl.append(frag);
  while (logEl.children.length > 2000) logEl.firstChild.remove();
  if (atBottom) logEl.scrollTop = logEl.scrollHeight;
}

/* =================================================================
   ВХОД: три способа подключить игровой аккаунт
   ================================================================= */
function tabLogin(root) {
  const st = S.status || {};
  const mode = S.me.user.mode;
  const modeText = { telethon: "через ваш Telegram — токен обновляется сам", manual: "вручную указанный токен", none: "не подключён" }[mode];
  let tokenText = "нет токена";
  if (st.has_token) tokenText = st.token_ok ? (st.token_seconds ? `действует ещё ${dur(st.token_seconds)}` : "действует") : "истёк";
  root.append(h("div", { class: "card" }, h("h3", { text: "🔐 Аккаунт игры" }),
    h("div", { text: `Подключение: ${modeText}` }),
    h("div", { class: "hint", text: `Токен: ${tokenText}` }),
    mode !== "none" ? h("div", { class: "btns", style: "margin-top:8px" },
      h("button", { class: "btn small", text: "🔄 Обновить токен", onclick: (e) => act(e.target, () => call("refresh_token"), "Токен обновлён").then(tick) }),
      h("button", { class: "btn small bad", text: "Отключить", onclick: (e) => confirmDo(
        "Отключить аккаунт? Бот остановится, токен и сессия удалятся с сервера.",
        () => act(e.target, () => api("/api/account/disconnect", { logout: mode === "telethon" }), "Отключено").then(() => location.reload())) })) : null));

  root.append(loginTelegramCard(), loginDesktopCard(), loginManualCard());
}

function loginTelegramCard() {
  const box = h("div", {});
  const needApi = !S.me.server_api;
  const phone = h("input", { type: "tel", placeholder: "+79991234567" });
  const apiId = h("input", { type: "number", placeholder: "api_id" });
  const apiHash = h("input", { type: "text", placeholder: "api_hash" });
  const stepPhone = () => box.replaceChildren(
    needApi ? h("div", { class: "grid2" }, apiId, apiHash) : null,
    needApi ? h("div", { class: "hint", text: "api_id и api_hash берутся на my.telegram.org → API development tools." }) : null,
    h("div", { class: "field" }, h("span", { text: "Номер телефона аккаунта с игрой" }), phone),
    h("button", { class: "btn primary block", text: "Получить код", onclick: (e) => act(e.target, async () => {
      await api("/api/account/send_code", { phone: phone.value, api_id: apiId.value, api_hash: apiHash.value });
      stepCode();
    }, "Код отправлен в Telegram") }));
  const stepCode = () => {
    const code = h("input", { type: "text", inputmode: "numeric", placeholder: "код из Telegram", autocomplete: "one-time-code" });
    box.replaceChildren(
      h("div", { class: "warn", text: "Код пришёл в чат «Telegram». Введите его здесь и никому не пересылайте: если переслать код в сообщении, Telegram его аннулирует." }),
      h("div", { class: "field" }, code),
      h("button", { class: "btn primary block", text: "Войти", onclick: (e) => act(e.target, async () => {
        const r = await api("/api/account/code", { code: code.value });
        if (r.step === "2fa") stepPassword(); else done(r);
      }) }),
      h("button", { class: "btn small", style: "margin-top:6px", text: "← другой номер", onclick: stepPhone }));
  };
  const stepPassword = () => {
    const pw = h("input", { type: "password", placeholder: "облачный пароль", autocomplete: "current-password" });
    box.replaceChildren(h("div", { class: "hint", text: "У аккаунта включена двухэтапная проверка. Введите облачный пароль Telegram." }),
      h("div", { class: "field" }, pw),
      h("button", { class: "btn primary block", text: "Подтвердить", onclick: (e) => act(e.target, async () => {
        const r = await api("/api/account/password", { password: pw.value });
        pw.value = "";
        done(r);
      }) }));
  };
  const done = () => { toast("Аккаунт подключён", "ok"); setTimeout(() => location.reload(), 900); };
  stepPhone();
  return h("div", { class: "card" }, h("h3", { text: "1. Вход через Telegram" }),
    h("div", { class: "hint", text: "Сервер получит сессию вашего Telegram и сам будет обновлять токен игры каждый день. " +
      "Сессия хранится зашифрованной. Отключить её можно в любой момент: Telegram → Настройки → Устройства → «Madness Mini App»." }),
    h("div", { style: "height:8px" }), box);
}

function loginDesktopCard() {
  const out = h("div", {});
  return h("div", { class: "card" }, h("h3", { text: "2. Перенос из десктопа" }),
    h("div", { class: "hint", text: "Если бот уже настроен в программе на ПК: она передаст сессию, токен и все настройки боссов. Коды вводить не нужно." }),
    h("button", { class: "btn small", style: "margin-top:8px", text: "Получить код переноса", onclick: (e) => act(e.target, async () => {
      const r = await api("/api/account/import_code");
      out.replaceChildren(
        h("div", { class: "code-big", text: r.code }),
        h("ol", { class: "steps" },
          h("li", {}, "Откройте программу на ПК → вкладка «Вход»."),
          h("li", {}, "В блоке «Перенести в Mini App» укажите адрес ", h("code", { class: "k", text: API_BASE || location.origin })),
          h("li", {}, "Введите этот код и нажмите «Перенести»."),
          h("li", {}, "Остановите бота на ПК, чтобы аккаунтом не играли два бота сразу.")),
        h("div", { class: "hint", text: "Код действует 10 минут и срабатывает один раз." }));
    }) }), out);
}

function loginManualCard() {
  const ta = h("textarea", { placeholder: "eyJhbGciOi…  или  query_id=…&user=…&auth_date=…&hash=…" });
  return h("div", { class: "card" }, h("h3", { text: "3. Вручную: токен или initData" }),
    h("div", { class: "hint", text: "Без доступа к вашему Telegram. Токен живёт 24 часа, потом его нужно вставить заново — бот напомнит сообщением." }),
    h("details", { style: "margin:8px 0" }, h("summary", { text: "Как получить токен" }), tokenHelp()),
    ta,
    h("button", { class: "btn primary block", style: "margin-top:8px", text: "Сохранить", onclick: (e) => act(e.target, async () => {
      const r = await api("/api/account/manual", { value: ta.value });
      ta.value = "";
      return r;
    }, (r) => r.kind === "jwt" ? `Токен принят, действует ${dur(r.seconds_left)}` : "initData принят").then(() => setTimeout(() => location.reload(), 900)) }));
}

function tokenHelp() {
  return h("div", { class: "hint" },
    h("p", {}, h("b", { text: "Нужен Telegram Desktop на компьютере." }), " В мобильном Telegram инструментов разработчика нет."),
    h("p", { text: "Вариант А — initData (лучше: бот сам меняет его на свежий токен, пока игра его принимает):" }),
    h("ol", { class: "steps" },
      h("li", {}, "Telegram Desktop → Настройки → Продвинутые настройки → Экспериментальные настройки → включите ", h("b", { text: "Enable webview inspecting" }), "."),
      h("li", {}, "Перезапустите Telegram и откройте игру в боте ", h("code", { class: "k", text: "@" + "imadhouse_bot" }), "."),
      h("li", {}, "Щёлкните правой кнопкой внутри игры → ", h("b", { text: "Inspect" }), " (или «Проверить»). Откроются DevTools."),
      h("li", {}, "Вкладка ", h("b", { text: "Console" }), ", введите ", h("code", { class: "k", text: "copy(Telegram.WebApp.initData)" }), " и нажмите Enter."),
      h("li", {}, "Строка скопирована — вставьте её в поле ниже.")),
    h("p", { text: "Вариант Б — сам токен (JWT, действует 24 часа):" }),
    h("ol", { class: "steps" },
      h("li", {}, "В тех же DevTools откройте вкладку ", h("b", { text: "Network" }), " и сделайте любое действие в игре."),
      h("li", {}, "Выберите запрос к ", h("code", { class: "k", text: "cargohustle.online/api/…" }), " → Headers → Request Headers."),
      h("li", {}, "Скопируйте значение ", h("code", { class: "k", text: "Authorization" }), " (слово Bearer можно оставить).")),
    h("p", { class: "warn", text: "Токен и initData дают доступ к вашему игровому аккаунту. Не отправляйте их никому, кроме этой панели." }));
}

/* =================================================================
   АДМИН
   ================================================================= */
async function tabAdmin(root) {
  const box = h("div", { class: "card" }, h("div", { class: "hint", text: "⏳" }));
  root.append(box);
  const load = async () => {
    const r = await api("/api/admin/users");
    const stRu = { pending: "⏳ ждёт", approved: "✅ доступ", blocked: "⛔ закрыт" };
    const whyRu = { not_in_clan: "нет в клане", no_username: "нет username", clan_unknown: "клан не проверен",
      limit: "лимит", left_clan: "вышел из клана" };
    const byRu = { clan: "автодопуск по клану" };
    box.replaceChildren(h("h3", { text: `👥 Пользователи (лимит ${r.max_users})` }),
      r.clan ? h("div", { class: "row", style: "margin-bottom:8px" },
        h("span", { class: "hint", text: `Допуск: ${r.clan}. Состав ${r.roster_age === null ? "ещё не загружен" : "обновлён " + ago(r.roster_age)}.` }),
        h("span", { class: "spacer" }),
        h("button", { class: "btn small", text: "↻ Перепроверить", onclick: (e) => act(e.target, () => api("/api/admin/recheck"),
          (x) => `В клане ${x.members}, допущено новых: ${x.approved}`).then(load) })) : null,
      ...r.users.map((u) => h("div", { class: "item", style: "margin-bottom:6px" },
        h("div", { class: "row" }, h("span", { class: "name", text: (u.name || "без имени") + (u.username ? ` @${u.username}` : "") }),
          u.manual ? h("span", { class: "badge " + (u.in_clan === false ? "warn" : "manual"),
            title: "Допущен вручную — клан не проверяется",
            text: "✋ вручную" + (u.in_clan === true ? " · в клане" : u.in_clan === false ? " · не из клана" : "") }) : null,
          h("span", { class: "spacer" }), h("span", { class: "hint", text: (stRu[u.status] || u.status) +
            (u.status === "pending" && whyRu[u.pending_reason] ? ` (${whyRu[u.pending_reason]})` : "") })),
        h("div", { class: "hint", text: `id ${u.id} · вход: ${u.mode || "none"} · процесс: ${u.process ? "запущен" : "нет"}` +
          (u.status_by === "clan" && u.status === "approved" ? ` · ${byRu.clan}` : "") +
          (u.player_id ? ` · игрок ${u.game_username ? "@" + u.game_username : ""} #${u.player_id}` : "") +
          (u.seen ? ` · был ${new Date(u.seen * 1000).toLocaleString("ru-RU")}` : "") }),
        u.admin ? h("div", { class: "hint", text: "админ" }) : h("div", { class: "btns" },
          u.status !== "approved" ? h("button", { class: "btn small ok", text: "Пустить", onclick: (e) => act(e.target, () => api("/api/admin/set", { id: u.id, status: "approved" }), "Доступ открыт").then(load) }) : null,
          u.status !== "blocked" ? h("button", { class: "btn small bad", text: "Закрыть", onclick: (e) => confirmDo("Закрыть доступ и остановить бота этого пользователя?",
            () => act(e.target, () => api("/api/admin/set", { id: u.id, status: "blocked" }), "Доступ закрыт").then(load)) }) : null,
          u.process ? h("button", { class: "btn small", text: "⏹ Бот", onclick: (e) => act(e.target, () => api("/api/admin/stop_bot", { id: u.id }), "Остановлен").then(load) }) : null))));
  };
  try { await load(); } catch (e) { box.replaceChildren(h("div", { class: "err", text: e.message })); }
}

document.addEventListener("visibilitychange", () => { if (!document.hidden) tick(); });
boot();
