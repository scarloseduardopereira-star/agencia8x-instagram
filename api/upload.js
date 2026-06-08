export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

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

  const { base64, filename, mimeType } = req.body || {};
  if (!base64 || !filename) return res.status(400).json({ error: 'base64 e filename obrigatórios' });

  try {
    const buffer = Buffer.from(base64, 'base64');
    const blob   = new Blob([buffer], { type: mimeType || 'image/png' });

    const form = new FormData();
    form.append('reqtype', 'fileupload');
    form.append('fileToUpload', blob, filename);

    const r   = await fetch('https://catbox.moe/user/api.php', { method: 'POST', body: form });
    const url = (await r.text()).trim();

    if (!url.startsWith('https://')) {
      return res.status(500).json({ error: `catbox.moe: ${url}` });
    }
    return res.status(200).json({ url });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
