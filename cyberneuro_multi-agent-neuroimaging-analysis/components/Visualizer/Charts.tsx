
import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend, ComposedChart, Line, ZAxis, Cell
} from 'recharts';
import { CorrelationResult, GroupComparisonResult, GrowthCurveResult, ClusteringResult, StratificationResult, SVMResult, CorrelationSeries, CFCWaveletResult, HubDetectionResult } from '../../types';
import { Eye, EyeOff } from 'lucide-react';
import { MCP_API_URL }  from '../../services/mcpService';
export interface ChartConfig {
  color?: string;
  dotSize?: number;
  title?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
}

interface VisionBBoxesChartProps {
  html?: string;
}

export const VisionBBoxesChart: React.FC<VisionBBoxesChartProps> = ({ html }) => {
  const [imgSize, setImgSize] = useState({ width: 1, height: 1 });

  const parsed = useMemo(() => {
    if (!html || typeof window === 'undefined') {
      return { title: 'Uploaded Image', imgSrc: '', bboxes: [] as number[][] };
    }

    try {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const container = doc.querySelector('.segment-overlay-container');
      const img = container?.querySelector('img') || doc.querySelector('img');
      const title = (doc.querySelector('.vc-title')?.textContent || 'Uploaded Image').trim();

      const bboxesRaw = container?.getAttribute('data-segment-bboxes');
      const legacyBBoxRaw = container?.getAttribute('data-segment-bbox');

      let rawBBoxes: any[] = [];
      if (bboxesRaw) {
        const parsedBBoxes = JSON.parse(bboxesRaw);
        rawBBoxes = Array.isArray(parsedBBoxes) ? parsedBBoxes : [];
      } else if (legacyBBoxRaw) {
        const parsedBBox = JSON.parse(legacyBBoxRaw);
        rawBBoxes = Array.isArray(parsedBBox) && parsedBBox.length === 4 ? [parsedBBox] : [];
      }

      const bboxes = rawBBoxes
        .filter((bbox: any) => Array.isArray(bbox) && bbox.length === 4)
        .map((bbox: any) => bbox.map((v: any) => Number(v)))
        .filter((bbox: number[]) => bbox.every((v: number) => Number.isFinite(v)));

      return {
        title,
        imgSrc: img?.getAttribute('src') || '',
        bboxes
      };
    } catch {
      return { title: 'Uploaded Image', imgSrc: '', bboxes: [] as number[][] };
    }
  }, [html]);

  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const target = e.currentTarget;
    setImgSize({
      width: Math.max(target.naturalWidth || target.clientWidth, 1),
      height: Math.max(target.naturalHeight || target.clientHeight, 1)
    });
  }, []);

  if (!parsed.imgSrc) {
    return (
      <div className="bg-slate-900 rounded-lg border border-slate-700 p-4 text-sm text-slate-400">
        No image content available.
      </div>
    );
  }

  return (
    <div className="w-full bg-slate-900 rounded-lg border border-slate-700 p-3">
      <div className="mb-3">
        <h3 className="text-slate-100 font-semibold text-sm">{parsed.title}</h3>
      </div>
      <div className="relative inline-block w-full">
        <img
          src={parsed.imgSrc}
          alt={parsed.title}
          onLoad={handleImageLoad}
          className="w-full h-auto max-h-[520px] object-contain rounded-lg block"
        />
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox={`0 0 ${imgSize.width} ${imgSize.height}`}
          preserveAspectRatio="none"
        >
          {parsed.bboxes.map((bbox, index) => {
            const clamp = (value: number, lower: number, upper: number) =>
              Math.min(Math.max(value, lower), upper);

            const x1 = clamp(bbox[0], 0, imgSize.width);
            const y1 = clamp(bbox[1], 0, imgSize.height);
            const x2 = clamp(bbox[2], 0, imgSize.width);
            const y2 = clamp(bbox[3], 0, imgSize.height);

            const minX = Math.min(x1, x2);
            const minY = Math.min(y1, y2);
            const maxX = Math.max(x1, x2);
            const maxY = Math.max(y1, y2);

            if (maxX - minX <= 0 || maxY - minY <= 0) {
              return null;
            }

            return (
              <rect
                key={`${index}-${bbox.join('-')}`}
                x={minX}
                y={minY}
                width={maxX - minX}
                height={maxY - minY}
                fill="rgba(248, 113, 113, 0.12)"
                stroke="#f87171"
                strokeWidth={2}
                strokeDasharray="6 4"
              />
            );
          })}
        </svg>
      </div>
    </div>
  );
};

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

    const sampledOverlayData = useMemo(() => {
        if (overlayData.length <= 100) return overlayData;
        const sampled: typeof overlayData = [];
        const lastIndex = overlayData.length - 1;
        for (let i = 0; i < 100; i++) {
            const index = Math.round((i * lastIndex) / 99);
            sampled.push(overlayData[index]);
        }
        return sampled;
    }, [overlayData]);

    const addDomainMargin = useCallback((min: number, max: number): [number, number] => {
        if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
        if (min === max) {
            const padding = Math.abs(min) * 0.1 || 0.1;
            return [min - padding, max + padding];
        }
        const padding = (max - min) * 0.08;
        return [min - padding, max + padding];
    }, []);

    const overlayMinAge = useMemo(() => {
        if (overlayData.length === 0) return undefined;
        return Math.min(...overlayData.map(d => d.age));
    }, [overlayData]);
    const overlayMaxAge = useMemo(() => {
        if (overlayData.length === 0) return undefined;
        return Math.max(...overlayData.map(d => d.age));
    }, [overlayData]);
    const xAxisDomain = useMemo((): [number, number] => {
        if (overlayData.length > 0) {
            const ages = overlayData.map(d => d.age);
            return addDomainMargin(Math.min(...ages), Math.max(...ages));
        }
        if (chartData.length === 0) return [0, 80];
        return addDomainMargin(chartData[0].age, chartData[chartData.length - 1].age);
    }, [addDomainMargin, chartData, overlayData]);
    // Calculate Y-axis domain from the normative curve only.
    const yAxisDomain = useMemo((): [number, number] => {
        let min = Infinity, max = -Infinity;
        chartData.forEach(d => {
          [d.p5, d.p25, d.p50, d.p75, d.p95].forEach(val => {
            if (val !== undefined) {
                if (val < min) min = val;
                if (val > max) max = val;
            }
          });
        });

        if (min === Infinity || max === -Infinity) return [0, 1];
        return addDomainMargin(min, max);
    }, [addDomainMargin, chartData]);

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
                    {overlayMinAge !== undefined ? `${overlayMinAge.toFixed(0)}–${overlayMaxAge?.toFixed(0) || chartData[chartData.length - 1].age.toFixed(0)} yr` : '—'}
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
                                data={sampledOverlayData}
                                dataKey='value'
                                name="Your data"
                                fill="#f43f5e"
                            >
                               {sampledOverlayData.map((entry, index) => (
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


interface CfcProps {
  data: CFCWaveletResult
  timestamp: string
}

function getHeatColor(normalized: number): string {
  const r = normalized > 0.5 ? 255 : Math.round(normalized * 2 * 255)
  const b = normalized < 0.5 ? 255 : Math.round((1 - normalized) * 2 * 255)
  const g = normalized < 0.5
    ? Math.round(normalized * 2 * 255)
    : Math.round((1 - normalized) * 2 * 255)
  return `rgb(${r},${g},${b})`
}

function CfcHeatmap({ matrix, title }: { matrix: number[][]; title: string }) {
  const displayMatrix = useMemo(() => {
    return matrix.map((row, i) => row.map((val, j) => (i === j ? 0 : val)))
  }, [matrix])

  const stats = useMemo(() => {
    let min = Infinity, max = -Infinity, validCount = 0
    displayMatrix.forEach(row => {
      if (Array.isArray(row)) row.forEach(val => {
        const n = Number(val)
        if (!isNaN(n) && isFinite(n)) { validCount++; if (n < min) min = n; if (n > max) max = n }
      })
    })
    if (validCount === 0 || !isFinite(min) || !isFinite(max)) return null
    const absMax = Math.max(Math.abs(min), Math.abs(max))
    return { min: -absMax, max: absMax, absMax }
  }, [displayMatrix])

  const size = matrix.length
  const cellSize = Math.min(200 / Math.max(size, 1), 14)

  if (!stats) return (
    <div style={{ textAlign: 'center', padding: '16px 0', color: '#4b5563', fontSize: 13 }}>No CFC data</div>
  )

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>{title}</span>
        <span style={{ fontSize: 11, color: '#64748b' }}>{size}×{matrix[0]?.length ?? 0}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div style={{ border: '1px solid #2d3250', borderRadius: 6, overflow: 'hidden' }}>
          {displayMatrix.map((row, i) => (
            <div key={i} style={{ display: 'flex' }}>
              {Array.isArray(row) && row.map((val, j) => {
                const numVal = Number(val)
                const isValid = !isNaN(numVal) && isFinite(numVal)
                const normalized = isValid && stats.max > stats.min
                  ? (numVal - stats.min) / (stats.max - stats.min)
                  : 0
                return (
                  <div key={j}
                    style={{ width: cellSize, height: cellSize, backgroundColor: isValid ? getHeatColor(normalized) : '#334155' }}
                    title={`[${i},${j}]: ${isValid ? numVal.toFixed(4) : 'N/A'}`}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, fontSize: 11, color: '#64748b' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span>Low</span>
          <div style={{ width: 60, height: 8, borderRadius: 4, background: 'linear-gradient(to right, #3b82f6, #ffffff, #ef4444)', border: '1px solid #2d3250' }} />
          <span>High</span>
        </div>
        <span>±{stats.absMax.toFixed(4)}</span>
      </div>
    </div>
  )
}

export function CFCWaveletCard({ data, timestamp }: CfcProps) {
  const [selectedFile, setSelectedFile] = useState(0)
  const [selectedWindow, setSelectedWindow] = useState(0)
  const [showConsole, setShowConsole] = useState(false)

  const isFolderMode = (data.files_cfcs?.length ?? 0) > 1

  // Current file's window list
  const currentFileCfcs = useMemo(() => {
    if (isFolderMode && data.files_cfcs) return data.files_cfcs[selectedFile]?.cfcs ?? []
    return data.cfcs ?? []
  }, [isFolderMode, data.files_cfcs, data.cfcs, selectedFile])

  const numWindowsInFile = currentFileCfcs.length

  const windowCfc = useMemo(() => {
    return currentFileCfcs[selectedWindow] ?? null
  }, [currentFileCfcs, selectedWindow])

  const currentFileAvg = useMemo(() => {
    if (isFolderMode) return data.files_avg_cfcs?.[selectedFile]?.avg_cfc ?? null
    return data.avg_cfc ?? null
  }, [isFolderMode, data.files_avg_cfcs, data.avg_cfc, selectedFile])

  function handleFileChange(idx: number) {
    setSelectedFile(idx)
    setSelectedWindow(0)
  }

  return (
    <div  className="w-full bg-slate-900 rounded-lg p-4 border border-slate-700">
        <div className="flex justify-between items-center mb-4 border-b border-slate-700 pb-2">
            <span className="font-semibold text-slate-200">
              CFC Wavelet Analysis
            </span>
        </div>

      
        <div className="flex gap-4 mb-4 text-xs">
            <div className="flex-1 bg-slate-800 p-2 rounded">
                <div className="text-slate-500 mb-1">Elapsed (s)</div>
                <div className="font-mono text-indigo-300">{data.elapsed_seconds.toFixed(2)}</div>
            </div>
            <div className="flex-1 bg-slate-800 p-2 rounded">
                <div className="text-slate-500 mb-1">Files</div>
                <div className="font-mono text-slate-200">
                    {data.files_cfcs?.length ?? 1}
                </div>
            </div>
            <div className="flex-1 bg-slate-800 p-2 rounded">
                <div className="text-slate-500 mb-1">Total Windows</div>
                <div className="font-mono text-rose-400">{data.num_windows}</div>
            </div>
        </div>

      {/* Progress steps
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {data.progress.map((p, i) => {
          const color = p.step === 'error' ? '#f87171' : p.step === 'analyzing' ? '#fbbf24' : '#4ade80'
          const bg = p.step === 'error' ? '#450a0a' : p.step === 'analyzing' ? '#422006' : '#052e16'
          return (
            <span key={i} style={{ background: bg, color, borderRadius: 6, padding: '2px 8px', fontSize: 11 }}>
              {p.message}
            </span>
          )
        })}
      </div> */}

      {/* File selector (folder mode only) */}
      {isFolderMode && (
        <div className="form-row" style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 4 }}>File</label>
          <select
            className="form-select"
            value={selectedFile}
            onChange={e => handleFileChange(Number(e.target.value))}
          >
            {data.files_cfcs!.map((f, i) => (
              <option key={i} value={i}>{f.filename}</option>
            ))}
          </select>
        </div>
      )}

      {/* Window slider */}
      {numWindowsInFile > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: '#94a3b8', whiteSpace: 'nowrap' }}>Window</span>
          <input
            type="range" min={0} max={numWindowsInFile - 1} value={selectedWindow}
            onChange={e => setSelectedWindow(parseInt(e.target.value))}
            style={{ flex: 1, accentColor: '#7c3aed' }}
          />
          <span style={{ fontSize: 12, color: '#a5b4fc', fontWeight: 600, whiteSpace: 'nowrap' }}>
            {selectedWindow + 1}/{numWindowsInFile}
          </span>
        </div>
      )}

      {/* Heatmaps side by side */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {windowCfc && windowCfc.length > 0 && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <CfcHeatmap
              matrix={windowCfc}
              title={isFolderMode
                ? `Window ${selectedWindow + 1}`
                : `Window ${selectedWindow + 1}`}
            />
          </div>
        )}
        {currentFileAvg && currentFileAvg.length > 0 && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <CfcHeatmap
              matrix={currentFileAvg}
              title={isFolderMode ? `File Avg` : 'Avg (all windows)'}
            />
          </div>
        )}
        {isFolderMode && data.avg_cfc && data.avg_cfc.length > 0 && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <CfcHeatmap matrix={data.avg_cfc} title="Overall Avg" />
          </div>
        )}
      </div>

      {/* Console output toggle */}
      {data.console_output && (
        <div style={{ marginTop: 12 }}>
          <button
            onClick={() => setShowConsole(v => !v)}
            style={{ fontSize: 11, color: '#7c3aed', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            {showConsole ? '▲ Hide' : '▼ Show'} console output
          </button>
          {showConsole && (
            <pre style={{
              marginTop: 6, padding: 8, background: '#0f1117', border: '1px solid #2d3250',
              borderRadius: 6, fontSize: 10, color: '#94a3b8', maxHeight: 120,
              overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            }}>
              {data.console_output}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}



interface HubProps {
  data: HubDetectionResult
  timestamp: string
}

export function HubDetectionCard({ data, timestamp }: HubProps) {
  const [selectedWindow, setSelectedWindow] = useState(0)
  const [showConsole, setShowConsole] = useState(false)

  const method = data.results?.method ?? 'unknown'
  const isGroup = method === 'group'

  const hubRankings = useMemo(() => {
    if (isGroup || !data.results?.results) return null
    const freq: Record<number, number> = {}
    for (const r of data.results.results) {
      for (const node of (r.hub_nodes ?? [])) {
        freq[node] = (freq[node] ?? 0) + 1
      }
    }
    return Object.entries(freq)
      .map(([node_id, count]) => ({ node_id: Number(node_id), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20)
  }, [data.results, isGroup])

  const currentWindowHubs = useMemo(() => {
    if (isGroup) return data.results?.hub_nodes ?? []
    return data.results?.results?.[selectedWindow]?.hub_nodes ?? []
  }, [data.results, isGroup, selectedWindow])

  return (
    <div className="result-card">
      <div className="result-card-header">
        <span className="result-card-title">Hub Detection</span>
        <span className="result-card-time">{timestamp}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{
          padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
          background: isGroup ? '#14532d' : '#1e1b4b',
          color: isGroup ? '#4ade80' : '#a5b4fc',
        }}>
          {isGroup ? 'Group' : 'Individual'}
        </span>
      </div>

      <div className="stat-grid">
        <div className="stat-box">
          <div className="stat-label">Files</div>
          <div className="stat-value">{data.num_windows}</div>
        </div>
        <div className="stat-box">
          <div className="stat-label">Embedding k</div>
          <div className="stat-value">{data.k}</div>
        </div>
        <div className="stat-box">
          <div className="stat-label">Hub Count</div>
          <div className="stat-value">{data.hub_num}</div>
        </div>
      </div>

      {/* Progress steps */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {data.progress.map((p, i) => {
          const color = p.step === 'error' ? '#f87171' : p.step === 'analyzing' ? '#fbbf24' : '#4ade80'
          const bg = p.step === 'error' ? '#450a0a' : p.step === 'analyzing' ? '#422006' : '#052e16'
          return (
            <span key={i} style={{ background: bg, color, borderRadius: 6, padding: '2px 8px', fontSize: 11 }}>
              {p.message}
            </span>
          )
        })}
      </div>

      {/* Window slider for individual mode */}
      {!isGroup && data.num_windows > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: '#94a3b8', whiteSpace: 'nowrap' }}>File</span>
          <input
            type="range" min={0} max={data.num_windows - 1} value={selectedWindow}
            onChange={e => setSelectedWindow(parseInt(e.target.value))}
            style={{ flex: 1, accentColor: '#7c3aed' }}
          />
          <span style={{ fontSize: 12, color: '#a5b4fc', fontWeight: 600, whiteSpace: 'nowrap' }}>
            {selectedWindow + 1}/{data.num_windows}
          </span>
        </div>
      )}

      {/* Hub nodes */}
      <div style={{
        background: isGroup ? '#1c0505' : '#0d0f1e',
        border: `1px solid ${isGroup ? '#7f1d1d' : '#2d3250'}`,
        borderRadius: 8, padding: '10px 12px', marginBottom: 12,
      }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: isGroup ? '#f87171' : '#a5b4fc', marginBottom: 6 }}>
          {isGroup ? 'Group Common Hubs' : `Hub Nodes — File ${selectedWindow + 1}`}
        </div>
        {currentWindowHubs.length > 0 ? (
          <div style={{ fontFamily: 'monospace', fontSize: 12, color: isGroup ? '#fca5a5' : '#c7d2fe', lineHeight: 1.6 }}>
            {currentWindowHubs.map((idx, i) => {
              const roi = data.roi_list?.[idx]
              const label = roi ? `${idx} (${roi.name})` : `${idx}`
              return <span key={idx}>{i > 0 ? ', ' : ''}{label}</span>
            })}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: '#4b5563' }}>No hub nodes</div>
        )}
      </div>

      {/* ROI composite + legend side by side */}
      {data.roi_list && currentWindowHubs.length > 0 && (() => {
        const PALETTE = ['#ef4444','#3b82f6','#22c55e','#f59e0b','#a855f7',
                         '#ec4899','#14b8a6','#f97316','#6366f1','#84cc16']
        const hubsWithRoi = currentWindowHubs.filter(idx => data.roi_list![idx]?.code)
        if (hubsWithRoi.length === 0) return null
        const imageKey = isGroup ? 'group' : String(selectedWindow)
        const imgSrc = data.hub_roi_images?.[imageKey]
        if (!imgSrc) return null
        return (
          <div style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'flex-start' }}>
            <img src={imgSrc} style={{ width: '50%', borderRadius: 6, display: 'block', flexShrink: 0 }} alt="Hub ROIs" />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 2 }}>ROI Legend</div>
              {hubsWithRoi.map((idx, i) => {
                const roi = data.roi_list![idx]
                return (
                  <span key={idx} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
                    <span style={{ width: 9, height: 9, borderRadius: 2, background: PALETTE[i % PALETTE.length], display: 'inline-block', flexShrink: 0 }} />
                    <span style={{ color: '#94a3b8' }}>{roi.name}</span>
                  </span>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* Hub frequency ranking (individual mode only) */}
      {hubRankings && hubRankings.length > 0 && (
        <div style={{ border: '1px solid #2d3250', borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
          <div style={{ padding: '8px 12px', background: '#0f1117', fontSize: 11, fontWeight: 600, color: '#64748b' }}>
            Hub Frequency Ranking
          </div>
          <div style={{ maxHeight: 160, overflowY: 'auto' }}>
            {hubRankings.map((item, idx) => {
              const roiName = data.roi_list?.[item.node_id]?.name
              return (
                <div key={item.node_id} style={{
                  padding: '6px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  fontSize: 12, borderTop: idx === 0 ? 'none' : '1px solid #1e2235',
                }}>
                  <span style={{ color: '#94a3b8' }}>
                    #{idx + 1} Node {item.node_id}
                    {roiName && <span style={{ color: '#64748b', marginLeft: 6 }}>{roiName}</span>}
                  </span>
                  <span style={{ fontWeight: 600, color: '#a5b4fc' }}>{item.count}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Console output toggle */}
      {data.console_output && (
        <div>
          <button
            onClick={() => setShowConsole(v => !v)}
            style={{ fontSize: 11, color: '#7c3aed', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            {showConsole ? '▲ Hide' : '▼ Show'} console output
          </button>
          {showConsole && (
            <pre style={{
              marginTop: 6, padding: 8, background: '#0f1117', border: '1px solid #2d3250',
              borderRadius: 6, fontSize: 10, color: '#94a3b8', maxHeight: 120,
              overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            }}>
              {data.console_output}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}


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
