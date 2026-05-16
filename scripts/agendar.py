"""
agendar.py — Sistema de agendamento local de posts para @agencia.8x

O post fica salvo em pendentes.json e é publicado automaticamente
quando o publicador.py detecta que chegou a hora.

Uso:
  python agendar.py --images slides/a1.png slides/a2.png --caption "texto" --quando "2026-05-20 14:00"
  python agendar.py --listar
  python agendar.py --cancelar 2
"""
import argparse, os, sys, json, requests, certifi
from datetime import datetime
from pathlib import Path

os.environ['REQUESTS_CA_BUNDLE'] = certifi.where()

# Fix encoding no terminal Windows
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

PENDENTES = Path(__file__).parent.parent / "pendentes.json"


def carregar():
    if not PENDENTES.exists():
        return []
    with open(PENDENTES, encoding="utf-8") as f:
        return json.load(f)


def salvar(posts):
    with open(PENDENTES, "w", encoding="utf-8") as f:
        json.dump(posts, f, indent=2, ensure_ascii=False)


def upload_imagem(path: str) -> str:
    print(f"  Enviando {Path(path).name}...")
    with open(path, "rb") as f:
        r = requests.post("https://catbox.moe/user/api.php",
            data={"reqtype": "fileupload"},
            files={"fileToUpload": (Path(path).name, f, "image/png")},
            timeout=60)
    url = r.text.strip()
    if not url.startswith("https://"):
        raise RuntimeError(f"Upload falhou: {url}")
    return url


def agendar(images, caption, quando, dry_run=False):
    try:
        dt = datetime.strptime(quando, "%Y-%m-%d %H:%M")
    except ValueError:
        print("ERRO: Use o formato YYYY-MM-DD HH:MM  (ex: 2026-05-20 14:00)")
        sys.exit(1)

    if dt <= datetime.now():
        print("ERRO: A data deve ser no futuro.")
        sys.exit(1)

    # Verificar que os arquivos existem
    for img in images:
        if not Path(img).exists():
            print(f"ERRO: Arquivo não encontrado: {img}")
            sys.exit(1)

    if dry_run:
        print(f"\n[DRY RUN] Post seria agendado para {dt.strftime('%d/%m/%Y as %H:%M')}")
        print(f"  Slides: {len(images)} imagens")
        return

    print(f"\nFazendo upload das {len(images)} imagens...")
    try:
        urls = [upload_imagem(img) for img in images]
    except Exception as e:
        print(f"ERRO no upload: {e}")
        sys.exit(1)

    entry = {
        "quando": quando,
        "image_urls": urls,
        "caption": caption,
        "status": "pendente",
        "criado_em": datetime.now().strftime("%Y-%m-%d %H:%M")
    }

    posts = carregar()
    posts.append(entry)
    salvar(posts)

    print(f"\nPost agendado com sucesso!")
    print(f"  Data/hora:  {dt.strftime('%d/%m/%Y às %H:%M')}")
    print(f"  Slides:     {len(images)} imagens")
    print(f"  Caption:    {caption[:60]}...")
    print(f"\nLembre de manter o publicador.py rodando para publicar no horário.")


def listar():
    posts = carregar()
    if not posts:
        print("\nNenhum post agendado.\n")
        return
    print(f"\n{'='*60}")
    print(f"  POSTS AGENDADOS — @agencia.8x")
    print(f"{'='*60}")
    for i, p in enumerate(posts, 1):
        emoji = {"pendente": "🕐", "publicado": "✅", "erro": "❌"}.get(p["status"], "?")
        print(f"\n  {i}. {emoji}  {p['quando']}  [{p['status']}]")
        print(f"     Slides: {len(p['imagens'])} imagens")
        print(f"     Texto:  {p['caption'][:70]}...")
    print(f"\n{'='*60}\n")


def cancelar(numero):
    posts = carregar()
    if numero < 1 or numero > len(posts):
        print(f"ERRO: Post #{numero} não existe.")
        sys.exit(1)
    removed = posts.pop(numero - 1)
    salvar(posts)
    print(f"Post de {removed['quando']} removido.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Agendador de posts — @agencia.8x")
    parser.add_argument("--images",   nargs="+", help="Caminhos das imagens (2-10)")
    parser.add_argument("--caption",  help="Legenda do post")
    parser.add_argument("--quando",   help="Data e hora: YYYY-MM-DD HH:MM")
    parser.add_argument("--listar",   action="store_true")
    parser.add_argument("--cancelar", type=int, metavar="N", help="Cancela o post de número N")
    parser.add_argument("--dry-run",  action="store_true")
    args = parser.parse_args()

    if args.listar:
        listar()
    elif args.cancelar:
        cancelar(args.cancelar)
    elif args.images and args.caption and args.quando:
        agendar(args.images, args.caption, args.quando, args.dry_run)
    else:
        parser.print_help()
