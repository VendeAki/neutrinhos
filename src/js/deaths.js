import { supabase, canManage } from './supabaseClient.js';
import { escapeHtml, formatDate, toIsoFromDateTimeLocal } from './utils.js';

let deaths = [];
let characters = [];
let profile = null;
let onChangeCallback = () => {};

export function setupDeaths({ currentProfile, onChange }) {
  profile = currentProfile;
  onChangeCallback = onChange;
  document.querySelector('#death-form')?.addEventListener('submit', saveDeath);
  document.querySelector('#death-character-id')?.addEventListener('change', fillCharacterName);
}

export async function loadDeaths(characterCache = []) {
  characters = characterCache;
  hydrateCharacterSelect();

  const { data, error } = await supabase
    .from('deaths')
    .select('*')
    .order('death_time', { ascending: false })
    .limit(20);

  if (error) throw error;
  deaths = data || [];
  return deaths;
}

export function renderRecentDeaths() {
  const list = document.querySelector('#recent-deaths');
  list.innerHTML = deaths.slice(0, 5).map((death) => `<li><span>${escapeHtml(death.character_name)}</span><span class="muted">${formatDate(death.death_time)}</span></li>`).join('') || '<li class="muted">Nenhuma morte registrada.</li>';
  document.querySelector('#last-death').textContent = deaths[0] ? deaths[0].character_name : '—';
}

function hydrateCharacterSelect() {
  const select = document.querySelector('#death-character-id');
  select.innerHTML = '<option value="">Selecionar personagem</option>' + characters.map((character) => `<option value="${character.id}">${escapeHtml(character.character_name)}</option>`).join('');
}

function fillCharacterName(event) {
  const character = characters.find((item) => item.id === event.target.value);
  if (!character) return;
  document.querySelector('#death-character-name').value = character.character_name;
  document.querySelector('#death-level').value = character.level || '';
}

async function saveDeath(event) {
  event.preventDefault();
  if (!canManage(profile)) return;
  const formData = new FormData(event.currentTarget);
  const payload = {
    character_id: formData.get('character_id') || null,
    character_name: formData.get('character_name'),
    death_time: toIsoFromDateTimeLocal(formData.get('death_time')),
    level: Number(formData.get('level')) || null,
    killed_by: formData.get('killed_by'),
    is_pvp: formData.get('is_pvp') === 'on',
    source: formData.get('source') || 'manual',
  };

  const { data, error } = await supabase.from('deaths').insert(payload).select().single();
  if (error) throw error;
  await supabase.from('activity_logs').insert({ action: 'death.create', entity_type: 'deaths', entity_id: data.id, metadata: payload });
  event.currentTarget.reset();
  await onChangeCallback();
}
