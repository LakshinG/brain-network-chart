
import { Ollama } from 'ollama';
import { McpTool } from "../types";
import { PROMPTS } from "../constants";
import { validatePlanColumns } from './internalTools';

const OLLAMA_HOST = 'http://127.0.0.1:11434';

let generalModel = 'llama3'; 
let neuroModel = 'llama3';

const ollama = new Ollama({ host: OLLAMA_HOST });

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

export const setGeneralModel = (model) => { generalModel = model; };
export const setNeuroModel = (model) => { neuroModel = model; };
export const getGeneralModel = () => generalModel;
export const getNeuroModel = () => neuroModel;

export const classifyQuery = async (query: string): Promise<'RESEARCH' | 'GENERAL'> => {
  console.log('[Orchestrator Agent] Input:', PROMPTS.ORCHESTRATOR_CLASSIFY(query));
  try {
    const response = await ollama.generate({
      model: generalModel,
      prompt: PROMPTS.ORCHESTRATOR_CLASSIFY(query),
      format: 'json',
      stream: false
    });
    const json = JSON.parse(response.response);
    return (json.category === 'RESEARCH' || json.category === 'GENERAL') ? json.category : 'RESEARCH';
  } catch (e) {
    console.error("Orchestrator Error:", e);
    return 'RESEARCH';
  }
};

export const generateGeneralPlan = async (query: string, availableTools: McpTool[], feedback?: string) => {
  const toolDescriptions = availableTools.map(t => 
    `- ${t.name}: ${t.description || 'No description'} (Args: ${Object.keys(t.inputSchema.properties || {}).join(', ')})`
  ).join('\n    ');

  console.log('[General Planner Agent] Input:', PROMPTS.GENERAL_PLANNER(query, toolDescriptions, feedback || ""));
  try {
    const response = await ollama.generate({
      model: generalModel,
      prompt: PROMPTS.GENERAL_PLANNER(query, toolDescriptions, feedback || ""),
      format: 'json',
      stream: false
    });
    return JSON.parse(response.response);
  } catch (e) {
    console.error("General Planner Error:", e);
    return {
      analysis_steps: [],
      rationale: "Failed to generate general plan."
    };
  }
};

export const generateNeuroPlan = async (query: string, dataContext: string, availableTools: McpTool[], feedback?: string) => {
  const toolDescriptions = availableTools.map(t => 
    `- ${t.name}: ${t.description || 'No description'} (Args: ${Object.keys(t.inputSchema.properties || {}).join(', ')})`
  ).join('\n    ');

  const allToolDescs = `
    [Core Data Tools]
    - DATA_INSPECT: Inspect data distribution and get a glimpse of rows.
    - TRANSFORM_DATA: Convert categorical columns (e.g. DX, Sex) to numeric (creates {col}_numeric). Use this before Correlation if input is categorical.
    
    [Advanced/MCP Tools]
    ${toolDescriptions ? toolDescriptions : 'No external tools available.'}
  `;

  console.log('[Neuro Planner Agent] Input:', PROMPTS.NEURO_PLANNER(query, dataContext, allToolDescs, feedback || ""));
  try {
    const response = await ollama.generate({
      model: neuroModel,
      prompt: PROMPTS.NEURO_PLANNER(query, dataContext, allToolDescs, feedback || ""),
      format: 'json',
      stream: false
    });
    return JSON.parse(response.response);
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
  console.log('[Plan Validator Agent] Input:', PROMPTS.PLAN_VALIDATOR(existingColumns, JSON.stringify(toolManifest), JSON.stringify(plan, null, 2)));

  try {
    // 1. Ask LLM to validate tool usage and schema, and request column check if needed
    const response = await ollama.generate({
      model: generalModel,
      prompt: PROMPTS.PLAN_VALIDATOR(existingColumns, JSON.stringify(toolManifest), JSON.stringify(plan, null, 2)),
      format: 'json',
      stream: false
    });
    
    const result = JSON.parse(response.response);

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

export const generatePreprocessingMapping = async (column: string, values: string[]) => {
  console.log('[Preprocessor Agent] Input:', PROMPTS.PREPROCESSOR_MAPPING(column, values));
  try {
    const response = await ollama.generate({
      model: neuroModel,
      prompt: PROMPTS.PREPROCESSOR_MAPPING(column, values),
      format: 'json',
      stream: false
    });
    return JSON.parse(response.response);
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
    return JSON.parse(response.response);
  } catch (e) {
    console.error("Researcher Error:", e);
    // Fallback if JSON parsing fails or model errors
    return { 
      decision: "REPORT", 
      report: "Analysis complete. (Error generating autonomous research insights)." 
    };
  }
};
