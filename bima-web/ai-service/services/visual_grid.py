import io
import base64
from typing import Union, Tuple, Dict, Any, List
from PIL import Image, ImageDraw, ImageFont
from schemas import BBox

def grid_to_pixel_coords(box_2d: List[float], orig_width: int, orig_height: int) -> Dict[str, float]:
    """
    Konversi output koordinat [ymin, xmin, ymax, xmax] skala 0-1000 ke koordinat absolut piksel gambar asli:
    - Pixel X = (xmin / 1000) * Lebar Gambar Asli
    - Pixel Y = (ymin / 1000) * Tinggi Gambar Asli
    - Pixel Width = ((xmax - xmin) / 1000) * Lebar Gambar Asli
    - Pixel Height = ((ymax - ymin) / 1000) * Tinggi Gambar Asli
    """
    if len(box_2d) != 4:
        raise ValueError("box_2d harus berisi 4 elemen: [ymin, xmin, ymax, xmax]")

    ymin, xmin, ymax, xmax = [float(v) for v in box_2d]

    # Handle jika model mengembalikan skala 0.0 - 1.0 alih-alih 0 - 1000
    if ymin <= 1.0 and xmin <= 1.0 and ymax <= 1.0 and xmax <= 1.0 and (ymax > 0.0 or xmax > 0.0):
        ymin *= 1000.0
        xmin *= 1000.0
        ymax *= 1000.0
        xmax *= 1000.0

    # Pastikan orientasi benar (min <= max)
    if ymin > ymax:
        ymin, ymax = ymax, ymin
    if xmin > xmax:
        xmin, xmax = xmax, xmin

    # Clamp ke rentang 0-1000
    ymin = max(0.0, min(1000.0, ymin))
    xmin = max(0.0, min(1000.0, xmin))
    ymax = max(0.0, min(1000.0, ymax))
    xmax = max(0.0, min(1000.0, xmax))

    pixel_x = (xmin / 1000.0) * orig_width
    pixel_y = (ymin / 1000.0) * orig_height
    pixel_width = max(1.0, ((xmax - xmin) / 1000.0) * orig_width)
    pixel_height = max(1.0, ((ymax - ymin) / 1000.0) * orig_height)

    return {
        "pixel_x": round(pixel_x, 2),
        "pixel_y": round(pixel_y, 2),
        "pixel_width": round(pixel_width, 2),
        "pixel_height": round(pixel_height, 2),
        "orig_width": orig_width,
        "orig_height": orig_height,
    }

def grid_to_normalized_bbox(box_2d: List[float], min_size: float = 0.01) -> BBox:
    """
    Konversi output koordinat [ymin, xmin, ymax, xmax] skala 0-1000 ke BBox normalisasi (0.0 - 1.0).
    Menjaga letak dan proporsi bounding box asli tanpa distorsi clamping buatan.
    """
    if len(box_2d) != 4:
        raise ValueError("box_2d harus berisi 4 elemen: [ymin, xmin, ymax, xmax]")

    ymin, xmin, ymax, xmax = [float(v) for v in box_2d]

    # Handle normalisasi jika skala 0-1000
    if ymin > 1.0 or xmin > 1.0 or ymax > 1.0 or xmax > 1.0:
        ymin /= 1000.0
        xmin /= 1000.0
        ymax /= 1000.0
        xmax /= 1000.0

    if ymin > ymax:
        ymin, ymax = ymax, ymin
    if xmin > xmax:
        xmin, xmax = xmax, xmin

    xmin = max(0.0, min(1.0, xmin))
    ymin = max(0.0, min(1.0, ymin))
    xmax = max(0.0, min(1.0, xmax))
    ymax = max(0.0, min(1.0, ymax))

    w = max(min_size, xmax - xmin)
    h = max(min_size, ymax - ymin)

    x = min(xmin, 1.0 - w)
    y = min(ymin, 1.0 - h)

    return BBox(
        x=round(x, 4),
        y=round(y, 4),
        width=round(min(1.0 - x, w), 4),
        height=round(min(1.0 - y, h), 4)
    )

def apply_visual_grid_overlay(
    image_input: Union[str, bytes, Image.Image],
    grid_divisions: int = 10,
    show_labels: bool = True,
    line_alpha: int = 90,
    sub_line_alpha: int = 40,
    output_format: str = "JPEG",
    jpeg_quality: int = 92
) -> str:
    """
    Menerapkan Visual Grid Overlay pada citra sebelum dikirim ke AI Vision Model.
    - Menghasilkan kisi koordinat 0 s.d. 1000 (default 10 divisi = langkah per 100 unit).
    - Menambahkan label koordinat numerik di batas atas dan kiri agar VLM dapat membidik
      koordinat objek/kerusakan secara langsung tanpa meleset.
    - Mengembalikan gambar ber-grid dalam format base64 string.
    """
    # 1. Load image to PIL RGBA
    if isinstance(image_input, Image.Image):
        base_img = image_input.convert("RGBA")
    elif isinstance(image_input, bytes):
        base_img = Image.open(io.BytesIO(image_input)).convert("RGBA")
    elif isinstance(image_input, str):
        # Base64 string or data URL
        raw_b64 = image_input.split(",")[1] if "," in image_input else image_input
        img_bytes = base64.b64decode(raw_b64)
        base_img = Image.open(io.BytesIO(img_bytes)).convert("RGBA")
    else:
        raise TypeError("Format image_input tidak didukung. Gunakan base64 str, bytes, atau PIL Image.")

    width, height = base_img.size

    # 2. Buat overlay transparan untuk grid dan label
    overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    # Coba load default font atau bitmap font
    try:
        font = ImageFont.load_default()
    except Exception:
        font = None

    # Garis kisi utama (interval 100 dalam skala 0-1000 -> grid_divisions=10)
    # Warna garis utama: Cyan cerah semi-transparan (0, 220, 255)
    main_line_color = (0, 225, 255, line_alpha)
    # Garis kisi sekunder (interval 50 dalam skala 0-1000)
    sub_line_color = (255, 255, 255, sub_line_alpha)

    # Gambar garis sekunder (step 50)
    for i in range(1, grid_divisions * 2):
        if i % 2 != 0:
            # Sumbu X (vertikal)
            x = int((i / (grid_divisions * 2)) * width)
            draw.line([(x, 0), (x, height)], fill=sub_line_color, width=1)

            # Sumbu Y (horizontal)
            y = int((i / (grid_divisions * 2)) * height)
            draw.line([(0, y), (width, y)], fill=sub_line_color, width=1)

    # Gambar garis utama (step 100) dan label
    for i in range(0, grid_divisions + 1):
        coord_val = int((i / grid_divisions) * 1000)
        x = int((i / grid_divisions) * width)
        y = int((i / grid_divisions) * height)

        # Pastikan tidak out of bound gambar
        x = min(x, width - 1)
        y = min(y, height - 1)

        # Garis kisi utama
        draw.line([(x, 0), (x, height)], fill=main_line_color, width=1)
        draw.line([(0, y), (width, y)], fill=main_line_color, width=1)

        if show_labels:
            label_text = str(coord_val)

            # Label pada sumbu X (ditempatkan di bagian atas dan bawah gambar)
            if 0 < x < width - 10:
                # Background badge untuk teks sumbu X atas
                draw.rectangle([x - 14, 2, x + 14, 14], fill=(0, 0, 0, 180))
                draw.text((x - 11, 2), label_text, fill=(0, 255, 255, 255), font=font)

            # Label pada sumbu Y (ditempatkan di bagian kiri gambar)
            if 0 < y < height - 10:
                # Background badge untuk teks sumbu Y kiri
                draw.rectangle([2, y - 6, 26, y + 6], fill=(0, 0, 0, 180))
                draw.text((3, y - 5), label_text, fill=(255, 255, 0, 255), font=font)

    # 3. Alpha composite overlay dengan gambar asli
    result_img = Image.alpha_composite(base_img, overlay).convert("RGB")

    # 4. Export ke base64
    buffer = io.BytesIO()
    result_img.save(buffer, format=output_format, quality=jpeg_quality)
    encoded_b64 = base64.b64encode(buffer.getvalue()).decode("utf-8")

    return encoded_b64
