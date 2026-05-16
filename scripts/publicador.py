"""
publicador.py — Verifica pendentes.json e publica no horário certo.

Deixe esse script rodando em background. Ele checa a cada minuto
se algum post agendado deve ser publicado agora.

Uso:
  python publicador.py
"""
import os, sys, time, json, requests, certifi
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv

os.environ['REQUESTS_CA_BUNDLE'] = certifi.where()
load_dotenv(Path(__file__).parent.parent / ".env")

IG_ID      = os.getenv("INSTAGRAM_BUSINESS_ID")
PAGE_TOKEN = os.getenv("INSTAGRAM_ACCESS_TOKEN")
BASE_URL   = f"https://graph.facebook.com/{os.getenv('META_API_VERSION', 'v19.0')}"
PENDENTES  = Path(__file__).parent.parent / "pendentes.json"


def log(msg):
    print(f"[{datetime.now().strftime('%d/%m %H:%M:%S')}] {msg}")


def carregar():
    if not PENDENTES.exists():
        return []
    with open(PENDENTES, encoding="utf-8") as f:
        return json.load(f)


def salvar(posts):
    with open(PENDENTES, "w", encoding="utf-8") as f:
        json.dump(posts, f, indent=2, ensure_ascii=False)


def host_image(path):
    with open(path, "rb") as f:
        r = requests.post("https://catbox.moe/user/api.php",
            data={"reqtype": "fileupload"},
            files={"fileToUpload": (Path(path).name, f, "image/png")},
            timeout=60)
    url = r.text.strip()
    if not url.startswith("https://"):
        raise RuntimeError(f"Upload falhou: {url}")
    return url


def create_container(image_path):
    r = requests.post(f"{BASE_URL}/{IG_ID}/media", data={
        "access_token": PAGE_TOKEN,
        "image_url": host_image(image_path),
        "is_carousel_item": "true",
    }, timeout=60)
    d = r.json()
    if "id" not in d:
        raise RuntimeError(f"Container: {d}")
    return d["id"]


def wait_ready(cid):
    for _ in range(12):
        r = requests.get(f"{BASE_URL}/{cid}",
            params={"fields": "status_code", "access_token": PAGE_TOKEN}, timeout=15)
        s = r.json().get("status_code", "")
        if s == "FINISHED":
            return True
        if s == "ERROR":
            raise RuntimeError(f"Erro no container: {r.json()}")
        time.sleep(5)
    return False


def publicar(post):
    log(f"Publicando: {post['caption'][:50]}...")
    ids = [create_container(img) for img in post["imagens"]]

    r = requests.post(f"{BASE_URL}/{IG_ID}/media", data={
        "access_token": PAGE_TOKEN,
        "media_type": "CAROUSEL",
        "children": ",".join(ids),
        "caption": post["caption"],
    }, timeout=30)
    carousel_id = r.json().get("id")
    if not carousel_id:
        raise RuntimeError(f"Carrossel: {r.json()}")

    if not wait_ready(carousel_id):
        raise RuntimeError("Timeout no processamento")

    r2 = requests.post(f"{BASE_URL}/{IG_ID}/media_publish", data={
        "access_token": PAGE_TOKEN,
        "creation_id": carousel_id,
    }, timeout=30)
    post_id = r2.json().get("id")
    if not post_id:
        raise RuntimeError(f"Publicação: {r2.json()}")
    return post_id


def checar_e_publicar():
    posts = carregar()
    modificado = False
    agora = datetime.now()

    for post in posts:
        if post["status"] != "pendente":
            continue
        try:
            dt = datetime.strptime(post["quando"], "%Y-%m-%d %H:%M")
        except:
            continue

        if agora >= dt:
            try:
                post_id = publicar(post)
                post["status"] = "publicado"
                post["post_id"] = post_id
                post["publicado_em"] = agora.strftime("%Y-%m-%d %H:%M")
                log(f"Publicado! Post ID: {post_id}")
            except Exception as e:
                post["status"] = "erro"
                post["erro"] = str(e)
                log(f"ERRO ao publicar: {e}")
            modificado = True

    if modificado:
        salvar(posts)


if __name__ == "__main__":
    log("Publicador iniciado — verificando a cada minuto.")
    log(f"Conta: @agencia.8x | Pendentes: {PENDENTES}")
    log("Pressione Ctrl+C para parar.\n")

    pendentes = carregar()
    pendentes_count = sum(1 for p in pendentes if p["status"] == "pendente")
    log(f"{pendentes_count} post(s) agendado(s) aguardando publicação.")

    while True:
        try:
            checar_e_publicar()
        except Exception as e:
            log(f"Erro geral: {e}")
        time.sleep(60)
