export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'POST') return res.status(405).end();

  const { password } = req.body || {};
  const SENHA = process.env.DASHBOARD_PASSWORD;

  if (!SENHA) return res.status(500).json({ error: 'DASHBOARD_PASSWORD não configurada no Vercel' });
  if (!password || password !== SENHA) {
    return res.status(401).json({ error: 'Senha incorreta' });
  }

  // Token = base64 da senha + salt fixo (válido enquanto a senha não mudar)
  const token = Buffer.from(`${SENHA}:agencia8x-dashboard`).toString('base64');
  return res.status(200).json({ token });
}
