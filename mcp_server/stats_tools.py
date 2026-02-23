import pandas as pd
import numpy as np
from scipy import stats
import statsmodels.stats.multitest as smm
import json, os
from io import StringIO
import logging

working_dir = os.getcwd()
UPLOAD_DIR = f'{working_dir}/uploaded_files'
logging.basicConfig(level=logging.INFO, format='[%(asctime)s] [%(levelname)s] %(message)s')

class StatsToolkit:
    @staticmethod
    def load_data(data_input):
        """Helper to handle JSON strings or file paths safely."""
        if isinstance(data_input, str):
            try:
        
                return pd.read_json(StringIO(data_input))
            except ValueError:
                if data_input.endswith('.csv'):
                    
                    # Sanitize filename to prevent path traversal
                    safe_filename = os.path.basename(data_input)
                    if not safe_filename:
                        raise ValueError(f"Invalid filename: {data_input}")
                    
                    # Create unique path to avoid overwrites
                    file_path = os.path.join(UPLOAD_DIR, safe_filename)
                    return pd.read_csv(file_path)
        return pd.DataFrame(data_input)

    #1 - Pearson correlation
    @staticmethod
    def correlation_analysis(data: str, col_a: str, col_b: str) -> dict:
        """Calculates Pearson correlation with text interpretation."""
        try:
            df = StatsToolkit.load_data(data)
            if col_a not in df.columns or col_b not in df.columns:
                return {"error": f"Columns not found. Available: {list(df.columns)}"}
            
            clean_df = df[[col_a, col_b]].dropna()
            corr, p_val = stats.pearsonr(clean_df[col_a], clean_df[col_b])
            
            # Interpretation
            abs_corr = abs(corr)
            if abs_corr > 0.7: strength = "Strong"
            elif abs_corr > 0.3: strength = "Moderate"
            else: strength = "Weak"
            
            direction = "Positive" if corr > 0 else "Negative"
            significance = "Statistically Significant" if p_val < 0.05 else "Not Significant"
            
            explanation = f"Found a {strength} {direction} correlation (r={corr:.2f}) which is {significance} (p={p_val:.4f})."

            return {
                "test": "Pearson Correlation",
                "correlation": round(float(corr), 4),
                "p_value": round(float(p_val), 5),
                "significant": bool(p_val < 0.05),
                "n_samples": len(clean_df),
                "Explanation of results": explanation
            }
        except Exception as e:
            return {"error": str(e)}

    # 2 - Group Comparison
    @staticmethod
    def compare_groups(data: str, group_col: str, val_col: str, g1_val, g2_val, method: str = 'ttest') -> dict:
        """Compares two groups and adds effect size context."""
        try:
            df = StatsToolkit.load_data(data)
            g1 = df[df[group_col] == g1_val][val_col].dropna()
            g2 = df[df[group_col] == g2_val][val_col].dropna()
            
            if len(g1) < 2 or len(g2) < 2:
                return {"error": "One or both groups have fewer than 2 samples."}

            if method == 'mannwhitney':
                stat, p_val = stats.mannwhitneyu(g1, g2)
                test_name = "Mann-Whitney U"
            else:
                stat, p_val = stats.ttest_ind(g1, g2)
                test_name = "Independent T-Test"

            # Calculate Cohen's d
            n1, n2 = len(g1), len(g2)
            var1, var2 = np.var(g1, ddof=1), np.var(g2, ddof=1)
            pooled_se = np.sqrt(((n1 - 1) * var1 + (n2 - 1) * var2) / (n1 + n2 - 2))
            cohens_d = 0.0 if pooled_se == 0 else (np.mean(g1) - np.mean(g2)) / pooled_se

            # Interpretation
            abs_d = abs(cohens_d)
            if abs_d >= 0.8: effect_str = "Large"
            elif abs_d >= 0.5: effect_str = "Medium"
            elif abs_d >= 0.2: effect_str = "Small"
            else: effect_str = "Negligible"

            sig_str = "Significantly different" if p_val < 0.05 else "No significant difference"
            mean_diff = np.mean(g1) - np.mean(g2)
            direction = "higher" if mean_diff > 0 else "lower"
            
            explanation = (f"{sig_str} found between groups (p={p_val:.4f}). "
                           f"Group '{g1_val}' is {direction} than '{g2_val}' "
                           f"with a {effect_str} effect size (d={cohens_d:.2f}).")

            return {
                "test_used": test_name,
                "statistic": round(float(stat), 4),
                "p_value": round(float(p_val), 5),
                "significant": bool(p_val < 0.05),
                "mean_group_1": round(float(g1.mean()), 4),
                "mean_group_2": round(float(g2.mean()), 4),
                "cohens_d": round(float(cohens_d), 4),
                "effect_size": effect_str,
                "Explanation of results": explanation
            }
        except Exception as e:
            return {"error": str(e)}

    # 3 - FDR corelation
    @staticmethod
    def correct_p_values(p_values: list, method: str = 'fdr_bh') -> dict:
        """Corrects p-values and explains the impact."""
        try:
            reject, pvals_corrected, _, _ = smm.multipletests(p_values, alpha=0.05, method=method)
            
            # Interpretation
            original_sig = sum(1 for p in p_values if p < 0.05)
            final_sig = sum(reject)
            dropped = original_sig - final_sig
            
            explanation = (f"Original analysis showed {original_sig} significant results. "
                           f"After FDR correction, {final_sig} remain significant. "
                           f"({dropped} results were likely false positives).")

            return {
                "test": "FDR Correction (Benjamini-Hochberg)",
                "original_p_values": p_values,
                "corrected_p_values": [round(float(p), 5) for p in pvals_corrected],
                "significant_after_correction": reject.tolist(),
                "Explanation of results": explanation
            }
        except Exception as e:
            return {"error": str(e)}

    # 4 - zscore outlier detection
    @staticmethod
    def detect_outliers_zscore(data: str, col: str, threshold: float = 3.0) -> dict:
        """Finds outliers and provides a summary count."""
        try:
            df = StatsToolkit.load_data(data)
            if col not in df.columns:
                return {"error": f"Column '{col}' not found."}
            
            clean_series = df[col].dropna()
            z_vals = stats.zscore(clean_series)
            
            # Identify outliers
            outlier_mask = np.abs(z_vals) > threshold
            outlier_indices = clean_series.index[outlier_mask]
            
            outliers = df.loc[outlier_indices]
            
            # Interpretation
            count = len(outliers)
            total = len(df)
            percent = (count / total) * 100
            
            if count == 0:
                explanation = "No statistical outliers detected."
            else:
                explanation = (f"Detected {count} outliers ({percent:.1f}% of data). "
                               f"Values range from {outliers[col].min()} to {outliers[col].max()}.")

            return {
                "test": "Z-Score Outlier Detection",
                "total_samples": total,
                "outlier_count": count,
                "outlier_indices": outliers.index.tolist(),
                "outlier_values": [float(x) for x in outliers[col].tolist()],
                "Explanation of results": explanation
            }
        except Exception as e:
            return {"error": str(e)}

# mock data test block
if __name__ == "__main__":
    print("Test stats tools and interpretations")

    # 1. Fake  test Data
    fake_data = [
        {"age": 20, "connectivity": 0.9, "group": "A", "noise": 10},
        {"age": 25, "connectivity": 0.85, "group": "A", "noise": 12},
        {"age": 30, "connectivity": 0.8, "group": "A", "noise": 11},
        {"age": 35, "connectivity": 0.75, "group": "B", "noise": 10},
        {"age": 40, "connectivity": 0.7, "group": "B", "noise": 13},
        {"age": 80, "connectivity": 0.2, "group": "B", "noise": 1000} 
    ]
    json_data = json.dumps(fake_data)

    def print_result(title, res):
        print(f"\n[{title}]")
        print(json.dumps(res, indent=2))

    # 2. Run all tests
    res = StatsToolkit.correlation_analysis(json_data, "age", "connectivity")
    print_result("1. Pearson Correlation", res)

    res = StatsToolkit.compare_groups(json_data, "group", "connectivity", "A", "B", method='ttest')
    print_result("2. T-Test (Parametric)", res)

    res = StatsToolkit.compare_groups(json_data, "group", "connectivity", "A", "B", method='mannwhitney')
    print_result("3. Mann-Whitney U (Non-Parametric)", res)
    
    # Lower threshold just for this small test data to force detection (chagne when we actaully have the input from pubmed)
    res = StatsToolkit.detect_outliers_zscore(json_data, "noise", threshold=1.5)
    print_result("4. Outliers (Z-Score)", res)
    
    p_vals = [0.001, 0.04, 0.05, 0.10, 0.90]
    res = StatsToolkit.correct_p_values(p_vals)
    print_result("5. FDR Correction", res)