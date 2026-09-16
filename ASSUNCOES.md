# Estrutura do Azure DevOps — CONFIRMADA ao vivo (ituran-bra/TI)

> Inspecionado em 14/09/2026 via navegador autenticado (Chrome), consultando a API REST do Azure
> DevOps com a sessão logada. Abaixo, o que era "assunção" virou **fato confirmado**. Os defaults do
> backend e do board já refletem estes valores.

## ✅ 1. "Iniciativa" existe como tipo de work item
O projeto TI usa um processo **customizado** que inclui o tipo **`Iniciativa`** (além de Epic, Feature,
User Story, Bug, etc.). A hierarquia de 4 níveis do prompt é real.

Cadeia real confirmada (projeto Pix Automático do Finance):
```
Iniciativa 41556  "Pix Automático"
  └─ Epic 41557    "Ativação Pix Recorrente"
      └─ Feature 41564   "Job Scheduler"
          └─ User Story 41719  "Envio de Notificação de Recusa (Mensageria)"  → 8 story points
```
→ `WIT_INITIATIVE=Iniciativa` (backend já configurado assim).

## ✅ 2. Campo de Story Points
`Microsoft.VSTS.Scheduling.StoryPoints` — confirmado com valores reais (US 41719 = 8, 41720 = 5).
Há **485 User Stories só no Finance** com story points > 0.
→ `FIELD_STORYPOINTS=Microsoft.VSTS.Scheduling.StoryPoints`.

## ✅ 3. Campo de Prioridade / ordem
Ambos existem e vêm preenchidos:
- `Microsoft.VSTS.Common.StackRank` — ordem fina (ex.: 99758828). **Usado como default** para ordenação.
- `Microsoft.VSTS.Common.Priority` — 1..4 (ex.: 2).
→ `FIELD_PRIORITY=Microsoft.VSTS.Common.StackRank`. (Decisão em aberto: gravar ordem no Azure OU só
no Firebase. Ver abaixo.)

## ✅ 4. Area Paths das squads
Confirmados — batem exatamente com os defaults:
```
TI\SISCORP\Finance
TI\SISCORP\Field Service
TI\SISCORP\Sales
TI\SISCORP\Customer   (tem sub-área "Squad Digital")
```
Observação: existem outras áreas no projeto (B2B/Squad Intl, Localization/Squad Mexico, QA, 4Code,
BI, INFRA, ARQUITETURA/Novo CRM, etc.). O filtro `UNDER` já pega as sub-áreas de cada squad.

## ✅ 5. Iterations (sprints) e a regra Q3/Q4
As sprints ficam em `TI\Desenvolvimento\Releases\Sprint NN`, com datas de início/fim preenchidas.
A regra "inicia em outubro → Q4" foi **validada com dados reais**:

| Sprint | Início | Quarter |
|--------|-----------|---------|
| Sprint 63 | 31/08/2026 | Q3 |
| Sprint 64 | 14/09/2026 | Q3 |
| Sprint 65 | 28/09/2026 | Q3 |
| **Sprint 66** | **12/10/2026** | **Q4** |
| Sprint 67+ | out/2026+ | Q4 |

⚠️ Atenção: há **sprints de outros times** com numeração própria (Sprint 26–35 — provavelmente
Squad Intl/México) e buckets de quarter ("2026-Q3"). O endpoint filtra por nome `Sprint NN` e pela
data. Se quiser restringir só às sprints do PI Brasil, dá para filtrar por faixa de datas.

## ✅ 6. Parent/child — como ler a hierarquia
O campo `System.Parent` **só vem confiável no batch com `$expand=Relations`**. O backend agora deriva
o parent da relation `System.LinkTypes.Hierarchy-Reverse` (método validado), com fallback para o campo.

## ✅ 7. Volume (dimensionamento)
Só o **Finance** tem **1128 work items** (Iniciativa+Epic+Feature+Story). Por isso o backend **pagina**
o batch de detalhes em blocos de 200 (limite da API). As 4 squads juntas exigem paginação — já tratada.

---

## Decisões que ainda dependem de você (não são mais "descobertas", são escolhas)

1. **Ordem no Azure x só no Firebase.** A reordenação do board pode gravar `StackRank` no Azure
   (reflete no backlog de todos) ou ficar só no Firebase (não interfere em quem usa o Azure Boards).
   Default atual: **só Firebase** (mais seguro). O endpoint de prioridade existe caso queira ligar.

2. **Formato dos comentários de risco.** Mantido `[RISCO sev=.. roam=.. owner=..]`, `[BLOQUEIO ..]`,
   `[OBS ..]`. Se preferir tags/campo custom em vez de comentário, dá para trocar.

3. **Usuário do PAT.** Recomendado gerar o PAT com uma conta de serviço (ex.: `svc-piboard`) para
   autoria coerente das escritas feitas pelo board.

4. **Sprints de outros times.** Confirmar se o board deve mostrar só `Sprint 59..67` (PI Brasil) ou
   todas as iterations com data. Fácil de ajustar por faixa de datas no endpoint `/api/sprints`.
