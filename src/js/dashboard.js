import { supabase, getCurrentProfile, canManage } from './supabaseClient.js';
import { setupCharacters, loadCharacters, getCharactersCache } from './characters.js';
import { setupDeaths, loadDeaths, renderRecentDeaths } from './deaths.js';
import { badge, escapeHtml, groupCount, STATUSES, VOCATIONS } from './utils.js';

async function init() {
  const { user, profile, error } = await getCurrentProfile();
  if (error || !user) {
    window.location.href = './login.html';
    return;
  }

  document.querySelector('#user-role').textContent = profile?.role || 'member';
  if (!canManage(profile)) {
    document.querySelector('#new-character-button').disabled = true;
    document.querySelector('#new-character-button').title = 'Somente admin/leader';
  }

  setupCharacters({ currentProfile: profile, onChange: refreshAll });
  setupDeaths({ currentProfile: profile, onChange: refreshAll });
  document.querySelector('#logout-button').addEventListener('click', logout);
  await refreshAll();
}

async function refreshAll() {
  const syncStatus = document.querySelector('#sync-status');
  syncStatus.textContent = 'Atualizando dados...';
  const characters = await loadCharacters();
  await loadDeaths(characters);
  renderDashboard(characters);
  renderRecentDeaths();
  syncStatus.textContent = 'Dados carregados do Supabase';
}

function renderDashboard(characters) {
  document.querySelector('#total-characters').textContent = characters.length;
  document.querySelector('#active-characters').textContent = characters.filter((character) => ['member', 'leader', 'vice_leader'].includes(character.status)).length;
  document.querySelector('#enemy-characters').textContent = characters.filter((character) => ['enemy', 'blacklist'].includes(character.status) || (character.character_tags || []).some(({ tag }) => ['enemy', 'hunted', 'blacklist'].includes(tag))).length;

  renderGroup('#vocation-summary', groupCount(characters, 'vocation'), VOCATIONS);
  renderGroup('#status-summary', groupCount(characters, 'status'), STATUSES);
  renderRecentCharacters(characters);
}

function renderGroup(selector, counts, preferredOrder) {
  const container = document.querySelector(selector);
  const entries = Object.entries(counts).sort(([a], [b]) => preferredOrder.indexOf(a) - preferredOrder.indexOf(b));
  container.innerHTML = entries.map(([label, count]) => `${badge(label)} <span class="badge badge-gold">${count}</span>`).join('') || '<span class="muted small">Sem dados.</span>';
}

function renderRecentCharacters(characters) {
  const list = document.querySelector('#recent-characters');
  list.innerHTML = characters.slice(0, 5).map((character) => `<li><span>${escapeHtml(character.character_name)}</span><span class="muted">${character.level || '—'}</span></li>`).join('') || '<li class="muted">Nenhum personagem cadastrado.</li>';
}

async function logout() {
  await supabase.auth.signOut();
  window.location.href = './login.html';
}

window.addEventListener('unhandledrejection', (event) => {
  console.error(event.reason);
  document.querySelector('#sync-status').textContent = `Erro: ${event.reason?.message || 'falha inesperada'}`;
});

init();
