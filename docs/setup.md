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
  worlds.html
  character.html
  notifications.html
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
    worlds.js
    characterProfile.js
    notifications.js
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
- Consulta de players online por mundo usando TibiaData API v4.
- Página de detalhes de personagem em estilo Community Tibia com informações, mortes e frags retornados pela API.
- Página de notificações para monitorar login/mortes de chars e estimar possíveis personagens da mesma conta por heurística de troca online/offline.
- CRUD de personagens com filtros por nome, vocação e status.
- Tags internas: `main`, `maker`, `bomb`, `trusted`, `enemy`, `hunted`, `blacklist`, `war_target`.
- Inserção manual de mortes.
- Layout dark theme inspirado em Tibia, com sidebar fixa, cards, tabela, modal e responsividade.

## Login local para testes

Enquanto o projeto estiver rodando em localhost sem Supabase configurado, o app ativa automaticamente um modo local com dados mockados no `localStorage`. Use as credenciais abaixo para entrar no dashboard:

```text
Usuário: admin@neutrinhos.local
Senha: neutrinhos123
```

Quando `src/js/supabaseClient.js` receber uma URL e uma anon key reais do Supabase, o modo local é desativado e o login passa a usar Supabase Auth.

## Consulta de players online por mundo

A página `public/worlds.html` consulta a TibiaData API v4 diretamente no navegador para listar players online por mundo. O fluxo funciona junto com o login local: entre com o usuário padrão, abra **Online por mundo** no menu lateral e pesquise mundos como `Quelibra`, `Belobra` ou `Antica`.

A integração fica centralizada em `src/js/tibiaApi.js`, que expõe `getWorldOnline(worldName)`, `getCharacter(characterName)` e normalizadores para manter a UI desacoplada do formato bruto da API. Na lista de online, o botão **Visualizar** abre `public/character.html` com o perfil do personagem.

## Notificações e radar de possíveis makers

A página `public/notifications.html` permite adicionar personagens monitorados por mundo. Enquanto a página estiver aberta, o app faz polling na TibiaData API para detectar login, mortes novas e exibir pop-ups no navegador quando a permissão for concedida.

O radar de possíveis chars da mesma conta usa uma heurística inspirada no TibiaSpy: quando um char monitorado sai e outro entra logo depois no mesmo mundo, o candidato recebe score. Isso é probabilístico e deve ser tratado como indício, não confirmação.

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
