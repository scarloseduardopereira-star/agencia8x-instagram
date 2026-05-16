"""
publicador_actions.py — Versão para GitHub Actions.
Lê pendentes.json, publica posts cujo horário já chegou,
e atualiza o status no arquivo.
"""
import os, sys, time, json, requests
from datetime import datetime, timezone
from pathlib import Path

IG_ID      = os.environ["INSTAGRAM_BUSINESS_ID"]
PAGE_TOKEN = os.environ["INSTAGRAM_ACCESS_TOKEN"]
API_VER    = os.environ.get("META_API_VERSION", "v19.0")
BASE_URL   = f"https://graph.facebook.com/{API_VER}"
PENDENTES  = Path(__file__).parent.parent / "pendentes.json"


def log(msg):
    print(f"[{datetime.now().strftime('%d/%m %H:%M:%S')}] {msg}", flush=True)


def carregar():
    if not PENDENTES.exists():
        return []
    with open(PENDENTES, encoding="utf-8") as f:
        return json.load(f)


def salvar(posts):
    with open(PENDENTES, "w", encoding="utf-8") as f:
        json.dump(posts, f, indent=2, ensure_ascii=False)


def create_container(image_url: str) -> str:
    r = requests.post(f"{BASE_URL}/{IG_ID}/media", data={
        "access_token": PAGE_TOKEN,
        "image_url": image_url,
        "is_carousel_item": "true",
    }, timeout=60)
    d = r.json()
    if "id" not in d:
        raise RuntimeError(f"Container: {d}")
    return d["id"]


def wait_ready(cid: str) -> bool:
    for _ in range(12):
        r = requests.get(f"{BASE_URL}/{cid}",
            params={"fields": "status_code", "access_token": PAGE_TOKEN}, timeout=15)
        s = r.json().get("status_code", "")
        if s == "FINISHED":
            return True
        if s == "ERROR":
            raise RuntimeError(f"Container com erro: {r.json()}")
        time.sleep(5)
    return False


def publicar(post: dict) -> str:
    urls = post.get("image_urls", [])
    if not urls:
        raise RuntimeError("Nenhuma URL de imagem encontrada no post.")

    log(f"Criando {len(urls)} containers...")
    ids = [create_container(u) for u in urls]

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


def main():
    posts = carregar()
    agora = datetime.now()
    publicados = 0
    modificado = False

    pendentes = [p for p in posts if p.get("status") == "pendente"]
    log(f"{len(pendentes)} post(s) pendente(s) de {len(posts)} total.")

    for post in posts:
        if post.get("status") != "pendente":
            continue

        try:
            dt = datetime.strptime(post["quando"], "%Y-%m-%d %H:%M")
        except Exception:
            continue

        if agora < dt:
            log(f"Aguardando: {post['quando']} (faltam {(dt - agora).seconds // 60} min)")
            continue

        log(f"Publicando post de {post['quando']}...")
        try:
            post_id = publicar(post)
            post["status"] = "publicado"
            post["post_id"] = post_id
            post["publicado_em"] = agora.strftime("%Y-%m-%d %H:%M")
            log(f"Publicado! Post ID: {post_id}")
            publicados += 1
        except Exception as e:
            post["status"] = "erro"
            post["erro"] = str(e)
            log(f"ERRO: {e}")
        modificado = True

    if modificado:
        salvar(posts)
        log("pendentes.json atualizado.")

    log(f"Concluido. {publicados} post(s) publicado(s) nessa execucao.")


if __name__ == "__main__":
    main()
