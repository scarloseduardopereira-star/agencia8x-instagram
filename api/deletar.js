function verificarAuth(req) {
  const SENHA = process.env.DASHBOARD_PASSWORD;
  if (!SENHA) return true;
  const esperado = Buffer.from(`${SENHA}:agencia8x-dashboard`).toString('base64');
  const enviado  = req.headers['x-dashboard-token'] || req.query.auth || '';
  return enviado === esperado;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).end();
  if (!verificarAuth(req)) return res.status(401).json({ error: 'Não autorizado' });

  const { index } = req.body || {};
  if (index === undefined) return res.status(400).json({ error: 'index obrigatório' });

  const GH   = process.env.GITHUB_TOKEN;
  const REPO = 'scarloseduardopereira-star/agencia8x-instagram';
  if (!GH) return res.status(500).json({ error: 'GITHUB_TOKEN não configurado' });

  try {
    const fileRes = await fetch(`https://api.github.com/repos/${REPO}/contents/pendentes.json`, {
      headers: { Authorization: `Bearer ${GH}`, Accept: 'application/vnd.github.v3+json', 'User-Agent': 'agencia8x' }
    });
    if (!fileRes.ok) return res.status(500).json({ error: 'Erro ao ler pendentes.json' });

    const file  = await fileRes.json();
    const posts = JSON.parse(Buffer.from(file.content, 'base64').toString('utf-8'));

    if (index < 0 || index >= posts.length)
      return res.status(400).json({ error: `Index ${index} inválido (total: ${posts.length})` });

    const removido = posts.splice(index, 1)[0];

    const putRes = await fetch(`https://api.github.com/repos/${REPO}/contents/pendentes.json`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${GH}`, Accept: 'application/vnd.github.v3+json', 'User-Agent': 'agencia8x', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `dashboard: removeu post agendado (${removido.quando})`,
        content: Buffer.from(JSON.stringify(posts, null, 2)).toString('base64'),
        sha: file.sha,
      }),
    });
    if (!putRes.ok) return res.status(500).json({ error: 'Erro ao salvar no GitHub' });

    return res.status(200).json({ ok: true, removido: removido.quando });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
