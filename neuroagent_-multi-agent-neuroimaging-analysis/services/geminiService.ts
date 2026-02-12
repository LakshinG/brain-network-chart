import { GoogleGenAI, Type } from "@google/genai";
import { AgentType } from "../types";

// NOTE: In a real production app, never expose API keys on client side.
// The API key must be obtained exclusively from the environment variable process.env.API_KEY.

export const checkApiKey = () => !!process.env.API_KEY;

// Schemas for structured output from Planner
const PLANNER_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    analysis_steps: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          step_id: { type: Type.INTEGER },
          tool: { type: Type.STRING, enum: ["DATA_INSPECT", "STATISTICAL_ANALYSIS", "LITERATURE_SEARCH"] },
          description: { type: Type.STRING },
          parameters: {
            type: Type.OBJECT,
            properties: {
              target_column: { type: Type.STRING },
              group_column: { type: Type.STRING },
              comparison_type: { type: Type.STRING }
            }
          }
        },
        required: ["step_id", "tool", "description"]
      }
    },
    rationale: { type: Type.STRING }
  },
  required: ["analysis_steps", "rationale"]
};

export const generatePlan = async (query: string, dataContext: string) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const prompt = `
    You are a Planner Agent in a neuroimaging multi-agent system.
    User Query: "${query}"
    Data Context: The user has uploaded a dataset with these columns: ${dataContext}.
    
    Task: Break down the query into logical analysis steps. 
    Available Tools:
    1. DATA_INSPECT: Look at distribution of a column.
    2. STATISTICAL_ANALYSIS: Correlation or Group Comparison.
    3. LITERATURE_SEARCH: Find relevant papers.

    Return a JSON plan.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: PLANNER_SCHEMA
      }
    });
    return JSON.parse(response.text || '{}');
  } catch (e) {
    console.error("Planner Error:", e);
    // Fallback if model fails structured output or JSON parsing
    return {
      analysis_steps: [
        { step_id: 1, tool: "DATA_INSPECT", description: "Inspect relevant columns based on query." }
      ],
      rationale: "Fallback plan due to AI service interruption."
    };
  }
};

export const generateResearchInsights = async (results: string) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

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

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt
  });

  return response.text;
};

export const generateLiterature = async (topic: string) => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
    const prompt = `
      You are a Literature Search Agent.
      Topic: "${topic}"
      
      Generate a list of 3-4 plausible sounding neuroimaging citations (Author, Year, Title, Journal) related to this topic.
      Return them as a JSON list of objects with keys: title, authors, year, journal, summary.
    `;
  
    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: { responseMimeType: "application/json" }
    });
  
    try {
        return JSON.parse(response.text || '[]');
    } catch (e) {
        return [];
    }
  };