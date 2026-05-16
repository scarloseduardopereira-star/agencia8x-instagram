export default async function handler(req, res) {
  const token = process.env.GITHUB_TOKEN;
  const repo  = 'scarloseduardopereira-star/agencia8x-instagram';

  const response = await fetch(
    `https://api.github.com/repos/${repo}/contents/pendentes.json`,
    {
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github.v3.raw',
      },
    }
  );

  if (!response.ok) {
    return res.status(response.status).json({ error: 'Erro ao buscar dados do GitHub' });
  }

  const data = await response.json();
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json(data);
}
