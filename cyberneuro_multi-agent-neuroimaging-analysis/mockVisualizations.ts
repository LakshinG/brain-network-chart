// mockVisualizations.ts
// Mock VIS_HTML visualizations with realistic neuroimaging data for testing
// Location: Put this in your project root or a utils/ folder

import { ToolVisualization, VisualizationType } from './types';

/**
 * Sample VIS_HTML visualizations for testing the VisualizerAgent
 */
export const MOCK_VIS_HTML_VISUALIZATIONS: ToolVisualization[] = [
  {
    type: VisualizationType.VIS_HTML,
    title: 'Amyloid SUVR by Region',
    messageId: 'mock-viz-1',
    data: {
      html: `<div class="visualizationCard bg-slate-900 rounded-xl border border-slate-700 p-4">
  <div class="vc-header">
    <h3 class="vc-title text-slate-100 font-semibold text-lg">Amyloid SUVR by Brain Region</h3>
    <p class="vc-subtitle text-slate-400 text-xs mt-1">UK Biobank Neuroimaging Study (n=1,247)</p>
  </div>
  
  <div class="vc-body mt-4">
    <!-- Bar Chart Visualization -->
    <div class="space-y-3">
      <div class="flex items-center gap-3">
        <span class="text-xs text-slate-400 w-24 text-right">Frontal</span>
        <div class="flex-1 bg-slate-800 rounded-full h-6 overflow-hidden">
          <div class="h-full bg-gradient-to-r from-sky-500 to-sky-400 rounded-full flex items-center justify-end pr-2" style="width: 78%">
            <span class="text-xs text-white font-medium">1.42</span>
          </div>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-xs text-slate-400 w-24 text-right">Parietal</span>
        <div class="flex-1 bg-slate-800 rounded-full h-6 overflow-hidden">
          <div class="h-full bg-gradient-to-r from-sky-500 to-sky-400 rounded-full flex items-center justify-end pr-2" style="width: 71%">
            <span class="text-xs text-white font-medium">1.31</span>
          </div>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-xs text-slate-400 w-24 text-right">Temporal</span>
        <div class="flex-1 bg-slate-800 rounded-full h-6 overflow-hidden">
          <div class="h-full bg-gradient-to-r from-sky-500 to-sky-400 rounded-full flex items-center justify-end pr-2" style="width: 65%">
            <span class="text-xs text-white font-medium">1.19</span>
          </div>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-xs text-slate-400 w-24 text-right">Occipital</span>
        <div class="flex-1 bg-slate-800 rounded-full h-6 overflow-hidden">
          <div class="h-full bg-gradient-to-r from-sky-500 to-sky-400 rounded-full flex items-center justify-end pr-2" style="width: 52%">
            <span class="text-xs text-white font-medium">0.95</span>
          </div>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-xs text-slate-400 w-24 text-right">Cerebellum</span>
        <div class="flex-1 bg-slate-800 rounded-full h-6 overflow-hidden">
          <div class="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full flex items-center justify-end pr-2" style="width: 45%">
            <span class="text-xs text-white font-medium">0.82</span>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Legend -->
    <div class="flex items-center justify-center gap-6 mt-4 pt-3 border-t border-slate-700">
      <div class="flex items-center gap-2">
        <div class="w-3 h-3 rounded-full bg-sky-500"></div>
        <span class="text-xs text-slate-400">Above threshold (>1.0)</span>
      </div>
      <div class="flex items-center gap-2">
        <div class="w-3 h-3 rounded-full bg-emerald-500"></div>
        <span class="text-xs text-slate-400">Normal (<1.0)</span>
      </div>
    </div>
  </div>
  
  <div class="vc-footer mt-4 pt-3 border-t border-slate-700 text-xs text-slate-500 text-center">
    SUVR = Standardized Uptake Value Ratio | Reference: Cerebellar gray matter
  </div>
</div>`,
      heightPx: 420
    }
  },
  
  {
    type: VisualizationType.VIS_HTML,
    title: 'Age vs Cognitive Score',
    messageId: 'mock-viz-2',
    data: {
      html: `<div class="visualizationCard bg-slate-900 rounded-xl border border-slate-700 p-4">
  <div class="vc-header flex justify-between items-start">
    <div>
      <h3 class="vc-title text-slate-100 font-semibold text-lg">Age vs Cognitive Performance</h3>
      <p class="vc-subtitle text-slate-400 text-xs mt-1">Montreal Cognitive Assessment (MoCA)</p>
    </div>
    <div class="text-right">
      <div class="text-xs text-slate-500">Correlation</div>
      <div class="text-lg font-bold text-amber-400">r = -0.42</div>
      <div class="text-xs text-slate-500">p < 0.001</div>
    </div>
  </div>
  
  <div class="vc-body mt-4">
    <!-- Scatter Plot Area -->
    <div class="relative h-64 bg-slate-950 rounded-lg border border-slate-700 p-4">
      <!-- Y-axis label -->
      <div class="absolute -left-1 top-1/2 -translate-y-1/2 -rotate-90 text-xs text-slate-500 whitespace-nowrap">
        MoCA Score
      </div>
      
      <!-- Grid lines -->
      <div class="absolute inset-4 flex flex-col justify-between">
        <div class="border-b border-slate-800 border-dashed"></div>
        <div class="border-b border-slate-800 border-dashed"></div>
        <div class="border-b border-slate-800 border-dashed"></div>
        <div class="border-b border-slate-800 border-dashed"></div>
      </div>
      
      <!-- Data points (simulated scatter) -->
      <div class="absolute inset-4">
        <div class="absolute w-2 h-2 rounded-full bg-sky-400 opacity-70" style="left: 10%; bottom: 85%"></div>
        <div class="absolute w-2 h-2 rounded-full bg-sky-400 opacity-70" style="left: 15%; bottom: 80%"></div>
        <div class="absolute w-2 h-2 rounded-full bg-sky-400 opacity-70" style="left: 12%; bottom: 75%"></div>
        <div class="absolute w-2 h-2 rounded-full bg-sky-400 opacity-70" style="left: 20%; bottom: 82%"></div>
        <div class="absolute w-2 h-2 rounded-full bg-sky-400 opacity-70" style="left: 25%; bottom: 78%"></div>
        <div class="absolute w-2 h-2 rounded-full bg-sky-400 opacity-70" style="left: 30%; bottom: 70%"></div>
        <div class="absolute w-2 h-2 rounded-full bg-sky-400 opacity-70" style="left: 35%; bottom: 72%"></div>
        <div class="absolute w-2 h-2 rounded-full bg-sky-400 opacity-70" style="left: 40%; bottom: 65%"></div>
        <div class="absolute w-2 h-2 rounded-full bg-sky-400 opacity-70" style="left: 45%; bottom: 60%"></div>
        <div class="absolute w-2 h-2 rounded-full bg-sky-400 opacity-70" style="left: 50%; bottom: 55%"></div>
        <div class="absolute w-2 h-2 rounded-full bg-sky-400 opacity-70" style="left: 55%; bottom: 58%"></div>
        <div class="absolute w-2 h-2 rounded-full bg-sky-400 opacity-70" style="left: 60%; bottom: 50%"></div>
        <div class="absolute w-2 h-2 rounded-full bg-sky-400 opacity-70" style="left: 65%; bottom: 45%"></div>
        <div class="absolute w-2 h-2 rounded-full bg-sky-400 opacity-70" style="left: 70%; bottom: 42%"></div>
        <div class="absolute w-2 h-2 rounded-full bg-sky-400 opacity-70" style="left: 75%; bottom: 38%"></div>
        <div class="absolute w-2 h-2 rounded-full bg-sky-400 opacity-70" style="left: 80%; bottom: 35%"></div>
        <div class="absolute w-2 h-2 rounded-full bg-sky-400 opacity-70" style="left: 85%; bottom: 30%"></div>
        <div class="absolute w-2 h-2 rounded-full bg-sky-400 opacity-70" style="left: 90%; bottom: 25%"></div>
        
        <!-- Trend line -->
        <div class="absolute inset-0">
          <svg class="w-full h-full" preserveAspectRatio="none">
            <line x1="5%" y1="15%" x2="95%" y2="75%" stroke="#f59e0b" stroke-width="2" stroke-dasharray="5,5" opacity="0.7"/>
          </svg>
        </div>
      </div>
      
      <!-- X-axis label -->
      <div class="absolute bottom-0 left-1/2 -translate-x-1/2 text-xs text-slate-500">
        Age (years)
      </div>
      
      <!-- Axis values -->
      <div class="absolute left-4 top-4 text-xs text-slate-600">30</div>
      <div class="absolute left-4 bottom-4 text-xs text-slate-600">15</div>
      <div class="absolute right-4 bottom-1 text-xs text-slate-600">50 → 85</div>
    </div>
  </div>
  
  <div class="vc-insight mt-3" style="background: #1e1b4b; border: 1px solid #3730a3; border-left: 3px solid #6366f1; border-radius: 0.5rem; padding: 0.75rem 1rem;">
    <strong style="color: #a5b4fc;">Key Finding:</strong>
    <span style="color: #c7d2fe;"> Moderate negative correlation suggests cognitive decline with age. Effect is most pronounced after age 70.</span>
  </div>
</div>`,
      heightPx: 480
    }
  },

  {
    type: VisualizationType.VIS_HTML,
    title: 'Diagnosis Distribution',
    messageId: 'mock-viz-3',
    data: {
      html: `<div class="visualizationCard bg-slate-900 rounded-xl border border-slate-700 p-4">
  <div class="vc-header">
    <h3 class="vc-title text-slate-100 font-semibold text-lg text-center">Patient Diagnosis Distribution</h3>
    <p class="vc-subtitle text-slate-400 text-xs text-center mt-1">Clinical Classification (N = 2,458)</p>
  </div>
  
  <div class="vc-body mt-4">
    <div class="grid grid-cols-2 gap-4">
      <!-- Pie Chart Representation -->
      <div class="flex items-center justify-center">
        <div class="relative w-40 h-40">
          <!-- Pie segments using conic-gradient -->
          <div class="w-full h-full rounded-full" style="background: conic-gradient(
            #22c55e 0deg 180deg,
            #f59e0b 180deg 252deg,
            #ef4444 252deg 306deg,
            #8b5cf6 306deg 360deg
          );"></div>
          <!-- Center hole -->
          <div class="absolute inset-6 bg-slate-900 rounded-full flex items-center justify-center">
            <div class="text-center">
              <div class="text-2xl font-bold text-slate-100">2,458</div>
              <div class="text-xs text-slate-400">Total</div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Legend & Stats -->
      <div class="flex flex-col justify-center space-y-3">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <div class="w-3 h-3 rounded-full bg-emerald-500"></div>
            <span class="text-sm text-slate-300">Healthy Control</span>
          </div>
          <div class="text-right">
            <span class="text-sm font-semibold text-slate-100">1,229</span>
            <span class="text-xs text-slate-500 ml-1">(50%)</span>
          </div>
        </div>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <div class="w-3 h-3 rounded-full bg-amber-500"></div>
            <span class="text-sm text-slate-300">MCI</span>
          </div>
          <div class="text-right">
            <span class="text-sm font-semibold text-slate-100">492</span>
            <span class="text-xs text-slate-500 ml-1">(20%)</span>
          </div>
        </div>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <div class="w-3 h-3 rounded-full bg-red-500"></div>
            <span class="text-sm text-slate-300">AD</span>
          </div>
          <div class="text-right">
            <span class="text-sm font-semibold text-slate-100">369</span>
            <span class="text-xs text-slate-500 ml-1">(15%)</span>
          </div>
        </div>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <div class="w-3 h-3 rounded-full bg-violet-500"></div>
            <span class="text-sm text-slate-300">Other</span>
          </div>
          <div class="text-right">
            <span class="text-sm font-semibold text-slate-100">368</span>
            <span class="text-xs text-slate-500 ml-1">(15%)</span>
          </div>
        </div>
      </div>
    </div>
  </div>
  
  <div class="vc-footer mt-4 pt-3 border-t border-slate-700 text-xs text-slate-500">
    <div class="flex justify-between">
      <span>MCI = Mild Cognitive Impairment</span>
      <span>AD = Alzheimer's Disease</span>
    </div>
  </div>
</div>`,
      heightPx: 380
    }
  },

  {
    type: VisualizationType.VIS_HTML,
    title: 'Summary Statistics',
    messageId: 'mock-viz-4',
    data: {
      html: `<div class="visualizationCard bg-slate-900 rounded-xl border border-slate-700 p-4">
  <div class="vc-header">
    <h3 class="vc-title text-slate-100 font-semibold text-lg">Summary Statistics</h3>
    <p class="vc-subtitle text-slate-400 text-xs mt-1">Key Biomarker Measurements</p>
  </div>
  
  <div class="vc-body mt-4">
    <div class="grid grid-cols-2 gap-4">
      <!-- Stat Card 1 -->
      <div class="bg-slate-800 rounded-lg p-4 border border-slate-700">
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs text-slate-400 uppercase tracking-wide">Amyloid SUVR</span>
          <span class="text-xs px-2 py-0.5 rounded bg-sky-900 text-sky-300">Primary</span>
        </div>
        <div class="text-2xl font-bold text-slate-100">1.24</div>
        <div class="text-xs text-slate-500 mt-1">± 0.31 SD</div>
        <div class="mt-2 flex items-center gap-1">
          <span class="text-xs text-emerald-400">▲ 12%</span>
          <span class="text-xs text-slate-500">vs control</span>
        </div>
      </div>
      
      <!-- Stat Card 2 -->
      <div class="bg-slate-800 rounded-lg p-4 border border-slate-700">
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs text-slate-400 uppercase tracking-wide">Tau PET</span>
          <span class="text-xs px-2 py-0.5 rounded bg-amber-900 text-amber-300">Secondary</span>
        </div>
        <div class="text-2xl font-bold text-slate-100">1.08</div>
        <div class="text-xs text-slate-500 mt-1">± 0.22 SD</div>
        <div class="mt-2 flex items-center gap-1">
          <span class="text-xs text-emerald-400">▲ 8%</span>
          <span class="text-xs text-slate-500">vs control</span>
        </div>
      </div>
      
      <!-- Stat Card 3 -->
      <div class="bg-slate-800 rounded-lg p-4 border border-slate-700">
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs text-slate-400 uppercase tracking-wide">Hippocampal Vol</span>
          <span class="text-xs px-2 py-0.5 rounded bg-violet-900 text-violet-300">MRI</span>
        </div>
        <div class="text-2xl font-bold text-slate-100">3,142</div>
        <div class="text-xs text-slate-500 mt-1">± 412 mm³</div>
        <div class="mt-2 flex items-center gap-1">
          <span class="text-xs text-red-400">▼ 15%</span>
          <span class="text-xs text-slate-500">vs control</span>
        </div>
      </div>
      
      <!-- Stat Card 4 -->
      <div class="bg-slate-800 rounded-lg p-4 border border-slate-700">
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs text-slate-400 uppercase tracking-wide">MoCA Score</span>
          <span class="text-xs px-2 py-0.5 rounded bg-emerald-900 text-emerald-300">Cognitive</span>
        </div>
        <div class="text-2xl font-bold text-slate-100">24.6</div>
        <div class="text-xs text-slate-500 mt-1">± 4.2 pts</div>
        <div class="mt-2 flex items-center gap-1">
          <span class="text-xs text-red-400">▼ 3.2</span>
          <span class="text-xs text-slate-500">vs control</span>
        </div>
      </div>
    </div>
  </div>
  
  <div class="vc-footer mt-4 pt-3 border-t border-slate-700 flex justify-between items-center">
    <span class="text-xs text-slate-500">Last updated: Feb 2025</span>
    <span class="text-xs text-slate-500">Source: UK Biobank</span>
  </div>
</div>`,
      heightPx: 420
    }
  }
];

/**
 * Get a single mock visualization by index (0-3)
 */
export function getMockVisualization(index: number = 0): ToolVisualization {
  return MOCK_VIS_HTML_VISUALIZATIONS[index % MOCK_VIS_HTML_VISUALIZATIONS.length];
}

/**
 * Get all mock visualizations
 */
export function getAllMockVisualizations(): ToolVisualization[] {
  return MOCK_VIS_HTML_VISUALIZATIONS;
}
