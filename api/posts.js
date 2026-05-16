export default async function handler(req, res) {
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
