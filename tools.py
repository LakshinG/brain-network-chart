
from wavelets import cfc, thresholding, harmonic_wavelets
from hub_detection import detect_hubs_from_graphs
import numpy as np
import argparse
import io
import h5py
import pandas as pd
from utils import corrcoef

class AnalysisConfig():
  
    window: int = 50
    step: int = 3
    padding: bool = True
    ratio: float = 0.8
    wavelets_num: int = 10
    beta: float = 1.0
    gamma: float = 0.005
    max_iter: int = 100
    min_err: float = 1e-6
    node_select: int = 10
    

    k: int = 2
    hub_num: int = 10
    use_group: bool = False
    
    
    x_phenotype: str = 'Global mean of FC'
    y_path: str = ''
    age_col: str = ''
    val_col: str = ''
    

def tool_cfc_wavelet( bolds: np.ndarray,  config: AnalysisConfig,):

        fcs = corrcoef(bolds)
        adjs = thresholding(fcs, ratio=config.ratio)
        # graphs = [nx.from_numpy_array(adj) for adj in adjs]
        wavelets_list = []
        for i, adj in enumerate(adjs):
            wavelet = harmonic_wavelets(
                adj,
                wavelets_num=config.wavelets_num,
                beta=config.beta,
                gamma=config.gamma,
                max_iter=config.max_iter,
                min_err=config.min_err,
                node_select=config.node_select,
            )
            wavelets_list.append(wavelet)
        cfcs = []
        for i, (wavelet, bold_window) in enumerate(zip(wavelets_list, bolds)):
            
            cfc_result = cfc(wavelet, bold_window,config.wavelets_num)
            
            if isinstance(cfc_result, tuple):
                cfc_matrix = cfc_result[0]
            else:
                cfc_matrix = cfc_result

            if isinstance(cfc_matrix, np.ndarray):
                if cfc_matrix.ndim == 3:
                    cfc_2d = np.mean(cfc_matrix, axis=0)
                elif cfc_matrix.ndim == 2:
                    cfc_2d = cfc_matrix
                else:
                    cfc_2d = cfc_matrix.reshape(-1, cfc_matrix.shape[-1])
                
                cfc_clean = np.nan_to_num(cfc_2d, nan=0.0, posinf=0.0, neginf=0.0)
                cfcs.append(cfc_clean.tolist())
            else:
                cfcs.append([[0.0]])

        return cfcs

def tool_hub_detection( bolds: np.ndarray, config: AnalysisConfig):
    
        fcs = corrcoef(bolds)
        adjs = thresholding(fcs, ratio=config.ratio)
        # graphs = [nx.from_numpy_array(adj) for adj in adjs]
        
        # Hub Detection

        print(f"Running hub detection with k={config.k}, hub_num={config.hub_num}, use_group={config.use_group}")
        
        hub_results = detect_hubs_from_graphs(
            adjs,
            k=config.k,
            hub=config.hub_num,
            use_group=config.use_group
        )
        
        return hub_results


def _build_dummy_bolds(num_windows: int, num_nodes: int, num_timepoints: int) -> np.ndarray:
    rng = np.random.default_rng(42)
    return rng.standard_normal((num_windows, num_nodes, num_timepoints)).astype(np.float32)




def load_mat_v73(path: str) -> dict:
    """Load a MATLAB v7.3 .mat file."""
    with h5py.File(path, "r") as f:
        keys = list(f.keys())
        X = np.array(f["X"]).squeeze()
        centiles = np.array(f["centiles"]).T
    
    return {
        "X": X.tolist(),
        "centiles": centiles.tolist(),
    }


def load_curve_data(phenotype: str, 
    PHENOTYPES = {
        "Global mean of FC": "/ram/USERS/tao/code/gift/BrainChart-FC-Lifespan/Data/Growth_curve_global_mean_of_FC.mat",
        "Global system segregation": "/ram/USERS/tao/code/gift/BrainChart-FC-Lifespan/Data/Growth_curve_global_system_segregation.mat",
        "Visual system segregation (VIS)": "/ram/USERS/tao/code/gift/BrainChart-FC-Lifespan/Data/Growth_curve_VIS_system_segregation.mat",
        "Somatomotor system segregation (SM)": "/ram/USERS/tao/code/gift/BrainChart-FC-Lifespan/Data/Growth_curve_SM_system_segregation.mat",
        "Dorsal attention system segregation (DA)": "/ram/USERS/tao/code/gift/BrainChart-FC-Lifespan/Data/Growth_curve_DA_system_segregation.mat",
        "Ventral attention system segregation (VA)": "/ram/USERS/tao/code/gift/BrainChart-FC-Lifespan/Data/Growth_curve_VA_system_segregation.mat",
        "Limbic system segregation (LIM)": "/ram/USERS/tao/code/gift/BrainChart-FC-Lifespan/Data/Growth_curve_LIM_system_segregation.mat",
        "Frontoparietal system segregation (FP)": "/ram/USERS/tao/code/gift/BrainChart-FC-Lifespan/Data/Growth_curve_FP_system_segregation.mat",
        "Default mode system segregation (DM)": "/ram/USERS/tao/code/gift/BrainChart-FC-Lifespan/Data/Growth_curve_DM_system_segregation.mat",
    }) -> dict:
    """Load growth curve data for a phenotype."""
    
    if phenotype not in PHENOTYPES:
        raise ValueError(f"Phenotype not found. Available: {list(PHENOTYPES.keys())}")
    mat_path = PHENOTYPES[phenotype]
    return load_mat_v73(mat_path)


def _read_table(contents: bytes) -> pd.DataFrame:
    try:
        return pd.read_csv(
            io.BytesIO(contents),
            sep=None,
            engine="python",
            on_bad_lines="skip",
            encoding="utf-8",
        )
    except Exception:
        try:
            return pd.read_csv(
                io.BytesIO(contents),
                sep=",",
                on_bad_lines="skip",
                encoding="utf-8",
            )
        except Exception:
            return pd.read_csv(
                io.BytesIO(contents),
                sep="\t",
                on_bad_lines="skip",
                encoding="utf-8",
            )


def overlay_data_from_bytes(contents: bytes, age_col: str, val_col: str) -> dict:
    df = _read_table(contents)

    df.columns = df.columns.str.strip()
    df = df.replace([np.inf, -np.inf], np.nan)

    if age_col not in df.columns or val_col not in df.columns:
        raise ValueError(
            f"Columns not found. Available: {df.columns.tolist()}, "
            f"Requested: age={age_col}, val={val_col}"
        )

    age_raw = df[age_col].to_numpy(dtype=float)
    y_raw = df[val_col].to_numpy(dtype=float)

    valid_mask = ~(np.isnan(age_raw) | np.isnan(y_raw))
    age = age_raw[valid_mask] / 12
    y = y_raw[valid_mask]

    return {
        "age": age.tolist(),
        "values": y.tolist(),
    }


def overlay_data_from_file(path: str, age_col: str, val_col: str) -> dict:
    with open(path, "rb") as f:
        contents = f.read()
    return overlay_data_from_bytes(contents, age_col=age_col, val_col=val_col)


def tool_normative_analysis(config: AnalysisConfig) -> dict:
    x_phenotype = config.x_phenotype
    y_path = config.y_path
    age_col = config.age_col
    val_col = config.val_col
    x_data = load_curve_data(x_phenotype)
    y_data = overlay_data_from_file(y_path, age_col=age_col, val_col=val_col)
    return x_data | y_data


def main():
    parser = argparse.ArgumentParser(description="Quick local test for CFC wavelet and hub detection.")
    parser.add_argument("--mode", choices=["cfc", "hub", "normative"], default="hub")
    parser.add_argument("--windows", type=int, default=5)
    parser.add_argument("--nodes", type=int, default=20)
    parser.add_argument("--timepoints", type=int, default=60)
    args = parser.parse_args()

    config = AnalysisConfig()
    bolds = _build_dummy_bolds(args.windows, args.nodes, args.timepoints)

    if args.mode == "hub":
        result = tool_hub_detection(bolds, config)
        if isinstance(result, dict) and result.get("method") == "group":
            hub_nodes = result.get("hub_nodes", [])
            print(f"Hub detection (group): hubs={len(hub_nodes)}")
        else:
            count = len(result.get("results", [])) if isinstance(result, dict) else 0
            print(f"Hub detection (individual): results={count}")
    elif args.mode == "cfc":
        cfcs = tool_cfc_wavelet(bolds, config)
        count = len(cfcs) if isinstance(cfcs, list) else 0
        shape = (len(cfcs[0]), len(cfcs[0][0])) if count and cfcs[0] else None
        print(f"CFC wavelet: windows={count}, first_matrix_shape={shape}")
    else:
        tool_normative_analysis(config)


if __name__ == "__main__":
    main()
