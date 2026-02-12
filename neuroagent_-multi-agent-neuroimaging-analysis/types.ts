
export enum AgentType {
  USER = 'User',
  PLANNER = 'Planner',
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
  LITERATURE_LIST = 'LITERATURE_LIST'
}

export interface ToolVisualization {
  type: VisualizationType;
  title: string;
  data: any;
  config?: any;
}

export interface AgentState {
  status: 'idle' | 'planning' | 'executing' | 'researching';
  currentTask?: string;
}

// Stats types
export interface GroupComparisonResult {
  groupCol: string;
  valueCol: string;
  groups: string[];
  pVal: number; // Simulated
  stats: { group: string; mean: number; median: number; min: number; max: number }[];
}

export interface CorrelationResult {
  xCol: string;
  yCol: string;
  r: number;
  p: number;
  dataPoints: { x: number; y: number; group?: string }[];
}

// MCP Types
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
