import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Code, Maximize2, Minimize2, RefreshCw, Download } from 'lucide-react';
import CodeEditorModal from './CodeEditorModal';

interface HtmlVisualizationRendererProps {
  html?: string;
  heightPx?: number;
  onHtmlChange?: (newHtml: string) => void;
  className?: string;
}

const DEFAULT_HEIGHT = 400;
const EXPANDED_HEIGHT = 650;

const DEFAULT_HTML = `<div class="visualizationCard">
  <div class="vc-header">
    <h3 class="vc-title">Sample Chart</h3>
    <p class="vc-subtitle">Select a chart to edit it</p>
  </div>
  <div class="vc-body">
    <div id="chart"></div>
  </div>
  <script>
    Plotly.newPlot('chart', [{
      x: ['A', 'B', 'C', 'D'],
      y: [10, 15, 13, 17],
      type: 'bar',
      marker: { color: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'] }
    }], {
      ...window.PLOTLY_DARK,
      margin: { l: 40, r: 20, t: 20, b: 40 }
    }, { responsive: true });
  </script>
</div>`;

function createHtmlDocument(userHtml: string, chartHeight: number): string {
  // The userHtml will be inserted directly into the body, no escaping needed
  // since it contains actual script tags that should run
  
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<script src="https://cdn.plot.ly/plotly-2.27.0.min.js"><\/script>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"><\/script>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { 
  font-family: system-ui, -apple-system, sans-serif; 
  background: transparent; 
  color: #e2e8f0; 
  padding: 8px;
}
.visualizationCard { 
  background: #0f172a; 
  border-radius: 0.75rem; 
  border: 1px solid #334155; 
  padding: 1rem; 
}
.vc-header { margin-bottom: 0.75rem; }
.vc-title { color: #f1f5f9; font-weight: 600; font-size: 1.1rem; margin: 0; }
.vc-subtitle { color: #94a3b8; font-size: 0.8rem; margin-top: 0.25rem; }
.vc-body { margin-top: 0.75rem; min-height: ${chartHeight}px; }
.vc-footer { margin-top: 1rem; padding-top: 0.75rem; border-top: 1px solid #334155; font-size: 0.75rem; color: #64748b; }
.vc-insight { 
  background: #1e1b4b; 
  border: 1px solid #3730a3; 
  border-left: 3px solid #6366f1; 
  border-radius: 0.5rem; 
  padding: 0.75rem 1rem; 
  margin-top: 0.75rem; 
  color: #c7d2fe; 
  font-size: 0.875rem; 
}
#chart, [id^="chart"], .chart-container { width: 100%; min-height: ${chartHeight}px; }
canvas { width: 100% !important; max-height: ${chartHeight}px; }
.js-plotly-plot { width: 100% !important; }
.js-plotly-plot .plotly .modebar { right: 0 !important; top: 0 !important; }
.js-plotly-plot .plotly .modebar-btn path { fill: #94a3b8 !important; }
.js-plotly-plot .plotly .modebar-btn:hover path { fill: #e2e8f0 !important; }

.flex { display: flex; }
.flex-1 { flex: 1 1 0% !important; }
.items-center { align-items: center; }
.justify-between { justify-content: space-between; }
.gap-2 { gap: 0.5rem; }
.gap-3 { gap: 0.75rem; }
.p-4 { padding: 1rem; }
.mt-3 { margin-top: 0.75rem; }
.space-y-3 > * + * { margin-top: 0.75rem; }
.w-full { width: 100%; }
.w-20 { width: 5rem; }
.h-6 { height: 1.5rem !important; }
.h-full { height: 100% !important; }
.bg-slate-800 { background-color: #1e293b !important; }
.bg-blue-500 { background-color: #3b82f6 !important; }
.bg-green-500 { background-color: #22c55e !important; }
.bg-emerald-500 { background-color: #10b981 !important; }
.bg-amber-500 { background-color: #f59e0b !important; }
.bg-red-500 { background-color: #ef4444 !important; }
.bg-purple-500 { background-color: #a855f7 !important; }
.bg-cyan-500 { background-color: #06b6d4 !important; }
.text-slate-300 { color: #cbd5e1; }
.text-slate-400 { color: #94a3b8; }
.text-xs { font-size: 0.75rem; }
.text-right { text-align: right; }
.rounded-full { border-radius: 9999px !important; }
.overflow-hidden { overflow: hidden !important; }

[data-editable]:hover { 
  outline: 1px dashed #6366f1;
  cursor: pointer;
}
[contenteditable="true"] { 
  outline: 2px solid #6366f1 !important; 
  background: rgba(99,102,241,0.2) !important;
  border-radius: 3px;
}
</style>
<script>
// Define PLOTLY_DARK theme BEFORE body loads
window.PLOTLY_DARK = {
  paper_bgcolor: 'rgba(0,0,0,0)',
  plot_bgcolor: 'rgba(15,23,42,0.3)',
  font: { color: '#e2e8f0', family: 'system-ui, sans-serif', size: 12 },
  xaxis: { 
    color: '#94a3b8', 
    gridcolor: '#334155', 
    linecolor: '#475569',
    tickfont: { color: '#94a3b8' },
    zerolinecolor: '#475569'
  },
  yaxis: { 
    color: '#94a3b8', 
    gridcolor: '#334155', 
    linecolor: '#475569',
    tickfont: { color: '#94a3b8' },
    zerolinecolor: '#475569'
  },
  legend: { 
    bgcolor: 'rgba(30,41,59,0.9)', 
    bordercolor: '#475569',
    font: { color: '#e2e8f0' }
  },
  margin: { l: 50, r: 30, t: 40, b: 50 },
  colorway: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#f97316']
};

// Chart.js defaults
if (typeof Chart !== 'undefined') {
  Chart.defaults.color = '#e2e8f0';
  Chart.defaults.borderColor = '#334155';
}
<\/script>
</head>
<body>
<script>
// Global error handler — show script errors visually instead of blank chart
window.onerror = function(msg, src, line, col, err) {
  var body = document.querySelector('.vc-body') || document.body;
  var div = document.createElement('div');
  div.style.cssText = 'background:#1e1b4b;border:1px solid #ef4444;border-left:3px solid #ef4444;border-radius:0.5rem;padding:0.75rem 1rem;margin:0.75rem 0;color:#fca5a5;font-size:0.8rem;white-space:pre-wrap;font-family:monospace;';
  div.textContent = '\\u26A0 Chart rendering error:\\n' + msg + (line ? ' (line ' + line + ')' : '');
  body.appendChild(div);
};
<\/script>
${userHtml}
<script>
// Setup editable elements
document.querySelectorAll('.vc-title, .vc-subtitle').forEach(function(el) {
  el.setAttribute('data-editable', 'true');
});

// Click to edit
document.addEventListener('click', function(e) {
  var el = e.target.closest('[data-editable]');
  if (el && el.contentEditable !== 'true') {
    el.contentEditable = 'true';
    el.focus();
    document.execCommand('selectAll', false, null);
  }
});

// Save on blur
document.addEventListener('blur', function(e) {
  if (e.target.contentEditable === 'true') {
    e.target.contentEditable = 'false';
    var card = document.querySelector('.visualizationCard');
    if (card) {
      window.parent.postMessage({ type: 'html-update', html: card.outerHTML }, '*');
    }
  }
}, true);

// Keyboard handling
document.addEventListener('keydown', function(e) {
  if (e.target.contentEditable === 'true') {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      e.target.blur();
    }
    if (e.key === 'Escape') {
      e.target.blur();
    }
  }
});

// Send height to parent
function sendHeight() {
  var card = document.querySelector('.visualizationCard');
  var h = card ? card.offsetHeight + 24 : document.body.scrollHeight;
  window.parent.postMessage({ type: 'height-update', height: h }, '*');
}

window.addEventListener('load', function() {
  setTimeout(sendHeight, 220);
});
setTimeout(sendHeight, 600);
setTimeout(sendHeight, 1500);

if (typeof ResizeObserver !== 'undefined') {
  new ResizeObserver(function() {
    sendHeight();
  }).observe(document.body);
}
<\/script>
</body>
</html>`;
}

export const HtmlVisualizationRenderer: React.FC<HtmlVisualizationRendererProps> = ({
  html,
  heightPx = DEFAULT_HEIGHT,
  onHtmlChange,
  className = '',
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showCodeEditor, setShowCodeEditor] = useState(false);
  const [autoHeight, setAutoHeight] = useState<number | null>(null);
  const [iframeKey, setIframeKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const currentHtml = html || DEFAULT_HTML;
  const chartHeight = isExpanded ? 450 : 280;
  
  const iframeSrcDoc = useMemo(() => {
    return createHtmlDocument(currentHtml, chartHeight);
  }, [currentHtml, chartHeight]);

  // Listen for messages from iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'height-update' && !isExpanded) {
        setAutoHeight(Math.min(800, Math.max(250, event.data.height)));
      }
      if (event.data?.type === 'html-update' && onHtmlChange) {
        onHtmlChange(event.data.html);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [isExpanded, onHtmlChange]);

  // Reset height when html changes
  useEffect(() => { 
    setAutoHeight(null); 
  }, [html]);

  // Refresh iframe when expanded
  useEffect(() => { 
    setIframeKey(k => k + 1); 
  }, [isExpanded]);

  const handleRefresh = useCallback(() => {
    setAutoHeight(null);
    setIframeKey(k => k + 1);
  }, []);

  const handleSaveCode = useCallback((newHtml: string) => {
    if (onHtmlChange) {
      onHtmlChange(newHtml);
    }
    setShowCodeEditor(false);
    // Refresh iframe to show changes
    setTimeout(() => setIframeKey(k => k + 1), 50);
  }, [onHtmlChange]);

  const handleDownload = useCallback(() => {
    const iframeWindow = iframeRef.current?.contentWindow as any;
    const doc = iframeRef.current?.contentDocument;
    if (!iframeWindow || !doc) return;

    // Try Plotly SVG export first
    const plotlyDiv = doc.querySelector('.js-plotly-plot');
    if (plotlyDiv && iframeWindow.Plotly) {
      iframeWindow.Plotly.toImage(plotlyDiv, { format: 'svg', width: 1200, height: 800 })
        .then((dataUrl: string) => {
          const a = document.createElement('a');
          a.href = dataUrl;
          a.download = 'visualization.svg';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        });
      return;
    }

    // Try Canvas (Chart.js) — download as PNG
    const canvas = doc.querySelector('canvas') as HTMLCanvasElement | null;
    if (canvas) {
      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = 'visualization.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }

    // Fallback: any SVG element
    const svg = doc.querySelector('svg');
    if (svg) {
      const clone = svg.cloneNode(true) as SVGSVGElement;
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      const svgData = new XMLSerializer().serializeToString(clone);
      const blob = new Blob([svgData], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'visualization.svg';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }, []);

  const effectiveHeight = isExpanded ? EXPANDED_HEIGHT : (autoHeight || heightPx);

  return (
    <div className={`relative ${className}`}>
      {/* Toolbar */}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5">
        <div className="px-2 py-0.5 rounded bg-slate-800/90 text-slate-400 text-xs font-mono">
          {Math.round(effectiveHeight)}px
        </div>

        {/* Code Editor Button */}
        {onHtmlChange && (
          <button
            onClick={() => setShowCodeEditor(true)}
            className="p-1.5 rounded bg-slate-800/90 text-slate-300 hover:bg-indigo-600 hover:text-white transition-colors"
            title="Edit HTML Code"
          >
            <Code className="w-4 h-4" />
          </button>
        )}

        {/* Download Button */}
        <button
          onClick={handleDownload}
          className="p-1.5 rounded bg-slate-800/90 text-slate-300 hover:bg-emerald-600 hover:text-white transition-colors"
          title="Download SVG / PNG"
        >
          <Download className="w-4 h-4" />
        </button>

        {/* Refresh Button */}
        <button
          onClick={handleRefresh}
          className="p-1.5 rounded bg-slate-800/90 text-slate-300 hover:bg-slate-700 transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>

        {/* Expand Button */}
        <button
          onClick={() => setIsExpanded(e => !e)}
          className={`p-1.5 rounded transition-colors ${
            isExpanded ? 'bg-indigo-600 text-white' : 'bg-slate-800/90 text-slate-300 hover:bg-slate-700'
          }`}
          title={isExpanded ? 'Collapse' : 'Expand'}
        >
          {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>

      {/* Iframe */}
      <iframe
        ref={iframeRef}
        key={iframeKey}
        className={`w-full rounded-lg border transition-all duration-300 ${
          isExpanded ? 'border-indigo-500 shadow-lg shadow-indigo-500/20' : 'border-slate-700'
        }`}
        style={{ height: effectiveHeight, minHeight: 250, background: '#020617' }}
        sandbox="allow-scripts allow-same-origin"
        srcDoc={iframeSrcDoc}
        title="Visualization"
      />

      {/* Hint */}
      {onHtmlChange && (
        <div className="absolute bottom-2 left-2 text-xs text-slate-500 bg-slate-900/80 rounded px-2 py-0.5">
          Click titles to edit • Use code button for full HTML
        </div>
      )}

      {/* Code Editor Modal */}
      <CodeEditorModal
        isOpen={showCodeEditor}
        onClose={() => setShowCodeEditor(false)}
        html={currentHtml}
        onSave={handleSaveCode}
        title="Edit Visualization HTML"
      />
    </div>
  );
};

export default HtmlVisualizationRenderer;