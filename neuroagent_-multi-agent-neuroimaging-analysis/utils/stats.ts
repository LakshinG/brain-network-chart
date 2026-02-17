
import { DatasetRow, Dataset } from '../types';

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

  const dataPoints: { x: number, y: number }[] = [];

  data.forEach(row => {
    const x = row[xCol];
    const y = row[yCol];
    if (typeof x === 'number' && typeof y === 'number') {
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
      sumY2 += y * y;
      n++;
      dataPoints.push({ x, y });
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

export const getGroupStats = (data: DatasetRow[], groupCol: string, valCol: string) => {
  const groups: Record<string, number[]> = {};

  data.forEach(row => {
    const g = String(row[groupCol]);
    const v = row[valCol];
    if (typeof v === 'number') {
      if (!groups[g]) groups[g] = [];
      groups[g].push(v);
    }
  });

  const stats = Object.keys(groups).map(g => {
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

  // Mock ANOVA p-value
  const pVal = 0.042; 

  return {
    groupCol,
    valueCol: valCol,
    groups: Object.keys(groups),
    pVal,
    stats
  };
};
