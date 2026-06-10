# Neutrinhos Carinhosos Guild Ops

MVP privado para gestão da guild **Neutrinhos Carinhosos** do Tibia. O projeto segue uma arquitetura simples e modular em HTML, CSS e JavaScript puro, com Supabase para autenticação, banco de dados, Row Level Security e roles.

## Objetivo

Criar um painel administrativo exclusivo para a guild, com cadastro e monitoramento de personagens, tags internas e histórico de mortes. A base nasce single-guild, mas está comentada e organizada para evoluir futuramente para um SaaS multi-guild.

## Stack

- HTML, CSS e JavaScript puro com ES Modules.
- Supabase Auth para login.
- Supabase Database/Postgres para dados.
- Row Level Security com roles `admin`, `leader` e `member`.
- Camada `tibiaApi.js` preparada para integração futura com TibiaData API.

## Estrutura

```text
/public
  index.html
  login.html
  dashboard.html
/src
  /css
    global.css
    dashboard.css
  /js
    supabaseClient.js
    auth.js
    dashboard.js
    characters.js
    deaths.js
    tibiaApi.js
    utils.js
  /sql
    schema.sql
```

## Funcionalidades do MVP

- Login via Supabase Auth.
- Controle de acesso por roles:
  - `admin`: gerencia personagens, tags e mortes.
  - `leader`: gerencia personagens, tags e mortes.
  - `member`: visualiza o painel.
- Dashboard com totais, personagens por vocação/status, últimos adicionados e últimas mortes.
- CRUD de personagens com filtros por nome, vocação e status.
- Tags internas: `main`, `maker`, `bomb`, `trusted`, `enemy`, `hunted`, `blacklist`, `war_target`.
- Inserção manual de mortes.
- Layout dark theme inspirado em Tibia, com sidebar fixa, cards, tabela, modal e responsividade.

## Setup do Supabase

1. Crie um projeto no Supabase.
2. Abra o SQL Editor e execute o arquivo `src/sql/schema.sql`.
3. Em Authentication, crie os usuários autorizados.
4. Insira ou atualize os perfis desses usuários na tabela `profiles`:

```sql
insert into public.profiles (id, email, role, display_name)
values ('USER_UUID_DO_AUTH', 'lider@example.com', 'admin', 'Líder NC')
on conflict (id) do update
set role = excluded.role,
    display_name = excluded.display_name;
```

5. Edite `src/js/supabaseClient.js` e substitua:
   - `https://YOUR_PROJECT_ID.supabase.co`
   - `YOUR_SUPABASE_ANON_KEY`

## Executando localmente

Como o app usa ES Modules, rode com um servidor estático em vez de abrir os arquivos diretamente:

```bash
python3 -m http.server 4173
```

Depois acesse:

```text
http://localhost:4173/public/login.html
```

## Segurança

O arquivo `schema.sql` ativa RLS em todas as tabelas principais. Usuários autenticados podem ler dados, enquanto apenas perfis com role `admin` ou `leader` podem criar, editar e excluir personagens, tags e mortes. A role é resolvida por funções SQL `current_user_role()` e `can_manage_guild()`.

## Integração futura com Tibia

A camada `src/js/tibiaApi.js` já expõe as funções:

- `getCharacter(characterName)`
- `getGuild(guildName)`
- `getWorldOnline(worldName)`
- `syncCharacterDeaths(characterName)`

No MVP, a UI ainda prioriza cadastro manual. A sincronização automática pode ser adicionada depois sem acoplar o dashboard diretamente ao provedor externo.

## Evolução para SaaS multi-guild

Quando o produto deixar de ser exclusivo da Neutrinhos Carinhosos, recomenda-se:

1. Criar tabela `guilds`.
2. Adicionar `guild_id` em `profiles`, `characters`, `deaths` e `activity_logs`.
3. Ajustar RLS para filtrar registros por guild.
4. Criar roles por guild em vez de role global por usuário.
5. Parametrizar o nome da guild hoje fixado como `Neutrinhos Carinhosos`.
