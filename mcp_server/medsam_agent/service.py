"""MCP-facing MedSAM segmentation service.

This module keeps the heavy MedSAM runtime behind a small, lazy-loaded API so
the main MCP server can start quickly and only load model weights when the tool
is actually called.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import yaml

_ADAPTER_CACHE: Dict[Tuple[Any, ...], Any] = {}
_DETECTOR_CACHE: Dict[Tuple[str, str], Any] = {}

_PACKAGE_DIR = Path(__file__).resolve().parent
_DEFAULT_CONFIG_DIR = _PACKAGE_DIR / "config"


def run_segmentation(
    scan_path: str,
    organ: str,
    *,
    output_dir: Optional[str] = None,
    backend: Optional[str] = None,
    device: Optional[str] = None,
    axis: int = 2,
    propagation_strategy: str = "sam_guided",
    bbox_pad: float = 0.15,
    use_organ_detector: bool = True,
) -> Dict[str, Any]:
    """Run MedSAM-style organ segmentation on a NIfTI volume.

    Parameters are intentionally plain JSON-friendly values because this
    function is called from an MCP tool.
    """

    if not scan_path:
        raise ValueError("scan_path is required")
    if not organ:
        raise ValueError("organ is required")

    backend = (backend or os.getenv("MEDSAM_BACKEND") or "medsam").strip().lower()
    device = (device or os.getenv("MEDSAM_DEVICE") or ("cpu" if backend == "mock" else "cuda")).strip()

    resolved_scan = Path(scan_path).expanduser().resolve()
    if not resolved_scan.exists():
        raise FileNotFoundError(f"NIfTI scan not found: {resolved_scan}")
    if not (str(resolved_scan).endswith(".nii") or str(resolved_scan).endswith(".nii.gz")):
        raise ValueError(f"scan_path must point to a .nii or .nii.gz file: {resolved_scan}")

    import nibabel as nib
    from .app.agent.orchestrator import SegmentationOrchestrator

    organs = _load_organs()
    organ_key = _match_organ(organ, organs)
    organ_data = organs.get(organ_key, organs["custom"])
    axial_range = organ_data.get("typical_axial_range", [0.0, 1.0])

    scan = nib.load(str(resolved_scan))
    shape = scan.shape[:3]
    if len(shape) != 3:
        raise ValueError(f"Expected a 3D NIfTI volume, got shape={scan.shape}")
    if axis != 2:
        raise ValueError("MedSAM MCP integration currently supports axis=2 only")

    h, w, d = shape
    img_vol = scan.get_fdata().astype(np.float32)
    img_vol_norm = _normalize_volume(img_vol)
    bbox_frac, bbox_source = _choose_bbox_fraction(
        img_vol_norm,
        organ_key,
        organ_data,
        axial_range,
        device=device,
        use_organ_detector=use_organ_detector,
    )
    bbox_frac = _pad_bbox_fraction(bbox_frac, bbox_pad)
    box = [
        int(bbox_frac[0] * w),
        int(bbox_frac[1] * h),
        int(bbox_frac[2] * w),
        int(bbox_frac[3] * h),
    ]

    seed_slices = _seed_slices(axial_range, d)
    z_min = max(0, min(d - 1, int(axial_range[0] * d)))
    z_max = max(z_min + 1, min(d, int(axial_range[1] * d)))

    adapter = _get_adapter(backend=backend, device=device)
    output_root = _resolve_output_dir(output_dir)
    output_root.mkdir(parents=True, exist_ok=True)

    orch = SegmentationOrchestrator(
        adapter=adapter,
        output_dir=output_root,
        propagation_strategy=propagation_strategy,
    )
    orch.new_session(str(resolved_scan), organ=organ_key, axis=axis)

    for slice_idx in seed_slices:
        orch.add_box_prompt(slice_idx=slice_idx, box=box)
        orch.segment_slice(slice_idx)

    orch.propagate_to_volume(slice_range=(z_min, z_max))
    outputs = orch.save_outputs()
    voxels = int(orch.mask_volume.sum()) if orch.mask_volume is not None else 0

    mask_path = str(outputs.get("mask", ""))
    overlay_path = str(outputs.get("overlay_grid", ""))

    return {
        "status": "success",
        "backend": backend,
        "device": device,
        "organ": organ,
        "organ_key": organ_key,
        "scan_path": str(resolved_scan),
        "scan_shape": list(shape),
        "axis": axis,
        "slice_used": seed_slices[len(seed_slices) // 2] if seed_slices else None,
        "seeds_used": seed_slices,
        "slice_range": [z_min, z_max],
        "bbox_source": bbox_source,
        "box_used": box,
        "voxel_count": voxels,
        "mask_path": mask_path,
        "overlay_path": overlay_path,
        "prompts_path": str(outputs.get("prompts", "")),
        "session_log_path": str(outputs.get("log", "")),
        "overlay_url": _output_url(overlay_path),
        "mask_url": _output_url(mask_path),
    }


def medsam_output_root() -> Path:
    return _resolve_output_dir(None)


def resolve_output_file(relative_path: str) -> Path:
    """Resolve a file under the MedSAM output root for HTTP serving."""

    output_root = medsam_output_root().resolve()
    target = (output_root / relative_path).resolve()
    if output_root not in target.parents and target != output_root:
        raise ValueError("Invalid MedSAM output path")
    if not target.exists() or not target.is_file():
        raise FileNotFoundError(relative_path)
    return target


def _load_organs() -> Dict[str, Any]:
    organs_path = Path(os.getenv("MEDSAM_ORGANS_CONFIG", _DEFAULT_CONFIG_DIR / "organs.yaml"))
    with open(organs_path, "r", encoding="utf-8") as handle:
        return yaml.safe_load(handle)["organs"]


def _match_organ(organ: str, organs: Dict[str, Any]) -> str:
    organ_lower = organ.lower().strip()
    for key, data in organs.items():
        aliases = data.get("aliases", [])
        if organ_lower == key or any(organ_lower in alias or alias in organ_lower for alias in aliases):
            return key
    return "custom"


def _normalize_volume(volume: np.ndarray) -> np.ndarray:
    p1, p99 = np.percentile(volume, [1, 99])
    return np.clip((volume - p1) / (p99 - p1 + 1e-8), 0, 1)


def _choose_bbox_fraction(
    volume: np.ndarray,
    organ_key: str,
    organ_data: Dict[str, Any],
    axial_range: List[float],
    *,
    device: str,
    use_organ_detector: bool,
) -> Tuple[List[float], str]:
    prior = list(organ_data.get("typical_bbox_fraction", [0.1, 0.1, 0.9, 0.9]))
    checkpoint = os.getenv("ORGAN_DETECTOR_CHECKPOINT", "").strip()
    if not use_organ_detector or not checkpoint:
        return prior, "organ_prior"
    if not Path(checkpoint).expanduser().exists():
        return prior, "organ_prior_missing_detector_checkpoint"

    try:
        from .app.models.organ_detector import ORGAN_TO_IDX, OrganDetector

        if organ_key not in ORGAN_TO_IDX:
            return prior, "organ_prior_detector_unsupported_organ"

        cache_key = (str(Path(checkpoint).expanduser().resolve()), device)
        detector = _DETECTOR_CACHE.get(cache_key)
        if detector is None:
            detector = OrganDetector(checkpoint_path=cache_key[0], device=device)
            _DETECTOR_CACHE[cache_key] = detector
        return detector.predict_bbox(volume, organ_key, axial_range), "organ_detector_unet"
    except Exception as exc:
        return prior, f"organ_prior_detector_failed:{type(exc).__name__}"


def _pad_bbox_fraction(bbox: List[float], pad: float) -> List[float]:
    x1, y1, x2, y2 = [float(v) for v in bbox]
    width = max(0.0, x2 - x1)
    height = max(0.0, y2 - y1)
    return [
        max(0.0, x1 - width * pad),
        max(0.0, y1 - height * pad),
        min(1.0, x2 + width * pad),
        min(1.0, y2 + height * pad),
    ]


def _seed_slices(axial_range: List[float], depth: int) -> List[int]:
    start, end = float(axial_range[0]), float(axial_range[1])
    seeds = [
        int((start * 0.7 + end * 0.3) * depth),
        int((start * 0.5 + end * 0.5) * depth),
        int((start * 0.3 + end * 0.7) * depth),
    ]
    clamped = [max(0, min(depth - 1, seed)) for seed in seeds]
    return sorted(set(clamped))


def _get_adapter(*, backend: str, device: str) -> Any:
    if backend == "mock":
        cache_key = (backend, device)
        if cache_key not in _ADAPTER_CACHE:
            from .app.models.mock_adapter import MockAdapter

            adapter = MockAdapter(device=device)
            adapter.load_model()
            _ADAPTER_CACHE[cache_key] = adapter
        return _ADAPTER_CACHE[cache_key]

    if backend == "medsam":
        checkpoint = _required_path_env("MEDSAM_CHECKPOINT")
        segment_anything_path = _required_path_env("SEGMENT_ANYTHING_PATH")
        cache_key = (backend, checkpoint, segment_anything_path, device)
        if cache_key not in _ADAPTER_CACHE:
            from .app.models.medsam_adapter import MedSAMAdapter

            adapter = MedSAMAdapter(device=device)
            adapter.load_model(checkpoint=checkpoint, segment_anything_path=segment_anything_path)
            _ADAPTER_CACHE[cache_key] = adapter
        return _ADAPTER_CACHE[cache_key]

    if backend == "sam":
        checkpoint = _required_path_env("SAM_CHECKPOINT", fallback_env="MEDSAM_CHECKPOINT")
        segment_anything_path = _required_path_env("SEGMENT_ANYTHING_PATH")
        cache_key = (backend, checkpoint, segment_anything_path, device)
        if cache_key not in _ADAPTER_CACHE:
            from .app.models.sam_adapter import SAMAdapter

            adapter = SAMAdapter(device=device)
            adapter.load_model(checkpoint=checkpoint, segment_anything_path=segment_anything_path)
            _ADAPTER_CACHE[cache_key] = adapter
        return _ADAPTER_CACHE[cache_key]

    if backend == "medsam2":
        checkpoint = _required_path_env("MEDSAM2_CHECKPOINT")
        repo_path = _required_path_env("MEDSAM2_REPO_PATH")
        config_file = os.getenv("MEDSAM2_CONFIG", "configs/sam2.1_hiera_t512.yaml")
        cache_key = (backend, checkpoint, repo_path, config_file, device)
        if cache_key not in _ADAPTER_CACHE:
            from .app.models.medsam2_adapter import MedSAM2Adapter

            adapter = MedSAM2Adapter(device=device)
            adapter.load_model(
                checkpoint=checkpoint,
                medsam2_repo_path=repo_path,
                config_file=config_file,
            )
            _ADAPTER_CACHE[cache_key] = adapter
        return _ADAPTER_CACHE[cache_key]

    raise ValueError(f"Unknown MedSAM backend {backend!r}. Use medsam, medsam2, sam, or mock.")


def _required_path_env(name: str, *, fallback_env: Optional[str] = None) -> str:
    raw = os.getenv(name, "").strip()
    if not raw and fallback_env:
        raw = os.getenv(fallback_env, "").strip()
    if not raw:
        raise RuntimeError(f"{name} is required for this MedSAM backend")
    path = Path(raw).expanduser().resolve()
    if not path.exists():
        raise FileNotFoundError(f"{name} path does not exist: {path}")
    return str(path)


def _resolve_output_dir(output_dir: Optional[str]) -> Path:
    raw = output_dir or os.getenv("MEDSAM_OUTPUT_DIR", "").strip()
    if raw:
        return Path(raw).expanduser().resolve()
    return (Path.cwd() / "medsam_outputs").resolve()


def _output_url(path: str) -> str:
    if not path:
        return ""
    try:
        root = medsam_output_root().resolve()
        rel = Path(path).resolve().relative_to(root)
        return f"/medsam_outputs/{rel.as_posix()}"
    except Exception:
        return ""

