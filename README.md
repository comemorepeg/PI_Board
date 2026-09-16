# PI Board × Azure DevOps — backend serverless (Vercel)

Board e backend no **mesmo projeto Vercel**. As funções em `api/` guardam o PAT do Azure e fazem
a ponte com o Azure DevOps; o board (`pi-board.html`) as consome por caminho relativo (sem CORS).

Para o passo a passo de deploy, veja **TUTORIAL-VERCEL.md**.

## Endpoints (cada arquivo em api/ vira um endpoint)

| Método | Rota | Arquivo | Uso |
|--------|------|---------|-----|
| GET | `/api/health` | `api/health.js` | sanity check |
| GET | `/api/sprints` | `api/sprints.js` | iterations do PI Brasil + Q3/Q4 |
| GET | `/api/squads/:squadId/workitems` | `api/squads/[squadId]/workitems.js` | árvore Iniciativa→Epic→Feature→Story |
| POST | `/api/workitems/story` | `api/workitems/story.js` | cria User Story + story points |
| PATCH | `/api/workitems/:id` | `api/workitems/[id]/index.js` | atualiza story points/título/descrição |
| PATCH | `/api/workitems/:id/priority` | `api/workitems/[id]/priority.js` | atualiza prioridade/ordem |
| GET/POST | `/api/workitems/:id/comment` | `api/workitems/[id]/comment.js` | lê/grava riscos como comentário |

Toda a lógica de Azure fica em `lib/azure.js` (chamadas REST, filtro de sprints, e o controle de
concorrência `patchWorkItemSafe`, que trata 412/409 relendo a revisão e retentando).

## Segurança
- **PAT** só no servidor (variável `AZDO_PAT` no Vercel). Nunca no navegador.
- **X-Board-Key**: trava leve entre board e funções (variável `BOARD_SHARED_KEY`).
- Sem CORS: board e `api/` no mesmo domínio.

## Configuração (variáveis de ambiente no Vercel)
Obrigatórias: `AZDO_PAT`, `BOARD_SHARED_KEY`.
Com default confirmado (mude só se preciso): `AZDO_ORG`, `AZDO_PROJECT`, `WIT_INITIATIVE`,
`FIELD_STORYPOINTS`, `FIELD_PRIORITY`, `AREA_*`, `SPRINT_PATH`, `SPRINT_FROM`, `SPRINT_TO`.
Modelo completo em `.env.example`.

## Validado ao vivo (ituran-bra/TI)
Leitura (1128 itens do Finance, hierarquia, story points, sprints Q3/Q4), escrita (criar
Iniciativa+User Story, atualizar pontos, comentário ROAM) e concorrência (Azure devolve 412,
tratado). Ver ASSUNCOES.md.
