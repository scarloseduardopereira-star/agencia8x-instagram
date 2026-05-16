export default async function handler(req, res) {
  const TOKEN  = process.env.INSTAGRAM_ACCESS_TOKEN;
  const IG_ID  = process.env.INSTAGRAM_BUSINESS_ID;
  const GITHUB = process.env.GITHUB_TOKEN;
  const REPO   = 'scarloseduardopereira-star/agencia8x-instagram';
  const API    = 'https://graph.facebook.com/v19.0';

  try {
    // 1. Dados do perfil
    const profileRes = await fetch(
      `${API}/${IG_ID}?fields=followers_count,media_count,profile_picture_url,username&access_token=${TOKEN}`
    );
    const profile = await profileRes.json();

    // 2. Insights da conta (últimos 30 dias)
    const until = Math.floor(Date.now() / 1000);
    const since = until - 30 * 24 * 3600;
    const metricsRes = await fetch(
      `${API}/${IG_ID}/insights?metric=impressions,reach,profile_views,follower_count&period=day&since=${since}&until=${until}&access_token=${TOKEN}`
    );
    const metricsData = await metricsRes.json();

    // 3. Processar métricas
    const metrics = {};
    if (metricsData.data) {
      metricsData.data.forEach(m => { metrics[m.name] = m.values || []; });
    }

    // 4. Buscar histórico salvo no GitHub
    let history = [];
    try {
      const histRes = await fetch(
        `https://api.github.com/repos/${REPO}/contents/analytics_history.json`,
        { headers: { Authorization: `Bearer ${GITHUB}`, Accept: 'application/vnd.github.v3+json', 'User-Agent': 'agencia8x' } }
      );
      if (histRes.ok) {
        const histFile = await histRes.json();
        const decoded = Buffer.from(histFile.content, 'base64').toString('utf-8');
        history = JSON.parse(decoded);
      }
    } catch {}

    // 5. Adicionar snapshot de hoje se não existir
    const hoje = new Date().toISOString().split('T')[0];
    const jaTemHoje = history.some(h => h.date === hoje);
    if (!jaTemHoje && profile.followers_count !== undefined) {
      const novoSnapshot = {
        date: hoje,
        followers: profile.followers_count,
        media_count: profile.media_count
      };
      history.push(novoSnapshot);
      history = history.slice(-90); // manter últimos 90 dias

      // Salvar no GitHub
      try {
        const getFile = await fetch(
          `https://api.github.com/repos/${REPO}/contents/analytics_history.json`,
          { headers: { Authorization: `Bearer ${GITHUB}`, Accept: 'application/vnd.github.v3+json', 'User-Agent': 'agencia8x' } }
        );
        const sha = getFile.ok ? (await getFile.json()).sha : undefined;

        await fetch(`https://api.github.com/repos/${REPO}/contents/analytics_history.json`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${GITHUB}`,
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'agencia8x',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: `analytics: snapshot ${hoje}`,
            content: Buffer.from(JSON.stringify(history, null, 2)).toString('base64'),
            ...(sha ? { sha } : {})
          })
        });
      } catch {}
    }

    // 6. Calcular crescimento
    const sortedHistory = [...history].sort((a, b) => a.date.localeCompare(b.date));
    const last7 = sortedHistory.slice(-7);
    const last30 = sortedHistory.slice(-30);

    const growthCalc = (arr) => {
      if (arr.length < 2) return 0;
      return arr[arr.length - 1].followers - arr[0].followers;
    };

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json({
      profile: {
        username: profile.username,
        followers: profile.followers_count || 0,
        posts: profile.media_count || 0,
      },
      growth: {
        last7days:  growthCalc(last7),
        last30days: growthCalc(last30),
      },
      history: last30,
      insights: {
        impressions:   totalMetric(metrics.impressions),
        reach:         totalMetric(metrics.reach),
        profile_views: totalMetric(metrics.profile_views),
        follower_trend: (metrics.follower_count || []).slice(-14),
      }
    });

  } catch (e) {
    res.status(200).json({ error: e.message });
  }
}

function totalMetric(arr) {
  if (!arr || !arr.length) return 0;
  return arr.reduce((sum, v) => sum + (v.value || 0), 0);
}
