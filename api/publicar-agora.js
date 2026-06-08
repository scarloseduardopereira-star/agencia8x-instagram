export const config = { maxDuration: 60 };

function verificarAuth(req) {
  const SENHA = process.env.DASHBOARD_PASSWORD;
  if (!SENHA) return true;
  const esperado = Buffer.from(`${SENHA}:agencia8x-dashboard`).toString('base64');
  const enviado  = req.headers['x-dashboard-token'] || req.query.auth || '';
  return enviado === esperado;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).end();
  if (!verificarAuth(req)) return res.status(401).json({ error: 'Não autorizado' });

  const { image_urls, caption, post_index } = req.body || {};
  if (!image_urls?.length) return res.status(400).json({ error: 'image_urls obrigatório' });
  if (!caption?.trim())    return res.status(400).json({ error: 'caption obrigatório' });

  const TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN;
  const IG_ID = process.env.INSTAGRAM_BUSINESS_ID;
  const GH    = process.env.GITHUB_TOKEN;
  const REPO  = 'scarloseduardopereira-star/agencia8x-instagram';
  const API   = `https://graph.facebook.com/${process.env.META_API_VERSION || 'v19.0'}`;

  if (!TOKEN || !IG_ID) return res.status(500).json({ error: 'Credenciais Instagram não configuradas' });

  try {
    // 1. Criar containers (em paralelo)
    const containerPromises = image_urls.map(url =>
      fetch(`${API}/${IG_ID}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ access_token: TOKEN, image_url: url, is_carousel_item: 'true' }),
      }).then(r => r.json()).then(d => {
        if (!d.id) throw new Error(`Container falhou: ${JSON.stringify(d)}`);
        return d.id;
      })
    );
    const containerIds = await Promise.all(containerPromises);

    // 2. Criar carrossel
    const carRes = await fetch(`${API}/${IG_ID}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ access_token: TOKEN, media_type: 'CAROUSEL', children: containerIds.join(','), caption }),
    });
    const carData    = await carRes.json();
    const carouselId = carData.id;
    if (!carouselId) throw new Error(`Carrossel falhou: ${JSON.stringify(carData)}`);

    // 3. Aguardar processamento
    let pronto = false;
    for (let i = 0; i < 10; i++) {
      await sleep(4000);
      const stRes  = await fetch(`${API}/${carouselId}?fields=status_code&access_token=${TOKEN}`);
      const stData = await stRes.json();
      if (stData.status_code === 'FINISHED') { pronto = true; break; }
      if (stData.status_code === 'ERROR') throw new Error(`Processamento com erro: ${JSON.stringify(stData)}`);
    }
    if (!pronto) throw new Error('Timeout: carrossel demorou demais para processar');

    // 4. Publicar
    const pubRes  = await fetch(`${API}/${IG_ID}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ access_token: TOKEN, creation_id: carouselId }),
    });
    const pubData = await pubRes.json();
    const postId  = pubData.id;
    if (!postId) throw new Error(`Publicação falhou: ${JSON.stringify(pubData)}`);

    // 5. Atualizar pendentes.json (marcar como publicado)
    if (GH && post_index !== undefined) {
      try {
        const agora = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ');
        const fileRes = await fetch(`https://api.github.com/repos/${REPO}/contents/pendentes.json`, {
          headers: { Authorization: `Bearer ${GH}`, Accept: 'application/vnd.github.v3+json', 'User-Agent': 'agencia8x' }
        });
        if (fileRes.ok) {
          const file  = await fileRes.json();
          const posts = JSON.parse(Buffer.from(file.content, 'base64').toString('utf-8'));
          if (posts[post_index]) {
            posts[post_index].status       = 'publicado';
            posts[post_index].post_id      = postId;
            posts[post_index].publicado_em = agora;
            delete posts[post_index].erro;
            await fetch(`https://api.github.com/repos/${REPO}/contents/pendentes.json`, {
              method: 'PUT',
              headers: { Authorization: `Bearer ${GH}`, Accept: 'application/vnd.github.v3+json', 'User-Agent': 'agencia8x', 'Content-Type': 'application/json' },
              body: JSON.stringify({ message: `dashboard: publicou post ${postId}`, content: Buffer.from(JSON.stringify(posts, null, 2)).toString('base64'), sha: file.sha }),
            });
          }
        }
      } catch {} // não falha se não conseguir atualizar o JSON
    }

    return res.status(200).json({ ok: true, post_id: postId, msg: 'Publicado com sucesso!' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
