
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
import ChatArea from './components/Chat/ChatArea';
import VisualizerArea from './components/Visualizer/VisualizerArea';

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
    setMessages(prev => [...prev, msg]);
    return msg;
  };

  const addVisualization = (viz: ToolVisualization) => {
    setVisualizations(prev => [viz, ...prev]);
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

      try {
          const context = (i === 0) ? stepClarification : undefined;
          
          // Inject Server File Context for Executor (Merged/Active Dataset)
          const fileContext = activeServerFilename 
            ? `\n\n[Server Context] The merged/active dataset is available on the MCP server as: '${activeServerFilename}'. Use this filename for tools that require a 'filename' or 'filepath'.` 
            : "";

          const previousResultsContext = resultsSummary.join('\n\n') + fileContext;

          const executorResult = await runExecutorAgent(
            instruction, 
            activeCols, 
            allTools, 
            context, 
            previousResultsContext,
            "Planner" // Delegated by Planner for main plan execution
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
                 data: activeData,
                 columns: activeCols,
                 intent,
                 originalUserQuery: originalUserQuery // Save original query to resume later
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
          
          for (const call of toolCalls) {
              const toolName = call.tool;
              const params = call.parameters;
              const agentRole = getAgentForTool(toolName);
              
              if (agentRole !== AgentType.EXECUTOR) {
                 addMessage(agentRole, `Sub-task: Running ${toolName}...`);
              }

              const { resultText, viz, updatedData, updatedColumns, rawResult } = await executeToolLogic(
                  toolName, params, activeData, activeCols
              );
              
              activeData = updatedData;
              activeCols = updatedColumns;

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

          setMessages(prev => prev.map(m => 
            m.id === executorThinkingMsg.id ? { ...m, content: `${m.content}\n\n✅ Execution Complete:${stepAggregateResult}` } : m
          ));
          
          resultsSummary.push(`Step ${step.step_id}: ${stepAggregateResult}`);

      } catch (e: any) {
         setMessages(prev => prev.map(m => 
            m.id === executorThinkingMsg.id ? { ...m, content: `${m.content}\n\n❌ Execution Error: ${e.message}` } : m
          ));
         resultsSummary.push(`Step ${step.step_id} FAILED: ${e.message}`);
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
                         AgentType.RESEARCHER // Delegated by Researcher
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

  const handleUserQuery = async (query: string) => {
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
    }
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-950 text-slate-200">
      <div className="w-1/2 p-4 flex flex-col h-full border-r border-slate-800">
        <header className="mb-4 flex-none flex flex-col gap-2">
           <div className="flex justify-between items-center">
            <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <span className="bg-indigo-600 p-1 rounded-lg">NA</span>
              NeuroAgent <span className="text-slate-500 font-normal">Platform</span>
            </h1>
            <div className="flex items-center gap-4">
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
            <div className="flex flex-col gap-2 text-xs mt-2">
              <div className="flex gap-2">
                  <div className="flex flex-col gap-1 w-1/2">
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
                  <div className="flex flex-col gap-1 w-1/2">
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
              </div>
              
              <div className="flex items-center pt-2">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={isPlanValidationEnabled} 
                    onChange={(e) => setIsPlanValidationEnabled(e.target.checked)} 
                    className="sr-only peer" 
                  />
                  <div className="w-8 h-4 bg-slate-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-500/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[0px] after:left-[0px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                  <span className="ml-2 text-xs text-slate-400">Enable Plan Validator</span>
                </label>
              </div>
            </div>
          )}
        </header>
        <div className="flex-1 min-h-0">
          <VisualizerArea 
            visualizations={visualizations} 
            datasetName={activeDataset?.name} 
            onVizClick={handleVizClick}
            activeDatasetIds={activeDatasetIds}
          />
        </div>
      </div>

      <div className="w-1/2 h-full flex flex-col">
        <ChatArea 
          messages={messages} 
          onSendMessage={handleUserQuery} 
          onFileUpload={(file) => handleFileUpload(createFileList(file))}
          onLoadDemo={handleLoadDemo}
          isProcessing={isProcessing}
          hasData={!!activeDataset}
          highlightedMessageId={highlightedMessageId}
          onRestartStep={handleRestartFromStep}
          datasets={datasets}
          activeDatasetIds={activeDatasetIds}
          onDatasetToggle={toggleDataset}
          onDatasetRemove={removeDataset}
          onMultiFileUpload={handleFileUpload}
        />
      </div>
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
