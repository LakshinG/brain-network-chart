import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  AgentType, ChatMessage, Dataset, ToolVisualization, VisualizationType, McpTool, SuspendedState, CorrelationResult, DatasetRow
} from './types';
import { MOCK_CSV_DATA } from './constants';
import { parseCSV, mergeDatasets, datasetToCSV } from './utils/stats';
import { 
  generateNeuroPlan,
  generateGeneralPlan,
  classifyQuery,
  generateResearchInsights, 
  generateProposalReport,
  generatePreprocessingMapping,
  validatePlan,
  runExecutorAgent,
  interpretToolResult,
  checkOllamaConnection, 
  getAvailableModels, 
  setGeneralModel, 
  setNeuroModel,
  buildConversationContext
} from './services/ollamaService';
import { mcpClient } from './services/mcpService';
import { INTERNAL_TOOLS, executeInternalTool } from './services/internalTools';
import { 
  editChartCodeWithRetry
} from './services/visualizerService';
import { chartDataToCode, prepareDataScope } from './utils/chartToCode';
import ChatArea from './components/Chat/ChatArea';
import VisualizerArea from './components/Visualizer/VisualizerArea';
import ResizablePanels from './components/ResizablePanels';
import { X, Pencil, Database } from 'lucide-react';
import { getMockVisualization, getAllMockVisualizations } from './mockVisualizations';

const VISUALIZER_AGENT = AgentType.EXECUTOR;

const App: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  
  // Multi-dataset state
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [activeDatasetIds, setActiveDatasetIds] = useState<string[]>([]);
  const [activeServerFilename, setActiveServerFilename] = useState<string | null>(null);

  const [visualizations, setVisualizations] = useState<ToolVisualization[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [mcpTools, setMcpTools] = useState<McpTool[]>([]);
  const [mcpConnected, setMcpConnected] = useState(false);
  const [ollamaConnected, setOllamaConnected] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);

  const [selectedGeneralModel, setSelectedGeneralModel] = useState<string>('llama3');
  const [selectedNeuroModel, setSelectedNeuroModel] = useState<string>('llama3');
  
  const [selectedVisualizationId, setSelectedVisualizationId] = useState<string | null>(null);
  const [visualizerModel, setVisualizerModel] = useState<string>('qwen2.5-coder:32b');



  // Plan Validator Toggle
  const [isPlanValidationEnabled, setIsPlanValidationEnabled] = useState<boolean>(true);
  // Researcher & Reporter Toggle
  const [isResearchReportEnabled, setIsResearchReportEnabled] = useState<boolean>(true);
  // Context Memory Toggle
  const [isContextMemoryEnabled, setIsContextMemoryEnabled] = useState<boolean>(true);

  const [suspendedState, setSuspendedState] = useState<SuspendedState | null>(null);

  // Derived active dataset (merged)
  const activeDataset = useMemo(() => {
    const selected = datasets.filter(d => activeDatasetIds.includes(d.id));
    return mergeDatasets(selected);
  }, [datasets, activeDatasetIds]);

  // Sync active dataset to visualizations (Dynamic Data Context)
  useEffect(() => {
    setVisualizations(prev => {
        // Find existing Data Context card
        const index = prev.findIndex(v => v.type === VisualizationType.DATA_TABLE && v.title.startsWith('Data Context:'));

        if (!activeDataset) {
            // If no active dataset, remove the context card if it exists
            if (index !== -1) {
                const newVizs = [...prev];
                newVizs.splice(index, 1);
                return newVizs;
            }
            return prev;
        }

        const newViz: ToolVisualization = {
            type: VisualizationType.DATA_TABLE,
            title: `Data Context: ${activeDataset.name}`,
            data: activeDataset.data,
            datasetId: activeDataset.id
        };

        if (index !== -1) {
             // Update existing context card in place to avoid shifting history
             const newVizs = [...prev];
             newVizs[index] = newViz;
             return newVizs;
        } else {
            // Add to top if it doesn't exist
            return [newViz, ...prev];
        }
    });
  }, [activeDataset]);

  const uploadActiveDataset = useCallback(async (manual: boolean = false) => {
      if (!activeDataset || !mcpConnected) {
         if (!activeDataset) setActiveServerFilename(null);
         return;
      }

      // If singular dataset and already has filename, use it to avoid duplicate upload
      if (activeDatasetIds.length === 1) {
         const ds = datasets.find(d => d.id === activeDatasetIds[0]);
         if (ds && ds.serverFilename) {
             if (activeServerFilename !== ds.serverFilename) {
                 setActiveServerFilename(ds.serverFilename);
                 if (manual) addMessage(AgentType.SYSTEM, `Context set to existing server file: ${ds.serverFilename}`);
             } else {
                 if (manual) addMessage(AgentType.SYSTEM, `Dataset is already up-to-date on server (${ds.serverFilename}).`);
             }
             return;
         }
      }

      // Upload merged/active dataset context
      try {
          const csv = datasetToCSV(activeDataset);
          const timestamp = Date.now();
          const safeName = activeDataset.name.replace(/[^a-zA-Z0-9._-]/g, '_');
          const file = new File([csv], `ctx_${timestamp}_${safeName}.csv`, { type: 'text/csv' });
          
          if (manual) addMessage(AgentType.SYSTEM, "Uploading active context to server...");
          else console.log("Uploading active context to server...");

          const response = await mcpClient.uploadFile(file);
          if (response && response.file_info && response.file_info.saved_filename) {
              setActiveServerFilename(response.file_info.saved_filename);
              if (manual) {
                  addMessage(AgentType.SYSTEM, `Sync complete. Active context: ${response.file_info.saved_filename}`);
              } else {
                  console.log("Context synced:", response.file_info.saved_filename);
              }
          }
      } catch (e) {
          console.error("Context sync failed", e);
          if (manual) addMessage(AgentType.SYSTEM, "Manual sync failed. Check console for errors.");
      }
  }, [activeDataset, activeDatasetIds, datasets, mcpConnected, activeServerFilename]);

  // Sync active merged dataset to server automatically
  useEffect(() => {
    uploadActiveDataset(false);
  }, [uploadActiveDataset]);

  const handleManualSync = () => {
      uploadActiveDataset(true);
  };

  const handleManualMerge = () => {
      if (activeDatasetIds.length < 2) {
          addMessage(AgentType.SYSTEM, "Please select 2 or more datasets to merge.");
          return;
      }
      if (!activeDataset) return;

      const newId = `merged-${Date.now()}`;
      // Create a persistent copy of the currently computed 'activeDataset'
      const newDataset: Dataset = {
          ...activeDataset,
          id: newId,
          name: `Merged (${activeDatasetIds.length} files)`,
          serverFilename: undefined // Explicitly undefined so it gets uploaded on selection
      };

      setDatasets(prev => [...prev, newDataset]);
      // Switch selection to the new merged dataset
      setActiveDatasetIds([newId]);
      addMessage(AgentType.SYSTEM, `Merged ${activeDatasetIds.length} datasets into "${newDataset.name}" and added to file list.`);
  };

  useEffect(() => {
    const initSystem = async () => {
      const isOllamaUp = await checkOllamaConnection();
      setOllamaConnected(isOllamaUp);
      if (isOllamaUp) {
        addMessage(AgentType.SYSTEM, "AI Service: Connected to Ollama (Local).");
        const models = await getAvailableModels();
        setAvailableModels(models);
        
        if (models.length > 0) {
          const preferred = models.find(m => m.includes('llama3')) || models[0];
          setSelectedGeneralModel(preferred);
          setSelectedNeuroModel(preferred);
          setGeneralModel(preferred);
          setNeuroModel(preferred);
          
          const coderModel = models.find(m => m.includes('coder'));
          if (coderModel) {
            setVisualizerModel(coderModel);
          }
        }
      } else {
        addMessage(AgentType.SYSTEM, "CRITICAL WARNING: Could not connect to Ollama (http://127.0.0.1:11434). Ensure it is running with OLLAMA_ORIGINS=\"*\".");
      }

      try {
        await mcpClient.connect();
        const tools = await mcpClient.listTools();
        setMcpTools(tools);
        setMcpConnected(true);
        addMessage(AgentType.SYSTEM, `MCP Server: Connected. Found ${tools.length} tools: ${tools.map(t => t.name).join(', ')}.`);
      } catch (err) {
        console.error("Failed to connect to MCP:", err);
        addMessage(AgentType.SYSTEM, "Warning: Could not connect to MCP Server (localhost:8010). Using internal tools.");
      }
    };

    initSystem();
    return () => { mcpClient.disconnect(); };
  }, []);

  useEffect(() => {
    if (messages.length === 0) {
      addMessage(AgentType.SYSTEM, "Welcome to the CyberNeuro Multi-Agent System. Please upload neuroimaging datasets (CSV) to the File System to begin.");
    }
  }, []);



  const addMessage = (role: AgentType, content: string, metadata?: any): ChatMessage => {
    let usedModel: string | undefined;

    if (role === AgentType.ORCHESTRATOR || role === AgentType.GENERAL_PLANNER || role === AgentType.EXECUTOR) {
      usedModel = selectedGeneralModel;
    } else if (role === AgentType.PLAN_VALIDATOR || role === AgentType.NEURO_PLANNER || role === AgentType.PREPROCESSOR || role === AgentType.RESEARCHER || role === AgentType.PROPOSAL_REPORTER) {
      usedModel = selectedNeuroModel;
    }

    const msg: ChatMessage = {
      id: Date.now().toString() + Math.random(),
      role,
      content,
      timestamp: Date.now(),
      metadata: { ...metadata, model: usedModel }
    };
    
    setMessages(prev => [...prev, msg]);
    return msg;
  };



  // Generate a unique vizId
  const genVizId = () => `viz-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const addVisualization = (viz: ToolVisualization) => {
    // Ensure every visualization has a unique vizId
    const withId = viz.vizId ? viz : { ...viz, vizId: genVizId() };
    setVisualizations(prev => [withId, ...prev]);
  };

  const updateVisualization = (vizId: string, newData: any) => {
    setVisualizations(prev => prev.map(viz => 
      viz.vizId === vizId 
        ? { ...viz, data: newData }
        : viz
    ));
  };

  const handleHtmlChange = (vizId: string, newHtml: string) => {
    updateVisualization(vizId, { html: newHtml });
  };

  // Update chart config (axis labels, title, etc.) for inline property editing
  const handleConfigChange = (vizId: string, newConfig: any) => {
    setVisualizations(prev => prev.map(viz =>
      viz.vizId === vizId
        ? { ...viz, config: { ...(viz.config || {}), ...newConfig } }
        : viz
    ));
  };

  const loadData = (csvText: string, name: string, serverFilename?: string) => {
    const { columns, data } = parseCSV(csvText);
    const newId = Date.now().toString() + Math.random().toString().slice(2, 6);
    const newDataset: Dataset = { id: newId, name, columns, data, serverFilename };
    
    setDatasets(prev => {
        const next = [...prev, newDataset];
        if (prev.length === 0) {
            // First dataset
             addMessage(AgentType.SYSTEM, `Dataset "${name}" loaded.`);
        } else {
             addMessage(AgentType.SYSTEM, `Dataset "${name}" added to File System.`);
        }
        return next;
    });

    // Automatically select the new dataset
    setActiveDatasetIds(prev => [...prev, newDataset.id]);
    
    // Dynamic visualization is handled by useEffect watching activeDataset
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files) return;
    const fileList = Array.from(files);

    for (const file of fileList) {
        let serverFilename: string | undefined = undefined;
        
        // 1. Upload to MCP Server if connected
        if (mcpClient.isConnected) {
             try {
                addMessage(AgentType.SYSTEM, `Uploading "${file.name}" to analysis server...`);
                const response = await mcpClient.uploadFile(file);
                if (response && response.file_info && response.file_info.saved_filename) {
                    serverFilename = response.file_info.saved_filename;
                    addMessage(AgentType.SYSTEM, `Upload complete. Server filename: ${serverFilename}`);
                }
             } catch (error) {
                 console.error("Upload error", error);
                 addMessage(AgentType.SYSTEM, `Upload failed for "${file.name}". Local analysis only.`);
            }
        }

        // 2. Load locally
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            loadData(text, file.name, serverFilename);
        };
        reader.readAsText(file);
    }
  };

  // Stable wrapper so ChatArea doesn't get a new function reference every render
  const handleSingleFileUpload = useCallback((file: File) => {
    handleFileUpload(createFileList(file));
  }, []);

  const handleLoadDemo = () => {
    loadData(MOCK_CSV_DATA, "Amyloid_SUVR_Swapped.csv");
  };

  const removeDataset = (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setDatasets(prev => prev.filter(d => d.id !== id));
      setActiveDatasetIds(prev => prev.filter(did => did !== id));
  };

  const toggleDataset = (id: string) => {
    setActiveDatasetIds(prev => {
        if (prev.includes(id)) {
            return prev.filter(i => i !== id);
        } else {
            return [...prev, id];
        }
    });
  };

  const handleGeneralModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newModel = e.target.value;
    setSelectedGeneralModel(newModel);
    setGeneralModel(newModel);
    addMessage(AgentType.SYSTEM, `General Model switched to: ${newModel}`);
  };

  const handleNeuroModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newModel = e.target.value;
    setSelectedNeuroModel(newModel);
    setNeuroModel(newModel);
    addMessage(AgentType.SYSTEM, `Neuro Model switched to: ${newModel}`);
  };

  const parseMcpResultToVisualization = (toolName: string, content: string, currentData: DatasetRow[] = []): ToolVisualization | null => {
    try {
      const json = JSON.parse(content);
      // Check for GrowthCurveResult structure
      if (json.phenotype && json.data && json.data.centiles && Array.isArray(json.data.centiles)) {
          const vizData = { ...json };
          // Check if there is a 'colors' column in the dataset to use for overlayDot_color
          if (currentData.length > 0 && 'colors' in currentData[0]) {
              vizData.overlayDot_color = currentData.map(r => {
                  const val = parseFloat(String(r.colors));
                  return isNaN(val) ? 0 : val;
              });
          }
          return { type: VisualizationType.AGING_CURVE, title: `Aging Curve: ${json.phenotype}`, data: vizData };
      }
      
      if (json.r !== undefined && json.p !== undefined && Array.isArray(json.dataPoints)) {
        return { type: VisualizationType.SCATTER_PLOT, title: `Result: ${toolName}`, data: json };
      }
      if (json.stats && Array.isArray(json.stats) && json.pVal !== undefined) {
        return { type: VisualizationType.BOX_PLOT, title: `Result: ${toolName}`, data: json };
      }
      if (Array.isArray(json) && json.length > 0 && typeof json[0] === 'object') {
        return { type: VisualizationType.DATA_TABLE, title: `Output: ${toolName}`, data: json };
      }
    } catch (e) { }
    return null;
  };

  const getAgentForTool = (toolName: string): AgentType => {
    const t = toolName.toLowerCase();
    if (t === 'transform_data' || t.includes('preprocess')) return AgentType.PREPROCESSOR;
    if (t.includes('search') || t.includes('query') || t.includes('literature') || t.includes('web') || t.includes('google')) return AgentType.RESEARCHER;
    return AgentType.EXECUTOR;
  };

  const executeToolLogic = async (
      toolName: string, 
      params: any, 
      currentData: any[], 
      currentColumns: string[]
  ): Promise<{ resultText: string, viz: ToolVisualization | null, updatedData: any[], updatedColumns: string[], rawResult: any }> => {
      
      let stepResult = "";
      let viz: ToolVisualization | null = null;
      let newData = [...currentData];
      let newCols = [...currentColumns];
      let rawResult: any = null;

      const internalToolDef = INTERNAL_TOOLS.find(t => t.name === toolName);
      const mcpToolDef = mcpTools.find(t => t.name === toolName);

      if (internalToolDef) {
          if (toolName === 'TRANSFORM_DATA') {
              const col = params.column;
              if (newCols.includes(col)) {
                  const preMsg = addMessage(AgentType.PREPROCESSOR, `Analyzing column '${col}' to determine numeric mapping...`);
                  
                  const uniqueVals = Array.from(new Set(newData.map(row => row[col])));
                  const mappingResult = await generatePreprocessingMapping(col, uniqueVals as string[]);
                  const mapping = mappingResult.mapping;
                  const rationale = mappingResult.rationale;

                  setMessages(prev => prev.map(m => 
                    m.id === preMsg.id 
                      ? { ...m, content: `**Analysis of '${col}':** ${rationale || 'Mapping generated.'}` } 
                      : m
                  ));

                  const result = executeInternalTool(toolName, { ...params, mapping }, newData);
                  const transformResult = result as any;
                  
                  newData = transformResult.transformedData;
                  const newColName = transformResult.newColumn;
                  
                  if (!newCols.includes(newColName)) newCols.push(newColName);
                  
                  stepResult = `Converted '${col}' to '${newColName}' using mapping: ${JSON.stringify(mapping)}.`;
                  viz = {
                       type: VisualizationType.DATA_TABLE,
                       title: `Preprocessing: ${col} -> ${newColName}`,
                       data: Object.entries(mapping).map(([k,v]) => ({ Original: k, Numeric: v }))
                  };
                  rawResult = result;
              } else {
                  stepResult = `Error: Column '${col}' not found.`;
              }
          }
          else if (toolName === 'AVERAGE_MULTIPLE_COLUMNS') {
              const result = executeInternalTool(toolName, params, newData);
              const aggResult = result as any;
              
              newData = aggResult.transformedData;
              const newColName = aggResult.newColumn;
              
              if (!newCols.includes(newColName)) newCols.push(newColName);
              
              const matchedCount = aggResult.matchedColumns ? aggResult.matchedColumns.length : 0;
              const colsSnippet = aggResult.matchedColumns && aggResult.matchedColumns.length > 5 
                  ? aggResult.matchedColumns.slice(0, 5).join(', ') + '...' 
                  : aggResult.matchedColumns.join(', ');

              stepResult = `Created new column '${newColName}' by averaging ${matchedCount} columns matching '${params.condition}' (${colsSnippet}).`;
              viz = {
                   type: VisualizationType.DATA_TABLE,
                   title: `Aggregation: ${newColName}`,
                   data: newData // Show data with new column
              };
              rawResult = result;
          }
          else if (toolName === 'MODIFY_VISUALIZATION') {
              const result = executeInternalTool(toolName, params, newData);
              setVisualizations(prev => {
                  if (prev.length === 0) return prev;
                  const targetIndex = prev.findIndex(v => v.messageId === highlightedMessageId);
                  const indexToUpdate = targetIndex !== -1 ? targetIndex : 0;
                  const updated = [...prev];
                  const targetViz = { ...updated[indexToUpdate] };
                  targetViz.config = { ...targetViz.config, ...result };
                  if (result.title) targetViz.title = result.title;
                  updated[indexToUpdate] = targetViz;
                  return updated;
              });
              stepResult = `Updated visualization style: ${JSON.stringify(result)}`;
              rawResult = result;
          }
          else if (toolName === 'DATA_INSPECT') {
              const result = executeInternalTool(toolName, params, newData) as any;
              viz = { type: VisualizationType.DATA_TABLE, title: 'Data Inspection', data: result.data };
              stepResult = `Inspected data. Loaded ${result.data.length} rows.`;
              rawResult = result;
          }
          else {
              const result = executeInternalTool(toolName, params, newData);
              rawResult = result;
              
              // Generic handler for tools returning data mutation
              if ((result as any).transformedData) {
                  newData = (result as any).transformedData;
                  const nc = (result as any).newColumn;
                  if (nc && !newCols.includes(nc)) newCols.push(nc);
                  
                  if (toolName === 'SPECTRAL_CLUSTERING' && nc === 'colors') {
                     // Explicit context update message not strictly needed in UI, but useful for logs
                  }
              }

              if (toolName === 'CORRELATION_ANALYSIS') {
                  const corrResult = result as CorrelationResult;
                  const series = corrResult.series || [];
                  const primarySeries = series.length > 0 ? series[0] : { r: 0, p: 1, n: 0, name: 'No Data' };
                  
                  const vizData = {
                    ...corrResult,
                    xCol: corrResult.xCol || params.x_column || params.x || 'X',
                    yCol: corrResult.yCol || params.y_column || params.y || 'Y'
                  };
                  
                  const displayTitle = corrResult.groupCol 
                    ? `Grouped Correlation: ${vizData.xCol} vs ${vizData.yCol}`
                    : `Correlation: ${primarySeries.r.toFixed(2)}`;

                  viz = { type: VisualizationType.SCATTER_PLOT, title: displayTitle, data: vizData };
                  
                  if (corrResult.groupCol) {
                     stepResult = `Correlation Analysis grouped by ${corrResult.groupCol} complete. Found ${series.length} groups.`;
                     for (const s of series) {
                        stepResult += ` Group '${s.name}': R=${s.r.toFixed(5)}, p=${s.p.toExponential(5)}, n=${s.n}.`;
                     }
                  } else {
                     stepResult = `Correlation Analysis complete. R=${primarySeries.r.toFixed(5)}, p-value=${primarySeries.p.toExponential(5)}, n=${primarySeries.n}.`;
                  }
              } else if (toolName === 'GROUP_COMPARISON') {
                   const groupResult = result as any;
                   viz = { type: VisualizationType.BOX_PLOT, title: `Group Comparison`, data: groupResult };
                   stepResult = `Group Comparison complete. ANOVA p-value=${groupResult.pVal.toExponential(3)}.`;
              } else if (toolName === 'SPECTRAL_CLUSTERING') {
                   const clusterResult = result as any;
                   viz = { type: VisualizationType.CLUSTERING_DASHBOARD, title: `Spectral Clustering (k=${clusterResult.nCluster})`, data: clusterResult };
                   stepResult = `Spectral Clustering complete with ${clusterResult.nCluster} clusters.`;
                   if (clusterResult.newColumn) {
                       stepResult += ` Inserted cluster IDs into new column '${clusterResult.newColumn}'.`;
                   }
                   if (clusterResult.clusterCorrelation && clusterResult.clusterCorrelation.series && clusterResult.clusterCorrelation.series.length > 0) {
                        stepResult += ` Cluster correlation with target: r=${clusterResult.clusterCorrelation.series[0]?.r.toFixed(3)}.`;
                   }
              } else if (toolName === 'STRATIFY_DATASET') {
                   const stratResult = result as any;
                   newData = stratResult.transformedData;
                   // Update columns
                   stratResult.newColumns.forEach((c: string) => {
                       if (!newCols.includes(c)) newCols.push(c);
                   });
                   
                   viz = { 
                      type: VisualizationType.STRATIFICATION_RESULT, 
                      title: `Stratification: ${params.target_column} by ${params.group_column}`, 
                      data: stratResult.result 
                   };
                   
                   stepResult = `Stratified ${params.target_column} by ${params.group_column}. Created ${stratResult.newColumns.length} new columns: ${stratResult.newColumns.join(', ')}.`;
              } else if (toolName === 'SVM_CLASSIFICATION') {
                   const svmResult = result as any;
                   viz = { type: VisualizationType.SVM_BOUNDARY, title: `SVM Classification (${(svmResult.accuracy*100).toFixed(1)}% Acc)`, data: svmResult };
                   stepResult = `SVM Classification complete. Accuracy: ${(svmResult.accuracy * 100).toFixed(2)}%.`;
              }
          }
      }
      else if (mcpToolDef) {
         const args = { ...params };
         if (mcpToolDef.inputSchema.properties && 'data' in mcpToolDef.inputSchema.properties) {
            args.data = newData;
         }
         const result = await mcpClient.callTool(toolName, args);
         // Clone result to allow modifying isError if we detect application-level error
         rawResult = { ...result }; 

         const textContent = result.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
         stepResult = textContent || "Tool executed successfully.";
         
         // Try to detect error in JSON response even if HTTP was 200 (Application Level Error)
         try {
            const parsed = JSON.parse(textContent);
            
            // Use parsed data as rawResult for better summarization later if it's a valid object
            if (typeof parsed === 'object' && parsed !== null) {
                rawResult = parsed;
            }

            if (parsed && parsed.status === 'error') {
                if (typeof rawResult === 'object') rawResult.isError = true;
                const errMsg = parsed.error || parsed.message || textContent;
                stepResult = `Error: ${errMsg}`;
            }
         } catch(e) { /* ignore json parse error */ }

         viz = parseMcpResultToVisualization(toolName, textContent, newData);
         if (viz?.type === VisualizationType.AGING_CURVE && !rawResult.isError) stepResult = 'Aging curve successfully loaded';
         
         if (rawResult.isError) {
             if (!stepResult.startsWith("Error")) {
                  stepResult = `Error executing tool: ${stepResult}`;
             }
         }
      } 
      else {
         stepResult = `Unknown tool: ${toolName}. Skipping.`;
      }
      
      return { resultText: stepResult, viz, updatedData: newData, updatedColumns: newCols, rawResult };
  };

  const executePlanSteps = async (
    plan: any, 
    startStepIndex: number = 0, 
    initialParamsOverride: any = null,
    currentData: any[],
    currentColumns: string[],
    intent: 'RESEARCH' | 'GENERAL',
    stepClarification?: string,
    originalUserQuery?: string
  ) => {
    const resultsSummary: string[] = [];
    const stepIdToMessageId: Record<number, string> = {};

    const stepsToRun = plan.analysis_steps.slice(startStepIndex);
    const allTools = [...INTERNAL_TOOLS, ...mcpTools];

    let activeData = [...currentData];
    let activeCols = [...currentColumns];

    for (let i = 0; i < stepsToRun.length; i++) {
      const step = stepsToRun[i];
      const instruction = step.instruction;
      
      const executorThinkingMsg = addMessage(
        AgentType.EXECUTOR, 
        `Step ${step.step_id} - ${step.tool}\nInstruction: "${instruction}"\n\nThinking about tool parameters...`,
        { 
          plan, 
          stepIndex: startStepIndex + i, 
          tool: step.tool
        }
      );
      stepIdToMessageId[step.step_id] = executorThinkingMsg.id;

      let retryCount = 0;
      const MAX_RETRIES = 3;
      let stepSuccess = false;
      let executionError: string | null = null;
      
      // Snapshot state for this step to allow rollback on retry
      const stepStartData = [...activeData];
      const stepStartCols = [...activeCols];

      while (!stepSuccess && retryCount < MAX_RETRIES) {
        try {
            // Pass clarification on ALL retries for the first step, not just the first attempt
            const context = (i === 0) ? stepClarification : undefined;
            
            let previousResultsContext = resultsSummary.join('\n\n');
            
            if (executionError) {
                setMessages(prev => prev.map(m => 
                  m.id === executorThinkingMsg.id ? { 
                      ...m, 
                      content: `${m.content}\n\n⚠️ Attempt ${retryCount} Failed: ${executionError}\nRetrying (Attempt ${retryCount + 1}/${MAX_RETRIES})...` 
                  } : m
                ));
            }

            // Use stepStartCols for planning context to ensure we don't assume columns created in failed attempts
            const executorResult = await runExecutorAgent(
              instruction, 
              stepStartCols, 
              allTools, 
              context, 
              previousResultsContext,
              "Planner",
              activeServerFilename,
              executionError || "",
              step.tool  // pass planner's tool hint
            );
            
            if (executorResult.needs_clarification) {
               const question = executorResult.clarification_question || "I need clarification on the parameters.";
               
               setMessages(prev => prev.map(m => 
                  m.id === executorThinkingMsg.id ? { 
                      ...m, 
                      content: `${m.content}\n\n⚠️ **Low Confidence (${executorResult.confidence || '?'})**\n${(executorResult.thought || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim()}\n\n**Question:** ${question}` 
                  } : m
               ));

               setSuspendedState({
                   plan,
                   stepIndex: startStepIndex + i,
                   data: stepStartData,
                   columns: stepStartCols,
                   intent,
                   originalUserQuery: originalUserQuery 
               });
               return;
            }

            const toolCalls = executorResult.toolCalls;
            
            setMessages(prev => prev.map(m => 
              m.id === executorThinkingMsg.id ? { 
                  ...m, 
                  content: `${m.content}\n\nDecision: ${(executorResult.thought || "Tools selected.").replace(/<think>[\s\S]*?<\/think>/gi, '').trim()}` 
              } : m
            ));

            if (!toolCalls || toolCalls.length === 0) {
                throw new Error("Executor Agent decided no tools were needed.");
            }

            let stepAggregateResult = "";
            let attemptData = [...stepStartData];
            let attemptCols = [...stepStartCols];
            
            for (const call of toolCalls) {
                const toolName = call.tool;
                const params = call.parameters;
                const agentRole = getAgentForTool(toolName);
                
                if (agentRole !== AgentType.EXECUTOR) {
                   addMessage(agentRole, `Sub-task: Running ${toolName}...`);
                }

                const { resultText, viz, updatedData, updatedColumns, rawResult } = await executeToolLogic(
                    toolName, params, attemptData, attemptCols
                );
                
                // Check for explicit failure signals
                if (rawResult && rawResult.isError) {
                   throw new Error(`Tool ${toolName} failed: ${resultText}`);
                }
                if (resultText.startsWith("Error:")) {
                   throw new Error(resultText);
                }
                
                attemptData = updatedData;
                attemptCols = updatedColumns;

                if (viz) {
                  viz.messageId = executorThinkingMsg.id;
                  addVisualization(viz);
                }

                let finalStepResult = resultText;
                
                // Interpret key results for statistical tools
                if (rawResult) {
                    const summaryRaw = { ...rawResult };
                    if (summaryRaw.dataPoints && Array.isArray(summaryRaw.dataPoints)) summaryRaw.dataPoints = `[${summaryRaw.dataPoints.length} points]`;
                    if (summaryRaw.data && Array.isArray(summaryRaw.data)) summaryRaw.data = `[${summaryRaw.data.length} rows]`; 
                    
                    // Handle GrowthCurveResult (Aging Curve) specifically to avoid dumping massive centile arrays
                    if (summaryRaw.data && summaryRaw.data.centiles && summaryRaw.data.X) {
                         const count = summaryRaw.data.values ? summaryRaw.data.values.length : 0;
                         const xRange = summaryRaw.data.X.length > 0 ? `${Math.min(...summaryRaw.data.X).toFixed(1)}-${Math.max(...summaryRaw.data.X).toFixed(1)}` : 'N/A';
                         summaryRaw.data = `[Aging Curve: X range ${xRange}, ${count} overlay points plotted]`;
                    }

                    if (summaryRaw.subjectData) summaryRaw.subjectData = "payload";
                    if (summaryRaw.curveData) summaryRaw.curveData = "payload";
                    
                    const interpreted = await interpretToolResult(instruction, toolName, summaryRaw);
                    finalStepResult = `${resultText}\n\nKey Finding: ${interpreted}`;
                }
                
                stepAggregateResult += `\n- Tool: ${toolName}\n  Result: ${finalStepResult}`;
            }

            // If success, commit changes
            activeData = attemptData;
            activeCols = attemptCols;
            stepSuccess = true;

            // Sync changes to global state so UI and subsequent steps use updated data
            if (activeDataset) {
                setDatasets(prev => {
                    const targetId = activeDataset.id;
                    const exists = prev.some(d => d.id === targetId);
                    
                    // Create updated dataset object
                    // We clear serverFilename to force a re-sync/upload since data has changed
                    const updatedDataset: Dataset = {
                        ...activeDataset,
                        data: activeData,
                        columns: activeCols,
                        serverFilename: undefined 
                    };

                    if (exists) {
                        return prev.map(d => d.id === targetId ? updatedDataset : d);
                    } else {
                        // Persist transient merge
                        return [...prev, updatedDataset];
                    }
                });

                // If we started with a multi-file selection (transient merge), 
                // switch selection to the now-persisted merged dataset to maintain continuity
                if (activeDatasetIds.length > 1) {
                     setActiveDatasetIds([activeDataset.id]);
                }
            }

            setMessages(prev => prev.map(m => 
              m.id === executorThinkingMsg.id ? { ...m, content: `${m.content}\n\n✅ Execution Complete:${stepAggregateResult}` } : m
            ));
            
            resultsSummary.push(`Step ${step.step_id}: ${stepAggregateResult}`);

        } catch (e: any) {
           executionError = e.message;
           retryCount++;
           
           if (retryCount >= MAX_RETRIES) {
             setMessages(prev => prev.map(m => 
                m.id === executorThinkingMsg.id ? { ...m, content: `${m.content}\n\n❌ Execution Failed after ${MAX_RETRIES} attempts: ${e.message}` } : m
              ));
             resultsSummary.push(`Step ${step.step_id} FAILED: ${e.message}`);
           }
        }
      }

      if (!stepSuccess) {
          addMessage(AgentType.SYSTEM, `⛔ Workflow Halted: Step ${step.step_id} failed to execute after ${MAX_RETRIES} attempts.\n\nPlease click "Edit & Restart Step" on the failed message to correct the parameters or logic, then try again.`);
          return;
      }

      await new Promise(r => setTimeout(r, 1000));
    }

    if (intent === 'RESEARCH') {
      if (!isResearchReportEnabled) {
          addMessage(AgentType.SYSTEM, "Research Report generation skipped (disabled by user).");
      } else {
          let researcherActive = true;
          let loopCount = 0;
          const MAX_LOOPS = 3;
          let aggregatedResearcherNotes = "";

          addMessage(AgentType.RESEARCHER, "Analyzing findings and searching for external context...");

          while (researcherActive && loopCount < MAX_LOOPS) {
              const context = resultsSummary.join('\n');
              const researchTools = allTools.filter(t => {
                const name = t.name.toLowerCase();
                return name.includes('search') || name.includes('query') || name.includes('literature') || name.includes('pubmed') || name.includes('web') || name.includes('internet') || name.includes('google');
              });

              const decision = await generateResearchInsights(context, researchTools);
              
              if (decision.decision === 'TOOL_CALL') {
                const instruction = decision.instruction;
                if (instruction) {
                    loopCount++;
                    addMessage(AgentType.RESEARCHER, `Gathering info: "${instruction}"`, {
                        thought: decision.thought
                    });
                    try {
                        const previousResultsContext = resultsSummary.join('\n\n');
                        const executorResult = await runExecutorAgent(
                            instruction, 
                            activeCols, 
                            allTools, 
                            undefined, 
                            previousResultsContext,
                            AgentType.RESEARCHER, // Delegated by Researcher
                            activeServerFilename
                        );
                        const toolCalls = executorResult.toolCalls;
                        if (toolCalls && toolCalls.length > 0) {
                            for (const call of toolCalls) {
                                const toolName = call.tool;
                                const params = call.parameters;
                                const { resultText, viz, updatedData, updatedColumns } = await executeToolLogic(
                                    toolName, params, activeData, activeCols
                                );
                                activeData = updatedData;
                                activeCols = updatedColumns;
                                if (viz) {
                                    addVisualization({ ...viz, title: `Researcher: ${viz.title}` });
                                }
                                const note = `[Researcher Tool] ${toolName}: ${resultText}`;
                                addMessage(AgentType.RESEARCHER, `Found: ${resultText.substring(0, 150)}...`);
                                resultsSummary.push(note);
                                aggregatedResearcherNotes += "\n" + note;
                            }
                        } else {
                            addMessage(AgentType.RESEARCHER, "Executor found no applicable tools for research step.");
                        }
                    } catch (e: any) {
                        addMessage(AgentType.RESEARCHER, `Error executing researcher instruction: ${e.message}`);
                        researcherActive = false;
                    }
                } else {
                    researcherActive = false;
                }
              } else {
                // Researcher is done gathering info
                aggregatedResearcherNotes += `\n[Researcher Conclusions]: ${decision.report}`;
                researcherActive = false;
              }
          }
          
          // --- PROPOSAL REPORTER AGENT ---
          addMessage(AgentType.PROPOSAL_REPORTER, "Synthesizing analysis and research into a final proposal...");
          
          const finalReport = await generateProposalReport(originalUserQuery || "Research Analysis", resultsSummary.join('\n'), aggregatedResearcherNotes);
          
          const reporterMsg = addMessage(AgentType.PROPOSAL_REPORTER, "Final Proposal generated.");
          
          setMessages(prev => prev.map(m => m.id === reporterMsg.id ? { ...m, content: "Final Report Generated (See Visualizer)" } : m));
          
          addVisualization({
            type: VisualizationType.RESEARCH_REPORT,
            title: "Proposal Report",
            data: { report: finalReport, stepIdToMessageId },
            messageId: reporterMsg.id
          });
      }
    } else {
      addMessage(AgentType.SYSTEM, "Task complete.");
    }
  };

  const handleRestartFromStep = async (messageId: string, newParams: any) => {
    if (!activeDataset) return;
    const msgIndex = messages.findIndex(m => m.id === messageId);
    if (msgIndex === -1) return;

    const msg = messages[msgIndex];

    if (msg.role === AgentType.NEURO_PLANNER || msg.role === AgentType.GENERAL_PLANNER) {
        const newPlan = newParams;
        const intent = msg.role === AgentType.NEURO_PLANNER ? 'RESEARCH' : 'GENERAL';
        const newMessages = messages.slice(0, msgIndex + 1);
        newMessages[msgIndex] = {
            ...msg,
            metadata: { ...msg.metadata, plan: newPlan },
            content: `**Plan Updated Manually:**\n${newPlan.analysis_steps.map((s: any) => `${s.step_id}. ${s.tool}: ${s.description}`).join('\n')}\n\nRationale: ${newPlan.rationale || 'Manual update'}`
        };
        setMessages(newMessages);
        const validMessageIds = new Set(newMessages.map(m => m.id));
        setVisualizations(prev => prev.filter(v => !v.messageId || validMessageIds.has(v.messageId)));
        setIsProcessing(true);
        
        if (isPlanValidationEnabled) {
            addMessage(AgentType.PLAN_VALIDATOR, "Validating manually updated plan...");
            const validation = await validatePlan(newPlan, [...INTERNAL_TOOLS, ...mcpTools], activeDataset.columns);
            
            if (!validation.valid) {
                addMessage(AgentType.PLAN_VALIDATOR, `⚠️ Validation Error: ${validation.errors.join(', ')}\n\nSuggestion: ${validation.suggestions}`);
                setIsProcessing(false);
                return;
            }

            addMessage(AgentType.PLAN_VALIDATOR, "Plan validated successfully. Resuming execution...");
        } else {
            addMessage(AgentType.SYSTEM, "Validation disabled. Resuming execution with manual plan...");
        }
        
        await executePlanSteps(newPlan, 0, null, [...activeDataset.data], [...activeDataset.columns], intent, undefined, msg.content); // Simplified passing query
        setIsProcessing(false);
    }
  };

  // Apply LLM-edited code to a visualization
  const applyCodeEdit = (vizId: string, code: string) => {
    setVisualizations(prev => prev.map(viz =>
      viz.vizId === vizId ? { ...viz, customCode: code } : viz
    ));
  };

  // Handle visualization editing
  const handleVisualizationEdit = async (query: string): Promise<boolean> => {
    // Find the exact selected visualization by vizId
    const selectedViz = selectedVisualizationId
      ? visualizations.find(v => v.vizId === selectedVisualizationId)
      : null;

    if (!selectedViz) {
      addMessage(AgentType.SYSTEM, "Please select a chart from the visualization panel first, then describe the edit you'd like to make.");
      return false;
    }

    // Non-editable types
    const nonEditable = [VisualizationType.DATA_TABLE, VisualizationType.MARKDOWN_REPORT,
      VisualizationType.LITERATURE_LIST, VisualizationType.RESEARCH_REPORT, VisualizationType.NONE];
    if (nonEditable.includes(selectedViz.type)) {
      addMessage(AgentType.SYSTEM, `This visualization type (${selectedViz.type}) cannot be edited. Select a chart instead.`);
      return false;
    }

    const editMsg = addMessage(VISUALIZER_AGENT, `🔄 Editing "${selectedViz.title}"...`, {
      tool: 'visualizer_edit_chart',
      isVisualizerEdit: true,
      targetVizId: selectedViz.vizId
    });

    // Get the current code: either customCode (already edited) or generate from chart data
    const currentCode = selectedViz.customCode || chartDataToCode(selectedViz.type, selectedViz.data, selectedViz.config);
    if (!currentCode) {
      setMessages(prev => prev.map(m =>
        m.id === editMsg.id ? { ...m, content: `❌ Cannot generate code for this chart type (${selectedViz.type}).` } : m
      ));
      return false;
    }

    const result = await editChartCodeWithRetry(
      query,
      currentCode,
      visualizerModel,
      (progressText) => {
        setMessages(prev => prev.map(m =>
          m.id === editMsg.id ? { ...m, content: progressText } : m
        ));
      }
    );

    if (result.status === 'success' && result.code) {
      applyCodeEdit(selectedViz.vizId!, result.code);

      setMessages(prev => prev.map(m =>
        m.id === editMsg.id
          ? { ...m, content: `✅ Updated "${selectedViz.title}"!\n\nApplied: "${query}"` }
          : m
      ));

      setHighlightedMessageId(selectedViz.messageId || null);
      setTimeout(() => setHighlightedMessageId(null), 2000);
      return true;
    } else {
      setMessages(prev => prev.map(m =>
        m.id === editMsg.id ? { ...m, content: `❌ Failed: ${result.message}` } : m
      ));
      return false;
    }
  };

  // Original query handler
  const handleUserQuery = async (query: string) => {
    // If a visualization is selected, route ALL queries to viz editor
    if (selectedVisualizationId) {
      setIsProcessing(true);
      try {
        addMessage(AgentType.USER, query);
        await handleVisualizationEdit(query);
      } catch (error) {
        console.error('Visualization edit error:', error);
        addMessage(AgentType.SYSTEM, `Error editing visualization: ${error}`);
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    if (!activeDataset) {
        addMessage(AgentType.SYSTEM, "Please select or upload a dataset first.");
        return;
    }
    
    addMessage(AgentType.USER, query);
    setIsProcessing(true);

    if (suspendedState) {
       addMessage(AgentType.SYSTEM, "Received clarification. Resuming execution...");
       try {
           const { plan, stepIndex, data, columns, intent, originalUserQuery } = suspendedState;
           setSuspendedState(null);
           await executePlanSteps(plan, stepIndex, null, data, columns, intent, query, originalUserQuery);
       } catch (error) {
           addMessage(AgentType.SYSTEM, "Error resuming execution.");
       } finally {
           setIsProcessing(false);
       }
       return;
    }

    try {
      if (!ollamaConnected) {
         const recheck = await checkOllamaConnection();
         if (!recheck) {
            addMessage(AgentType.SYSTEM, "Error: Ollama is still unreachable.");
            setIsProcessing(false);
            return;
         }
         setOllamaConnected(true);
      }

      addMessage(AgentType.ORCHESTRATOR, "Evaluating query intent...");
      const intent = await classifyQuery(query);
      addMessage(AgentType.ORCHESTRATOR, `Identified intent: ${intent}`);

      const allTools = [...INTERNAL_TOOLS, ...mcpTools];
      let plan: any = { analysis_steps: [] };
      let planIsValid = false;
      let planningRetries = 0;
      const MAX_PLANNING_RETRIES = 3;
      let currentFeedback = "";
      
      // Build conversation context
      const chatHistory = buildConversationContext(messages, isContextMemoryEnabled ? 3 : 0);

      while (!planIsValid && planningRetries < MAX_PLANNING_RETRIES) {
        if (intent === 'RESEARCH') {
          addMessage(AgentType.NEURO_PLANNER, planningRetries === 0 ? "Formulating research analysis plan..." : "Refining research plan based on feedback...");
          plan = await generateNeuroPlan(query, activeDataset.columns.join(', '), allTools, currentFeedback, chatHistory);
          // Guard: ensure analysis_steps is an array
          if (!Array.isArray(plan?.analysis_steps)) {
            console.warn('Planner returned invalid plan shape:', plan);
            plan = { analysis_steps: [], rationale: plan?.rationale || 'Planner returned an invalid response.' };
          }
          addMessage(AgentType.NEURO_PLANNER, `Plan created:\n${plan.analysis_steps.map((s: any) => `${s.step_id}. ${s.tool}\n   Instruction: ${s.instruction}`).join('\n')}\n\nRationale: ${plan.rationale}`, { plan });
        } else {
          addMessage(AgentType.GENERAL_PLANNER, planningRetries === 0 ? "Formulating general task plan..." : "Refining general plan based on feedback...");
          plan = await generateGeneralPlan(query, allTools, currentFeedback, chatHistory);
          // Guard: ensure analysis_steps is an array
          if (!Array.isArray(plan?.analysis_steps)) {
            console.warn('Planner returned invalid plan shape:', plan);
            plan = { analysis_steps: [], rationale: plan?.rationale || 'Planner returned an invalid response.' };
          }
          addMessage(AgentType.GENERAL_PLANNER, `Plan created:\n${plan.analysis_steps.map((s: any) => `${s.step_id}. ${s.tool}: ${s.description}`).join('\n')}`, { plan });
        }

        if (isPlanValidationEnabled) {
          addMessage(AgentType.PLAN_VALIDATOR, "Verifying analysis steps...");
          const validation = await validatePlan(plan, allTools, activeDataset.columns);

          if (validation.valid) {
            planIsValid = true;
            addMessage(AgentType.PLAN_VALIDATOR, "Plan verified. Proceeding to execution.");
          } else {
            planningRetries++;
            const errors = validation.errors || [];
            currentFeedback = `Validation errors: ${errors.join(', ')}. Suggestions: ${validation.suggestions || 'None'}`;
            addMessage(AgentType.PLAN_VALIDATOR, `Plan rejected (Attempt ${planningRetries}/${MAX_PLANNING_RETRIES}):\n${errors.map((e: string) => `- ${e}`).join('\n')}\n\nProviding feedback to Planner for correction...`);
            
            if (planningRetries >= MAX_PLANNING_RETRIES) {
              addMessage(AgentType.SYSTEM, "Critical: Planning failed to stabilize after multiple validation cycles. Stopping execution.");
              setIsProcessing(false);
              return;
            }
          }
        } else {
          planIsValid = true;
          addMessage(AgentType.SYSTEM, "Plan Validation skipped (disabled). Proceeding to execution.");
        }
      }

      await executePlanSteps(plan, 0, null, [...activeDataset.data], [...activeDataset.columns], intent, undefined, query);

    } catch (error) {
      console.error(error);
      addMessage(AgentType.SYSTEM, "An error occurred during the workflow.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleVizClick = (vizId?: string) => {
    if (!vizId) return;
    // Check if it's a dataset ID for toggling
    if (datasets.some(d => d.id === vizId)) {
        toggleDataset(vizId);
        return;
    }
    // Find the viz by vizId, fallback to messageId for report link clicks
    const viz = visualizations.find(v => v.vizId === vizId) 
             || visualizations.find(v => v.messageId === vizId);
    if (!viz) return;

    const resolvedVizId = viz.vizId!;

    // Highlight the associated chat message
    if (viz.messageId) setHighlightedMessageId(viz.messageId);

    // Toggle: if already selected, deselect; otherwise select
    if (selectedVisualizationId === resolvedVizId) {
      setSelectedVisualizationId(null);
    } else {
      setSelectedVisualizationId(resolvedVizId);
      addMessage(AgentType.SYSTEM, `🎨 Editing: **${viz.title || 'Visualization'}**. Type your changes in the chat. Click the chart again or press ✕ to stop editing.`);
    }
  };

  // Get the currently selected visualization info for the chat indicator
  const selectedVisualization = selectedVisualizationId 
    ? visualizations.find(v => v.vizId === selectedVisualizationId) 
    : null;


  // Header – plain JSX, NOT a component function (avoids remount flashing)
  const header = (
    <header className="mb-4 flex-none flex flex-col gap-2">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
          <span className="bg-indigo-600 p-1 rounded-lg">CN</span>
          CyberNeuro <span className="text-slate-500 font-normal">Platform</span>
        </h1>
        <div className="flex items-center gap-4">
          {/* <button
            onClick={() => {
              const mockVizs = getAllMockVisualizations();
              const ts = Date.now();
              let firstVizId = '';
              mockVizs.forEach((viz, index) => {
                const vizId = `mock-viz-${ts}-${index}`;
                const newViz = { ...viz, vizId, messageId: `mock-msg-${ts}-${index}` };
                if (index === 0) firstVizId = vizId;
                addVisualization(newViz);
              });
              if (firstVizId) setSelectedVisualizationId(firstVizId);
              addMessage(AgentType.SYSTEM, `Loaded ${mockVizs.length} mock visualizations. Click any visualization and edit it via chat!`);
            }}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-violet-900/50 hover:bg-violet-800/50 border border-violet-700 rounded text-violet-300 transition-colors"
            title="Load mock neuroimaging visualizations"
          >
            <Database className="w-3 h-3" />
            Mock Data
          </button> */}
          
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${ollamaConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-xs text-slate-500">Ollama</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${mcpConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-xs text-slate-500">MCP</span>
          </div>
        </div>
      </div>
      
      {availableModels.length > 0 && (
        <div className="flex flex-col gap-2 text-xs">
          <div className="flex gap-2">
          <div className="flex flex-col gap-1 w-1/3">
            <label className="text-slate-500">General Model</label>
            <select 
              value={selectedGeneralModel} 
              onChange={handleGeneralModelChange}
              className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-300 focus:outline-none focus:border-indigo-500"
            >
              {availableModels.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1 w-1/3">
            <label className="text-slate-500">Neuro Model</label>
            <select 
              value={selectedNeuroModel} 
              onChange={handleNeuroModelChange}
              className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-300 focus:outline-none focus:border-indigo-500"
            >
              {availableModels.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1 w-1/3">
            <label className="text-slate-500 flex items-center gap-1">
              <Pencil className="w-3 h-3" /> Visualizer
            </label>
            <select 
              value={visualizerModel} 
              onChange={(e) => setVisualizerModel(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-300 focus:outline-none focus:border-cyan-500"
            >
              {availableModels.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          </div>

          <div className="flex items-center pt-2 gap-4">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={isPlanValidationEnabled} 
                    onChange={(e) => setIsPlanValidationEnabled(e.target.checked)} 
                    className="sr-only peer" 
                  />
                  <div className="w-8 h-4 bg-slate-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-500/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[0px] after:left-[0px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                  <span className="ml-2 text-xs text-slate-400">Plan Validator</span>
                </label>

                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={isResearchReportEnabled} 
                    onChange={(e) => setIsResearchReportEnabled(e.target.checked)} 
                    className="sr-only peer" 
                  />
                  <div className="w-8 h-4 bg-slate-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-500/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[0px] after:left-[0px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                  <span className="ml-2 text-xs text-slate-400">Researcher & Reporter</span>
                </label>

                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={isContextMemoryEnabled} 
                    onChange={(e) => setIsContextMemoryEnabled(e.target.checked)} 
                    className="sr-only peer" 
                  />
                  <div className="w-8 h-4 bg-slate-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-500/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[0px] after:left-[0px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                  <span className="ml-2 text-xs text-slate-400">Context Memory</span>
                </label>
          </div>
        </div>
      )}

      
      {selectedVisualizationId && (
        <div className="flex items-center gap-2 text-xs bg-cyan-900/30 border border-cyan-800 rounded px-3 py-1.5">
          <Pencil className="w-3 h-3 text-cyan-400" />
          <span className="text-cyan-300">
            Editing: <strong>{selectedVisualization?.title || 'Visualization'}</strong> ({selectedVisualization?.type || ''})
          </span>
          <button 
            onClick={() => setSelectedVisualizationId(null)}
            className="ml-auto text-cyan-500 hover:text-cyan-300"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
    </header>
  );

  // Left panel – plain JSX element (NOT a component function, avoids remount flashing)
  const leftPanel = (
    <div className="p-4 flex flex-col h-full border-r border-slate-800">
      {header}
      <div className="flex-1 min-h-0">
        <VisualizerArea 
          visualizations={visualizations} 
          datasetName={activeDataset?.name} 
          onVizClick={handleVizClick}
          onHtmlChange={handleHtmlChange}
          onCodeChange={applyCodeEdit}
          onConfigChange={handleConfigChange}
          activeDatasetIds={activeDatasetIds}
          selectedVisualizationId={selectedVisualizationId}
          isProcessing={isProcessing}
        />
      </div>
    </div>
  );

  // Right panel – plain JSX element (NOT a component function, avoids remount flashing)
  const rightPanel = (
    <div className="h-full flex flex-col relative">
      {/* Editing Banner - shows when a visualization is selected */}
      {selectedVisualizationId && selectedVisualization && (
        <div className="flex-none bg-gradient-to-r from-cyan-900/40 via-indigo-900/40 to-slate-900/40 border-b border-cyan-700/50 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-cyan-600 rounded-lg">
                <Pencil className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">
                  Editing: {selectedVisualization.title}
                </h3>
                <p className="text-xs text-cyan-200/70">
                  Type your changes below &bull; {selectedVisualization.type}
                </p>
              </div>
            </div>
            <button
              onClick={() => setSelectedVisualizationId(null)}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/80 hover:bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-200 transition-colors"
            >
              <X className="w-4 h-4" />
              Stop Editing
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0">
        <ChatArea 
          messages={messages} 
          onSendMessage={handleUserQuery} 
          onFileUpload={handleSingleFileUpload}
          onLoadDemo={handleLoadDemo}
          isProcessing={isProcessing}
          hasData={!!activeDataset}
          highlightedMessageId={highlightedMessageId}
          onRestartStep={handleRestartFromStep}
          placeholder={selectedVisualizationId ? `Describe changes to "${selectedVisualization?.title || 'visualization'}"...` : undefined}
          datasets={datasets}
          activeDatasetIds={activeDatasetIds}
          onDatasetToggle={toggleDataset}
          onDatasetRemove={removeDataset}
          onMultiFileUpload={handleFileUpload}
          onMergeDatasets={handleManualMerge}
          onSyncDataset={handleManualSync}
        />
      </div>
    </div>
  );

  return (
    <div className="h-screen w-full overflow-hidden bg-slate-950 text-slate-200">
      <ResizablePanels
        leftPanel={leftPanel}
        rightPanel={rightPanel}
        defaultLeftWidth={50}
        minLeftWidth={25}
        maxLeftWidth={75}
        localStorageKey="neuroagent-panel-width"
      />
    </div>
  );
};

// Helper to wrap single file in FileList-like object for compatibility
function createFileList(file: File): FileList {
    const dt = new DataTransfer();
    dt.items.add(file);
    return dt.files;
}

export default App;
