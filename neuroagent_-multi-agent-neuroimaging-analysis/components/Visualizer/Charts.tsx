
import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend, ComposedChart, Line, ZAxis, Cell
} from 'recharts';
import { CorrelationResult, GroupComparisonResult, GrowthCurveResult, ClusteringResult, StratificationResult, SVMResult, CorrelationSeries } from '../../types';
import { Eye, EyeOff } from 'lucide-react';

export interface ChartConfig {
  color?: string;
  dotSize?: number;
  title?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
}

/** Click-to-edit text label used for chart titles, X-axis labels, and Y-axis labels. */
const EditableLabel: React.FC<{
  value: string;
  defaultValue: string;
  onSave: (value: string) => void;
  className?: string;
  inputClassName?: string;
  style?: React.CSSProperties;
}> = ({ value, defaultValue, onSave, className = '', inputClassName = '', style }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value || '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setEditValue(value || ''); }, [value]);
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const display = value || defaultValue;

  const handleSave = useCallback(() => {
    setIsEditing(false);
    onSave(editValue);
  }, [editValue, onSave]);

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        value={editValue}
        onChange={e => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') { setEditValue(value || ''); setIsEditing(false); } }}
        className={`bg-slate-800 border border-cyan-500 rounded px-2 py-0.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 ${inputClassName}`}
        placeholder={defaultValue}
        style={style}
        onClick={e => e.stopPropagation()}
      />
    );
  }

  return (
    <span
      className={`cursor-pointer hover:text-cyan-300 transition-colors border-b border-dotted border-transparent hover:border-cyan-500/50 ${className}`}
      onClick={e => { e.stopPropagation(); setIsEditing(true); }}
      title="Click to edit"
      style={style}
    >
      {display}
    </span>
  );
};

interface ScatterPlotProps {
  data: CorrelationResult;
  config?: ChartConfig;
  onConfigChange?: (config: ChartConfig) => void;
}

const DEFAULT_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4',
  '#f97316', '#14b8a6', '#6366f1', '#d946ef', '#f43f5e', '#84cc16', '#a855f7', 
  '#0ea5e9', '#eab308', '#64748b'
];

const RegressionLine: React.FC<{ points: {x:number, y:number}[], color: string }> = ({ points, color }) => {
  const linePoints = useMemo(() => {
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
    
    if (denominator === 0) return []; 

    const slope = numerator / denominator;
    const intercept = (sumY - slope * sumX) / n;

    return [
      { x: minX, y: slope * minX + intercept },
      { x: maxX, y: slope * maxX + intercept }
    ];
  }, [points]);

  if (linePoints.length === 0) return null;
  
  return (
      <Scatter 
          name="Trend" 
          data={linePoints} 
          line={{ stroke: color, strokeWidth: 2, strokeDasharray: '4 4' }} 
          shape={() => <></>}
          fill="none" 
          legendType="none"
          tooltipType="none"
      />
  );
};

export const ScatterPlot: React.FC<ScatterPlotProps> = ({ data, config, onConfigChange }) => {
  const allSeries = data.series || [];
  
  // State for visibility: default to p < 0.05 if grouped, else true
  const [visibleSeries, setVisibleSeries] = useState<Record<string, boolean>>(() => {
     const initial: Record<string, boolean> = {};
     const isGrouped = !!data.groupCol;
     allSeries.forEach(s => {
         initial[s.name] = isGrouped ? s.p < 0.05 : true;
     });
     return initial;
  });

  // Reset visibility when data prop changes
  useEffect(() => {
     setVisibleSeries(() => {
         const initial: Record<string, boolean> = {};
         const isGrouped = !!data.groupCol;
         allSeries.forEach(s => {
             initial[s.name] = isGrouped ? s.p < 0.05 : true;
         });
         return initial;
     });
  }, [data, allSeries, data.groupCol]);

  // Memoize sampled data to ensure stable rendering of random subset
  const sampledSeries = useMemo(() => {
    return allSeries.map(series => {
        if (series.dataPoints.length <= 100) {
            return { ...series, displayPoints: series.dataPoints };
        }
        // Fisher-Yates shuffle for random sampling
        const shuffled = [...series.dataPoints];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return { ...series, displayPoints: shuffled.slice(0, 100) };
    });
  }, [allSeries]);

  // Calculate dynamic X and Y domains based on visible series
  const { xDomain, yDomain } = useMemo(() => {
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let hasVisibleData = false;

    allSeries.forEach(s => {
        if (visibleSeries[s.name]) {
            for (const p of s.dataPoints) {
                if (p.x < minX) minX = p.x;
                if (p.x > maxX) maxX = p.x;
                if (p.y < minY) minY = p.y;
                if (p.y > maxY) maxY = p.y;
                hasVisibleData = true;
            }
        }
    });

    if (!hasVisibleData) {
        return { xDomain: ['auto', 'auto'], yDomain: ['auto', 'auto'] };
    }

    const rangeX = maxX - minX;
    const rangeY = maxY - minY;
    
    // Add 5% padding
    const paddingX = rangeX === 0 ? (Math.abs(minX) * 0.1 || 1) : rangeX * 0.05;
    const paddingY = rangeY === 0 ? (Math.abs(minY) * 0.1 || 1) : rangeY * 0.05;

    return {
        xDomain: [minX - paddingX, maxX + paddingX],
        yDomain: [minY - paddingY, maxY + paddingY]
    };
  }, [allSeries, visibleSeries]);

  const toggleSeries = (name: string) => {
      setVisibleSeries(prev => ({
          ...prev,
          [name]: !prev[name]
      }));
  };
  
  const defaultTitle = data.groupCol
      ? `Grouped Correlation: ${data.xCol} vs ${data.yCol} by ${data.groupCol}`
      : `Correlation: ${data.xCol} vs ${data.yCol} (r=${allSeries[0]?.r.toFixed(3)})`;

  const title = config?.title || defaultTitle;
  const xLabel = config?.xAxisLabel || data.xCol;
  const yLabel = config?.yAxisLabel || data.yCol;

  const saveField = useCallback((field: 'title' | 'xAxisLabel' | 'yAxisLabel', value: string) => {
    if (!onConfigChange) return;
    const newCfg: ChartConfig = { ...(config || {}), [field]: value || undefined };
    if (!newCfg.title) delete newCfg.title;
    if (!newCfg.xAxisLabel) delete newCfg.xAxisLabel;
    if (!newCfg.yAxisLabel) delete newCfg.yAxisLabel;
    onConfigChange(newCfg);
  }, [config, onConfigChange]);

  return (
    <div className="w-full flex flex-col bg-slate-900 rounded-lg border border-slate-700 overflow-hidden">
      <div className="p-3 bg-slate-800/50 border-b border-slate-700 flex justify-between items-center">
         <h3 className="text-slate-300 text-sm font-semibold truncate max-w-[70%]">
            {onConfigChange ? (
              <EditableLabel value={config?.title || ''} defaultValue={defaultTitle} onSave={v => saveField('title', v)} className="text-slate-300" />
            ) : title}
         </h3>
         <div className="text-xs text-slate-500">
            {allSeries.length} group{allSeries.length !== 1 ? 's' : ''}
         </div>
      </div>
      
      {/* Visibility Controls */}
      <div className="p-2 flex flex-wrap gap-2 border-b border-slate-800 bg-slate-900/30 max-h-32 overflow-y-auto custom-scrollbar">
          {allSeries.map((s, idx) => {
              const isVisible = visibleSeries[s.name] ?? false;
              const color = DEFAULT_COLORS[idx % DEFAULT_COLORS.length];
              const isSig = s.p < 0.05;
              const n = s.n || s.dataPoints.length;
              
              const pStr = s.p < 0.001 ? 'p<.001' : `p=${s.p.toFixed(3)}`;

              return (
                  <button
                    key={s.name}
                    onClick={() => toggleSeries(s.name)}
                    className={`
                        flex items-center gap-2 px-2 py-1 rounded text-xs border transition-all w-48
                        ${isVisible 
                            ? 'bg-slate-800 border-slate-600 text-slate-200 shadow-sm' 
                            : 'bg-slate-900/50 border-slate-800 text-slate-500 opacity-60 hover:opacity-100'}
                    `}
                    style={{ borderColor: isVisible ? color : undefined }}
                    title={`${s.name}\np=${s.p.toFixed(4)}, r=${s.r.toFixed(3)}, n=${n}`}
                  >
                      <span className={`w-2 h-2 rounded-full flex-shrink-0`} style={{ backgroundColor: isVisible ? color : '#475569' }}></span>
                      
                      <div className="flex-1 overflow-hidden relative h-5 flex items-center">
                         <div className="whitespace-nowrap absolute animate-scroll-text">
                            <span className={`font-mono text-[10px] mr-2 ${isSig ? 'text-green-400' : 'text-slate-500'}`}>
                               {pStr} n={n}
                            </span>
                            <span className="font-medium">{s.name}</span>
                             {/* Duplicate for smooth looping scroll illusion if needed, but simple scroll is fine */}
                             <span className="ml-8 font-mono text-[10px] text-slate-600">
                               {pStr} n={n}
                            </span>
                            <span className="ml-2 font-medium text-slate-600">{s.name}</span>
                         </div>
                      </div>

                      {isVisible ? <Eye className="w-3 h-3 ml-1 opacity-50 flex-shrink-0" /> : <EyeOff className="w-3 h-3 ml-1 opacity-50 flex-shrink-0" />}
                  </button>
              )
          })}
      </div>

      <div className="h-96 w-full p-2 relative">
         <div className="flex h-full">
           {/* Y-axis editable label */}
           <div className="flex items-center justify-center flex-shrink-0" style={{ width: 28 }}>
             {onConfigChange ? (
               <EditableLabel
                 value={config?.yAxisLabel || ''}
                 defaultValue={data.yCol}
                 onSave={v => saveField('yAxisLabel', v)}
                 className="text-slate-400 text-[11px]"
                 inputClassName="w-20"
                 style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
               />
             ) : (
               <span className="text-slate-400 text-[11px]" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>{yLabel}</span>
             )}
           </div>
           <div className="flex-1 flex flex-col min-w-0">
             <div className="flex-1 min-h-0">
               <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 20, right: 20, bottom: 10, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis 
                      type="number" 
                      dataKey="x" 
                      name="X Value" 
                      stroke="#94a3b8" 
                      fontSize={12}
                      domain={xDomain as [number, number] | ['auto', 'auto']}
                  />
                  <YAxis 
                      type="number" 
                      dataKey="y" 
                      name={yLabel} 
                      stroke="#94a3b8" 
                      fontSize={12}
                      domain={yDomain as [number, number] | ['auto', 'auto']}
                  />
                  <Tooltip 
                      cursor={{ strokeDasharray: '3 3' }} 
                      contentStyle={{ backgroundColor: '#1e293b', borderColor: '#475569', color: '#f1f5f9' }} 
                      formatter={(value: any, name: any, props: any) => {
                          return [value, props.payload.seriesName ? `${props.payload.seriesName} (${name})` : name];
                      }}
                  />
                  
                  {allSeries.map((s, idx) => {
                      if (!visibleSeries[s.name]) return null;
                      
                      const color = DEFAULT_COLORS[idx % DEFAULT_COLORS.length];
                      const sampled = sampledSeries[idx];
                      const seriesData = sampled.displayPoints.map(p => ({ ...p, seriesName: s.name }));
                      
                      return (
                          <React.Fragment key={idx}>
                              <Scatter 
                                  name={`${s.name} (r=${s.r.toFixed(2)})`} 
                                  data={seriesData} 
                                  fill={color} 
                              />
                              <RegressionLine points={s.dataPoints} color={color} />
                          </React.Fragment>
                      );
                  })}
                  </ScatterChart>
              </ResponsiveContainer>
             </div>
             {/* X-axis editable label */}
             <div className="text-center py-1">
               {onConfigChange ? (
                 <EditableLabel
                   value={config?.xAxisLabel || ''}
                   defaultValue={data.xCol}
                   onSave={v => saveField('xAxisLabel', v)}
                   className="text-slate-400 text-[11px]"
                 />
               ) : (
                 <span className="text-slate-400 text-[11px]">{xLabel}</span>
               )}
             </div>
           </div>
         </div>
        {Object.values(visibleSeries).every(v => !v) && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-slate-500 text-sm bg-slate-900/80 px-4 py-2 rounded border border-slate-700">
                    All groups hidden (enable via toggles above)
                </span>
            </div>
        )}
      </div>
    </div>
  );
};

interface BoxPlotProps {
  data: GroupComparisonResult;
  config?: ChartConfig;
  onConfigChange?: (config: ChartConfig) => void;
}

// Simulating a Box Plot using Bar Chart (min, median, max) for simplicity in Recharts without custom shapes
// In a real app, use a dedicated BoxPlot component or library
export const StatsBarChart: React.FC<BoxPlotProps> = ({ data, config, onConfigChange }) => {
  const fill = config?.color || "#8b5cf6";
  const defaultTitle = `Group Comparison: ${data.valueCol} by ${data.groupCol} (p=${data.pVal})`;

  const saveField = useCallback((field: 'title' | 'xAxisLabel' | 'yAxisLabel', value: string) => {
    if (!onConfigChange) return;
    const newCfg: ChartConfig = { ...(config || {}), [field]: value || undefined };
    if (!newCfg.title) delete newCfg.title;
    if (!newCfg.xAxisLabel) delete newCfg.xAxisLabel;
    if (!newCfg.yAxisLabel) delete newCfg.yAxisLabel;
    onConfigChange(newCfg);
  }, [config, onConfigChange]);

  return (
    <div className="w-full bg-slate-900 rounded-lg p-4 border border-slate-700">
      <h3 className="text-center text-slate-300 mb-2 text-sm font-semibold">
        {onConfigChange ? (
          <EditableLabel value={config?.title || ''} defaultValue={defaultTitle} onSave={v => saveField('title', v)} className="text-slate-300" />
        ) : (config?.title || defaultTitle)}
      </h3>
      <div className="flex" style={{ height: '22rem' }}>
        {/* Y-axis editable label */}
        <div className="flex items-center justify-center flex-shrink-0" style={{ width: 28 }}>
          {onConfigChange ? (
            <EditableLabel
              value={config?.yAxisLabel || ''}
              defaultValue={data.valueCol}
              onSave={v => saveField('yAxisLabel', v)}
              className="text-slate-400 text-[11px]"
              inputClassName="w-20"
              style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
            />
          ) : (
            <span className="text-slate-400 text-[11px]" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>{config?.yAxisLabel || data.valueCol}</span>
          )}
        </div>
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.stats} margin={{ top: 20, right: 30, left: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis 
                  dataKey="group" 
                  stroke="#94a3b8"
                />
                <YAxis 
                  stroke="#94a3b8"
                />
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#475569', color: '#f1f5f9' }} />
                <Legend verticalAlign="top" height={36}/>
                <Bar dataKey="mean" fill={fill} name="Mean Value" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {/* X-axis editable label */}
          <div className="text-center py-1">
            {onConfigChange ? (
              <EditableLabel
                value={config?.xAxisLabel || ''}
                defaultValue={data.groupCol}
                onSave={v => saveField('xAxisLabel', v)}
                className="text-slate-400 text-[11px]"
              />
            ) : (
              <span className="text-slate-400 text-[11px]">{config?.xAxisLabel || data.groupCol}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

interface AgingCurveProps {
    data: GrowthCurveResult;
    config?: ChartConfig;
    onConfigChange?: (config: ChartConfig) => void;
}

export const AgingCurveChart: React.FC<AgingCurveProps> = ({ data, config, onConfigChange }) => {
    // Robustly map chart data, ensuring all values are numbers
    const chartData = useMemo(() => {
        if (!data.data || !data.data.X) return [];
        const { X, centiles } = data.data;
        const hasCentiles = Array.isArray(centiles) && centiles.length === X.length;

        return X.map((x, i) => {
            const age = Number(x);
            // Safely parse centiles, converting to Number, handling undefined/null/NaN
            const getCentile = (idx: number) => {
                if (!hasCentiles) return undefined;
                const val = centiles[i]?.[idx];
                const num = Number(val);
                return isNaN(num) ? undefined : num;
            };

            return {
                age,
                p5: getCentile(0),
                p25: getCentile(1),
                p50: getCentile(2),
                p75: getCentile(3),
                p95: getCentile(4),
            };
        });
    }, [data.data]);

    const xAxisDomain = useMemo((): [number, number] => {
        if (chartData.length === 0) return [0, 80];
        const min = chartData[0].age;
        const max = chartData[chartData.length - 1].age;
        return [Number(min) || 0, Number(max) || 80];
    }, [chartData]);
    
    const overlay = data.data;

    // Map overlay data to {x, y, color} for Scatter, filtering invalid points
    const overlayData = useMemo(() => {
         if (!overlay.values || !overlay.age) return [];
         return overlay.age.map((a, i) => ({ 
             age: a, 
             value: overlay.values![i],
             color: data.overlayDot_color ? data.overlayDot_color[i] : undefined 
         })).filter(p => !isNaN(p.age) && !isNaN(p.value));
    }, [overlay, data.overlayDot_color]);

    // Calculate Y-Axis domain based on both curve lines and overlay points
    const yAxisDomain = useMemo((): [number, number] => {
        let min = Infinity, max = -Infinity;
        
        // Check curve data
        chartData.forEach(d => {
          [d.p5, d.p25, d.p50, d.p75, d.p95].forEach(val => {
            if (val !== undefined) { 
                if (val < min) min = val; 
                if (val > max) max = val; 
            }
          });
        });
        
        // Check overlay data
        if (overlayData.length > 0) {
             overlayData.forEach(d => {
                 if (d.value < min) min = d.value;
                 if (d.value > max) max = d.value;
             });
        }

        // Fallback if no valid data found
        if (min === Infinity || max === -Infinity) return [0, 1];

        // Add padding
        const padding = (max - min) === 0 ? (Math.abs(max) * 0.1 || 0.1) : (max - min) * 0.1;
        return [min - padding, max + padding];
    }, [chartData, overlayData]);

    const saveField = useCallback((field: 'title' | 'xAxisLabel' | 'yAxisLabel', value: string) => {
      if (!onConfigChange) return;
      const newCfg: ChartConfig = { ...(config || {}), [field]: value || undefined };
      if (!newCfg.title) delete newCfg.title;
      if (!newCfg.xAxisLabel) delete newCfg.xAxisLabel;
      if (!newCfg.yAxisLabel) delete newCfg.yAxisLabel;
      onConfigChange(newCfg);
    }, [config, onConfigChange]);

    const defaultTitle = data.phenotype || 'Growth Curve';

    return (
      <div className="w-full bg-slate-900 rounded-lg p-4 border border-slate-700">
        <div className="flex justify-between items-center mb-4 border-b border-slate-700 pb-2">
            <span className="font-semibold text-slate-200">
              {onConfigChange ? (
                <EditableLabel value={config?.title || ''} defaultValue={defaultTitle} onSave={v => saveField('title', v)} className="text-slate-200" />
              ) : (config?.title || defaultTitle)}
            </span>
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
            {overlayData.length > 0 && (
                <div className="flex-1 bg-slate-800 p-2 rounded">
                    <div className="text-slate-500 mb-1">Overlay Points</div>
                    <div className="font-mono text-rose-400">{overlayData.length}</div>
                </div>
            )}
        </div>

        <div className="h-96 w-full">
            {chartData.length > 0 || overlayData.length > 0 ? (
              <div className="flex h-full">
                {/* Y-axis editable label */}
                <div className="flex items-center justify-center flex-shrink-0" style={{ width: 24 }}>
                  {onConfigChange ? (
                    <EditableLabel
                      value={config?.yAxisLabel || ''}
                      defaultValue="Value"
                      onSave={v => saveField('yAxisLabel', v)}
                      className="text-slate-500 text-[11px]"
                      inputClassName="w-16"
                      style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                    />
                  ) : (
                    <span className="text-slate-500 text-[11px]" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>{config?.yAxisLabel || 'Value'}</span>
                  )}
                </div>
                <div className="flex-1 flex flex-col min-w-0">
                  <div className="flex-1 min-h-0">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={chartData} margin={{ top: 10, right: 16, left: 10, bottom: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                            <XAxis
                                dataKey="age"
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
                            formatter={(v: number | undefined) => v !== undefined && !isNaN(v) ? v.toFixed(4) : '—'}
                            labelFormatter={v => `Age: ${Number(v).toFixed(1)} yr`}
                        />
                        <Legend iconType="line" iconSize={12} verticalAlign="top" wrapperStyle={{ fontSize: 11, paddingBottom: 10 }} />
                        
                        <Line dataKey="p5"  stroke="#475569" strokeWidth={1.5} strokeDasharray="5 4" dot={false} name="5th" connectNulls />
                        <Line dataKey="p25" stroke="#7c3aed" strokeWidth={1.5} strokeDasharray="5 4" dot={false} name="25th" connectNulls />
                        <Line dataKey="p50" stroke="#a5b4fc" strokeWidth={2.5} dot={false} name="50th (Median)" connectNulls />
                        <Line dataKey="p75" stroke="#7c3aed" strokeWidth={1.5} strokeDasharray="5 4" dot={false} name="75th" connectNulls />
                        <Line dataKey="p95" stroke="#475569" strokeWidth={1.5} strokeDasharray="5 4" dot={false} name="95th" connectNulls />
                        
                        {overlayData.length > 0 && (
                            <Scatter
                                data={overlayData}
                                dataKey='value'
                                name="Your data"
                                fill="#f43f5e"
                            >
                               {overlayData.map((entry, index) => (
                                   <Cell key={`cell-${index}`} fill={entry.color !== undefined ? DEFAULT_COLORS[entry.color % DEFAULT_COLORS.length] : "#f43f5e"} />
                               ))}
                            </Scatter>
                        )}
                    </ComposedChart>
                </ResponsiveContainer>
                  </div>
                  {/* X-axis editable label */}
                  <div className="text-center py-1">
                    {onConfigChange ? (
                      <EditableLabel
                        value={config?.xAxisLabel || ''}
                        defaultValue="Age (yr)"
                        onSave={v => saveField('xAxisLabel', v)}
                        className="text-slate-500 text-[11px]"
                      />
                    ) : (
                      <span className="text-slate-500 text-[11px]">{config?.xAxisLabel || 'Age (yr)'}</span>
                    )}
                  </div>
                </div>
              </div>
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
       <div className={`grid ${data.targetCol ? 'grid-cols-2' : 'grid-cols-1'} gap-4 h-80`}>
          {/* Scatter 1: PC1 vs PC2 colored by Cluster */}
          <div className="bg-slate-900 rounded-lg p-3 border border-slate-700">
             <h4 className="text-center text-xs text-slate-400 mb-2">PC1 vs PC2 (Color: Cluster)</h4>
             <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: 10, bottom: 30, left: 20 }}>
                   <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                   <XAxis 
                     type="number" 
                     dataKey="x" 
                     name="PC1" 
                     stroke="#64748b" 
                     fontSize={10} 
                     tickFormatter={(v) => v.toFixed(1)} 
                     label={{ value: 'PC1', position: 'insideBottom', offset: -20, fill: '#64748b', fontSize: 10 }}
                   />
                   <YAxis 
                     type="number" 
                     dataKey="y" 
                     name="PC2" 
                     stroke="#64748b" 
                     fontSize={10} 
                     tickFormatter={(v) => v.toFixed(1)} 
                     label={{ value: 'PC2', angle: -90, position: 'insideLeft', offset: 10, fill: '#64748b', fontSize: 10 }}
                   />
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
          {data.targetCol && (
            <div className="bg-slate-900 rounded-lg p-3 border border-slate-700 relative">
                 <h4 className="text-center text-xs text-slate-400 mb-2">PC1 vs PC2 (Color: {data.targetCol})</h4>
                 <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 10, right: 10, bottom: 30, left: 20 }}>
                       <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                       <XAxis 
                         type="number" 
                         dataKey="x" 
                         name="PC1" 
                         stroke="#64748b" 
                         fontSize={10} 
                         tickFormatter={(v) => v.toFixed(1)} 
                         label={{ value: 'PC1', position: 'insideBottom', offset: -20, fill: '#64748b', fontSize: 10 }}
                       />
                       <YAxis 
                         type="number" 
                         dataKey="y" 
                         name="PC2" 
                         stroke="#64748b" 
                         fontSize={10} 
                         tickFormatter={(v) => v.toFixed(1)} 
                         label={{ value: 'PC2', angle: -90, position: 'insideLeft', offset: 10, fill: '#64748b', fontSize: 10 }}
                       />
                       <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ backgroundColor: '#1e293b', fontSize: 11 }} />
                       <Scatter data={data.pcPoints} fill="#3b82f6">
                          {data.pcPoints.map((entry, index) => {
                             // Simple heatmap logic: min (blue) -> max (red)
                             if (entry.target === undefined) return <Cell key={`cell-${index}`} fill="#ccc" />;
                             const min = Math.min(...data.pcPoints.map(p => p.target || 0));
                             const max = Math.max(...data.pcPoints.map(p => p.target || 0));
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
          )}
       </div>

       {/* Regression Plot: Cluster ID vs Target */}
       {data.targetCol && data.clusterCorrelation && data.clusterCorrelation.series && data.clusterCorrelation.series.length > 0 && (
           <div className="h-64 bg-slate-900 rounded-lg p-3 border border-slate-700">
               <h4 className="text-center text-xs text-slate-400 mb-2">Cluster ID vs {data.targetCol} (r={data.clusterCorrelation.series[0]?.r.toFixed(3)})</h4>
               <div className="w-full h-full">
                   <ScatterPlot data={data.clusterCorrelation} config={{ color: '#ec4899' }} />
               </div>
           </div>
       )}
    </div>
  );
};

export const StratificationChart: React.FC<{ data: StratificationResult, config?: ChartConfig, onConfigChange?: (config: ChartConfig) => void }> = ({ data, config, onConfigChange }) => {
    const fill = config?.color || "#10b981"; // Emerald
    const defaultTitle = `Stratification: ${data.targetCol} by ${data.groupCol} (Row Counts)`;

    const saveField = useCallback((field: 'title' | 'xAxisLabel' | 'yAxisLabel', value: string) => {
      if (!onConfigChange) return;
      const newCfg: ChartConfig = { ...(config || {}), [field]: value || undefined };
      if (!newCfg.title) delete newCfg.title;
      if (!newCfg.xAxisLabel) delete newCfg.xAxisLabel;
      if (!newCfg.yAxisLabel) delete newCfg.yAxisLabel;
      onConfigChange(newCfg);
    }, [config, onConfigChange]);
    
    return (
        <div className="w-full bg-slate-900 rounded-lg p-4 border border-slate-700">
          <h3 className="text-center text-slate-300 mb-2 text-sm font-semibold">
            {onConfigChange ? (
              <EditableLabel value={config?.title || ''} defaultValue={defaultTitle} onSave={v => saveField('title', v)} className="text-slate-300" />
            ) : (config?.title || defaultTitle)}
          </h3>
          <div className="flex" style={{ height: '20rem' }}>
            {/* Y-axis editable label */}
            <div className="flex items-center justify-center flex-shrink-0" style={{ width: 28 }}>
              {onConfigChange ? (
                <EditableLabel
                  value={config?.yAxisLabel || ''}
                  defaultValue="Row Count"
                  onSave={v => saveField('yAxisLabel', v)}
                  className="text-slate-400 text-[11px]"
                  inputClassName="w-20"
                  style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                />
              ) : (
                <span className="text-slate-400 text-[11px]" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>{config?.yAxisLabel || 'Row Count'}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.newColumns} margin={{ top: 20, right: 30, left: 10, bottom: 60 }}>
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
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1e293b', borderColor: '#475569', color: '#f1f5f9' }} 
                    cursor={{ fill: '#334155', opacity: 0.4 }}
                  />
                  <Bar dataKey="count" fill={fill} name="Rows" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
    );
};

export const SVMBoundaryChart: React.FC<{ data: SVMResult, config?: ChartConfig, onConfigChange?: (config: ChartConfig) => void }> = ({ data, config, onConfigChange }) => {
    const colors = ['#3b82f6', '#ef4444']; // Blue and Red for classes
    const classes = data.classes;
    const defaultTitle = `SVM Classification: ${data.targetCol} (Accuracy: ${(data.accuracy * 100).toFixed(1)}%)`;
    
    // Boundary line data (2 points)
    const lineData = [
        { x: data.decisionBoundary.x1, y: data.decisionBoundary.y1 },
        { x: data.decisionBoundary.x2, y: data.decisionBoundary.y2 }
    ];

    const saveField = useCallback((field: 'title' | 'xAxisLabel' | 'yAxisLabel', value: string) => {
      if (!onConfigChange) return;
      const newCfg: ChartConfig = { ...(config || {}), [field]: value || undefined };
      if (!newCfg.title) delete newCfg.title;
      if (!newCfg.xAxisLabel) delete newCfg.xAxisLabel;
      if (!newCfg.yAxisLabel) delete newCfg.yAxisLabel;
      onConfigChange(newCfg);
    }, [config, onConfigChange]);

    return (
        <div className="w-full bg-slate-900 rounded-lg p-4 border border-slate-700">
            <h3 className="text-center text-slate-300 mb-1 text-sm font-semibold">
                {onConfigChange ? (
                  <EditableLabel value={config?.title || ''} defaultValue={defaultTitle} onSave={v => saveField('title', v)} className="text-slate-300" />
                ) : (config?.title || defaultTitle)}
            </h3>
            <p className="text-center text-slate-500 text-xs mb-2">
                Features: {data.xCol} vs {data.yCol}
            </p>
            <div className="flex" style={{ height: '20rem' }}>
              {/* Y-axis editable label */}
              <div className="flex items-center justify-center flex-shrink-0" style={{ width: 28 }}>
                {onConfigChange ? (
                  <EditableLabel
                    value={config?.yAxisLabel || ''}
                    defaultValue={data.yCol}
                    onSave={v => saveField('yAxisLabel', v)}
                    className="text-slate-400 text-[11px]"
                    inputClassName="w-20"
                    style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                  />
                ) : (
                  <span className="text-slate-400 text-[11px]" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>{config?.yAxisLabel || data.yCol}</span>
                )}
              </div>
              <div className="flex-1 flex flex-col min-w-0">
                <div className="flex-1 min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart margin={{ top: 20, right: 20, bottom: 10, left: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                          <XAxis 
                              type="number" 
                              dataKey="x" 
                              name={config?.xAxisLabel || data.xCol} 
                              stroke="#94a3b8" 
                              fontSize={12}
                          />
                          <YAxis 
                              type="number" 
                              dataKey="y" 
                              name={config?.yAxisLabel || data.yCol} 
                              stroke="#94a3b8" 
                              fontSize={12}
                          />
                          <Tooltip 
                              cursor={{ strokeDasharray: '3 3' }} 
                              contentStyle={{ backgroundColor: '#1e293b', borderColor: '#475569', color: '#f1f5f9' }}
                          />
                          <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '12px', color: '#cbd5e1' }} />
                          
                          {classes.map((cls, idx) => (
                              <Scatter 
                                  key={cls}
                                  name={`Class ${cls}`} 
                                  data={data.dataPoints.filter(p => p.classLabel === cls)} 
                                  fill={colors[idx % colors.length]} 
                              />
                          ))}

                          <Scatter 
                              name="Decision Boundary" 
                              data={lineData} 
                              line={{ stroke: '#10b981', strokeWidth: 3 }} 
                              shape={() => <></>}
                              fill="none" 
                              legendType="plainline"
                          />
                      </ScatterChart>
                  </ResponsiveContainer>
                </div>
                {/* X-axis editable label */}
                <div className="text-center py-1">
                  {onConfigChange ? (
                    <EditableLabel
                      value={config?.xAxisLabel || ''}
                      defaultValue={data.xCol}
                      onSave={v => saveField('xAxisLabel', v)}
                      className="text-slate-400 text-[11px]"
                    />
                  ) : (
                    <span className="text-slate-400 text-[11px]">{config?.xAxisLabel || data.xCol}</span>
                  )}
                </div>
              </div>
            </div>
        </div>
    );
};