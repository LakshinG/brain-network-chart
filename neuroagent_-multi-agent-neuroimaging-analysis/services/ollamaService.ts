
import { Ollama } from 'ollama';
import { McpTool } from "../types";

// Connect directly to the local Ollama instance.
// Ensure your Ollama server is running with OLLAMA_ORIGINS="*" to allow browser requests.
const OLLAMA_HOST = 'http://127.0.0.1:11434';
let currentModel = 'MedAIBase/MedGemma1.5:4b'; 

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

export const setModel = (model: string) => {
  currentModel = model;
};

export const getModel = () => currentModel;

export const generatePlan = async (query: string, dataContext: string, availableTools: McpTool[]) => {
  // Construct tool descriptions
  const toolDescriptions = availableTools.map(t => 
    `- ${t.name}: ${t.description || 'No description'} (Args: ${Object.keys(t.inputSchema.properties || {}).join(', ')})`
  ).join('\n');

  // Add default internal tools if not present
  const allToolDescs = `
    1. DATA_INSPECT: Inspect data distribution.
    2. LITERATURE_SEARCH: Search for papers.
    ${toolDescriptions ? '3. Tools:\n' + toolDescriptions : ''}
  `;

  const prompt = `
    You are a Planner Agent in a neuroimaging multi-agent system.
    User Query: "${query}"
    Data Context: The user has uploaded a dataset with these columns: ${dataContext}.
    
    Task: Break down the query into logical analysis steps using the available tools.
    
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
            "group_column": "..."
          }
        }
      ],
      "rationale": "Reasoning for the plan"
    }
  `;

  try {
    const response = await ollama.generate({
      model: currentModel,
      prompt: prompt,
      format: 'json',
      stream: false
    });
    return JSON.parse(response.response);
  } catch (e) {
    console.error("Planner Error:", e);
    return {
      analysis_steps: [
        { step_id: 1, tool: "DATA_INSPECT", description: "Inspect relevant columns (Fallback)." }
      ],
      rationale: "Fallback plan due to AI service error."
    };
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
      model: currentModel,
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
      model: currentModel,
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
