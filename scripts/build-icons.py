from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
SIZE = 512


def main() -> None:
    image = Image.new("RGB", (SIZE, SIZE), "#0b6e6a")
    draw = ImageDraw.Draw(image)
    draw.ellipse((54, 54, 458, 458), outline="#3d8f8b", width=18)
    draw.ellipse((102, 102, 410, 410), fill="#fffdf8")

    bold = ImageFont.truetype(r"C:\Windows\Fonts\calibrib.ttf", 142)
    check_font = ImageFont.truetype(r"C:\Windows\Fonts\seguisym.ttf", 96)
    label = "AHP"
    box = draw.textbbox((0, 0), label, font=bold)
    draw.text(((SIZE - (box[2] - box[0])) / 2, 180), label, fill="#102a43", font=bold)
    draw.text((337, 315), "✓", fill="#f59e0b", font=check_font, anchor="mm")

    PUBLIC.mkdir(parents=True, exist_ok=True)
    image.save(PUBLIC / "icon-512.png", optimize=True)
    image.resize((192, 192), Image.Resampling.LANCZOS).save(PUBLIC / "icon-192.png", optimize=True)


if __name__ == "__main__":
    main()
