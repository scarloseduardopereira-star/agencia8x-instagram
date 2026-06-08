"""
publicador_actions.py — GitHub Actions.
Publica carrosséis agendados no Instagram via Meta Graph API.
Timezone: America/Maceio (UTC-3, sem horário de verão).
"""
import os, sys, time, json, requests
from datetime import datetime, timezone, timedelta
from pathlib import Path

# ── Credenciais ──────────────────────────────────────────────────────────────
IG_ID      = os.environ.get("INSTAGRAM_BUSINESS_ID", "").strip()
PAGE_TOKEN = os.environ.get("INSTAGRAM_ACCESS_TOKEN", "").strip()
API_VER    = os.environ.get("META_API_VERSION", "v19.0")
BASE_URL   = f"https://graph.facebook.com/{API_VER}"
PENDENTES  = Path(__file__).parent.parent / "pendentes.json"

# Timezone de Maceió (UTC-3, fixo)
BRT = timezone(timedelta(hours=-3))


def log(msg):
    print(f"[{datetime.now(BRT).strftime('%d/%m %H:%M:%S')}] {msg}", flush=True)


def agora_brt() -> datetime:
    return datetime.now(BRT).replace(tzinfo=None)  # naive BRT para comparar


def validar():
    erros = []
    if not IG_ID:      erros.append("INSTAGRAM_BUSINESS_ID não definido")
    if not PAGE_TOKEN: erros.append("INSTAGRAM_ACCESS_TOKEN não definido")
    if erros:
        for e in erros:
            print(f"ERRO: {e}", flush=True)
        sys.exit(1)

    # Testa token ao vivo
    r = requests.get(f"{BASE_URL}/{IG_ID}",
        params={"fields": "username", "access_token": PAGE_TOKEN}, timeout=15)
    d = r.json()
    if "error" in d:
        print(f"ERRO token Instagram: {d['error'].get('message', d)}", flush=True)
        sys.exit(1)
    log(f"Token válido — conta @{d.get('username', IG_ID)}")


def create_container(image_url: str) -> str:
    r = requests.post(f"{BASE_URL}/{IG_ID}/media", data={
        "access_token": PAGE_TOKEN,
        "image_url":    image_url,
        "is_carousel_item": "true",
    }, timeout=60)
    d = r.json()
    if "id" not in d:
        raise RuntimeError(f"create_container: {d}")
    log(f"  Container criado: {d['id']}")
    return d["id"]


def wait_ready(cid: str, tentativas: int = 15) -> bool:
    for i in range(tentativas):
        r = requests.get(f"{BASE_URL}/{cid}",
            params={"fields": "status_code,status", "access_token": PAGE_TOKEN},
            timeout=15)
        d = r.json()
        s = d.get("status_code", "")
        log(f"  Container {cid}: {s} ({i+1}/{tentativas})")
        if s == "FINISHED": return True
        if s == "ERROR":
            raise RuntimeError(f"Container ERROR: {d.get('status', d)}")
        time.sleep(6)
    return False


def publicar_post(post: dict) -> str:
    urls = post.get("image_urls", [])
    if not urls:
        raise RuntimeError("image_urls vazio")
    if len(urls) > 10:
        raise RuntimeError(f"{len(urls)} imagens — máximo é 10")

    log(f"  {len(urls)} imagens → criando containers...")
    ids = []
    for u in urls:
        ids.append(create_container(u))
        time.sleep(1)  # evita rate limit

    log("  Montando carrossel...")
    r = requests.post(f"{BASE_URL}/{IG_ID}/media", data={
        "access_token": PAGE_TOKEN,
        "media_type":   "CAROUSEL",
        "children":     ",".join(ids),
        "caption":      post["caption"],
    }, timeout=30)
    d = r.json()
    carousel_id = d.get("id")
    if not carousel_id:
        raise RuntimeError(f"create_carousel: {d}")
    log(f"  Carrossel: {carousel_id}")

    log("  Aguardando processamento...")
    if not wait_ready(carousel_id):
        raise RuntimeError("Timeout no processamento do carrossel")

    log("  Publicando...")
    r2 = requests.post(f"{BASE_URL}/{IG_ID}/media_publish", data={
        "access_token": PAGE_TOKEN,
        "creation_id":  carousel_id,
    }, timeout=30)
    d2 = r2.json()
    post_id = d2.get("id")
    if not post_id:
        raise RuntimeError(f"media_publish: {d2}")
    return post_id


def main():
    validar()

    if not PENDENTES.exists():
        log("pendentes.json não encontrado — nada a fazer.")
        return

    with open(PENDENTES, encoding="utf-8") as f:
        posts = json.load(f)

    agora   = agora_brt()
    total   = len(posts)
    pend    = [p for p in posts if p.get("status") == "pendente"]
    modif   = False
    publis  = 0

    log(f"{len(pend)} pendente(s) de {total} total — agora: {agora.strftime('%d/%m/%Y %H:%M')} BRT")

    for post in posts:
        if post.get("status") != "pendente":
            continue

        try:
            dt = datetime.strptime(post["quando"], "%Y-%m-%d %H:%M")
        except Exception as e:
            log(f"SKIP — data inválida '{post.get('quando')}': {e}")
            continue

        if agora < dt:
            diff = int((dt - agora).total_seconds() // 60)
            log(f"Aguardando '{post['quando']}' (faltam {diff} min)")
            continue

        log(f">>> Publicando post de {post['quando']}...")
        try:
            post_id = publicar_post(post)
            post["status"]       = "publicado"
            post["post_id"]      = post_id
            post["publicado_em"] = agora.strftime("%Y-%m-%d %H:%M")
            post.pop("erro", None)
            log(f"    Publicado! Post ID: {post_id}")
            publis += 1
        except Exception as e:
            post["status"] = "erro"
            post["erro"]   = str(e)
            log(f"    ERRO: {e}")

        modif = True

    if modif:
        with open(PENDENTES, "w", encoding="utf-8") as f:
            json.dump(posts, f, indent=2, ensure_ascii=False)
        log("pendentes.json salvo.")

    log(f"Concluído — {publis} post(s) publicado(s).")


if __name__ == "__main__":
    main()
