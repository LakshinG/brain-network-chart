import { DatasetRow } from '../types';

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