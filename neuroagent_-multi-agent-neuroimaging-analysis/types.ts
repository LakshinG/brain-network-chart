
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
  PROPOSAL_REPORTER = 'Proposal Reporter',
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
  id: string;
  name: string;
  columns: string[];
  data: DatasetRow[];
  serverFilename?: string;
}

export enum VisualizationType {
  NONE = 'NONE',
  DATA_TABLE = 'DATA_TABLE',
  SCATTER_PLOT = 'SCATTER_PLOT',
  BOX_PLOT = 'BOX_PLOT',
  AGING_CURVE = 'AGING_CURVE',
  MARKDOWN_REPORT = 'MARKDOWN_REPORT',
  LITERATURE_LIST = 'LITERATURE_LIST',
  RESEARCH_REPORT = 'RESEARCH_REPORT',
  CLUSTERING_DASHBOARD = 'CLUSTERING_DASHBOARD',
  STRATIFICATION_RESULT = 'STRATIFICATION_RESULT'
}

export interface ToolVisualization {
  type: VisualizationType;
  title: string;
  data: any;
  config?: any;
  messageId?: string; 
  datasetId?: string;
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
  originalUserQuery?: string;
}

export interface GroupComparisonResult {
  groupCol: string;
  valueCol: string;
  groups: string[];
  pVal: number; 
  stats: { group: string; mean: number; median: number; min: number; max: number }[];
  pairwiseComparisons?: {
    groupA: string;
    groupB: string;
    testName: string;
    statistic: number;
    pVal: number;
    significant: boolean;
    cohensD: number;
    effectSize: string;
    meanA: number;
    meanB: number;
    explanation: string;
  }[];
}

export interface CorrelationResult {
  xCol: string;
  yCol: string;
  r: number;
  p: number;
  dataPoints: { x: number; y: number; group?: string }[];
}

export interface GrowthCurveResult {
  status: string;
  phenotype: string;
  data: { X: number[]; centiles: number[][]; age?: number[]; values?: number[] };
  elapsed_seconds: number;
}

export interface ClusteringResult {
  featureCols: string[];
  targetCol: string;
  nCluster: number;
  pcPoints: { x: number; y: number; cluster: number; target: number; id?: string }[];
  clusterCorrelation: CorrelationResult;
}

export interface StratificationResult {
  targetCol: string;
  groupCol: string;
  newColumns: { name: string; count: number }[];
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
