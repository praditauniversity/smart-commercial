"""
Coal Pile Mask Validation & Quality Assessment Module
------------------------------------------------------
A multi-stage, data-driven filtering and validation pipeline for FastSAM proposal masks.
Ensures that only authentic coal pile instances reach the volume estimation stage.

Pipeline Stages:
1. Raw FastSAM Candidate Masks
2. Area & BBox Validation
3. Vessel Region (ROI) Overlap Validation
4. Coal Surface Region Overlap Validation
5. Exclusion Zones (Water, Jetty Pole, Sky, Text) Overlap Rejection
6. Mask Geometry & Morphology Validation (Solidity, Extent, Aspect Ratio)
7. Composite Mask Quality Scoring (Weighted evaluation)
8. Duplicate & Nested Mask Removal (IoU & Containment Deduplication)
9. Final Valid Coal Pile Masks Generation
"""

import json
import time
from pathlib import Path
from typing import Dict, List, Any, Tuple, Optional
import cv2
import numpy as np


# =============================================================================
# 1. CENTRALIZED PIPELINE CONFIGURATION
# =============================================================================

DEFAULT_VALIDATION_CONFIG: Dict[str, Any] = {
    # -------------------------------------------------------------------------
    # A. Scene Zones (Static Camera ROI Definitions)
    # These represent the static physical layout of the Jetty East CCTV camera view.
    # They do NOT draw or fake coal pile shapes; they act strictly as spatial filters.
    # -------------------------------------------------------------------------
    "roi": {
        # Vessel boundary polygon (Entire barge hull and deck area in frame)
        "vessel_polygon": [
            [470, 360],
            [1340, 360],
            [1490, 760],
            [480, 870],
            [170, 680],
            [160, 560]
        ],
        # Coal Surface ROI polygon (Where coal cargo heaps physically reside on the barge)
        "coal_surface_polygon": [
            [480, 355],
            [1320, 355],
            [1360, 690],
            [460, 690],
            [300, 560]
        ],
        # Exclusion polygons (Areas that must never be classified as coal)
        "exclusion_polygons": {
            "sky_zone": [
                [0, 0], [1600, 0], [1600, 350], [0, 350]
            ],
            "water_open_sea_zone": [
                [0, 350], [450, 350], [450, 720], [0, 720]
            ],
            "water_foreground_zone": [
                [0, 780], [1600, 780], [1600, 900], [0, 900]
            ],
            "right_jetty_structure_zone": [
                [1380, 0], [1600, 0], [1600, 900], [1380, 900]
            ],
            "cctv_text_zone": [
                [1100, 780], [1500, 780], [1500, 890], [1100, 890]
            ]
        }
    },
    
    # -------------------------------------------------------------------------
    # B. Multi-Stage Filtering Thresholds
    # -------------------------------------------------------------------------
    "thresholds": {
        "min_mask_area_px": 5000,                  # Reject tiny fragments/noise (< 0.35% of 1600x900)
        "max_mask_area_ratio": 0.60,               # Reject global background scenes (> 60% of image)
        "min_bbox_width_px": 60,                   # Minimum horizontal span
        "min_bbox_height_px": 35,                  # Minimum vertical span
        "min_inside_vessel_ratio": 0.75,           # At least 75% of mask must be inside vessel boundary
        "min_coal_surface_overlap_ratio": 0.60,    # At least 60% of mask must be inside coal surface zone
        "max_exclusion_overlap_ratio": 0.12,       # Reject mask if > 12% spills into exclusion zones
        "max_grayscale_mean_intensity": 125.0,     # Coal material intensity check (dark carbon)
        "min_solidity": 0.50,                      # Mask area / Convex hull area
        "min_extent": 0.25,                        # Mask area / Bounding box area
        "min_aspect_ratio": 0.70,                  # Width / Height (reject thin vertical structural poles)
        "max_aspect_ratio": 7.0,                   # Reject infinite horizontal lines
        "duplicate_iou_threshold": 0.70,           # IoU threshold for duplicate removal
        "nested_containment_threshold": 0.80,      # Containment threshold for nested mask removal
        "min_mask_quality_score": 0.65             # Minimum composite quality score to accept
    },
    
    # -------------------------------------------------------------------------
    # C. Composite Quality Score Weights
    # -------------------------------------------------------------------------
    "weights": {
        "vessel_overlap": 0.25,
        "coal_surface_overlap": 0.35,
        "geometry": 0.20,
        "confidence": 0.20,
        "exclusion_penalty": 0.50
    }
}


# =============================================================================
# 2. HELPER FUNCTIONS FOR MASK GEOMETRY & ROI CREATION
# =============================================================================

def build_roi_mask(polygon_pts: List[List[int]], h: int, w: int) -> np.ndarray:
    """Builds a binary single-channel raster mask from a list of 2D polygon vertices."""
    mask = np.zeros((h, w), dtype=np.uint8)
    pts = np.array(polygon_pts, dtype=np.int32)
    cv2.fillPoly(mask, [pts], 1)
    return mask

def build_composite_exclusion_mask(exclusion_dict: Dict[str, List[List[int]]], h: int, w: int) -> np.ndarray:
    """Builds a single unified binary mask combining all exclusion polygons."""
    mask = np.zeros((h, w), dtype=np.uint8)
    for zone_name, pts_list in exclusion_dict.items():
        pts = np.array(pts_list, dtype=np.int32)
        cv2.fillPoly(mask, [pts], 1)
    return mask

def compute_mask_geometry_metrics(binary_mask: np.ndarray) -> Dict[str, Any]:
    """Computes all 2D geometrical, shape, and contour metrics for a single mask."""
    h, w = binary_mask.shape[:2]
    area_px = int(np.sum(binary_mask > 0))
    
    ys, xs = np.where(binary_mask > 0)
    if len(xs) == 0:
        return {
            "area_pixels": 0, "bbox": [0, 0, 0, 0], "bbox_w": 0, "bbox_h": 0,
            "centroid": [0.0, 0.0], "solidity": 0.0, "extent": 0.0,
            "aspect_ratio": 0.0, "convex_hull_area": 0.0, "polygons": []
        }
        
    min_x, max_x = int(np.min(xs)), int(np.max(xs))
    min_y, max_y = int(np.min(ys)), int(np.max(ys))
    
    bw = max_x - min_x
    bh = max_y - min_y
    aspect_ratio = bw / (bh + 1e-6)
    extent = area_px / (bw * bh + 1e-6)
    
    cx = float(np.mean(xs))
    cy = float(np.mean(ys))
    
    contours, _ = cv2.findContours(binary_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    convex_hull_area = 0.0
    polygons = []
    
    if contours:
        main_contour = max(contours, key=cv2.contourArea)
        hull = cv2.convexHull(main_contour)
        convex_hull_area = float(cv2.contourArea(hull))
        for cnt in contours:
            if cv2.contourArea(cnt) > 20:
                poly = cnt.squeeze().tolist()
                if isinstance(poly, list) and len(poly) > 2:
                    polygons.append(poly)
                    
    solidity = area_px / (convex_hull_area + 1e-6) if convex_hull_area > 0 else 0.0
    solidity = min(1.0, solidity)
    
    return {
        "area_pixels": area_px,
        "bbox": [min_x, min_y, max_x, max_y],
        "bbox_w": bw,
        "bbox_h": bh,
        "centroid": [round(cx, 2), round(cy, 2)],
        "aspect_ratio": round(aspect_ratio, 3),
        "extent": round(extent, 4),
        "solidity": round(solidity, 4),
        "convex_hull_area": round(convex_hull_area, 2),
        "polygons": polygons
    }


# =============================================================================
# 3. MASK QUALITY SCORING
# =============================================================================

def calculate_mask_quality_score(
    inside_vessel_ratio: float,
    coal_surface_ratio: float,
    exclusion_ratio: float,
    geometry_metrics: Dict[str, Any],
    confidence: Optional[float],
    weights: Dict[str, float]
) -> Tuple[float, float]:
    """
    Computes a composite quality score (0.0 - 1.0) and sub-geometry score.
    Formula:
        Q = w1*Vessel + w2*CoalSurface + w3*Geom + w4*Conf - w5*Exclusion
    """
    # 1. Geometry score (solidity and extent consistency)
    solidity = geometry_metrics.get("solidity", 0.0)
    extent = geometry_metrics.get("extent", 0.0)
    ar = geometry_metrics.get("aspect_ratio", 1.0)
    
    # Heaps are moderately convex and wider than tall
    geom_solidity_score = np.clip((solidity - 0.40) / 0.50, 0.0, 1.0)
    geom_extent_score = np.clip((extent - 0.20) / 0.60, 0.0, 1.0)
    geom_ar_score = 1.0 if (1.0 <= ar <= 5.0) else (0.5 if (0.7 <= ar <= 7.0) else 0.1)
    
    geometry_score = float(0.45 * geom_solidity_score + 0.35 * geom_extent_score + 0.20 * geom_ar_score)
    
    # 2. Confidence score
    conf_val = confidence if (confidence is not None and not np.isnan(confidence)) else 0.80
    conf_score = float(np.clip(conf_val, 0.0, 1.0))
    
    # 3. Composite score
    w_v = weights.get("vessel_overlap", 0.25)
    w_cs = weights.get("coal_surface_overlap", 0.35)
    w_g = weights.get("geometry", 0.20)
    w_c = weights.get("confidence", 0.20)
    w_e = weights.get("exclusion_penalty", 0.50)
    
    q_score = (w_v * inside_vessel_ratio +
               w_cs * coal_surface_ratio +
               w_g * geometry_score +
               w_c * conf_score -
               w_e * exclusion_ratio)
               
    q_score = float(np.clip(q_score, 0.0, 1.0))
    return round(q_score, 4), round(geometry_score, 4)


# =============================================================================
# 4. MULTI-STAGE VALIDATION PIPELINE EXECUTION
# =============================================================================

def validate_and_filter_masks(
    masks_data: List[np.ndarray],
    boxes_data: List[np.ndarray],
    confs_data: List[float],
    img_bgr: np.ndarray,
    config: Dict[str, Any] = DEFAULT_VALIDATION_CONFIG
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], Dict[str, List[Dict[str, Any]]]]:
    """
    Executes the comprehensive multi-stage validation pipeline on FastSAM raw proposals.
    
    Returns:
        final_valid_piles: List of validated coal pile instances ready for volume estimation.
        candidate_audit_records: Complete audit record for every single raw candidate mask.
        stage_snapshots: Intermediate candidate lists at each pipeline step for debug visualization.
    """
    h, w = img_bgr.shape[:2]
    total_img_pixels = h * w
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    
    thresh = config["thresholds"]
    weights = config["weights"]
    roi_cfg = config["roi"]
    
    # Build spatial validation masks from centralized polygons
    vessel_mask = build_roi_mask(roi_cfg["vessel_polygon"], h, w)
    coal_surface_mask = build_roi_mask(roi_cfg["coal_surface_polygon"], h, w)
    exclusion_mask = build_composite_exclusion_mask(roi_cfg["exclusion_polygons"], h, w)
    
    candidate_audit_records = []
    
    # Stage snapshots for debug visualization
    stage_snapshots = {
        "01_raw_candidates": [],
        "02_area_filtered": [],
        "03_vessel_roi_filtered": [],
        "04_coal_surface_filtered": [],
        "05_exclusion_filtered": [],
        "06_geometry_validated": [],
        "07_quality_scored": [],
        "08_final_valid_piles": []
    }
    
    raw_candidates = []
    
    # -------------------------------------------------------------------------
    # STAGE 1: Extract and evaluate every raw candidate
    # -------------------------------------------------------------------------
    for idx, mask_raw in enumerate(masks_data):
        mask_res = cv2.resize(mask_raw, (w, h), interpolation=cv2.INTER_NEAREST)
        binary_m = (mask_res > 0.5).astype(np.uint8)
        area_px = int(np.sum(binary_m))
        
        conf = float(confs_data[idx]) if idx < len(confs_data) else None
        bx = [int(v) for v in boxes_data[idx]] if idx < len(boxes_data) else []
        
        geom = compute_mask_geometry_metrics(binary_m)
        
        # Calculate spatial overlap ratios
        area_inside_vessel = int(np.sum((binary_m > 0) & (vessel_mask > 0)))
        inside_vessel_ratio = float(area_inside_vessel / (area_px + 1e-6))
        
        area_inside_coal_surface = int(np.sum((binary_m > 0) & (coal_surface_mask > 0)))
        coal_surface_ratio = float(area_inside_coal_surface / (area_px + 1e-6))
        
        area_inside_exclusion = int(np.sum((binary_m > 0) & (exclusion_mask > 0)))
        exclusion_ratio = float(area_inside_exclusion / (area_px + 1e-6))
        
        mean_intensity = float(cv2.mean(gray, mask=binary_m)[0]) if area_px > 0 else 0.0
        
        q_score, geom_score = calculate_mask_quality_score(
            inside_vessel_ratio, coal_surface_ratio, exclusion_ratio,
            geom, conf, weights
        )
        
        cand_obj = {
            "mask_id": idx + 1,
            "raw_index": idx,
            "mask": binary_m,
            "raw_area_px": area_px,
            "area_ratio_of_image": round(area_px / total_img_pixels, 4),
            "confidence": round(conf, 3) if conf is not None else None,
            "bbox": geom["bbox"],
            "centroid": geom["centroid"],
            "inside_vessel_ratio": round(inside_vessel_ratio, 4),
            "coal_surface_overlap_ratio": round(coal_surface_ratio, 4),
            "exclusion_overlap_ratio": round(exclusion_ratio, 4),
            "mean_intensity": round(mean_intensity, 1),
            "solidity": geom["solidity"],
            "extent": geom["extent"],
            "aspect_ratio": geom["aspect_ratio"],
            "geometry_score": geom_score,
            "quality_score": q_score,
            "geometry_metrics": geom,
            "decision": "PENDING",
            "rejection_reason": None
        }
        raw_candidates.append(cand_obj)
        stage_snapshots["01_raw_candidates"].append(cand_obj)

    # -------------------------------------------------------------------------
    # STAGE 2: Area & BBox Validation
    # -------------------------------------------------------------------------
    passed_stage2 = []
    for cand in raw_candidates:
        if cand["raw_area_px"] < thresh["min_mask_area_px"]:
            cand["decision"] = "REJECTED"
            cand["rejection_reason"] = f"Area too small ({cand['raw_area_px']} px < {thresh['min_mask_area_px']} px)"
            continue
        if cand["area_ratio_of_image"] > thresh["max_mask_area_ratio"]:
            cand["decision"] = "REJECTED"
            cand["rejection_reason"] = f"Area too large ({cand['area_ratio_of_image']*100:.1f}% > {thresh['max_mask_area_ratio']*100:.0f}%, global scene)"
            continue
        if cand["geometry_metrics"]["bbox_w"] < thresh["min_bbox_width_px"] or cand["geometry_metrics"]["bbox_h"] < thresh["min_bbox_height_px"]:
            cand["decision"] = "REJECTED"
            cand["rejection_reason"] = f"BBox dimensions too small ({cand['geometry_metrics']['bbox_w']}x{cand['geometry_metrics']['bbox_h']} px)"
            continue
            
        passed_stage2.append(cand)
        stage_snapshots["02_area_filtered"].append(cand)

    # -------------------------------------------------------------------------
    # STAGE 3: Vessel ROI Overlap Validation
    # -------------------------------------------------------------------------
    passed_stage3 = []
    for cand in passed_stage2:
        if cand["inside_vessel_ratio"] < thresh["min_inside_vessel_ratio"]:
            cand["decision"] = "REJECTED"
            cand["rejection_reason"] = f"Outside vessel boundary (Vessel overlap: {cand['inside_vessel_ratio']*100:.1f}% < {thresh['min_inside_vessel_ratio']*100:.0f}%)"
            continue
        passed_stage3.append(cand)
        stage_snapshots["03_vessel_roi_filtered"].append(cand)

    # -------------------------------------------------------------------------
    # STAGE 4: Coal Surface ROI Overlap Validation
    # -------------------------------------------------------------------------
    passed_stage4 = []
    for cand in passed_stage3:
        if cand["coal_surface_overlap_ratio"] < thresh["min_coal_surface_overlap_ratio"]:
            cand["decision"] = "REJECTED"
            cand["rejection_reason"] = f"Outside coal surface zone (Coal surface overlap: {cand['coal_surface_overlap_ratio']*100:.1f}% < {thresh['min_coal_surface_overlap_ratio']*100:.0f}%, likely vessel hull/lower water)"
            continue
        passed_stage4.append(cand)
        stage_snapshots["04_coal_surface_filtered"].append(cand)

    # -------------------------------------------------------------------------
    # STAGE 5: Exclusion Zones Rejection
    # -------------------------------------------------------------------------
    passed_stage5 = []
    for cand in passed_stage4:
        if cand["exclusion_overlap_ratio"] > thresh["max_exclusion_overlap_ratio"]:
            cand["decision"] = "REJECTED"
            cand["rejection_reason"] = f"Spills into exclusion zones (Exclusion overlap: {cand['exclusion_overlap_ratio']*100:.1f}% > {thresh['max_exclusion_overlap_ratio']*100:.0f}%, water/pier/text)"
            continue
        if cand["mean_intensity"] > thresh["max_grayscale_mean_intensity"]:
            cand["decision"] = "REJECTED"
            cand["rejection_reason"] = f"Intensity too bright for coal ({cand['mean_intensity']:.1f} > {thresh['max_grayscale_mean_intensity']:.1f})"
            continue
        passed_stage5.append(cand)
        stage_snapshots["05_exclusion_filtered"].append(cand)

    # -------------------------------------------------------------------------
    # STAGE 6: Geometry & Morphology Validation
    # -------------------------------------------------------------------------
    passed_stage6 = []
    for cand in passed_stage5:
        if cand["solidity"] < thresh["min_solidity"]:
            cand["decision"] = "REJECTED"
            cand["rejection_reason"] = f"Low solidity/concave shape ({cand['solidity']:.2f} < {thresh['min_solidity']:.2f})"
            continue
        if cand["extent"] < thresh["min_extent"]:
            cand["decision"] = "REJECTED"
            cand["rejection_reason"] = f"Low bbox fill extent ({cand['extent']:.2f} < {thresh['min_extent']:.2f})"
            continue
        if cand["aspect_ratio"] < thresh["min_aspect_ratio"] or cand["aspect_ratio"] > thresh["max_aspect_ratio"]:
            cand["decision"] = "REJECTED"
            cand["rejection_reason"] = f"Abnormal aspect ratio ({cand['aspect_ratio']:.2f}, not heap-like)"
            continue
        passed_stage6.append(cand)
        stage_snapshots["06_geometry_validated"].append(cand)

    # -------------------------------------------------------------------------
    # STAGE 7: Quality Score Thresholding
    # -------------------------------------------------------------------------
    passed_stage7 = []
    for cand in passed_stage6:
        if cand["quality_score"] < thresh["min_mask_quality_score"]:
            cand["decision"] = "REJECTED"
            cand["rejection_reason"] = f"Low composite quality score ({cand['quality_score']:.2f} < {thresh['min_mask_quality_score']:.2f})"
            continue
        passed_stage7.append(cand)
        stage_snapshots["07_quality_scored"].append(cand)

    # -------------------------------------------------------------------------
    # STAGE 8: Duplicate & Nested Mask Removal
    # Prioritizes higher coal surface overlap, lower exclusion, and higher quality score.
    # -------------------------------------------------------------------------
    passed_stage7.sort(key=lambda c: c["quality_score"], reverse=True)
    final_valid_piles = []
    
    for cand in passed_stage7:
        cand_mask = cand["mask"]
        cand_area = cand["raw_area_px"]
        duplicate = False
        
        for kept in final_valid_piles:
            kept_mask = kept["mask"]
            inter = int(np.sum((cand_mask > 0) & (kept_mask > 0)))
            union = int(np.sum((cand_mask > 0) | (kept_mask > 0)))
            iou = inter / (union + 1e-6)
            containment = inter / (cand_area + 1e-6)
            
            if iou > thresh["duplicate_iou_threshold"]:
                duplicate = True
                cand["decision"] = "DUPLICATE"
                cand["rejection_reason"] = f"Duplicate of higher-quality Mask #{kept['mask_id']} (IoU: {iou:.3f} > {thresh['duplicate_iou_threshold']})"
                break
                
            if containment > thresh["nested_containment_threshold"]:
                duplicate = True
                cand["decision"] = "DUPLICATE"
                cand["rejection_reason"] = f"Nested inside Mask #{kept['mask_id']} (Containment: {containment*100:.1f}% > {thresh['nested_containment_threshold']*100:.0f}%)"
                break
                
        if not duplicate:
            cand["decision"] = "VALID"
            cand["rejection_reason"] = None
            final_valid_piles.append(cand)

    # Sort final valid piles dynamically by centroid X (left-to-right ordering)
    final_valid_piles.sort(key=lambda c: c["centroid"][0])
    
    for idx, p in enumerate(final_valid_piles, start=1):
        p["pile_id"] = idx
        stage_snapshots["08_final_valid_piles"].append(p)
        
    # Compile complete audit records for JSON serialization
    for cand in raw_candidates:
        candidate_audit_records.append({
            "mask_id": cand["mask_id"],
            "raw_area_px": cand["raw_area_px"],
            "confidence": cand["confidence"],
            "bbox": cand["bbox"],
            "centroid": cand["centroid"],
            "inside_vessel_ratio": cand["inside_vessel_ratio"],
            "coal_surface_overlap_ratio": cand["coal_surface_overlap_ratio"],
            "exclusion_overlap_ratio": cand["exclusion_overlap_ratio"],
            "mean_intensity": cand["mean_intensity"],
            "solidity": cand["solidity"],
            "extent": cand["extent"],
            "aspect_ratio": cand["aspect_ratio"],
            "geometry_score": cand["geometry_score"],
            "quality_score": cand["quality_score"],
            "decision": cand["decision"],
            "rejection_reason": cand["rejection_reason"]
        })
        
    return final_valid_piles, candidate_audit_records, stage_snapshots


# =============================================================================
# 5. DEBUG VISUALIZATION GENERATOR (8 Pipeline Stages)
# =============================================================================

def generate_debug_pipeline_visualizations(
    img_bgr: np.ndarray,
    stage_snapshots: Dict[str, List[Dict[str, Any]]],
    all_audit_records: List[Dict[str, Any]],
    model_name: str,
    output_dir: Path
) -> List[Path]:
    """
    Renders and saves 8 dedicated debug visualization images showing candidate status
    at every single filtering stage.
    """
    h, w, _ = img_bgr.shape
    saved_paths = []
    
    # Palette for valid / accepted items
    valid_color = (0, 255, 128)      # Spring Green
    rejected_color = (0, 0, 240)     # Bright Red
    duplicate_color = (0, 165, 255)  # Orange
    neutral_color = (255, 200, 0)    # Cyan
    
    stage_titles = {
        "01_raw_candidates": "Stage 1: All Raw FastSAM Candidates",
        "02_area_filtered": "Stage 2: Area & BBox Span Filtered",
        "03_vessel_roi_filtered": "Stage 3: Inside Vessel Boundary Filtered",
        "04_coal_surface_filtered": "Stage 4: Inside Coal Surface Zone Filtered",
        "05_exclusion_filtered": "Stage 5: Exclusion Zones (Water/Pier/Sky) Filtered",
        "06_geometry_validated": "Stage 6: Geometry & Solidity Validated",
        "07_quality_scored": "Stage 7: Composite Quality Scored Candidates",
        "08_final_valid_piles": "Stage 8: Final Valid Coal Piles (Duplicates Removed)"
    }
    
    for stage_key, stage_title in stage_titles.items():
        canvas = img_bgr.copy()
        candidates_in_stage = stage_snapshots.get(stage_key, [])
        
        # Header banner
        header_h = 42
        banner = np.zeros((header_h, w, 3), dtype=np.uint8)
        banner[:] = (24, 24, 24)
        
        stage_info = f"[{model_name.upper()}] {stage_title} ({len(candidates_in_stage)} candidates)"
        cv2.putText(banner, stage_info, (14, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.60, (0, 215, 255), 2, cv2.LINE_AA)
        
        # Render candidate masks for this stage
        for cand in candidates_in_stage:
            mask_bin = cand["mask"]
            mask_idx = mask_bin > 0
            
            is_final = (stage_key == "08_final_valid_piles")
            col = valid_color if is_final else neutral_color
            
            # Transparent fill
            fill_layer = np.zeros_like(canvas, dtype=np.uint8)
            for c in range(3):
                fill_layer[:, :, c] = mask_bin * col[c]
            canvas[mask_idx] = cv2.addWeighted(canvas, 0.65, fill_layer, 0.35, 0)[mask_idx]
            
            # Boundary contour
            contours, _ = cv2.findContours(mask_bin, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            cv2.drawContours(canvas, contours, -1, col, 2)
            
            # Badge
            bx = cand["bbox"]
            if bx and len(bx) >= 4:
                bx1, by1, bx2, by2 = bx
                cv2.rectangle(canvas, (bx1, by1), (bx2, by2), col, 1)
                
                label_txt = f"Pile #{cand.get('pile_id', cand['mask_id'])} (Q:{cand['quality_score']:.2f})" if is_final else f"M#{cand['mask_id']} (Q:{cand['quality_score']:.2f})"
                (tw, th), _ = cv2.getTextSize(label_txt, cv2.FONT_HERSHEY_SIMPLEX, 0.40, 1)
                
                by_top = max(0, by1 - th - 6)
                cv2.rectangle(canvas, (bx1, by_top), (bx1 + tw + 6, by1), (20, 20, 20), -1)
                cv2.rectangle(canvas, (bx1, by_top), (bx1 + tw + 6, by1), col, 1)
                cv2.putText(canvas, label_txt, (bx1 + 3, by1 - 3), cv2.FONT_HERSHEY_SIMPLEX, 0.40, (255, 255, 255), 1, cv2.LINE_AA)
                
        # Stack header banner on top
        composite = np.vstack([banner, canvas])
        out_filename = output_dir / f"debug_{model_name.lower().replace('-', '_')}_{stage_key}.jpg"
        cv2.imwrite(str(out_filename), composite)
        saved_paths.append(out_filename)
        
    return saved_paths
