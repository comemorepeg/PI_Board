# Tutorial — PI Board no Netlify (Firebase + Azure via Netlify Functions)

Mantém o board no **Netlify** e o **Firebase** como está hoje, e adiciona a busca **direto do
Azure DevOps** via PAT — com o PAT protegido numa **Netlify Function** (não fica no navegador).

## Estrutura do pacote

```
(raiz do site no Netlify)
├── index.html                    # o board (já com Azure+Epic+PIs+concorrência+Firebase)
├── netlify.toml                  # publica a raiz + redireciona /api/* para a function
├── .env.example                  # modelo das variáveis
└── netlify/functions/
    └── azure.js                  # a function que guarda o PAT e fala com o Azure
```

Como funciona: o board chama `/api/...` (mesmo domínio, **sem CORS**). O `netlify.toml`
redireciona `/api/*` para a function `azure`, que usa o PAT (variável de ambiente) para falar
com o Azure. O Firebase continua guardando velocity, ordem e as PIs, como antes.

---

## PARTE 1 — Gerar o PAT no Azure

1. `dev.azure.com/ituran-bra` → **Personal access tokens** → **New Token**.
2. Scope: **Work Items → Read & write**. Copie o token.
3. (Ideal: usar uma conta de serviço `svc-piboard`.)

---

## PARTE 2 — Publicar no Netlify

### Se o seu site do Netlify está ligado a um repositório Git
1. Coloque na **raiz** do repositório: `index.html`, `netlify.toml` e a pasta `netlify/`.
2. Commit + push. O Netlify faz o deploy e detecta a function automaticamente.

### Se você publica por arrastar a pasta (Netlify Drop / deploy manual)
1. Arraste a pasta inteira do pacote (com `index.html`, `netlify.toml` e `netlify/`) para o
   deploy do seu site no Netlify.
2. O Netlify lê o `netlify.toml` e cria a function.

> Importante: a pasta `netlify/functions/` e o `netlify.toml` precisam ir junto no deploy —
> é isso que cria o backend. Só o `index.html` não basta.

---

## PARTE 3 — Configurar as variáveis de ambiente no Netlify

Netlify → seu site → **Site configuration** → **Environment variables** → **Add**:

| Key | Value |
|-----|-------|
| `AZDO_PAT` | *(o PAT da Parte 1)* |
| `BOARD_SHARED_KEY` | *(um segredo forte, ex. `pi-board-9f3k2x7q`)* |

As demais já têm default no código. Depois de adicionar, **faça um novo deploy** (Deploys →
Trigger deploy → Deploy site) para as variáveis entrarem em vigor.

---

## PARTE 4 — Ligar o board à sua chave

No `index.html`, perto do topo do `<script>`:

```js
const USE_AZURE = true;              // já vem assim
const AZURE_API = {
  base: '',                          // vazio = mesmo domínio (não mexer)
  key:  'MESMO-BOARD_SHARED_KEY',    // ← troque pelo MESMO valor de BOARD_SHARED_KEY
};
```

Troque o `key` pelo mesmo segredo que você pôs em `BOARD_SHARED_KEY`. Salve e refaça o deploy.

---

## PARTE 5 — Firebase (continua igual)

Nada muda no Firebase; ele já está configurado no board. Só confirme que as regras liberam os
caminhos usados (velocity/ordem por squad + as PIs):

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

1. `https://SEU-SITE.netlify.app/api/health` → deve responder `{"ok":true,...}`.
   - Se você definiu `BOARD_SHARED_KEY`, o teste direto no navegador dá 401 (esperado — o board
     manda o header; o navegador puro não). Teste então pelo próprio board.
2. Abra o board, login como **admin**, **Nova PI**, informe nome + período, **Buscar sprints**,
   **Criar PI**. O board carrega Iniciativa→Epic→Feature→Story do Azure com story points.

---

## Solução de problemas

- **`/api/health` dá 404** → o `netlify.toml` ou a pasta `netlify/functions/` não subiram na raiz.
- **500 dizendo AZDO_PAT** → faltou a variável no Netlify ou o redeploy após adicioná-la.
- **Board não carrega do Azure / 401 nas chamadas** → o `key` no `index.html` não bate com
  `BOARD_SHARED_KEY`.
- **"Item alterado por outra pessoa"** → proteção de concorrência funcionando; o board recarrega.
- **Sprints de outros times** → ajuste `SPRINT_PATH`/`SPRINT_FROM`/`SPRINT_TO` no Netlify.

---

## Segurança
- O PAT fica **só** na variável do Netlify (servidor). Nunca no `index.html`.
- `BOARD_SHARED_KEY` é uma trava leve entre board e function.
- Se algum PAT já foi exposto (ex.: commitado antes), **regenere no Azure** e use o novo só nas
  variáveis do Netlify.
