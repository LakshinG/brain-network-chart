
import { Ollama } from 'ollama';
import { McpTool } from "../types";

// Connect directly to the local Ollama instance.
const OLLAMA_HOST = 'http://127.0.0.1:11434';

// Distinct models for different tasks
let generalModel = 'qwen3:latest'; 
let neuroModel = 'MedAIBase/MedGemma1.5:4b';

// Create a new instance of the Ollama client
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

export const setGeneralModel = (model: string) => {
  generalModel = model;
};

export const setNeuroModel = (model: string) => {
  neuroModel = model;
};

export const getGeneralModel = () => generalModel;
export const getNeuroModel = () => neuroModel;

// --- ORCHESTRATOR AGENT ---
export const classifyQuery = async (query: string): Promise<'RESEARCH' | 'GENERAL'> => {
  const prompt = `
    You are an Orchestrator Agent for a neuroimaging analysis system.
    
    Classify the User Query into one of two categories:
    1. "RESEARCH": The user wants to analyze data, inspect columns, perform statistics, find correlations, compare groups, or search for literature.
    2. "GENERAL": The user wants to modify the visualization (e.g., change color, title, size), ask a general question unconnected to the dataset, or perform simple UI tasks.

    User Query: "${query}"

    Return strictly a JSON object: { "category": "RESEARCH" } or { "category": "GENERAL" }
  `;

  try {
    const response = await ollama.generate({
      model: generalModel, // Orchestrator uses general model (assumed faster/sufficient)
      prompt: prompt,
      format: 'json',
      stream: false
    });
    const json = JSON.parse(response.response);
    return (json.category === 'RESEARCH' || json.category === 'GENERAL') ? json.category : 'RESEARCH';
  } catch (e) {
    console.error("Orchestrator Error:", e);
    return 'RESEARCH'; // Default to research if classification fails
  }
};

// --- GENERAL PLANNER AGENT ---
export const generateGeneralPlan = async (query: string, availableTools: McpTool[]) => {
  // Only expose tools relevant to general tasks (or all, but instructions guide usage)
  const toolDescriptions = availableTools.map(t => 
    `- ${t.name}: ${t.description || 'No description'} (Args: ${Object.keys(t.inputSchema.properties || {}).join(', ')})`
  ).join('\n    ');

  const prompt = `
    You are a General Task Planner.
    User Query: "${query}"
    
    Available Tools:
    ${toolDescriptions}
    
    Task: Create a plan to satisfy the user request using the available tools.
    If the user wants to change visualization style (color, title, dot size), use the MODIFY_VISUALIZATION tool.

    You must return a valid JSON object with the following structure:
    {
      "analysis_steps": [
        {
          "step_id": 1,
          "tool": "TOOL_NAME", 
          "description": "Description of the step",
          "parameters": {
            "key": "value"
          }
        }
      ],
      "rationale": "Reasoning for the plan"
    }
  `;

  try {
    const response = await ollama.generate({
      model: generalModel,
      prompt: prompt,
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

// --- NEURO PLANNER AGENT ---
export const generateNeuroPlan = async (query: string, dataContext: string, availableTools: McpTool[]) => {
  // Construct tool descriptions
  const toolDescriptions = availableTools.map(t => 
    `- ${t.name}: ${t.description || 'No description'} (Args: ${Object.keys(t.inputSchema.properties || {}).join(', ')})`
  ).join('\n    ');

  // Add default internal tools if not present
  const allToolDescs = `
    1. DATA_INSPECT: Inspect data distribution.
    2. LITERATURE_SEARCH: Search for papers.
    3. TRANSFORM_DATA: Convert categorical to numeric (creates {col}_numeric). Use this before Correlation if input is categorical.
    ${toolDescriptions ? '4. Other Analysis Tools:\n    ' + toolDescriptions : ''}
  `;

  const prompt = `
    You are a Planner Agent in a neuroimaging multi-agent system.
    User Query: "${query}"
    Data Context: The user has uploaded a dataset with these columns: ${dataContext}.
    
    Task: Break down the query into logical analysis steps using the available tools.
    
    IMPORTANT: If the user asks for correlation involving a categorical column (like DX, Sex), you MUST first use TRANSFORM_DATA to convert it to numbers, then use the new column (e.g. DX_numeric) for correlation.

    Available Tools:
    ${allToolDescs}

    You must return a valid JSON object with the following structure:
    {
      "analysis_steps": [
        {
          "step_id": 1,
          "tool": "TOOL_NAME", 
          "description": "Description of the step",
          "parameters": {
            "target_column": "...",
            "x_column": "...",
            "y_column": "..."
          }
        }
      ],
      "rationale": "Reasoning for the plan"
    }
  `;

  try {
    const response = await ollama.generate({
      model: neuroModel,
      prompt: prompt,
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

// --- PREPROCESSOR AGENT ---
export const generatePreprocessingMapping = async (column: string, values: string[]) => {
  const prompt = `
    You are a Data Preprocessor Agent in a neuroimaging study.
    Column Name: "${column}"
    Unique Values: ${JSON.stringify(values)}
    
    Task: Create a logical numeric mapping for these categorical values and provide a short rationale.
    - If it looks like disease stages (e.g. CN, MCI, AD), map them ordinally (e.g. CN=0, MCI=1, AD=2).
    - If it is binary (e.g. Sex F/M), map to 0/1.
    - Otherwise, assign arbitrary integers.
    
    Return ONLY a valid JSON object: { "mapping": { "Val1": 0, "Val2": 1, ... }, "rationale": "Short explanation of the mapping strategy." }
  `;

  try {
    const response = await ollama.generate({
      model: neuroModel,
      prompt: prompt,
      format: 'json',
      stream: false
    });
    return JSON.parse(response.response);
  } catch (e) {
    console.error("Preprocessor Error:", e);
    // Fallback mapping
    const fallback: Record<string, number> = {};
    values.forEach((v, i) => fallback[v] = i);
    return { mapping: fallback, rationale: "Fallback: Assigned sequential integers due to service error." };
  }
};

export const generateResearchInsights = async (results: string) => {
  const prompt = `
    You are a Researcher Agent in a neuroimaging study.
    Review the following analysis results provided by the Executor:
    ${results}

    Provide a scientific interpretation. 
    1. Are the p-values significant?
    2. What does the correlation coefficient imply?
    3. Suggest one follow-up analysis or a relevant neuroimaging keyword to search next.
    4. Keep it concise (max 3 paragraphs).
  `;

  try {
    const response = await ollama.generate({
      model: neuroModel, // Researcher uses neuro model
      prompt: prompt,
      stream: false
    });
    return response.response;
  } catch (e) {
    console.error("Researcher Error:", e);
    return "Could not generate insights. Ensure Ollama is running.";
  }
};

export const generateLiterature = async (topic: string) => {
  const prompt = `
    You are a Literature Search Agent.
    Topic: "${topic}"
    
    Generate a list of 3-4 plausible sounding neuroimaging citations (Author, Year, Title, Journal) related to this topic.
    Return a valid JSON array of objects with keys: title, authors, year, journal, summary.
  `;

  try {
    const response = await ollama.generate({
      model: neuroModel,
      prompt: prompt,
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
