function verificarAuth(req) {
  const SENHA = process.env.DASHBOARD_PASSWORD;
  if (!SENHA) return true;
  const esperado = Buffer.from(`${SENHA}:agencia8x-dashboard`).toString('base64');
  const enviado  = req.headers['x-dashboard-token'] || req.query.auth || '';
  return enviado === esperado;
}

async function githubGet(repo, path, ghToken) {
  const r = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
    headers: { Authorization: `Bearer ${ghToken}`, Accept: 'application/vnd.github.v3+json', 'User-Agent': 'agencia8x' }
  });
  return r.ok ? r.json() : null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).end();
  if (!verificarAuth(req)) return res.status(401).json({ error: 'Não autorizado' });

  const { image_urls, caption, quando } = req.body || {};
  if (!image_urls?.length) return res.status(400).json({ error: 'image_urls obrigatório' });
  if (!caption?.trim())    return res.status(400).json({ error: 'caption obrigatório' });
  if (!quando)             return res.status(400).json({ error: 'quando obrigatório (YYYY-MM-DD HH:MM)' });

  const GH   = process.env.GITHUB_TOKEN;
  const REPO = 'scarloseduardopereira-star/agencia8x-instagram';
  if (!GH) return res.status(500).json({ error: 'GITHUB_TOKEN não configurado' });

  try {
    // Ler pendentes.json atual
    const file = await githubGet(REPO, 'pendentes.json', GH);
    let posts = [];
    let sha;
    if (file?.content) {
      posts = JSON.parse(Buffer.from(file.content, 'base64').toString('utf-8'));
      sha   = file.sha;
    }

    const novoPost = {
      quando,
      image_urls,
      caption,
      status:     'pendente',
      criado_em:  new Date().toISOString().slice(0, 16).replace('T', ' '),
    };
    posts.push(novoPost);
    posts.sort((a, b) => a.quando.localeCompare(b.quando));

    // Salvar de volta no GitHub
    const body = {
      message: `agendamento: novo post para ${quando}`,
      content: Buffer.from(JSON.stringify(posts, null, 2)).toString('base64'),
      ...(sha ? { sha } : {}),
    };
    const r2 = await fetch(`https://api.github.com/repos/${REPO}/contents/pendentes.json`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${GH}`, Accept: 'application/vnd.github.v3+json', 'User-Agent': 'agencia8x', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d2 = await r2.json();
    if (!d2.content) return res.status(500).json({ error: `GitHub: ${JSON.stringify(d2)}` });

    return res.status(200).json({ ok: true, quando, total: posts.length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
