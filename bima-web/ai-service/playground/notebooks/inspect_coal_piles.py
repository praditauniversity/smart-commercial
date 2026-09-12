import json
from pathlib import Path
import cv2
import numpy as np
import torch
from ultralytics import FastSAM

BASE_DIR = Path(__file__).resolve().parent.parent
IMAGES_DIR = BASE_DIR / "images"
MODELS_DIR = BASE_DIR / "models"
OUTPUT_DIR = BASE_DIR / "image-output"

def main():
    img_path = IMAGES_DIR / "coal-piles.jpg"
    img_bgr = cv2.imread(str(img_path))
    h, w, _ = img_bgr.shape
    print(f"Image size: {w}x{h}")
    
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model_s = FastSAM(str(MODELS_DIR / "FastSAM-s.pt"))
    model_x = FastSAM(str(MODELS_DIR / "FastSAM-x.pt"))
    
    results_s = model_s(str(img_path), device=device, retina_masks=True, imgsz=1024, conf=0.25, iou=0.7, verbose=False)
    results_x = model_x(str(img_path), device=device, retina_masks=True, imgsz=1024, conf=0.25, iou=0.7, verbose=False)
    
    masks_s = results_s[0].masks.data.cpu().numpy() if results_s[0].masks is not None else []
    masks_x = results_x[0].masks.data.cpu().numpy() if results_x[0].masks is not None else []
    
    print(f"FastSAM-s raw masks: {len(masks_s)}")
    print(f"FastSAM-x raw masks: {len(masks_x)}")
    
    # Analyze barge region
    # The barge in coal-piles.jpg is roughly in bbox [180, 400, 1400, 850]
    # The coal mounds are the dark triangular peaks rising above the barge wall
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    
    # Let's inspect which masks from FastSAM-s and FastSAM-x cover the coal mounds
    for model_name, masks in [("FastSAM-s", masks_s), ("FastSAM-x", masks_x)]:
        print(f"\n--- {model_name} Masks Breakdown ---")
        for i, m in enumerate(masks):
            m_res = cv2.resize(m, (w, h), interpolation=cv2.INTER_NEAREST)
            bin_m = (m_res > 0.5).astype(np.uint8)
            area = int(np.sum(bin_m))
            ys, xs = np.where(bin_m > 0)
            if len(xs) == 0:
                continue
            x1, y1, x2, y2 = int(np.min(xs)), int(np.min(ys)), int(np.max(xs)), int(np.max(ys))
            mean_int = float(cv2.mean(gray, mask=bin_m)[0])
            print(f"  Mask #{i:02d} | Box: [{x1:4d}, {y1:4d}, {x2:4d}, {y2:4d}] | Area: {area:7d} ({area/(w*h)*100:4.1f}%) | MeanInt: {mean_int:5.1f}")

if __name__ == "__main__":
    main()
