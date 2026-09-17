/**
 * Netlify Function — proxy do PI Board para o Azure DevOps.
 * Uma única função roteia todos os endpoints (/api/*), mantendo o PAT
 * seguro no servidor (variável de ambiente AZDO_PAT).
 *
 * Rotas (via redirect em netlify.toml: /api/* → /.netlify/functions/azure/:splat):
 *   GET   /api/health
 *   GET   /api/sprints
 *   GET   /api/squads/:squadId/workitems
 *   POST  /api/workitems/story
 *   PATCH /api/workitems/:id
 *   PATCH /api/workitems/:id/priority
 *   GET   /api/workitems/:id/comment
 *   POST  /api/workitems/:id/comment
 */

const ORG = process.env.AZDO_ORG || 'ituran-bra';
const PROJECT = process.env.AZDO_PROJECT || 'TI';
const PAT = process.env.AZDO_PAT;
const API = '7.1';

const WIT_INITIATIVE    = process.env.WIT_INITIATIVE    || 'Iniciativa';
const FIELD_STORYPOINTS = process.env.FIELD_STORYPOINTS || 'Microsoft.VSTS.Scheduling.StoryPoints';
const FIELD_PRIORITY    = process.env.FIELD_PRIORITY    || 'Microsoft.VSTS.Common.StackRank';

const SQUAD_AREA = {
  finance:      process.env.AREA_FINANCE      || 'TI\\SISCORP\\Finance',
  fieldservice: process.env.AREA_FIELDSERVICE || 'TI\\SISCORP\\Field Service',
  sales:        process.env.AREA_SALES        || 'TI\\SISCORP\\Sales',
  customer:     process.env.AREA_CUSTOMER     || 'TI\\SISCORP\\Customer',
};

const authHeader = 'Basic ' + Buffer.from(':' + (PAT || '')).toString('base64');

async function azdo(path, { method = 'GET', body, apiVersion = API, contentType } = {}) {
  if (!PAT) { const e = new Error('AZDO_PAT não configurado no ambiente'); e.status = 500; throw e; }
  const url = `https://dev.azure.com/${ORG}/${PROJECT}/_apis/${path}` +
    (path.includes('?') ? '&' : '?') + `api-version=${apiVersion}`;
  const res = await fetch(url, {
    method,
    headers: { 'Authorization': authHeader, 'Content-Type': contentType || 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`Azure ${res.status}: ${text.slice(0, 500)}`);
    err.status = res.status; err.body = text;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

// PATCH otimista com System.Rev (trata 412/409 relendo e retentando)
async function patchWorkItemSafe(id, buildOps, { retries = 3 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt < retries; attempt++) {
    const cur = await azdo(`wit/workitems/${id}`);
    const ops = [{ op: 'test', path: '/rev', value: cur.rev }, ...buildOps(cur)];
    try {
      return await azdo(`wit/workitems/${id}`, { method: 'PATCH', body: ops, contentType: 'application/json-patch+json' });
    } catch (e) {
      if (e.status === 412 || e.status === 409) { lastErr = e; continue; }
      throw e;
    }
  }
  const err = new Error('Conflito de concorrência não resolvido (outro usuário editou o mesmo item).');
  err.status = 409; err.cause = lastErr; throw err;
}

// ── helpers de resposta ──
const CORS = {
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,X-Board-Key',
  'Content-Type': 'application/json',
};
const ok  = (obj, status = 200) => ({ statusCode: status, headers: CORS, body: JSON.stringify(obj) });
const err = (e) => ({ statusCode: e.status || 500, headers: CORS, body: JSON.stringify({ error: e.message, conflict: e.status === 409 }) });

// ── lógica por endpoint ──
async function getSprints() {
  const data = await azdo('wit/classificationnodes/iterations?$depth=5', { apiVersion: API });
  const flat = [];
  (function walk(node) {
    const a = node.attributes || {};
    if (a.startDate && /sprint\s*\d+/i.test(node.name))
      flat.push({ name: node.name, path: node.path || node.name, start: a.startDate, finish: a.finishDate || null });
    (node.children || []).forEach(walk);
  })(data);
  const FROM = process.env.SPRINT_FROM || '2026-07-01';
  const TO   = process.env.SPRINT_TO   || '2027-02-01';
  const RELEASES = process.env.SPRINT_PATH || 'Releases';
  const sprints = flat
    .filter(it => (it.path || '').includes(RELEASES))
    .filter(it => it.start >= FROM && it.start < TO)
    .map(it => ({ id: it.name, name: it.name, path: it.path, start: it.start, finish: it.finish,
      quarter: new Date(it.start).getUTCMonth() >= 9 ? 'Q4' : 'Q3' }))
    .sort((a, b) => (a.start || '').localeCompare(b.start || ''));
  return { sprints };
}

async function getSquadWorkitems(squadId) {
  const area = SQUAD_AREA[squadId];
  if (!area) { const e = new Error('squad desconhecida'); e.status = 404; throw e; }
  // Campos de data customizados (Start/End). Nomes de referência configuráveis por env.
  const F_START = process.env.FIELD_START_DATE || 'Custom.StartDate';
  const F_END   = process.env.FIELD_END_DATE   || 'Custom.EndDate';
  const wiql = { query:
    `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${PROJECT}' ` +
    `AND [System.AreaPath] UNDER '${area.replace(/\\/g, '\\\\')}' ` +
    `AND [System.WorkItemType] IN ('${WIT_INITIATIVE}','Epic','Feature','User Story') ` +
    // só em aberto: exclui concluídas e removidas
    `AND [System.State] NOT IN ('Closed','Removed') ` +
    `ORDER BY [${FIELD_PRIORITY}] ASC` };
  const wiqlRes = await azdo('wit/wiql', { method: 'POST', body: wiql });
  const ids = (wiqlRes.workItems || []).map(w => w.id);
  if (!ids.length) return { squad: squadId, items: [] };
  const allValues = [];
  for (let i = 0; i < ids.length; i += 200) {
    const batch = await azdo('wit/workitemsbatch', { method: 'POST', body: { ids: ids.slice(i, i + 200), $expand: 'Relations' } });
    (batch.value || []).forEach(v => allValues.push(v));
  }
  const items = allValues.map(wi => {
    let parent = wi.fields['System.Parent'] || null;
    if (!parent && Array.isArray(wi.relations)) {
      const pr = wi.relations.find(r => r.rel === 'System.LinkTypes.Hierarchy-Reverse');
      if (pr) parent = parseInt(pr.url.split('/').pop());
    }
    // datas customizadas: tenta o nome configurado; senão procura campo cujo nome termine em start/enddate
    const f = wi.fields || {};
    const findBySuffix = (suf) => { const k = Object.keys(f).find(k => k.toLowerCase().endsWith(suf)); return k ? f[k] : null; };
    const startDate = f[F_START] ?? findBySuffix('startdate') ?? null;
    const endDate   = f[F_END]   ?? findBySuffix('enddate')   ?? null;
    return { id: wi.id, type: wi.fields['System.WorkItemType'], title: wi.fields['System.Title'],
      state: wi.fields['System.State'], desc: wi.fields['System.Description'] || '', parent,
      iteration: wi.fields['System.IterationPath'] || null, area: wi.fields['System.AreaPath'] || null,
      storyPoints: wi.fields[FIELD_STORYPOINTS] ?? null, priority: wi.fields[FIELD_PRIORITY] ?? null,
      startDate, endDate };
  });
  return { squad: squadId, items };
}

async function createStory(b) {
  const area = SQUAD_AREA[b.squadId];
  if (!area) { const e = new Error('squad inválida'); e.status = 400; throw e; }
  if (!b.title) { const e = new Error('title obrigatório'); e.status = 400; throw e; }
  const ops = [
    { op: 'add', path: '/fields/System.Title', value: b.title },
    { op: 'add', path: '/fields/System.AreaPath', value: area },
  ];
  if (b.description) ops.push({ op: 'add', path: '/fields/System.Description', value: b.description });
  if (b.storyPoints != null) ops.push({ op: 'add', path: `/fields/${FIELD_STORYPOINTS}`, value: b.storyPoints });
  if (b.iterationPath) ops.push({ op: 'add', path: '/fields/System.IterationPath', value: b.iterationPath });
  if (b.parentId) ops.push({ op: 'add', path: '/relations/-', value: {
    rel: 'System.LinkTypes.Hierarchy-Reverse', url: `https://dev.azure.com/${ORG}/_apis/wit/workItems/${b.parentId}` } });
  const created = await azdo(`wit/workitems/$User%20Story`, { method: 'POST', body: ops, contentType: 'application/json-patch+json' });
  return { id: created.id, title: created.fields['System.Title'], storyPoints: created.fields[FIELD_STORYPOINTS] ?? null, parent: b.parentId || null };
}

// ── handler ──
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };

  // auth leve
  const need = process.env.BOARD_SHARED_KEY;
  const got = event.headers['x-board-key'] || event.headers['X-Board-Key'];
  if (need && got !== need) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'unauthorized' }) };

  // path depois de /api/
  const path = (event.path || '').replace(/^\/(\.netlify\/functions\/azure|api)\/?/, '').replace(/\/$/, '');
  const parts = path.split('/').filter(Boolean);
  const method = event.httpMethod;
  let body = {};
  try { body = event.body ? JSON.parse(event.body) : {}; } catch (_) {}

  try {
    // GET /health
    if (parts[0] === 'health') return ok({ ok: true, org: ORG, project: PROJECT });

    // GET /sprints
    if (parts[0] === 'sprints' && method === 'GET') return ok(await getSprints());

    // GET /squads/:squadId/workitems
    if (parts[0] === 'squads' && parts[2] === 'workitems' && method === 'GET')
      return ok(await getSquadWorkitems(decodeURIComponent(parts[1])));

    // /workitems/...
    if (parts[0] === 'workitems') {
      // POST /workitems/story
      if (parts[1] === 'story' && method === 'POST') return ok(await createStory(body));

      const id = parts[1];
      // PATCH /workitems/:id/priority
      if (parts[2] === 'priority' && method === 'PATCH') {
        if (body.priority == null) return ok({ error: 'priority obrigatório' }, 400);
        const u = await patchWorkItemSafe(id, () => ([{ op: 'add', path: `/fields/${FIELD_PRIORITY}`, value: body.priority }]));
        return ok({ id: u.id, rev: u.rev, priority: u.fields[FIELD_PRIORITY] ?? null });
      }
      // GET/POST /workitems/:id/comment
      if (parts[2] === 'comment') {
        if (method === 'POST') {
          if (!body.text) return ok({ error: 'text obrigatório' }, 400);
          const c = await azdo(`wit/workItems/${id}/comments`, { method: 'POST', body: { text: body.text }, apiVersion: '7.1-preview.3' });
          return ok({ id: c.id, text: c.text });
        }
        if (method === 'GET') {
          const d = await azdo(`wit/workItems/${id}/comments`, { apiVersion: '7.1-preview.3' });
          return ok({ comments: (d.comments || []).map(c => ({ id: c.id, text: c.text, createdBy: c.createdBy?.displayName, createdDate: c.createdDate })) });
        }
      }
      // PATCH /workitems/:id
      if (!parts[2] && method === 'PATCH') {
        const { storyPoints, title, description } = body;
        if (storyPoints === undefined && title === undefined && description === undefined) return ok({ error: 'nada para atualizar' }, 400);
        const u = await patchWorkItemSafe(id, () => {
          const ops = [];
          if (storyPoints !== undefined) ops.push({ op: 'add', path: `/fields/${FIELD_STORYPOINTS}`, value: storyPoints });
          if (title !== undefined) ops.push({ op: 'add', path: '/fields/System.Title', value: title });
          if (description !== undefined) ops.push({ op: 'add', path: '/fields/System.Description', value: description });
          return ops;
        });
        return ok({ id: u.id, rev: u.rev, storyPoints: u.fields[FIELD_STORYPOINTS] ?? null });
      }
    }

    return ok({ error: 'rota não encontrada', path, parts }, 404);
  } catch (e) {
    console.error(e);
    return err(e);
  }
};
