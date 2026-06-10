const TIBIA_DATA_BASE_URL = 'https://api.tibiadata.com/v4';

async function request(path) {
  const response = await fetch(`${TIBIA_DATA_BASE_URL}${path}`);
  if (!response.ok) throw new Error(`Tibia API error: ${response.status}`);
  return response.json();
}

// Camada preparada para futura sincronização real. No MVP, estas funções podem ser
// mockadas em testes ou chamadas manualmente sem acoplar a UI ao provedor externo.
export async function getCharacter(characterName) {
  return request(`/character/${encodeURIComponent(characterName)}`);
}

export async function getGuild(guildName) {
  return request(`/guild/${encodeURIComponent(guildName)}`);
}

export async function getWorldOnline(worldName) {
  return request(`/world/${encodeURIComponent(worldName)}`);
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
