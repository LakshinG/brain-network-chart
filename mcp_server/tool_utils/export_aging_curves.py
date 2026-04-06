#!/usr/bin/env python3
"""
Export aging-curve MAT files to the frontend JSON format.

Default usage mirrors the phenotype mapping used by the app:

    python mcp_server/tool_utils/export_aging_curves.py

You can also export every .mat file in a directory by stem:

    python mcp_server/tool_utils/export_aging_curves.py --include-all

Or provide a custom mapping file:

    python mcp_server/tool_utils/export_aging_curves.py \
      --mapping my_mapping.json \
      --output cyberneuro_multi-agent-neuroimaging-analysis/data/agingCurves.json

Mapping JSON format:
{
  "Phenotype display name": "SomeFile.mat"
}
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Dict

import h5py
import numpy as np


DEFAULT_MAPPING: Dict[str, str] = {
    "Global mean of FC": "Growth_curve_global_mean_of_FC.mat",
    "Global system segregation of FC": "Growth_curve_global_system_segregation.mat",
    "Visual system segregation (VIS)": "Growth_curve_VIS_system_segregation.mat",
    "Somatomotor system segregation (SM)": "Growth_curve_SM_system_segregation.mat",
    "Dorsal attention system segregation (DA)": "Growth_curve_DA_system_segregation.mat",
    "Ventral attention system segregation (VA)": "Growth_curve_VA_system_segregation.mat",
    "Limbic system segregation (LIM)": "Growth_curve_LIM_system_segregation.mat",
    "Frontoparietal system segregation (FP)": "Growth_curve_FP_system_segregation.mat",
    "Default mode system segregation (DM)": "Growth_curve_DM_system_segregation.mat",
    "Grey matter volume": "GMV.mat",
    "White matter volume": "WMV.mat",
    "Subcortical grey matter volume": "sGMV.mat",
    "Ventricular volume": "Ventricles.mat",
    "Total cerebrum volume": "TCV.mat",
    "Total surface area": "SA.mat",
    "Mean cortical thickness": "CT.mat",
    # "Banks STS volume": f"{working_dir}/mcp_server/tool_utils/curve_mat/bankssts.mat",
    # "Caudal anterior cingulate volume": f"{working_dir}/mcp_server/tool_utils/curve_mat/caudalanteriorcingulate.mat",
    # "Caudal middle frontal volume": f"{working_dir}/mcp_server/tool_utils/curve_mat/caudalmiddlefrontal.mat",
    # "Cuneus volume": f"{working_dir}/mcp_server/tool_utils/curve_mat/cuneus.mat",
    # "Entorhinal volume": f"{working_dir}/mcp_server/tool_utils/curve_mat/entorhinal.mat",
    # "Frontal pole volume": f"{working_dir}/mcp_server/tool_utils/curve_mat/frontalpole.mat",
    # "Fusiform volume": f"{working_dir}/mcp_server/tool_utils/curve_mat/fusiform.mat",
    # "Inferior parietal volume": f"{working_dir}/mcp_server/tool_utils/curve_mat/inferiorparietal.mat",
    # "Inferior temporal volume": f"{working_dir}/mcp_server/tool_utils/curve_mat/inferiortemporal.mat",
    # "Insula volume": f"{working_dir}/mcp_server/tool_utils/curve_mat/insula.mat",
    # "Isthmus cingulate volume": f"{working_dir}/mcp_server/tool_utils/curve_mat/isthmuscingulate.mat",
    # "Lateral occipital volume": f"{working_dir}/mcp_server/tool_utils/curve_mat/lateraloccipital.mat",
    # "Lateral orbitofrontal volume": f"{working_dir}/mcp_server/tool_utils/curve_mat/lateralorbitofrontal.mat",
    # "Lingual volume": f"{working_dir}/mcp_server/tool_utils/curve_mat/lingual.mat",
    # "Medial orbitofrontal volume": f"{working_dir}/mcp_server/tool_utils/curve_mat/medialorbitofrontal.mat",
    # "Middle temporal volume": f"{working_dir}/mcp_server/tool_utils/curve_mat/middletemporal.mat",
    # "Paracentral volume": f"{working_dir}/mcp_server/tool_utils/curve_mat/paracentral.mat",
    # "Parahippocampal volume": f"{working_dir}/mcp_server/tool_utils/curve_mat/parahippocampal.mat",
    # "Pars opercularis volume": f"{working_dir}/mcp_server/tool_utils/curve_mat/parsopercularis.mat",
    # "Pars orbitalis volume": f"{working_dir}/mcp_server/tool_utils/curve_mat/parsorbitalis.mat",
    # "Pars triangularis volume": f"{working_dir}/mcp_server/tool_utils/curve_mat/parstriangularis.mat",
    # "Pericalcarine volume": f"{working_dir}/mcp_server/tool_utils/curve_mat/pericalcarine.mat",
    # "Postcentral volume": f"{working_dir}/mcp_server/tool_utils/curve_mat/postcentral.mat",
    # "Posterior cingulate volume": f"{working_dir}/mcp_server/tool_utils/curve_mat/posteriorcingulate.mat",
    # "Precentral volume": f"{working_dir}/mcp_server/tool_utils/curve_mat/precentral.mat",
    # "Precuneus volume": f"{working_dir}/mcp_server/tool_utils/curve_mat/precuneus.mat",
    # "Rostral anterior cingulate volume": f"{working_dir}/mcp_server/tool_utils/curve_mat/rostralanteriorcingulate.mat",
    # "Rostral middle frontal volume": f"{working_dir}/mcp_server/tool_utils/curve_mat/rostralmiddlefrontal.mat",
    # "Superior frontal volume": f"{working_dir}/mcp_server/tool_utils/curve_mat/superiorfrontal.mat",
    # "Superior parietal volume": f"{working_dir}/mcp_server/tool_utils/curve_mat/superiorparietal.mat",
    # "Superior temporal volume": f"{working_dir}/mcp_server/tool_utils/curve_mat/superiortemporal.mat",
    # "Supramarginal volume": f"{working_dir}/mcp_server/tool_utils/curve_mat/supramarginal.mat",
    # "Temporal pole volume": f"{working_dir}/mcp_server/tool_utils/curve_mat/temporalpole.mat",
    # "Transverse temporal volume": f"{working_dir}/mcp_server/tool_utils/curve_mat/transversetemporal.mat",
}


def load_curve_mat(path: Path) -> dict:
    with h5py.File(path, "r") as handle:
        if "X" not in handle or "centiles" not in handle:
            available = sorted(handle.keys())
            raise KeyError(
                f"{path} does not contain required datasets 'X' and 'centiles'. "
                f"Available keys: {available}"
            )
        x = np.array(handle["X"]).squeeze().tolist()
        centiles = np.array(handle["centiles"]).T.tolist()
    return {"X": x, "centiles": centiles}


def read_mapping(mapping_path: Path) -> Dict[str, str]:
    with mapping_path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, dict):
        raise ValueError(f"Mapping file must be a JSON object: {mapping_path}")
    return {str(key): str(value) for key, value in payload.items()}


def discover_all_mats(mat_dir: Path) -> Dict[str, str]:
    return {mat_path.stem: mat_path.name for mat_path in sorted(mat_dir.glob("*.mat"))}


def export_curves(mat_dir: Path, mapping: Dict[str, str]) -> dict:
    output = {}
    for phenotype, filename in mapping.items():
        mat_path = mat_dir / filename
        if not mat_path.exists():
            raise FileNotFoundError(f"Missing MAT file for '{phenotype}': {mat_path}")
        output[phenotype] = load_curve_mat(mat_path)
    return output


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Export MAT aging curves to JSON.")
    parser.add_argument(
        "--mat-dir",
        default="mcp_server/tool_utils/curve_mat",
        help="Directory containing source .mat files.",
    )
    parser.add_argument(
        "--output",
        default="cyberneuro_multi-agent-neuroimaging-analysis/data/agingCurves.json",
        help="Path to the output JSON file.",
    )
    parser.add_argument(
        "--mapping",
        help="Optional JSON file mapping phenotype names to .mat filenames.",
    )
    parser.add_argument(
        "--include-all",
        action="store_true",
        help="Export every .mat file in --mat-dir using each file stem as the phenotype name.",
    )
    parser.add_argument(
        "--pretty",
        action="store_true",
        help="Write formatted JSON instead of compact JSON.",
    )
    return parser


def main() -> int:
    args = build_parser().parse_args()
    mat_dir = Path(args.mat_dir)
    output_path = Path(args.output)

    if not mat_dir.exists():
        raise FileNotFoundError(f"MAT directory not found: {mat_dir}")

    if args.mapping:
        mapping = read_mapping(Path(args.mapping))
    elif args.include_all:
        mapping = discover_all_mats(mat_dir)
    else:
        mapping = DEFAULT_MAPPING

    payload = export_curves(mat_dir, mapping)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with output_path.open("w", encoding="utf-8") as handle:
        if args.pretty:
            json.dump(payload, handle, indent=2)
        else:
            json.dump(payload, handle, separators=(",", ":"))

    print(f"Wrote {len(payload)} phenotypes to {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
