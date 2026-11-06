#!/usr/bin/env python3
"""Prepara le foto del sito (ritagli, ritocco, peso) e le scrive in public/img.
Uso: python3 scripts/photos.py CARTELLA_FOTO_NUOVE [nome.jpg ...]   (le foto arrivate il 6 novembre 2026; i nomi dei file sono in NUOVE;
                                                                      se si indicano dei nomi, si rifanno solo quelli)
     python3 scripts/photos.py --retouch               (ritocca le foto già pubblicate, partendo dalla versione del commit BASE)

Gli originali non stanno nel repository: restano in public/img solo i ritagli già pronti. Il ritocco (pulizia, luci, nitidezza)
è in scripts/enhance.py; le foto delle prime consegne (ritagli del cliente) non esistono più in originale, quindi --retouch
parte sempre dalla versione del commit BASE, in modo che rilanciarlo non le ritocchi due volte."""
import subprocess
import sys
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageOps

sys.path.insert(0, str(Path(__file__).resolve().parent))
from enhance import enhance, save  # noqa: E402

root = Path(__file__).resolve().parent.parent
out_dir = root / 'public' / 'img'
BASE = '777463f'  # ultimo commit con le foto non ritoccate

# foto del 6 novembre 2026: nome in uscita: (file consegnato, riquadro (sinistra, alto, destra, basso) o None, larghezza in uscita)
NUOVE = {
    'valerio.jpg':          ('8450e6a0-image.png', (215, 400, 855, 1040), 720),   # ritratto al banco: quadrato per il quadrante del titolo
    'trainer-valerio.jpg':  ('8450e6a0-image.png', (0, 281, 891, 1766), 960),     # stesso ritratto, 3:5, fino in fondo: con il desk bianco e il logo
    # personal training
    'corso-pt-2.jpg':       ('6302d0eb-image.jpg', None, 760),                    # stacco con il trap bar
    'corso-pt-3.jpg':       ('79178007-image.jpg', None, 760),                    # wall ball con Valerio
    'corso-pt-4.jpg':       ('29855b02-image.jpg', None, 760),                    # wall ball in squat
    # functional in gruppo
    'corso-functional-2.jpg': ('08d87565-image.jpg', None, 760),                  # allungamento a terra
    'corso-functional-3.jpg': ('67608cdb-image.jpg', (0, 0, 1320, 2230), 760),    # addominali sui materassini (tolta l'icona del video in basso)
    'corso-functional-4.jpg': ('e1d8c453-image.jpg', None, 760),                  # squat con i manubri
    # pilates
    'corso-pilates-2.jpg':  ('d14dc3e4-image.jpg', None, 760),                    # sul reformer, in piedi sul box
    'corso-pilates-3.jpg':  ('c4a6a2ca-image.jpg', None, 760),                    # tre allieve sui reformer
    'corso-pilates-4.jpg':  ('2c558f46-image.jpg', None, 760),                    # ponte sui reformer
    # Chiara, maestra di Pilates (3:4): la prima è la foto grande, la seconda quella piccola sovrapposta
    'trainer-chiara.jpg':   ('2e2483f1-image.png', (0, 330, 919, 1555), 900),     # con la pallina rossa
    'trainer-chiara-2.jpg': ('7e01eb73-image.png', (0, 380, 892, 1569), 900),     # seduta sul reformer
}

# foto già pubblicate, da ritoccare: nome: (larghezza in uscita, forza del ritocco) (la foto di partenza è quella del commit BASE)
RITOCCO = {
    'corso-pt.jpg': (900, 1.0), 'corso-functional.jpg': (900, 1.0), 'corso-pilates.jpg': (900, 1.0),
    'studio-pilates.jpg': (1000, 1.0), 'studio-forza.jpg': (1000, 1.0), 'studio-cardio.jpg': (1000, 1.0),
    'studio-pilates-wide.jpg': (1200, 1.0), 'studio-forza-wide.jpg': (1200, 1.0), 'studio-cardio-wide.jpg': (1200, 1.0),
    'nutrizionista.jpg': (820, 0.6),  # il camice si impasta se si pulisce troppo
}


def run_new(src_dir, only=()):
    for name, (f, box, w) in NUOVE.items():
        if only and name not in only:
            continue
        im = ImageOps.exif_transpose(Image.open(src_dir / f)).convert('RGB')
        if box:
            im = im.crop(box)
        out = enhance(im, width=w)
        save(out, out_dir / name)
        print(f'{name}: {out.width}x{out.height}, {(out_dir / name).stat().st_size // 1024} KB')


def run_retouch():
    for name, (w, strength) in RITOCCO.items():
        data = subprocess.run(['git', 'show', f'{BASE}:public/img/{name}'], cwd=root, check=True, capture_output=True).stdout
        out = enhance(Image.open(BytesIO(data)), width=w, strength=strength)
        save(out, out_dir / name)
        print(f'{name}: {out.width}x{out.height}, {(out_dir / name).stat().st_size // 1024} KB')


if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == '--retouch':
        run_retouch()
    else:
        run_new(Path(sys.argv[1]) if len(sys.argv) > 1 else Path('.'), tuple(sys.argv[2:]))
