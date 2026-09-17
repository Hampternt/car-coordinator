"""Generates app-icon.png (1024x1024) so no binary needs to live in git.
Then `npx tauri icon app-icon.png` builds every icon size."""
from PIL import Image, ImageDraw

S = 1024
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.rounded_rectangle([40, 40, S - 40, S - 40], radius=180, fill=(255, 212, 0, 255))
d.rounded_rectangle([170, 360, 700, 700], radius=40, fill=(26, 28, 30, 255))
d.polygon([(700, 440), (830, 520), (860, 700), (700, 700)], fill=(26, 28, 30, 255))
d.polygon([(720, 470), (810, 530), (820, 600), (720, 600)], fill=(255, 212, 0, 255))
for cx in (320, 740):
    d.ellipse([cx - 90, 630, cx + 90, 810], fill=(26, 28, 30, 255))
    d.ellipse([cx - 40, 680, cx + 40, 760], fill=(255, 143, 194, 255))
d.rectangle([220, 450, 650, 510], fill=(255, 143, 194, 255))
img.save("app-icon.png")
print("wrote app-icon.png")
