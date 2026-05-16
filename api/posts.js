function verificarAuth(req) {
  const SENHA = process.env.DASHBOARD_PASSWORD;
  if (!SENHA) return true; // sem senha configurada, libera
  const esperado = Buffer.from(`${SENHA}:agencia8x-dashboard`).toString('base64');
  const enviado  = req.headers['x-dashboard-token'] || req.query.auth || '';
  return enviado === esperado;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (!verificarAuth(req)) return res.status(401).json({ error: 'Não autorizado' });

  const token = process.env.GITHUB_TOKEN;
  const repo  = 'scarloseduardopereira-star/agencia8x-instagram';

  try {
    const response = await fetch(
      `https://api.github.com/repos/${repo}/contents/pendentes.json`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'agencia8x-dashboard',
        },
      }
    );

    const raw = await response.text();

    if (!response.ok) {
      return res.status(200).json({ error: `GitHub retornou ${response.status}`, detail: raw });
    }

    const file = JSON.parse(raw);

    // Arquivo pode vir em base64 ou direto
    let data;
    if (file.content) {
      const decoded = Buffer.from(file.content, 'base64').toString('utf-8');
      data = JSON.parse(decoded);
    } else if (Array.isArray(file)) {
      data = file;
    } else {
      data = [];
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json(data);

  } catch (e) {
    return res.status(200).json({ error: e.message });
  }
}
