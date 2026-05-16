"""
publish_instagram.py — Publicação automática no Instagram via Meta Graph API
Gerado pelo setup-instagram skill do Claude Code
Conta: @agencia.8x
"""
import argparse, os, sys, time, requests, certifi
from pathlib import Path
from dotenv import load_dotenv

# Fix SSL certificate verification on Windows
os.environ['REQUESTS_CA_BUNDLE'] = certifi.where()

# Encontra o .env automaticamente (sobe até 3 níveis)
script_dir = Path(__file__).parent
for i in range(4):
    candidate = script_dir
    for _ in range(i):
        candidate = candidate.parent
    env_file = candidate / ".env"
    if env_file.exists():
        load_dotenv(env_file)
        break

IG_ID      = os.getenv("INSTAGRAM_BUSINESS_ID")
PAGE_TOKEN = os.getenv("INSTAGRAM_ACCESS_TOKEN")
BASE_URL   = f"https://graph.facebook.com/{os.getenv('META_API_VERSION', 'v19.0')}"


def host_image(image_path: str) -> str:
    """Hospeda imagem em URL pública via catbox.moe"""
    with open(image_path, "rb") as f:
        resp = requests.post(
            "https://catbox.moe/user/api.php",
            data={"reqtype": "fileupload"},
            files={"fileToUpload": (Path(image_path).name, f, "image/png")},
            timeout=60,
        )
    url = resp.text.strip()
    if not url.startswith("https://"):
        raise RuntimeError(f"Falha no upload da imagem: {url}")
    print(f"  Hospedada: {url}")
    return url


def create_media_container(image_path: str) -> str:
    resp = requests.post(f"{BASE_URL}/{IG_ID}/media", data={
        "access_token": PAGE_TOKEN,
        "image_url": host_image(image_path),
        "is_carousel_item": "true",
    }, timeout=60)
    result = resp.json()
    if "id" not in result:
        raise RuntimeError(f"Erro ao criar container: {result}")
    print(f"  Container criado: {result['id']}")
    return result["id"]


def create_carousel(media_ids: list, caption: str) -> str:
    resp = requests.post(f"{BASE_URL}/{IG_ID}/media", data={
        "access_token": PAGE_TOKEN,
        "media_type": "CAROUSEL",
        "children": ",".join(media_ids),
        "caption": caption,
    }, timeout=30)
    result = resp.json()
    if "id" not in result:
        raise RuntimeError(f"Erro ao criar carrossel: {result}")
    print(f"  Carrossel criado: {result['id']}")
    return result["id"]


def wait_ready(container_id: str) -> bool:
    for i in range(12):
        resp = requests.get(f"{BASE_URL}/{container_id}",
            params={"fields": "status_code", "access_token": PAGE_TOKEN}, timeout=15)
        status = resp.json().get("status_code", "")
        if status == "FINISHED":
            return True
        if status == "ERROR":
            raise RuntimeError(f"Container com erro: {resp.json()}")
        print(f"  Processando... {i*5}s aguardados")
        time.sleep(5)
    return False


def publish(container_id: str) -> str:
    resp = requests.post(f"{BASE_URL}/{IG_ID}/media_publish", data={
        "access_token": PAGE_TOKEN,
        "creation_id": container_id,
    }, timeout=30)
    result = resp.json()
    if "id" not in result:
        raise RuntimeError(f"Erro ao publicar: {result}")
    return result["id"]


def run(images: list, caption: str, dry_run: bool = False):
    if not IG_ID or not PAGE_TOKEN:
        print("ERRO: Credenciais não encontradas. Verifique o arquivo .env.")
        sys.exit(1)
    if len(images) < 2:
        print("ERRO: Mínimo 2 imagens para carrossel.")
        sys.exit(1)
    if len(images) > 10:
        print("ERRO: Máximo 10 imagens.")
        sys.exit(1)

    print(f"\nPublicando carrossel com {len(images)} slides no @agencia.8x...")
    if dry_run:
        print("[DRY RUN] Tudo ok. Remova --dry-run para publicar de verdade.")
        return

    print("\nPasso 1/3 - Criando containers...")
    ids = [create_media_container(img) for img in images]

    print("\nPasso 2/3 - Montando carrossel...")
    carousel_id = create_carousel(ids, caption)

    print("\nPasso 3/3 - Publicando...")
    if not wait_ready(carousel_id):
        print("ERRO: Timeout no processamento.")
        sys.exit(1)

    post_id = publish(carousel_id)
    print(f"\nPublicado com sucesso!")
    print(f"Post ID: {post_id}")
    print(f"Veja em: https://www.instagram.com/{os.getenv('INSTAGRAM_USERNAME', 'agencia.8x')}/")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Publica carrossel no Instagram @agencia.8x")
    parser.add_argument("--images", nargs="+", required=True, help="Caminhos das imagens (2-10)")
    parser.add_argument("--caption", required=True, help="Legenda do post")
    parser.add_argument("--dry-run", action="store_true", help="Testar sem publicar")
    args = parser.parse_args()
    run(args.images, args.caption, args.dry_run)
