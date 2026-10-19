#!/usr/bin/env python3
"""Prepara le foto del sito (ritagli e peso) a partire dagli originali che il cliente ha mandato.
Uso: python3 scripts/photos.py CARTELLA_ORIGINALI   (i nomi dei file sono in SRC qui sotto)
Gli originali non stanno nel repository: restano in public/img solo i ritagli già pronti."""
import sys
from pathlib import Path
from PIL import Image, ImageOps

src_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('.')
out_dir = Path(__file__).resolve().parent.parent / 'public' / 'img'

# nome in uscita: (file originale, riquadro (sinistra, alto, destra, basso) nell'originale, larghezza in uscita)
JOBS = {
    'corso-pilates.jpg':    ('002f6815-image.jpg', (4, 4, 1214, 1214), 900),     # lezione sul reformer
    'corso-functional.jpg': ('847d4cd1-image.jpg', (110, 4, 1124, 1018), 900),   # wall ball in coppia, vetrina "K LAB"
    'corso-pt.jpg':         ('d648a1e5-image.jpg', (70, 0, 640, 564), 760),      # il trainer segue una cliente
    'studio-pilates.jpg':   ('550d1603-image.jpg', (30, 640, 1270, 2294), 820),  # sala Pilates
    'studio-forza.jpg':     ('f43ec08b-image.jpg', (30, 780, 1270, 2434), 820),  # rack e reception
    'studio-cardio.jpg':    ('361e8fc6-image.jpg', (30, 880, 1276, 2542), 820),  # area cardio
    'nutrizionista.jpg':    ('4a88e8bd-image.jpg', (775, 400, 1320, 1290), 545),  # dal volantino del dott. Calabrò
}
for name, (f, box, w) in JOBS.items():
    im = ImageOps.exif_transpose(Image.open(src_dir / f)).convert('RGB').crop(box)
    h = round(im.height * w / im.width)
    im = im.resize((w, h), Image.LANCZOS)
    im.save(out_dir / name, 'JPEG', quality=80, optimize=True, progressive=True)
    print(f'{name}: {w}x{h}, {(out_dir / name).stat().st_size // 1024} KB')
