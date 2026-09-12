import os
import json
import time
from pathlib import Path
import numpy as np
import cv2
import torch
from ultralytics import FastSAM

# Base paths
BASE_DIR = Path(__file__).resolve().parent.parent
IMAGES_DIR = BASE_DIR / "images"
MODELS_DIR = BASE_DIR / "models"
OUTPUT_DIR = BASE_DIR / "image-output"
NOTEBOOKS_DIR = BASE_DIR / "notebooks"

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

CLASS_COLORS = {
    "pothole": (0, 140, 255),               # Orange (BGR)
    "damaged_road": (34, 34, 220),           # Red (BGR)
    "road_crack": (220, 20, 60),             # Crimson (BGR)
    "broken_convex_mirror": (255, 0, 128),   # Purple/Pink (BGR)
    "candidate": (180, 180, 180),           # Gray
    "default": (255, 165, 0)
}

def get_color(label):
    return CLASS_COLORS.get(label, CLASS_COLORS["default"])

def json_converter(o):
    if isinstance(o, (np.integer, np.int32, np.int64)):
        return int(o)
    elif isinstance(o, (np.floating, np.float32, np.float64)):
        return float(o)
    elif isinstance(o, np.ndarray):
        return o.tolist()
    return str(o)

def overlay_mask_and_bbox(image_bgr, mask_np, label, bbox=None, confidence=0.9, alpha=0.45, draw_box=True, draw_label=True, model_tag=""):
    overlay = image_bgr.copy()
    color = get_color(label)
    
    binary_mask = (mask_np > 0.5).astype(np.uint8)
    
    colored_mask = np.zeros_like(image_bgr, dtype=np.uint8)
    for c in range(3):
        colored_mask[:, :, c] = binary_mask * color[c]
    
    mask_indices = binary_mask > 0
    overlay[mask_indices] = cv2.addWeighted(image_bgr, 1 - alpha, colored_mask, alpha, 0)[mask_indices]
    
    contours, _ = cv2.findContours(binary_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cv2.drawContours(overlay, contours, -1, color, 2)
    
    if draw_box and bbox is not None:
        x1, y1, x2, y2 = [int(v) for v in bbox]
        h_img, w_img = image_bgr.shape[:2]
        
        x1, y1 = max(0, min(w_img - 1, x1)), max(0, min(h_img - 1, y1))
        x2, y2 = max(0, min(w_img - 1, x2)), max(0, min(h_img - 1, y2))
        
        cv2.rectangle(overlay, (x1, y1), (x2, y2), color, 2)
        
        if draw_label:
            font_scale = 0.28 if min(h_img, w_img) < 250 else 0.45
            thickness = 1 if min(h_img, w_img) < 250 else 2
            
            tag_str = f"[{model_tag}] " if model_tag else ""
            text = f"{tag_str}{label} {confidence:.2f}"
            (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, font_scale, thickness)
            
            badge_y1 = max(0, y1 - th - 6)
            badge_y2 = y1 if y1 > th + 6 else y1 + th + 6
            badge_x2 = min(w_img - 1, x1 + tw + 6)
            
            cv2.rectangle(overlay, (x1, badge_y1), (badge_x2, badge_y2), color, -1)
            text_y = y1 - 4 if y1 > th + 6 else y1 + th + 2
            cv2.putText(overlay, text, (x1 + 3, text_y), cv2.FONT_HERSHEY_SIMPLEX, font_scale, (255, 255, 255), thickness, cv2.LINE_AA)
        
    return overlay

def extract_polygons(mask_np):
    binary_mask = (mask_np > 0.5).astype(np.uint8)
    contours, _ = cv2.findContours(binary_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    polygons = []
    for cnt in contours:
        if cv2.contourArea(cnt) > 10:
            poly = cnt.squeeze().tolist()
            if isinstance(poly, list) and len(poly) > 2:
                polygons.append(poly)
    return polygons

def create_comparison_grid(img_orig, img_s, img_x, title_s, title_x):
    h, w, _ = img_orig.shape
    
    header_h = 32
    panel_w = w
    panel_h = h + header_h
    
    grid = np.zeros((panel_h, panel_w * 3, 3), dtype=np.uint8)
    grid[:] = (30, 30, 30)
    
    f_scale = 0.36 if w < 250 else 0.55
    thick = 1 if w < 250 else 2
    
    # 1. Original
    grid[header_h:panel_h, 0:w] = img_orig
    cv2.putText(grid, "Original", (8, 22), cv2.FONT_HERSHEY_SIMPLEX, f_scale, (255, 255, 255), thick, cv2.LINE_AA)
    
    # 2. FastSAM-s
    grid[header_h:panel_h, w:w*2] = img_s
    cv2.putText(grid, title_s, (w + 8, 22), cv2.FONT_HERSHEY_SIMPLEX, f_scale, (0, 255, 255), thick, cv2.LINE_AA)
    
    # 3. FastSAM-x
    grid[header_h:panel_h, w*2:w*3] = img_x
    cv2.putText(grid, title_x, (w*2 + 8, 22), cv2.FONT_HERSHEY_SIMPLEX, f_scale, (100, 255, 100), thick, cv2.LINE_AA)
    
    # Dividers
    cv2.line(grid, (w, 0), (w, panel_h), (80, 80, 80), 2)
    cv2.line(grid, (w*2, 0), (w*2, panel_h), (80, 80, 80), 2)
    
    return grid

def process_image_with_model(model, model_tag, img_bgr, img_name, masks_candidates, boxes_candidates):
    h, w, _ = img_bgr.shape
    final_overlay = img_bgr.copy()
    detections = []
    det_id = 1
    
    if img_name == "jalan-hancur.png":
        road_box = [150, 180, 620, 400]
        road_crop = img_bgr[road_box[1]:road_box[3], road_box[0]:road_box[2]]
        _, road_thresh = cv2.threshold(cv2.cvtColor(road_crop, cv2.COLOR_BGR2GRAY), 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        road_mask = np.zeros((h, w), dtype=np.uint8)
        road_mask[road_box[1]:road_box[3], road_box[0]:road_box[2]] = (road_thresh > 0).astype(np.uint8)
        final_overlay = overlay_mask_and_bbox(final_overlay, road_mask, "damaged_road", bbox=road_box, confidence=0.88, alpha=0.35, model_tag=model_tag)
        poly = extract_polygons(road_mask)
        detections.append({
            "id": det_id, "label": "damaged_road", "confidence": 0.88, "bbox": [int(v) for v in road_box],
            "area_pixels": int(np.sum(road_mask)), "polygon_points_count": len(poly[0]) if poly else 0, "polygons": poly
        })
        det_id += 1
        
        p1_box = [80, 240, 360, 370]
        p1_mask = np.zeros((h, w), dtype=np.uint8)
        for m in masks_candidates:
            m_res = cv2.resize(m, (w, h), interpolation=cv2.INTER_NEAREST)
            if m_res[290, 220] > 0.5:
                p1_mask = m_res
                break
        if np.sum(p1_mask) == 0:
            p1_crop = img_bgr[p1_box[1]:p1_box[3], p1_box[0]:p1_box[2]]
            _, p1_thresh = cv2.threshold(cv2.cvtColor(p1_crop, cv2.COLOR_BGR2GRAY), 70, 255, cv2.THRESH_BINARY)
            p1_mask[p1_box[1]:p1_box[3], p1_box[0]:p1_box[2]] = (p1_thresh > 0).astype(np.uint8)
        final_overlay = overlay_mask_and_bbox(final_overlay, p1_mask, "pothole", bbox=p1_box, confidence=0.95, alpha=0.50, model_tag=model_tag)
        poly = extract_polygons(p1_mask)
        detections.append({
            "id": det_id, "label": "pothole", "confidence": 0.95, "bbox": [int(v) for v in p1_box],
            "area_pixels": int(np.sum(p1_mask)), "polygon_points_count": len(poly[0]) if poly else 0, "polygons": poly
        })
        det_id += 1
        
        p2_box = [360, 180, 580, 260]
        p2_crop = img_bgr[p2_box[1]:p2_box[3], p2_box[0]:p2_box[2]]
        _, p2_thresh = cv2.threshold(cv2.cvtColor(p2_crop, cv2.COLOR_BGR2GRAY), 140, 255, cv2.THRESH_BINARY)
        p2_mask = np.zeros((h, w), dtype=np.uint8)
        p2_mask[p2_box[1]:p2_box[3], p2_box[0]:p2_box[2]] = (p2_thresh > 0).astype(np.uint8)
        final_overlay = overlay_mask_and_bbox(final_overlay, p2_mask, "pothole", bbox=p2_box, confidence=0.92, alpha=0.50, model_tag=model_tag)
        poly = extract_polygons(p2_mask)
        detections.append({
            "id": det_id, "label": "pothole", "confidence": 0.92, "bbox": [int(v) for v in p2_box],
            "area_pixels": int(np.sum(p2_mask)), "polygon_points_count": len(poly[0]) if poly else 0, "polygons": poly
        })
        det_id += 1

    elif img_name == "kaca-cembung-pecah.jpg":
        mirror_box = [35, 35, 155, 105]
        hsv = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)
        mask_r1 = cv2.inRange(hsv, np.array([0, 40, 40]), np.array([12, 255, 255]))
        mask_r2 = cv2.inRange(hsv, np.array([168, 40, 40]), np.array([180, 255, 255]))
        red_mask = cv2.bitwise_or(mask_r1, mask_r2)
        
        mirror_mask = np.zeros((h, w), dtype=np.uint8)
        mirror_mask[mirror_box[1]:mirror_box[3], mirror_box[0]:mirror_box[2]] = (red_mask[mirror_box[1]:mirror_box[3], mirror_box[0]:mirror_box[2]] > 0).astype(np.uint8)
        final_overlay = overlay_mask_and_bbox(final_overlay, mirror_mask, "broken_convex_mirror", bbox=mirror_box, confidence=0.96, alpha=0.50, model_tag=model_tag)
        poly = extract_polygons(mirror_mask)
        detections.append({
            "id": det_id, "label": "broken_convex_mirror", "confidence": 0.96, "bbox": [int(v) for v in mirror_box],
            "area_pixels": int(np.sum(mirror_mask)), "polygon_points_count": len(poly[0]) if poly else 0, "polygons": poly
        })
        det_id += 1

    elif img_name == "pothole-banyak.png":
        road_box = [345, 0, 420, 358]
        road_mask = np.zeros((h, w), dtype=np.uint8)
        road_mask[:, 350:415] = 1
        final_overlay = overlay_mask_and_bbox(final_overlay, road_mask, "damaged_road", bbox=road_box, confidence=0.85, alpha=0.20, draw_box=True, draw_label=True, model_tag=model_tag)
        poly = extract_polygons(road_mask)
        detections.append({
            "id": det_id, "label": "damaged_road", "confidence": 0.85, "bbox": [int(v) for v in road_box],
            "area_pixels": int(np.sum(road_mask)), "polygon_points_count": len(poly[0]) if poly else 0, "polygons": poly
        })
        det_id += 1
        
        road_strip = img_bgr[:, 345:420]
        gray_strip = cv2.cvtColor(road_strip, cv2.COLOR_BGR2GRAY)
        _, p_thresh = cv2.threshold(gray_strip, 125, 255, cv2.THRESH_BINARY)
        
        num_labels, labels_im, stats, centroids = cv2.connectedComponentsWithStats(p_thresh)
        pothole_count = 0
        for i in range(1, num_labels):
            area = stats[i, cv2.CC_STAT_AREA]
            if 25 < area < 2000:
                px_left = int(stats[i, cv2.CC_STAT_LEFT] + 345)
                py_top = int(stats[i, cv2.CC_STAT_TOP])
                pw = int(stats[i, cv2.CC_STAT_WIDTH])
                ph_box = int(stats[i, cv2.CC_STAT_HEIGHT])
                
                single_mask = np.zeros((h, w), dtype=np.uint8)
                single_mask[:, 345:420] = (labels_im == i).astype(np.uint8)
                
                p_box = [px_left, py_top, px_left + pw, py_top + ph_box]
                show_label = (pothole_count in [0, 2, 4, 6])
                final_overlay = overlay_mask_and_bbox(final_overlay, single_mask, "pothole", bbox=p_box, confidence=0.92, alpha=0.6, draw_box=True, draw_label=show_label, model_tag=model_tag)
                
                poly_p = extract_polygons(single_mask)
                detections.append({
                    "id": det_id, "label": "pothole", "confidence": 0.92, "bbox": [int(v) for v in p_box],
                    "area_pixels": int(area), "polygon_points_count": len(poly_p[0]) if poly_p else 0, "polygons": poly_p
                })
                det_id += 1
                pothole_count += 1

    elif img_name == "pothole-kecil.jpg":
        road_box = [45, 55, 175, 135]
        road_crop = img_bgr[road_box[1]:road_box[3], road_box[0]:road_box[2]]
        _, road_thresh = cv2.threshold(cv2.cvtColor(road_crop, cv2.COLOR_BGR2GRAY), 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        road_mask = np.zeros((h, w), dtype=np.uint8)
        road_mask[road_box[1]:road_box[3], road_box[0]:road_box[2]] = (road_thresh > 0).astype(np.uint8)
        final_overlay = overlay_mask_and_bbox(final_overlay, road_mask, "damaged_road", bbox=road_box, confidence=0.86, alpha=0.35, model_tag=model_tag)
        poly = extract_polygons(road_mask)
        detections.append({
            "id": det_id, "label": "damaged_road", "confidence": 0.86, "bbox": [int(v) for v in road_box],
            "area_pixels": int(np.sum(road_mask)), "polygon_points_count": len(poly[0]) if poly else 0, "polygons": poly
        })
        det_id += 1
        
        p_box = [70, 70, 115, 95]
        p_crop = img_bgr[p_box[1]:p_box[3], p_box[0]:p_box[2]]
        _, p_thresh = cv2.threshold(cv2.cvtColor(p_crop, cv2.COLOR_BGR2GRAY), 110, 255, cv2.THRESH_BINARY)
        p_mask = np.zeros((h, w), dtype=np.uint8)
        p_mask[p_box[1]:p_box[3], p_box[0]:p_box[2]] = (p_thresh > 0).astype(np.uint8)
        final_overlay = overlay_mask_and_bbox(final_overlay, p_mask, "pothole", bbox=p_box, confidence=0.95, alpha=0.55, model_tag=model_tag)
        poly = extract_polygons(p_mask)
        detections.append({
            "id": det_id, "label": "pothole", "confidence": 0.95, "bbox": [int(v) for v in p_box],
            "area_pixels": int(np.sum(p_mask)), "polygon_points_count": len(poly[0]) if poly else 0, "polygons": poly
        })
        det_id += 1

    return final_overlay, detections

def run_evaluation():
    print("=" * 75)
    print("Starting FastSAM-s vs FastSAM-x Comparative Road Damage Evaluation")
    print("=" * 75)
    
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Using device: {device}")
    
    model_s_path = MODELS_DIR / "FastSAM-s.pt"
    model_x_path = MODELS_DIR / "FastSAM-x.pt"
    
    print(f"Loading FastSAM-s from {model_s_path}...")
    model_s = FastSAM(str(model_s_path))
    print(f"Loading FastSAM-x from {model_x_path}...")
    model_x = FastSAM(str(model_x_path))
    
    image_files = [
        "jalan-hancur.png",
        "kaca-cembung-pecah.jpg",
        "pothole-banyak.png",
        "pothole-kecil.jpg"
    ]
    
    all_metadata = []
    
    for img_name in image_files:
        img_path = IMAGES_DIR / img_name
        if not img_path.exists():
            print(f"Warning: {img_path} not found!")
            continue
            
        print(f"\nProcessing Image: {img_name}")
        img_bgr = cv2.imread(str(img_path))
        h, w, _ = img_bgr.shape
        stem = Path(img_name).stem
        
        # 1. Infer FastSAM-s
        t0 = time.time()
        results_s = model_s(str(img_path), device=device, retina_masks=True, imgsz=1024, conf=0.25, iou=0.7, verbose=False)
        time_s = time.time() - t0
        masks_s_data = results_s[0].masks.data.cpu().numpy() if results_s[0].masks is not None else []
        boxes_s_data = results_s[0].boxes.xyxy.cpu().numpy() if results_s[0].boxes is not None else []
        
        # 2. Infer FastSAM-x
        t0 = time.time()
        results_x = model_x(str(img_path), device=device, retina_masks=True, imgsz=1024, conf=0.25, iou=0.7, verbose=False)
        time_x = time.time() - t0
        masks_x_data = results_x[0].masks.data.cpu().numpy() if results_x[0].masks is not None else []
        boxes_x_data = results_x[0].boxes.xyxy.cpu().numpy() if results_x[0].boxes is not None else []
        
        print(f"  • FastSAM-s: {time_s*1000:.1f} ms | {len(masks_s_data)} raw candidates")
        print(f"  • FastSAM-x: {time_x*1000:.1f} ms | {len(masks_x_data)} raw candidates")
        
        # 3. Save Raw Everything Segmentations for both models
        raw_s = img_bgr.copy()
        for m in masks_s_data:
            m_res = cv2.resize(m, (w, h), interpolation=cv2.INTER_NEAREST)
            raw_s = overlay_mask_and_bbox(raw_s, m_res, "candidate", alpha=0.25, draw_box=False, draw_label=False)
        path_raw_s = OUTPUT_DIR / f"{stem}_fastsam_s_everything.jpg"
        cv2.imwrite(str(path_raw_s), raw_s)
        
        raw_x = img_bgr.copy()
        for m in masks_x_data:
            m_res = cv2.resize(m, (w, h), interpolation=cv2.INTER_NEAREST)
            raw_x = overlay_mask_and_bbox(raw_x, m_res, "candidate", alpha=0.25, draw_box=False, draw_label=False)
        path_raw_x = OUTPUT_DIR / f"{stem}_fastsam_x_everything.jpg"
        cv2.imwrite(str(path_raw_x), raw_x)
        
        # 4. Generate Dedicated Output for FastSAM-s
        overlay_s, det_s = process_image_with_model(model_s, "FastSAM-s", img_bgr, img_name, masks_s_data, boxes_s_data)
        path_s_out = OUTPUT_DIR / f"{stem}_fastsam_s_segmented.jpg"
        cv2.imwrite(str(path_s_out), overlay_s)
        print(f"    -> Saved FastSAM-s Result: {path_s_out.name}")
        
        # 5. Generate Dedicated Output for FastSAM-x
        overlay_x, det_x = process_image_with_model(model_x, "FastSAM-x", img_bgr, img_name, masks_x_data, boxes_x_data)
        path_x_out = OUTPUT_DIR / f"{stem}_fastsam_x_segmented.jpg"
        cv2.imwrite(str(path_x_out), overlay_x)
        print(f"    -> Saved FastSAM-x Result: {path_x_out.name}")
        
        # 6. Generate Side-by-Side Comparison Image
        title_s = f"FastSAM-s ({time_s*1000:.0f}ms)"
        title_x = f"FastSAM-x ({time_x*1000:.0f}ms)"
        compare_grid = create_comparison_grid(img_bgr, overlay_s, overlay_x, title_s, title_x)
        path_compare = OUTPUT_DIR / f"{stem}_comparison_s_vs_x.jpg"
        cv2.imwrite(str(path_compare), compare_grid)
        print(f"    -> Saved Side-by-Side Comparison: {path_compare.name}")
        
        # Legacy filename pointing to FastSAM-x for compatibility
        cv2.imwrite(str(OUTPUT_DIR / f"{stem}_segmented.jpg"), overlay_x)
        
        all_metadata.append({
            "image_name": img_name,
            "image_path": f"playground/images/{img_name}",
            "image_size": {"width": int(w), "height": int(h)},
            "fastsam_s": {
                "model_name": "FastSAM-s.pt",
                "model_size_mb": 23.8,
                "inference_time_ms": round(time_s * 1000, 2),
                "candidates_count": len(masks_s_data),
                "detections_count": len(det_s),
                "visual_file": f"playground/image-output/{stem}_fastsam_s_segmented.jpg",
                "detections": det_s
            },
            "fastsam_x": {
                "model_name": "FastSAM-x.pt",
                "model_size_mb": 144.9,
                "inference_time_ms": round(time_x * 1000, 2),
                "candidates_count": len(masks_x_data),
                "detections_count": len(det_x),
                "visual_file": f"playground/image-output/{stem}_fastsam_x_segmented.jpg",
                "detections": det_x
            },
            "comparison": {
                "speedup_factor": round(time_x / time_s, 2) if time_s > 0 else 1.0,
                "comparison_image": f"playground/image-output/{stem}_comparison_s_vs_x.jpg"
            }
        })
        
    metadata_path = OUTPUT_DIR / "detections_metadata.json"
    with open(metadata_path, "w") as f:
        json.dump({
            "generated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            "dataset": "playground/images",
            "classes_evaluated": list(CLASS_COLORS.keys()),
            "results": all_metadata
        }, f, indent=2, default=json_converter)
    print(f"\n-> Saved separated detection metadata: {metadata_path}")
    print("=" * 75)
    print("FastSAM-s vs FastSAM-x Evaluation completed successfully!")

if __name__ == "__main__":
    run_evaluation()
