
import React, { useMemo } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend, ComposedChart, Line, ZAxis, Cell
} from 'recharts';
import { CorrelationResult, GroupComparisonResult, GrowthCurveResult, ClusteringResult, StratificationResult } from '../../types';

interface ChartConfig {
  color?: string;
  dotSize?: number;
}

interface ScatterPlotProps {
  data: CorrelationResult;
  config?: ChartConfig;
}

export const ScatterPlot: React.FC<ScatterPlotProps> = ({ data, config }) => {
  const fill = config?.color || "#38bdf8";
  
  const regressionPoints = useMemo(() => {
    const points = data.dataPoints;
    const n = points.length;
    if (n < 2) return [];

    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    let minX = Infinity, maxX = -Infinity;

    points.forEach(p => {
      sumX += p.x;
      sumY += p.y;
      sumXY += p.x * p.y;
      sumX2 += p.x * p.x;
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
    });

    const numerator = (n * sumXY) - (sumX * sumY);
    const denominator = (n * sumX2) - (sumX * sumX);
    
    if (denominator === 0) return []; // Vertical line

    const slope = numerator / denominator;
    const intercept = (sumY - slope * sumX) / n;

    return [
      { x: minX, y: slope * minX + intercept },
      { x: maxX, y: slope * maxX + intercept }
    ];
  }, [data.dataPoints]);

  return (
    <div className="w-full h-96 bg-slate-900 rounded-lg p-4 border border-slate-700">
      <h3 className="text-center text-slate-300 mb-2 text-sm font-semibold">
        Correlation: {data.xCol} vs {data.yCol} (r={data.r.toFixed(3)})
      </h3>
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 20, right: 20, bottom: 40, left: 30 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis 
            type="number" 
            dataKey="x" 
            name={data.xCol} 
            stroke="#94a3b8" 
            fontSize={12}
            label={{ value: data.xCol, position: 'insideBottom', offset: -30, fill: '#e2e8f0', fontSize: 12 }}
          />
          <YAxis 
            type="number" 
            dataKey="y" 
            name={data.yCol} 
            stroke="#94a3b8" 
            fontSize={12}
            label={{ value: data.yCol, angle: -90, position: 'insideLeft', offset: 0, fill: '#e2e8f0', fontSize: 12, style: { textAnchor: 'middle' } }}
          />
          <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ backgroundColor: '#1e293b', borderColor: '#475569', color: '#f1f5f9' }} />
          <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '12px', color: '#cbd5e1' }} />
          <Scatter name="Subjects" data={data.dataPoints} fill={fill} />
          {regressionPoints.length > 0 && (
            <Scatter 
                name="Trend" 
                data={regressionPoints} 
                line={{ stroke: '#fca5a5', strokeWidth: 2, strokeDasharray: '4 4' }} 
                shape={() => <></>}
                fill="none" 
                legendType="plainline"
            />
          )}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
};

interface BoxPlotProps {
  data: GroupComparisonResult;
  config?: ChartConfig;
}

// Simulating a Box Plot using Bar Chart (min, median, max) for simplicity in Recharts without custom shapes
// In a real app, use a dedicated BoxPlot component or library
export const StatsBarChart: React.FC<BoxPlotProps> = ({ data, config }) => {
  const fill = config?.color || "#8b5cf6";

  return (
    <div className="w-full h-96 bg-slate-900 rounded-lg p-4 border border-slate-700">
      <h3 className="text-center text-slate-300 mb-2 text-sm font-semibold">
        Group Comparison: {data.valueCol} by {data.groupCol} (p={data.pVal})
      </h3>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data.stats} margin={{ top: 20, right: 30, left: 30, bottom: 40 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis 
            dataKey="group" 
            stroke="#94a3b8"
            label={{ value: data.groupCol, position: 'insideBottom', offset: -30, fill: '#e2e8f0', fontSize: 12 }}
          />
          <YAxis 
            stroke="#94a3b8"
            label={{ value: data.valueCol, angle: -90, position: 'insideLeft', offset: 0, fill: '#e2e8f0', fontSize: 12, style: { textAnchor: 'middle' } }}
          />
          <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#475569', color: '#f1f5f9' }} />
          <Legend verticalAlign="top" height={36}/>
          <Bar dataKey="mean" fill={fill} name="Mean Value" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

interface AgingCurveProps {
    data: GrowthCurveResult;
    config?: ChartConfig;
}

export const AgingCurveChart: React.FC<AgingCurveProps> = ({ data, config }) => {
  const overlayFill = config?.color || "#f43f5e";
    const chartData = useMemo(() => {
        if (!data.data || !data.data.X) return [];
        const X = data.data.X;
        const centiles = data.data.centiles;
        return X.map((x, i) => ({
          age: x,
          p5: centiles[i]?.[0],
          p25: centiles[i]?.[1],
          p50: centiles[i]?.[2],
          p75: centiles[i]?.[3],
          p95: centiles[i]?.[4],
        }));
    }, [data.data]);

    const xAxisDomain = useMemo((): [number, number] => {
        if (chartData.length === 0) return [0, 80];
        return [chartData[0].age, chartData[chartData.length - 1].age];
    }, [chartData]);

    const yAxisDomain = useMemo((): [number, number] => {
        if (chartData.length === 0) return [0, 1];
        let min = Infinity, max = -Infinity;
        chartData.forEach(d => {
          [d.p5, d.p25, d.p50, d.p75, d.p95].forEach(val => {
            if (val !== undefined) { 
                if (val < min) min = val; 
                if (val > max) max = val; 
            }
          });
        });
        
        // Include overlay data in domain calculation if exists
        if (data.data.values) {
             data.data.values.forEach(v => {
                 if (v < min) min = v;
                 if (v > max) max = v;
             });
        }

        const margin = (max - min) * 0.1;
        return [min - margin, max + margin];
    }, [chartData, data.data]);

    const overlayData = useMemo(() => {
         if (!data.data.values) return [];
         return data.data.age!.map((a, i) => ({ age: a, value: data.data.values![i] }));
    }, [data.data]);

    return (
      <div className="w-full bg-slate-900 rounded-lg p-4 border border-slate-700">
        <div className="flex justify-between items-center mb-4 border-b border-slate-700 pb-2">
            <span className="font-semibold text-slate-200">{data.phenotype}</span>
        </div>

        <div className="flex gap-4 mb-4 text-xs">
            <div className="flex-1 bg-slate-800 p-2 rounded">
                <div className="text-slate-500 mb-1">Elapsed (s)</div>
                <div className="font-mono text-indigo-300">{data.elapsed_seconds.toFixed(2)}</div>
            </div>
            <div className="flex-1 bg-slate-800 p-2 rounded">
                <div className="text-slate-500 mb-1">Age Range</div>
                <div className="font-mono text-slate-200">
                    {chartData.length > 0 ? `${chartData[0].age.toFixed(0)}–${chartData[chartData.length - 1].age.toFixed(0)} yr` : '—'}
                </div>
            </div>
            {data.data.values && data.data.age && (
                <div className="flex-1 bg-slate-800 p-2 rounded">
                    <div className="text-slate-500 mb-1">Overlay Points</div>
                    <div className="font-mono text-rose-400">{data.data.age.length}</div>
                </div>
            )}
        </div>

        <div className="h-96 w-full">
            {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 10, right: 16, left: 10, bottom: 30 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis
                            dataKey="age"
                            label={{ value: 'Age (yr)', position: 'insideBottom', offset: -20, style: { fontSize: 11, fill: '#64748b' } }}
                            type="number"
                            domain={xAxisDomain}
                            tick={{ fontSize: 10, fill: '#64748b' }}
                            stroke="#475569"
                        />
                        <YAxis
                            domain={yAxisDomain}
                            width={50}
                            tick={{ fontSize: 10, fill: '#64748b' }}
                            tickFormatter={v => v.toFixed(2)}
                            stroke="#475569"
                        />
                        <Tooltip
                            contentStyle={{ backgroundColor: '#1e293b', borderColor: '#475569', borderRadius: 8, fontSize: 11, color: '#f1f5f9' }}
                            labelStyle={{ color: '#a5b4fc' }}
                            itemStyle={{ color: '#e2e8f0' }}
                            formatter={(v: number | undefined) => v !== undefined ? v.toFixed(4) : '—'}
                            labelFormatter={v => `Age: ${Number(v).toFixed(1)} yr`}
                        />
                        <Legend iconType="line" iconSize={12} verticalAlign="top" wrapperStyle={{ fontSize: 11, paddingBottom: 10 }} />
                        
                        <Line dataKey="p5"  stroke="#475569" strokeWidth={1.5} strokeDasharray="5 4" dot={false} name="5th" />
                        <Line dataKey="p25" stroke="#7c3aed" strokeWidth={1.5} strokeDasharray="5 4" dot={false} name="25th" />
                        <Line dataKey="p50" stroke="#a5b4fc" strokeWidth={2.5} dot={false} name="50th (Median)" />
                        <Line dataKey="p75" stroke="#7c3aed" strokeWidth={1.5} strokeDasharray="5 4" dot={false} name="75th" />
                        <Line dataKey="p95" stroke="#475569" strokeWidth={1.5} strokeDasharray="5 4" dot={false} name="95th" />
                        
                        {data.data.values && data.data.age && (
                            <Scatter
                                data={overlayData}
                                dataKey="value"
                                name="Your data"
                                fill={overlayFill}
                            />
                        )}
                    </ComposedChart>
                </ResponsiveContainer>
            ) : (
                <div className="flex h-full items-center justify-center text-slate-500 text-sm">
                    No curve data available
                </div>
            )}
        </div>
      </div>
    );
};

interface ClusteringDashboardProps {
  data: ClusteringResult;
  config?: ChartConfig;
}

export const ClusteringDashboard: React.FC<ClusteringDashboardProps> = ({ data, config }) => {
  const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#d946ef'];

  return (
    <div className="w-full flex flex-col gap-4">
       <div className="grid grid-cols-2 gap-4 h-80">
          {/* Scatter 1: PC1 vs PC2 colored by Cluster */}
          <div className="bg-slate-900 rounded-lg p-3 border border-slate-700">
             <h4 className="text-center text-xs text-slate-400 mb-2">PC1 vs PC2 (Color: Cluster)</h4>
             <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: 10, bottom: 20, left: 10 }}>
                   <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                   <XAxis type="number" dataKey="x" name="PC1" stroke="#64748b" fontSize={10} tickFormatter={(v) => v.toFixed(1)} />
                   <YAxis type="number" dataKey="y" name="PC2" stroke="#64748b" fontSize={10} tickFormatter={(v) => v.toFixed(1)} />
                   <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ backgroundColor: '#1e293b', fontSize: 11 }} />
                   {Array.from(new Set(data.pcPoints.map(p => p.cluster))).map((clusterId, idx) => (
                      <Scatter 
                        key={clusterId} 
                        name={`Cluster ${clusterId}`} 
                        data={data.pcPoints.filter(p => p.cluster === clusterId)} 
                        fill={COLORS[clusterId % COLORS.length]} 
                      />
                   ))}
                </ScatterChart>
             </ResponsiveContainer>
          </div>

          {/* Scatter 2: PC1 vs PC2 colored by Target Value */}
          <div className="bg-slate-900 rounded-lg p-3 border border-slate-700 relative">
             <h4 className="text-center text-xs text-slate-400 mb-2">PC1 vs PC2 (Color: {data.targetCol})</h4>
             <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: 10, bottom: 20, left: 10 }}>
                   <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                   <XAxis type="number" dataKey="x" name="PC1" stroke="#64748b" fontSize={10} tickFormatter={(v) => v.toFixed(1)} />
                   <YAxis type="number" dataKey="y" name="PC2" stroke="#64748b" fontSize={10} tickFormatter={(v) => v.toFixed(1)} />
                   <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ backgroundColor: '#1e293b', fontSize: 11 }} />
                   <Scatter data={data.pcPoints} fill="#3b82f6">
                      {data.pcPoints.map((entry, index) => {
                         // Simple heatmap logic: min (blue) -> max (red)
                         const min = Math.min(...data.pcPoints.map(p => p.target));
                         const max = Math.max(...data.pcPoints.map(p => p.target));
                         const norm = (entry.target - min) / (max - min || 1);
                         const r = Math.round(norm * 255);
                         const b = Math.round((1 - norm) * 255);
                         return <Cell key={`cell-${index}`} fill={`rgb(${r}, 50, ${b})`} />
                      })}
                   </Scatter>
                </ScatterChart>
             </ResponsiveContainer>
             <div className="absolute bottom-2 right-2 text-[10px] text-slate-500 bg-slate-900/80 px-1 rounded">Blue=Low, Red=High</div>
          </div>
       </div>

       {/* Regression Plot: Cluster ID vs Target */}
       <div className="h-64 bg-slate-900 rounded-lg p-3 border border-slate-700">
           <h4 className="text-center text-xs text-slate-400 mb-2">Cluster ID vs {data.targetCol} (r={data.clusterCorrelation.r.toFixed(3)})</h4>
           <div className="w-full h-full">
               <ScatterPlot data={data.clusterCorrelation} config={{ color: '#ec4899' }} />
           </div>
       </div>
    </div>
  );
};

export const StratificationChart: React.FC<{ data: StratificationResult, config?: ChartConfig }> = ({ data, config }) => {
    const fill = config?.color || "#10b981"; // Emerald
    
    return (
        <div className="w-full h-96 bg-slate-900 rounded-lg p-4 border border-slate-700">
          <h3 className="text-center text-slate-300 mb-2 text-sm font-semibold">
            Stratification: {data.targetCol} by {data.groupCol} (Row Counts)
          </h3>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.newColumns} margin={{ top: 20, right: 30, left: 30, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis 
                dataKey="name" 
                stroke="#94a3b8" 
                angle={-45} 
                textAnchor="end"
                height={60}
                tick={{ fontSize: 10 }}
              />
              <YAxis 
                stroke="#94a3b8" 
                label={{ value: 'Row Count', angle: -90, position: 'insideLeft', fill: '#e2e8f0', fontSize: 12 }} 
              />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1e293b', borderColor: '#475569', color: '#f1f5f9' }} 
                cursor={{ fill: '#334155', opacity: 0.4 }}
              />
              <Bar dataKey="count" fill={fill} name="Rows" />
            </BarChart>
          </ResponsiveContainer>
        </div>
    );
};
