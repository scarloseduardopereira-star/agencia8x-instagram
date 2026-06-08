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

  const { image_urls, caption } = req.body || {};
  if (!image_urls?.length) return res.status(400).json({ error: 'image_urls obrigatório' });
  if (!caption?.trim())    return res.status(400).json({ error: 'caption obrigatório' });

  const GH   = process.env.GITHUB_TOKEN;
  const REPO = 'scarloseduardopereira-star/agencia8x-instagram';
  if (!GH) return res.status(500).json({ error: 'GITHUB_TOKEN não configurado' });

  // Horário BRT (UTC-3) 2 minutos atrás para garantir que o Action publique
  const agora = new Date(Date.now() - 3 * 60 * 60 * 1000 - 2 * 60 * 1000);
  const quando = agora.toISOString().slice(0, 16).replace('T', ' ');

  try {
    // 1. Ler pendentes.json
    const fileRes = await fetch(`https://api.github.com/repos/${REPO}/contents/pendentes.json`, {
      headers: { Authorization: `Bearer ${GH}`, Accept: 'application/vnd.github.v3+json', 'User-Agent': 'agencia8x' }
    });
    let posts = [], sha;
    if (fileRes.ok) {
      const f = await fileRes.json();
      posts = JSON.parse(Buffer.from(f.content, 'base64').toString('utf-8'));
      sha   = f.sha;
    }

    // 2. Adicionar post com data no passado
    posts.push({ quando, image_urls, caption, status: 'pendente', criado_em: quando });

    // 3. Salvar no GitHub
    const putRes = await fetch(`https://api.github.com/repos/${REPO}/contents/pendentes.json`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${GH}`, Accept: 'application/vnd.github.v3+json', 'User-Agent': 'agencia8x', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'bot: publicar agora',
        content: Buffer.from(JSON.stringify(posts, null, 2)).toString('base64'),
        ...(sha ? { sha } : {}),
      }),
    });
    if (!putRes.ok) {
      const err = await putRes.json();
      return res.status(500).json({ error: `GitHub save: ${JSON.stringify(err)}` });
    }

    // 4. Disparar workflow_dispatch
    const dispatchRes = await fetch(
      `https://api.github.com/repos/${REPO}/actions/workflows/publicar.yml/dispatches`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${GH}`, Accept: 'application/vnd.github.v3+json', 'User-Agent': 'agencia8x', 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: 'main' }),
      }
    );

    const dispatched = dispatchRes.status === 204;
    return res.status(200).json({
      ok: true,
      quando,
      dispatched,
      msg: dispatched
        ? 'Post adicionado e workflow disparado — publicação em ~1 minuto'
        : 'Post adicionado (workflow_dispatch falhou — publicará no próximo ciclo de 5 min)',
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
