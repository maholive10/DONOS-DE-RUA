/* Check-list 5S e Tratativa de Avarias – Donos de Rua (PremieRpet) */
'use strict';

// ====================== utilidades ======================
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const app = $('#app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
const TURNOS = ['T1', 'T2', 'T3'];
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const DIAS_UP = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
const ST = {
  validado: 'Validado', aguardando: 'Aguardando líder', sem_validacao: 'Sem validação', reprovado: 'Reprovado – refazer',
  nao_realizado: 'Não realizado', pendente: 'Em andamento', sem_operacao: 'Sem operação', futuro: 'Não iniciado',
};
const VAL = { feito: 'Feito', nao_feito: 'Não feito', na: 'N/A' };
const PERFIL = { coordenador: 'Coordenador', lider: 'Líder', visualizador: 'Visualização' };
const PERFIL_DESC = { coordenador: 'Coordenador – acesso total, gerencia acessos', lider: 'Líder – valida e assina o próprio turno', visualizador: 'Visualização – só consulta painéis e relatórios' };
const ESPERADOS = ['validado', 'reprovado', 'aguardando', 'sem_validacao', 'nao_realizado'];

const fmtD = (d) => d.split('-').reverse().join('/');
const fmtDC = (d) => d.slice(8, 10) + '/' + d.slice(5, 7);
const fmtDH = (ms) => new Date(ms).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fmtH = (ms) => new Date(ms).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
const dow = (d) => new Date(d + 'T12:00:00Z').getUTCDay();
const addD = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const hoje = () => new Date(Date.now() - 3 * 36e5).toISOString().slice(0, 10);
const chip = (st) => `<span class="st st-${st}">${ST[st] || st}</span>`;
const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);
const pctTxt = (v) => (v === null ? '–' : v + '%');
function janelaC(cfg, data, t) {
  const tc = cfg[t];
  const ini = Date.parse(`${data}T${tc.inicio}:00-03:00`);
  let fim = Date.parse(`${data}T${tc.fim}:00-03:00`);
  if (fim <= ini) fim += 864e5;
  return { ini, fim };
}
function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} }
function dispositivo() {
  let d = lsGet('cl_disp');
  if (!d) { d = 'AP-' + Math.random().toString(36).slice(2, 8).toUpperCase(); lsSet('cl_disp', d); }
  const ua = navigator.userAgent;
  const tipo = /iPad|Tablet|SM-T|Tab/i.test(ua) ? 'Tablet' : /Mobi|Android|iPhone/i.test(ua) ? 'Celular' : 'Computador';
  const so = /Android/i.test(ua) ? 'Android' : /iPhone|iPad|Mac OS/i.test(ua) ? 'iOS/Mac' : /Windows/i.test(ua) ? 'Windows' : 'Outro';
  return `${d} · ${tipo} ${so}`;
}

const S = { token: lsGet('cl_token'), user: null, tab: 'painel' };

async function api(a, p = {}) {
  let r, j;
  try {
    r = await fetch('/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ a, token: S.token, ...p }) });
  } catch { throw new Error('Sem conexão com o servidor. Verifique a internet e tente de novo.'); }
  try { j = await r.json(); } catch {
    throw new Error(r.status === 404
      ? 'Servidor não encontrado (erro 404): falta o arquivo api/index.js no GitHub.'
      : `O servidor respondeu com erro ${r.status}. Abra /api no navegador para ver o detalhe.`);
  }
  if (!r.ok) {
    if (r.status === 401 && S.token && !['entrar', 'primeiroAcesso'].includes(a)) { sairLocal(); toast(j.erro, true); telaLogin(); }
    throw new Error(j.erro || 'Erro');
  }
  return j;
}
let toastT;
function toast(msg, err) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (err ? ' err' : ''); t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), err ? 5000 : 3000);
}
function modal(html) { const m = $('#modal'); m.innerHTML = `<div class="box">${html}</div>`; m.hidden = false; m.scrollTop = 0; }
function fecharModal() { $('#modal').hidden = true; $('#modal').innerHTML = ''; }
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') fecharModal(); });
async function acao(btn, fn) {
  if (btn) btn.disabled = true;
  try { await fn(); } catch (e) { toast(e.message, true); } finally { if (btn) btn.disabled = false; }
}
function pills(name, opts, sel) {
  return `<div class="pills">${opts.map(([v, l]) => `<label class="pill ${sel.includes(v) ? 'on' : ''}"><input type="checkbox" name="${name}" value="${v}" ${sel.includes(v) ? 'checked' : ''}>${esc(l)}</label>`).join('')}</div>`;
}
document.addEventListener('change', (e) => { if (e.target.closest('.pill')) e.target.closest('.pill').classList.toggle('on', e.target.checked); });
const vals = (name, root = document) => $$(`input[name="${name}"]:checked`, root).map((i) => i.value);

// ====================== COLABORADOR ======================
async function telaInicio() {
  clearInterval(S.timer); clearTimeout(S.voltar); fecharModal();
  app.innerHTML = `<div class="empty">Carregando…</div>`;
  let d;
  try { d = await api('inicio'); } catch (e) { app.innerHTML = `<div class="narrow"><div class="alert bad">${esc(e.message)}</div><button class="btn" style="margin-top:12px" onclick="telaInicio()">Tentar de novo</button></div>`; return; }
  if (!d.temCoordenador) return telaPrimeiroAcesso();
  S.lista = d.colaboradores;
  app.innerHTML = `
  <div class="narrow">
    <div class="hero" style="border-radius:20px"><img src="banner.png" alt="PremieRpet – Tempo de nutrir. De verdade."></div>
    <div style="margin:18px 2px 14px">
      <div class="cond" style="color:var(--brand);font-size:1rem">CHECK-LIST DIÁRIO</div>
      <h1 style="font-size:1.75rem;font-weight:800">5S e Tratativa de Avarias</h1>
    </div>
    <div class="card">
      <h2 style="font-size:1.2rem">Quem é você?</h2>
      <p class="muted small" style="margin:4px 0 10px">Digite seu nome completo e toque nele na lista.</p>
      <input type="search" id="busca" placeholder="Digite seu nome…" autocomplete="off" autocapitalize="words">
      <div class="namelist" id="nomes"></div>
    </div>
    <div class="foot"><button class="btn lnk" onclick="telaLogin()">Acesso do líder / coordenação</button></div>
  </div>`;
  const busca = $('#busca');
  const pinta = () => {
    const q = norm(busca.value);
    if (q.length < 2) { $('#nomes').innerHTML = ''; return; }
    const l = S.lista.filter((c) => norm(c.nome).split(' ').some((p, i, arr) => arr.slice(i).join(' ').startsWith(q)) || norm(c.nome).includes(q)).slice(0, 8);
    $('#nomes').innerHTML = l.length ? l.map((c) => `<button data-id="${c.id}">${esc(c.nome)}</button>`).join('') : '<div class="empty">Nome não encontrado. Procure seu líder.</div>';
  };
  busca.oninput = pinta;
  $('#nomes').onclick = (e) => { const b = e.target.closest('button'); if (b) telaConfirmar(b.dataset.id); };
}

async function telaConfirmar(colabId) {
  clearTimeout(S.voltar);
  app.innerHTML = `<div class="empty">Carregando…</div>`;
  let d;
  try { d = await api('colabTarefas', { colabId }); } catch (e) { toast(e.message, true); return telaInicio(); }
  S.colab = d;
  const c = d.colab;
  const cards = d.tarefas.map((t, i) => {
    const extra = t.tipo === 'substituto' ? `<span class="tag o">Substituindo ${esc(t.titular || 'titular')}</span>` : t.tipo === 'refazer' || t.status === 'reprovado' ? `<span class="tag o">Refazer</span>` : '';
    const coment = t.status === 'reprovado' && t.registro?.lider?.comentario ? `<div class="alert bad small" style="margin-top:8px">Líder ${esc(t.registro.lider.nome)}: ${esc(t.registro.lider.comentario)}</div>` : '';
    return `<div class="tarefa"><div class="grow">
      <div class="rua">${esc(t.ruaNome)}</div>
      <div class="small muted">${DIAS[dow(t.data)]} ${fmtD(t.data)} · ${t.turno} ${extra}</div>
      <div style="margin-top:6px">${chip(t.status)}</div>${coment}</div>
      ${t.podePreencher ? `<button class="btn pri" onclick="telaChecklist(${i})">Preencher</button>` : t.registro ? `<button class="btn" onclick="verMeu(${i})">Ver</button>` : ''}
    </div>`;
  }).join('');
  app.innerHTML = `
  <div class="narrow">
    <div class="card">
      <div class="tiny cond">CONFIRME QUE É VOCÊ</div>
      <div class="who-big">${esc(c.nome)}?</div>
      <div class="muted" style="margin-top:4px">Turno <b>${c.turno}</b> (${d.turnoCfg.inicio} às ${d.turnoCfg.fim}) · ${c.ruas.length ? c.ruas.map((r) => `<b>${esc(r)}</b>`).join(', ') : 'sem rua'}</div>
      <div class="row" style="margin-top:14px"><button class="btn" onclick="telaInicio()">Não sou eu</button></div>
    </div>
    <div class="card">
      <h2 style="font-size:1.2rem;margin-bottom:12px">Seu check-list</h2>
      ${d.aviso ? `<div class="alert info">${esc(d.aviso)}</div>` : cards}
    </div>
  </div>`;
}

function verMeu(i) {
  const t = S.colab.tarefas[i];
  modal(`<button class="x" onclick="fecharModal()">×</button><h3>${esc(t.ruaNome)} · ${t.turno}</h3>
    <div class="muted small">${DIAS[dow(t.data)]} ${fmtD(t.data)}</div><div style="margin:8px 0">${chip(t.status)}</div>${detalheRegistro(t.registro)}`);
}

function telaChecklist(i) {
  const t = S.colab.tarefas[i];
  const c = S.colab.colab;
  const itens = t.status === 'reprovado' && t.registro ? t.registro.itens : S.colab.itens;
  const resp = {};
  app.innerHTML = `
  <div class="narrow stack">
    <div class="ck-head">
      <div class="tiny" style="color:#ffffffaa;letter-spacing:.1em">CHECK-LIST 5S E TRATATIVA DE AVARIAS</div>
      <div class="rua">${esc(t.ruaNome)}</div>
      <div>${DIAS[dow(t.data)]} ${fmtD(t.data)} · Turno ${t.turno} · ${esc(c.nome)}${t.tipo === 'substituto' ? ' (substituto)' : ''}</div>
      <div class="small" style="opacity:.75;margin-top:4px">${t.status === 'reprovado' ? 'Refazer após reprovação' : 'Pode preencher até ' + fmtH(t.fim)}</div>
    </div>
    ${t.status === 'reprovado' ? `<div class="alert bad"><b>Reprovado pelo líder ${esc(t.registro.lider?.nome || '')}:</b> ${esc(t.registro.lider?.comentario || '')}<br><span class="small">Refaça a organização e preencha o check-list de novo.</span></div>` : ''}
    <div id="itens">${itens.map((it, n) => `
      <div class="item" data-id="${it.id}">
        <div class="nm"><span class="n">${n + 1}.</span>${esc(it.nome)}</div>
        <div class="seg">${['feito', 'nao_feito', 'na'].map((v) => `<button type="button" class="${v}" data-v="${v}">${VAL[v]}</button>`).join('')}</div>
      </div>`).join('')}</div>
    <div class="card">
      <label class="f">Observação <span class="tiny">(obrigatória se algum item não foi feito)</span><textarea id="obs" maxlength="1000" placeholder="Ex.: caçamba cheia, aguardando troca"></textarea></label>
      <div class="sign">
        <div class="cond" style="color:var(--brand-ink);margin-bottom:8px">ASSINATURA ELETRÔNICA</div>
        <label class="chk"><input type="checkbox" id="decl"><span>Eu, <b>${esc(c.nome)}</b>, declaro que realizei a organização física da rua e que as informações deste check-list são verdadeiras.</span></label>
        <div class="tiny" style="margin-top:8px">Serão registrados seu nome, data, hora e o aparelho usado.</div>
      </div>
      <button class="btn pri big" id="enviar" style="margin-top:14px">Assinar e enviar</button>
      <div class="foot" style="margin-top:8px"><button class="btn lnk" onclick="telaConfirmar('${c.id}')">Voltar</button></div>
    </div>
  </div>`;
  window.scrollTo(0, 0);
  $('#itens').onclick = (e) => {
    const b = e.target.closest('.seg button'); if (!b) return;
    const box = b.closest('.item');
    resp[box.dataset.id] = b.dataset.v;
    $$('.seg button', box).forEach((x) => x.classList.toggle('on', x === b));
    box.classList.remove('missing');
  };
  $('#enviar').onclick = (e) => acao(e.target, async () => {
    const falt = itens.filter((it) => !resp[it.id]);
    if (falt.length) {
      falt.forEach((it) => $(`.item[data-id="${it.id}"]`).classList.add('missing'));
      $(`.item[data-id="${falt[0].id}"]`).scrollIntoView({ behavior: 'smooth', block: 'center' });
      throw new Error(`Marque todos os itens (faltam ${falt.length}).`);
    }
    if (Object.values(resp).includes('nao_feito') && !$('#obs').value.trim()) { $('#obs').focus(); throw new Error('Explique na observação o que não foi feito.'); }
    if (!$('#decl').checked) throw new Error('Marque a declaração para assinar.');
    const r = await api('colabEnviar', { colabId: c.id, data: t.data, turno: t.turno, ruaId: t.ruaId, respostas: resp, obs: $('#obs').value, dispositivo: dispositivo(), declaracao: true });
    telaRecibo(r.registro);
  });
}

function telaRecibo(reg) {
  const c = S.colab.colab;
  const resto = S.colab.tarefas.filter((t) => t.podePreencher && !(t.data === reg.data && t.turno === reg.turno && t.ruaId === reg.ruaId)).length;
  app.innerHTML = `
  <div class="narrow"><div class="card receipt">
    <div class="ic">✓</div>
    <h2 style="font-size:1.5rem">Check-list enviado</h2>
    <p class="muted">${esc(reg.ruaNome)} · ${DIAS[dow(reg.data)]} ${fmtD(reg.data)} · ${reg.turno}</p>
    <div class="sigbox" style="text-align:left"><b>Assinado eletronicamente por ${esc(reg.assinaturaColab.nome)}</b>${fmtDH(reg.assinaturaColab.em)} · ${esc(reg.assinaturaColab.dispositivo)}</div>
    <p class="small muted">Agora o líder do turno vai conferir e assinar.</p>
    ${resto ? `<button class="btn pri big" onclick="telaConfirmar('${c.id}')">Preencher próxima rua (${resto})</button>` : ''}
    <button class="btn big" style="margin-top:10px" onclick="telaInicio()">Concluir</button>
    <div class="tiny" style="margin-top:10px">Voltando para a tela inicial em alguns segundos…</div>
  </div></div>`;
  S.voltar = setTimeout(() => { if (!resto) telaInicio(); }, 15000);
}

// ====================== ACESSO GESTÃO ======================
function telaPrimeiroAcesso() {
  app.innerHTML = `
  <div class="narrow">
    <div class="hero" style="border-radius:20px"><img src="banner.png" alt="PremieRpet"></div>
    <div class="card" style="margin-top:16px">
      <h2>Primeiro acesso</h2>
      <p class="muted small">Cadastre o coordenador. Ele terá acesso total e poderá criar os acessos dos líderes.</p>
      <label class="f">Nome completo<input type="text" id="pn"></label>
      <label class="f">Usuário<input type="text" id="pu" autocapitalize="off"></label>
      <label class="f">Senha (mínimo 6 caracteres)<input type="password" id="ps"></label>
      <button class="btn pri big" id="pb">Criar coordenador</button>
    </div>
  </div>`;
  $('#pb').onclick = (e) => acao(e.target, async () => {
    const r = await api('primeiroAcesso', { nome: $('#pn').value, usuario: $('#pu').value, senha: $('#ps').value });
    logado(r);
  });
}

function telaLogin() {
  clearTimeout(S.voltar);
  app.innerHTML = `
  <div class="narrow">
    <div class="hero" style="border-radius:20px"><img src="banner.png" alt="PremieRpet"></div>
    <div class="card" style="margin-top:16px">
      <h2>Líder / coordenação</h2>
      <p class="muted small">Entre com seu usuário e senha.</p>
      <form id="lf">
        <label class="f">Usuário<input type="text" id="lu" autocapitalize="off" autocomplete="username"></label>
        <label class="f">Senha<input type="password" id="ls" autocomplete="current-password"></label>
        <button class="btn pri big" type="submit">Entrar</button>
      </form>
    </div>
    <div class="foot"><button class="btn lnk" onclick="telaInicio()">Voltar para a tela do colaborador</button><br><button class="btn lnk small" onclick="telaRecuperar()">Recuperar acesso do coordenador</button></div>
  </div>`;
  $('#lu').focus();
  $('#lf').onsubmit = (e) => { e.preventDefault(); acao(e.submitter, async () => logado(await api('entrar', { usuario: $('#lu').value, senha: $('#ls').value }))); };
}
function telaRecuperar() {
  app.innerHTML = `
  <div class="narrow">
    <div class="card">
      <h2>Recuperar acesso do coordenador</h2>
      <p class="muted small">Use a chave de recuperação cadastrada na Vercel (variável <b>CHAVE_RECUPERACAO</b>). Se o usuário já existir, a senha dele é trocada; se não existir, é criado como coordenador.</p>
      <label class="f">Chave de recuperação<input type="password" id="rc"></label>
      <label class="f">Nome completo<input type="text" id="rn"></label>
      <label class="f">Usuário<input type="text" id="ru" autocapitalize="off"></label>
      <label class="f">Nova senha (mínimo 6 caracteres)<input type="password" id="rs"></label>
      <button class="btn pri big" id="rb">Recuperar e entrar</button>
    </div>
    <div class="foot"><button class="btn lnk" onclick="telaLogin()">Voltar</button></div>
  </div>`;
  $('#rb').onclick = (e) => acao(e.target, async () => logado(await api('recuperar', { chave: $('#rc').value, nome: $('#rn').value, usuario: $('#ru').value, senha: $('#rs').value })));
}
function logado(r) { S.token = r.token; S.user = r.usuario; lsSet('cl_token', r.token); S.tab = 'painel'; telaGestao(); }
function sairLocal() { S.token = null; S.user = null; lsSet('cl_token', null); clearInterval(S.timer); }
async function sair() { try { await api('sair'); } catch {} sairLocal(); fecharModal(); telaInicio(); }

function contaMenu() {
  modal(`<button class="x" onclick="fecharModal()">×</button><h3>${esc(S.user.nome)}</h3>
    <div class="muted small" style="margin-bottom:14px">${PERFIL[S.user.perfil]} · usuário ${esc(S.user.usuario)} · ${S.user.turnos.length ? S.user.turnos.join(', ') : 'todos os turnos'}</div>
    <h4 style="margin:0 0 8px">Alterar senha</h4>
    <label class="f">Senha atual<input type="password" id="sa"></label>
    <label class="f">Nova senha<input type="password" id="sn"></label>
    <div class="row between"><button class="btn bad" onclick="sair()">Sair</button><button class="btn pri" id="sb">Salvar nova senha</button></div>`);
  $('#sb').onclick = (e) => acao(e.target, async () => { await api('trocarSenha', { atual: $('#sa').value, nova: $('#sn').value }); fecharModal(); toast('Senha alterada.'); });
}

// ====================== GESTÃO ======================
const TABS = { painel: 'Painel', validacao: 'Validação', aderencia: 'Aderência', relatorios: 'Relatórios', substitutos: 'Substitutos', cadastros: 'Cadastros', config: 'Configurações', usuarios: 'Usuários' };
function tabsDo(u) {
  if (u.perfil === 'coordenador') return Object.keys(TABS);
  if (u.perfil === 'lider') return ['painel', 'validacao', 'aderencia', 'relatorios', 'substitutos'];
  return ['painel', 'aderencia', 'relatorios'];
}
const podeValidar = () => ['coordenador', 'lider'].includes(S.user.perfil);
const ehCoord = () => S.user.perfil === 'coordenador';

async function telaGestao(tab) {
  if (!S.user) {
    try { S.user = (await api('eu')).usuario; } catch { return; }
  }
  const tabs = tabsDo(S.user);
  if (tab) S.tab = tab;
  if (!tabs.includes(S.tab)) S.tab = 'painel';
  clearInterval(S.timer); fecharModal();
  app.innerHTML = `
  <header class="topbar">
    <div class="in">
      <div class="wordmark">PremieRpet<small>Check-list 5S · Donos de rua</small></div>
      <div class="sp"></div>
      <div class="who"><b>${esc(S.user.nome)}</b>${PERFIL[S.user.perfil]} · ${S.user.turnos.length ? S.user.turnos.join(', ') : 'todos os turnos'}</div>
      <button class="ghost-w" onclick="contaMenu()">Conta</button>
    </div>
    <nav class="tabs">${tabs.map((t) => `<button class="${t === S.tab ? 'on' : ''}" onclick="telaGestao('${t}')">${TABS[t]}</button>`).join('')}</nav>
  </header>
  <main class="wrap" id="main"><div class="empty">Carregando…</div></main>`;
  const fn = { painel: tabPainel, validacao: tabValidacao, aderencia: tabAderencia, relatorios: tabRelatorios, substitutos: tabSubstitutos, cadastros: tabCadastros, config: tabConfig, usuarios: tabUsuarios }[S.tab];
  try { await fn(); } catch (e) { $('#main').innerHTML = `<div class="alert bad">${esc(e.message)}</div>`; }
}
const main = () => $('#main');
const recarregar = () => telaGestao(S.tab);

// ---------- Painel gerencial ----------
async function tabPainel(data) {
  const d = await api('painel', { data: data || S.painelData });
  if (S.tab !== 'painel') return;
  S.painelData = data || S.painelData ? d.data : null; // mantém data escolhida; sem escolha segue o turno atual
  S.slots = d.slots;
  const cont = {}; d.slots.forEach((s) => (cont[s.status] = (cont[s.status] || 0) + 1));
  const esperados = d.slots.filter((s) => ESPERADOS.includes(s.status) || s.status === 'pendente').length;
  const feitos = d.slots.filter((s) => s.registro).length;
  const k = (cls, n, l) => `<div class="kpi ${cls}"><b>${n || 0}</b><span>${l}</span></div>`;
  const andamento = d.andamento.filter((a) => a.data === d.data).map((a) => a.turno);
  const idx = new Map(d.slots.map((s, i) => [s.turno + s.ruaId, i]));
  main().innerHTML = `
  <div class="sec-title">
    <div><h2>Visão gerencial – ${DIAS[dow(d.data)]} ${fmtD(d.data)}</h2><div class="tiny">Atualizado às ${fmtH(d.agora)} · atualiza sozinho a cada minuto</div></div>
    <div class="row">
      <button class="btn sm" onclick="tabPainel('${addD(d.data, -1)}')">◀</button>
      <input type="date" id="pd" value="${d.data}" style="width:auto">
      <button class="btn sm" onclick="tabPainel('${addD(d.data, 1)}')">▶</button>
      <button class="btn sm" onclick="S.painelData=null;tabPainel()">Agora</button>
    </div>
  </div>
  <div class="kpis">
    ${k('k-ok', feitos, `Ruas feitas de ${esperados}`)}
    ${k('k-ok', cont.validado, 'Validadas pelo líder')}
    ${k('k-wait', cont.aguardando, 'Aguardando líder')}
    ${k('k-run', cont.pendente, 'Em andamento')}
    ${k('k-bad', cont.reprovado, 'Reprovadas – refazer')}
    ${k('k-miss', cont.nao_realizado, 'Não realizadas')}
    ${cont.sem_validacao ? k('k-late', cont.sem_validacao, 'Sem validação no prazo') : ''}
  </div>
  <div class="card scroll-x" style="padding:6px 8px">
    <table class="grid-tbl">
      <thead><tr><th>Rua</th>${d.turnos.map((t) => `<th class="${andamento.includes(t) ? 'now' : ''}">${t} <span class="hide-sm" style="text-transform:none;letter-spacing:0;font-weight:500">${d.turnosCfg[t].inicio}–${d.turnosCfg[t].fim}</span></th>`).join('')}</tr></thead>
      <tbody>${d.ruas.map((r) => `<tr><td class="rua">${esc(r.nome)}</td>${d.turnos.map((t) => {
        const i = idx.get(t + r.id); const s = d.slots[i];
        const quem = s.registro ? s.registro.colab.nome + (s.registro.colab.substituto ? ' (subst.)' : '') : s.substituto ? s.substituto + ' (subst.)' : s.donos.join(', ') || 'Sem dono';
        return `<td><button class="cell" onclick="abrirSlot(${i})">${chip(s.status)}<span class="who">${esc(quem)}</span></button></td>`;
      }).join('')}</tr>`).join('')}</tbody>
    </table>
  </div>
  <div class="legend">${Object.keys(ST).map(chip).join('')}</div>`;
  $('#pd').onchange = (e) => { S.painelData = e.target.value; tabPainel(e.target.value); };
  clearInterval(S.timer);
  S.timer = setInterval(() => { if (S.tab === 'painel' && $('#modal').hidden) tabPainel(S.painelData).catch(() => {}); }, 60000);
}

function detalheRegistro(reg) {
  if (!reg) return '';
  const a = reg.assinaturaColab;
  return `
  <table class="ck-view">${reg.itens.map((it, n) => `<tr><td>${n + 1}. ${esc(it.nome)}</td><td class="v-${it.valor}">${VAL[it.valor]}</td></tr>`).join('')}</table>
  ${reg.obs ? `<div class="sigbox"><b>Observação do colaborador</b>${esc(reg.obs)}</div>` : ''}
  <div class="sigbox"><b>✍ Colaborador: ${esc(a.nome)}${a.substituto ? ` (substituto de ${esc(a.titular || 'titular')})` : ''}</b>${fmtDH(a.em)} · ${esc(a.dispositivo || '')}</div>
  ${reg.lider ? `<div class="sigbox"><b>✍ ${reg.status === 'validado' ? 'Validado' : 'Reprovado'} por ${esc(reg.lider.nome)} (${PERFIL[reg.lider.perfil] || ''})</b>${fmtDH(reg.lider.em)}${reg.lider.foraDoPrazo ? ' · fora do prazo' : ''}${reg.lider.comentario ? `<br>“${esc(reg.lider.comentario)}”` : ''}</div>` : ''}
  ${reg.historico.length > 1 ? `<details style="margin-top:8px"><summary class="small" style="cursor:pointer;font-weight:600">Histórico (${reg.historico.length})</summary><ul class="hist">${reg.historico.map((h) => `<li>${fmtDH(h.em)} – ${{ envio: 'Enviado', reenvio: 'Reenviado após reprovação', validacao: 'Validado', reprovacao: 'Reprovado' }[h.tipo]} por ${esc(h.por)}${h.comentario ? ` – “${esc(h.comentario)}”` : ''}</li>`).join('')}</ul></details>` : ''}`;
}

function abrirSlot(i, lista = S.slots) {
  const s = lista[i];
  const reg = s.registro;
  const meuTurno = S.user.perfil === 'coordenador' || !S.user.turnos.length || S.user.turnos.includes(s.turno);
  const pode = podeValidar() && meuTurno && (s.status === 'aguardando' || (s.status === 'sem_validacao' && ehCoord()));
  let corpo = '';
  if (!reg) {
    corpo = `<div class="sigbox"><b>Dono(s) da rua no ${s.turno}</b>${esc(s.donos.join(', ') || 'Nenhum colaborador cadastrado')}${s.substituto ? `<br>Substituto do dia: <b>${esc(s.substituto)}</b>` : ''}</div>
      ${s.status === 'sem_operacao' ? `<p class="muted">${esc(s.semOperacaoMotivo)}</p>` : ''}
      ${s.status === 'pendente' ? '<p class="muted">O colaborador ainda não enviou o check-list deste turno.</p>' : ''}
      ${s.status === 'nao_realizado' ? '<p class="muted">O turno terminou sem o check-list ser enviado.</p>' : ''}
      ${podeValidar() && meuTurno && ['pendente', 'futuro'].includes(s.status) ? `<button class="btn" onclick="fecharModal();S.subPre={data:'${s.data}',turno:'${s.turno}',ruaId:'${s.ruaId}'};telaGestao('substitutos')">Definir substituto</button>` : ''}`;
  } else corpo = detalheRegistro(reg);
  modal(`<button class="x" onclick="fecharModal()">×</button>
    <h3>${esc(s.ruaNome)} · ${s.turno}</h3>
    <div class="muted small">${DIAS[dow(s.data)]} ${fmtD(s.data)}</div>
    <div style="margin:10px 0">${chip(s.status)}${s.status === 'aguardando' ? ` <span class="tiny">validar até ${fmtDH(reg.prazoValidacao)}</span>` : ''}</div>
    ${corpo}
    ${pode ? `
    <div class="sign" style="margin-top:14px">
      <div class="cond" style="color:var(--brand-ink);margin-bottom:8px">VALIDAÇÃO DO LÍDER</div>
      ${s.status === 'sem_validacao' ? '<div class="alert small" style="margin-bottom:8px">Prazo do líder encerrado. A validação ficará registrada como fora do prazo.</div>' : ''}
      <label class="chk"><input type="checkbox" id="vd"><span>Eu, <b>${esc(S.user.nome)}</b>, conferi a rua e confirmo que o que foi marcado como feito foi realmente feito.</span></label>
      <div class="row" style="margin-top:12px">
        <button class="btn ok grow" id="vok">Validar e assinar</button>
        <button class="btn bad" id="vrep">Reprovar</button>
      </div>
      <div id="repbox" class="hide" style="margin-top:12px">
        <label class="f">Motivo da reprovação (obrigatório)<textarea id="vcom" placeholder="O que não foi feito?"></textarea></label>
        <button class="btn bad" id="vrepok">Confirmar reprovação e devolver</button>
      </div>
    </div>` : ''}`);
  if (!pode) return;
  const env = (acaoV, btn) => acao(btn, async () => {
    if (acaoV === 'aprovar' && !$('#vd').checked) throw new Error('Marque a confirmação para assinar.');
    await api('validar', { data: s.data, turno: s.turno, ruaId: s.ruaId, acao: acaoV, comentario: $('#vcom').value });
    fecharModal(); toast(acaoV === 'aprovar' ? 'Check-list validado e assinado.' : 'Reprovado. O colaborador precisa refazer.');
    recarregar();
  });
  $('#vok').onclick = (e) => env('aprovar', e.target);
  $('#vrep').onclick = () => { $('#repbox').classList.remove('hide'); $('#vcom').focus(); };
  $('#vrepok').onclick = (e) => env('reprovar', e.target);
}

// ---------- Validação ----------
async function tabValidacao() {
  const d = await api('aguardando');
  S.slotsV = d.slots.sort((a, b) => (a.data + a.turno).localeCompare(b.data + b.turno));
  main().innerHTML = `
  <div class="sec-title"><h2>Aguardando validação</h2><span class="tiny">Últimos 4 dias · o líder valida até o fim do turno seguinte</span></div>
  <div class="card">${S.slotsV.length ? `<div class="scroll-x"><table class="tbl">
    <thead><tr><th>Data</th><th>Turno</th><th>Rua</th><th>Colaborador</th><th class="hide-sm">Enviado</th><th>Prazo</th><th></th></tr></thead>
    <tbody>${S.slotsV.map((s, i) => `<tr><td>${DIAS[dow(s.data)]} ${fmtDC(s.data)}</td><td>${s.turno}</td><td><b>${esc(s.ruaNome)}</b></td>
      <td>${esc(s.registro.colab.nome)}${s.registro.colab.substituto ? ' <span class="tag">subst.</span>' : ''}${s.registro.itens.some((x) => x.valor === 'nao_feito') ? ' <span class="tag o">item não feito</span>' : ''}</td>
      <td class="hide-sm small">${fmtDH(s.registro.enviadoEm)}</td><td>${s.status === 'sem_validacao' ? chip('sem_validacao') : `<span class="small">${fmtDH(s.registro.prazoValidacao)}</span>`}</td>
      <td><button class="btn pri sm" onclick="abrirSlot(${i}, S.slotsV)">Conferir</button></td></tr>`).join('')}</tbody></table></div>`
    : '<div class="empty">Nenhum check-list aguardando validação. 👍</div>'}</div>`;
}

// ---------- Aderência ----------
async function tabAderencia() {
  const h = hoje();
  const base = await api('base');
  S.base = base;
  main().innerHTML = `
  <div class="sec-title"><h2>Aderência</h2><span class="tiny">“Não se aplica” conta como item ok. Dias sem operação ficam fora da conta.</span></div>
  <div class="card"><div class="row">
    <label class="f grow" style="margin:0">De<input type="date" id="ad" value="${h.slice(0, 8)}01"></label>
    <label class="f grow" style="margin:0">Até<input type="date" id="aa" value="${h}"></label>
    <label class="f grow" style="margin:0">Turno<select id="at"><option value="">Todos</option>${base.turnosDoUsuario.map((t) => `<option>${t}</option>`).join('')}</select></label>
    <button class="btn pri" id="ab" style="align-self:flex-end">Calcular</button>
  </div></div>
  <div id="ares"></div>`;
  const calc = (btn) => acao(btn, async () => {
    $('#ares').innerHTML = '<div class="empty">Calculando…</div>';
    const r = await api('relatorio', { de: $('#ad').value, ate: $('#aa').value, turno: $('#at').value });
    $('#ares').innerHTML = htmlAderencia(r.slots, base.ruas);
  });
  $('#ab').onclick = (e) => calc(e.target);
  calc();
}
function agg(slots) {
  const e = slots.filter((s) => ESPERADOS.includes(s.status));
  return { esp: e.length, feitos: e.filter((s) => s.registro).length, val: e.filter((s) => s.status === 'validado').length,
    nr: e.filter((s) => s.status === 'nao_realizado').length, rep: e.filter((s) => s.registro?.historico.some((h) => h.tipo === 'reprovacao')).length };
}
function htmlAderencia(slots, ruas) {
  const turnos = TURNOS.filter((t) => slots.some((s) => s.turno === t));
  const tot = agg(slots);
  const bar = (v, c = '') => `<div class="row" style="gap:8px;flex-wrap:nowrap"><div class="bar ${c} grow"><i style="width:${v || 0}%"></i></div><span class="pct">${pctTxt(v)}</span></div>`;
  const cardT = (titulo, a) => `<div class="card"><div class="cond muted">${titulo}</div>
    <div class="row" style="gap:22px;margin-top:6px"><div><div class="big-pct">${pctTxt(pct(a.feitos, a.esp))}</div><div class="tiny">realizado (${a.feitos}/${a.esp})</div></div>
    <div><div class="big-pct" style="color:var(--ok)">${pctTxt(pct(a.val, a.esp))}</div><div class="tiny">validado pelo líder (${a.val})</div></div></div>
    <div class="small muted" style="margin-top:8px">${a.nr} não realizados · ${a.rep} com reprovação</div></div>`;
  if (!tot.esp) return '<div class="card empty">Nenhum check-list esperado no período.</div>';
  return `
  <div class="cols" style="margin-top:14px">${cardT('TOTAL DO PERÍODO', tot)}${turnos.map((t) => cardT('TURNO ' + t, agg(slots.filter((s) => s.turno === t)))).join('')}</div>
  <div class="card scroll-x" style="margin-top:14px">
    <h3 style="margin-bottom:8px">Por rua</h3>
    <table class="tbl"><thead><tr><th>Rua</th>${turnos.map((t) => `<th>${t} realizado</th><th>${t} validado</th>`).join('')}<th>Não realiz.</th></tr></thead>
    <tbody>${ruas.map((r) => {
      const sr = slots.filter((s) => s.ruaId === r.id);
      return `<tr><td><b>${esc(r.nome)}</b></td>${turnos.map((t) => { const a = agg(sr.filter((s) => s.turno === t)); return `<td>${bar(pct(a.feitos, a.esp), 'b2')}</td><td>${bar(pct(a.val, a.esp))}</td>`; }).join('')}<td><b>${agg(sr).nr}</b></td></tr>`;
    }).join('')}</tbody></table>
  </div>`;
}

// ---------- Relatórios ----------
async function tabRelatorios() {
  const base = await api('base'); S.base = base;
  const h = hoje();
  const optT = (todos) => (todos ? '<option value="">Todos</option>' : '') + base.turnosDoUsuario.map((t) => `<option>${t}</option>`).join('');
  const optR = '<option value="">Todas as ruas</option>' + base.ruas.map((r) => `<option value="${r.id}">${esc(r.nome)}</option>`).join('');
  main().innerHTML = `
  <div class="sec-title"><h2>Relatórios</h2></div>
  <div class="cols">
    <div class="card">
      <h3>PDF semanal</h3>
      <p class="small muted">Mesmo formato do papel: itens nas linhas e os dias da semana nas colunas, com a coluna do colaborador e a do líder. Uma página por rua.</p>
      <label class="f">Semana (escolha qualquer dia)<input type="date" id="ps" value="${h}"></label>
      <div class="tiny" id="psl" style="margin:-6px 0 10px"></div>
      <label class="f">Turno<select id="pt">${optT(false)}</select></label>
      <label class="f">Rua<select id="pr">${optR}</select></label>
      <button class="btn pri" id="pb">Gerar PDF</button>
    </div>
    <div class="card">
      <h3>Excel consolidado</h3>
      <p class="small muted">Uma linha por rua/turno/dia, com cada item, situação, assinaturas e observações. Inclui aba de aderência.</p>
      <div class="row"><label class="f grow">De<input type="date" id="ed" value="${h.slice(0, 8)}01"></label><label class="f grow">Até<input type="date" id="ea" value="${h}"></label></div>
      <label class="f">Turno<select id="et">${optT(true)}</select></label>
      <label class="f">Rua<select id="er">${optR}</select></label>
      <button class="btn pri" id="eb">Gerar Excel</button>
    </div>
  </div>`;
  const semana = () => { const d = $('#ps').value || h; const ini = addD(d, -dow(d)); return [ini, addD(ini, 6)]; };
  const lbl = () => { const [a, b] = semana(); $('#psl').textContent = `Semana de ${fmtD(a)} a ${fmtD(b)}`; };
  $('#ps').onchange = lbl; lbl();
  $('#pb').onclick = (e) => acao(e.target, async () => { const [de, ate] = semana(); await gerarPDF(de, ate, $('#pt').value, $('#pr').value); });
  $('#eb').onclick = (e) => acao(e.target, () => gerarExcel($('#ed').value, $('#ea').value, $('#et').value, $('#er').value));
}

function itensDe(slots, atuais) {
  const nomes = [];
  slots.forEach((s) => s.registro?.itens.forEach((i) => { if (!nomes.includes(i.nome)) nomes.push(i.nome); }));
  return nomes.length ? nomes : atuais.map((i) => i.nome);
}

async function gerarPDF(de, ate, turno, ruaId) {
  const r = await api('relatorio', { de, ate, turno, ruaId });
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = 297;
  const ordemRua = new Map(S.base.ruas.map((x, i) => [x.id, i]));
  const grupos = new Map();
  r.slots.forEach((s) => { const k = s.turno + '|' + s.ruaId; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(s); });
  const chaves = [...grupos.keys()].sort((a, b) => { const [ta, ra] = a.split('|'); const [tb, rb] = b.split('|'); return ta.localeCompare(tb) || (ordemRua.get(ra) ?? 99) - (ordemRua.get(rb) ?? 99); });
  if (!chaves.length) throw new Error('Nada para gerar neste filtro.');
  const LARANJA = [230, 65, 7];
  chaves.forEach((k, gi) => {
    if (gi) doc.addPage();
    const sl = grupos.get(k).sort((a, b) => a.data.localeCompare(b.data));
    const t = sl[0].turno;
    const tc = r.turnosCfg[t];
    const dias = sl.filter((s) => tc.dias.includes(dow(s.data)) || s.registro);
    const itens = itensDe(dias, r.itensAtuais);
    const resp = [...new Set(dias.filter((s) => s.registro).map((s) => s.registro.colab.nome))];
    const responsavel = resp.length ? resp.join(', ') : sl[0].donos.join(', ') || '—';
    // cabeçalho
    doc.setFillColor(...LARANJA); doc.rect(0, 0, W, 17, 'F');
    doc.setTextColor(255); doc.setFont('helvetica', 'bolditalic'); doc.setFontSize(14);
    doc.text('CHECK-LIST DIÁRIO – 5S E TRATATIVA DE AVARIAS', 10, 11);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text('PremieRpet', W - 10, 11, { align: 'right' });
    doc.setTextColor(34, 27, 23); doc.setFontSize(10);
    const info = [['DATA', `${fmtD(de)} à ${fmtD(ate)}`], ['RUA', sl[0].ruaNome], ['TURNO', `${t} (${tc.inicio} às ${tc.fim})`], ['RESPONSÁVEL', responsavel]];
    let x = 10;
    info.forEach(([l, v]) => { doc.setFont('helvetica', 'normal'); doc.text(l + ':', x, 24); const lw = doc.getTextWidth(l + ':') + 1.5; doc.setFont('helvetica', 'bold'); const vv = doc.splitTextToSize(v, 95)[0]; doc.text(vv, x + lw, 24); x += lw + doc.getTextWidth(vv) + 10; });
    // tabela principal
    const head = [[{ content: 'Itens', rowSpan: 2, styles: { valign: 'middle', halign: 'left' } }, ...dias.map((s) => ({ content: `${DIAS_UP[dow(s.data)]} ${fmtDC(s.data)}`, colSpan: 2 }))],
      dias.flatMap(() => ['Colab.', 'Líder'])];
    const cel = (s, nome) => {
      if (!s.registro) return [s.status === 'nao_realizado' ? '—' : '', ''];
      const it = s.registro.itens.find((i) => i.nome === nome);
      const c = it ? { feito: 'OK', nao_feito: 'NÃO', na: 'N/A' }[it.valor] : '';
      const l = s.registro.status === 'validado' ? 'OK' : s.registro.status === 'reprovado' ? 'REP' : '';
      return [c, it ? l : ''];
    };
    const body = itens.map((nome) => [nome, ...dias.flatMap((s) => cel(s, nome))]);
    body.push([{ content: 'Situação', styles: { fontStyle: 'bold' } }, ...dias.map((s) => ({ content: ST[s.status], colSpan: 2, styles: { fontStyle: 'bold', fontSize: 7 } }))]);
    doc.autoTable({
      head, body, startY: 29, theme: 'grid', margin: { left: 10, right: 10 },
      styles: { fontSize: 8.5, halign: 'center', valign: 'middle', cellPadding: 1.6, lineColor: [210, 200, 192], lineWidth: 0.2 },
      headStyles: { fillColor: [34, 27, 23], textColor: 255, fontStyle: 'bold' },
      columnStyles: { 0: { halign: 'left', cellWidth: 52, fontStyle: 'italic' } },
      didParseCell: (h) => {
        if (h.section !== 'body') return;
        const v = h.cell.raw;
        if (v === 'OK') h.cell.styles.textColor = [21, 128, 61];
        if (v === 'NÃO' || v === 'REP' || v === 'Não realizado' || v === 'Reprovado – refazer') h.cell.styles.textColor = [200, 30, 30];
        if (v === 'N/A' || v === 'Sem operação') h.cell.styles.textColor = [130, 120, 112];
        if (h.column.index > 0 && h.column.index % 2 === 0) h.cell.styles.fillColor = [253, 246, 241];
      },
    });
    doc.setFontSize(7.5); doc.setFont('helvetica', 'italic'); doc.setTextColor(94, 83, 76);
    doc.text('Colab. = colaborador preenche (1ª coluna)  ·  Líder = responsável confere e assina (2ª coluna)  ·  OK = feito  ·  NÃO = não feito  ·  N/A = não se aplica  ·  REP = reprovado', 10, doc.lastAutoTable.finalY + 4);
    // observações
    const obs = dias.filter((s) => s.registro && (s.registro.obs || s.registro.lider?.comentario || s.registro.historico.some((h) => h.comentario)))
      .map((s) => [`${DIAS_UP[dow(s.data)]} ${fmtDC(s.data)}`, s.registro.obs || '', s.registro.historico.filter((h) => h.comentario).map((h) => `${h.tipo === 'reprovacao' ? 'Reprovado' : 'Validado'} por ${h.por}: ${h.comentario}`).join(' | ')]);
    doc.autoTable({
      head: [['Observações', 'Colaborador', 'Líder']], body: obs.length ? obs : [['—', 'Sem observações na semana', '']], startY: doc.lastAutoTable.finalY + 8, theme: 'grid', margin: { left: 10, right: 10 },
      styles: { fontSize: 8, cellPadding: 1.6, lineColor: [210, 200, 192], lineWidth: 0.2 },
      headStyles: { fillColor: LARANJA, textColor: 255 }, columnStyles: { 0: { cellWidth: 26, fontStyle: 'bold' } },
    });
    // assinaturas
    const ass = dias.filter((s) => s.registro).map((s) => {
      const a = s.registro.assinaturaColab, l = s.registro.lider;
      return [`${DIAS_UP[dow(s.data)]} ${fmtDC(s.data)}`, `${a.nome}${a.substituto ? ' (substituto)' : ''} – ${fmtDH(a.em)}`,
        l ? `${l.nome} – ${fmtDH(l.em)}${l.foraDoPrazo ? ' (fora do prazo)' : ''}` : 'Pendente', ST[s.status]];
    });
    doc.autoTable({
      head: [['Assinaturas eletrônicas', 'Colaborador', 'Líder', 'Situação']], body: ass.length ? ass : [['—', 'Nenhum check-list enviado', '', '']],
      startY: doc.lastAutoTable.finalY + 6, theme: 'grid', margin: { left: 10, right: 10 },
      styles: { fontSize: 8, cellPadding: 1.6, lineColor: [210, 200, 192], lineWidth: 0.2 },
      headStyles: { fillColor: LARANJA, textColor: 255 }, columnStyles: { 0: { cellWidth: 26, fontStyle: 'bold' } },
    });
  });
  const n = doc.getNumberOfPages();
  for (let p = 1; p <= n; p++) {
    doc.setPage(p); doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(141, 130, 122);
    doc.text(`Assinaturas eletrônicas registradas no sistema Check-list 5S (nome, data, hora e aparelho). Gerado em ${fmtDH(Date.now())} por ${S.user.nome}.`, 10, 204);
    doc.text(`Página ${p} de ${n}`, W - 10, 204, { align: 'right' });
  }
  const rua = ruaId ? '_' + (S.base.ruas.find((x) => x.id === ruaId)?.nome || '').replace(/\W+/g, '') : '';
  doc.save(`Checklist5S_${turno}${rua}_semana_${de}.pdf`);
}

async function gerarExcel(de, ate, turno, ruaId) {
  const r = await api('relatorio', { de, ate, turno, ruaId });
  const slots = r.slots.filter((s) => s.status !== 'futuro');
  if (!slots.length) throw new Error('Nada no período escolhido.');
  const itens = itensDe(slots, r.itensAtuais);
  const linhas = slots.map((s) => {
    const g = s.registro;
    const l = { Data: fmtD(s.data), Dia: DIAS[dow(s.data)], Turno: s.turno, Rua: s.ruaNome, 'Situação': ST[s.status],
      Colaborador: g ? g.colab.nome : '', Substituto: g ? (g.colab.substituto ? 'Sim' : 'Não') : '', 'Dono(s) da rua': s.donos.join(', ') };
    itens.forEach((n) => { const it = g?.itens.find((i) => i.nome === n); l[n] = it ? VAL[it.valor] : ''; });
    Object.assign(l, {
      'Observação': g?.obs || '', 'Assinado pelo colaborador em': g ? fmtDH(g.assinaturaColab.em) : '', Aparelho: g?.assinaturaColab.dispositivo || '',
      'Líder': g?.lider?.nome || '', 'Assinado pelo líder em': g?.lider ? fmtDH(g.lider.em) : '', 'Comentário do líder': g?.lider?.comentario || '',
      'Reprovações': g ? g.historico.filter((h) => h.tipo === 'reprovacao').length : '', 'Motivo sem operação': s.semOperacaoMotivo || '',
    });
    return l;
  });
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(linhas);
  ws['!autofilter'] = { ref: ws['!ref'] };
  ws['!cols'] = Object.keys(linhas[0]).map((k) => ({ wch: Math.min(40, Math.max(k.length + 2, ...linhas.slice(0, 200).map((l) => String(l[k]).length + 1))) }));
  XLSX.utils.book_append_sheet(wb, ws, 'Check-lists');
  const ruas = S.base.ruas.filter((x) => !ruaId || x.id === ruaId);
  const turnos = TURNOS.filter((t) => slots.some((s) => s.turno === t));
  const ad = [];
  ruas.forEach((ru) => turnos.forEach((t) => {
    const a = agg(slots.filter((s) => s.ruaId === ru.id && s.turno === t));
    ad.push({ Rua: ru.nome, Turno: t, Esperados: a.esp, Realizados: a.feitos, Validados: a.val, 'Não realizados': a.nr, 'Com reprovação': a.rep,
      '% Realizado': a.esp ? a.feitos / a.esp : '', '% Validado': a.esp ? a.val / a.esp : '' });
  }));
  const tot = agg(slots);
  ad.push({ Rua: 'TOTAL', Turno: turnos.join('/'), Esperados: tot.esp, Realizados: tot.feitos, Validados: tot.val, 'Não realizados': tot.nr, 'Com reprovação': tot.rep,
    '% Realizado': tot.esp ? tot.feitos / tot.esp : '', '% Validado': tot.esp ? tot.val / tot.esp : '' });
  const wa = XLSX.utils.json_to_sheet(ad);
  for (let i = 2; i <= ad.length + 1; i++) ['H', 'I'].forEach((c) => { if (wa[c + i] && wa[c + i].t === 'n') wa[c + i].z = '0%'; });
  wa['!cols'] = [{ wch: 18 }, { wch: 8 }, ...Array(7).fill({ wch: 14 })];
  wa['!autofilter'] = { ref: wa['!ref'] };
  XLSX.utils.book_append_sheet(wb, wa, 'Aderência');
  XLSX.writeFile(wb, `Checklist5S_${de}_a_${ate}.xlsx`);
}

// ---------- Substitutos ----------
async function tabSubstitutos() {
  const b = await api('base'); S.base = b;
  const pre = S.subPre || {}; S.subPre = null;
  const tAtual = pre.turno || b.andamento.find((a) => b.turnosDoUsuario.includes(a.turno))?.turno || b.turnosDoUsuario[0];
  const dAtual = pre.data || b.andamento.find((a) => a.turno === tAtual)?.data || b.hoje;
  const colabs = b.colaboradores.filter((c) => c.ativo !== false).sort((x, y) => x.nome.localeCompare(y.nome, 'pt'));
  const nomeRua = (id) => b.ruas.find((r) => r.id === id)?.nome || '—';
  const lista = b.substitutos.filter((s) => b.turnosDoUsuario.includes(s.turno)).sort((x, y) => (y.data + y.turno).localeCompare(x.data + x.turno));
  main().innerHTML = `
  <div class="sec-title"><h2>Substitutos temporários</h2></div>
  <div class="cols">
    <div class="card">
      <h3>Definir substituto</h3>
      <p class="small muted">Vale só para o dia e turno escolhidos e expira sozinho no fim do turno. O substituto entra com o próprio nome e verá a rua coberta.</p>
      <div class="row"><label class="f grow">Data<input type="date" id="sd" value="${dAtual}"></label>
      <label class="f grow">Turno<select id="st">${b.turnosDoUsuario.map((t) => `<option ${t === tAtual ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div>
      <label class="f">Rua<select id="sr"><option value="">Selecione…</option>${b.ruas.map((r) => `<option value="${r.id}" ${r.id === pre.ruaId ? 'selected' : ''}>${esc(r.nome)}</option>`).join('')}</select></label>
      <div class="tiny" id="sdono" style="margin:-6px 0 10px"></div>
      <label class="f">Substituto<select id="sc"><option value="">Selecione…</option>${colabs.map((c) => `<option value="${c.id}">${esc(c.nome)} (${c.turno})</option>`).join('')}</select></label>
      <button class="btn pri" id="sb">Definir substituto</button>
    </div>
    <div class="card">
      <h3 style="margin-bottom:8px">Substituições recentes</h3>
      ${lista.length ? `<table class="tbl"><thead><tr><th>Data</th><th>Rua</th><th>Substituto</th><th></th></tr></thead><tbody>${lista.map((s) => {
        const fim = janelaC(b.config.turnos, s.data, s.turno).fim;
        return `<tr><td>${fmtDC(s.data)} ${s.turno}${Date.now() > fim ? '<br><span class="tiny">encerrada</span>' : ''}</td><td><b>${esc(nomeRua(s.ruaId))}</b></td>
        <td>${esc(colabs.find((c) => c.id === s.colabId)?.nome || '—')}<div class="tiny">por ${esc(s.criadoPor)}</div></td>
        <td>${Date.now() < fim ? `<button class="btn sm" onclick="removerSub('${s.id}', this)">Remover</button>` : ''}</td></tr>`;
      }).join('')}</tbody></table>` : '<div class="empty">Nenhuma substituição recente.</div>'}
    </div>
  </div>`;
  const dono = () => {
    const rid = $('#sr').value, t = $('#st').value;
    const d = b.colaboradores.filter((c) => c.turno === t && (c.ruas || []).includes(rid)).map((c) => c.nome);
    $('#sdono').textContent = rid ? 'Dono(s) no ' + t + ': ' + (d.join(', ') || 'nenhum cadastrado') : '';
  };
  $('#sr').onchange = dono; $('#st').onchange = dono; dono();
  $('#sb').onclick = (e) => acao(e.target, async () => {
    if (!$('#sr').value || !$('#sc').value) throw new Error('Escolha a rua e o substituto.');
    await api('subCriar', { data: $('#sd').value, turno: $('#st').value, ruaId: $('#sr').value, colabId: $('#sc').value });
    toast('Substituto definido.'); tabSubstitutos();
  });
}
async function removerSub(id, btn) {
  if (!confirm('Remover esta substituição?')) return;
  acao(btn, async () => { await api('subRemover', { id }); toast('Substituição removida.'); tabSubstitutos(); });
}

// ---------- Cadastros ----------
async function tabCadastros(sub) {
  S.cadSub = sub || S.cadSub || 'donos';
  const b = await api('base'); S.base = b;
  main().innerHTML = `
  <div class="sec-title"><h2>Cadastros</h2></div>
  <div class="subtabs">${[['donos', 'Donos das ruas'], ['colab', 'Colaboradores'], ['ruas', 'Ruas'], ['import', 'Importar planilha']].map(([k, l]) => `<button class="${S.cadSub === k ? 'on' : ''}" onclick="tabCadastros('${k}')">${l}</button>`).join('')}</div>
  <div id="cad"></div>`;
  ({ donos: cadDonos, colab: cadColab, ruas: cadRuas, import: cadImport })[S.cadSub]();
}
function cadDonos() {
  const b = S.base;
  const ativos = b.colaboradores.filter((c) => c.ativo !== false).sort((x, y) => x.nome.localeCompare(y.nome, 'pt'));
  const donos = (rid, t) => ativos.filter((c) => c.turno === t && (c.ruas || []).includes(rid));
  const vazios = b.ruas.reduce((n, r) => n + TURNOS.filter((t) => !donos(r.id, t).length).length, 0);
  $('#cad').innerHTML = `
  <div class="card scroll-x" style="padding:8px 10px">
    <div class="row between" style="padding:6px 4px 10px"><span class="small muted">Escolha o responsável de cada rua em cada turno. Uma pessoa pode ter mais de uma rua, e uma rua pode ter mais de um responsável.</span>
      ${vazios ? `<span class="tag o">${vazios} rua/turno sem responsável</span>` : '<span class="st st-validado">Todas as ruas com responsável</span>'}</div>
    <table class="grid-tbl" style="table-layout:fixed;min-width:760px"><thead><tr><th style="width:90px">Rua</th>${TURNOS.map((t) => `<th>${t} <span style="text-transform:none;letter-spacing:0;font-weight:500">${b.config.turnos[t].inicio}–${b.config.turnos[t].fim}</span></th>`).join('')}</tr></thead>
    <tbody>${b.ruas.map((r) => `<tr><td class="rua">${esc(r.nome)}</td>${TURNOS.map((t) => {
      const ds = donos(r.id, t);
      return `<td>${ds.map((c) => `<span class="tag o" style="margin-bottom:4px">${esc(c.nome)} <a href="#" data-rm="${c.id}" data-r="${r.id}" data-t="${t}" title="Tirar" style="color:inherit;text-decoration:none;font-weight:800;margin-left:4px">×</a></span>`).join('<br>')}
        <select data-add data-r="${r.id}" data-t="${t}" style="min-height:36px;padding:6px 8px;margin-top:4px;font-size:.88rem"><option value="">${ds.length ? '+ adicionar outro' : '+ definir responsável'}</option>
        ${ativos.filter((c) => c.turno === t && !ds.includes(c)).map((c) => `<option value="${c.id}">${esc(c.nome)}${(c.ruas || []).length ? ' · já tem ' + c.ruas.map((x) => b.ruas.find((y) => y.id === x)?.nome).join(', ') : ''}</option>`).join('')}</select></td>`;
    }).join('')}</tr>`).join('')}</tbody></table>
  </div>`;
  const salvar = async (rid, t, ids) => {
    await api('definirDonos', { ruaId: rid, turno: t, colabIds: ids });
    S.base = await api('base'); cadDonos();
  };
  $$('#cad select[data-add]').forEach((sel) => (sel.onchange = () => {
    if (!sel.value) return;
    const { r, t } = sel.dataset;
    acao(sel, () => salvar(r, t, [...donos(r, t).map((c) => c.id), sel.value]).then(() => toast('Responsável definido.')));
  }));
  $$('#cad a[data-rm]').forEach((a) => (a.onclick = (e) => {
    e.preventDefault();
    const { r, t, rm } = a.dataset;
    acao(null, () => salvar(r, t, donos(r, t).map((c) => c.id).filter((x) => x !== rm)).then(() => toast('Responsável retirado.')));
  }));
}
function cadColab() {
  const b = S.base;
  const nomeRua = (id) => b.ruas.find((r) => r.id === id)?.nome;
  const pinta = () => {
    const q = norm($('#cq').value), t = $('#ct').value;
    const l = b.colaboradores.filter((c) => (!q || norm(c.nome).includes(q)) && (!t || c.turno === t)).sort((x, y) => x.nome.localeCompare(y.nome, 'pt'));
    $('#cl').innerHTML = l.length ? `<table class="tbl"><thead><tr><th>Nome</th><th>Turno</th><th>Ruas</th><th class="hide-sm">Situação</th><th></th></tr></thead><tbody>${l.map((c) => `
      <tr><td><b>${esc(c.nome)}</b></td><td>${c.turno}</td><td>${(c.ruas || []).map((r) => `<span class="tag o">${esc(nomeRua(r))}</span>`).join('') || '<span class="tiny">sem rua</span>'}</td>
      <td class="hide-sm">${c.ativo === false ? '<span class="tag">Inativo</span>' : 'Ativo'}</td><td><button class="btn sm" onclick="editColab('${c.id}')">Editar</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty">Nenhum colaborador.</div>';
  };
  const semDono = [];
  b.ruas.forEach((r) => TURNOS.forEach((t) => { if (!b.colaboradores.some((c) => c.ativo !== false && c.turno === t && (c.ruas || []).includes(r.id))) semDono.push(`${r.nome} ${t}`); }));
  $('#cad').innerHTML = `
  <div class="card">
    <div class="row" style="margin-bottom:12px"><input type="search" id="cq" placeholder="Buscar nome…" class="grow" style="flex:1;min-width:180px">
      <select id="ct" style="width:auto"><option value="">Todos os turnos</option>${TURNOS.map((t) => `<option>${t}</option>`).join('')}</select>
      <button class="btn pri" onclick="editColab()">+ Novo colaborador</button></div>
    ${semDono.length ? `<details class="alert small" style="margin-bottom:12px"><summary style="cursor:pointer"><b>${semDono.length} rua/turno sem dono</b> (toque para ver)</summary>${semDono.join(' · ')}</details>` : ''}
    <div id="cl" class="scroll-x"></div>
  </div>`;
  $('#cq').oninput = pinta; $('#ct').onchange = pinta; pinta();
}
function editColab(id) {
  const b = S.base;
  const c = b.colaboradores.find((x) => x.id === id) || { nome: '', turno: 'T1', ruas: [], ativo: true };
  modal(`<button class="x" onclick="fecharModal()">×</button><h3>${id ? 'Editar' : 'Novo'} colaborador</h3><div style="height:12px"></div>
    <label class="f">Nome completo (é a chave de acesso)<input type="text" id="en" value="${esc(c.nome)}"></label>
    <label class="f">Turno<select id="et">${TURNOS.map((t) => `<option ${t === c.turno ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <div class="f">Rua(s) que é dono${pills('eru', b.ruas.map((r) => [r.id, r.nome]), c.ruas || [])}</div>
    <label class="chk" style="margin:10px 0 16px"><input type="checkbox" id="ea" ${c.ativo !== false ? 'checked' : ''}>Ativo (aparece na lista de nomes)</label>
    <div class="row between">${id ? `<button class="btn bad" id="ex">Excluir</button>` : '<span></span>'}<button class="btn pri" id="es">Salvar</button></div>`);
  $('#es').onclick = (e) => acao(e.target, async () => {
    await api('salvarColab', { colaborador: { id, nome: $('#en').value, turno: $('#et').value, ruas: vals('eru'), ativo: $('#ea').checked } });
    fecharModal(); toast('Colaborador salvo.'); tabCadastros('colab');
  });
  if (id) $('#ex').onclick = (e) => { if (confirm(`Excluir ${c.nome}? O histórico dele continua guardado.`)) acao(e.target, async () => { await api('removerColab', { id }); fecharModal(); toast('Excluído.'); tabCadastros('colab'); }); };
}
function cadRuas() {
  const rs = S.base.ruas.map((r) => ({ ...r }));
  const pinta = () => {
    $('#rl').innerHTML = rs.map((r, i) => `<div class="ed-row"><span class="ix">${i + 1}</span><input type="text" value="${esc(r.nome)}" data-i="${i}">
      <button class="icon-btn" data-up="${i}" title="Subir">↑</button><button class="icon-btn" data-rm="${i}" title="Remover">✕</button></div>`).join('');
  };
  $('#cad').innerHTML = `<div class="card" style="max-width:620px">
    <p class="small muted" style="margin-top:0">Remover uma rua não apaga o histórico dela.</p>
    <div id="rl"></div>
    <div class="row" style="margin-top:12px"><button class="btn" id="ra">+ Adicionar rua</button><span class="grow"></span><button class="btn pri" id="rs">Salvar ruas</button></div></div>`;
  pinta();
  $('#rl').oninput = (e) => { if (e.target.dataset.i) rs[e.target.dataset.i].nome = e.target.value; };
  $('#rl').onclick = (e) => {
    const up = e.target.dataset.up, rm = e.target.dataset.rm;
    if (up > 0) { [rs[up - 1], rs[up]] = [rs[up], rs[up - 1]]; pinta(); }
    if (rm !== undefined) {
      const usados = S.base.colaboradores.filter((c) => (c.ruas || []).includes(rs[rm].id)).length;
      if (!usados || confirm(`${rs[rm].nome} tem ${usados} dono(s) vinculado(s). Remover mesmo assim?`)) { rs.splice(rm, 1); pinta(); }
    }
  };
  $('#ra').onclick = () => { rs.push({ nome: '' }); pinta(); $$('#rl input').pop().focus(); };
  $('#rs').onclick = (e) => acao(e.target, async () => { await api('salvarRuas', { ruas: rs }); toast('Ruas salvas.'); tabCadastros('ruas'); });
}
function cadImport() {
  $('#cad').innerHTML = `<div class="cols">
    <div class="card"><h3>1. Baixe o modelo</h3>
      <p class="small muted">A planilha tem três abas: <b>Ruas</b>, <b>Colaboradores</b> e <b>Usuarios</b> (líderes e acessos). Já vem com o que está cadastrado hoje.</p>
      <button class="btn" id="im">Baixar modelo (.xlsx)</button></div>
    <div class="card"><h3>2. Envie a planilha preenchida</h3>
      <p class="small muted">Nomes que já existem são atualizados; os novos são incluídos. Ruas citadas que não existem são criadas.</p>
      <input type="file" id="if" accept=".xlsx,.xls,.csv">
      <div id="ip" style="margin-top:12px"></div></div>
  </div>`;
  $('#im').onclick = async () => { try { S.usuariosCache = (await api('usuarios')).usuarios; } catch { S.usuariosCache = []; } baixarModelo(); };
  $('#if').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const wb = XLSX.read(await f.arrayBuffer());
      const aba = (k) => wb.SheetNames.find((n) => norm(n).includes(k));
      const rows = (k) => (aba(k) ? XLSX.utils.sheet_to_json(wb.Sheets[aba(k)], { defval: '' }) : []);
      const pega = (row, ...ks) => { const key = Object.keys(row).find((h) => ks.some((k) => norm(h).includes(k))); return key ? String(row[key]).trim() : ''; };
      const dados = {
        ruas: rows('rua').map((r) => pega(r, 'rua', 'nome')).filter(Boolean),
        colaboradores: rows('colab').map((r) => ({ nome: pega(r, 'nome'), turno: pega(r, 'turno'), ruas: pega(r, 'rua') })).filter((r) => r.nome),
        usuarios: rows('usu').map((r) => ({ nome: pega(r, 'nome'), usuario: pega(r, 'usuario'), perfil: pega(r, 'perfil'), turnos: pega(r, 'turno'), senha: pega(r, 'senha') })).filter((r) => r.usuario),
      };
      $('#ip').innerHTML = `<div class="sigbox"><b>Encontrado na planilha</b>${dados.ruas.length} ruas · ${dados.colaboradores.length} colaboradores · ${dados.usuarios.length} usuários</div>
        <button class="btn pri" id="ig" style="margin-top:10px">3. Importar</button>`;
      $('#ig').onclick = (ev) => acao(ev.target, async () => {
        const r = await api('importar', dados);
        $('#ip').innerHTML = `<div class="alert info"><b>Importação concluída.</b><br>Ruas novas: ${r.ruasNovas} · Colaboradores novos: ${r.colabsNovos}, atualizados: ${r.colabsAtualizados} · Usuários novos: ${r.usuariosNovos}, atualizados: ${r.usuariosAtualizados}</div>
          ${r.erros.length ? `<div class="alert bad small" style="margin-top:8px"><b>Linhas ignoradas:</b><br>${r.erros.map(esc).join('<br>')}</div>` : ''}`;
        S.base = await api('base');
      });
    } catch (err) { toast('Não consegui ler a planilha: ' + err.message, true); }
  };
}
function baixarModelo() {
  const b = S.base;
  const nomeRua = (id) => b.ruas.find((r) => r.id === id)?.nome;
  const wb = XLSX.utils.book_new();
  const inst = [['MODELO DE IMPORTAÇÃO – CHECK-LIST 5S'], [''],
    ['Aba Ruas: uma rua por linha, como aparece na operação.'],
    ['Aba Colaboradores: nome completo (é a chave de acesso), turno (T1, T2 ou T3) e as ruas separadas por ponto e vírgula. Ex.: Rua 01; Rua 02'],
    ['Aba Usuarios: líderes e demais acessos. Perfil: Coordenador, Líder ou Visualizador. Turnos: T1; T2 ou TODOS. Senha inicial com no mínimo 6 caracteres (em branco mantém a senha de quem já existe).'],
    [''], ['Quem já existe (mesmo nome / mesmo usuário) é atualizado. Ninguém é excluído pela importação.'],
    [''], ['EXEMPLOS (não digite nesta aba – preencha nas abas de dados):'],
    ['Colaboradores → Maria Aparecida Souza | T1 | Rua 01; Rua 02'],
    ['Usuarios → Sandra Lima | sandra.lima | Líder | T1 | trocar123'],
    ['Usuarios → Gerente do CD | gerente | Visualizador | TODOS | trocar123']];
  const wi = XLSX.utils.aoa_to_sheet(inst); wi['!cols'] = [{ wch: 130 }];
  XLSX.utils.book_append_sheet(wb, wi, 'Instruções');
  const wr = XLSX.utils.aoa_to_sheet([['Rua'], ...b.ruas.map((r) => [r.nome])]); wr['!cols'] = [{ wch: 24 }];
  XLSX.utils.book_append_sheet(wb, wr, 'Ruas');
  const cs = b.colaboradores.map((c) => [c.nome, c.turno, (c.ruas || []).map(nomeRua).join('; ')]);
  const wc = XLSX.utils.aoa_to_sheet([['Nome completo', 'Turno', 'Ruas'], ...cs]); wc['!cols'] = [{ wch: 40 }, { wch: 8 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, wc, 'Colaboradores');
  const us = (S.usuariosCache || []).filter((u) => u.perfil !== 'coordenador').map((u) => [u.nome, u.usuario, PERFIL[u.perfil] === 'Visualização' ? 'Visualizador' : PERFIL[u.perfil], u.turnos.length ? u.turnos.join('; ') : 'TODOS', '']);
  const wu = XLSX.utils.aoa_to_sheet([['Nome', 'Usuário', 'Perfil', 'Turnos', 'Senha inicial'], ...us]);
  wu['!cols'] = [{ wch: 32 }, { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wu, 'Usuarios');
  XLSX.writeFile(wb, 'Modelo_importacao_Checklist5S.xlsx');
}

// ---------- Configurações ----------
async function tabConfig(sub) {
  S.cfgSub = sub || S.cfgSub || 'itens';
  const b = await api('base'); S.base = b;
  main().innerHTML = `
  <div class="sec-title"><h2>Configurações</h2></div>
  <div class="subtabs">${[['itens', 'Itens do check-list'], ['turnos', 'Turnos e escala'], ['semop', 'Dias sem operação']].map(([k, l]) => `<button class="${S.cfgSub === k ? 'on' : ''}" onclick="tabConfig('${k}')">${l}</button>`).join('')}</div>
  <div id="cfg"></div>`;
  ({ itens: cfgItens, turnos: cfgTurnos, semop: cfgSemOp })[S.cfgSub]();
}
function cfgItens() {
  const it = S.base.config.itens.map((x) => ({ ...x }));
  const pinta = () => {
    $('#il').innerHTML = it.map((x, i) => `<div class="ed-row"><span class="ix">${i + 1}</span><input type="text" value="${esc(x.nome)}" data-i="${i}">
      <button class="icon-btn" data-up="${i}">↑</button><button class="icon-btn" data-rm="${i}">✕</button></div>`).join('');
  };
  $('#cfg').innerHTML = `<div class="card" style="max-width:640px">
    <div class="alert info small" style="margin-bottom:12px">As mudanças valem a partir do próximo check-list. Os check-lists já feitos ficam como foram preenchidos. Todo item tem as opções Feito, Não feito e N/A.</div>
    <div id="il"></div>
    <div class="row" style="margin-top:12px"><button class="btn" id="ia">+ Adicionar item</button><span class="grow"></span><button class="btn pri" id="is">Salvar itens</button></div></div>`;
  pinta();
  $('#il').oninput = (e) => { if (e.target.dataset.i) it[e.target.dataset.i].nome = e.target.value; };
  $('#il').onclick = (e) => {
    const up = e.target.dataset.up, rm = e.target.dataset.rm;
    if (up > 0) { [it[up - 1], it[up]] = [it[up], it[up - 1]]; pinta(); }
    if (rm !== undefined && confirm(`Remover o item "${it[rm].nome}"?`)) { it.splice(rm, 1); pinta(); }
  };
  $('#ia').onclick = () => { it.push({ nome: '' }); pinta(); $$('#il input').pop().focus(); };
  $('#is').onclick = (e) => acao(e.target, async () => { await api('salvarConfig', { itens: it }); toast('Itens salvos.'); tabConfig('itens'); });
}
function cfgTurnos() {
  const tc = S.base.config.turnos;
  $('#cfg').innerHTML = `<div class="cols">${TURNOS.map((t) => `<div class="card" data-t="${t}">
    <h3>${t}</h3>
    <div class="row" style="margin-top:10px"><label class="f grow">Início<input type="time" class="ti" value="${tc[t].inicio}"></label><label class="f grow">Fim<input type="time" class="tf" value="${tc[t].fim}"></label></div>
    <div class="f">Dias de operação${pills('d' + t, DIAS.map((d, i) => [String(i), d]), tc[t].dias.map(String))}</div>
    <div class="tiny">Se o fim é menor que o início, o turno vira a noite e conta na data de início.</div></div>`).join('')}</div>
    <div class="row" style="margin-top:14px"><span class="grow small muted">Para a escala 5x2, basta desmarcar os dias de folga do turno.</span><button class="btn pri" id="tsv">Salvar turnos</button></div>`;
  $('#tsv').onclick = (e) => acao(e.target, async () => {
    const turnos = {};
    $$('#cfg [data-t]').forEach((c) => { const t = c.dataset.t; turnos[t] = { inicio: $('.ti', c).value, fim: $('.tf', c).value, dias: vals('d' + t, c).map(Number) }; });
    await api('salvarConfig', { turnos }); toast('Turnos salvos.'); tabConfig('turnos');
  });
}
function cfgSemOp() {
  const so = [...(S.base.config.semOperacao || [])].sort((a, b) => b.data.localeCompare(a.data));
  $('#cfg').innerHTML = `<div class="cols">
    <div class="card"><h3>Adicionar dia sem operação</h3>
      <p class="small muted">Feriados ou paradas. Nesses dias as ruas não aparecem como “não realizado”.</p>
      <label class="f">Data<input type="date" id="sod" value="${hoje()}"></label>
      <div class="f">Turnos afetados <span class="tiny">(nenhum marcado = todos)</span>${pills('sot', TURNOS.map((t) => [t, t]), [])}</div>
      <label class="f">Motivo<input type="text" id="som" placeholder="Ex.: Feriado – Finados"></label>
      <button class="btn pri" id="soa">Adicionar</button></div>
    <div class="card"><h3 style="margin-bottom:8px">Cadastrados</h3>
      ${so.length ? `<table class="tbl"><tbody>${so.map((s, i) => `<tr><td><b>${DIAS[dow(s.data)]} ${fmtD(s.data)}</b><div class="tiny">${s.turnos.length ? s.turnos.join(', ') : 'Todos os turnos'}</div></td><td>${esc(s.motivo)}</td><td><button class="btn sm" data-rm="${i}">Remover</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty">Nenhum dia cadastrado.</div>'}
    </div></div>`;
  const salvar = async (lista) => { await api('salvarConfig', { semOperacao: lista }); tabConfig('semop'); };
  $('#soa').onclick = (e) => acao(e.target, async () => {
    if (!$('#sod').value) throw new Error('Informe a data.');
    await salvar([...so, { data: $('#sod').value, turnos: vals('sot'), motivo: $('#som').value }]); toast('Dia adicionado.');
  });
  $$('#cfg [data-rm]').forEach((bt) => (bt.onclick = (e) => acao(e.target, () => salvar(so.filter((_, i) => i !== Number(bt.dataset.rm))))));
}

// ---------- Usuários ----------
async function tabUsuarios() {
  const { usuarios } = await api('usuarios');
  S.usuarios = usuarios;
  main().innerHTML = `
  <div class="sec-title"><h2>Usuários e acessos</h2><button class="btn pri" onclick="editUsuario()">+ Novo acesso</button></div>
  <div class="card scroll-x"><table class="tbl"><thead><tr><th>Nome</th><th>Usuário</th><th>Perfil</th><th>Turnos</th><th></th></tr></thead>
  <tbody>${usuarios.map((u) => `<tr><td><b>${esc(u.nome)}</b>${u.id === S.user.id ? ' <span class="tag">você</span>' : ''}</td><td>${esc(u.usuario)}</td>
    <td>${PERFIL[u.perfil]}</td><td>${u.perfil === 'coordenador' || !u.turnos.length ? 'Todos' : u.turnos.join(', ')}</td>
    <td><button class="btn sm" onclick="editUsuario('${u.id}')">Editar</button></td></tr>`).join('')}</tbody></table></div>
  <p class="tiny" style="margin-top:10px">Colaboradores (donos de rua) não precisam de usuário: eles entram só com o nome, cadastrado em Cadastros.</p>`;
}
function editUsuario(id) {
  const u = S.usuarios.find((x) => x.id === id) || { nome: '', usuario: '', perfil: 'lider', turnos: [] };
  modal(`<button class="x" onclick="fecharModal()">×</button><h3>${id ? 'Editar' : 'Novo'} acesso</h3><div style="height:12px"></div>
    <label class="f">Nome<input type="text" id="un" value="${esc(u.nome)}"></label>
    <label class="f">Usuário (login)<input type="text" id="uu" value="${esc(u.usuario)}" autocapitalize="off"></label>
    <label class="f">Perfil<select id="up">${Object.keys(PERFIL).map((p) => `<option value="${p}" ${p === u.perfil ? 'selected' : ''}>${PERFIL_DESC[p]}</option>`).join('')}</select></label>
    <div class="f" id="utw">Turnos <span class="tiny">(nenhum marcado = todos os turnos)</span>${pills('ut', TURNOS.map((t) => [t, t]), u.turnos)}</div>
    <label class="f">${id ? 'Nova senha <span class="tiny">(em branco mantém a atual)</span>' : 'Senha inicial (mínimo 6 caracteres)'}<input type="password" id="us"></label>
    <div class="row between">${id && id !== S.user.id ? '<button class="btn bad" id="ux">Remover acesso</button>' : '<span></span>'}<button class="btn pri" id="usv">Salvar</button></div>`);
  const tg = () => $('#utw').classList.toggle('hide', $('#up').value === 'coordenador');
  $('#up').onchange = tg; tg();
  $('#usv').onclick = (e) => acao(e.target, async () => {
    await api('salvarUsuario', { usuario: { id, nome: $('#un').value, usuario: $('#uu').value, perfil: $('#up').value, turnos: $('#up').value === 'coordenador' ? [] : vals('ut'), senha: $('#us').value } });
    fecharModal(); toast('Acesso salvo.'); tabUsuarios();
  });
  if ($('#ux')) $('#ux').onclick = (e) => { if (confirm(`Remover o acesso de ${u.nome}?`)) acao(e.target, async () => { await api('removerUsuario', { id }); fecharModal(); toast('Acesso removido.'); tabUsuarios(); }); };
}

// ====================== início ======================
(async () => {
  if (S.token) {
    try { S.user = (await api('eu')).usuario; return telaGestao(); } catch { sairLocal(); }
  }
  telaInicio();
})();
