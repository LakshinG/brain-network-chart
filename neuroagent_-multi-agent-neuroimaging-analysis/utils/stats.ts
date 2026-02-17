
import { DatasetRow, Dataset, GroupComparisonResult } from '../types';

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

export const mergeDatasets = (datasets: Dataset[]): Dataset | null => {
  if (datasets.length === 0) return null;
  if (datasets.length === 1) return { ...datasets[0], name: datasets[0].name };

  // Try to find a common ID column to join on
  const potentialIds = ['ID', 'id', 'Subject', 'subject', 'RID', 'rid', 'Participant_ID', 'participant_id', 'Case', 'case'];
  let idCol: string | null = null;

  for (const cand of potentialIds) {
    if (datasets.every(d => d.columns.includes(cand))) {
      idCol = cand;
      break;
    }
  }

  if (idCol) {
    // Perform Full Outer Join on idCol
    const mergedDataMap = new Map<string | number, DatasetRow>();
    const allColumns = new Set<string>();

    datasets.forEach(ds => {
      ds.columns.forEach(c => allColumns.add(c));
      ds.data.forEach(row => {
        const key = row[idCol!] as string | number;
        if (key !== undefined) {
          const existing = mergedDataMap.get(key) || {};
          // Merge rows, later datasets overwrite earlier ones if keys conflict (except ID)
          mergedDataMap.set(key, { ...existing, ...row });
        }
      });
    });

    const columns = Array.from(allColumns);
    // Ensure ID col is first
    const idIdx = columns.indexOf(idCol);
    if (idIdx > -1) {
      columns.splice(idIdx, 1);
      columns.unshift(idCol);
    }

    return {
      id: 'merged-' + Date.now(),
      name: `Merged (${datasets.length} files)`,
      columns,
      data: Array.from(mergedDataMap.values())
    };
  } else {
    // No common ID -> Concatenate Rows (Union of columns)
    const allColumns = new Set<string>();
    datasets.forEach(ds => ds.columns.forEach(c => allColumns.add(c)));
    const columns = Array.from(allColumns);
    
    const data: DatasetRow[] = [];
    datasets.forEach(ds => {
      data.push(...ds.data);
    });

    return {
      id: 'merged-concat-' + Date.now(),
      name: `Concat (${datasets.length} files)`,
      columns,
      data
    };
  }
};

// Simple Pearson correlation
export const calculateCorrelation = (data: DatasetRow[], xCol: string, yCol: string) => {
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  let n = 0;

  const dataPoints: { x: number, y: number, group?: string }[] = [];

  // Helper to determine if we need to remap categorical/string values to numbers
  const createMapper = (col: string) => {
    const colValues = data.map(d => d[col]).filter(v => v !== undefined && v !== null);
    const isAllNumeric = colValues.every(v => typeof v === 'number');

    if (isAllNumeric) {
      return (val: any) => val as number;
    }

    // Identify unique values and assign an index
    const uniqueVals = Array.from(new Set(colValues)).sort();
    const valMap = new Map(uniqueVals.map((v, i) => [v, i]));
    return (val: any) => valMap.get(val);
  };

  const xMapper = createMapper(xCol);
  const yMapper = createMapper(yCol);

  data.forEach(row => {
    const rawX = row[xCol];
    const rawY = row[yCol];
    
    if (rawX === undefined || rawX === null || rawY === undefined || rawY === null) return;

    const x = xMapper(rawX);
    const y = yMapper(rawY);

    if (typeof x === 'number' && typeof y === 'number') {
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
      sumY2 += y * y;
      n++;
      
      let label = undefined;
      // If we remapped, store the original label for visualization context
      if (typeof rawX === 'string' || typeof rawY === 'string') {
        label = `(${rawX}, ${rawY})`;
      }
      dataPoints.push({ x, y, group: label });
    }
  });

  if (n === 0) return { r: 0, p: 0, dataPoints: [] };

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  
  const r = denominator === 0 ? 0 : numerator / denominator;
  // Mock p-value calculation based on r strength (simplified)
  const p = Math.max(0.001, Math.exp(-Math.abs(r) * 5)); 

  return { r, p, dataPoints };
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
