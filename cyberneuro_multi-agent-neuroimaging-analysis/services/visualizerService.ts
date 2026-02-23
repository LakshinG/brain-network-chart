// services/visualizerService.ts
// Service to edit Recharts chart code via LLM — works on exact JSX code strings

export interface ChartEditResult {
  status: 'success' | 'error';
  /** Modified Recharts JSX code string */
  code?: string;
  message?: string;
}

// Configuration
const OLLAMA_URL = 'http://localhost:11434';

// ============================================================================
// PROGRAMMATIC EDITS — handle common operations without LLM
// ============================================================================

/**
 * Try to handle the user's edit request programmatically (no LLM needed).
 * Returns the modified code string if handled, or null to fall through to LLM.
 */
export function tryProgrammaticEdit(
  query: string,
  currentCode: string
): string | null {
  // Swap / switch / flip x and y axes
  if (/(?:swap|switch|flip|exchange|reverse|invert)\s+(?:the\s+)?(?:x\s*(?:and|&|with|,)\s*y|y\s*(?:and|&|with|,)\s*x|axes)/i.test(query)) {
    return swapAxesInCode(currentCode);
  }
  return null;
}

/**
 * Programmatically swap x and y axes in Recharts JSX code.
 * Swaps XAxis/YAxis label values the axis references.
 */
function swapAxesInCode(code: string): string | null {
  // Extract current X and Y axis label values
  const xLabelMatch = code.match(/<XAxis[\s\S]*?label=\{\{[^}]*value:\s*"([^"]*)"[^}]*\}\}/);
  const yLabelMatch = code.match(/<YAxis[\s\S]*?label=\{\{[^}]*value:\s*"([^"]*)"[^}]*\}\}/);

  if (!xLabelMatch || !yLabelMatch) return null;

  const xLabel = xLabelMatch[1];
  const yLabel = yLabelMatch[1];

  // Replace label values by swapping them
  let newCode = code;

  // Swap X axis label to Y's value
  newCode = newCode.replace(
    /(<XAxis[\s\S]*?label=\{\{[^}]*value:\s*)"[^"]*"/,
    `$1"${yLabel}"`
  );

  // Swap Y axis label to X's value
  newCode = newCode.replace(
    /(<YAxis[\s\S]*?label=\{\{[^}]*value:\s*)"[^"]*"/,
    `$1"${xLabel}"`
  );

  // Swap name= attributes on XAxis/YAxis
  const xNameMatch = code.match(/<XAxis[\s\S]*?name="([^"]*)"/);
  const yNameMatch = code.match(/<YAxis[\s\S]*?name="([^"]*)"/);

  if (xNameMatch && yNameMatch) {
    const xName = xNameMatch[1];
    const yName = yNameMatch[1];
    newCode = newCode.replace(
      /(<XAxis[\s\S]*?)name="[^"]*"/,
      `$1name="${yName}"`
    );
    newCode = newCode.replace(
      /(<YAxis[\s\S]*?)name="[^"]*"/,
      `$1name="${xName}"`
    );
  }

  // Swap "X vs Y" in title if present
  const titleMatch = newCode.match(/(\w[\w\s]*?)\s+vs\s+(\w[\w\s]*?)(?=\s*[(<"])/);
  if (titleMatch) {
    const [fullMatch, a, b] = titleMatch;
    newCode = newCode.replace(fullMatch, `${b.trim()} vs ${a.trim()}`);
  }

  // Also swap dataKey on the series data if they reference x/y
  // Swap data references: data.series → needs x/y swap in data scope too
  // This is handled by prepareDataScope at render time, so we swap
  // the data reference: data[i].dataPoints with swapped x/y happens in scope

  return newCode;
}

// ============================================================================
// LLM-BASED CODE EDITING — sends exact Recharts JSX to LLM
// ============================================================================

const CODE_EDIT_SYSTEM_PROMPT = `You are a Recharts code editor. You receive the exact Recharts JSX code that renders a chart and the user's edit request. You must return the complete modified JSX code with ONLY the requested changes applied.

CRITICAL RULES:
1. Return ONLY the modified JSX code — no explanations, no markdown fences, no extra text before or after the code.
2. Keep ALL existing code exactly as-is except for the specific change requested.
3. Do NOT change data references (e.g. data.series[0].dataPoints, data.stats). These refer to runtime variables.
4. Do NOT remove any existing components, props, or styling unless the user explicitly asks.
5. The code is a single JSX expression (starts with <div> or similar). Keep it that way.
6. Available Recharts components in scope: ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, Legend, ComposedChart, Line, ZAxis, Cell.
7. The \`data\` variable is available in scope — it contains the chart's data. Do not define it.
8. Use dark theme colors (slate backgrounds, light text) consistent with the existing code.
9. For color changes, use hex codes like "#3b82f6".
10. If you cannot fulfill the request, return the original code unchanged.

IMPORTANT: The code references a \`data\` scope variable. Common data fields include:
- data.title, data.xLabel, data.yLabel — chart text
- data.displaySeries — array of {name, r, p, n, color, displayPoints, regressionLine}
- data.xDomain, data.yDomain — axis domains
- data.stats — bar chart data
- data.chartData — line chart data
- data.fill — primary fill color
Do NOT redefine or shadow the \`data\` variable.

EXAMPLES OF VALID CHANGES:
- Changing title: replace {data.title} with a string like "New Title"
- Changing fill colors on <Scatter>, <Bar>, <Line> components  
- Changing axis label: replace {data.xLabel} with "New Label"
- Adding a new <Line> or <Bar> component referencing existing data keys
- Changing strokeWidth, fontSize, margin values
- Adding or modifying <Legend>, <Tooltip>, grid properties

Return ONLY the complete modified JSX code.`;

/**
 * Edit chart code via LLM with streaming progress.
 */
export async function editChartWithStreaming(
  userQuery: string,
  currentCode: string,
  model: string = 'qwen2.5-coder:32b',
  onProgress: (text: string, done: boolean) => void
): Promise<ChartEditResult> {
  const userPrompt = `User request: ${userQuery}

Current Recharts JSX code:
${currentCode}

Return the complete modified JSX code with ONLY the requested change applied. Return ONLY the code.`;

  try {
    onProgress('🔄 Connecting to AI model...', false);

    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: CODE_EDIT_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        stream: true,
        options: { num_predict: 8000 },
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
            onProgress(fullResponse.length > 300 ? '...' + fullResponse.slice(-300) : fullResponse, false);
          }
        } catch {
          // Skip non-JSON lines
        }
      }
    }

    onProgress('✅ Processing complete!', true);

    // Extract the JSX code from the response
    const code = extractCodeFromResponse(fullResponse);
    if (!code) {
      return { status: 'error', message: 'Could not extract JSX code from LLM response' };
    }

    return { status: 'success', code };

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    onProgress(`❌ Error: ${message}`, true);
    return { status: 'error', message };
  }
}

/**
 * Extract JSX code from LLM response.
 * Handles: raw JSX, code fences, thinking tags, extra explanation text.
 */
function extractCodeFromResponse(response: string): string | null {
  // Strip thinking tags if present
  let cleaned = response.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // Try code fences first (```jsx, ```tsx, ```)
  const fenceMatch = cleaned.match(/```(?:jsx|tsx|javascript|js)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    const code = fenceMatch[1].trim();
    if (code.startsWith('<')) return code;
  }

  // Try to find the JSX directly: find the first <div or <ResponsiveContainer
  const jsxStart = cleaned.search(/<(?:div|ResponsiveContainer)\b/);
  if (jsxStart >= 0) {
    // Find the matching closing tag
    const jsxCode = cleaned.substring(jsxStart);

    // Find the outermost tag
    const tagMatch = jsxCode.match(/^<(\w+)/);
    if (tagMatch) {
      const tag = tagMatch[1];
      // Count open/close tags to find the matching end
      let depth = 0;
      let i = 0;
      while (i < jsxCode.length) {
        if (jsxCode[i] === '<') {
          // Self-closing tag
          const selfClose = jsxCode.substring(i).match(/^<\w[^>]*\/>/);
          if (selfClose) {
            i += selfClose[0].length;
            continue;
          }
          // Closing tag
          const closeTag = jsxCode.substring(i).match(/^<\/(\w+)\s*>/);
          if (closeTag) {
            if (closeTag[1] === tag) depth--;
            i += closeTag[0].length;
            if (depth === 0) return jsxCode.substring(0, i);
            continue;
          }
          // Opening tag
          const openTag = jsxCode.substring(i).match(/^<(\w+)/);
          if (openTag) {
            if (openTag[1] === tag) depth++;
            else {
              // For other tags, just skip past >
            }
          }
        }
        i++;
      }

      // Fallback: return everything from the start tag
      return jsxCode;
    }
  }

  // Last resort: if the whole response looks like JSX
  if (cleaned.startsWith('<')) {
    return cleaned;
  }

  return null;
}

/**
 * Edit chart code with retry on failure. Tries programmatic edit first, then LLM.
 */
export async function editChartCodeWithRetry(
  userQuery: string,
  currentCode: string,
  model: string,
  onProgress: (text: string, done: boolean) => void,
  maxRetries: number = 2
): Promise<ChartEditResult> {
  // Try programmatic edit first
  const programmatic = tryProgrammaticEdit(userQuery, currentCode);
  if (programmatic) {
    onProgress('✅ Applied edit.', true);
    return { status: 'success', code: programmatic };
  }

  const totalAttempts = maxRetries + 1;
  let lastResult: ChartEditResult = { status: 'error', message: 'Unknown error' };

  for (let attempt = 1; attempt <= totalAttempts; attempt++) {
    if (attempt > 1) {
      onProgress(`⚠️ Invalid response. Retrying... (attempt ${attempt}/${totalAttempts})`, false);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    lastResult = await editChartWithStreaming(userQuery, currentCode, model, onProgress);

    if (lastResult.status === 'error') {
      const msg = lastResult.message || '';
      if (msg.includes('Ollama error:') || msg.includes('No response stream')) {
        return lastResult;
      }
      console.warn(`[VisualizerAgent] Attempt ${attempt}/${totalAttempts}: ${msg}`);
      continue;
    }

    // Validate: code must start with a JSX tag
    if (lastResult.code && lastResult.code.trim().startsWith('<')) {
      return lastResult;
    }

    console.warn(`[VisualizerAgent] Attempt ${attempt}/${totalAttempts}: response doesn't look like JSX`);
  }

  return {
    status: 'error',
    message: `Failed after ${totalAttempts} attempts. Please try rephrasing your request.`,
  };
}

// ============================================================================
// UTILITY EXPORTS
// ============================================================================

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
