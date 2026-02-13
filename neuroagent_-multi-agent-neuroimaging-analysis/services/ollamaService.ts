
import { Ollama } from 'ollama';
import { McpTool } from "../types";
import { PROMPTS } from "../constants";

const OLLAMA_HOST = 'http://127.0.0.1:11434';

let generalModel = 'qwen3:latest'; 
let neuroModel = 'qwen3:latest';

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
    1. DATA_INSPECT: Inspect data distribution.
    2. LITERATURE_SEARCH: Search for papers.
    3. TRANSFORM_DATA: Convert categorical to numeric (creates {col}_numeric). Use this before Correlation if input is categorical.
    ${toolDescriptions ? '4. Other Analysis Tools:\n    ' + toolDescriptions : ''}
  `;

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

  try {
    const response = await ollama.generate({
      model: generalModel,
      prompt: PROMPTS.PLAN_VALIDATOR(existingColumns, JSON.stringify(toolManifest), JSON.stringify(plan, null, 2)),
      format: 'json',
      stream: false
    });
    return JSON.parse(response.response);
  } catch (e) {
    console.error("Plan Validator Error:", e);
    return { valid: true, errors: [], suggestions: "Validation skipped due to service error." };
  }
};

export const generatePreprocessingMapping = async (column: string, values: string[]) => {
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

export const generateResearchInsights = async (results: string) => {
  try {
    const response = await ollama.generate({
      model: neuroModel,
      prompt: PROMPTS.RESEARCHER_INSIGHTS(results),
      stream: false
    });
    return response.response;
  } catch (e) {
    console.error("Researcher Error:", e);
    return "Could not generate insights. Ensure Ollama is running.";
  }
};

export const generateLiterature = async (topic: string) => {
  try {
    const response = await ollama.generate({
      model: neuroModel,
      prompt: PROMPTS.LITERATURE_SEARCH(topic),
      format: 'json',
      stream: false
    });
    
    const json = JSON.parse(response.response);
    if (Array.isArray(json)) return json;
    if (json.citations && Array.isArray(json.citations)) return json.citations;
    if (json.papers && Array.isArray(json.papers)) return json.papers;
    return [];
  } catch (e) {
    console.error("Literature Error:", e);
    return [];
  }
};
