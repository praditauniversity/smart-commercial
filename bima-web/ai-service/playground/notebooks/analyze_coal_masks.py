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
    
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model_s = FastSAM(str(MODELS_DIR / "FastSAM-s.pt"))
    model_x = FastSAM(str(MODELS_DIR / "FastSAM-x.pt"))
    
    # Infer
    results_s = model_s(str(img_path), device=device, retina_masks=True, imgsz=1024, conf=0.25, iou=0.7, verbose=False)
    results_x = model_x(str(img_path), device=device, retina_masks=True, imgsz=1024, conf=0.25, iou=0.7, verbose=False)
    
    masks_s = results_s[0].masks.data.cpu().numpy() if results_s[0].masks is not None else []
    masks_x = results_x[0].masks.data.cpu().numpy() if results_x[0].masks is not None else []
    
    # Save a contact sheet with each candidate mask numbered to understand what FastSAM detected
    def dump_candidates(masks, name):
        canvas_dir = OUTPUT_DIR / f"candidates_{name}"
        canvas_dir.mkdir(exist_ok=True)
        summary = []
        for i, m in enumerate(masks):
            m_res = cv2.resize(m, (w, h), interpolation=cv2.INTER_NEAREST)
            bin_m = (m_res > 0.5).astype(np.uint8)
            area = int(np.sum(bin_m))
            ys, xs = np.where(bin_m > 0)
            if len(xs) == 0:
                continue
            x1, y1, x2, y2 = int(np.min(xs)), int(np.min(ys)), int(np.max(xs)), int(np.max(ys))
            gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
            mean_intensity = float(cv2.mean(gray, mask=bin_m)[0])
            
            # Draw preview
            vis = img_bgr.copy()
            colored = np.zeros_like(vis)
            colored[bin_m > 0] = (0, 255, 0)
            vis[bin_m > 0] = cv2.addWeighted(vis, 0.4, colored, 0.6, 0)[bin_m > 0]
            cv2.rectangle(vis, (x1, y1), (x2, y2), (0, 0, 255), 2)
            cv2.putText(vis, f"Mask #{i} Area:{area} MeanInt:{mean_intensity:.1f}", (x1, max(30, y1-10)), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
            cv2.imwrite(str(canvas_dir / f"mask_{i:02d}.jpg"), vis)
            
            summary.append({
                "index": i,
                "bbox": [x1, y1, x2, y2],
                "area": area,
                "area_pct": round(area / (w * h) * 100, 2),
                "mean_intensity": round(mean_intensity, 1)
            })
        with open(OUTPUT_DIR / f"candidates_{name}_summary.json", "w") as f:
            json.dump(summary, f, indent=2)
        print(f"Dumped {len(summary)} candidates for {name}")

    dump_candidates(masks_s, "fastsam_s")
    dump_candidates(masks_x, "fastsam_x")

if __name__ == "__main__":
    main()
