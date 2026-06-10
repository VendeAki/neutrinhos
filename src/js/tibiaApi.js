const TIBIA_DATA_BASE_URL = 'https://api.tibiadata.com/v4';

async function request(path) {
  const response = await fetch(`${TIBIA_DATA_BASE_URL}${path}`);
  if (!response.ok) throw new Error(`Tibia API error: ${response.status}`);
  return response.json();
}

// Camada preparada para futura sincronização real. A UI usa estas funções para
// manter o acoplamento com a TibiaData API centralizado em um único módulo.
export async function getCharacter(characterName) {
  return request(`/character/${encodeURIComponent(characterName)}`);
}

export async function getGuild(guildName) {
  return request(`/guild/${encodeURIComponent(guildName)}`);
}

export async function getWorlds() {
  return request('/worlds');
}

export async function getWorldOnline(worldName) {
  return request(`/world/${encodeURIComponent(worldName)}`);
}

export function normalizeWorldResponse(payload) {
  const world = payload?.world || payload?.data?.world || payload?.worlds?.world || payload;
  const onlinePlayers = normalizeOnlinePlayers(world?.online_players || world?.players_online || world?.online || []);

  return {
    name: world?.name || world?.world || '—',
    status: world?.status || world?.online_status || '—',
    location: world?.location || '—',
    pvpType: world?.pvp_type || world?.worldtype || world?.pvp || '—',
    onlineCount: Number(world?.players_online_count || world?.online_count || world?.online || onlinePlayers.length || 0),
    onlinePlayers,
    raw: payload,
  };
}

export function normalizeOnlinePlayers(players) {
  if (!Array.isArray(players)) return [];

  return players.map((player) => {
    if (typeof player === 'string') {
      return { name: player, level: null, vocation: null, guild: null };
    }

    return {
      name: player.name || player.character_name || '—',
      level: player.level ?? null,
      vocation: player.vocation || null,
      guild: player.guild || player.guild_name || null,
    };
  });
}

export function normalizeCharacterResponse(payload) {
  const root = payload?.character || payload?.data?.character || payload || {};
  const info = root.character || root;
  const guild = normalizeGuild(info.guild || info.guild_membership || root.guild_membership);
  const house = normalizeHouse(firstItem(info.houses) || info.house || root.house);
  const deaths = normalizeDeaths(root.deaths || info.deaths || []);
  const frags = normalizeFrags(root.frags || root.kills || info.frags || info.kills || []);

  return {
    name: info.name || info.character_name || '—',
    title: info.title || info.unlocked_titles || 'None',
    sex: info.sex || '—',
    vocation: info.vocation || '—',
    level: info.level ?? '—',
    achievementPoints: info.achievement_points ?? info.achievementPoints ?? '—',
    world: info.world || '—',
    residence: info.residence || info.town || '—',
    house: house.label,
    guild: guild.label,
    guildName: guild.name,
    lastLogin: info.last_login || info.lastLogin || '—',
    accountStatus: info.account_status || info.accountStatus || '—',
    deaths,
    frags,
    achievements: root.achievements || info.achievements || [],
    raw: payload,
  };
}

function normalizeGuild(guild) {
  if (!guild) return { name: null, label: '—' };
  if (typeof guild === 'string') return { name: guild, label: guild };

  const name = guild.name || guild.guild_name || guild.guild;
  const rank = guild.rank || guild.guild_rank;
  const label = [rank, name].filter(Boolean).join(' of ') || '—';
  return { name, label };
}

function normalizeHouse(house) {
  if (!house) return { label: '—' };
  if (typeof house === 'string') return { label: house };

  const paidUntil = house.paid_until || house.paid || house.rent_paid_until;
  const town = house.town ? ` (${house.town})` : '';
  const paid = paidUntil ? ` is paid until ${paidUntil}` : '';
  return { label: `${house.name || '—'}${town}${paid}` };
}

function normalizeDeaths(deaths) {
  if (!Array.isArray(deaths)) return [];

  return deaths.map((death) => ({
    time: death.time || death.date || death.death_time || '—',
    level: death.level ?? '—',
    reason: death.reason || death.killed_by || death.description || buildKillerText(death),
    killers: normalizeParticipants(death.killers),
    assists: normalizeParticipants(death.assists || death.assisted_by),
  }));
}

function normalizeFrags(frags) {
  if (!Array.isArray(frags)) return [];

  return frags.map((frag) => ({
    time: frag.time || frag.date || '—',
    level: frag.level ?? '—',
    target: frag.target || frag.victim || frag.name || '—',
    reason: frag.reason || frag.description || '—',
  }));
}

function normalizeParticipants(participants) {
  if (!Array.isArray(participants)) return [];
  return participants.map((participant) => typeof participant === 'string' ? participant : participant.name || participant.player || '—');
}

function buildKillerText(death) {
  const killers = normalizeParticipants(death.killers);
  return killers.length ? `Killed by ${killers.join(', ')}` : '—';
}

function firstItem(value) {
  return Array.isArray(value) ? value[0] : value;
}

export async function syncCharacterDeaths(characterName) {
  const payload = await getCharacter(characterName);
  const character = normalizeCharacterResponse(payload);
  return character.deaths.map((death) => ({
    character_name: characterName,
    death_time: death.time,
    level: death.level,
    killed_by: death.reason,
    is_pvp: death.killers.some((killer) => !/^a |^an /i.test(killer)),
    source: 'tibiadata',
  }));
}
