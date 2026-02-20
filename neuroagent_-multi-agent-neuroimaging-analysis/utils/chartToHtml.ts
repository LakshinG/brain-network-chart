// utils/chartToHtml.ts
// Converts built-in chart data (Recharts) to standalone Plotly.js HTML
// so the visualizer agent can edit the exact code rather than recreating from scratch.

import { ToolVisualization, VisualizationType } from '../types';

/**
 * Convert any built-in visualization's data into a Plotly.js HTML snippet
 * that faithfully reproduces the chart. Returns null for types that don't
 * make sense (DATA_TABLE, LITERATURE_LIST, RESEARCH_REPORT, VIS_HTML).
 */
export function chartDataToHtml(viz: ToolVisualization): string | null {
  switch (viz.type) {
    case VisualizationType.SCATTER_PLOT:
      return scatterToHtml(viz);
    case VisualizationType.BOX_PLOT:
      return boxPlotToHtml(viz);
    case VisualizationType.AGING_CURVE:
      return agingCurveToHtml(viz);
    case VisualizationType.CLUSTERING_DASHBOARD:
      return clusteringToHtml(viz);
    case VisualizationType.STRATIFICATION_RESULT:
      return stratificationToHtml(viz);
    default:
      return null;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Scatter Plot  (CORRELATION_ANALYSIS)
// ────────────────────────────────────────────────────────────────────────────
function scatterToHtml(viz: ToolVisualization): string {
  const d = viz.data;
  const fill = viz.config?.color || '#38bdf8';
  const DEFAULT_COLORS = ['#38bdf8', '#f87171', '#4ade80', '#facc15', '#c084fc', '#fb923c', '#2dd4bf', '#f472b6'];

  // CorrelationResult stores data in series[].dataPoints, not top-level dataPoints
  const series: any[] = d.series || [];

  // Build traces for each series
  const traces: string[] = [];
  const allPoints: { x: number; y: number }[] = [];

  series.forEach((s: any, idx: number) => {
    const pts = s.dataPoints || [];
    const xs = pts.map((p: any) => p.x);
    const ys = pts.map((p: any) => p.y);
    allPoints.push(...pts);
    const color = DEFAULT_COLORS[idx % DEFAULT_COLORS.length];

    traces.push(`{
      x: ${JSON.stringify(xs)},
      y: ${JSON.stringify(ys)},
      mode: 'markers',
      type: 'scatter',
      name: '${(s.name || 'Series ' + idx).replace(/'/g, "\\'")} (r=${(s.r ?? 0).toFixed(3)})',
      marker: { color: '${color}', size: 8, opacity: 0.7 }
    }`);

    // Add trend line per series
    if (pts.length >= 2) {
      const n = pts.length;
      let sx = 0, sy = 0, sxy = 0, sx2 = 0, minX = Infinity, maxX = -Infinity;
      pts.forEach((p: any) => { sx += p.x; sy += p.y; sxy += p.x * p.y; sx2 += p.x * p.x; if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; });
      const denom = n * sx2 - sx * sx;
      if (denom !== 0) {
        const slope = (n * sxy - sx * sy) / denom;
        const intercept = (sy - slope * sx) / n;
        traces.push(`{
      x: [${minX}, ${maxX}],
      y: [${(slope * minX + intercept).toFixed(4)}, ${(slope * maxX + intercept).toFixed(4)}],
      mode: 'lines',
      name: '${(s.name || 'Trend').replace(/'/g, "\\'")} trend',
      line: { color: '${color}', width: 2, dash: 'dash' },
      showlegend: false
    }`);
      }
    }
  });

  // Fallback: use top-level r if only one series
  const rValue = series.length === 1 ? (series[0].r ?? 0) : (d.r ?? 0);
  const titleSuffix = series.length === 1 ? ` (r=${rValue.toFixed(3)})` : '';
  const groupInfo = d.groupCol ? ` by ${d.groupCol}` : '';

  return `<div class="visualizationCard">
  <div class="vc-header">
    <h3 class="vc-title">Correlation: ${d.xCol} vs ${d.yCol}${groupInfo}${titleSuffix}</h3>
  </div>
  <div class="vc-body">
    <div id="chart"></div>
  </div>
  <script>
    Plotly.newPlot('chart', [${traces.join(',\n    ')}], {
      ...window.PLOTLY_DARK,
      xaxis: { ...window.PLOTLY_DARK.xaxis, title: '${d.xCol}' },
      yaxis: { ...window.PLOTLY_DARK.yaxis, title: '${d.yCol}' },
      margin: { l: 60, r: 20, t: 30, b: 60 }
    }, { responsive: true });
  <\/script>
</div>`;
}

// ────────────────────────────────────────────────────────────────────────────
// Box Plot / Group Comparison  (GROUP_COMPARISON)
// ────────────────────────────────────────────────────────────────────────────
function boxPlotToHtml(viz: ToolVisualization): string {
  const d = viz.data;
  const fill = viz.config?.color || '#8b5cf6';
  const groups = JSON.stringify((d.stats || []).map((s: any) => s.group));
  const means = JSON.stringify((d.stats || []).map((s: any) => s.mean));

  // Build pairwise comparison table HTML if available
  let pairwiseHtml = '';
  if (d.pairwise && d.pairwise.length > 0) {
    const rows = d.pairwise.map((pw: any) =>
      `<tr><td>${pw.groupA}</td><td>${pw.groupB}</td><td>${(pw.tStat ?? 0).toFixed(3)}</td><td>${(pw.pValue ?? 0).toExponential(3)}</td><td>${(pw.cohensD ?? 0).toFixed(3)}</td></tr>`
    ).join('\n          ');
    pairwiseHtml = `
  <div class="vc-footer" style="margin-top:12px;overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:12px;color:#94a3b8">
      <thead><tr style="border-bottom:1px solid #334155">
        <th style="padding:4px 8px;text-align:left">Group A</th>
        <th style="padding:4px 8px;text-align:left">Group B</th>
        <th style="padding:4px 8px;text-align:right">t-stat</th>
        <th style="padding:4px 8px;text-align:right">p-value</th>
        <th style="padding:4px 8px;text-align:right">Cohen's d</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
  }

  return `<div class="visualizationCard">
  <div class="vc-header">
    <h3 class="vc-title">Group Comparison: ${d.valueCol} by ${d.groupCol} (p=${d.pVal})</h3>
  </div>
  <div class="vc-body">
    <div id="chart"></div>
  </div>${pairwiseHtml}
  <script>
    Plotly.newPlot('chart', [{
      x: ${groups},
      y: ${means},
      type: 'bar',
      name: 'Mean Value',
      marker: { color: '${fill}' }
    }], {
      ...window.PLOTLY_DARK,
      xaxis: { ...window.PLOTLY_DARK.xaxis, title: '${d.groupCol}' },
      yaxis: { ...window.PLOTLY_DARK.yaxis, title: '${d.valueCol}' },
      margin: { l: 60, r: 20, t: 30, b: 60 }
    }, { responsive: true });
  <\/script>
</div>`;
}

// ────────────────────────────────────────────────────────────────────────────
// Aging / Growth Curve  (AGING_CURVE via MCP)
// ────────────────────────────────────────────────────────────────────────────
function agingCurveToHtml(viz: ToolVisualization): string {
  const d = viz.data;
  const cd = d.data || {};
  const X = cd.X || [];
  const centiles = cd.centiles || [];

  // Build arrays for each percentile line
  const p5  = centiles.map((c: number[]) => c[0]);
  const p25 = centiles.map((c: number[]) => c[1]);
  const p50 = centiles.map((c: number[]) => c[2]);
  const p75 = centiles.map((c: number[]) => c[3]);
  const p95 = centiles.map((c: number[]) => c[4]);

  let overlayTrace = '';
  if (cd.values && cd.age) {
    overlayTrace = `, {
      x: ${JSON.stringify(cd.age)},
      y: ${JSON.stringify(cd.values)},
      mode: 'markers',
      name: 'Your data',
      marker: { color: '#f43f5e', size: 7 }
    }`;
  }

  return `<div class="visualizationCard">
  <div class="vc-header">
    <h3 class="vc-title">${d.phenotype} — Aging Curve</h3>
    <p class="vc-subtitle">Elapsed: ${(d.elapsed_seconds ?? 0).toFixed(2)}s</p>
  </div>
  <div class="vc-body">
    <div id="chart"></div>
  </div>
  <script>
    Plotly.newPlot('chart', [
      { x: ${JSON.stringify(X)}, y: ${JSON.stringify(p5)},  mode:'lines', name:'5th',  line:{color:'#475569',width:1.5,dash:'dash'} },
      { x: ${JSON.stringify(X)}, y: ${JSON.stringify(p25)}, mode:'lines', name:'25th', line:{color:'#7c3aed',width:1.5,dash:'dash'} },
      { x: ${JSON.stringify(X)}, y: ${JSON.stringify(p50)}, mode:'lines', name:'50th (Median)', line:{color:'#a5b4fc',width:2.5} },
      { x: ${JSON.stringify(X)}, y: ${JSON.stringify(p75)}, mode:'lines', name:'75th', line:{color:'#7c3aed',width:1.5,dash:'dash'} },
      { x: ${JSON.stringify(X)}, y: ${JSON.stringify(p95)}, mode:'lines', name:'95th', line:{color:'#475569',width:1.5,dash:'dash'} }${overlayTrace}
    ], {
      ...window.PLOTLY_DARK,
      xaxis: { ...window.PLOTLY_DARK.xaxis, title: 'Age (yr)' },
      yaxis: { ...window.PLOTLY_DARK.yaxis, title: '${d.phenotype}' },
      margin: { l: 60, r: 20, t: 30, b: 60 }
    }, { responsive: true });
  <\/script>
</div>`;
}

// ────────────────────────────────────────────────────────────────────────────
// Clustering Dashboard  (SPECTRAL_CLUSTERING)
// ────────────────────────────────────────────────────────────────────────────
function clusteringToHtml(viz: ToolVisualization): string {
  const d = viz.data;
  const COLORS = ['#ef4444','#f97316','#eab308','#22c55e','#06b6d4','#3b82f6','#8b5cf6','#d946ef'];
  const pts = d.pcPoints || [];

  // Cluster-colored scatter
  const clusterIds = Array.from(new Set(pts.map((p: any) => p.cluster))) as number[];
  const clusterTraces = clusterIds.map((cid: number) => {
    const cp = pts.filter((p: any) => p.cluster === cid);
    return `{ x: ${JSON.stringify(cp.map((p: any) => p.x))}, y: ${JSON.stringify(cp.map((p: any) => p.y))}, mode:'markers', name:'Cluster ${cid}', marker:{color:'${COLORS[cid % COLORS.length]}',size:6}, type:'scatter' }`;
  }).join(',\n      ');

  // Heatmap-colored scatter (by target)
  const targetMin = Math.min(...pts.map((p: any) => p.target));
  const targetMax = Math.max(...pts.map((p: any) => p.target));

  return `<div class="visualizationCard">
  <div class="vc-header">
    <h3 class="vc-title">Spectral Clustering — ${d.targetCol}</h3>
    <p class="vc-subtitle">k=${d.nClusters ?? d.nCluster}, silhouette=${(d.silhouetteScore ?? 0).toFixed(3)}</p>
  </div>
  <div class="vc-body">
    <div style="display:flex;gap:12px">
      <div id="chart1" style="flex:1;min-height:280px"></div>
      <div id="chart2" style="flex:1;min-height:280px"></div>
    </div>
  </div>
  <script>
    // PC1 vs PC2 by cluster
    Plotly.newPlot('chart1', [
      ${clusterTraces}
    ], {
      ...window.PLOTLY_DARK,
      title: { text: 'PC1 vs PC2 (Cluster)', font: { size: 12, color: '#94a3b8' } },
      xaxis: { ...window.PLOTLY_DARK.xaxis, title: 'PC1' },
      yaxis: { ...window.PLOTLY_DARK.yaxis, title: 'PC2' },
      margin: { l: 40, r: 10, t: 35, b: 40 },
      showlegend: true, legend: { font: { size: 10 } }
    }, { responsive: true });

    // PC1 vs PC2 by target value (heatmap)
    Plotly.newPlot('chart2', [{
      x: ${JSON.stringify(pts.map((p: any) => p.x))},
      y: ${JSON.stringify(pts.map((p: any) => p.y))},
      mode: 'markers',
      type: 'scatter',
      name: '${d.targetCol}',
      marker: {
        color: ${JSON.stringify(pts.map((p: any) => p.target))},
        colorscale: [[0,'#3b82f6'],[1,'#ef4444']],
        cmin: ${targetMin},
        cmax: ${targetMax},
        size: 6,
        colorbar: { title: '${d.targetCol}', titlefont: { size: 10, color: '#94a3b8' }, tickfont: { size: 9, color: '#64748b' } }
      }
    }], {
      ...window.PLOTLY_DARK,
      title: { text: 'PC1 vs PC2 (${d.targetCol})', font: { size: 12, color: '#94a3b8' } },
      xaxis: { ...window.PLOTLY_DARK.xaxis, title: 'PC1' },
      yaxis: { ...window.PLOTLY_DARK.yaxis, title: 'PC2' },
      margin: { l: 40, r: 10, t: 35, b: 40 },
      showlegend: false
    }, { responsive: true });
  <\/script>
</div>`;
}

// ────────────────────────────────────────────────────────────────────────────
// Stratification  (STRATIFY_DATASET)
// ────────────────────────────────────────────────────────────────────────────
function stratificationToHtml(viz: ToolVisualization): string {
  const d = viz.data;
  const fill = viz.config?.color || '#10b981';
  const names = JSON.stringify((d.newColumns || []).map((c: any) => c.name));
  const counts = JSON.stringify((d.newColumns || []).map((c: any) => c.count));

  return `<div class="visualizationCard">
  <div class="vc-header">
    <h3 class="vc-title">Stratification: ${d.targetCol} by ${d.groupCol}</h3>
  </div>
  <div class="vc-body">
    <div id="chart"></div>
  </div>
  <script>
    Plotly.newPlot('chart', [{
      x: ${names},
      y: ${counts},
      type: 'bar',
      name: 'Row Count',
      marker: { color: '${fill}' }
    }], {
      ...window.PLOTLY_DARK,
      xaxis: { ...window.PLOTLY_DARK.xaxis, title: '${d.groupCol}', tickangle: -45 },
      yaxis: { ...window.PLOTLY_DARK.yaxis, title: 'Row Count' },
      margin: { l: 60, r: 20, t: 30, b: 100 }
    }, { responsive: true });
  <\/script>
</div>`;
}
