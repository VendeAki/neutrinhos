import { getCurrentProfile, isLocalMode, supabase } from './supabaseClient.js';
import { getCharacter, getWorldOnline, normalizeCharacterResponse, normalizeWorldResponse } from './tibiaApi.js';
import { badge, escapeHtml, formatDate } from './utils.js';

const DEATHLIST_LOOKBACK_DAYS = 30;
const DEATHLIST_SCAN_LIMIT = 120;
const DEATHLIST_BATCH_SIZE = 6;

const elements = {
  form: document.querySelector('#character-lookup-form'),
  input: document.querySelector('#character-lookup-name'),
  status: document.querySelector('#character-source-status'),
  title: document.querySelector('#character-page-title'),
  info: document.querySelector('#character-info-table'),
  achievements: document.querySelector('#character-achievements'),
  deaths: document.querySelector('#character-deaths'),
  fragScan: document.querySelector('#character-frag-scan'),
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
    await scanWorldDeathlists(character);
  } catch (error) {
    console.error(error);
    elements.status.textContent = 'erro na consulta';
    elements.status.className = 'badge badge-red';
    elements.info.innerHTML = `<p class="muted">Não foi possível consultar ${escapeHtml(name)}. ${escapeHtml(error.message)}</p>`;
    elements.achievements.innerHTML = '<p class="muted">—</p>';
    elements.deaths.innerHTML = '<p class="muted">—</p>';
    elements.fragScan.innerHTML = '<p class="muted">—</p>';
  }
}

function setLoadingState() {
  elements.info.innerHTML = '<p class="muted">Carregando informações...</p>';
  elements.achievements.innerHTML = '<p class="muted">Carregando conquistas...</p>';
  elements.deaths.innerHTML = '<p class="muted">Carregando mortes...</p>';
  elements.fragScan.innerHTML = '<p class="muted">Aguardando dados do personagem para buscar frags nas deathlists...</p>';
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

async function scanWorldDeathlists(character) {
  if (!character.world || character.world === '—') {
    elements.fragScan.innerHTML = '<p class="muted">Não foi possível identificar o mundo do personagem para buscar deathlists.</p>';
    return;
  }

  elements.fragScan.innerHTML = `<p class="muted">Buscando ${escapeHtml(character.name)} nas deathlists dos players online em ${escapeHtml(character.world)}...</p>`;

  try {
    const world = normalizeWorldResponse(await getWorldOnline(character.world));
    const playersToScan = world.onlinePlayers
      .filter((player) => !sameName(player.name, character.name))
      .slice(0, DEATHLIST_SCAN_LIMIT);

    const findings = [];
    for (let index = 0; index < playersToScan.length; index += DEATHLIST_BATCH_SIZE) {
      const batch = playersToScan.slice(index, index + DEATHLIST_BATCH_SIZE);
      elements.fragScan.innerHTML = `<p class="muted">Escaneando deathlists ${Math.min(index + batch.length, playersToScan.length)}/${playersToScan.length} em ${escapeHtml(world.name)}...</p>`;
      const batchFindings = await Promise.all(batch.map((player) => scanPlayerDeathlist(player, character.name)));
      findings.push(...batchFindings.flat());
    }

    renderFragScan(character, world, findings, playersToScan.length);
  } catch (error) {
    console.error(error);
    elements.fragScan.innerHTML = `<p class="muted">Não foi possível buscar deathlists em ${escapeHtml(character.world)}. ${escapeHtml(error.message)}</p>`;
  }
}

async function scanPlayerDeathlist(player, characterName) {
  try {
    const payload = await getCharacter(player.name);
    const victim = normalizeCharacterResponse(payload);
    return victim.deaths
      .filter(isWithinLookback)
      .map((death) => ({ death, match: matchDeathParticipation(death, characterName), victim }))
      .filter(({ match }) => match.matched)
      .map(({ death, match, victim }) => ({
        victimName: victim.name,
        victimLevel: death.level,
        role: match.role,
        reason: death.reason,
        time: death.time,
        assists: death.assists,
      }));
  } catch (error) {
    return [];
  }
}

function renderFragScan(character, world, findings, scannedCount) {
  const sorted = findings.sort((a, b) => dateValue(b.time) - dateValue(a.time));
  const kills = sorted.filter((item) => item.role === 'autor').length;
  const assists = sorted.filter((item) => item.role === 'assistência').length;

  if (!sorted.length) {
    elements.fragScan.innerHTML = `<p>Nenhuma participação de ${escapeHtml(character.name)} foi encontrada nas deathlists dos ${scannedCount} players online escaneados em ${escapeHtml(world.name)} nos últimos ${DEATHLIST_LOOKBACK_DAYS} dias.</p>`;
    return;
  }

  elements.fragScan.innerHTML = `
    <div class="deathlist-scan-summary">
      <span>${escapeHtml(world.name)}</span>
      <span>${scannedCount} deathlists escaneadas</span>
      <span>${kills} como autor</span>
      <span>${assists} como assistência</span>
    </div>
    <table class="community-info-table"><tbody>${sorted.map((frag) => `<tr>
      <th>${escapeHtml(safeDate(frag.time))}</th>
      <td><strong>${escapeHtml(frag.role.toUpperCase())}</strong> na morte de <a class="link-like" href="./character.html?name=${encodeURIComponent(frag.victimName)}">${escapeHtml(frag.victimName)}</a> no level ${escapeHtml(frag.victimLevel)}.<br>${escapeHtml(frag.reason)}${renderAssists(frag.assists)}</td>
    </tr>`).join('')}</tbody></table>`;
}

function matchDeathParticipation(death, characterName) {
  const lowerName = normalizeName(characterName);
  const killers = death.killers.map(normalizeName);
  const assists = death.assists.map(normalizeName);
  const reason = normalizeName(death.reason);

  if (killers.some((killer) => killer === lowerName)) {
    return { matched: true, role: 'autor' };
  }

  if (assists.some((assist) => assist === lowerName) || reason.includes(`assisted by ${lowerName}`)) {
    return { matched: true, role: 'assistência' };
  }

  if (reason.includes(lowerName)) {
    return { matched: true, role: 'autor' };
  }

  return { matched: false, role: null };
}

function isWithinLookback(death) {
  const value = dateValue(death.time);
  if (!value) return true;
  return Date.now() - value <= DEATHLIST_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
}

function dateValue(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
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

function sameName(left, right) {
  return normalizeName(left) === normalizeName(right);
}

function normalizeName(value) {
  return String(value || '').trim().toLowerCase();
}

async function logout() {
  await supabase.auth.signOut();
  window.location.href = './login.html';
}

init();
