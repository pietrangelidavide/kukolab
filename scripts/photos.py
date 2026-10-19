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
    'corso-functional.jpg': ('d648a1e5-image.jpg', (70, 0, 640, 564), 760),      # il trainer segue una cliente, altri si allenano alle spalle
    'corso-pt.jpg':         ('847d4cd1-image.jpg', (110, 4, 1124, 1014), 900),   # wall ball in coppia, vetrina "K LAB"
    'studio-pilates.jpg':   ('550d1603-image.jpg', (30, 640, 1270, 2294), 820),  # sala Pilates
    'studio-forza.jpg':     ('f43ec08b-image.jpg', (30, 780, 1270, 2434), 820),  # rack e reception
    'studio-cardio.jpg':    ('361e8fc6-image.jpg', (30, 880, 1276, 2542), 820),  # area cardio
    # ritagli larghi (7:5) delle stesse sale, per la fascia che scorre
    'studio-pilates-wide.jpg': ('550d1603-image.jpg', (302, 1048, 1270, 1739), 1000),  # pianta, rivestimento in legno e attrezzo
    'studio-forza-wide.jpg':   ('f43ec08b-image.jpg', (287, 780, 1270, 1483), 1000),   # rack, dischi e specchio
    'studio-cardio-wide.jpg':  ('361e8fc6-image.jpg', (212, 1336, 1276, 2095), 1000),  # tapis roulant e bici
    'nutrizionista.jpg':    ('4a88e8bd-image.jpg', (775, 400, 1320, 1290), 545),  # dal volantino del dott. Calabrò
}
for name, (f, box, w) in JOBS.items():
    im = ImageOps.exif_transpose(Image.open(src_dir / f)).convert('RGB').crop(box)
    h = round(im.height * w / im.width)
    im = im.resize((w, h), Image.LANCZOS)
    im.save(out_dir / name, 'JPEG', quality=80, optimize=True, progressive=True)
    print(f'{name}: {w}x{h}, {(out_dir / name).stat().st_size // 1024} KB')

# ritratto verticale di Valerio per la sezione "I trainer": ritaglio 4:5 della foto del quadrante (public/img/valerio.jpg), un po' più chiaro perché l'originale è scuro
from PIL import ImageEnhance
v = Image.open(out_dir / 'valerio.jpg').convert('RGB').crop((178, 0, 550, 465))
v = ImageEnhance.Contrast(ImageEnhance.Brightness(v).enhance(1.22)).enhance(1.06)
v = v.resize((744, 930), Image.LANCZOS)
v.save(out_dir / 'trainer-valerio.jpg', 'JPEG', quality=82, optimize=True, progressive=True)
print(f'trainer-valerio.jpg: 744x930, {(out_dir / "trainer-valerio.jpg").stat().st_size // 1024} KB')
