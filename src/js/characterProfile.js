import { getCurrentProfile, isLocalMode, supabase } from './supabaseClient.js';
import { getCharacter, normalizeCharacterResponse } from './tibiaApi.js';
import { badge, escapeHtml, formatDate } from './utils.js';

const elements = {
  form: document.querySelector('#character-lookup-form'),
  input: document.querySelector('#character-lookup-name'),
  status: document.querySelector('#character-source-status'),
  title: document.querySelector('#character-page-title'),
  info: document.querySelector('#character-info-table'),
  achievements: document.querySelector('#character-achievements'),
  deaths: document.querySelector('#character-deaths'),
  frags: document.querySelector('#character-frags'),
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

  const params = new URLSearchParams(window.location.search);
  const initialName = params.get('name') || '';
  elements.input.value = initialName;
  if (initialName) await fetchCharacter(initialName);
}

function bindEvents() {
  elements.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(elements.form);
    await fetchCharacter(formData.get('character_name'));
  });
  elements.logoutButton.addEventListener('click', logout);
}

async function fetchCharacter(characterName) {
  const name = String(characterName || '').trim();
  if (!name) return;

  elements.status.textContent = 'consultando TibiaData...';
  elements.status.className = 'badge badge-gold';
  setLoadingState();

  try {
    const payload = await getCharacter(name);
    const character = normalizeCharacterResponse(payload);
    renderCharacter(character);
    elements.status.textContent = isLocalMode ? 'localhost + TibiaData' : 'Supabase + TibiaData';
    window.history.replaceState({}, '', `./character.html?name=${encodeURIComponent(name)}`);
  } catch (error) {
    console.error(error);
    elements.status.textContent = 'erro na consulta';
    elements.status.className = 'badge badge-red';
    elements.info.innerHTML = `<p class="muted">Não foi possível consultar ${escapeHtml(name)}. ${escapeHtml(error.message)}</p>`;
    elements.achievements.innerHTML = '<p class="muted">—</p>';
    elements.deaths.innerHTML = '<p class="muted">—</p>';
    elements.frags.innerHTML = '<p class="muted">—</p>';
  }
}

function setLoadingState() {
  elements.info.innerHTML = '<p class="muted">Carregando informações...</p>';
  elements.achievements.innerHTML = '<p class="muted">Carregando conquistas...</p>';
  elements.deaths.innerHTML = '<p class="muted">Carregando mortes...</p>';
  elements.frags.innerHTML = '<p class="muted">Carregando frags...</p>';
}

function renderCharacter(character) {
  elements.title.textContent = character.name;
  elements.info.innerHTML = renderInfoTable([
    ['Name', character.name],
    ['Title', character.title],
    ['Sex', character.sex],
    ['Vocation', badge(character.vocation)],
    ['Level', character.level],
    ['Achievement Points', character.achievementPoints],
    ['World', character.world],
    ['Residence', character.residence],
    ['House', character.house],
    ['Guild Membership', character.guildName ? `<strong class="link-like">${escapeHtml(character.guild)}</strong>` : character.guild],
    ['Last Login', safeDate(character.lastLogin)],
    ['Account Status', character.accountStatus],
  ]);
  renderAchievements(character);
  renderDeaths(character.deaths);
  renderFrags(character.frags);
}

function renderInfoTable(rows) {
  return `<table class="community-info-table"><tbody>${rows.map(([label, value]) => `<tr><th>${escapeHtml(label)}:</th><td>${isHtml(value) ? value : escapeHtml(value || '—')}</td></tr>`).join('')}</tbody></table>`;
}

function renderAchievements(character) {
  if (!character.achievements.length) {
    elements.achievements.innerHTML = '<p>There are no achievements set to be displayed for this character.</p>';
    return;
  }

  elements.achievements.innerHTML = `<ul class="community-list">${character.achievements.map((achievement) => `<li>${escapeHtml(achievement.name || achievement)}</li>`).join('')}</ul>`;
}

function renderDeaths(deaths) {
  if (!deaths.length) {
    elements.deaths.innerHTML = '<p>There are no deaths to be displayed for this character.</p>';
    return;
  }

  elements.deaths.innerHTML = `<table class="community-info-table"><tbody>${deaths.map((death) => `<tr>
    <th>${escapeHtml(safeDate(death.time))}</th>
    <td>Died at Level ${escapeHtml(death.level)} by ${escapeHtml(death.reason)}.${renderAssists(death.assists)}</td>
  </tr>`).join('')}</tbody></table>`;
}

function renderFrags(frags) {
  if (!frags.length) {
    elements.frags.innerHTML = '<p>A TibiaData não retornou frags recentes para este personagem.</p>';
    return;
  }

  elements.frags.innerHTML = `<table class="community-info-table"><tbody>${frags.map((frag) => `<tr>
    <th>${escapeHtml(safeDate(frag.time))}</th>
    <td>Frag em ${escapeHtml(frag.target)} no level ${escapeHtml(frag.level)}. ${escapeHtml(frag.reason)}</td>
  </tr>`).join('')}</tbody></table>`;
}

function renderAssists(assists = []) {
  return assists.length ? `<br><span class="community-assist">Assisted by ${escapeHtml(assists.join(', '))}.</span>` : '';
}

function isHtml(value) {
  return typeof value === 'string' && /<[^>]+>/.test(value);
}

function safeDate(value) {
  if (!value || value === '—') return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : formatDate(value);
}

async function logout() {
  await supabase.auth.signOut();
  window.location.href = './login.html';
}

init();
