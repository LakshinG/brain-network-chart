
import { Ollama } from 'ollama';
import { McpTool, ChatMessage, AgentType } from "../types";
import { PROMPTS } from "../constants";
import { validatePlanColumns } from './internalTools';

const OLLAMA_HOST = 'http://127.0.0.1:11434';

let generalModel = 'llama3'; 
let neuroModel = 'llama3';

const ollama = new Ollama({ host: OLLAMA_HOST });

/**
 * Attempt to parse JSON from an LLM response, with repair heuristics
 * for common issues small models produce (trailing commas, markdown
 * fences, embedded think tags, etc.).
 */
function robustJsonParse(raw: string): any {
  // 1. Strip <think>…</think> blocks (deepseek-r1 emits these)
  let cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // 2. Strip markdown code fences
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  // 3. Extract first { … } or [ … ] block if there is surrounding text
  const firstBrace = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');
  let start = -1;
  let open: string | null = null;
  let close: string | null = null;

  if (firstBrace >= 0 && (firstBracket < 0 || firstBrace <= firstBracket)) {
    start = firstBrace; open = '{'; close = '}';
  } else if (firstBracket >= 0) {
    start = firstBracket; open = '['; close = ']';
  }

  if (start > 0) {
    // Find matching closing bracket
    let depth = 0;
    let end = start;
    for (let i = start; i < cleaned.length; i++) {
      if (cleaned[i] === open) depth++;
      else if (cleaned[i] === close) depth--;
      if (depth === 0) { end = i; break; }
    }
    cleaned = cleaned.substring(start, end + 1);
  }

  // 4. Try raw parse first
  try { return JSON.parse(cleaned); } catch (_) { /* continue */ }

  // 5. Fix trailing commas before } or ]
  let repaired = cleaned.replace(/,\s*([}\]])/g, '$1');

  // 6. Fix single-quoted strings → double-quoted
  repaired = repaired.replace(/(?<=[:,\[{]\s*)'([^']*?)'/g, '"$1"');

  // 7. Try again
  try { return JSON.parse(repaired); } catch (_) { /* continue */ }

  // 8. Last resort: strip control chars and retry
  repaired = repaired.replace(/[\x00-\x1f]+/g, ' ');
  return JSON.parse(repaired); // let this throw if still broken
}

export const checkApiKey = () => true; 

export const checkOllamaConnection = async (): Promise<boolean> => {
  try {
    await ollama.list();
    return true;
  } catch (e) {
    console.error("Ollama connection failed:", e);
    return false;
  }
};

export const getAvailableModels = async (): Promise<string[]> => {
  try {
    const response = await ollama.list();
    return response.models.map(m => m.name);
  } catch (e) {
    console.error("Failed to fetch models:", e);
    return [];
  }
};

export const setGeneralModel = (model: string) => { generalModel = model; };
export const setNeuroModel = (model: string) => { neuroModel = model; };
export const getGeneralModel = () => generalModel;
export const getNeuroModel = () => neuroModel;

// Helper to build summarized history
export const buildConversationContext = (messages: ChatMessage[], limit: number = 8): string => {
  if (limit <= 0) return "";

  // Take last 'limit' messages to maintain context window, excluding system noise
  const recentMessages = messages
    .filter(m => m.role !== AgentType.SYSTEM && m.role !== AgentType.PLAN_VALIDATOR && m.role !== AgentType.PREPROCESSOR)
    .slice(-limit);

  if (recentMessages.length === 0) return "";

  return recentMessages.map(m => {
    // Clean up content: remove thinking process if it's too verbose
    let content = m.content;
    if (content.length > 500) content = content.substring(0, 500) + "...(truncated)";
    return `[${m.role}]: ${content}`;
  }).join('\n\n');
};

export const classifyQuery = async (query: string): Promise<'RESEARCH' | 'GENERAL'> => {
  console.log('[Orchestrator Agent] Input:', PROMPTS.ORCHESTRATOR_CLASSIFY(query));
  try {
    const response = await ollama.generate({
      model: generalModel,
      prompt: PROMPTS.ORCHESTRATOR_CLASSIFY(query),
      format: 'json',
      stream: false
    });
    const json = robustJsonParse(response.response);
    return (json.category === 'RESEARCH' || json.category === 'GENERAL') ? json.category : 'RESEARCH';
  } catch (e) {
    console.error("Orchestrator Error:", e);
    return 'RESEARCH';
  }
};

export const generateGeneralPlan = async (query: string, availableTools: McpTool[], feedback?: string, chatHistory: string = "") => {
  // Only include name and description for high-level planning
  const toolDescriptions = availableTools.map(t => 
    `- ${t.name}: ${t.description || 'No description'}`
  ).join('\n    ');

  console.log('[General Planner Agent] Input:', PROMPTS.GENERAL_PLANNER(query, toolDescriptions, feedback || "", chatHistory));
  try {
    const response = await ollama.generate({
      model: generalModel,
      prompt: PROMPTS.GENERAL_PLANNER(query, toolDescriptions, feedback || "", chatHistory),
      format: 'json',
      stream: false
    });
    return robustJsonParse(response.response);
  } catch (e) {
    console.error("General Planner Error:", e);
    return {
      analysis_steps: [],
      rationale: "Failed to generate general plan."
    };
  }
};

export const generateNeuroPlan = async (query: string, dataContext: string, availableTools: McpTool[], feedback?: string, chatHistory: string = "") => {
  // Only include name and description for high-level planning
  const toolDescriptions = availableTools.map(t => 
    `- ${t.name}: ${t.description || 'No description'}`
  ).join('\n    ');

  const allToolDescs = `
    [Core Data Tools]
    - DATA_INSPECT: Display data rows to the user (Visualization). Use this when the user wants to see the table or when you need to check value formats (e.g. string vs number).
    - TRANSFORM_DATA: Convert categorical columns (e.g. DX, Sex) to numeric (creates {col}_numeric). Use this before Correlation if input is categorical.
    
    [Advanced/MCP Tools]
    ${toolDescriptions ? toolDescriptions : 'No external tools available.'}
  `;

  console.log('[Neuro Planner Agent] Input:', PROMPTS.NEURO_PLANNER(query, dataContext, allToolDescs, feedback || "", chatHistory));
  try {
    const response = await ollama.generate({
      model: neuroModel,
      prompt: PROMPTS.NEURO_PLANNER(query, dataContext, allToolDescs, feedback || "", chatHistory),
      format: 'json',
      stream: false
    });
    return robustJsonParse(response.response);
  } catch (e) {
    console.error("Neuro Planner Error:", e);
    return {
      analysis_steps: [
        { step_id: 1, tool: "DATA_INSPECT", description: "Inspect relevant columns (Fallback)." }
      ],
      rationale: "Fallback plan due to AI service error."
    };
  }
};

export const validatePlan = async (plan: any, availableTools: McpTool[], existingColumns: string[]) => {
  const toolManifest = availableTools.map(t => ({
    name: t.name,
    description: t.description,
    parameters: t.inputSchema.properties || {},
    required: t.inputSchema.required || []
  }));
  console.log('[Plan Validator Agent] Input:', PROMPTS.PLAN_VALIDATOR(JSON.stringify(toolManifest), JSON.stringify(plan, null, 2)));

  try {
    // 1. Ask LLM to validate tool usage and schema
    const response = await ollama.generate({
      model: generalModel,
      prompt: PROMPTS.PLAN_VALIDATOR(JSON.stringify(toolManifest), JSON.stringify(plan, null, 2)),
      format: 'json',
      stream: false
    });
    
    const result = robustJsonParse(response.response);

    // 2. If LLM response requests column validation, execute the internal tool
    if (result.check_columns && Array.isArray(result.check_columns)) {
        const colValidation = validatePlanColumns(plan, existingColumns, result.check_columns);
        if (!colValidation.valid) {
            result.valid = false;
            result.errors = [...(result.errors || []), ...colValidation.errors];
            result.suggestions = (result.suggestions || "") + " Please correct the invalid column names.";
        }
    }

    return result;
  } catch (e) {
    console.error("Plan Validator Error:", e);
    return { valid: true, errors: [], suggestions: "Validation skipped due to service error." };
  }
};

export const runExecutorAgent = async (
  instruction: string, 
  columns: string[], 
  availableTools: McpTool[], 
  clarification: string = "", 
  previousResults: string = "", 
  delegator: string = "Planner", 
  serverFilename: string | null = null,
  retryError: string = ""
) => {
  const toolDefinitions = availableTools.map(t => 
    `Tool: ${t.name}
     Description: ${t.description}
     Parameters Schema: ${JSON.stringify(t.inputSchema.properties || {})}`
  ).join('\n\n');

  console.log('[Executor Agent] Input:', PROMPTS.EXECUTOR_AGENT(instruction, columns.join(', '), toolDefinitions, clarification, previousResults, delegator, serverFilename || '', retryError));
  
  try {
    // Executor uses the GENERAL model for precise instruction following
    const response = await ollama.generate({
      model: generalModel,
      prompt: PROMPTS.EXECUTOR_AGENT(instruction, columns.join(', '), toolDefinitions, clarification, previousResults, delegator, serverFilename || '', retryError),
      format: 'json',
      stream: false
    });
    return robustJsonParse(response.response);
  } catch (e) {
    console.error("Executor Agent Error:", e);
    throw new Error("Executor Agent failed to generate tool calls.");
  }
};

function stripThinkTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

export const interpretToolResult = async (instruction: string, toolName: string, toolOutput: any) => {
  // Truncate output if too large to avoid context limit (e.g. data points)
  let outputStr = JSON.stringify(toolOutput, null, 2);
  // if (outputStr.length > 2000) outputStr = outputStr.substring(0, 2000) + "...(truncated)";

  console.log('[Executor Agent] Interpreting result...');
  try {
    const response = await ollama.generate({
      model: generalModel,
      prompt: PROMPTS.EXECUTOR_INTERPRET(instruction, toolName, outputStr),
      stream: false
    });
    return stripThinkTags(response.response);
  } catch (e) {
    console.error("Executor Interpretation Error:", e);
    return "Analysis complete (could not generate detailed interpretation).";
  }
};

export const generatePreprocessingMapping = async (column: string, values: string[]) => {
  console.log('[Preprocessor Agent] Input:', PROMPTS.PREPROCESSOR_MAPPING(column, values));
  try {
    const response = await ollama.generate({
      model: neuroModel,
      prompt: PROMPTS.PREPROCESSOR_MAPPING(column, values),
      format: 'json',
      stream: false
    });
    return robustJsonParse(response.response);
  } catch (e) {
    console.error("Preprocessor Error:", e);
    const fallback: Record<string, number> = {};
    values.forEach((v, i) => fallback[v] = i);
    return { mapping: fallback, rationale: "Fallback: Assigned sequential integers due to service error." };
  }
};

export const generateResearchInsights = async (results: string, availableTools: McpTool[]) => {
  const toolsStr = availableTools.map(t => `- ${t.name}: ${t.description}`).join('\n');
  console.log('[Researcher Agent] Input:', PROMPTS.RESEARCHER_INSIGHTS(results, toolsStr));
  try {
    const response = await ollama.generate({
      model: neuroModel,
      prompt: PROMPTS.RESEARCHER_INSIGHTS(results, toolsStr),
      format: 'json',
      stream: false
    });
    return robustJsonParse(response.response);
  } catch (e) {
    console.error("Researcher Error:", e);
    // Fallback if JSON parsing fails or model errors
    return { 
      decision: "REPORT", 
      report: "Analysis complete. (Error generating autonomous research insights)." 
    };
  }
};

export const generateProposalReport = async (userQuery: string, analysisResults: string, researcherNotes: string) => {
  console.log('[Proposal Reporter Agent] Input:', PROMPTS.PROPOSAL_REPORTER(userQuery, analysisResults, researcherNotes));
  try {
    const response = await ollama.generate({
      model: neuroModel,
      prompt: PROMPTS.PROPOSAL_REPORTER(userQuery, analysisResults, researcherNotes),
      stream: false
    });
    return stripThinkTags(response.response);
  } catch (e) {
    console.error("Proposal Reporter Error:", e);
    return "Failed to generate report.";
  }
};
