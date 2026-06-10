import { getCurrentProfile, isLocalMode, supabase } from './supabaseClient.js';
import { getWorldOnline, normalizeWorldResponse } from './tibiaApi.js';
import { badge, escapeHtml, formatDate, VOCATIONS } from './utils.js';

let onlinePlayers = [];
let currentWorldName = 'Quelibra';

const elements = {
  form: document.querySelector('#world-search-form'),
  worldName: document.querySelector('#world-name'),
  refreshButton: document.querySelector('#refresh-world-button'),
  sourceStatus: document.querySelector('#world-source-status'),
  displayName: document.querySelector('#world-display-name'),
  worldStatus: document.querySelector('#world-status'),
  onlineCount: document.querySelector('#world-online-count'),
  location: document.querySelector('#world-location'),
  pvpType: document.querySelector('#world-pvp-type'),
  lastFetch: document.querySelector('#world-last-fetch'),
  playerTable: document.querySelector('#online-players-table'),
  filterName: document.querySelector('#online-filter-name'),
  filterVocation: document.querySelector('#online-filter-vocation'),
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
  hydrateVocationFilter();
  bindEvents();
  await fetchWorld(currentWorldName);
}

function hydrateVocationFilter() {
  elements.filterVocation.innerHTML = '<option value="">Todas vocações</option>'
    + VOCATIONS.map((vocation) => `<option value="${vocation}">${vocation}</option>`).join('');
}

function bindEvents() {
  elements.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(elements.form);
    await fetchWorld(formData.get('world_name'));
  });

  elements.refreshButton.addEventListener('click', () => fetchWorld(currentWorldName));
  elements.filterName.addEventListener('input', renderPlayers);
  elements.filterVocation.addEventListener('input', renderPlayers);
  elements.logoutButton.addEventListener('click', logout);
}

async function fetchWorld(worldName) {
  currentWorldName = String(worldName || 'Quelibra').trim();
  elements.worldName.value = currentWorldName;
  elements.sourceStatus.textContent = 'consultando TibiaData...';
  elements.sourceStatus.className = 'badge badge-gold';
  elements.playerTable.innerHTML = '<tr><td colspan="4" class="muted">Carregando players online...</td></tr>';

  try {
    const payload = await getWorldOnline(currentWorldName);
    const world = normalizeWorldResponse(payload);
    onlinePlayers = world.onlinePlayers;
    renderWorldSummary(world);
    renderPlayers();
    elements.sourceStatus.textContent = isLocalMode ? 'localhost + TibiaData' : 'Supabase + TibiaData';
  } catch (error) {
    console.error(error);
    onlinePlayers = [];
    elements.sourceStatus.textContent = 'erro na consulta';
    elements.sourceStatus.className = 'badge badge-red';
    elements.playerTable.innerHTML = `<tr><td colspan="4" class="muted">Não foi possível consultar ${escapeHtml(currentWorldName)}. ${escapeHtml(error.message)}</td></tr>`;
  }
}

function renderWorldSummary(world) {
  elements.displayName.textContent = world.name;
  elements.worldStatus.textContent = world.status;
  elements.onlineCount.textContent = world.onlineCount || onlinePlayers.length;
  elements.location.textContent = world.location;
  elements.pvpType.textContent = world.pvpType;
  elements.lastFetch.textContent = formatDate(new Date().toISOString());
}

function renderPlayers() {
  const nameFilter = elements.filterName.value.toLowerCase();
  const vocationFilter = elements.filterVocation.value;
  const filtered = onlinePlayers.filter((player) => {
    const matchesName = !nameFilter || player.name.toLowerCase().includes(nameFilter);
    const matchesVocation = !vocationFilter || player.vocation === vocationFilter;
    return matchesName && matchesVocation;
  });

  elements.playerTable.innerHTML = filtered.map((player) => `<tr>
    <td><strong>${escapeHtml(player.name)}</strong></td>
    <td>${player.level || '—'}</td>
    <td>${player.vocation ? badge(player.vocation) : '<span class="muted">—</span>'}</td>
    <td><a class="mini-button" href="./character.html?name=${encodeURIComponent(player.name)}">Visualizar</a></td>
  </tr>`).join('') || '<tr><td colspan="4" class="muted">Nenhum player encontrado para os filtros atuais.</td></tr>';
}

async function logout() {
  await supabase.auth.signOut();
  window.location.href = './login.html';
}

init();
