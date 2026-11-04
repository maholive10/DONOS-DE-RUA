// Regras de negócio do Check-list 5S – Donos de Rua
const crypto = require('crypto');
const db = require('./store');

const K = {
  config: 'ck5s:config', ruas: 'ck5s:ruas', colabs: 'ck5s:colabs', users: 'ck5s:users', subs: 'ck5s:subs',
  sess: (t) => 'ck5s:sess:' + t, dia: (d) => 'ck5s:dia:' + d,
};
const RETENCAO_SEG = 370 * 86400; // 12 meses (+ folga)
const SESSAO_SEG = 14 * 3600;
const TURNOS = ['T1', 'T2', 'T3'];
const OFFSET = '-03:00'; // America/Sao_Paulo (sem horário de verão)

const ITENS_PADRAO = [
  'Escadinha organizada', 'Embalagens retiradas', 'Ração no chão removida', 'Paletes vazios retirados',
  'Papéis retirados', 'Strech retirado', 'Bags recolhidos', 'Caçambas esvaziadas', 'Avarias recolhidas',
];

class ErroApp extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }
const falha = (m, s) => { throw new ErroApp(m, s); };
const id = () => crypto.randomBytes(6).toString('hex');
const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');

// ---------------- datas e turnos ----------------
const hojeLocal = (ms = Date.now()) => new Date(ms - 3 * 3600e3).toISOString().slice(0, 10);
const somaDias = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 86400e3).toISOString().slice(0, 10);
const diaSemana = (d) => new Date(d + 'T12:00:00Z').getUTCDay();

function janela(cfg, data, t) {
  const tc = cfg.turnos[t];
  const ini = Date.parse(`${data}T${tc.inicio}:00${OFFSET}`);
  let fim = Date.parse(`${data}T${tc.fim}:00${OFFSET}`);
  if (fim <= ini) fim += 86400e3;
  return { ini, fim };
}
function prazoValidacao(cfg, data, t) {
  const { fim } = janela(cfg, data, t);
  const prox = TURNOS[(TURNOS.indexOf(t) + 1) % 3];
  const j = janela(cfg, data, prox);
  return fim + (j.fim - j.ini); // fim do turno seguinte
}
function semOperacao(cfg, data, t) {
  return (cfg.semOperacao || []).find((s) => s.data === data && (!s.turnos?.length || s.turnos.includes(t)));
}
function opera(cfg, data, t) {
  return cfg.turnos[t].dias.includes(diaSemana(data)) && !semOperacao(cfg, data, t);
}
function turnosEmAndamento(cfg, now = Date.now()) {
  const out = [];
  const hoje = hojeLocal(now);
  for (const t of TURNOS) for (const d of [hoje, somaDias(hoje, -1)]) {
    const j = janela(cfg, d, t);
    if (now >= j.ini && now < j.fim) out.push({ data: d, turno: t, ...j });
  }
  return out;
}

// situação de uma rua/turno/dia
function situacao(cfg, data, t, reg, now = Date.now()) {
  if (reg) {
    if (reg.status === 'validado') return 'validado';
    if (reg.status === 'reprovado') return 'reprovado';
    return now > reg.prazoValidacao ? 'sem_validacao' : 'aguardando';
  }
  if (!opera(cfg, data, t)) return 'sem_operacao';
  const j = janela(cfg, data, t);
  if (now < j.ini) return 'futuro';
  if (now < j.fim) return 'pendente';
  return 'nao_realizado';
}

// ---------------- carregar dados ----------------
async function config() {
  let c = await db.getJSON(K.config);
  if (!c) {
    c = {
      itens: ITENS_PADRAO.map((nome) => ({ id: id(), nome })),
      turnos: {
        T1: { inicio: '06:00', fim: '14:00', dias: [1, 2, 3, 4, 5, 6] },
        T2: { inicio: '14:00', fim: '22:00', dias: [1, 2, 3, 4, 5, 6] },
        T3: { inicio: '22:00', fim: '06:00', dias: [0, 1, 2, 3, 4, 5] },
      },
      semOperacao: [],
    };
    await db.setJSON(K.config, c);
  }
  return c;
}
// Dados iniciais do CD Barueri: carregados sozinhos no primeiro uso do banco.
// IDs fixos (derivados do nome) para que acessos simultâneos gerem o mesmo resultado.
const SEED = require('./dados-iniciais.json');
const idFixo = (txt) => crypto.createHash('sha1').update(norm(txt)).digest('hex').slice(0, 12);
async function ruas() {
  let r = await db.getJSON(K.ruas);
  if (!r) {
    r = SEED.ruas.map((nome) => ({ id: idFixo('rua:' + nome), nome }));
    await db.setJSON(K.ruas, r);
  }
  return r;
}
async function colabs() {
  let c = await db.getJSON(K.colabs);
  if (!c) {
    c = SEED.colaboradores.map((x) => ({ id: idFixo('colab:' + x.nome), nome: x.nome, turno: x.turno, ruas: [], ativo: true }));
    await db.setJSON(K.colabs, c);
  }
  return c;
}
async function users() {
  let u = await db.getJSON(K.users);
  if (!u) {
    u = SEED.usuarios.map((x) => ({ id: idFixo('user:' + x.usuario), ...x }));
    await db.setJSON(K.users, u);
  }
  return u;
}
async function status() {
  const [r, c, u] = await Promise.all([ruas(), colabs(), users()]);
  return { app: 'ok', banco: db.usaRedis ? 'Upstash conectado' : 'SEM BANCO (modo teste local)', ruas: r.length, colaboradores: c.length, acessos: u.length };
}
async function subs() {
  const s = await db.getJSON(K.subs, []);
  const lim = somaDias(hojeLocal(), -30);
  return s.filter((x) => x.data >= lim);
}

// ---------------- senhas e sessão ----------------
function hashSenha(senha, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(String(senha), salt, 32).toString('hex') };
}
function confere(senha, u) {
  const h = crypto.scryptSync(String(senha), u.salt, 32);
  return crypto.timingSafeEqual(h, Buffer.from(u.hash, 'hex'));
}
const publico = (u) => ({ id: u.id, nome: u.nome, usuario: u.usuario, perfil: u.perfil, turnos: u.turnos || [] });

async function sessao(token) {
  if (!token) falha('Sessão expirada. Entre novamente.', 401);
  const s = await db.getJSON(K.sess(token));
  if (!s) falha('Sessão expirada. Entre novamente.', 401);
  const u = (await users()).find((x) => x.id === s.uid);
  if (!u) falha('Usuário removido.', 401);
  return u;
}
const turnosDo = (u) => (u.perfil === 'coordenador' || !u.turnos?.length ? TURNOS : u.turnos);
const exigeCoord = (u) => { if (u.perfil !== 'coordenador') falha('Apenas o coordenador pode fazer isso.', 403); };

// ---------------- colaborador ----------------
function donosDe(cs, ruaId, t) {
  return cs.filter((c) => c.ativo !== false && c.turno === t && (c.ruas || []).includes(ruaId));
}

async function tarefasColab(colabId) {
  const [cfg, rs, cs, ss] = await Promise.all([config(), ruas(), colabs(), subs()]);
  const c = cs.find((x) => x.id === colabId && x.ativo !== false);
  if (!c) falha('Colaborador não encontrado. Procure seu líder.', 404);
  const nomeRua = (rid) => rs.find((r) => r.id === rid)?.nome || '(rua removida)';
  const now = Date.now();
  const andamento = turnosEmAndamento(cfg, now);

  const alvos = []; // {data, turno, ruaId, tipo, titular}
  for (const a of andamento) {
    if (c.turno === a.turno && opera(cfg, a.data, a.turno))
      for (const r of c.ruas || []) alvos.push({ data: a.data, turno: a.turno, ruaId: r, tipo: 'titular' });
    for (const s of ss.filter((s) => s.colabId === c.id && s.data === a.data && s.turno === a.turno))
      alvos.push({ data: a.data, turno: a.turno, ruaId: s.ruaId, tipo: 'substituto',
        titular: donosDe(cs, s.ruaId, s.turno).map((d) => d.nome).join(', ') });
  }
  // reprovados em aberto dos últimos 7 dias
  const dias = Array.from({ length: 8 }, (_, i) => somaDias(hojeLocal(now), -i));
  const hs = await db.hgetallMany(dias.map(K.dia));
  const regs = {};
  hs.forEach((h, i) => { for (const f in h) regs[dias[i] + '|' + f] = h[f]; });
  for (const key in regs) {
    const r = regs[key];
    if (r.status !== 'reprovado') continue;
    const meu = (r.turno === c.turno && (c.ruas || []).includes(r.ruaId)) || r.colab?.id === c.id;
    if (meu && !alvos.some((a) => a.data === r.data && a.turno === r.turno && a.ruaId === r.ruaId))
      alvos.push({ data: r.data, turno: r.turno, ruaId: r.ruaId, tipo: 'refazer' });
  }
  const tarefas = alvos.map((a) => {
    const reg = regs[`${a.data}|${a.turno}:${a.ruaId}`] || null;
    const st = situacao(cfg, a.data, a.turno, reg, now);
    return { ...a, ruaNome: nomeRua(a.ruaId), status: st, registro: reg,
      podePreencher: st === 'pendente' || st === 'reprovado', fim: janela(cfg, a.data, a.turno).fim };
  });

  let aviso = null;
  if (!tarefas.length) {
    const tc = cfg.turnos[c.turno];
    const hoje = hojeLocal(now);
    if (!(c.ruas || []).length) aviso = 'Você ainda não tem rua cadastrada. Procure seu líder.';
    else if (semOperacao(cfg, hoje, c.turno)) aviso = `Hoje não há operação no ${c.turno} (${semOperacao(cfg, hoje, c.turno).motivo || 'dia sem operação'}).`;
    else aviso = `Seu turno (${c.turno}, ${tc.inicio} às ${tc.fim}) não está em andamento agora. O check-list só pode ser preenchido durante o turno.`;
  }
  return {
    colab: { id: c.id, nome: c.nome, turno: c.turno, ruas: (c.ruas || []).map(nomeRua) },
    itens: cfg.itens, tarefas, aviso, turnoCfg: cfg.turnos[c.turno],
  };
}

async function enviarColab(p) {
  const { colabId, data, turno, ruaId, respostas, obs, dispositivo, declaracao } = p;
  if (!declaracao) falha('Confirme a declaração antes de assinar.');
  const info = await tarefasColab(colabId);
  const t = info.tarefas.find((x) => x.data === data && x.turno === turno && x.ruaId === ruaId);
  if (!t) falha('Este check-list não está liberado para você agora.');
  if (!t.podePreencher) falha(t.status === 'nao_realizado' ? 'O prazo do turno terminou.' : 'Este check-list já foi enviado.');
  const cfg = await config();
  const itens = (t.registro && t.status === 'reprovado' ? t.registro.itens.map(({ id, nome }) => ({ id, nome })) : cfg.itens)
    .map((it) => ({ id: it.id, nome: it.nome, valor: respostas?.[it.id] }));
  if (itens.some((i) => !['feito', 'nao_feito', 'na'].includes(i.valor))) falha('Marque todos os itens.');
  if (itens.some((i) => i.valor === 'nao_feito') && !String(obs || '').trim())
    falha('Explique na observação o motivo dos itens não feitos.');

  const now = Date.now();
  const assinatura = { colabId: info.colab.id, nome: info.colab.nome, em: now, dispositivo: String(dispositivo || '').slice(0, 200),
    substituto: t.tipo === 'substituto', titular: t.titular || null };
  const ant = t.registro;
  const reg = {
    data, turno, ruaId, ruaNome: t.ruaNome, itens, obs: String(obs || '').trim().slice(0, 1000),
    status: 'enviado', colab: { id: info.colab.id, nome: info.colab.nome, substituto: assinatura.substituto, titular: assinatura.titular },
    enviadoEm: now, assinaturaColab: assinatura, lider: null,
    // após refação, o líder ganha ao menos 8h para validar de novo
    prazoValidacao: ant ? Math.max(prazoValidacao(cfg, data, turno), now + 8 * 3600e3) : prazoValidacao(cfg, data, turno),
    historico: [...(ant?.historico || []), { tipo: ant ? 'reenvio' : 'envio', por: info.colab.nome, em: now,
      itens: itens.map((i) => i.valor), obs: String(obs || '').trim() }],
  };
  await db.hsetJSON(K.dia(data), `${turno}:${ruaId}`, reg, RETENCAO_SEG);
  return { ok: true, registro: reg };
}

// ---------------- gestão ----------------
async function lerDias(de, ate) {
  if (ate < de) falha('Período inválido.');
  const dias = [];
  for (let d = de; d <= ate; d = somaDias(d, 1)) { dias.push(d); if (dias.length > 400) falha('Período máximo de 12 meses.'); }
  const hs = await db.hgetallMany(dias.map(K.dia));
  return { dias, hs };
}

async function grade(u, de, ate, filtro = {}) {
  const [cfg, rs, cs, ss] = await Promise.all([config(), ruas(), colabs(), subs()]);
  const { dias, hs } = await lerDias(de, ate);
  const now = Date.now();
  const tts = turnosDo(u).filter((t) => !filtro.turno || filtro.turno === t);
  const slots = [];
  dias.forEach((d, i) => {
    for (const t of tts) for (const r of rs) {
      if (filtro.ruaId && filtro.ruaId !== r.id) continue;
      const reg = hs[i][`${t}:${r.id}`] || null;
      const st = situacao(cfg, d, t, reg, now);
      const sub = ss.find((s) => s.data === d && s.turno === t && s.ruaId === r.id);
      slots.push({ data: d, turno: t, ruaId: r.id, ruaNome: reg?.ruaNome || r.nome, status: st,
        donos: donosDe(cs, r.id, t).map((c) => c.nome),
        substituto: sub ? cs.find((c) => c.id === sub.colabId)?.nome : null, registro: reg,
        semOperacaoMotivo: st === 'sem_operacao' ? (semOperacao(cfg, d, t)?.motivo || 'Fora da escala') : null });
    }
  });
  return { slots, cfg, ruas: rs, now };
}

async function painel(u, data) {
  data = data || turnosEmAndamento(await config()).sort((a, b) => b.ini - a.ini)[0]?.data || hojeLocal();
  const g = await grade(u, data, data);
  return { data, slots: g.slots, ruas: g.ruas, turnos: turnosDo(u), turnosCfg: g.cfg.turnos,
    andamento: turnosEmAndamento(g.cfg).map((a) => ({ data: a.data, turno: a.turno })), agora: g.now };
}

async function validar(u, p) {
  if (!['coordenador', 'lider'].includes(u.perfil)) falha('Seu acesso é somente de visualização.', 403);
  if (!turnosDo(u).includes(p.turno)) falha('Este turno não é seu.', 403);
  const cfg = await config();
  const reg = await db.hgetJSON(K.dia(p.data), `${p.turno}:${p.ruaId}`);
  if (!reg) falha('Check-list não encontrado.');
  if (reg.status !== 'enviado') falha('Este check-list não está aguardando validação.');
  const now = Date.now();
  const atrasado = now > reg.prazoValidacao;
  if (atrasado && u.perfil !== 'coordenador') falha('O prazo de validação (fim do turno seguinte) terminou. Só o coordenador pode validar agora.');
  const comentario = String(p.comentario || '').trim();
  if (p.acao === 'reprovar' && !comentario) falha('Informe o motivo da reprovação.');
  const ass = { id: u.id, nome: u.nome, perfil: u.perfil, em: now, comentario, foraDoPrazo: atrasado };
  if (p.acao === 'aprovar') { reg.status = 'validado'; reg.lider = ass; reg.validadoEm = now; }
  else if (p.acao === 'reprovar') { reg.status = 'reprovado'; reg.lider = ass; }
  else falha('Ação inválida.');
  reg.historico.push({ tipo: p.acao === 'aprovar' ? 'validacao' : 'reprovacao', por: u.nome, em: now, comentario, foraDoPrazo: atrasado });
  await db.hsetJSON(K.dia(p.data), `${p.turno}:${p.ruaId}`, reg, RETENCAO_SEG);
  void cfg;
  return { ok: true, registro: reg };
}

// ---------------- roteador ----------------
const acoes = {
  // públicas
  async inicio() {
    const [cs, us] = await Promise.all([colabs(), users()]);
    return { temCoordenador: us.length > 0,
      colaboradores: cs.filter((c) => c.ativo !== false).map((c) => ({ id: c.id, nome: c.nome })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt')) };
  },
  colabTarefas: (p) => tarefasColab(p.colabId),
  colabEnviar: (p) => enviarColab(p),
  async primeiroAcesso(p) {
    const us = await users();
    if (us.length) falha('O coordenador já foi cadastrado.');
    if (!p.nome?.trim() || !p.usuario?.trim() || String(p.senha || '').length < 6) falha('Preencha nome, usuário e senha (mínimo 6 caracteres).');
    const u = { id: id(), nome: p.nome.trim(), usuario: norm(p.usuario).replace(/ /g, ''), perfil: 'coordenador', turnos: [], ...hashSenha(p.senha) };
    await db.setJSON(K.users, [u]);
    return acoes.entrar({ usuario: p.usuario, senha: p.senha });
  },
  // Recuperação do coordenador: só funciona com a variável CHAVE_RECUPERACAO definida na Vercel.
  async recuperar(p) {
    const chave = process.env.CHAVE_RECUPERACAO || '';
    if (chave.length < 8) falha('Recuperação desativada. Crie a variável CHAVE_RECUPERACAO (mínimo 8 caracteres) na Vercel e faça Redeploy.');
    const a = Buffer.from(String(p.chave || '')), b = Buffer.from(chave);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) falha('Chave de recuperação incorreta.', 401);
    const usuario = norm(p.usuario).replace(/ /g, '');
    if (!String(p.nome || '').trim() || !usuario || String(p.senha || '').length < 6) falha('Preencha nome, usuário e senha (mínimo 6 caracteres).');
    const us = await users();
    let u = us.find((x) => x.usuario === usuario);
    if (u) Object.assign(u, { nome: p.nome.trim(), perfil: 'coordenador', turnos: [], ...hashSenha(p.senha) });
    else us.push((u = { id: id(), nome: p.nome.trim(), usuario, perfil: 'coordenador', turnos: [], ...hashSenha(p.senha) }));
    await db.setJSON(K.users, us);
    return acoes.entrar({ usuario, senha: p.senha });
  },
  async entrar(p) {
    const u = (await users()).find((x) => x.usuario === norm(p.usuario).replace(/ /g, ''));
    const senha = String(p.senha || '');
    // aceita espaço/quebra de linha que vem junto ao copiar a senha do Excel
    if (!u || !(confere(senha, u) || (senha.trim() !== senha && confere(senha.trim(), u)))) falha('Usuário ou senha incorretos.', 401);
    const token = crypto.randomBytes(24).toString('hex');
    await db.setJSON(K.sess(token), { uid: u.id }, SESSAO_SEG);
    return { token, usuario: publico(u) };
  },

  // autenticadas
  async eu(p, u) { return { usuario: publico(u) }; },
  async sair(p) { await db.del(K.sess(p.token)); return { ok: true }; },
  async trocarSenha(p, u) {
    if (!confere(p.atual || '', u)) falha('Senha atual incorreta.');
    if (String(p.nova || '').length < 6) falha('A nova senha precisa ter ao menos 6 caracteres.');
    const us = await users();
    Object.assign(us.find((x) => x.id === u.id), hashSenha(p.nova));
    await db.setJSON(K.users, us);
    return { ok: true };
  },
  painel: (p, u) => painel(u, p.data),
  async registro(p, u) {
    if (!turnosDo(u).includes(p.turno)) falha('Sem acesso a este turno.', 403);
    return { registro: await db.hgetJSON(K.dia(p.data), `${p.turno}:${p.ruaId}`) };
  },
  validar: (p, u) => validar(u, p),
  async aguardando(p, u) {
    const hoje = hojeLocal();
    const g = await grade(u, somaDias(hoje, -3), hoje);
    return { slots: g.slots.filter((s) => ['aguardando', 'sem_validacao'].includes(s.status)) };
  },
  async relatorio(p, u) {
    const g = await grade(u, p.de, p.ate, { turno: p.turno, ruaId: p.ruaId });
    return { slots: g.slots, turnosCfg: g.cfg.turnos, itensAtuais: g.cfg.itens, agora: g.now };
  },
  async base(p, u) {
    const [cfg, rs, cs, ss] = await Promise.all([config(), ruas(), colabs(), subs()]);
    return { config: cfg, ruas: rs, colaboradores: cs, substitutos: ss.filter((s) => s.data >= somaDias(hojeLocal(), -1)),
      turnosDoUsuario: turnosDo(u), andamento: turnosEmAndamento(cfg).map((a) => ({ data: a.data, turno: a.turno })), hoje: hojeLocal() };
  },

  // substitutos (líder/coordenador)
  async subCriar(p, u) {
    if (!['coordenador', 'lider'].includes(u.perfil)) falha('Sem permissão.', 403);
    if (!turnosDo(u).includes(p.turno)) falha('Este turno não é seu.', 403);
    const [cfg, cs, ss] = await Promise.all([config(), colabs(), db.getJSON(K.subs, [])]);
    if (!cs.find((c) => c.id === p.colabId)) falha('Selecione o substituto.');
    if (!p.ruaId || !p.data) falha('Informe data e rua.');
    if (Date.now() > janela(cfg, p.data, p.turno).fim) falha('Este turno já terminou.');
    const lim = somaDias(hojeLocal(), -30);
    const novo = ss.filter((s) => s.data >= lim && !(s.data === p.data && s.turno === p.turno && s.ruaId === p.ruaId));
    novo.push({ id: id(), data: p.data, turno: p.turno, ruaId: p.ruaId, colabId: p.colabId, criadoPor: u.nome, criadoEm: Date.now() });
    await db.setJSON(K.subs, novo);
    return { ok: true };
  },
  async subRemover(p, u) {
    if (!['coordenador', 'lider'].includes(u.perfil)) falha('Sem permissão.', 403);
    const ss = await db.getJSON(K.subs, []);
    const s = ss.find((x) => x.id === p.id);
    if (s && !turnosDo(u).includes(s.turno)) falha('Este turno não é seu.', 403);
    await db.setJSON(K.subs, ss.filter((x) => x.id !== p.id));
    return { ok: true };
  },

  // cadastros (coordenador)
  async salvarRuas(p, u) {
    exigeCoord(u);
    const rs = (p.ruas || []).map((r) => ({ id: r.id || id(), nome: String(r.nome || '').trim() })).filter((r) => r.nome);
    if (new Set(rs.map((r) => norm(r.nome))).size !== rs.length) falha('Há ruas com o mesmo nome.');
    await db.setJSON(K.ruas, rs);
    const cs = await colabs(); const ids = new Set(rs.map((r) => r.id));
    cs.forEach((c) => { c.ruas = (c.ruas || []).filter((x) => ids.has(x)); });
    await db.setJSON(K.colabs, cs);
    return { ok: true };
  },
  async salvarColab(p, u) {
    exigeCoord(u);
    const c = p.colaborador || {};
    const nome = String(c.nome || '').trim().replace(/\s+/g, ' ');
    if (!nome) falha('Informe o nome completo.');
    if (!TURNOS.includes(c.turno)) falha('Informe o turno.');
    const cs = await colabs();
    if (cs.some((x) => x.id !== c.id && norm(x.nome) === norm(nome))) falha('Já existe um colaborador com este nome.');
    const reg = { id: c.id || id(), nome, turno: c.turno, ruas: c.ruas || [], ativo: c.ativo !== false };
    const i = cs.findIndex((x) => x.id === reg.id);
    if (i >= 0) cs[i] = reg; else cs.push(reg);
    await db.setJSON(K.colabs, cs);
    return { ok: true, colaborador: reg };
  },
  // define quem é dono de uma rua num turno (tela "Donos das ruas")
  async definirDonos(p, u) {
    exigeCoord(u);
    if (!TURNOS.includes(p.turno) || !p.ruaId) falha('Informe rua e turno.');
    const cs = await colabs();
    const sel = new Set(p.colabIds || []);
    for (const c of cs) {
      if (c.turno !== p.turno) continue;
      const tem = (c.ruas || []).includes(p.ruaId);
      if (sel.has(c.id) && !tem) c.ruas = [...(c.ruas || []), p.ruaId];
      if (!sel.has(c.id) && tem) c.ruas = c.ruas.filter((r) => r !== p.ruaId);
    }
    await db.setJSON(K.colabs, cs);
    return { ok: true };
  },
  async removerColab(p, u) {
    exigeCoord(u);
    await db.setJSON(K.colabs, (await colabs()).filter((x) => x.id !== p.id));
    return { ok: true };
  },
  async importar(p, u) {
    exigeCoord(u);
    const rs = await ruas(); const cs = await colabs(); const us = await users();
    const res = { ruasNovas: 0, colabsNovos: 0, colabsAtualizados: 0, usuariosNovos: 0, usuariosAtualizados: 0, erros: [] };
    const acharRua = (nome, criar) => {
      let r = rs.find((x) => norm(x.nome) === norm(nome));
      if (!r && criar) { r = { id: id(), nome: String(nome).trim() }; rs.push(r); res.ruasNovas++; }
      return r;
    };
    for (const n of p.ruas || []) if (String(n).trim()) acharRua(n, true);
    for (const [i, c] of (p.colaboradores || []).entries()) {
      const nome = String(c.nome || '').trim().replace(/\s+/g, ' ');
      const turno = String(c.turno || '').toUpperCase().replace(/\s/g, '').replace(/^(\d)$/, 'T$1');
      if (!nome) continue;
      if (!TURNOS.includes(turno)) { res.erros.push(`Colaboradores linha ${i + 2}: turno inválido "${c.turno}"`); continue; }
      const ruasIds = String(c.ruas || '').split(/[;,/]/).map((x) => x.trim()).filter(Boolean).map((n) => acharRua(n, true).id);
      const ex = cs.find((x) => norm(x.nome) === norm(nome));
      if (ex) { ex.turno = turno; ex.ruas = ruasIds; ex.ativo = true; res.colabsAtualizados++; }
      else { cs.push({ id: id(), nome, turno, ruas: ruasIds, ativo: true }); res.colabsNovos++; }
    }
    for (const [i, x] of (p.usuarios || []).entries()) {
      const usuario = norm(x.usuario).replace(/ /g, '');
      if (!usuario) continue;
      const perfil = norm(x.perfil).replace('líder', 'lider');
      if (!['lider', 'visualizador', 'coordenador'].includes(perfil)) { res.erros.push(`Usuários linha ${i + 2}: perfil inválido "${x.perfil}"`); continue; }
      const turnos = /todos/i.test(x.turnos || '') || !x.turnos ? [] :
        String(x.turnos).toUpperCase().split(/[;,/ ]/).map((t) => t.trim().replace(/^(\d)$/, 'T$1')).filter((t) => TURNOS.includes(t));
      const ex = us.find((y) => y.usuario === usuario);
      if (ex) {
        if (ex.id === u.id && perfil !== 'coordenador') { res.erros.push(`Usuários linha ${i + 2}: não é possível rebaixar o próprio acesso`); continue; }
        Object.assign(ex, { nome: String(x.nome || ex.nome).trim(), perfil, turnos });
        if (String(x.senha || '').length >= 6) Object.assign(ex, hashSenha(x.senha));
        res.usuariosAtualizados++;
      } else {
        if (String(x.senha || '').length < 6) { res.erros.push(`Usuários linha ${i + 2}: senha inicial com menos de 6 caracteres`); continue; }
        us.push({ id: id(), nome: String(x.nome || usuario).trim(), usuario, perfil, turnos, ...hashSenha(x.senha) }); res.usuariosNovos++;
      }
    }
    await Promise.all([db.setJSON(K.ruas, rs), db.setJSON(K.colabs, cs), db.setJSON(K.users, us)]);
    return res;
  },
  async salvarConfig(p, u) {
    exigeCoord(u);
    const cfg = await config();
    if (p.itens) {
      const it = p.itens.map((i) => ({ id: i.id || id(), nome: String(i.nome || '').trim() })).filter((i) => i.nome);
      if (!it.length) falha('O check-list precisa de ao menos um item.');
      cfg.itens = it;
    }
    if (p.turnos) {
      for (const t of TURNOS) {
        const x = p.turnos[t];
        if (!/^\d\d:\d\d$/.test(x?.inicio) || !/^\d\d:\d\d$/.test(x?.fim)) falha(`Horário inválido no ${t}.`);
        cfg.turnos[t] = { inicio: x.inicio, fim: x.fim, dias: (x.dias || []).map(Number).filter((d) => d >= 0 && d <= 6) };
      }
    }
    if (p.semOperacao) cfg.semOperacao = p.semOperacao.filter((s) => /^\d{4}-\d\d-\d\d$/.test(s.data))
      .map((s) => ({ data: s.data, turnos: (s.turnos || []).filter((t) => TURNOS.includes(t)), motivo: String(s.motivo || '').trim() }));
    await db.setJSON(K.config, cfg);
    return { ok: true, config: cfg };
  },

  // usuários (coordenador)
  async usuarios(p, u) { exigeCoord(u); return { usuarios: (await users()).map(publico) }; },
  async salvarUsuario(p, u) {
    exigeCoord(u);
    const x = p.usuario || {};
    const us = await users();
    const usuario = norm(x.usuario).replace(/ /g, '');
    if (!String(x.nome || '').trim() || !usuario) falha('Informe nome e usuário.');
    if (!['coordenador', 'lider', 'visualizador'].includes(x.perfil)) falha('Perfil inválido.');
    if (us.some((y) => y.id !== x.id && y.usuario === usuario)) falha('Este usuário já existe.');
    const turnos = (x.turnos || []).filter((t) => TURNOS.includes(t));
    let alvo = us.find((y) => y.id === x.id);
    if (alvo) {
      if (alvo.id === u.id && x.perfil !== 'coordenador') falha('Você não pode rebaixar o seu próprio acesso.');
      Object.assign(alvo, { nome: x.nome.trim(), usuario, perfil: x.perfil, turnos });
      if (x.senha) { if (String(x.senha).length < 6) falha('Senha com mínimo de 6 caracteres.'); Object.assign(alvo, hashSenha(x.senha)); }
    } else {
      if (String(x.senha || '').length < 6) falha('Defina uma senha inicial (mínimo 6 caracteres).');
      alvo = { id: id(), nome: x.nome.trim(), usuario, perfil: x.perfil, turnos, ...hashSenha(x.senha) };
      us.push(alvo);
    }
    await db.setJSON(K.users, us);
    return { ok: true };
  },
  async removerUsuario(p, u) {
    exigeCoord(u);
    if (p.id === u.id) falha('Você não pode remover o seu próprio acesso.');
    await db.setJSON(K.users, (await users()).filter((x) => x.id !== p.id));
    return { ok: true };
  },
};
const PUBLICAS = new Set(['inicio', 'colabTarefas', 'colabEnviar', 'primeiroAcesso', 'entrar', 'recuperar']);

async function handle(body) {
  if (db.semBancoEmProducao) falha('Banco de dados não conectado. Na Vercel, conecte o Upstash em Storage e faça um Redeploy.', 503);
  const fn = acoes[body?.a];
  if (!fn) falha('Ação desconhecida.', 404);
  if (PUBLICAS.has(body.a)) return fn(body);
  const u = await sessao(body.token);
  return fn(body, u);
}

module.exports = { handle, status, ErroApp, _t: { situacao, janela, prazoValidacao, turnosEmAndamento, hojeLocal } };
