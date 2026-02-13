
import { AgentType } from './types';

export const AGENT_COLORS = {
  [AgentType.USER]: 'bg-slate-700 border-slate-600',
  [AgentType.ORCHESTRATOR]: 'bg-fuchsia-900/50 border-fuchsia-700 text-fuchsia-200',
  [AgentType.PLANNER]: 'bg-indigo-900/50 border-indigo-700 text-indigo-200',
  [AgentType.GENERAL_PLANNER]: 'bg-blue-900/50 border-blue-700 text-blue-200',
  [AgentType.NEURO_PLANNER]: 'bg-indigo-900/50 border-indigo-700 text-indigo-200',
  [AgentType.PLAN_VALIDATOR]: 'bg-rose-900/50 border-rose-700 text-rose-200',
  [AgentType.PREPROCESSOR]: 'bg-teal-900/50 border-teal-700 text-teal-200',
  [AgentType.EXECUTOR]: 'bg-emerald-900/50 border-emerald-700 text-emerald-200',
  [AgentType.RESEARCHER]: 'bg-purple-900/50 border-purple-700 text-purple-200',
  [AgentType.SYSTEM]: 'bg-gray-800 border-gray-700 text-gray-400',
};

export const MOCK_CSV_DATA = `ID,DX,Age,Sex,Amyloid_lS_orbital_med,Amyloid_lG_and_S_occipital_inf,Tau_Global
001,CN,72,F,1.1,1.05,0.8
002,CN,75,M,1.05,1.02,0.82
003,MCI,71,M,1.4,1.15,1.1
004,AD,80,F,1.8,1.45,1.5
005,MCI,68,F,1.35,1.12,1.05
006,CN,74,M,1.08,1.01,0.78
007,AD,82,M,1.9,1.50,1.6
008,LMCI,76,F,1.5,1.25,1.3
009,EMCI,69,M,1.25,1.10,0.95
010,AD,79,F,1.75,1.48,1.55
011,CN,70,F,1.02,0.99,0.75
012,MCI,73,M,1.38,1.20,1.15
013,LMCI,77,F,1.55,1.30,1.35
014,CN,71,M,1.06,1.03,0.81
015,AD,85,F,2.0,1.60,1.7
`;

export const PROMPTS = {
  ORCHESTRATOR_CLASSIFY: (query: string) => `
    You are an Orchestrator Agent for a neuroimaging analysis system.
    
    Classify the User Query into one of two categories:
    1. "RESEARCH": The user wants to analyze data, inspect columns, perform statistics, find correlations, compare groups, or search for literature.
    2. "GENERAL": The user wants to modify the visualization (e.g., change color, title, size), ask a general question unconnected to the dataset, or perform simple UI tasks.

    User Query: "${query}"

    Return strictly a JSON object: { "category": "RESEARCH" } or { "category": "GENERAL" }
  `,

  GENERAL_PLANNER: (query: string, toolDescriptions: string, feedback: string) => `
    You are a General Task Planner.
    User Query: "${query}"
    
    Available Tools:
    ${toolDescriptions}
    
    Task: Create a plan to satisfy the user request using the available tools.
    If the user wants to change visualization style (color, title, dot size), use the MODIFY_VISUALIZATION tool.
    ${feedback ? `
    IMPORTANT: A previous version of the plan was REJECTED by the Validator with these errors:
    ${feedback}
    
    Please correct the plan based on this feedback.
    ` : ""}

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
  `,

  NEURO_PLANNER: (query: string, dataContext: string, allToolDescs: string, feedback: string) => `
    You are an expert Neuroimaging Research Planner. Your goal is to design a scientifically rigorous and innovative analysis workflow.

    User Query: "${query}"
    Dataset Context (Columns): [${dataContext}]

    Available Tools:
    ${allToolDescs}

    Planning Strategy:
    1. Analyze the user's scientific intent. Are they looking for correlations, group differences, or external literature context?
    2. Innovation & Delegation: 
       - If you need background info or literature, use tools like 'literature_search', 'google_search', or 'pubmed_query'. These will be executed by the RESEARCHER agent.
       - If you need to clean/map data (e.g. Sex F/M -> 0/1), use 'TRANSFORM_DATA'. This is executed by the PREPROCESSOR agent.
       - If you need core stats (Correlation, Group Comparison), use the relevant tools. These are executed by the EXECUTOR agent.
    3. Data Logic:
       - Categorical columns (e.g., 'DX', 'Sex', 'Group') CANNOT be used directly in correlation/regression tools. 
       - You MUST schedule a TRANSFORM_DATA step first to create a numeric version (e.g., 'DX' -> 'DX_numeric') if you need to correlate them.
    4. Design a multi-step flow. 
       Example: Inspect Data -> Literature Search (Background) -> Transform Data -> Correlation Analysis.

    ${feedback ? `
    Correction Required:
    The previous plan was rejected by the validator: "${feedback}"
    Please fix the tool names or parameter values (check column names!).
    ` : ""}

    Output Format (Strict JSON):
    {
      "analysis_steps": [
        {
          "step_id": 1,
          "tool": "EXACT_TOOL_NAME", 
          "description": "Scientific rationale for this step",
          "parameters": { "param_name": "value" }
        }
      ],
      "rationale": "Explanation of the research strategy."
    }
  `,

  PLAN_VALIDATOR: (existingColumns: string[], toolManifest: string, planJson: string) => `
    You are a Plan Validator Agent. 
    Your job is to strictly verify the execution plan generated by a Planner.

    Tool Whitelist (Allowed Tools & Schemas): ${toolManifest}

    Execution Plan:
    ${planJson}

    Validation Rules:
    1. Tool Existence: The "tool" field in each step must exactly match one of the names in the Tool Whitelist (e.g., "DATA_INSPECT", "TRANSFORM_DATA", "CORRELATION_ANALYSIS").
    2. Parameter Validity:
       a) Column References: Iterate through each step. Identify parameters that specify column names that are not from TRANSFORM_DATA (e.g. "target_column": "Age", SKIP *_numeric). 
          Construct a list of strings containing these column names for each step. 
          Your output "check_columns" must be a list of lists (one list per step).
          Example: [["Age", "Sex"], [], ["DX"]]
          The system will use 'validatePlanColumns' to check if these columns exist in the dataset (or were created by previous steps).
       b) Schema Adherence: For parameters NOT related to columns, ensure they strictly follow the types/definitions in the Tool Whitelist (e.g. "title" is string, "color" is string).
    3. Logical Consistency: Ensure the flow of steps is logical.


    Return strictly a JSON object:
    {
      "valid": boolean,
      "errors": ["list", "of", "specific", "error", "messages"],
      "suggestions": "Actionable advice to fix the plan if invalid.",
      "check_columns": [["col_A"], [], ["col_B", "col_C"]] // A list of lists of strings. Each inner list contains column names to be validated for that step.
    }
  `,

  PREPROCESSOR_MAPPING: (column: string, values: string[]) => `
    You are a Data Preprocessor Agent in a neuroimaging study.
    Column Name: "${column}"
    Unique Values: ${JSON.stringify(values)}
    
    Task: Create a logical numeric mapping for these categorical values and provide a short rationale.
    - If it looks like disease stages (e.g. CN, MCI, AD), map them ordinally (e.g. CN=0, MCI=1, AD=2).
    - If it is binary (e.g. Sex F/M), map to 0/1.
    - Otherwise, assign arbitrary integers.
    
    Return ONLY a valid JSON object: { "mapping": { "Val1": 0, "Val2": 1, ... }, "rationale": "Short explanation of the mapping strategy." }
  `,

  RESEARCHER_INSIGHTS: (results: string, tools: string) => `
    You are a Principal Investigator (Researcher Agent) in a neuroimaging study.
    
    Current Analysis Context & Results:
    ${results}

    Available Research Tools:
    ${tools}

    Task:
    Evaluate the current findings.
    - If you see a result (e.g. a correlation or group difference) but lack the biological context or external verification, you MUST DECIDE to use a tool (like 'literature_search', 'pubmed_query', or 'web_search') to find that info.
    - If you have enough information to write a comprehensive scientific report/proposal, you MUST DECIDE to write the report.

    Return strictly a JSON object with your decision:
    {
      "thought": "Brief reasoning for your decision.",
      "decision": "TOOL_CALL" | "REPORT",
      "tool": "TOOL_NAME",       // Required if decision is TOOL_CALL
      "parameters": { ... },     // Required if decision is TOOL_CALL
      "report": "Markdown text..." // Required if decision is REPORT. Write a scientific hypothesis/proposal based on findings.
    }
  `
};
