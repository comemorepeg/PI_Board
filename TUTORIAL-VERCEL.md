# Tutorial de implementação — PI Board × Azure DevOps (Vercel)

Board e backend no **mesmo projeto Vercel** — sem CORS, um deploy só. Como você já tem o board
publicado no Vercel, aqui basta adicionar a pasta `api/` e as variáveis de ambiente.

Tudo abaixo foi validado ao vivo contra o Azure real (`ituran-bra/TI`).

---

## Estrutura do projeto (o que vai no Vercel)

```
(raiz do projeto Vercel)
├── pi-board.html              # o board (já publicado; substitua pela nova versão)
├── vercel.json                # config: rota "/" → pi-board.html + timeout das functions
├── package.json
├── api/                       # ← as funções serverless (o "backend")
│   ├── health.js              # GET  /api/health
│   ├── sprints.js             # GET  /api/sprints
│   ├── squads/[squadId]/workitems.js   # GET /api/squads/:squad/workitems
│   └── workitems/
│       ├── story.js           # POST  /api/workitems/story
│       └── [id]/
│           ├── index.js       # PATCH /api/workitems/:id
│           ├── priority.js    # PATCH /api/workitems/:id/priority
│           └── comment.js     # GET/POST /api/workitems/:id/comment
└── lib/
    └── azure.js               # lógica compartilhada (guarda o PAT, fala com o Azure)
```

No Vercel, **cada arquivo em `api/` vira um endpoint automaticamente**. Não há servidor para
manter ligado — as funções sobem sob demanda. Como board e `api/` estão no mesmo domínio, o board
chama `/api/...` (caminho relativo) e **não há CORS**.

---

## PARTE 1 — Gerar o PAT no Azure DevOps (você, uma vez)

1. `https://dev.azure.com/ituran-bra` → engrenagem/usuário → **Personal access tokens** → **New Token**.
2. **Name:** `pi-board` · **Organization:** `ituran-bra` · **Expiration:** ex. 1 ano.
3. **Scopes:** Custom defined → **Work Items → Read & write**.
4. **Create** e **copie o token** (só aparece uma vez).

> Ideal: gerar com uma conta de serviço (`svc-piboard`) para autoria coerente no Azure.
> É **um único PAT**, para todos os 6 usuários. Os POs não criam nem usam PAT.

---

## PARTE 2 — Adicionar os arquivos ao seu projeto Vercel

Você já tem o projeto do board no Vercel ligado a um repositório Git. Basta somar os novos arquivos.

1. No repositório do board, copie para a **raiz**:
   - a pasta `api/`
   - a pasta `lib/`
   - o `vercel.json`
   - o `package.json` (se você já tiver um, veja a nota abaixo)
2. Substitua o `pi-board.html` antigo pela **nova versão** (a deste pacote).
3. Commit + push. O Vercel faz o deploy automático.

> **Nota sobre package.json:** se o seu projeto já tem um, não sobrescreva — só garanta que o Node
> seja 18+. As funções não têm dependências externas (usam `fetch` nativo), então nada a instalar.

> **Nota sobre o `vercel.json`:** ele faz a rota `/` abrir o `pi-board.html` e define timeout de
> 15s para as funções. Se você já tem um `vercel.json`, mescle o conteúdo em vez de substituir.

---

## PARTE 3 — Configurar as variáveis de ambiente no Vercel

No painel do Vercel: seu projeto → **Settings** → **Environment Variables**. Adicione:

| Key | Value | Obrigatória? |
|-----|-------|--------------|
| `AZDO_PAT` | *(o PAT da Parte 1)* | **sim** |
| `BOARD_SHARED_KEY` | *(um segredo forte que você inventa, ex. `pi-board-9f3k2x7q`)* | **sim** |
| `AZDO_ORG` | `ituran-bra` | opcional (já é default) |
| `AZDO_PROJECT` | `TI` | opcional (já é default) |

As demais (WIT_INITIATIVE, FIELD_*, AREA_*, SPRINT_*) **já têm o valor confirmado no código** —
só configure se quiser mudar algo. **Não** precisa de `ALLOWED_ORIGIN` (mesmo domínio, sem CORS).

Marque as variáveis para os ambientes **Production** (e Preview, se usar). Depois de salvar,
**faça um redeploy** para elas entrarem em vigor (Deployments → ... → Redeploy).

---

## PARTE 4 — Ligar o board ao backend

Na nova versão do `pi-board.html`, perto do topo do `<script>`:

```js
const USE_AZURE = false;              // ← troque para true
const AZURE_API = {
  base: '',                           // vazio = mesmo domínio (não mexer)
  key:  'MESMO-BOARD_SHARED_KEY',     // ← ponha o MESMO valor de BOARD_SHARED_KEY do Vercel
};
```

Altere para:

```js
const USE_AZURE = true;
const AZURE_API = {
  base: '',
  key:  'pi-board-9f3k2x7q',          // igual ao BOARD_SHARED_KEY da Parte 3
};
```

Commit + push (ou o deploy que você já faz). Pronto.

---

## PARTE 5 — Regras do Firebase

O board guarda no Firebase o que não vem do Azure (velocity, ordem, e as PIs). No Firebase Console
→ Realtime Database → Regras, garanta:

```json
{
  "rules": {
    "pi_board_q3_2026": { "squads": { "$sqId": { ".read": true, ".write": true } } },
    "pi_board": { ".read": true, ".write": true }
  }
}
```

---

## PARTE 6 — Testar

1. Abra `https://SEU-PROJETO.vercel.app/api/health` → deve responder `{"ok":true,...}`.
   - Se pedir header e retornar 401, é porque você definiu `BOARD_SHARED_KEY` (esperado — o board
     manda o header; o teste manual no navegador não). Para testar no navegador, comente
     temporariamente a checagem OU teste pelo próprio board.
2. Abra o board, faça login como **admin**, clique **Nova PI**, informe nome + período,
   **Buscar sprints do período** e **Criar PI**.
3. O board carrega Iniciativa → Epic → Feature → Story de cada squad, com story points reais.

---

## Solução de problemas

**`/api/health` dá 500.** → Vercel → seu projeto → **Logs** (ou Functions). Erro comum:
`AZDO_PAT não configurado` (faltou a variável ou não fez redeploy após adicioná-la).

**O board não carrega do Azure.** → F12 → Console. Se as chamadas `/api/*` derem 401, o `key` do
board não bate com `BOARD_SHARED_KEY`. Se derem 404, confira que a pasta `api/` foi para a raiz do
projeto (e não dentro de uma subpasta).

**"Item alterado por outra pessoa" ao salvar.** → É a proteção de concorrência funcionando. O board
recarrega o valor mais novo; refaça sua edição.

**Sprints de outros times aparecem.** → Ajuste `SPRINT_PATH` / `SPRINT_FROM` / `SPRINT_TO` nas
variáveis do Vercel.

**Testar sem Azure.** → No board, `USE_AZURE = false`: roda com Firebase + catálogo local de
sprints (dá para validar layout, PIs e nível Epic).

---

## Onde cada segredo mora

| Segredo | Onde | Quem vê |
|---------|------|---------|
| PAT do Azure | variável `AZDO_PAT` no Vercel | ninguém (só as funções no servidor) |
| BOARD_SHARED_KEY | variável no Vercel **e** no `pi-board.html` | está no board (trava leve) |
| Login POs/Admin | dentro do `pi-board.html` | o board |

Detalhes de endpoints em `README.md`; de/para de campos e estados em `MAPEAMENTO.md`; o que foi
confirmado no Azure em `ASSUNCOES.md`.
