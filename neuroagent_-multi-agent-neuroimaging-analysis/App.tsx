import React, { useState, useEffect, useMemo } from 'react';
import { 
  AgentType, ChatMessage, Dataset, ToolVisualization, VisualizationType, McpTool, SuspendedState 
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
} from './services/ollamaService';
import { mcpClient } from './services/mcpService';
import { INTERNAL_TOOLS, executeInternalTool } from './services/internalTools';
import { 
  editVisualizationHtmlDirect,
  editVisualizationHtmlWithStreaming,
  isVisualizationEditRequest,
  getActiveHtmlVisualization 
} from './services/visualizerService';
import ChatArea from './components/Chat/ChatArea';
import VisualizerArea from './components/Visualizer/VisualizerArea';
import ResizablePanels from './components/ResizablePanels';
import { X, Pencil, Database, Palette, ChevronRight } from 'lucide-react';
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

  // NEW: Visualization Mode - when enabled, ALL queries go to viz editor only
  const [visualizationMode, setVisualizationMode] = useState(false);
  // Store viz mode messages separately
  const [vizModeMessages, setVizModeMessages] = useState<ChatMessage[]>([]);

  // Plan Validator Toggle
  const [isPlanValidationEnabled, setIsPlanValidationEnabled] = useState<boolean>(true);

  const [suspendedState, setSuspendedState] = useState<SuspendedState | null>(null);

  // Derived active dataset (merged)
  const activeDataset = useMemo(() => {
    const selected = datasets.filter(d => activeDatasetIds.includes(d.id));
    return mergeDatasets(selected);
  }, [datasets, activeDatasetIds]);

  // Sync active merged dataset to server
  useEffect(() => {
    const syncDatasetToServer = async () => {
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
          
          console.log("Uploading active context to server...");
          const response = await mcpClient.uploadFile(file);
          if (response && response.file_info && response.file_info.saved_filename) {
              setActiveServerFilename(response.file_info.saved_filename);
              console.log("Context synced:", response.file_info.saved_filename);
          }
      } catch (e) {
          console.error("Context sync failed", e);
      }
    };

    syncDatasetToServer();
  }, [activeDataset, mcpConnected]);

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
      addMessage(AgentType.SYSTEM, "Welcome to the NeuroAgent Multi-Agent System. Please upload neuroimaging datasets (CSV) to the File System to begin.");
    }
  }, []);

  // Initialize viz mode welcome message
  useEffect(() => {
    if (visualizationMode && vizModeMessages.length === 0) {
      const welcomeMsg: ChatMessage = {
        id: 'viz-welcome-' + Date.now(),
        role: AgentType.SYSTEM,
        content: "🎨 **Visualization Mode Active**\n\nAll messages will be processed as visualization edits. You can:\n\n• Create charts with Plotly.js or Chart.js\n• Add bars, lines, scatter plots\n• Modify colors, titles, labels\n• Add insights and annotations\n\nClick a visualization on the left to select it, or type to create a new one.",
        timestamp: Date.now()
      };
      setVizModeMessages([welcomeMsg]);
    }
  }, [visualizationMode]);

  const addMessage = (role: AgentType, content: string, metadata?: any): ChatMessage => {
    let usedModel: string | undefined;

    if (role === AgentType.ORCHESTRATOR || role === AgentType.GENERAL_PLANNER || role === AgentType.EXECUTOR) {
      usedModel = selectedGeneralModel;
    } else if (role === AgentType.NEURO_PLANNER || role === AgentType.PLAN_VALIDATOR || role === AgentType.PREPROCESSOR || role === AgentType.RESEARCHER || role === AgentType.PROPOSAL_REPORTER) {
      usedModel = selectedNeuroModel;
    }

    const msg: ChatMessage = {
      id: Date.now().toString() + Math.random(),
      role,
      content,
      timestamp: Date.now(),
      metadata: { ...metadata, model: usedModel }
    };
    
    // Add to appropriate message list based on mode
    if (visualizationMode) {
      setVizModeMessages(prev => [...prev, msg]);
    } else {
      setMessages(prev => [...prev, msg]);
    }
    return msg;
  };

  // Add message specifically to viz mode
  const addVizModeMessage = (role: AgentType, content: string, metadata?: any): ChatMessage => {
    const msg: ChatMessage = {
      id: Date.now().toString() + Math.random(),
      role,
      content,
      timestamp: Date.now(),
      metadata: { ...metadata, model: visualizerModel }
    };
    setVizModeMessages(prev => [...prev, msg]);
    return msg;
  };

  const addVisualization = (viz: ToolVisualization) => {
    setVisualizations(prev => [viz, ...prev]);
  };

  const updateVisualization = (messageId: string, newData: any) => {
    setVisualizations(prev => prev.map(viz => 
      viz.messageId === messageId 
        ? { ...viz, data: newData }
        : viz
    ));
  };

  const handleHtmlChange = (messageId: string, newHtml: string) => {
    updateVisualization(messageId, { html: newHtml });
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

    // Show initial viz linked to this dataset
    setVisualizations(prevViz => [{
        type: VisualizationType.DATA_TABLE,
        title: `Data Inspection: ${name}`,
        data: data,
        datasetId: newDataset.id
    }, ...prevViz]);
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

  const parseMcpResultToVisualization = (toolName: string, content: string): ToolVisualization | null => {
    try {
      const json = JSON.parse(content);
      // Check for GrowthCurveResult structure
      if (json.phenotype && json.data && json.data.centiles && Array.isArray(json.data.centiles)) {
          return { type: VisualizationType.AGING_CURVE, title: `Aging Curve: ${json.phenotype}`, data: json };
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
              
              stepResult = `Created new column '${newColName}' by averaging: ${params.columns.join(', ')}.`;
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
              
              if (toolName === 'CORRELATION_ANALYSIS') {
                  const corrResult = result as any;
                  const vizData = {
                    ...corrResult,
                    xCol: params.x_column || params.x || 'X',
                    yCol: params.y_column || params.y || 'Y'
                  };
                  viz = { type: VisualizationType.SCATTER_PLOT, title: `Correlation: ${corrResult.r.toFixed(2)}`, data: vizData };
                  stepResult = `Correlation Analysis complete. R=${corrResult.r.toFixed(3)}, p-value=${corrResult.p.toExponential(3)}.`;
              } else if (toolName === 'GROUP_COMPARISON') {
                   const groupResult = result as any;
                   viz = { type: VisualizationType.BOX_PLOT, title: `Group Comparison`, data: groupResult };
                   stepResult = `Group Comparison complete. ANOVA p-value=${groupResult.pVal.toExponential(3)}.`;
              } else if (toolName === 'SPECTRAL_CLUSTERING') {
                   const clusterResult = result as any;
                   viz = { type: VisualizationType.CLUSTERING_DASHBOARD, title: `Spectral Clustering (k=${clusterResult.nCluster})`, data: clusterResult };
                   stepResult = `Spectral Clustering complete with ${clusterResult.nCluster} clusters. Cluster correlation with target: r=${clusterResult.clusterCorrelation.r.toFixed(3)}.`;
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
              }
          }
      }
      else if (mcpToolDef) {
         const args = { ...params };
         if (mcpToolDef.inputSchema.properties && 'data' in mcpToolDef.inputSchema.properties) {
            args.data = newData;
         }
         const result = await mcpClient.callTool(toolName, args);
         rawResult = result;
         const textContent = result.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
         stepResult = textContent || "Tool executed successfully.";
         viz = parseMcpResultToVisualization(toolName, textContent);
         if (viz?.type === VisualizationType.AGING_CURVE) stepResult = 'Aging curve successfully loaded';
         if (result.isError) stepResult = `Error executing tool: ${stepResult}`;
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
            const context = (i === 0 && retryCount === 0) ? stepClarification : undefined;
            
            let previousResultsContext = resultsSummary.join('\n\n');
            
            if (executionError) {
                previousResultsContext += `\n\n[SYSTEM MESSAGE]: The previous attempt to execute this step failed with error: "${executionError}". Please adjust your tool parameters or choice to fix this.`;
                
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
              activeServerFilename 
            );
            
            if (executorResult.needs_clarification) {
               const question = executorResult.clarification_question || "I need clarification on the parameters.";
               
               setMessages(prev => prev.map(m => 
                  m.id === executorThinkingMsg.id ? { 
                      ...m, 
                      content: `${m.content}\n\n⚠️ **Low Confidence (${executorResult.confidence || '?'})**\n${executorResult.thought || ''}\n\n**Question:** ${question}` 
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
                  content: `${m.content}\n\nDecision: ${executorResult.thought || "Tools selected."}` 
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

      await new Promise(r => setTimeout(r, 1000));
    }

    if (intent === 'RESEARCH') {
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

  // Handle visualization editing (used by both modes)
  const handleVisualizationEdit = async (query: string, useVizModeMessages: boolean = false): Promise<boolean> => {
    const activeViz = getActiveHtmlVisualization(visualizations, selectedVisualizationId || undefined);
    
    const addMsg = useVizModeMessages ? addVizModeMessage : addMessage;
    const setMsgs = useVizModeMessages ? setVizModeMessages : setMessages;
    
    if (!activeViz) {
      // Create new visualization
      const starterHtml = `<div class="visualizationCard bg-slate-900 rounded-xl border border-slate-700 p-4">
  <div class="vc-header">
    <h3 class="vc-title text-slate-100 font-semibold text-base text-center">New Visualization</h3>
    <p class="vc-subtitle text-slate-400 text-xs text-center mt-1">Created by VisualizerAgent</p>
  </div>
  <div class="vc-body mt-3">
    <div id="chart" class="chart-container" style="width:100%;height:300px;"></div>
  </div>
</div>`;

      const vizMsg = addMsg(VISUALIZER_AGENT, `🔄 Creating visualization...`, {
        tool: 'visualizer_edit_html',
        isVisualizerEdit: true
      });

      const result = await editVisualizationHtmlWithStreaming(
        query, 
        starterHtml, 
        visualizerModel,
        (progressText, isDone) => {
          setMsgs(prev => prev.map(m => 
            m.id === vizMsg.id 
              ? { ...m, content: progressText }
              : m
          ));
        }
      );
      
      if (result.status === 'success' && result.html) {
        const newViz: ToolVisualization = {
          type: VisualizationType.VIS_HTML,
          title: 'Custom Visualization',
          data: { html: result.html, heightPx: 400 },
          messageId: vizMsg.id
        };
        addVisualization(newViz);
        setSelectedVisualizationId(vizMsg.id);
        
        setMsgs(prev => prev.map(m => 
          m.id === vizMsg.id 
            ? { ...m, content: `✅ Visualization created!\n\nApplied: "${query}"` }
            : m
        ));
        return true;
      } else {
        setMsgs(prev => prev.map(m => 
          m.id === vizMsg.id 
            ? { ...m, content: `❌ Failed: ${result.message}` }
            : m
        ));
        return false;
      }
    }

    // Edit existing visualization
    const currentHtml = activeViz.data?.html;
    if (!currentHtml) {
      addMsg(AgentType.SYSTEM, "Error: Selected visualization has no HTML content.");
      return false;
    }
    
    const editMsg = addMsg(VISUALIZER_AGENT, `🔄 Editing visualization...`, {
      tool: 'visualizer_edit_html',
      isVisualizerEdit: true,
      targetVizId: activeViz.messageId
    });

    const result = await editVisualizationHtmlWithStreaming(
      query, 
      currentHtml, 
      visualizerModel,
      (progressText, isDone) => {
        setMsgs(prev => prev.map(m => 
          m.id === editMsg.id 
            ? { ...m, content: progressText }
            : m
        ));
      }
    );

    if (result.status === 'success' && result.html) {
      updateVisualization(activeViz.messageId!, { 
        html: result.html, 
        heightPx: activeViz.data?.heightPx || 400 
      });
      
      setMsgs(prev => prev.map(m => 
        m.id === editMsg.id 
          ? { ...m, content: `✅ Updated!\n\nApplied: "${query}"${result.warnings ? `\n\n⚠️ ${result.warnings.join(', ')}` : ''}` }
          : m
      ));
      
      setHighlightedMessageId(activeViz.messageId || null);
      setTimeout(() => setHighlightedMessageId(null), 2000);
      
      return true;
    } else {
      setMsgs(prev => prev.map(m => 
        m.id === editMsg.id 
          ? { ...m, content: `❌ Failed: ${result.message}` }
          : m
      ));
      return false;
    }
  };

  // NEW: Handle queries in Visualization Mode - ALWAYS goes to viz editor
  const handleVisualizationModeQuery = async (query: string) => {
    // Add user message to viz mode messages
    const userMsg: ChatMessage = {
      id: Date.now().toString() + Math.random(),
      role: AgentType.USER,
      content: query,
      timestamp: Date.now()
    };
    setVizModeMessages(prev => [...prev, userMsg]);
    
    setIsProcessing(true);
    try {
      await handleVisualizationEdit(query, true);
    } catch (error) {
      console.error('Visualization edit error:', error);
      addVizModeMessage(AgentType.SYSTEM, `Error: ${error}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Original query handler for normal mode
  const handleUserQuery = async (query: string) => {
    // If in visualization mode, route to viz handler
    if (visualizationMode) {
      await handleVisualizationModeQuery(query);
      return;
    }

    // Normal mode: check for viz edit requests
    const hasSelectedVizHtml = selectedVisualizationId !== null && 
      visualizations.some(v => v.messageId === selectedVisualizationId && v.type === VisualizationType.VIS_HTML);
    
    const isVizEdit = isVisualizationEditRequest(query, hasSelectedVizHtml);
    
    if (isVizEdit && hasSelectedVizHtml) {
      setIsProcessing(true);
      try {
        addMessage(AgentType.USER, query);
        await handleVisualizationEdit(query, false);
      } catch (error) {
        console.error('Visualization edit error:', error);
        addMessage(AgentType.SYSTEM, `Error editing visualization: ${error}`);
      } finally {
        setIsProcessing(false);
      }
      return;
    }
    
    const hasVizHtml = visualizations.some(v => v.type === VisualizationType.VIS_HTML);
    if (isVizEdit && !activeDataset && (hasVizHtml || query.toLowerCase().includes('create') || query.toLowerCase().includes('new visualization'))) {
      setIsProcessing(true);
      try {
        addMessage(AgentType.USER, query);
        await handleVisualizationEdit(query, false);
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

      while (!planIsValid && planningRetries < MAX_PLANNING_RETRIES) {
        if (intent === 'RESEARCH') {
          addMessage(AgentType.NEURO_PLANNER, planningRetries === 0 ? "Formulating research analysis plan..." : "Refining research plan based on feedback...");
          plan = await generateNeuroPlan(query, activeDataset.columns.join(', '), allTools, currentFeedback);
          addMessage(AgentType.NEURO_PLANNER, `Plan created:\n${plan.analysis_steps.map((s: any) => `${s.step_id}. ${s.tool}\n   Instruction: ${s.instruction}`).join('\n')}\n\nRationale: ${plan.rationale}`, { plan });
        } else {
          addMessage(AgentType.GENERAL_PLANNER, planningRetries === 0 ? "Formulating general task plan..." : "Refining general plan based on feedback...");
          plan = await generateGeneralPlan(query, allTools, currentFeedback);
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
            currentFeedback = `Validation errors: ${validation.errors.join(', ')}. Suggestions: ${validation.suggestions}`;
            addMessage(AgentType.PLAN_VALIDATOR, `Plan rejected (Attempt ${planningRetries}/${MAX_PLANNING_RETRIES}):\n${validation.errors.map((e: string) => `- ${e}`).join('\n')}\n\nProviding feedback to Planner for correction...`);
            
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

  const handleVizClick = (id?: string) => {
    // Check if ID corresponds to a dataset ID for toggling selection
    if (id && datasets.some(d => d.id === id)) {
        toggleDataset(id);
    }
    // Otherwise check if it's a message ID
    else if (id) {
        setHighlightedMessageId(id);
        const clickedViz = visualizations.find(v => v.messageId === id);
        if (clickedViz?.type === VisualizationType.VIS_HTML) {
          setSelectedVisualizationId(id);
        }
    }
  };

  // Toggle visualization mode
  const toggleVisualizationMode = () => {
    setVisualizationMode(prev => !prev);
    // Auto-select first VIS_HTML if entering viz mode
    if (!visualizationMode) {
      const firstVizHtml = visualizations.find(v => v.type === VisualizationType.VIS_HTML);
      if (firstVizHtml?.messageId) {
        setSelectedVisualizationId(firstVizHtml.messageId);
      }
    }
  };

  // Header component
  const Header = () => (
    <header className="mb-4 flex-none flex flex-col gap-2">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
          <span className="bg-indigo-600 p-1 rounded-lg">NA</span>
          NeuroAgent <span className="text-slate-500 font-normal">Platform</span>
        </h1>
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              const testViz: ToolVisualization = {
                type: VisualizationType.VIS_HTML,
                title: 'Editable Visualization',
                data: {
                  html: `<div class="visualizationCard bg-slate-900 rounded-xl border border-slate-700 p-4">
  <div class="vc-header">
    <h3 class="vc-title text-slate-100 font-semibold text-base text-center">Sample Chart</h3>
    <p class="vc-subtitle text-slate-400 text-xs text-center mt-1">Edit me via chat!</p>
  </div>
  <div class="vc-body mt-3">
    <div id="chart" class="chart-container" style="width:100%;height:280px;display:flex;align-items:center;justify-content:center;border:1px solid #334155;border-radius:0.5rem;color:#64748b;">
      Chart placeholder - ask me to create a chart!
    </div>
  </div>
</div>`,
                  heightPx: 380
                },
                messageId: 'test-viz-' + Date.now()
              };
              addVisualization(testViz);
              setSelectedVisualizationId(testViz.messageId!);
              if (!visualizationMode) {
                addMessage(AgentType.SYSTEM, "Created a test visualization. Click on it and type edit commands in the chat!");
              } else {
                addVizModeMessage(AgentType.SYSTEM, "Created a new visualization. Type your edit commands below!");
              }
            }}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-emerald-900/50 hover:bg-emerald-800/50 border border-emerald-700 rounded text-emerald-300 transition-colors"
            title="Create a test VIS_HTML visualization"
          >
            <Pencil className="w-3 h-3" />
            + Test Viz
          </button>

          <button
            onClick={() => {
              const mockVizs = getAllMockVisualizations();
              mockVizs.forEach((viz, index) => {
                const newViz = { ...viz, messageId: `mock-viz-${Date.now()}-${index}` };
                addVisualization(newViz);
              });
              setSelectedVisualizationId(`mock-viz-${Date.now()}-0`);
              if (!visualizationMode) {
                addMessage(AgentType.SYSTEM, `Loaded ${mockVizs.length} mock visualizations. Click any visualization and edit it via chat!`);
              } else {
                addVizModeMessage(AgentType.SYSTEM, `Loaded ${mockVizs.length} mock visualizations. Select one and start editing!`);
              }
            }}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-violet-900/50 hover:bg-violet-800/50 border border-violet-700 rounded text-violet-300 transition-colors"
            title="Load mock neuroimaging visualizations"
          >
            <Database className="w-3 h-3" />
            Mock Data
          </button>
          
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
      
      {availableModels.length > 0 && !visualizationMode && (
        <div className="flex gap-2 text-xs">
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
      )}

      {/* Visualizer model selector in viz mode */}
      {visualizationMode && availableModels.length > 0 && (
        <div className="flex gap-2 text-xs">
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-slate-500 flex items-center gap-1">
              <Palette className="w-3 h-3" /> Visualizer Model
            </label>
            <select 
              value={visualizerModel} 
              onChange={(e) => setVisualizerModel(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-300 focus:outline-none focus:border-pink-500"
            >
              {availableModels.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </div>
      )}
      
      {selectedVisualizationId && !visualizationMode && (
        <div className="flex items-center gap-2 text-xs bg-cyan-900/30 border border-cyan-800 rounded px-3 py-1.5">
          <Pencil className="w-3 h-3 text-cyan-400" />
          <span className="text-cyan-300">Editing visualization - type changes in chat</span>
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

  // Left panel (Visualizations)
  const LeftPanel = () => (
    <div className="p-4 flex flex-col h-full border-r border-slate-800">
      <Header />
      <div className="flex-1 min-h-0">
        <VisualizerArea 
          visualizations={visualizations} 
          datasetName={activeDataset?.name} 
          onVizClick={handleVizClick}
          onHtmlChange={handleHtmlChange}
          activeDatasetIds={activeDatasetIds}
        />
      </div>
    </div>
  );

  // Right panel (Chat) - shows different content based on mode
  const RightPanel = () => (
    <div className="h-full flex flex-col relative">
      {/* Visualization Mode Banner */}
      {visualizationMode && (
        <div className="flex-none bg-gradient-to-r from-pink-900/50 via-purple-900/50 to-indigo-900/50 border-b border-pink-700/50 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-pink-600 rounded-lg">
                <Palette className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Visualization Mode</h3>
                <p className="text-xs text-pink-200/70">All messages go to visualization editor only</p>
              </div>
            </div>
            <button
              onClick={toggleVisualizationMode}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/80 hover:bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-200 transition-colors"
            >
              <X className="w-4 h-4" />
              Exit Mode
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0">
        <ChatArea 
          messages={visualizationMode ? vizModeMessages : messages} 
          onSendMessage={handleUserQuery} 
          onFileUpload={visualizationMode ? undefined : (file: File) => handleFileUpload(createFileList(file))}
          onLoadDemo={visualizationMode ? undefined : handleLoadDemo}
          isProcessing={isProcessing}
          hasData={visualizationMode ? true : !!activeDataset}
          highlightedMessageId={highlightedMessageId}
          onRestartStep={visualizationMode ? undefined : handleRestartFromStep}
          datasets={datasets}
          activeDatasetIds={activeDatasetIds}
          onDatasetToggle={toggleDataset}
          onDatasetRemove={removeDataset}
          onMultiFileUpload={handleFileUpload}
        />
      </div>

      {/* Floating Visualization Mode Button - only show when NOT in viz mode */}
      {!visualizationMode && (
        <button
          onClick={toggleVisualizationMode}
          className="absolute bottom-20 right-4 flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 rounded-full text-white shadow-lg shadow-pink-900/50 transition-all hover:scale-105 hover:shadow-xl hover:shadow-pink-900/50"
          title="Enter Visualization Mode - all queries go to viz editor"
        >
          <Palette className="w-5 h-5" />
          <span className="font-medium">Visualization & Edits</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );

  return (
    <div className="h-screen w-full overflow-hidden bg-slate-950 text-slate-200">
      <ResizablePanels
        leftPanel={<LeftPanel />}
        rightPanel={<RightPanel />}
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
