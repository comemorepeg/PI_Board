# Modelo de dados — de/para Azure DevOps ↔ PI Board

## Hierarquia (4 níveis)

| Board            | Azure (Work Item Type)        | Liga ao pai via                          |
|------------------|-------------------------------|------------------------------------------|
| Iniciativa       | `WIT_INITIATIVE` (Iniciativa/Epic) | — (topo)                            |
| Epic             | `Epic`                        | `System.Parent` → Iniciativa             |
| Feature          | `Feature`                     | `System.Parent` → Epic                   |
| Story            | `User Story`                  | `System.Parent` → Feature                |

A árvore é montada no front a partir de `parent` (campo `System.Parent`) de cada item.

## Campos por item

| Campo no board     | Campo no Azure                                   | Direção            |
|--------------------|--------------------------------------------------|--------------------|
| id                 | `System.Id`                                      | leitura            |
| type               | `System.WorkItemType`                            | leitura            |
| title              | `System.Title`                                   | leitura + escrita  |
| desc               | `System.Description`                             | leitura + escrita  |
| state / status     | `System.State`                                   | leitura            |
| storyPoints (pts)  | `FIELD_STORYPOINTS` (StoryPoints/Effort)         | leitura + escrita  |
| priority / ordem   | `FIELD_PRIORITY` (StackRank/Priority)            | leitura + escrita* |
| sprint             | `System.IterationPath`                           | leitura (+escrita na criação) |
| squad              | `System.AreaPath` (UNDER área da squad)          | leitura + escrita (na criação) |

\* escrita de prioridade é opcional — ver ASSUNCOES.md item 3.

## Riscos / Bloqueios / Observações (via comentários)

| Board                 | Azure                                   | Formato do comentário                          |
|-----------------------|-----------------------------------------|------------------------------------------------|
| Risco + ROAM + owner  | comentário no work item                 | `[RISCO sev=<alto\|medio\|baixo> roam=<R\|O\|A\|M> owner=<nome>] <texto>` |
| Bloqueio              | comentário no work item                 | `[BLOQUEIO sev=<alto\|medio\|baixo>] <texto>`  |
| Observação            | comentário no work item                 | `[OBS] <texto>`                                |

Na releitura, o front faz parse do prefixo para reconstruir cada item com sua severidade/ROAM/owner.
Comentários sem prefixo conhecido são ignorados pelo board (são comentários "normais" do Azure).

## Sprints Q3 / Q4

- Fonte: `GET work/teamsettings/iterations`.
- `quarter = 'Q4'` se `startDate.getUTCMonth() >= 9` (outubro+), senão `'Q3'`.
- O board recebe a lista pronta e apenas exibe/filtra, marcando visualmente as de Q4.

## O que fica no Firebase (não vem do Azure)

- **Velocity** por squad (não é campo nativo de work item).
- **Ordem de exibição** do board, caso a decisão seja NÃO gravar prioridade no Azure.
- **Cache** dos riscos/ROAM parseados, para resposta rápida com múltiplos usuários (espelho dos comentários).
- Estado de expansão/UI e a arquitetura por-squad já existente (isolamento e proteção contra perda de dados).

## Fluxo de sincronização

1. **Load:** front → `GET /api/sprints` e, por squad, `GET /api/squads/:id/workitems` +
   `GET /api/workitems/:id/comments` (para riscos). Monta a árvore e o Firebase espelha o cache.
2. **Criar história:** front → `POST /api/workitems/story` → Azure cria User Story vinculada;
   o id retornado passa a ser a fonte da verdade daquela story.
3. **Editar pts / título:** front → `PATCH /api/workitems/:id`.
4. **Reordenar:** front → `PATCH /api/workitems/:id/priority` (se habilitado) e/ou Firebase.
5. **Risco/Bloqueio/Obs:** front → `POST /api/workitems/:id/comment` com o texto prefixado;
   e mantém cópia no Firebase para leitura rápida.

## Estados do Azure → status do board (mapState) — confirmado ao vivo

Estados reais por tipo (projeto TI):
- **Iniciativa:** New, Active, Closed
- **Epic / Feature:** New, Active, Resolved, Closed, Removed
- **User Story:** New, Refinement, Active, Resolved, Ready to Dev, Dev In Progress, Waiting for publishing, Ready to QA, QA In Progress, Closed, Removed

Mapeamento para os 4 status do board:

| Estado(s) do Azure | Status no board |
|--------------------|-----------------|
| New | Em Priorizacao |
| Refinement | Em Refinamento |
| Active, Resolved, Ready to Dev, Dev In Progress, Waiting for publishing, Ready to QA, QA In Progress, Closed | Priorizado |
| Removed | Despriorizado |
| (qualquer outro) | Em Priorizacao (fallback) |

O estado original do Azure é preservado em `initiative.azureState` para exibição de detalhe fino
(tooltip/relatório), sem perder o mapeamento para os 4 status do board.
