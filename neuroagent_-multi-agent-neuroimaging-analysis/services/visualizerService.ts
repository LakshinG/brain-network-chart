// services/visualizerService.ts
// Service to connect to the VisualizerAgent backend with streaming support

export interface VisualizerEditRequest {
  user_query: string;
  html: string;
  max_output_chars?: number;
}

export interface VisualizerEditResponse {
  status: 'success' | 'error';
  html?: string;
  message?: string;
  warnings?: string[];
}

// Configuration
const OLLAMA_URL = 'http://localhost:11434';

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Edit visualization HTML with streaming progress updates
 */
export async function editVisualizationHtmlWithStreaming(
  userQuery: string,
  currentHtml: string,
  model: string = 'qwen2.5-coder:32b',
  onProgress: (text: string, done: boolean) => void
): Promise<VisualizerEditResponse> {
  const SYSTEM_PROMPT = `You are a visualization expert. Create charts using Plotly.js or Chart.js.

RULES:
1. Output ONLY the HTML code - no explanations, no markdown
2. Always wrap in: <div class="visualizationCard">...</div>
3. Put <script> tags INSIDE the visualizationCard div
4. Use window.PLOTLY_DARK for Plotly dark theme settings

PLOTLY BAR CHART:
<div class="visualizationCard">
  <div class="vc-header">
    <h3 class="vc-title">Brain Volumes</h3>
  </div>
  <div class="vc-body">
    <div id="chart"></div>
  </div>
  <script>
    Plotly.newPlot('chart', [{
      x: ['Hippocampus', 'Amygdala', 'Thalamus'],
      y: [2850, 1420, 3200],
      type: 'bar',
      marker: { color: ['#3b82f6', '#10b981', '#8b5cf6'] }
    }], {
      ...window.PLOTLY_DARK,
      margin: { l: 50, r: 20, t: 20, b: 80 }
    }, { responsive: true });
  </script>
</div>

PLOTLY SCATTER:
<div class="visualizationCard">
  <div class="vc-header">
    <h3 class="vc-title">Age vs MMSE</h3>
  </div>
  <div class="vc-body">
    <div id="chart"></div>
  </div>
  <script>
    Plotly.newPlot('chart', [{
      x: [55, 60, 65, 70, 75, 80],
      y: [29, 27, 24, 21, 18, 15],
      mode: 'markers',
      type: 'scatter',
      marker: { color: '#3b82f6', size: 10 }
    }], {
      ...window.PLOTLY_DARK,
      xaxis: { ...window.PLOTLY_DARK.xaxis, title: 'Age' },
      yaxis: { ...window.PLOTLY_DARK.yaxis, title: 'MMSE' }
    }, { responsive: true });
  </script>
</div>

PLOTLY PIE:
<div class="visualizationCard">
  <div class="vc-header">
    <h3 class="vc-title">Distribution</h3>
  </div>
  <div class="vc-body">
    <div id="chart"></div>
  </div>
  <script>
    Plotly.newPlot('chart', [{
      values: [45, 35, 20],
      labels: ['CN', 'MCI', 'AD'],
      type: 'pie',
      marker: { colors: ['#10b981', '#f59e0b', '#ef4444'] }
    }], {
      ...window.PLOTLY_DARK
    }, { responsive: true });
  </script>
</div>

CHART.JS BAR:
<div class="visualizationCard">
  <div class="vc-header">
    <h3 class="vc-title">Volumes</h3>
  </div>
  <div class="vc-body">
    <canvas id="chart"></canvas>
  </div>
  <script>
    new Chart(document.getElementById('chart'), {
      type: 'bar',
      data: {
        labels: ['A', 'B', 'C'],
        datasets: [{
          data: [10, 20, 30],
          backgroundColor: ['#3b82f6', '#10b981', '#8b5cf6']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } }
      }
    });
  </script>
</div>

COLORS: #3b82f6 (blue), #10b981 (green), #f59e0b (amber), #ef4444 (red), #8b5cf6 (purple), #06b6d4 (cyan)

Output ONLY the HTML.`;

  const userPrompt = `User request: ${userQuery}

Current HTML:
${currentHtml}`;

  try {
    onProgress('🔄 Connecting to AI model...', false);

    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        stream: true,
        options: { num_predict: 15000 },
      }),
    });

    if (!response.ok) {
      onProgress(`❌ Error: ${response.status}`, true);
      return { status: 'error', message: `Ollama error: ${response.status}` };
    }

    const reader = response.body?.getReader();
    if (!reader) {
      return { status: 'error', message: 'No response stream' };
    }

    const decoder = new TextDecoder();
    let fullResponse = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(line => line.trim());

      for (const line of lines) {
        try {
          const json = JSON.parse(line);
          if (json.message?.content) {
            fullResponse += json.message.content;
            const displayText = fullResponse.length > 500 
              ? '...' + fullResponse.slice(-500) 
              : fullResponse;
            onProgress(displayText, false);
          }
        } catch {
          // Skip non-JSON lines
        }
      }
    }

    onProgress('✅ Processing complete!', true);

    const extractedHtml = extractVisualizationHtml(fullResponse);
    
    if (extractedHtml) {
      return { status: 'success', html: extractedHtml };
    } else {
      return { status: 'error', message: 'Could not extract valid HTML from response' };
    }

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    onProgress(`❌ Error: ${message}`, true);
    return { status: 'error', message };
  }
}

/**
 * Non-streaming version
 */
export async function editVisualizationHtml(
  userQuery: string,
  currentHtml: string,
  model: string = 'qwen2.5-coder:32b'
): Promise<VisualizerEditResponse> {
  return new Promise((resolve) => {
    editVisualizationHtmlWithStreaming(userQuery, currentHtml, model, () => {})
      .then(resolve)
      .catch(error => resolve({ status: 'error', message: error.message || 'Unknown error' }));
  });
}

/**
 * Alias for backwards compatibility
 */
export async function editVisualizationHtmlDirect(
  userQuery: string,
  currentHtml: string,
  model: string = 'qwen2.5-coder:32b'
): Promise<VisualizerEditResponse> {
  return editVisualizationHtml(userQuery, currentHtml, model);
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extract visualization HTML from LLM response
 */
function extractVisualizationHtml(response: string): string | null {
  // Try to find the visualizationCard div
  const cardMatch = response.match(/<div\s+class=["']visualizationCard["'][^>]*>[\s\S]*?<\/div>\s*(?=<div\s+class=["']visualizationCard["']|$)/);
  
  if (cardMatch) {
    let html = cardMatch[0];
    const openDivs = (html.match(/<div/g) || []).length;
    const closeDivs = (html.match(/<\/div>/g) || []).length;
    if (openDivs > closeDivs) {
      html += '</div>'.repeat(openDivs - closeDivs);
    }
    return html.trim();
  }

  // Fallback
  const simpleMatch = response.match(/<div[^>]*class=["'][^"']*visualizationCard[^"']*["'][^>]*>[\s\S]+/);
  if (simpleMatch) {
    let html = simpleMatch[0];
    const openDivs = (html.match(/<div/g) || []).length;
    const closeDivs = (html.match(/<\/div>/g) || []).length;
    if (openDivs > closeDivs) {
      html += '</div>'.repeat(openDivs - closeDivs);
    }
    return html.trim();
  }

  return null;
}

/**
 * Get available Ollama models
 */
export async function getAvailableModels(): Promise<string[]> {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!response.ok) return [];
    const data = await response.json();
    return data.models?.map((m: any) => m.name) || [];
  } catch {
    return [];
  }
}

/**
 * Check if a message should be routed to the visualizer
 */
export function shouldRouteToVisualizer(message: string, hasVisualization: boolean): boolean {
  const lowerMessage = message.toLowerCase();
  
  const strongVizKeywords = [
    'create a chart', 'create chart', 'make a chart', 'make chart',
    'create a plot', 'create plot', 'make a plot', 'make plot',
    'create a graph', 'create graph', 'make a graph', 'make graph',
    'scatter plot', 'bar chart', 'line chart', 'pie chart',
    'histogram', 'heatmap', 'visualization',
    'plotly', 'chart.js',
    'create visualization', 'make visualization',
    'draw a', 'plot a', 'graph showing', 'chart showing'
  ];
  
  if (strongVizKeywords.some(keyword => lowerMessage.includes(keyword))) {
    return true;
  }
  
  if (hasVisualization) {
    const editKeywords = [
      'change the', 'update the', 'modify the', 'edit the',
      'add a', 'remove the', 'make the', 'set the',
      'title', 'color', 'label', 'legend',
      'bigger', 'smaller', 'larger',
      'insight', 'annotation'
    ];
    return editKeywords.some(keyword => lowerMessage.includes(keyword));
  }
  
  return false;
}

/**
 * Alias for shouldRouteToVisualizer (backwards compatibility)
 */
export function isVisualizationEditRequest(message: string, hasVisualization: boolean): boolean {
  return shouldRouteToVisualizer(message, hasVisualization);
}

/**
 * Get the currently selected/active VIS_HTML visualization
 */
export function getActiveHtmlVisualization(
  visualizations: any[],
  selectedId?: string
): any | null {
  if (selectedId) {
    const selected = visualizations.find(v => v.messageId === selectedId);
    if (selected && selected.type === 'VIS_HTML') {
      return selected;
    }
  }
  return visualizations.find(v => v.type === 'VIS_HTML') || null;
}