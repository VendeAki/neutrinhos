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

export async function syncCharacterDeaths(characterName) {
  const payload = await getCharacter(characterName);
  const deaths = payload?.character?.deaths || [];
  return deaths.map((death) => ({
    character_name: characterName,
    death_time: death.time,
    level: death.level,
    killed_by: death.reason,
    is_pvp: /player|killed by/i.test(death.reason || ''),
    source: 'tibiadata',
  }));
}
