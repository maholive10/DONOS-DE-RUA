const { handle, status } = require('../lib/regras');
const db = require('../lib/store');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  // Abrir /api no navegador mostra se o app está ligado ao banco
  if (req.method === 'GET') {
    if (db.semBancoEmProducao) return res.status(503).json({ app: 'ok', banco: 'NÃO CONECTADO – crie UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN na Vercel e faça Redeploy' });
    try { return res.status(200).json(await status()); } catch (e) { return res.status(e.status || 500).json({ app: 'ok', banco: 'ERRO', detalhe: e.message }); }
  }
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Use POST' });
  try {
    let body = req.body;
    if (typeof body === 'string') body = JSON.parse(body || '{}');
    const out = await handle(body || {});
    res.status(200).json(out);
  } catch (e) {
    const status = e.status || 500;
    if (status === 500) console.error(e);
    res.status(status).json({ erro: status === 500 ? 'Erro interno. Tente novamente.' : e.message });
  }
};
