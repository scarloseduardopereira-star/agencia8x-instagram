export default async function handler(req, res) {
  const { post_id } = req.query;
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  const API   = 'https://graph.facebook.com/v19.0';

  res.setHeader('Access-Control-Allow-Origin', '*');

  const SENHA = process.env.DASHBOARD_PASSWORD;
  if (SENHA) {
    const esperado = Buffer.from(`${SENHA}:agencia8x-dashboard`).toString('base64');
    const enviado  = req.headers['x-dashboard-token'] || req.query.auth || '';
    if (enviado !== esperado) return res.status(401).json({ error: 'Não autorizado' });
  }

  if (!post_id) return res.status(400).json({ error: 'post_id obrigatorio' });
  if (!token)   return res.status(500).json({ error: 'Token Instagram nao configurado' });

  try {
    // Dados basicos do post (curtidas, comentarios)
    const mediaRes = await fetch(
      `${API}/${post_id}?fields=like_count,comments_count,media_type,timestamp&access_token=${token}`
    );
    const media = await mediaRes.json();

    // Insights do post (alcance, impressoes, salvamentos)
    const insightRes = await fetch(
      `${API}/${post_id}/insights?metric=impressions,reach,saved,engagement&access_token=${token}`
    );
    const insightData = await insightRes.json();

    // Montar objeto de metricas
    const metrics = { likes: media.like_count || 0, comments: media.comments_count || 0 };

    if (insightData.data) {
      insightData.data.forEach(item => {
        metrics[item.name] = item.values?.[0]?.value ?? item.value ?? 0;
      });
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json({ post_id, metrics, error: media.error || null });

  } catch (e) {
    return res.status(200).json({ post_id, metrics: null, error: e.message });
  }
}
