/**
 * chartToCode.ts
 *
 * Generates Recharts JSX code strings that visually match the static
 * Charts.tsx components as closely as possible. The generated code
 * references `data` as a scope variable (injected via react-live).
 *
 * All pre-computed fields (sampled points, regression lines, domains,
 * labels, titles) are set in prepareDataScope() so the JSX stays clean.
 */

import { VisualizationType } from '../types';
import { ChartConfig } from '../components/Visualizer/Charts';

const DEFAULT_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4',
  '#f97316', '#14b8a6', '#6366f1', '#d946ef', '#f43f5e', '#84cc16', '#a855f7',
  '#0ea5e9', '#eab308', '#64748b'
];

// ===================================================================
// prepareDataScope — pre-compute everything the generated JSX needs
// ===================================================================

export function prepareDataScope(
  vizType: VisualizationType,
  rawData: any,
  config?: ChartConfig
): Record<string, any> {
  switch (vizType) {

    // ---------------------------------------------------------------
    case VisualizationType.SCATTER_PLOT: {
      const allSeries: any[] = rawData.series || [];
      const xCol = config?.xAxisLabel || rawData.xCol || 'X';
      const yCol = config?.yAxisLabel || rawData.yCol || 'Y';

      const title = config?.title || (rawData.groupCol
        ? `Grouped Correlation: ${rawData.xCol} vs ${rawData.yCol} by ${rawData.groupCol}`
        : `Correlation: ${rawData.xCol} vs ${rawData.yCol}${allSeries[0] ? ` (r=${allSeries[0].r.toFixed(3)})` : ''}`);

      // Build display series with sampled points + regression lines
      let gMinX = Infinity, gMaxX = -Infinity, gMinY = Infinity, gMaxY = -Infinity;

      const displaySeries = allSeries.map((s: any, idx: number) => {
        const pts: { x: number; y: number }[] = s.dataPoints || [];
        const color = DEFAULT_COLORS[idx % DEFAULT_COLORS.length];
        const n = s.n || pts.length;

        // Sample to max 100 points (Fisher-Yates)
        let displayPoints = pts;
        if (pts.length > 100) {
          const shuffled = [...pts];
          for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
          }
          displayPoints = shuffled.slice(0, 100);
        }
        // Tag with series name for tooltip
        displayPoints = displayPoints.map(p => ({ ...p, seriesName: s.name }));

        // Domain contribution
        pts.forEach(p => {
          if (p.x < gMinX) gMinX = p.x; if (p.x > gMaxX) gMaxX = p.x;
          if (p.y < gMinY) gMinY = p.y; if (p.y > gMaxY) gMaxY = p.y;
        });

        // Regression line (ordinary least-squares)
        let regressionLine: { x: number; y: number }[] = [];
        if (pts.length >= 2) {
          const nn = pts.length;
          let sx = 0, sy = 0, sxy = 0, sx2 = 0, lMin = Infinity, lMax = -Infinity;
          pts.forEach(p => {
            sx += p.x; sy += p.y; sxy += p.x * p.y; sx2 += p.x * p.x;
            if (p.x < lMin) lMin = p.x; if (p.x > lMax) lMax = p.x;
          });
          const denom = nn * sx2 - sx * sx;
          if (denom !== 0) {
            const slope = (nn * sxy - sx * sy) / denom;
            const intercept = (sy - slope * sx) / nn;
            regressionLine = [
              { x: lMin, y: slope * lMin + intercept },
              { x: lMax, y: slope * lMax + intercept }
            ];
          }
        }

        return { name: s.name, r: s.r, p: s.p, n, color, displayPoints, regressionLine };
      });

      // Domain with 5% padding
      const rangeX = gMaxX - gMinX;
      const rangeY = gMaxY - gMinY;
      const padX = rangeX === 0 ? (Math.abs(gMinX) * 0.1 || 1) : rangeX * 0.05;
      const padY = rangeY === 0 ? (Math.abs(gMinY) * 0.1 || 1) : rangeY * 0.05;

      return {
        ...rawData,
        title, xLabel: xCol, yLabel: yCol,
        groupCount: allSeries.length,
        displaySeries,
        xDomain: [gMinX - padX, gMaxX + padX],
        yDomain: [gMinY - padY, gMaxY + padY],
      };
    }

    // ---------------------------------------------------------------
    case VisualizationType.BOX_PLOT: {
      const xCol = config?.xAxisLabel || rawData.groupCol || 'Group';
      const yCol = config?.yAxisLabel || rawData.valueCol || 'Value';
      const fill = config?.color || '#8b5cf6';
      const title = config?.title || `Group Comparison: ${rawData.valueCol} by ${rawData.groupCol} (p=${rawData.pVal})`;
      return { ...rawData, title, xLabel: xCol, yLabel: yCol, fill };
    }

    // ---------------------------------------------------------------
    case VisualizationType.AGING_CURVE: {
      const title = config?.title || rawData.phenotype || 'Growth Curve';
      const xLabel = config?.xAxisLabel || 'Age (yr)';
      const yLabel = config?.yAxisLabel || 'Value';

      const X = rawData.data?.X || [];
      const centiles = rawData.data?.centiles || [];
      const hasCentiles = Array.isArray(centiles) && centiles.length === X.length;

      const chartData = X.map((x: number, i: number) => {
        const gc = (idx: number) => {
          if (!hasCentiles) return undefined;
          const v = centiles[i]?.[idx]; const n = Number(v); return isNaN(n) ? undefined : n;
        };
        return { age: Number(x), p5: gc(0), p25: gc(1), p50: gc(2), p75: gc(3), p95: gc(4) };
      });

      const overlay = rawData.data || {};
      const overlayData = (overlay.values && overlay.age)
        ? overlay.age.map((a: number, i: number) => ({
            age: a, value: overlay.values![i],
            color: rawData.overlayDot_color ? rawData.overlayDot_color[i] : undefined
          })).filter((p: any) => !isNaN(p.age) && !isNaN(p.value))
        : [];

      const xAxisDomain: [number, number] = chartData.length > 0
        ? [chartData[0].age, chartData[chartData.length - 1].age] : [0, 80];

      let yMin = Infinity, yMax = -Infinity;
      chartData.forEach((d: any) => {
        [d.p5, d.p25, d.p50, d.p75, d.p95].forEach((v: number | undefined) => {
          if (v !== undefined) { if (v < yMin) yMin = v; if (v > yMax) yMax = v; }
        });
      });
      overlayData.forEach((d: any) => { if (d.value < yMin) yMin = d.value; if (d.value > yMax) yMax = d.value; });
      const yPad = (yMax - yMin) === 0 ? (Math.abs(yMax) * 0.1 || 0.1) : (yMax - yMin) * 0.1;
      const yAxisDomain: [number, number] = yMin === Infinity ? [0, 1] : [yMin - yPad, yMax + yPad];

      return { ...rawData, title, xLabel, yLabel, chartData, overlayData, xAxisDomain, yAxisDomain };
    }

    // ---------------------------------------------------------------
    case VisualizationType.STRATIFICATION_RESULT: {
      const fill = config?.color || '#10b981';
      const xCol = config?.xAxisLabel || rawData.groupCol || 'Group';
      const yCol = config?.yAxisLabel || 'Row Count';
      const title = config?.title || `Stratification: ${rawData.targetCol} by ${rawData.groupCol} (Row Counts)`;
      return { ...rawData, title, xLabel: xCol, yLabel: yCol, fill };
    }

    // ---------------------------------------------------------------
    case VisualizationType.SVM_BOUNDARY: {
      const xCol = config?.xAxisLabel || rawData.xCol || 'Feature 1';
      const yCol = config?.yAxisLabel || rawData.yCol || 'Feature 2';
      const title = config?.title || `SVM Classification: ${rawData.targetCol} (Accuracy: ${(rawData.accuracy * 100).toFixed(1)}%)`;
      const classes: any[] = rawData.classes || [];
      const classData = classes.map((cls: any) =>
        (rawData.dataPoints || []).filter((p: any) => p.classLabel === cls)
      );
      const boundaryLine = rawData.decisionBoundary ? [
        { x: rawData.decisionBoundary.x1, y: rawData.decisionBoundary.y1 },
        { x: rawData.decisionBoundary.x2, y: rawData.decisionBoundary.y2 }
      ] : [];
      return { ...rawData, title, xLabel: xCol, yLabel: yCol, classData, boundaryLine };
    }

    // ---------------------------------------------------------------
    case VisualizationType.CLUSTERING_DASHBOARD: {
      const clusters = Array.from(new Set((rawData.pcPoints || []).map((p: any) => p.cluster)));
      const clusterGroups = clusters.map((cid) =>
        (rawData.pcPoints || []).filter((p: any) => p.cluster === cid)
      );
      const tMin = rawData.targetCol ? Math.min(...(rawData.pcPoints || []).map((p: any) => p.target || 0)) : 0;
      const tMax = rawData.targetCol ? Math.max(...(rawData.pcPoints || []).map((p: any) => p.target || 0)) : 1;
      return { ...rawData, clusterGroups, targetMin: tMin, targetRange: tMax - tMin || 1 };
    }

    default:
      return { ...rawData };
  }
}

// ===================================================================
// Code generators — match Charts.tsx visual output
// ===================================================================

function scatterPlotToCode(_data: any, _config?: ChartConfig): string {
  // All dynamic values come from data scope (title, labels, series, domains).
  // This code matches Charts.tsx: card wrapper, series badges, vertical Y-axis
  // label, regression lines, and same styling/heights.
  return `<div className="w-full flex flex-col bg-slate-900 rounded-lg border border-slate-700 overflow-hidden">
  <div className="p-3 bg-slate-800/50 border-b border-slate-700 flex justify-between items-center">
    <h3 className="text-slate-300 text-sm font-semibold truncate" style={{maxWidth:"70%"}}>
      {data.title}
    </h3>
    <div className="text-xs text-slate-500">
      {data.groupCount + " group" + (data.groupCount !== 1 ? "s" : "")}
    </div>
  </div>

  {/* Series info badges */}
  <div className="p-2 flex flex-wrap gap-2 border-b border-slate-800 bg-slate-900/30 max-h-32 overflow-y-auto">
    {data.displaySeries.map(function(s, idx) {
      return (
        <div key={idx}
          className="flex items-center gap-2 px-2 py-1 rounded text-xs border bg-slate-800 border-slate-600 text-slate-200 shadow-sm"
          style={{borderColor: s.color, width: 192}}
        >
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{backgroundColor: s.color}} />
          <span className="font-mono text-[10px]" style={{color: s.p < 0.05 ? "#4ade80" : "#64748b"}}>
            {"p=" + (s.p < 0.001 ? "<.001" : s.p.toFixed(3)) + " n=" + s.n}
          </span>
          <span className="font-medium truncate">{s.name}</span>
        </div>
      );
    })}
  </div>

  <div className="w-full p-2" style={{height:"24rem"}}>
    <div className="flex h-full">
      <div className="flex items-center justify-center flex-shrink-0" style={{width:28}}>
        <span className="text-slate-400 text-[11px]" style={{writingMode:"vertical-rl", transform:"rotate(180deg)"}}>
          {data.yLabel}
        </span>
      </div>
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{top:20, right:20, bottom:10, left:10}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis type="number" dataKey="x" stroke="#94a3b8" fontSize={12} domain={data.xDomain} />
              <YAxis type="number" dataKey="y" stroke="#94a3b8" fontSize={12} domain={data.yDomain} />
              <Tooltip
                cursor={{strokeDasharray:"3 3"}}
                contentStyle={{backgroundColor:"#1e293b", borderColor:"#475569", color:"#f1f5f9"}}
                formatter={function(value, name, props) {
                  return [value, props.payload.seriesName ? props.payload.seriesName + " (" + name + ")" : name];
                }}
              />
              {data.displaySeries.map(function(s, idx) {
                return (
                  <Scatter
                    key={"s"+idx}
                    name={s.name + " (r=" + s.r.toFixed(2) + ")"}
                    data={s.displayPoints}
                    fill={s.color}
                  />
                );
              })}
              {data.displaySeries.map(function(s, idx) {
                if (s.regressionLine.length === 0) return null;
                return (
                  <Scatter
                    key={"r"+idx}
                    data={s.regressionLine}
                    line={{stroke: s.color, strokeWidth: 2, strokeDasharray: "4 4"}}
                    shape={function() { return null; }}
                    fill="none"
                    legendType="none"
                    tooltipType="none"
                  />
                );
              })}
            </ScatterChart>
          </ResponsiveContainer>
        </div>
        <div className="text-center py-1">
          <span className="text-slate-400 text-[11px]">{data.xLabel}</span>
        </div>
      </div>
    </div>
  </div>
</div>`;
}


function barChartToCode(_data: any, _config?: ChartConfig): string {
  return `<div className="w-full bg-slate-900 rounded-lg p-4 border border-slate-700">
  <h3 className="text-center text-slate-300 mb-2 text-sm font-semibold">{data.title}</h3>
  <div className="flex" style={{height:"22rem"}}>
    <div className="flex items-center justify-center flex-shrink-0" style={{width:28}}>
      <span className="text-slate-400 text-[11px]" style={{writingMode:"vertical-rl", transform:"rotate(180deg)"}}>
        {data.yLabel}
      </span>
    </div>
    <div className="flex-1 flex flex-col min-w-0">
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.stats} margin={{top:20, right:30, left:10, bottom:10}}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="group" stroke="#94a3b8" />
            <YAxis stroke="#94a3b8" />
            <Tooltip contentStyle={{backgroundColor:"#1e293b", borderColor:"#475569", color:"#f1f5f9"}} />
            <Legend verticalAlign="top" height={36} />
            <Bar dataKey="mean" fill={data.fill} name="Mean Value" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="text-center py-1">
        <span className="text-slate-400 text-[11px]">{data.xLabel}</span>
      </div>
    </div>
  </div>
</div>`;
}


function agingCurveToCode(data: any, _config?: ChartConfig): string {
  const hasOverlay = data.data?.values && data.data?.age;
  return `<div className="w-full bg-slate-900 rounded-lg p-4 border border-slate-700">
  <div className="flex justify-between items-center mb-4 border-b border-slate-700 pb-2">
    <span className="font-semibold text-slate-200">{data.title}</span>
  </div>
  <div className="flex gap-4 mb-4 text-xs">
    <div className="flex-1 bg-slate-800 p-2 rounded">
      <div className="text-slate-500 mb-1">Elapsed (s)</div>
      <div className="font-mono text-indigo-300">{data.elapsed_seconds.toFixed(2)}</div>
    </div>
    <div className="flex-1 bg-slate-800 p-2 rounded">
      <div className="text-slate-500 mb-1">Age Range</div>
      <div className="font-mono text-slate-200">
        {data.chartData.length > 0
          ? data.chartData[0].age.toFixed(0) + "\\u2013" + data.chartData[data.chartData.length-1].age.toFixed(0) + " yr"
          : "\\u2014"}
      </div>
    </div>
    ${hasOverlay ? `<div className="flex-1 bg-slate-800 p-2 rounded">
      <div className="text-slate-500 mb-1">Overlay Points</div>
      <div className="font-mono text-rose-400">{data.overlayData.length}</div>
    </div>` : ''}
  </div>
  <div style={{height:"24rem"}} className="w-full">
    {data.chartData.length > 0 || data.overlayData.length > 0 ? (
      <div className="flex h-full">
        <div className="flex items-center justify-center flex-shrink-0" style={{width:24}}>
          <span className="text-slate-500 text-[11px]" style={{writingMode:"vertical-rl", transform:"rotate(180deg)"}}>
            {data.yLabel}
          </span>
        </div>
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data.chartData} margin={{top:10, right:16, left:10, bottom:10}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="age" type="number" domain={data.xAxisDomain}
                  tick={{fontSize:10, fill:"#64748b"}} stroke="#475569" />
                <YAxis domain={data.yAxisDomain} width={50}
                  tick={{fontSize:10, fill:"#64748b"}} stroke="#475569" />
                <Tooltip
                  contentStyle={{backgroundColor:"#1e293b", borderColor:"#475569", borderRadius:8, fontSize:11, color:"#f1f5f9"}}
                  labelStyle={{color:"#a5b4fc"}} itemStyle={{color:"#e2e8f0"}}
                  labelFormatter={function(v) { return "Age: " + Number(v).toFixed(1) + " yr"; }}
                />
                <Legend iconType="line" iconSize={12} verticalAlign="top" wrapperStyle={{fontSize:11, paddingBottom:10}} />
                <Line dataKey="p5"  stroke="#475569" strokeWidth={1.5} strokeDasharray="5 4" dot={false} name="5th" connectNulls />
                <Line dataKey="p25" stroke="#7c3aed" strokeWidth={1.5} strokeDasharray="5 4" dot={false} name="25th" connectNulls />
                <Line dataKey="p50" stroke="#a5b4fc" strokeWidth={2.5} dot={false} name="50th (Median)" connectNulls />
                <Line dataKey="p75" stroke="#7c3aed" strokeWidth={1.5} strokeDasharray="5 4" dot={false} name="75th" connectNulls />
                <Line dataKey="p95" stroke="#475569" strokeWidth={1.5} strokeDasharray="5 4" dot={false} name="95th" connectNulls />
                ${hasOverlay ? `<Scatter data={data.overlayData} dataKey="value" name="Your data" fill="#f43f5e" />` : ''}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="text-center py-1">
            <span className="text-slate-500 text-[11px]">{data.xLabel}</span>
          </div>
        </div>
      </div>
    ) : (
      <div className="flex h-full items-center justify-center text-slate-500 text-sm">No curve data available</div>
    )}
  </div>
</div>`;
}


function stratificationToCode(_data: any, _config?: ChartConfig): string {
  return `<div className="w-full bg-slate-900 rounded-lg p-4 border border-slate-700">
  <h3 className="text-center text-slate-300 mb-2 text-sm font-semibold">{data.title}</h3>
  <div className="flex" style={{height:"20rem"}}>
    <div className="flex items-center justify-center flex-shrink-0" style={{width:28}}>
      <span className="text-slate-400 text-[11px]" style={{writingMode:"vertical-rl", transform:"rotate(180deg)"}}>
        {data.yLabel}
      </span>
    </div>
    <div className="flex-1 min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data.newColumns} margin={{top:20, right:30, left:10, bottom:60}}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="name" stroke="#94a3b8" angle={-45} textAnchor="end" height={60} tick={{fontSize:10}} />
          <YAxis stroke="#94a3b8" />
          <Tooltip contentStyle={{backgroundColor:"#1e293b", borderColor:"#475569", color:"#f1f5f9"}} cursor={{fill:"#334155", opacity:0.4}} />
          <Bar dataKey="count" fill={data.fill} name="Rows" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  </div>
</div>`;
}


function svmBoundaryToCode(data: any, _config?: ChartConfig): string {
  const classes: any[] = data.classes || [];
  // Build static scatter entries per class
  const scatters = classes.map((_cls: any, idx: number) => {
    const color = ['#3b82f6', '#ef4444'][idx % 2];
    return `              <Scatter key={"c${idx}"} name={"Class " + data.classes[${idx}]} data={data.classData[${idx}]} fill="${color}" />`;
  }).join('\n');

  return `<div className="w-full bg-slate-900 rounded-lg p-4 border border-slate-700">
  <h3 className="text-center text-slate-300 mb-1 text-sm font-semibold">{data.title}</h3>
  <p className="text-center text-slate-500 text-xs mb-2">
    {"Features: " + data.xCol + " vs " + data.yCol}
  </p>
  <div className="flex" style={{height:"20rem"}}>
    <div className="flex items-center justify-center flex-shrink-0" style={{width:28}}>
      <span className="text-slate-400 text-[11px]" style={{writingMode:"vertical-rl", transform:"rotate(180deg)"}}>
        {data.yLabel}
      </span>
    </div>
    <div className="flex-1 flex flex-col min-w-0">
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{top:20, right:20, bottom:10, left:10}}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis type="number" dataKey="x" name={data.xLabel} stroke="#94a3b8" fontSize={12} />
            <YAxis type="number" dataKey="y" name={data.yLabel} stroke="#94a3b8" fontSize={12} />
            <Tooltip cursor={{strokeDasharray:"3 3"}} contentStyle={{backgroundColor:"#1e293b", borderColor:"#475569", color:"#f1f5f9"}} />
            <Legend verticalAlign="top" height={36} wrapperStyle={{fontSize:"12px", color:"#cbd5e1"}} />
${scatters}
            <Scatter name="Decision Boundary" data={data.boundaryLine}
              line={{stroke:"#10b981", strokeWidth:3}} shape={function(){return null;}}
              fill="none" legendType="plainline" />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <div className="text-center py-1">
        <span className="text-slate-400 text-[11px]">{data.xLabel}</span>
      </div>
    </div>
  </div>
</div>`;
}


function clusteringToCode(data: any, _config?: ChartConfig): string {
  const clusters = Array.from(new Set((data.pcPoints || []).map((p: any) => p.cluster)));
  const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#d946ef'];

  const clusterScatters = clusters.map((_cid: any, idx: number) => {
    const cid = Number(_cid);
    return `              <Scatter key={"c${idx}"} name={"Cluster " + ${cid}} data={data.clusterGroups[${idx}]} fill="${COLORS[cid % COLORS.length]}" />`;
  }).join('\n');

  return `<div className="w-full" style={{display:"flex", flexDirection:"column", gap:16}}>
  <div style={{display:"grid", gridTemplateColumns:${data.targetCol ? '"1fr 1fr"' : '"1fr"'}, gap:16, height:320}}>
    <div style={{background:"#0f172a", borderRadius:8, padding:12, border:"1px solid #334155"}}>
      <h4 style={{textAlign:"center", fontSize:12, color:"#94a3b8", marginBottom:8}}>PC1 vs PC2 (Color: Cluster)</h4>
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{top:10, right:10, bottom:30, left:20}}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis type="number" dataKey="x" name="PC1" stroke="#64748b" fontSize={10}
            tickFormatter={function(v){return v.toFixed(1);}}
            label={{value:"PC1", position:"insideBottom", offset:-20, fill:"#64748b", fontSize:10}} />
          <YAxis type="number" dataKey="y" name="PC2" stroke="#64748b" fontSize={10}
            tickFormatter={function(v){return v.toFixed(1);}}
            label={{value:"PC2", angle:-90, position:"insideLeft", offset:10, fill:"#64748b", fontSize:10}} />
          <Tooltip cursor={{strokeDasharray:"3 3"}} contentStyle={{backgroundColor:"#1e293b", fontSize:11}} />
${clusterScatters}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
${data.targetCol ? `    <div style={{background:"#0f172a", borderRadius:8, padding:12, border:"1px solid #334155", position:"relative"}}>
      <h4 style={{textAlign:"center", fontSize:12, color:"#94a3b8", marginBottom:8}}>{"PC1 vs PC2 (Color: " + data.targetCol + ")"}</h4>
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{top:10, right:10, bottom:30, left:20}}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis type="number" dataKey="x" name="PC1" stroke="#64748b" fontSize={10}
            tickFormatter={function(v){return v.toFixed(1);}}
            label={{value:"PC1", position:"insideBottom", offset:-20, fill:"#64748b", fontSize:10}} />
          <YAxis type="number" dataKey="y" name="PC2" stroke="#64748b" fontSize={10}
            tickFormatter={function(v){return v.toFixed(1);}}
            label={{value:"PC2", angle:-90, position:"insideLeft", offset:10, fill:"#64748b", fontSize:10}} />
          <Tooltip cursor={{strokeDasharray:"3 3"}} contentStyle={{backgroundColor:"#1e293b", fontSize:11}} />
          <Scatter data={data.pcPoints} fill="#3b82f6">
            {data.pcPoints.map(function(entry, index) {
              var norm = (entry.target - data.targetMin) / (data.targetRange || 1);
              var r = Math.round(norm * 255);
              var b = Math.round((1 - norm) * 255);
              return React.createElement(Cell, {key:"cell-"+index, fill:"rgb("+r+", 50, "+b+")"});
            })}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
      <div style={{position:"absolute", bottom:8, right:8, fontSize:10, color:"#64748b", background:"rgba(15,23,42,0.8)", padding:"2px 4px", borderRadius:4}}>
        Blue=Low, Red=High
      </div>
    </div>` : ''}
  </div>
</div>`;
}


// ===================================================================
// Dispatcher
// ===================================================================

export function chartDataToCode(
  vizType: VisualizationType,
  data: any,
  config?: ChartConfig
): string | null {
  switch (vizType) {
    case VisualizationType.SCATTER_PLOT:      return scatterPlotToCode(data, config);
    case VisualizationType.BOX_PLOT:          return barChartToCode(data, config);
    case VisualizationType.AGING_CURVE:       return agingCurveToCode(data, config);
    case VisualizationType.STRATIFICATION_RESULT: return stratificationToCode(data, config);
    case VisualizationType.SVM_BOUNDARY:      return svmBoundaryToCode(data, config);
    case VisualizationType.CLUSTERING_DASHBOARD:  return clusteringToCode(data, config);
    default:                                  return null;
  }
}
