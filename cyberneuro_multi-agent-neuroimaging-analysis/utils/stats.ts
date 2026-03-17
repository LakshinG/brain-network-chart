
import { DatasetRow, Dataset, GroupComparisonResult, ClusteringResult, CorrelationResult, StratificationResult, SVMResult, CorrelationSeries } from '../types';

export const parseCSV = (csvText: string): { columns: string[], data: DatasetRow[] } => {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return { columns: [], data: [] };

  const columns = lines[0].split(',').map(c => c.trim());
  const data = lines.slice(1).map(line => {
    const values = line.split(',');
    const row: DatasetRow = {};
    columns.forEach((col, idx) => {
      const val = values[idx]?.trim();
      const numVal = parseFloat(val);
      row[col] = isNaN(numVal) ? val : numVal;
    });
    return row;
  });

  return { columns, data };
};

export const datasetToCSV = (dataset: Dataset): string => {
  const header = dataset.columns.join(',');
  const rows = dataset.data.map(row => 
    dataset.columns.map(col => {
      const val = row[col];
      return (val === undefined || val === null) ? '' : String(val);
    }).join(',')
  );
  return [header, ...rows].join('\n');
};

// Pearson correlation supporting grouping
export const calculateCorrelation = (data: DatasetRow[], xCol: string, yCol: string, groupCol?: string): CorrelationResult => {
  const seriesList: CorrelationSeries[] = [];

  const calcSeries = (subset: DatasetRow[], name: string): CorrelationSeries | null => {
      let sumX: number = 0;
      let sumY: number = 0;
      let sumXY: number = 0;
      let sumX2: number = 0;
      let sumY2: number = 0;
      let n = 0;
      const dataPoints: { x: number, y: number, id?: string }[] = [];

      subset.forEach(row => {
        const rawX = row[xCol];
        const rawY = row[yCol];
        
        if (rawX === undefined || rawX === null || rawY === undefined || rawY === null) return;

        const x = typeof rawX === 'number' ? rawX : parseFloat(String(rawX));
        const y = typeof rawY === 'number' ? rawY : parseFloat(String(rawY));

        if (!isNaN(x) && !isNaN(y)) {
          if (x === 0 || y === 0) return; // Exclude zeros

          sumX += x;
          sumY += y;
          sumXY += x * y;
          sumX2 += x * x;
          sumY2 += y * y;
          n++;
          
          let id = undefined;
          if (row['ID'] || row['id']) id = String(row['ID'] || row['id']);
          
          dataPoints.push({ x, y, id });
        }
      });

      if (n === 0) return null;

      const numerator = n * sumXY - sumX * sumY;
      const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
      
      const r = denominator === 0 ? 0 : numerator / denominator;
      const p = Math.max(0.001, Math.exp(-Math.abs(r) * 5)); // Simplified p-value

      return { name, r, p, n, dataPoints };
  };

  if (groupCol) {
      const groups: Record<string, DatasetRow[]> = {};
      data.forEach(row => {
         const g = row[groupCol];
         if (g !== undefined && g !== null) {
             const key = String(g);
             if (!groups[key]) groups[key] = [];
             groups[key].push(row);
         }
      });
      
      Object.keys(groups).sort().forEach(gName => {
          const s = calcSeries(groups[gName], gName);
          if (s) seriesList.push(s);
      });
  } else {
      const s = calcSeries(data, 'All Data');
      if (s) seriesList.push(s);
  }

  return { xCol, yCol, groupCol, series: seriesList };
};

// --- Statistics Helpers for Group Comparison ---

const getMean = (data: number[]) => data.reduce((a, b) => a + b, 0) / data.length;

const getVariance = (data: number[]) => {
  const m = getMean(data);
  return data.reduce((a, b) => a + Math.pow(b - m, 2), 0) / (data.length - 1);
};

// Approximate Normal CDF (Hastings approximation)
const normalCDF = (x: number): number => {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  let prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (x > 0) prob = 1 - prob;
  return prob;
};

// Simple T-test implementation (assuming equal variance for Cohen's d consistency)
const compareTwoGroups = (g1: number[], g2: number[], name1: string, name2: string) => {
  const n1 = g1.length;
  const n2 = g2.length;
  
  if (n1 < 2 || n2 < 2) return null;

  const mean1 = getMean(g1);
  const mean2 = getMean(g2);
  const var1 = getVariance(g1);
  const var2 = getVariance(g2);

  // Cohen's d calculation (Pooled Standard Deviation)
  // Formula: sqrt(((n1 - 1) * var1 + (n2 - 1) * var2) / (n1 + n2 - 2))
  const pooledVar = ((n1 - 1) * var1 + (n2 - 1) * var2) / (n1 + n2 - 2);
  const pooledSD = Math.sqrt(pooledVar);
  const cohensD = pooledSD === 0 ? 0 : (mean1 - mean2) / pooledSD;

  // Independent T-Test (Equal Variance Assumption matching the Pooled SD logic above)
  const standardError = pooledSD * Math.sqrt((1 / n1) + (1 / n2));
  const tStat = standardError === 0 ? 0 : (mean1 - mean2) / standardError;
  const df = n1 + n2 - 2;

  // P-value approximation (Two-tailed)
  // Using Normal CDF approximation for simplicity (works reasonably well for N > 30, loose for small N)
  // In a real app, use a proper T-distribution CDF
  const pVal = 2 * normalCDF(-Math.abs(tStat));

  // Interpretation strings
  const absD = Math.abs(cohensD);
  let effectStr = "Negligible";
  if (absD >= 0.8) effectStr = "Large";
  else if (absD >= 0.5) effectStr = "Medium";
  else if (absD >= 0.2) effectStr = "Small";

  const sigStr = pVal < 0.05 ? "Significantly different" : "No significant difference";
  const direction = (mean1 - mean2) > 0 ? "higher" : "lower";
  
  const explanation = `${sigStr} found between groups (p=${pVal.toFixed(4)}). Group '${name1}' is ${direction} than '${name2}' with a ${effectStr} effect size (d=${cohensD.toFixed(2)}).`;

  return {
    groupA: name1,
    groupB: name2,
    testName: "Independent T-Test",
    statistic: parseFloat(tStat.toFixed(4)),
    pVal: parseFloat(pVal.toFixed(5)),
    significant: pVal < 0.05,
    cohensD: parseFloat(cohensD.toFixed(4)),
    effectSize: effectStr,
    meanA: parseFloat(mean1.toFixed(4)),
    meanB: parseFloat(mean2.toFixed(4)),
    explanation
  };
};

export const getGroupStats = (data: DatasetRow[], groupCol: string, valCol: string) => {
  const groups: Record<string, number[]> = {};

  // Group data
  data.forEach(row => {
    const g = String(row[groupCol]).trim();
    const v = row[valCol];
    if (typeof v === 'number' && g && g !== 'undefined' && g !== 'null') {
      if (!groups[g]) groups[g] = [];
      groups[g].push(v);
    }
  });

  const groupNames = Object.keys(groups).sort();
  
  // Calculate descriptive stats for ALL groups (for Box Plot visualization)
  const stats = groupNames.map(g => {
    const vals = groups[g].sort((a, b) => a - b);
    const sum = vals.reduce((a, b) => a + b, 0);
    return {
      group: g,
      mean: sum / vals.length,
      median: vals[Math.floor(vals.length / 2)],
      min: vals[0],
      max: vals[vals.length - 1]
    };
  });

  // Calculate Pairwise Comparisons for ALL unique pairs
  const allComparisons = [];

  for (let i = 0; i < groupNames.length; i++) {
    for (let j = i + 1; j < groupNames.length; j++) {
       const result = compareTwoGroups(groups[groupNames[i]], groups[groupNames[j]], groupNames[i], groupNames[j]);
       if (result) if (result.significant) allComparisons.push(result);
    }
  }

  // Filter to return only significant comparisons
  const pairwiseComparisons = allComparisons.filter(c => c.significant);

  // Calculate overall ANOVA-like p-value (Mock for overview)
  // Use all comparisons for a rough aggregate estimation of the global model
  const pVal =
    allComparisons.length > 0
      ? allComparisons.reduce((sum, pc) => sum + pc.pVal, 0) /
        allComparisons.length
      : 1.0;

  return {
    groupCol,
    valueCol: valCol,
    groups: groupNames,
    pVal,
    stats,
    pairwiseComparisons
  };
};

// --- Clustering Analysis Helpers ---

// Calculate PCA using covariance method and Jacobi algorithm approximation
const calculatePCA = (matrix: number[][]): { pc1: number[], pc2: number[] } => {
  // matrix is N rows x F features
  const n = matrix.length;
  if (n === 0) return { pc1: [], pc2: [] };
  const f = matrix[0].length;

  // 1. Standardize the data (Centering and Scaling)
  const means = Array(f).fill(0);
  const stds = Array(f).fill(0);

  for (let j = 0; j < f; j++) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += matrix[i][j];
    means[j] = sum / n;
  }

  for (let j = 0; j < f; j++) {
    let sumSq = 0;
    for (let i = 0; i < n; i++) sumSq += Math.pow(matrix[i][j] - means[j], 2);
    stds[j] = Math.sqrt(sumSq / (n - 1)) || 1; // avoid divide by zero
  }

  const standardized = matrix.map(row => row.map((val, j) => (val - means[j]) / stds[j]));

  // 2. Compute Covariance Matrix (F x F)
  const cov: number[][] = Array(f).fill(0).map(() => Array(f).fill(0));
  for (let j = 0; j < f; j++) {
    for (let k = j; k < f; k++) {
      let sum = 0;
      for (let i = 0; i < n; i++) {
        sum += standardized[i][j] * standardized[i][k];
      }
      cov[j][k] = sum / (n - 1);
      cov[k][j] = cov[j][k]; // Symmetric
    }
  }

  // 3. Eigen decomposition (Simplified Power Iteration for Top 2 Components)
  // Finding First Eigenvector
  const getDominantEigenvector = (mat: number[][], iterations = 20): number[] => {
    const dim = mat.length;
    let v = Array(dim).fill(0).map(() => Math.random());
    // Normalize
    let norm = Math.sqrt(v.reduce((a, b) => a + b * b, 0));
    v = v.map(x => x / norm);

    for (let iter = 0; iter < iterations; iter++) {
      // w = mat * v
      const w = Array(dim).fill(0);
      for (let i = 0; i < dim; i++) {
        for (let j = 0; j < dim; j++) {
          w[i] += mat[i][j] * v[j];
        }
      }
      // v = w / norm(w)
      norm = Math.sqrt(w.reduce((a, b) => a + b * b, 0));
      if (norm === 0) break;
      v = w.map(x => x / norm);
    }
    return v;
  };

  const ev1 = getDominantEigenvector(cov);
  
  // Deflate matrix to find second eigenvector: A' = A - lambda1 * v1 * v1^T
  // lambda1 approx = v1^T * A * v1
  let lambda1 = 0;
  for (let i=0; i<f; i++) {
    let rowSum = 0;
    for(let j=0; j<f; j++) rowSum += cov[i][j] * ev1[j];
    lambda1 += ev1[i] * rowSum;
  }

  const cov2 = cov.map((row, i) => row.map((val, j) => val - lambda1 * ev1[i] * ev1[j]));
  const ev2 = getDominantEigenvector(cov2);

  // 4. Project data onto PC1 and PC2
  const pc1 = standardized.map(row => row.reduce((sum, val, j) => sum + val * ev1[j], 0));
  const pc2 = standardized.map(row => row.reduce((sum, val, j) => sum + val * ev2[j], 0));

  return { pc1, pc2 };
};

// Simple K-Means implementation
const calculateKMeans = (points: {x: number, y: number}[], k: number): number[] => {
  if (points.length === 0) return [];
  const n = points.length;
  // Initialize centroids (Pick first k points for simplicity, or random)
  const centroids = points.slice(0, k).map(p => ({ ...p }));
  // If n < k, we just return distinct clusters
  if (n < k) return points.map((_, i) => i);

  let assignments = new Array(n).fill(0);
  let changed = true;
  let iter = 0;
  const maxIter = 50;

  while (changed && iter < maxIter) {
    changed = false;
    // Assign points
    for (let i = 0; i < n; i++) {
      let minDist = Infinity;
      let cluster = 0;
      for (let c = 0; c < k; c++) {
        const dist = Math.pow(points[i].x - centroids[c].x, 2) + Math.pow(points[i].y - centroids[c].y, 2);
        if (dist < minDist) {
          minDist = dist;
          cluster = c;
        }
      }
      if (assignments[i] !== cluster) {
        assignments[i] = cluster;
        changed = true;
      }
    }

    // Update centroids
    const sums = Array(k).fill(0).map(() => ({ x: 0, y: 0, count: 0 }));
    for (let i = 0; i < n; i++) {
      const c = assignments[i];
      sums[c].x += points[i].x;
      sums[c].y += points[i].y;
      sums[c].count++;
    }

    for (let c = 0; c < k; c++) {
      if (sums[c].count > 0) {
        centroids[c].x = sums[c].x / sums[c].count;
        centroids[c].y = sums[c].y / sums[c].count;
      }
    }
    iter++;
  }

  return assignments;
};

// Spectral Clustering Orchestrator
export const performSpectralClustering = (
    data: DatasetRow[], 
    featureCols: string[], 
    targetCol: string | undefined, 
    nCluster: number
): ClusteringResult => {
    // 1. Extract feature matrix
    const matrix: number[][] = [];
    const validIndices: number[] = [];

    data.forEach((row, i) => {
        // Ensure all features are present and numeric
        const features = featureCols.map(c => parseFloat(String(row[c])));
        let validTarget = true;
        
        if (targetCol) {
            const target = parseFloat(String(row[targetCol]));
            if (isNaN(target)) validTarget = false;
        }
        
        if (features.every(val => !isNaN(val)) && validTarget) {
            matrix.push(features);
            validIndices.push(i);
        }
    });

    if (matrix.length < nCluster) throw new Error("Not enough data points for clustering.");

    // 2. PCA
    const { pc1, pc2 } = calculatePCA(matrix);

    // 3. K-Means on PC1, PC2
    const points2D = pc1.map((v, i) => ({ x: v, y: pc2[i] }));
    const clusterIds = calculateKMeans(points2D, nCluster);

    // 4. Construct Result
    const pcPoints = validIndices.map((origIdx, i) => {
        const p: any = {
            x: pc1[i],
            y: pc2[i],
            cluster: clusterIds[i],
            id: String(data[origIdx]['ID'] || data[origIdx]['Subject'] || i)
        };
        if (targetCol) {
            p.target = parseFloat(String(data[origIdx][targetCol]));
        }
        return p;
    });

    // 5. Correlation: Cluster ID vs Target (Optional)
    let correlation: CorrelationResult | undefined;
    
    if (targetCol) {
        // Prepare fake dataset for correlation calculation
        const correlationData: DatasetRow[] = pcPoints.map((p: any) => ({
            Cluster: p.cluster,
            Target: p.target
        }));
        
        correlation = calculateCorrelation(correlationData, 'Cluster', 'Target');
    }

    // 6. Assignments for merging back
    const assignments = validIndices.map((origIdx, i) => ({
        originalIndex: origIdx,
        cluster: clusterIds[i]
    }));

    return {
        featureCols,
        targetCol,
        nCluster,
        pcPoints,
        clusterCorrelation: correlation,
        assignments
    };
};

// Stratify Dataset
export const stratifyDataset = (data: DatasetRow[], targetCol: string, groupCol: string, maxGroups: number = 10) => {
  const values = data.map(r => r[groupCol]).filter(v => v !== undefined && v !== null);
  // Check if really numeric (heuristic: >80% are numbers)
  const numCount = values.filter(v => !isNaN(parseFloat(String(v)))).length;
  const isNumeric = (numCount / values.length) > 0.8;
  const distinctCount = new Set(values).size;

  let groups: { name: string, matcher: (val: any) => boolean }[] = [];

  // Logic: Use bins if numeric AND high cardinality (> maxGroups). Else treat as discrete.
  if (isNumeric && distinctCount > maxGroups) {
      const nums = values.map(v => parseFloat(String(v))).filter(n => !isNaN(n));
      const min = Math.min(...nums);
      const max = Math.max(...nums);
      const step = (max - min) / maxGroups;

      for (let i = 0; i < maxGroups; i++) {
          const lower = min + (i * step);
          const upper = i === maxGroups - 1 ? max : min + ((i + 1) * step);
          // Use safe naming
          const label = `${targetCol}_${groupCol}_${lower.toFixed(1)}to${upper.toFixed(1)}`.replace(/\./g, 'p');
          
          groups.push({
              name: label,
              matcher: (val: any) => {
                  const n = parseFloat(String(val));
                  if (isNaN(n)) return false;
                  return n >= lower && (i === maxGroups - 1 ? n <= upper : n < upper);
              }
          });
      }
  } else {
      const counts: Record<string, number> = {};
      values.forEach(v => {
          const s = String(v);
          counts[s] = (counts[s] || 0) + 1;
      });
      
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, maxGroups);
      
      groups = sorted.map(([val]) => ({
          name: `${targetCol}_${groupCol}_${val.replace(/[^a-zA-Z0-9]/g, '')}`,
          matcher: (rowVal: any) => String(rowVal) === val
      }));
  }

  const newColsStats = groups.map(g => ({ name: g.name, count: 0 }));
  const newData = data.map(row => {
      const newRow = { ...row };
      const gVal = row[groupCol];
      const tVal = row[targetCol];
      
      let matched = false;
      groups.forEach((g, idx) => {
          if (g.matcher(gVal)) {
              newRow[g.name] = tVal;
              newColsStats[idx].count++;
              matched = true;
          }
      });
      
      return newRow;
  });

  return {
      transformedData: newData,
      result: {
          targetCol,
          groupCol,
          newColumns: newColsStats.filter(c => c.count > 0)
      }
  };
};

// --- SVM Classification Helpers (Simplified SGD) ---

export const calculateLinearSVM = (data: DatasetRow[], xCol: string, yCol: string, targetCol: string): SVMResult => {
  // 1. Prepare data
  let validData = data.filter(row => {
      const x = parseFloat(String(row[xCol]));
      const y = parseFloat(String(row[yCol]));
      const t = row[targetCol];
      return !isNaN(x) && !isNaN(y) && t !== undefined && t !== null && t !== '';
  });

  if (validData.length < 4) throw new Error("Not enough data for SVM Classification.");

  // 2. Map Target to Binary (-1, 1)
  const targetValues = Array.from(new Set(validData.map(r => String(r[targetCol]))));
  if (targetValues.length < 2) throw new Error("Target column must have at least 2 distinct classes.");
  
  // Use first two unique values, ignore others or treat as binary split
  const class0 = targetValues[0];
  const class1 = targetValues[1];
  const classes = [class0, class1];

  // 3. Normalize Features (StandardScaler)
  const xVals = validData.map(r => parseFloat(String(r[xCol])));
  const yVals = validData.map(r => parseFloat(String(r[yCol])));
  
  const meanX = getMean(xVals), stdX = Math.sqrt(getVariance(xVals)) || 1;
  const meanY = getMean(yVals), stdY = Math.sqrt(getVariance(yVals)) || 1;

  const trainingData = validData.map(r => ({
      x: (parseFloat(String(r[xCol])) - meanX) / stdX,
      y: (parseFloat(String(r[yCol])) - meanY) / stdY,
      label: String(r[targetCol]) === class1 ? 1 : -1,
      original: r
  }));

  // 4. Train Linear SVM using SGD (Hinge Loss)
  // Minimize: 0.5 * ||w||^2 + C * sum(max(0, 1 - y_i(w*x_i + b)))
  // Gradient for w: w - C*y_i*x_i (if error) else w
  let wx = 0.1, wy = 0.1, b = 0.0; // Weights
  const learningRate = 0.01;
  const C = 1.0; // Regularization parameter
  const epochs = 500;

  for (let epoch = 0; epoch < epochs; epoch++) {
      // Shuffle roughly
      trainingData.sort(() => Math.random() - 0.5);
      
      let eta = learningRate / (1 + epoch * learningRate); // Decaying learning rate

      trainingData.forEach(point => {
          const prediction = wx * point.x + wy * point.y + b;
          if (point.label * prediction < 1) {
              // Misclassified or within margin
              wx = wx - eta * (wx - C * point.label * point.x);
              wy = wy - eta * (wy - C * point.label * point.y);
              b = b - eta * (-C * point.label);
          } else {
              // Correctly classified outside margin
              wx = wx - eta * (wx);
              wy = wy - eta * (wy);
          }
      });
  }

  // 5. Calculate Accuracy
  let correct = 0;
  const plotPoints = trainingData.map(p => {
      const val = wx * p.x + wy * p.y + b;
      const predLabel = val >= 0 ? 1 : -1;
      if (predLabel === p.label) correct++;
      
      // Denormalize coordinates for plotting
      return {
          x: p.x * stdX + meanX,
          y: p.y * stdY + meanY,
          classLabel: p.label === 1 ? class1 : class0,
          predicted: predLabel === 1 ? class1 : class0
      };
  });
  
  const accuracy = correct / trainingData.length;

  // 6. Calculate De-normalized Hyperplane
  // Normalized: wx * ((X - mx)/sx) + wy * ((Y - my)/sy) + b = 0
  // Real scale: WX * X + WY * Y + B = 0
  // WX = wx / sx
  // WY = wy / sy
  // B = b - (wx * mx / sx) - (wy * my / sy)
  
  const WX = wx / stdX;
  const WY = wy / stdY;
  const B = b - (wx * meanX / stdX) - (wy * meanY / stdY);

  // Find two points to draw the line within the data range
  const minX = Math.min(...plotPoints.map(p => p.x));
  const maxX = Math.max(...plotPoints.map(p => p.x));
  
  // y = (-B - WX * x) / WY
  const y1 = (-B - WX * minX) / WY;
  const y2 = (-B - WX * maxX) / WY;

  return {
      xCol,
      yCol,
      targetCol,
      accuracy,
      weights: { wx: WX, wy: WY, b: B },
      classes,
      dataPoints: plotPoints,
      decisionBoundary: { x1: minX, y1, x2: maxX, y2 }
  };
};