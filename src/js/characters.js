import { supabase, canManage } from './supabaseClient.js';
import { badge, escapeHtml, formatDate, STATUSES, TAGS, toDateTimeLocal, toIsoFromDateTimeLocal, VOCATIONS } from './utils.js';

let characters = [];
let profile = null;
let onChangeCallback = () => {};

const tableBody = document.querySelector('#characters-table');
const modal = document.querySelector('#character-modal');
const form = document.querySelector('#character-form');
const detailPanel = document.querySelector('#details');
const detailContent = document.querySelector('#character-details-content');

export function setupCharacters({ currentProfile, onChange }) {
  profile = currentProfile;
  onChangeCallback = onChange;
  hydrateSelects();
  bindEvents();
}

export async function loadCharacters() {
  const { data, error } = await supabase
    .from('characters')
    .select('*, character_tags(tag)')
    .order('created_at', { ascending: false });

  if (error) throw error;
  characters = data || [];
  renderCharacters();
  return characters;
}

export function getCharactersCache() {
  return characters;
}

function hydrateSelects() {
  fillSelect('#character-vocation', VOCATIONS);
  fillSelect('#character-status', STATUSES);
  fillSelect('#filter-vocation', VOCATIONS, true);
  fillSelect('#filter-status', STATUSES, true);

  const tagOptions = document.querySelector('#tag-options');
  tagOptions.innerHTML = TAGS.map((tag) => `<label class="checkbox"> <input type="checkbox" name="tags" value="${tag}" /> ${tag}</label>`).join('');
}

function fillSelect(selector, values, keepFirst = false) {
  const select = document.querySelector(selector);
  const first = keepFirst ? select.querySelector('option')?.outerHTML || '<option value=""></option>' : '';
  select.innerHTML = `${first}${values.map((value) => `<option value="${value}">${value}</option>`).join('')}`;
}

function bindEvents() {
  document.querySelector('#new-character-button')?.addEventListener('click', () => openForm());
  document.querySelectorAll('[data-close-modal]').forEach((button) => button.addEventListener('click', () => modal.close()));
  document.querySelector('#close-details')?.addEventListener('click', () => detailPanel.classList.add('hidden'));
  ['#filter-name', '#filter-vocation', '#filter-status'].forEach((selector) => document.querySelector(selector)?.addEventListener('input', renderCharacters));
  form?.addEventListener('submit', saveCharacter);
}

function filteredCharacters() {
  const name = document.querySelector('#filter-name').value.toLowerCase();
  const vocation = document.querySelector('#filter-vocation').value;
  const status = document.querySelector('#filter-status').value;
  return characters.filter((character) => {
    return (!name || character.character_name.toLowerCase().includes(name))
      && (!vocation || character.vocation === vocation)
      && (!status || character.status === status);
  });
}

function renderCharacters() {
  const rows = filteredCharacters().map((character) => {
    const tags = (character.character_tags || []).map(({ tag }) => badge(tag)).join(' ');
    const disabled = canManage(profile) ? '' : 'disabled title="Somente admin/leader"';
    return `<tr>
      <td><strong>${escapeHtml(character.character_name)}</strong><br><span class="muted small">${escapeHtml(character.owner_name || 'sem owner')}</span></td>
      <td>${character.level || '—'}</td>
      <td>${badge(character.vocation)}</td>
      <td>${escapeHtml(character.world || '—')}</td>
      <td>${badge(character.status)}</td>
      <td>${tags || '<span class="muted small">sem tags</span>'}</td>
      <td><div class="row-actions">
        <button class="mini-button" data-action="view" data-id="${character.id}">Ver</button>
        <button class="mini-button" data-action="edit" data-id="${character.id}" ${disabled}>Editar</button>
        <button class="mini-button" data-action="delete" data-id="${character.id}" ${disabled}>Excluir</button>
      </div></td>
    </tr>`;
  }).join('');

  tableBody.innerHTML = rows || '<tr><td colspan="7" class="muted">Nenhum personagem encontrado.</td></tr>';
  tableBody.querySelectorAll('button[data-action]').forEach((button) => button.addEventListener('click', handleRowAction));
}

function handleRowAction(event) {
  const id = event.currentTarget.dataset.id;
  const action = event.currentTarget.dataset.action;
  const character = characters.find((item) => item.id === id);
  if (!character) return;
  if (action === 'view') showDetails(character);
  if (action === 'edit') openForm(character);
  if (action === 'delete') deleteCharacter(character);
}

function openForm(character = null) {
  if (!canManage(profile)) return;
  form.reset();
  document.querySelector('#character-form-title').textContent = character ? 'Editar personagem' : 'Novo personagem';
  document.querySelector('#character-id').value = character?.id || '';
  document.querySelector('#character-name').value = character?.character_name || '';
  document.querySelector('#character-level').value = character?.level || '';
  document.querySelector('#character-vocation').value = character?.vocation || VOCATIONS[0];
  document.querySelector('#character-world').value = character?.world || 'Quelibra';
  document.querySelector('#character-guild-rank').value = character?.guild_rank || '';
  document.querySelector('#character-status').value = character?.status || 'member';
  document.querySelector('#character-owner').value = character?.owner_name || '';
  document.querySelector('#character-discord').value = character?.discord_name || '';
  document.querySelector('#character-last-seen').value = toDateTimeLocal(character?.last_seen_online);
  document.querySelector('#character-main').checked = Boolean(character?.main_character);
  document.querySelector('#character-notes').value = character?.notes || '';
  const activeTags = new Set((character?.character_tags || []).map(({ tag }) => tag));
  form.querySelectorAll('input[name="tags"]').forEach((input) => { input.checked = activeTags.has(input.value); });
  modal.showModal();
}

async function saveCharacter(event) {
  event.preventDefault();
  if (!canManage(profile)) return;
  const formData = new FormData(form);
  const id = formData.get('id');
  const characterPayload = {
    character_name: formData.get('character_name').trim(),
    level: Number(formData.get('level')) || null,
    vocation: formData.get('vocation'),
    world: formData.get('world') || 'Quelibra',
    guild_rank: formData.get('guild_rank'),
    status: formData.get('status'),
    main_character: formData.get('main_character') === 'on',
    owner_name: formData.get('owner_name'),
    discord_name: formData.get('discord_name'),
    notes: formData.get('notes'),
    last_seen_online: toIsoFromDateTimeLocal(formData.get('last_seen_online')),
    updated_at: new Date().toISOString(),
  };

  const query = id
    ? supabase.from('characters').update(characterPayload).eq('id', id).select().single()
    : supabase.from('characters').insert(characterPayload).select().single();
  const { data, error } = await query;
  if (error) throw error;

  await supabase.from('character_tags').delete().eq('character_id', data.id);
  const tags = formData.getAll('tags').map((tag) => ({ character_id: data.id, tag }));
  if (tags.length) {
    const { error: tagError } = await supabase.from('character_tags').insert(tags);
    if (tagError) throw tagError;
  }

  await logActivity(id ? 'character.update' : 'character.create', 'characters', data.id, characterPayload);
  modal.close();
  await onChangeCallback();
}

async function deleteCharacter(character) {
  if (!canManage(profile)) return;
  const confirmed = window.confirm(`Excluir ${character.character_name}?`);
  if (!confirmed) return;
  const { error } = await supabase.from('characters').delete().eq('id', character.id);
  if (error) throw error;
  await logActivity('character.delete', 'characters', character.id, { character_name: character.character_name });
  await onChangeCallback();
}

function showDetails(character) {
  const tags = (character.character_tags || []).map(({ tag }) => badge(tag)).join(' ');
  const fields = [
    ['Nome', character.character_name], ['Level', character.level], ['Vocação', character.vocation], ['Mundo', character.world],
    ['Rank', character.guild_rank], ['Status', character.status], ['Main', character.main_character ? 'Sim' : 'Não'],
    ['Owner', character.owner_name], ['Discord', character.discord_name], ['Último online', formatDate(character.last_seen_online)],
    ['Criado em', formatDate(character.created_at)], ['Atualizado em', formatDate(character.updated_at)], ['Tags', tags || '—'], ['Notas', character.notes || '—'],
  ];
  detailContent.innerHTML = fields.map(([label, value]) => `<article class="detail-card"><span>${label}</span><strong>${label === 'Tags' ? value : escapeHtml(value || '—')}</strong></article>`).join('');
  detailPanel.classList.remove('hidden');
  detailPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function logActivity(action, entityType, entityId, metadata) {
  await supabase.from('activity_logs').insert({ action, entity_type: entityType, entity_id: entityId, metadata });
}
