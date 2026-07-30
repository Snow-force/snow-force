from math import ceil
from pathlib import Path

from PIL import Image, ImageDraw


files = sorted(Path("tmp/pdfs/rendered").glob("page-*.png"))
thumbs = []
width = 420
gap = 18
label_height = 28

for index, file_path in enumerate(files):
    image = Image.open(file_path).convert("RGB")
    height = round(image.height * width / image.width)
    image = image.resize((width, height))
    canvas = Image.new("RGB", (width, height + label_height), "white")
    canvas.paste(image, (0, label_height))
    ImageDraw.Draw(canvas).text((8, 6), f"Page {index + 1}", fill="black")
    thumbs.append(canvas)

columns = 3
rows = ceil(len(thumbs) / columns)
cell_height = max(image.height for image in thumbs)
sheet = Image.new(
    "RGB",
    (columns * width + (columns + 1) * gap, rows * cell_height + (rows + 1) * gap),
    (225, 229, 236),
)

for index, image in enumerate(thumbs):
    x = gap + (index % columns) * (width + gap)
    y = gap + (index // columns) * (cell_height + gap)
    sheet.paste(image, (x, y))

sheet.save("tmp/pdfs/rendered/contact-sheet.png")
