// Camada de dados: Upstash Redis (REST) em produção, arquivo local em desenvolvimento.
const fs = require('fs');
const path = require('path');

// Aceita as variáveis com ou sem prefixo (ex.: PAINEL_LOGISTICA_KV_REST_API_URL),
// que a Vercel cria quando um banco já existente é conectado a outro projeto.
function acharEnv() {
  const E = process.env;
  for (const [u, t] of [['KV_REST_API_URL', 'KV_REST_API_TOKEN'], ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']]) {
    if (E[u] && E[t]) return [E[u], E[t]];
    for (const k of Object.keys(E)) {
      if (k.endsWith('_' + u)) {
        const tk = k.slice(0, -u.length) + t;
        if (E[tk]) return [E[k], E[tk]];
      }
    }
  }
  return [null, null];
}
const [URL_, TOKEN] = acharEnv();

async function upstash(body, pipeline) {
  if (!/^https:\/\//.test(URL_)) { const e = new Error('UPSTASH_REDIS_REST_URL inválida: deve começar com https:// (use a "REST URL" do Upstash, não a redis://).'); e.status = 503; throw e; }
  const r = await fetch(URL_ + (pipeline ? '/pipeline' : ''), {
    signal: AbortSignal.timeout(8000),
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch((err) => { const e = new Error('Não consegui falar com o banco de dados (' + err.message + '). Confira UPSTASH_REDIS_REST_URL na Vercel.'); e.status = 503; throw e; });
  let j;
  try { j = await r.json(); } catch { j = {}; }
  if (!r.ok || (!pipeline && j.error && /auth|pass|token|permission/i.test(j.error))) {
    const e = new Error(`O banco de dados recusou a conexão (${r.status}${j.error ? ': ' + j.error : ''}). Na Vercel, confira se UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN são do MESMO banco e faça Redeploy.`);
    e.status = 503; throw e;
  }
  if (pipeline) return j.map((x) => { if (x.error) throw new Error(x.error); return x.result; });
  if (j.error) throw new Error(j.error);
  return j.result;
}

// ---------- fallback local (somente desenvolvimento) ----------
const DEV_FILE = path.join(process.cwd(), '.devdb.json');
let mem = null;
function load() {
  if (mem) return mem;
  try { mem = JSON.parse(fs.readFileSync(DEV_FILE, 'utf8')); } catch { mem = {}; }
  return mem;
}
function save() { try { fs.writeFileSync(DEV_FILE, JSON.stringify(mem)); } catch {} }
function alive(k) {
  const e = load()[k];
  if (!e) return null;
  if (e.exp && e.exp < Date.now()) { delete mem[k]; return null; }
  return e;
}
function memCmd(args) {
  const [c, k, ...a] = args;
  const C = String(c).toUpperCase();
  load();
  switch (C) {
    case 'GET': { const e = alive(k); return e ? e.v : null; }
    case 'SET': {
      const e = { v: a[0] };
      const i = a.findIndex((x) => String(x).toUpperCase() === 'EX');
      if (i >= 0) e.exp = Date.now() + Number(a[i + 1]) * 1000;
      mem[k] = e; save(); return 'OK';
    }
    case 'DEL': { delete mem[k]; save(); return 1; }
    case 'EXPIRE': { const e = alive(k); if (e) { e.exp = Date.now() + Number(a[0]) * 1000; save(); } return e ? 1 : 0; }
    case 'HSET': {
      let e = alive(k); if (!e) { e = { v: {} }; mem[k] = e; }
      for (let i = 0; i < a.length; i += 2) e.v[a[i]] = a[i + 1];
      save(); return 1;
    }
    case 'HGET': { const e = alive(k); return e ? (e.v[a[0]] ?? null) : null; }
    case 'HGETALL': {
      const e = alive(k); if (!e) return [];
      return Object.entries(e.v).flat();
    }
    default: throw new Error('cmd não suportado: ' + C);
  }
}

const usaRedis = !!(URL_ && TOKEN);
// Na Vercel sem banco, a memória não é compartilhada entre acessos: nada ficaria salvo.
const semBancoEmProducao = !usaRedis && !!process.env.VERCEL;

async function cmd(...args) {
  return usaRedis ? upstash(args.map(String)) : memCmd(args);
}
async function pipeline(cmds) {
  if (!cmds.length) return [];
  return usaRedis ? upstash(cmds.map((c) => c.map(String)), true) : cmds.map(memCmd);
}

function pairs(arr) {
  const o = {};
  if (!arr) return o;
  if (!Array.isArray(arr)) return arr;
  for (let i = 0; i < arr.length; i += 2) o[arr[i]] = arr[i + 1];
  return o;
}

module.exports = {
  usaRedis,
  semBancoEmProducao,
  async getJSON(k, def) { const v = await cmd('GET', k); return v ? JSON.parse(v) : def; },
  async setJSON(k, val, exSeg) {
    return exSeg ? cmd('SET', k, JSON.stringify(val), 'EX', exSeg) : cmd('SET', k, JSON.stringify(val));
  },
  del: (k) => cmd('DEL', k),
  async hgetJSON(k, f) { const v = await cmd('HGET', k, f); return v ? JSON.parse(v) : null; },
  async hsetJSON(k, f, val, exSeg) {
    await cmd('HSET', k, f, JSON.stringify(val));
    if (exSeg) await cmd('EXPIRE', k, exSeg);
  },
  // lê vários hashes de uma vez (um por dia)
  async hgetallMany(keys) {
    const res = await pipeline(keys.map((k) => ['HGETALL', k]));
    return res.map((r) => {
      const o = pairs(r);
      for (const f in o) o[f] = JSON.parse(o[f]);
      return o;
    });
  },
};
