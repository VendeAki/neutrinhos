const SUPABASE_URL = 'https://YOUR_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

export const GUILD_NAME = 'Neutrinhos Carinhosos';
export const DEFAULT_WORLD = 'Quelibra';
export const LOCAL_CREDENTIALS = {
  email: 'admin@neutrinhos.local',
  password: 'neutrinhos123',
};

const isPlaceholderConfig = SUPABASE_URL.includes('YOUR_PROJECT_ID') || SUPABASE_ANON_KEY.includes('YOUR_SUPABASE_ANON_KEY');
export const isLocalMode = isPlaceholderConfig;

const { createClient } = isLocalMode
  ? { createClient: createLocalClient }
  : await import('https://esm.sh/@supabase/supabase-js@2');

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export async function getCurrentProfile() {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return { user: null, profile: null, error: userError };

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  return { user, profile, error };
}

export function canManage(profile) {
  return ['admin', 'leader'].includes(profile?.role);
}

function createLocalClient() {
  const storageKey = 'neutrinhos_local_db_v1';
  const sessionKey = 'neutrinhos_local_session_v1';
  const localUser = {
    id: 'local-admin-user',
    email: LOCAL_CREDENTIALS.email,
  };
  const localProfile = {
    id: localUser.id,
    email: localUser.email,
    role: 'admin',
    display_name: 'Admin Local Neutrinhos',
    created_at: new Date().toISOString(),
  };

  function loadDb() {
    const persisted = window.localStorage.getItem(storageKey);
    if (persisted) return JSON.parse(persisted);

    const now = new Date();
    const characters = [
      characterSeed('local-char-1', 'Neutrino Fofo', 412, 'Elite Knight', 'Leader', 'leader', true, 'Nino', 'nino#0001', 'Tank principal da Neutrinhos Carinhosos.', 2),
      characterSeed('local-char-2', 'Carinho Arcano', 355, 'Master Sorcerer', 'Member', 'member', true, 'Lua', 'lua#0002', 'Dano mágico para hunts e war.', 24),
      characterSeed('local-char-3', 'Druidinho Paz', 298, 'Elder Druid', 'Vice Leader', 'vice_leader', true, 'Paz', 'paz#0003', 'Suporte e UH.', 5),
      characterSeed('local-char-4', 'Maker Neutro', 88, 'Paladin', 'Maker', 'neutral', false, 'Nino', null, 'Maker para runas.', 192),
      characterSeed('local-char-5', 'Enemy Sem Carinho', 501, 'Royal Paladin', null, 'enemy', false, null, null, 'Alvo monitorado.', 72),
    ];
    const db = {
      profiles: [localProfile],
      characters,
      character_tags: [
        tagSeed('local-char-1', 'main'),
        tagSeed('local-char-2', 'trusted'),
        tagSeed('local-char-4', 'maker'),
        tagSeed('local-char-5', 'enemy'),
        tagSeed('local-char-5', 'war_target'),
      ],
      deaths: [{
        id: 'local-death-1',
        character_id: 'local-char-2',
        character_name: 'Carinho Arcano',
        death_time: new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString(),
        level: 355,
        killed_by: 'a grim reaper',
        is_pvp: false,
        source: 'manual',
        created_at: new Date().toISOString(),
      }],
      activity_logs: [],
    };
    saveDb(db);
    return db;
  }

  function saveDb(db) {
    window.localStorage.setItem(storageKey, JSON.stringify(db));
  }

  function characterSeed(id, characterName, level, vocation, guildRank, status, mainCharacter, ownerName, discordName, notes, hoursAgo) {
    const date = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
    return {
      id,
      character_name: characterName,
      level,
      vocation,
      world: DEFAULT_WORLD,
      guild_rank: guildRank,
      status,
      main_character: mainCharacter,
      owner_name: ownerName,
      discord_name: discordName,
      notes,
      last_seen_online: date,
      created_at: date,
      updated_at: date,
    };
  }

  function tagSeed(characterId, tag) {
    return {
      id: crypto.randomUUID(),
      character_id: characterId,
      tag,
      created_at: new Date().toISOString(),
    };
  }

  return {
    auth: {
      async signInWithPassword({ email, password }) {
        if (email === LOCAL_CREDENTIALS.email && password === LOCAL_CREDENTIALS.password) {
          window.localStorage.setItem(sessionKey, JSON.stringify(localUser));
          return { data: { user: localUser }, error: null };
        }
        return { data: { user: null }, error: { message: 'Usuário ou senha local inválidos.' } };
      },
      async getUser() {
        const persisted = window.localStorage.getItem(sessionKey);
        return { data: { user: persisted ? JSON.parse(persisted) : null }, error: null };
      },
      async signOut() {
        window.localStorage.removeItem(sessionKey);
        return { error: null };
      },
    },
    from(tableName) {
      return new LocalQuery(tableName, loadDb, saveDb);
    },
  };
}

class LocalQuery {
  constructor(tableName, loadDb, saveDb) {
    this.tableName = tableName;
    this.loadDb = loadDb;
    this.saveDb = saveDb;
    this.operation = 'select';
    this.payload = null;
    this.filters = [];
    this.orderBy = null;
    this.limitCount = null;
    this.singleRow = false;
    this.selectColumns = '*';
  }

  select(columns = '*') {
    this.selectColumns = columns;
    return this;
  }

  insert(payload) {
    this.operation = 'insert';
    this.payload = payload;
    return this;
  }

  update(payload) {
    this.operation = 'update';
    this.payload = payload;
    return this;
  }

  delete() {
    this.operation = 'delete';
    return this;
  }

  eq(column, value) {
    this.filters.push({ column, value });
    return this;
  }

  order(column, options = {}) {
    this.orderBy = { column, ascending: options.ascending !== false };
    return this;
  }

  limit(count) {
    this.limitCount = count;
    return this;
  }

  single() {
    this.singleRow = true;
    return this;
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }

  async execute() {
    const db = this.loadDb();
    db[this.tableName] ||= [];

    if (this.operation === 'insert') return this.executeInsert(db);
    if (this.operation === 'update') return this.executeUpdate(db);
    if (this.operation === 'delete') return this.executeDelete(db);
    return this.executeSelect(db);
  }

  executeSelect(db) {
    let rows = this.applyFilters(db[this.tableName]);
    rows = this.applyOrder(rows);
    rows = this.applyLimit(rows);
    rows = this.expandRelations(rows, db);
    return this.result(rows);
  }

  executeInsert(db) {
    const items = Array.isArray(this.payload) ? this.payload : [this.payload];
    const inserted = items.map((item) => ({
      id: item.id || crypto.randomUUID(),
      ...item,
      created_at: item.created_at || new Date().toISOString(),
    }));
    db[this.tableName].push(...inserted);
    this.saveDb(db);
    return this.result(inserted);
  }

  executeUpdate(db) {
    const updated = [];
    db[this.tableName] = db[this.tableName].map((row) => {
      if (!this.matches(row)) return row;
      const next = { ...row, ...this.payload, updated_at: this.payload.updated_at || row.updated_at };
      updated.push(next);
      return next;
    });
    this.saveDb(db);
    return this.result(updated);
  }

  executeDelete(db) {
    const deleted = [];
    db[this.tableName] = db[this.tableName].filter((row) => {
      if (!this.matches(row)) return true;
      deleted.push(row);
      return false;
    });

    if (this.tableName === 'characters') {
      const deletedIds = new Set(deleted.map((row) => row.id));
      db.character_tags = db.character_tags.filter((tag) => !deletedIds.has(tag.character_id));
      db.deaths = db.deaths.map((death) => deletedIds.has(death.character_id) ? { ...death, character_id: null } : death);
    }

    this.saveDb(db);
    return { data: deleted, error: null };
  }

  applyFilters(rows) {
    return rows.filter((row) => this.matches(row));
  }

  matches(row) {
    return this.filters.every(({ column, value }) => row[column] === value);
  }

  applyOrder(rows) {
    if (!this.orderBy) return rows;
    const { column, ascending } = this.orderBy;
    return [...rows].sort((a, b) => {
      const left = a[column] || '';
      const right = b[column] || '';
      if (left === right) return 0;
      return (left > right ? 1 : -1) * (ascending ? 1 : -1);
    });
  }

  applyLimit(rows) {
    return this.limitCount ? rows.slice(0, this.limitCount) : rows;
  }

  expandRelations(rows, db) {
    if (this.tableName !== 'characters' || !this.selectColumns.includes('character_tags')) return rows;
    return rows.map((character) => ({
      ...character,
      character_tags: db.character_tags.filter((tag) => tag.character_id === character.id).map(({ tag }) => ({ tag })),
    }));
  }

  result(rows) {
    if (this.singleRow) {
      return { data: rows[0] || null, error: rows[0] ? null : { message: 'Registro não encontrado.' } };
    }
    return { data: rows, error: null };
  }
}
