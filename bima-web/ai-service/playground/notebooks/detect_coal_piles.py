import os
import json
import time
from pathlib import Path
import cv2
import numpy as np
import torch
from ultralytics import FastSAM

from coal_volume_estimator import (
    DEFAULT_VESSEL_CONFIG,
    DEFAULT_VALIDATION_CONFIG,
    run_validated_coal_volume_pipeline
)

BASE_DIR = Path(__file__).resolve().parent.parent
IMAGES_DIR = BASE_DIR / "images"
MODELS_DIR = BASE_DIR / "models"
OUTPUT_DIR = BASE_DIR / "image-output"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

def json_converter(o):
    if isinstance(o, (np.integer, np.int32, np.int64)):
        return int(o)
    elif isinstance(o, (np.floating, np.float32, np.float64)):
        return float(o)
    elif isinstance(o, np.ndarray):
        return o.tolist()
    return str(o)

def create_comparison_grid(img_orig, img_s, img_x, title_s, title_x):
    h, w, _ = img_orig.shape
    header_h = 38
    panel_w = w
    panel_h = h + header_h
    
    grid = np.zeros((panel_h, panel_w * 3, 3), dtype=np.uint8)
    grid[:] = (25, 25, 25)
    
    f_scale = 0.55
    thick = 2
    
    grid[header_h:panel_h, 0:w] = img_orig
    cv2.putText(grid, "Original CCTV (Jetty East)", (12, 26), cv2.FONT_HERSHEY_SIMPLEX, f_scale, (255, 255, 255), thick, cv2.LINE_AA)
    
    grid[header_h:panel_h, w:w*2] = img_s
    cv2.putText(grid, title_s, (w + 12, 26), cv2.FONT_HERSHEY_SIMPLEX, f_scale, (0, 220, 255), thick, cv2.LINE_AA)
    
    grid[header_h:panel_h, w*2:w*3] = img_x
    cv2.putText(grid, title_x, (w*2 + 12, 26), cv2.FONT_HERSHEY_SIMPLEX, f_scale, (100, 255, 100), thick, cv2.LINE_AA)
    
    cv2.line(grid, (w, 0), (w, panel_h), (80, 80, 80), 2)
    cv2.line(grid, (w*2, 0), (w*2, panel_h), (80, 80, 80), 2)
    
    return grid

def main():
    img_path = IMAGES_DIR / "coal-piles.jpg"
    if not img_path.exists():
        img_path = IMAGES_DIR / "coal-piles.png"
    if not img_path.exists():
        raise FileNotFoundError("Could not find coal-piles image in playground/images")
        
    print("=" * 85)
    print("ADVANCED CANDIDATE MASK VALIDATION & BASELINE VOLUME ESTIMATION")
    print("=" * 85)
    print(f"Input Image : {img_path.name}")
    print(f"Camera View : Jetty East (Baseline CCTV Stream)")
    
    img_bgr = cv2.imread(str(img_path))
    h, w, _ = img_bgr.shape
    stem = "coal-piles"
    
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Compute Device : {device}")
    
    model_s_path = MODELS_DIR / "FastSAM-s.pt"
    model_x_path = MODELS_DIR / "FastSAM-x.pt"
    
    # -------------------------------------------------------------------------
    # 1. FastSAM-s Inference & Multi-Stage Validation Pipeline
    # -------------------------------------------------------------------------
    print(f"\n[1/2] Running FastSAM-s ({model_s_path.name})...")
    model_s = FastSAM(str(model_s_path))
    t0 = time.time()
    results_s = model_s(str(img_path), device=device, retina_masks=True, imgsz=1024, conf=0.25, iou=0.7, verbose=False)
    time_s = time.time() - t0
    
    masks_s = results_s[0].masks.data.cpu().numpy() if results_s[0].masks is not None else []
    boxes_s = results_s[0].boxes.xyxy.cpu().numpy() if results_s[0].boxes is not None else []
    confs_s = results_s[0].boxes.conf.cpu().numpy() if results_s[0].boxes is not None else []
    
    debug_s_dir = OUTPUT_DIR / "debug_stages_fastsam_s"
    overlay_s, meta_s = run_validated_coal_volume_pipeline(
        img_bgr, "FastSAM-s", masks_s, boxes_s, confs_s,
        camera_name="Jetty East",
        vessel_cfg=DEFAULT_VESSEL_CONFIG,
        val_cfg=DEFAULT_VALIDATION_CONFIG,
        debug_dir=debug_s_dir
    )
    meta_s["inference_time_ms"] = round(time_s * 1000, 2)
    
    # -------------------------------------------------------------------------
    # 2. FastSAM-x Inference & Multi-Stage Validation Pipeline
    # -------------------------------------------------------------------------
    print(f"\n[2/2] Running FastSAM-x ({model_x_path.name})...")
    model_x = FastSAM(str(model_x_path))
    t0 = time.time()
    results_x = model_x(str(img_path), device=device, retina_masks=True, imgsz=1024, conf=0.25, iou=0.7, verbose=False)
    time_x = time.time() - t0
    
    masks_x = results_x[0].masks.data.cpu().numpy() if results_x[0].masks is not None else []
    boxes_x = results_x[0].boxes.xyxy.cpu().numpy() if results_x[0].boxes is not None else []
    confs_x = results_x[0].boxes.conf.cpu().numpy() if results_x[0].boxes is not None else []
    
    debug_x_dir = OUTPUT_DIR / "debug_stages_fastsam_x"
    overlay_x, meta_x = run_validated_coal_volume_pipeline(
        img_bgr, "FastSAM-x", masks_x, boxes_x, confs_x,
        camera_name="Jetty East",
        vessel_cfg=DEFAULT_VESSEL_CONFIG,
        val_cfg=DEFAULT_VALIDATION_CONFIG,
        debug_dir=debug_x_dir
    )
    meta_x["inference_time_ms"] = round(time_x * 1000, 2)
    
    # -------------------------------------------------------------------------
    # 3. Save Visual Artifacts & Comparisons
    # -------------------------------------------------------------------------
    path_vol_s = OUTPUT_DIR / f"{stem}_fastsam_s_volume.jpg"
    path_vol_x = OUTPUT_DIR / f"{stem}_fastsam_x_volume.jpg"
    path_seg_s = OUTPUT_DIR / f"{stem}_fastsam_s_segmented.jpg"
    path_seg_x = OUTPUT_DIR / f"{stem}_fastsam_x_segmented.jpg"
    
    cv2.imwrite(str(path_vol_s), overlay_s)
    cv2.imwrite(str(path_vol_x), overlay_x)
    cv2.imwrite(str(path_seg_s), overlay_s) # Backward compatibility
    cv2.imwrite(str(path_seg_x), overlay_x)
    
    title_s = f"FastSAM-s ({meta_s['total_estimated_volume_m3']:,.1f} m3 | {meta_s['valid_piles_count']} Valid)"
    title_x = f"FastSAM-x ({meta_x['total_estimated_volume_m3']:,.1f} m3 | {meta_x['valid_piles_count']} Valid)"
    comparison_grid = create_comparison_grid(img_bgr, overlay_s, overlay_x, title_s, title_x)
    path_grid = OUTPUT_DIR / f"{stem}_comparison_s_vs_x.jpg"
    cv2.imwrite(str(path_grid), comparison_grid)
    
    # -------------------------------------------------------------------------
    # 4. Save Auditable JSON Metadata (Backward-Compatible)
    # -------------------------------------------------------------------------
    metadata = {
        "image_file": img_path.name,
        "image_dimension": {"width": w, "height": h},
        "camera_streams": {
            "east": {
                "camera_name": "Jetty East",
                "fastsam_s": meta_s,
                "fastsam_x": meta_x,
                "comparison": {
                    "volume_diff_m3": round(abs(meta_s["total_estimated_volume_m3"] - meta_x["total_estimated_volume_m3"]), 2),
                    "volume_ratio_x_over_s": round(meta_x["total_estimated_volume_m3"] / (meta_s["total_estimated_volume_m3"] + 1e-6), 3),
                    "speedup_factor": round(time_x / time_s, 2) if time_s > 0 else 1.0,
                    "comparison_image": f"playground/image-output/{path_grid.name}"
                }
            },
            "west": {
                "camera_name": "Jetty West",
                "status": "Awaiting stream input (Pipeline ready)",
                "total_estimated_volume_m3": None
            }
        },
        # Top-level backward compatibility
        "models": {
            "fastsam_s": {
                "model_name": "FastSAM-s.pt",
                "inference_time_ms": meta_s["inference_time_ms"],
                "candidate_masks_count": meta_s["candidate_masks_count"],
                "discarded_masks_count": meta_s["discarded_masks_count"],
                "valid_piles_count": meta_s["valid_piles_count"],
                "total_estimated_volume_m3": meta_s["total_estimated_volume_m3"],
                "candidate_masks": meta_s["candidate_masks"],
                "final_valid_piles": meta_s["final_valid_piles"],
                "visual_file": f"playground/image-output/{path_vol_s.name}"
            },
            "fastsam_x": {
                "model_name": "FastSAM-x.pt",
                "inference_time_ms": meta_x["inference_time_ms"],
                "candidate_masks_count": meta_x["candidate_masks_count"],
                "discarded_masks_count": meta_x["discarded_masks_count"],
                "valid_piles_count": meta_x["valid_piles_count"],
                "total_estimated_volume_m3": meta_x["total_estimated_volume_m3"],
                "candidate_masks": meta_x["candidate_masks"],
                "final_valid_piles": meta_x["final_valid_piles"],
                "visual_file": f"playground/image-output/{path_vol_x.name}"
            }
        },
        "comparison": {
            "speedup_factor": round(time_x / time_s, 2) if time_s > 0 else 1.0,
            "comparison_image": f"playground/image-output/{path_grid.name}"
        }
    }
    
    meta_path = OUTPUT_DIR / f"{stem}_detection_metadata.json"
    with open(meta_path, "w") as f:
        json.dump(metadata, f, indent=2, default=json_converter)
        
    # -------------------------------------------------------------------------
    # 5. Print Detailed Audit & Rejection Log
    # -------------------------------------------------------------------------
    print("\n" + "=" * 85)
    print("AUDIT & VALIDATION SUMMARY")
    print("=" * 85)
    
    for model_title, meta in [("FastSAM-s", meta_s), ("FastSAM-x", meta_x)]:
        print(f"\n>>> MODEL: {model_title} (Inference: {meta['inference_time_ms']:.1f} ms)")
        print(f"  • Total Raw Candidate Proposals : {meta['candidate_masks_count']}")
        print(f"  • Rejected Non-Coal Proposals   : {meta['discarded_masks_count']}")
        print(f"  • Valid Coal Piles Accepted     : {meta['valid_piles_count']}")
        
        print("\n  [Candidate Decision Breakdown]:")
        for c in meta["candidate_masks"]:
            status_icon = "✓" if c["decision"] == "VALID" else ("⇄" if c["decision"] == "DUPLICATE" else "✗")
            reason_str = f" | Reason: {c['rejection_reason']}" if c['rejection_reason'] else ""
            print(f"    {status_icon} Mask #{c['mask_id']:02d} [{c['decision']:9s}] | "
                  f"Area: {c['raw_area_px']:7d} px | Vessel: {c['inside_vessel_ratio']*100:4.1f}% | "
                  f"CoalSurf: {c['coal_surface_overlap_ratio']*100:4.1f}% | Excl: {c['exclusion_overlap_ratio']*100:4.1f}% | "
                  f"Q-Score: {c['quality_score']:.2f}{reason_str}")
                  
        if meta["valid_piles_count"] > 0:
            print("\n  [Final Valid Coal Piles Volume]:")
            for p in meta["final_valid_piles"]:
                print(f"    • Pile #{p['pile_id']} | Source Mask #{p['source_mask_id']} | Q-Score: {p['quality_score']:.2f} | "
                      f"Area: {p['mask_area_pixels']:,} px | Dim: {p['estimated_length_m']}m x {p['estimated_width_m']}m x {p['estimated_height_m']}m | "
                      f"Volume: {p['estimated_volume_m3']:,.1f} m³")
            print(f"  >>> TOTAL ESTIMATED VOLUME ({model_title}): {meta['total_estimated_volume_m3']:,.1f} m³")
        else:
            print(f"  >>> No valid coal pile detected. Volume estimation skipped (0.0 m³).")

    print("\n" + "=" * 85)
    print("OUTPUT FILES & DEBUG STAGES SAVED:")
    print(f"  • FastSAM-s Debug Stages : {debug_s_dir}")
    print(f"  • FastSAM-x Debug Stages : {debug_x_dir}")
    print(f"  • FastSAM-s Volume Image : {path_vol_s}")
    print(f"  • FastSAM-x Volume Image : {path_vol_x}")
    print(f"  • Side-by-Side Panel     : {path_grid}")
    print(f"  • Audit JSON Metadata    : {meta_path}")
    print("=" * 85)

if __name__ == "__main__":
    main()
