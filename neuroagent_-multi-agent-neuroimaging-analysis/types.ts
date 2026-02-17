
export enum AgentType {
  USER = 'User',
  ORCHESTRATOR = 'Orchestrator',
  PLANNER = 'Planner', 
  GENERAL_PLANNER = 'General Planner',
  NEURO_PLANNER = 'Neuro Planner',
  PLAN_VALIDATOR = 'Plan Validator',
  PREPROCESSOR = 'Preprocessor',
  EXECUTOR = 'Executor',
  RESEARCHER = 'Researcher',
  SYSTEM = 'System'
}

export interface ChatMessage {
  id: string;
  role: AgentType;
  content: string;
  timestamp: number;
  isThinking?: boolean;
  metadata?: any; 
}

export interface DatasetRow {
  [key: string]: string | number;
}

export interface Dataset {
  name: string;
  columns: string[];
  data: DatasetRow[];
}

export enum VisualizationType {
  NONE = 'NONE',
  DATA_TABLE = 'DATA_TABLE',
  SCATTER_PLOT = 'SCATTER_PLOT',
  BOX_PLOT = 'BOX_PLOT',
  MARKDOWN_REPORT = 'MARKDOWN_REPORT',
  LITERATURE_LIST = 'LITERATURE_LIST',
  RESEARCH_REPORT = 'RESEARCH_REPORT'
}

export interface ToolVisualization {
  type: VisualizationType;
  title: string;
  data: any;
  config?: any;
  messageId?: string; 
}

export interface AgentState {
  status: 'idle' | 'planning' | 'executing' | 'researching';
  currentTask?: string;
}

export interface SuspendedState {
  plan: any;
  stepIndex: number;
  data: any[];
  columns: string[];
  intent: 'RESEARCH' | 'GENERAL';
}

export interface GroupComparisonResult {
  groupCol: string;
  valueCol: string;
  groups: string[];
  pVal: number; 
  stats: { group: string; mean: number; median: number; min: number; max: number }[];
}

export interface CorrelationResult {
  xCol: string;
  yCol: string;
  r: number;
  p: number;
  dataPoints: { x: number; y: number; group?: string }[];
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema: {
    type: string;
    properties?: Record<string, any>;
    required?: string[];
  };
}

export interface McpToolCallResult {
  content: {
    type: string;
    text?: string;
    resource?: any;
  }[];
  isError?: boolean;
}