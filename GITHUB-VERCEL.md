# Subir ao GitHub e linkar ao Vercel

Baixe o `pi-vercel-pacote.zip` e extraia numa pasta. Depois escolha um caminho.

---

## Caminho A — Interface web do GitHub (sem terminal)

1. Extraia o zip no seu PC (vai virar a pasta `pi-vercel/`).
2. No GitHub: **New repository** → nome `pi-board` → **Create repository**.
3. Na página do repo vazio, clique em **uploading an existing file**.
4. Arraste **o conteúdo de dentro** da pasta `pi-vercel/` (não a pasta em si) — os arquivos
   e as pastas `api/`, `lib/`. A interface aceita arrastar pastas.
5. **Commit changes**.
6. Me diga o nome do repositório (ex.: `seu-usuario/pi-board`) que eu **linko ao Vercel**.

> Atenção: mantenha os nomes de pasta com colchetes exatamente como estão
> (`api/workitems/[id]/`, `api/squads/[squadId]/`) — são rotas dinâmicas do Vercel.

---

## Caminho B — Git no terminal (mais robusto)

Extraia o zip, abra o terminal na pasta `pi-vercel/` e rode:

```bash
git init
git add .
git commit -m "PI Board + backend Azure DevOps"
git branch -M main
# crie o repo vazio no GitHub antes (sem README) e copie a URL:
git remote add origin https://github.com/SEU-USUARIO/pi-board.git
git push -u origin main
```

Depois me diga `SEU-USUARIO/pi-board` que eu linko ao Vercel.

---

## Depois do push — eu faço (via ferramenta Vercel)

- Linko o repositório ao projeto `pi-board` que já existe no seu Vercel.
- A partir daí, **todo push vira deploy automático** (board + backend, íntegros).

## O que você ainda precisa fazer no painel do Vercel (uma vez)

1. **Environment Variables** → adicionar `AZDO_PAT` e `BOARD_SHARED_KEY` → **Redeploy**.
2. **Deployment Protection** → desligar **Vercel Authentication** (senão os POs não abrem).
3. No `pi-board.html`, confirmar `USE_AZURE = true` e `key` = mesmo `BOARD_SHARED_KEY`.
