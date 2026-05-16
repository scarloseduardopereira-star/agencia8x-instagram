export default async function handler(req, res) {
  const TOKEN  = process.env.INSTAGRAM_ACCESS_TOKEN;
  const IG_ID  = process.env.INSTAGRAM_BUSINESS_ID;
  const GITHUB = process.env.GITHUB_TOKEN;
  const REPO   = 'scarloseduardopereira-star/agencia8x-instagram';
  const API    = 'https://graph.facebook.com/v19.0';

  res.setHeader('Access-Control-Allow-Origin', '*');

  const SENHA = process.env.DASHBOARD_PASSWORD;
  if (SENHA) {
    const esperado = Buffer.from(`${SENHA}:agencia8x-dashboard`).toString('base64');
    const enviado  = req.headers['x-dashboard-token'] || req.query.auth || '';
    if (enviado !== esperado) return res.status(401).json({ error: 'Não autorizado' });
  }

  if (!TOKEN || !IG_ID) {
    return res.status(200).json({ error: 'Credenciais nao configuradas no Vercel' });
  }

  // 1. Dados do perfil (sempre necessário)
  let profile = {};
  try {
    const profileRes = await fetch(
      `${API}/${IG_ID}?fields=followers_count,media_count,username&access_token=${TOKEN}`
    );
    profile = await profileRes.json();
    if (profile.error) {
      return res.status(200).json({ error: `Token inválido ou expirado: ${profile.error.message}` });
    }
  } catch (e) {
    return res.status(200).json({ error: `Falha ao buscar perfil: ${e.message}` });
  }

  // 2. Buscar histórico salvo no GitHub
  let history = [];
  try {
    const histRes = await fetch(
      `https://api.github.com/repos/${REPO}/contents/analytics_history.json`,
      { headers: { Authorization: `Bearer ${GITHUB}`, Accept: 'application/vnd.github.v3+json', 'User-Agent': 'agencia8x' } }
    );
    if (histRes.ok) {
      const histFile = await histRes.json();
      history = JSON.parse(Buffer.from(histFile.content, 'base64').toString('utf-8'));
    }
  } catch {}

  // 3. Snapshot diário
  const hoje = new Date().toISOString().split('T')[0];
  if (!history.some(h => h.date === hoje) && profile.followers_count !== undefined) {
    history.push({ date: hoje, followers: profile.followers_count, media_count: profile.media_count });
    history = history.slice(-90);
    try {
      const getFile = await fetch(
        `https://api.github.com/repos/${REPO}/contents/analytics_history.json`,
        { headers: { Authorization: `Bearer ${GITHUB}`, Accept: 'application/vnd.github.v3+json', 'User-Agent': 'agencia8x' } }
      );
      const sha = getFile.ok ? (await getFile.json()).sha : undefined;
      await fetch(`https://api.github.com/repos/${REPO}/contents/analytics_history.json`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${GITHUB}`, Accept: 'application/vnd.github.v3+json', 'User-Agent': 'agencia8x', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `analytics: snapshot ${hoje}`,
          content: Buffer.from(JSON.stringify(history, null, 2)).toString('base64'),
          ...(sha ? { sha } : {})
        })
      });
    } catch {}
  }

  // 4. Insights (opcional — falha graciosamente)
  const insights = { impressions: 0, reach: 0, profile_views: 0, follower_trend: [] };
  try {
    const until = Math.floor(Date.now() / 1000);
    const since = until - 30 * 24 * 3600;
    const metricsRes = await fetch(
      `${API}/${IG_ID}/insights?metric=impressions,reach,profile_views&period=day&since=${since}&until=${until}&access_token=${TOKEN}`
    );
    const metricsData = await metricsRes.json();
    if (metricsData.data) {
      const m = {};
      metricsData.data.forEach(x => { m[x.name] = x.values || []; });
      insights.impressions   = totalMetric(m.impressions);
      insights.reach         = totalMetric(m.reach);
      insights.profile_views = totalMetric(m.profile_views);
    }
  } catch {}

  // 5. Calcular crescimento a partir do histórico
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const growthCalc = (arr) => arr.length < 2 ? 0 : arr[arr.length - 1].followers - arr[0].followers;

  return res.status(200).json({
    profile: {
      username: profile.username || 'agencia.8x',
      followers: profile.followers_count ?? 0,
      posts:     profile.media_count ?? 0,
    },
    growth: {
      last7days:  growthCalc(sorted.slice(-7)),
      last30days: growthCalc(sorted.slice(-30)),
    },
    history: sorted.slice(-30),
    insights,
  });
}

function totalMetric(arr) {
  if (!arr || !arr.length) return 0;
  return arr.reduce((sum, v) => sum + (v.value || 0), 0);
}
