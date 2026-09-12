"""
Coal Pile Volume Baseline Estimator
-----------------------------------
A modular, data-driven, 2D geometric baseline volume estimation module.
Strictly accepts ONLY validated coal pile masks from the multi-stage validation pipeline.

Key properties:
- No depth models (Depth Anything, monocular depth, stereo).
- No point clouds, 3D meshes, visual hulls, or voxels.
- No machine learning regression for volume.
- Zero hardcoded coal pile polygons or fixed volume values.
- Centralized physical vessel reference & perspective scaling.
- Transparent, auditable calculations per pile and total.
"""

import json
import time
from pathlib import Path
from typing import Dict, List, Any, Tuple, Optional
import cv2
import numpy as np

# Import the multi-stage validator module
from coal_mask_validator import (
    DEFAULT_VALIDATION_CONFIG,
    validate_and_filter_masks,
    generate_debug_pipeline_visualizations
)


# =============================================================================
# 1. CENTRALIZED PHYSICAL VESSEL CONFIGURATION
# =============================================================================

DEFAULT_VESSEL_CONFIG: Dict[str, Any] = {
    "vessel_type": "Standard Coal Deck Barge (230ft - 300ft Class)",
    "description": "Baseline physical dimensions of standard coal transport barge. Configurable for calibration.",
    
    # 1. Known nominal physical dimensions of the barge cargo hold (meters):
    "cargo_deck_length_m": 70.0,       # Nominal cargo hold length (meters)
    "cargo_deck_width_m": 19.0,        # Nominal cargo hold width (meters)
    "cargo_side_wall_height_m": 4.5,   # Nominal side-board wall height (meters)
    
    # 2. Reference visible pixel envelope of the cargo hold in 1600x900 camera frame:
    "vessel_ref_box_px": {
        "x_min": 450,
        "y_min": 360,
        "x_max": 1480,
        "y_max": 860
    },
    
    # 3. Perspective-aware longitudinal scale (meters per pixel along deck length):
    "perspective_scale": {
        "m_per_px_far_y360": 0.085,    # Top/far end of barge (~70m / ~820px horizontal span)
        "m_per_px_near_y860": 0.065,   # Bottom/near end of barge
        "y_ref_far": 360,
        "y_ref_near": 860
    },
    
    # 4. Oblique camera elevation foreshortening correction for vertical pile height:
    "height_calibration": {
        "elevation_foreshortening_factor": 0.32,  # Correction factor for oblique perspective on vertical height
        "max_pile_height_limit_m": 10.0          # Physical safety clamp (coal heap rarely exceeds 8-10m on deck)
    },
    
    # 5. Volumetric shape factor for conical-prismoidal heaps:
    # Pure cone = 0.33, Ellipsoidal cap = 0.52, Prismoidal ridge = 0.45
    "shape_factor": 0.45,
    "shape_factor_note": "Baseline conical-prismoidal factor. Must be calibrated against surveyor draft surveys / ground truth."
}


# =============================================================================
# 2. PIXEL TO METER CONVERSION & DIMENSION ESTIMATION
# =============================================================================

def get_perspective_scale(centroid_y: float, vessel_cfg: Dict[str, Any] = DEFAULT_VESSEL_CONFIG) -> float:
    """Calculates perspective-aware scale (meters per pixel) based on object centroid Y position."""
    p_cfg = vessel_cfg["perspective_scale"]
    y_far = p_cfg["y_ref_far"]
    y_near = p_cfg["y_ref_near"]
    scale_far = p_cfg["m_per_px_far_y360"]
    scale_near = p_cfg["m_per_px_near_y860"]
    
    t = np.clip((centroid_y - y_far) / (y_near - y_far + 1e-6), 0.0, 1.0)
    m_per_px = scale_far + t * (scale_near - scale_far)
    return float(m_per_px)

def estimate_pile_dimensions(
    pile_geom: Dict[str, Any],
    vessel_cfg: Dict[str, Any] = DEFAULT_VESSEL_CONFIG
) -> Dict[str, float]:
    """Estimates physical 3D dimensions (Length, Width, Height in meters) from 2D mask metrics."""
    centroid_y = pile_geom["centroid"][1] if "centroid" in pile_geom else 500.0
    m_per_px = get_perspective_scale(centroid_y, vessel_cfg)
    
    if "geometry_metrics" in pile_geom:
        bw = pile_geom["geometry_metrics"]["bbox_w"]
        bh = pile_geom["geometry_metrics"]["bbox_h"]
    elif "bbox_w" in pile_geom:
        bw = pile_geom["bbox_w"]
        bh = pile_geom["bbox_h"]
    elif "bbox" in pile_geom and len(pile_geom["bbox"]) >= 4:
        bw = pile_geom["bbox"][2] - pile_geom["bbox"][0]
        bh = pile_geom["bbox"][3] - pile_geom["bbox"][1]
    else:
        bw, bh = 100, 50
        
    area_px = pile_geom.get("raw_area_px", pile_geom.get("area_pixels", pile_geom.get("mask_area_pixels", bw * bh)))
    
    # 1. Estimated length along barge deck
    est_length_m = bw * m_per_px
    est_length_m = min(est_length_m, vessel_cfg["cargo_deck_length_m"])
    
    # 2. Estimated width across barge deck
    v_box = vessel_cfg["vessel_ref_box_px"]
    v_pixel_height = v_box["y_max"] - v_box["y_min"]
    depth_ratio = np.clip((bh * 1.4) / (v_pixel_height + 1e-6), 0.40, 1.0)
    est_width_m = vessel_cfg["cargo_deck_width_m"] * depth_ratio
    
    # 3. Estimated vertical height above cargo deck
    h_cal = vessel_cfg.get("height_calibration", {})
    elevation_factor = h_cal.get("elevation_foreshortening_factor", 0.32)
    max_height_limit = h_cal.get("max_pile_height_limit_m", 10.0)
    
    raw_h = bh * m_per_px * elevation_factor
    est_height_m = np.clip(raw_h, 1.5, max_height_limit)
    
    # 4. Estimated 2D footprint area
    est_footprint_m2 = area_px * (m_per_px ** 2)
    
    return {
        "m_per_px_scale": round(m_per_px, 4),
        "estimated_length_m": round(float(est_length_m), 2),
        "estimated_width_m": round(float(est_width_m), 2),
        "estimated_height_m": round(float(est_height_m), 2),
        "estimated_footprint_area_m2": round(float(est_footprint_m2), 2)
    }

def estimate_pile_volume(
    dims: Dict[str, float],
    shape_factor: Optional[float] = None,
    vessel_cfg: Dict[str, Any] = DEFAULT_VESSEL_CONFIG
) -> Dict[str, Any]:
    """Computes baseline volume in m^3 using L x W x H x Shape Factor."""
    sf = shape_factor if shape_factor is not None else vessel_cfg["shape_factor"]
    
    l_m = dims["estimated_length_m"]
    w_m = dims["estimated_width_m"]
    h_m = dims["estimated_height_m"]
    
    vol_bbox_method = l_m * w_m * h_m * sf
    vol_footprint_method = dims["estimated_footprint_area_m2"] * h_m * sf
    
    return {
        "shape_factor": round(float(sf), 3),
        "estimated_volume_m3": round(float(vol_bbox_method), 2),
        "footprint_crosscheck_volume_m3": round(float(vol_footprint_method), 2)
    }


# =============================================================================
# 3. FULL PIPELINE: VALIDATION + VOLUME ESTIMATION
# =============================================================================

def run_validated_coal_volume_pipeline(
    img_bgr: np.ndarray,
    model_name: str,
    masks_data: List[np.ndarray],
    boxes_data: List[np.ndarray],
    confs_data: List[float],
    camera_name: str = "Jetty East",
    vessel_cfg: Dict[str, Any] = DEFAULT_VESSEL_CONFIG,
    val_cfg: Dict[str, Any] = DEFAULT_VALIDATION_CONFIG,
    debug_dir: Optional[Path] = None
) -> Tuple[np.ndarray, Dict[str, Any]]:
    """
    Complete end-to-end pipeline:
    1. Multi-Stage Candidate Mask Validation & Quality Scoring.
    2. Optional Generation of 8 Debug Stage Visualizations.
    3. Baseline Volume Estimation ONLY on Final Valid Coal Piles.
    4. Generation of Auditable Visual Output and Comprehensive JSON Metadata.
    """
    h, w = img_bgr.shape[:2]
    
    # -------------------------------------------------------------------------
    # STAGE 1-8: Multi-Stage Mask Validation
    # -------------------------------------------------------------------------
    final_valid_piles, candidate_audit_records, stage_snapshots = validate_and_filter_masks(
        masks_data, boxes_data, confs_data, img_bgr, val_cfg
    )
    
    # Save 8 debug visualization snapshots if directory provided
    if debug_dir:
        debug_dir.mkdir(parents=True, exist_ok=True)
        generate_debug_pipeline_visualizations(
            img_bgr, stage_snapshots, candidate_audit_records, model_name, debug_dir
        )
        
    overlay = img_bgr.copy()
    piles_output = []
    total_volume_m3 = 0.0
    
    # Distinct vibrant palette for valid piles
    palette = [
        (0, 215, 255),   # Gold
        (0, 140, 255),   # Orange
        (50, 205, 50),   # Lime Green
        (255, 105, 180), # Pink
        (147, 20, 255),  # Violet
    ]
    
    # -------------------------------------------------------------------------
    # STAGE 9: Volume Estimation (Only on Final Valid Coal Piles)
    # -------------------------------------------------------------------------
    if len(final_valid_piles) == 0:
        # Zero valid piles detected: clear message, volume skipped
        status_msg = "No valid coal pile detected. Volume estimation skipped."
        cv2.putText(overlay, status_msg, (50, h // 2), cv2.FONT_HERSHEY_SIMPLEX, 0.85, (0, 0, 255), 2, cv2.LINE_AA)
    else:
        for idx, pile in enumerate(final_valid_piles):
            pile_id = idx + 1
            dims = estimate_pile_dimensions(pile, vessel_cfg)
            vol = estimate_pile_volume(dims, vessel_cfg["shape_factor"], vessel_cfg)
            
            vol_m3 = vol["estimated_volume_m3"]
            total_volume_m3 += vol_m3
            
            color = palette[idx % len(palette)]
            binary_m = pile["mask"]
            
            # Semi-transparent mask overlay
            mask_idx = binary_m > 0
            colored_fill = np.zeros_like(img_bgr, dtype=np.uint8)
            for c in range(3):
                colored_fill[:, :, c] = binary_m * color[c]
            overlay[mask_idx] = cv2.addWeighted(overlay, 0.55, colored_fill, 0.45, 0)[mask_idx]
            
            # Crisp contour outline
            contours, _ = cv2.findContours(binary_m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            cv2.drawContours(overlay, contours, -1, color, 3)
            
            # Bounding box & centroid
            bx1, by1, bx2, by2 = pile["bbox"]
            cv2.rectangle(overlay, (bx1, by1), (bx2, by2), color, 2)
            
            cx, cy = int(pile["centroid"][0]), int(pile["centroid"][1])
            cv2.circle(overlay, (cx, cy), 6, (0, 0, 255), -1)
            cv2.circle(overlay, (cx, cy), 8, (255, 255, 255), 2)
            
            # Non-cluttered Pile Info Badge
            conf_str = f" ({pile['confidence']:.2f})" if pile["confidence"] is not None else ""
            badge_1 = f"Pile #{pile_id}{conf_str} | Q:{pile['quality_score']:.2f}"
            badge_2 = f"Est: {vol_m3:,.1f} m3 (SF: {vol['shape_factor']})"
            
            font_scale = 0.40
            thick = 1
            (tw1, th1), _ = cv2.getTextSize(badge_1, cv2.FONT_HERSHEY_SIMPLEX, font_scale, thick)
            (tw2, th2), _ = cv2.getTextSize(badge_2, cv2.FONT_HERSHEY_SIMPLEX, font_scale, thick)
            max_tw = max(tw1, tw2)
            
            by_top = max(0, by1 - 38)
            by_bot = by1 if by1 > 38 else by1 + 38
            bx_end = min(w - 1, bx1 + max_tw + 12)
            
            cv2.rectangle(overlay, (bx1, by_top), (bx_end, by_bot), (20, 20, 20), -1)
            cv2.rectangle(overlay, (bx1, by_top), (bx_end, by_bot), color, 1)
            cv2.putText(overlay, badge_1, (bx1 + 5, by_top + 15), cv2.FONT_HERSHEY_SIMPLEX, font_scale, color, thick, cv2.LINE_AA)
            cv2.putText(overlay, badge_2, (bx1 + 5, by_top + 30), cv2.FONT_HERSHEY_SIMPLEX, font_scale, (255, 255, 255), thick, cv2.LINE_AA)
            
            piles_output.append({
                "pile_id": pile_id,
                "source_mask_id": pile["mask_id"],
                "confidence": pile["confidence"],
                "quality_score": pile["quality_score"],
                "geometry_score": pile["geometry_score"],
                "mask_area_pixels": pile["raw_area_px"],
                "bounding_box": pile["bbox"],
                "centroid": pile["centroid"],
                "bounding_box_width_pixels": pile["geometry_metrics"]["bbox_w"],
                "bounding_box_height_pixels": pile["geometry_metrics"]["bbox_h"],
                "convex_hull_area_pixels": pile["geometry_metrics"]["convex_hull_area"],
                "solidity": pile["solidity"],
                "extent": pile["extent"],
                "aspect_ratio": pile["aspect_ratio"],
                "estimated_length_m": dims["estimated_length_m"],
                "estimated_width_m": dims["estimated_width_m"],
                "estimated_height_m": dims["estimated_height_m"],
                "estimated_footprint_area_m2": dims["estimated_footprint_area_m2"],
                "shape_factor": vol["shape_factor"],
                "estimated_volume_m3": vol_m3,
                "polygons": pile["geometry_metrics"]["polygons"]
            })
            
    total_volume_m3 = round(total_volume_m3, 2)
    
    # -------------------------------------------------------------------------
    # STAGE 10: Summary HUD Header Panel
    # -------------------------------------------------------------------------
    hud_w = 440
    hud_h = 100
    hud_x = w - hud_w - 15
    hud_y = 15
    
    hud_bg = overlay[hud_y:hud_y+hud_h, hud_x:hud_x+hud_w]
    dark_rect = np.zeros_like(hud_bg, dtype=np.uint8)
    overlay[hud_y:hud_y+hud_h, hud_x:hud_x+hud_w] = cv2.addWeighted(hud_bg, 0.25, dark_rect, 0.75, 0)
    cv2.rectangle(overlay, (hud_x, hud_y), (hud_x+hud_w, hud_y+hud_h), (0, 215, 255), 2)
    
    cv2.putText(overlay, f"CAMERA: {camera_name.upper()} | {model_name}", (hud_x + 10, hud_y + 22),
                cv2.FONT_HERSHEY_SIMPLEX, 0.48, (0, 215, 255), 2, cv2.LINE_AA)
    cv2.putText(overlay, f"Raw Proposals: {len(masks_data)} | Valid Piles: {len(piles_output)}", (hud_x + 10, hud_y + 46),
                cv2.FONT_HERSHEY_SIMPLEX, 0.42, (200, 200, 200), 1, cv2.LINE_AA)
    
    vol_text = f"TOTAL EST. VOLUME: {total_volume_m3:,.1f} m3" if len(piles_output) > 0 else "TOTAL EST. VOLUME: 0.0 m3 (SKIPPED)"
    vol_color = (0, 255, 128) if len(piles_output) > 0 else (0, 0, 255)
    cv2.putText(overlay, vol_text, (hud_x + 10, hud_y + 76),
                cv2.FONT_HERSHEY_SIMPLEX, 0.55, vol_color, 2, cv2.LINE_AA)
    
    # -------------------------------------------------------------------------
    # STAGE 11: Structured Metadata JSON Object
    # -------------------------------------------------------------------------
    result_metadata = {
        "camera": camera_name.lower().replace(" ", "_"),
        "camera_display_name": camera_name,
        "model_name": model_name,
        "vessel_configuration": {
            "vessel_type": vessel_cfg["vessel_type"],
            "cargo_deck_length_m": vessel_cfg["cargo_deck_length_m"],
            "cargo_deck_width_m": vessel_cfg["cargo_deck_width_m"],
            "cargo_side_wall_height_m": vessel_cfg["cargo_side_wall_height_m"],
            "shape_factor": vessel_cfg["shape_factor"],
            "shape_factor_note": vessel_cfg["shape_factor_note"]
        },
        "validation_configuration": {
            "thresholds": val_cfg["thresholds"],
            "weights": val_cfg["weights"]
        },
        "candidate_masks_count": len(masks_data),
        "discarded_masks_count": len(masks_data) - len(piles_output),
        "valid_piles_count": len(piles_output),
        "total_estimated_volume_m3": total_volume_m3,
        "candidate_masks": candidate_audit_records,
        "final_valid_piles": piles_output
    }
    
    return overlay, result_metadata
