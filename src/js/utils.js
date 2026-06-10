export const VOCATIONS = ['Knight', 'Elite Knight', 'Paladin', 'Royal Paladin', 'Sorcerer', 'Master Sorcerer', 'Druid', 'Elder Druid', 'Monk', 'None'];
export const STATUSES = ['member', 'leader', 'vice_leader', 'enemy', 'ally', 'neutral', 'blacklist'];
export const TAGS = ['main', 'maker', 'bomb', 'trusted', 'enemy', 'hunted', 'blacklist', 'war_target'];

export function statusBadgeClass(value = '') {
  if (['leader', 'vice_leader', 'member', 'ally', 'trusted', 'main'].includes(value)) return 'badge-green';
  if (['enemy', 'blacklist', 'hunted', 'war_target'].includes(value)) return 'badge-red';
  if (['Knight', 'Elite Knight', 'Paladin', 'Royal Paladin'].includes(value)) return 'badge-blue';
  if (['Sorcerer', 'Master Sorcerer', 'Druid', 'Elder Druid', 'Monk'].includes(value)) return 'badge-purple';
  return 'badge-neutral';
}

export function badge(value) {
  const safe = escapeHtml(value || '—');
  return `<span class="badge ${statusBadgeClass(value)}">${safe}</span>`;
}

export function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function formatDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

export function groupCount(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key] || 'não informado';
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

export function toIsoFromDateTimeLocal(value) {
  return value ? new Date(value).toISOString() : null;
}

export function toDateTimeLocal(value) {
  if (!value) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}
