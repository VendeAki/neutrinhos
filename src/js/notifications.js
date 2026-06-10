import { getCurrentProfile, isLocalMode, supabase } from './supabaseClient.js';
import { getCharacter, getWorldOnline, normalizeCharacterResponse, normalizeWorldResponse } from './tibiaApi.js';
import { escapeHtml, formatDate } from './utils.js';

const WATCHLIST_KEY = 'neutrinhos_watchlist_v1';
const EVENTS_KEY = 'neutrinhos_notification_events_v1';
const RADAR_KEY = 'neutrinhos_account_radar_v1';
const SCAN_INTERVAL_MS = 60_000;
const CANDIDATE_WINDOW_MS = 10 * 60_000;

let watchlist = load(WATCHLIST_KEY, []);
let events = load(EVENTS_KEY, []);
let radar = load(RADAR_KEY, { worlds: {}, candidates: {}, recentOffline: {} });
let scanTimer = null;

const elements = {
  form: document.querySelector('#watch-form'),
  characterName: document.querySelector('#watch-character-name'),
  worldName: document.querySelector('#watch-world-name'),
  permissionButton: document.querySelector('#notification-permission-button'),
  scanNowButton: document.querySelector('#scan-now-button'),
  clearEventsButton: document.querySelector('#clear-events-button'),
  monitorStatus: document.querySelector('#monitor-status'),
  watchlistTable: document.querySelector('#watchlist-table'),
  eventsList: document.querySelector('#notification-events'),
  candidatesTable: document.querySelector('#candidates-table'),
  candidateCount: document.querySelector('#candidate-count'),
  toastStack: document.querySelector('#toast-stack'),
  userRole: document.querySelector('#user-role'),
  logoutButton: document.querySelector('#logout-button'),
};

async function init() {
  const { user, profile, error } = await getCurrentProfile();
  if (error || !user) {
    window.location.href = './login.html';
    return;
  }

  elements.userRole.textContent = profile?.role || 'member';
  bindEvents();
  renderAll();
  startMonitor();
}

function bindEvents() {
  elements.form.addEventListener('submit', addWatchCharacter);
  elements.permissionButton.addEventListener('click', requestNotificationPermission);
  elements.scanNowButton.addEventListener('click', () => scanAll({ forceNotifyOnline: true }));
  elements.clearEventsButton.addEventListener('click', clearEvents);
  elements.watchlistTable.addEventListener('click', handleWatchAction);
  elements.logoutButton.addEventListener('click', logout);
}

async function addWatchCharacter(event) {
  event.preventDefault();
  const formData = new FormData(elements.form);
  const name = String(formData.get('character_name') || '').trim();
  const world = String(formData.get('world_name') || '').trim();
  if (!name || !world) return;

  const exists = watchlist.some((item) => sameName(item.name, name));
  if (exists) {
    showToast('Char já monitorado', `${name} já está na lista de alertas.`);
    return;
  }

  watchlist.push({
    id: crypto.randomUUID(),
    name,
    world,
    notifyLogin: true,
    notifyDeaths: true,
    isOnline: false,
    initialized: false,
    lastScan: null,
    lastDeathKeys: [],
  });
  save(WATCHLIST_KEY, watchlist);
  elements.form.reset();
  elements.worldName.value = world;
  renderAll();
  showToast('Alerta criado', `${name} será monitorado em ${world}.`);
  await scanAll({ forceNotifyOnline: true });
}

function startMonitor() {
  if (scanTimer) window.clearInterval(scanTimer);
  elements.monitorStatus.textContent = `monitor ativo · ${SCAN_INTERVAL_MS / 1000}s`;
  elements.monitorStatus.className = 'badge badge-green';
  scanTimer = window.setInterval(() => scanAll(), SCAN_INTERVAL_MS);
  scanAll();
}

async function scanAll({ forceNotifyOnline = false } = {}) {
  if (!watchlist.length) {
    elements.monitorStatus.textContent = 'sem chars monitorados';
    elements.monitorStatus.className = 'badge badge-neutral';
    return;
  }

  elements.monitorStatus.textContent = 'escaneando TibiaData...';
  elements.monitorStatus.className = 'badge badge-gold';

  const worlds = [...new Set(watchlist.map((item) => item.world))];
  const worldResults = new Map();

  for (const worldName of worlds) {
    try {
      const world = normalizeWorldResponse(await getWorldOnline(worldName));
      worldResults.set(worldName, world);
      updateRadarFromWorld(worldName, world.onlinePlayers);
    } catch (error) {
      registerEvent('error', worldName, `Erro ao consultar mundo ${worldName}: ${error.message}`);
    }
  }

  for (const watch of watchlist) {
    const world = worldResults.get(watch.world);
    if (world) updateLoginState(watch, world.onlinePlayers, forceNotifyOnline);
    await updateDeathState(watch);
    watch.lastScan = new Date().toISOString();
  }

  save(WATCHLIST_KEY, watchlist);
  save(RADAR_KEY, radar);
  renderAll();
  elements.monitorStatus.textContent = isLocalMode ? 'monitor ativo · localhost + TibiaData' : 'monitor ativo · Supabase + TibiaData';
  elements.monitorStatus.className = 'badge badge-green';
}

function updateLoginState(watch, onlinePlayers, forceNotifyOnline) {
  const isOnline = onlinePlayers.some((player) => sameName(player.name, watch.name));
  const wasOnline = Boolean(watch.isOnline);

  if (watch.initialized && !wasOnline && isOnline && watch.notifyLogin) {
    notify('login', watch.name, `${watch.name} logou no Tibia (${watch.world}).`);
  }

  if (!watch.initialized && isOnline && forceNotifyOnline && watch.notifyLogin) {
    notify('login', watch.name, `${watch.name} está online agora em ${watch.world}.`);
  }

  watch.isOnline = isOnline;
  watch.initialized = true;
}

async function updateDeathState(watch) {
  if (!watch.notifyDeaths) return;

  try {
    const character = normalizeCharacterResponse(await getCharacter(watch.name));
    const latestDeaths = character.deaths.slice(0, 5);
    const currentKeys = latestDeaths.map(deathKey);
    const previousKeys = new Set(watch.lastDeathKeys || []);
    const newDeaths = latestDeaths.filter((death) => !previousKeys.has(deathKey(death)));

    if (watch.initialized && previousKeys.size && newDeaths.length) {
      newDeaths.forEach((death) => notify('death', watch.name, `${watch.name} morreu no level ${death.level}: ${death.reason}`));
    }

    watch.lastDeathKeys = currentKeys;
  } catch (error) {
    registerEvent('error', watch.name, `Erro ao consultar mortes de ${watch.name}: ${error.message}`);
  }
}

function updateRadarFromWorld(worldName, players) {
  const now = Date.now();
  const currentOnline = new Set(players.map((player) => normalizeName(player.name)));
  const previousOnline = new Set(radar.worlds[worldName]?.online || []);
  const newlyOnline = [...currentOnline].filter((name) => !previousOnline.has(name));
  const newlyOffline = [...previousOnline].filter((name) => !currentOnline.has(name));
  const watchedInWorld = watchlist.filter((watch) => watch.world === worldName);

  radar.recentOffline[worldName] ||= {};
  newlyOffline.forEach((name) => { radar.recentOffline[worldName][name] = now; });

  watchedInWorld.forEach((watch) => {
    const watchKey = normalizeName(watch.name);
    if (newlyOffline.includes(watchKey)) {
      newlyOnline.forEach((candidate) => addCandidate(watch.name, candidate, 35, 'Entrou logo após o char observado sair', now));
    }

    if (newlyOnline.includes(watchKey)) {
      Object.entries(radar.recentOffline[worldName] || {})
        .filter(([, timestamp]) => now - timestamp <= CANDIDATE_WINDOW_MS)
        .forEach(([candidate]) => addCandidate(watch.name, candidate, 18, 'Saiu poucos minutos antes do char observado entrar', now));
    }

    newlyOnline.forEach((candidate) => {
      const targetOfflineAt = radar.recentOffline[worldName]?.[watchKey];
      if (targetOfflineAt && now - targetOfflineAt <= CANDIDATE_WINDOW_MS) {
        addCandidate(watch.name, candidate, 28, 'Entrou dentro da janela de troca de char', now);
      }
    });
  });

  Object.entries(radar.recentOffline[worldName] || {}).forEach(([name, timestamp]) => {
    if (now - timestamp > CANDIDATE_WINDOW_MS) delete radar.recentOffline[worldName][name];
  });
  radar.worlds[worldName] = { online: [...currentOnline], checkedAt: now };
}

function addCandidate(targetName, candidateKey, score, reason, timestamp) {
  if (!candidateKey || sameName(targetName, candidateKey)) return;
  const key = `${normalizeName(targetName)}::${candidateKey}`;
  const candidate = radar.candidates[key] || {
    targetName,
    candidateName: titleizeName(candidateKey),
    score: 0,
    reasons: [],
    firstSeen: timestamp,
    lastSeen: timestamp,
  };

  candidate.score = Math.min(99, candidate.score + score);
  candidate.lastSeen = timestamp;
  candidate.reasons = [reason, ...candidate.reasons.filter((item) => item !== reason)].slice(0, 3);
  radar.candidates[key] = candidate;
}

function notify(type, title, message) {
  registerEvent(type, title, message);
  showToast(title, message, type);

  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(`Neutrinhos · ${title}`, { body: message });
  }
}

function registerEvent(type, title, message) {
  events = [{ id: crypto.randomUUID(), type, title, message, createdAt: new Date().toISOString() }, ...events].slice(0, 50);
  save(EVENTS_KEY, events);
}

function renderAll() {
  renderWatchlist();
  renderEvents();
  renderCandidates();
}

function renderWatchlist() {
  elements.watchlistTable.innerHTML = watchlist.map((watch) => `<tr>
    <td><strong>${escapeHtml(watch.name)}</strong></td>
    <td>${escapeHtml(watch.world)}</td>
    <td><span class="badge ${watch.isOnline ? 'badge-green' : 'badge-neutral'}">${watch.isOnline ? 'online' : 'offline'}</span></td>
    <td>${escapeHtml((watch.lastDeathKeys || [])[0] || '—')}</td>
    <td>${formatDate(watch.lastScan)}</td>
    <td><div class="row-actions"><a class="mini-button" href="./character.html?name=${encodeURIComponent(watch.name)}">Perfil</a><button class="mini-button" data-action="remove" data-id="${watch.id}">Remover</button></div></td>
  </tr>`).join('') || '<tr><td colspan="6" class="muted">Nenhum char monitorado.</td></tr>';
}

function renderEvents() {
  elements.eventsList.innerHTML = events.map((event) => `<li><span>${eventIcon(event.type)} <strong>${escapeHtml(event.title)}</strong><br><small class="muted">${escapeHtml(event.message)}</small></span><span class="muted">${formatDate(event.createdAt)}</span></li>`).join('') || '<li class="muted">Nenhum evento registrado ainda.</li>';
}

function renderCandidates() {
  const candidates = Object.values(radar.candidates || {}).sort((a, b) => b.score - a.score).slice(0, 30);
  elements.candidateCount.textContent = `${candidates.length} candidatos`;
  elements.candidatesTable.innerHTML = candidates.map((candidate, index) => `<tr>
    <td>${index + 1}</td>
    <td>${scoreBadge(candidate.score)}</td>
    <td><div class="score-meter"><span style="width:${candidate.score}%"></span></div><strong>${candidate.score}%</strong></td>
    <td><a class="link-like" href="./character.html?name=${encodeURIComponent(candidate.candidateName)}">${escapeHtml(candidate.candidateName)}</a><br><small class="muted">alvo: ${escapeHtml(candidate.targetName)}</small></td>
    <td>${escapeHtml(candidate.reasons.join(' · '))}</td>
    <td><input type="checkbox" checked aria-label="Exportar ${escapeHtml(candidate.candidateName)}" /></td>
  </tr>`).join('') || '<tr><td colspan="6" class="muted">Adicione um char e deixe o monitor rodar para gerar probabilidades.</td></tr>';
}

function scoreBadge(score) {
  if (score >= 70) return '<span class="badge badge-green">VERY HIGH</span>';
  if (score >= 35) return '<span class="badge badge-gold">MEDIUM</span>';
  return '<span class="badge badge-blue">LOW</span>';
}

function showToast(title, message, type = 'info') {
  const toast = document.createElement('article');
  toast.className = `toast-card toast-${type}`;
  toast.innerHTML = `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(message)}</span>`;
  elements.toastStack.appendChild(toast);
  window.setTimeout(() => toast.remove(), 6500);
}

async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    showToast('Pop-up indisponível', 'Seu navegador não suporta notificações do sistema.');
    return;
  }

  const permission = await Notification.requestPermission();
  showToast('Permissão de pop-up', permission === 'granted' ? 'Notificações do navegador ativadas.' : 'Permissão negada ou ignorada.');
}

function handleWatchAction(event) {
  const button = event.target.closest('button[data-action="remove"]');
  if (!button) return;
  watchlist = watchlist.filter((watch) => watch.id !== button.dataset.id);
  save(WATCHLIST_KEY, watchlist);
  renderAll();
}

function clearEvents() {
  events = [];
  save(EVENTS_KEY, events);
  renderEvents();
}

function deathKey(death) {
  return `${death.time}|${death.level}|${death.reason}`;
}

function eventIcon(type) {
  if (type === 'login') return '🟢';
  if (type === 'death') return '💀';
  if (type === 'error') return '⚠️';
  return '🔔';
}

function sameName(left, right) {
  return normalizeName(left) === normalizeName(right);
}

function normalizeName(value) {
  return String(value || '').trim().toLowerCase();
}

function titleizeName(value) {
  return String(value || '').split(' ').map((part) => part ? `${part[0].toUpperCase()}${part.slice(1)}` : '').join(' ');
}

function load(key, fallback) {
  try {
    return JSON.parse(window.localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

async function logout() {
  await supabase.auth.signOut();
  window.location.href = './login.html';
}

init();
