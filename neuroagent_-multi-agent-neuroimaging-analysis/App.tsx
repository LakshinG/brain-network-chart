import React, { useState, useEffect } from 'react';
import { 
  AgentType, ChatMessage, Dataset, ToolVisualization, VisualizationType, McpTool 
} from './types';
import { MOCK_CSV_DATA } from './constants';
import { parseCSV } from './utils/stats';
import { 
  generateNeuroPlan,
  generateGeneralPlan,
  classifyQuery,
  generateResearchInsights, 
  generatePreprocessingMapping,
  validatePlan,
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
  const [dataset, setDataset] = useState<Dataset | null>(null);
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
      addMessage(AgentType.SYSTEM, "Welcome to the NeuroAgent Multi-Agent System. Please upload a neuroimaging dataset (CSV) or load the demo data.");
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

    if (role === AgentType.ORCHESTRATOR || role === AgentType.GENERAL_PLANNER) {
      usedModel = selectedGeneralModel;
    } else if (role === AgentType.NEURO_PLANNER || role === AgentType.PLAN_VALIDATOR || role === AgentType.PREPROCESSOR || role === AgentType.RESEARCHER) {
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

  const handleFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      loadData(text, file.name);
    };
    reader.readAsText(file);
  };

  const handleLoadDemo = () => {
    loadData(MOCK_CSV_DATA, "Amyloid_SUVR_Swapped.csv");
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

  const loadData = (csvText: string, name: string) => {
    const { columns, data } = parseCSV(csvText);
    setDataset({ name, columns, data });
    addMessage(AgentType.SYSTEM, `Dataset "${name}" loaded with ${data.length} rows and columns: ${columns.join(', ')}.`);
    setVisualizations([{
      type: VisualizationType.DATA_TABLE,
      title: 'Data Inspection',
      data: data
    }]);
  };

  const parseMcpResultToVisualization = (toolName: string, content: string): ToolVisualization | null => {
    try {
      const json = JSON.parse(content);
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
      agentRole: AgentType, 
      currentData: any[], 
      currentColumns: string[]
  ): Promise<{ resultText: string, viz: ToolVisualization | null, updatedData: any[], updatedColumns: string[] }> => {
      
      let stepResult = "";
      let viz: ToolVisualization | null = null;
      let newData = [...currentData];
      let newCols = [...currentColumns];

      const internalToolDef = INTERNAL_TOOLS.find(t => t.name === toolName);
      const mcpToolDef = mcpTools.find(t => t.name === toolName);

      if (internalToolDef) {
          stepResult = await executeInternalTool(toolName, params, newData);
          viz = parseMcpResultToVisualization(toolName, stepResult);
      } else if (mcpToolDef) {
          const result = await mcpClient.callTool(toolName, params);
          if (result.isError) {
              stepResult = `Error: ${result.content.map((c: any) => c.text || '').join(' ')}`;
          } else {
              stepResult = result.content.map((c: any) => c.text || '').join('\n');
              viz = parseMcpResultToVisualization(toolName, stepResult);
          }
      } else {
          stepResult = `Tool "${toolName}" not found.`;
      }

      if (agentRole === AgentType.PREPROCESSOR && viz?.type === VisualizationType.DATA_TABLE) {
          newData = viz.data;
          if (newData.length > 0) {
              newCols = Object.keys(newData[0]);
          }
      }

      return { resultText: stepResult, viz, updatedData: newData, updatedColumns: newCols };
  };

  const executePlanSteps = async (
    plan: any, 
    startStep: number, 
    modifiedParams: any,
    initialData: any[],
    initialColumns: string[],
    intent: string
  ) => {
    let currentData = [...initialData];
    let currentColumns = [...initialColumns];
    const stepIdToMessageId: Record<number, string> = {};

    for (let i = startStep; i < plan.analysis_steps.length; i++) {
      const step = plan.analysis_steps[i];
      const agentRole = getAgentForTool(step.tool);
      const isModifiedStep = (i === startStep && modifiedParams !== null);
      const params = isModifiedStep ? modifiedParams : step.params;

      const stepMsg = addMessage(agentRole, `Executing Step ${step.step_id}: ${step.tool}...`, {
        tool: step.tool,
        params: params,
        step_id: step.step_id
      });
      stepIdToMessageId[step.step_id] = stepMsg.id;

      const { resultText, viz, updatedData, updatedColumns } = await executeToolLogic(
        step.tool, 
        params, 
        agentRole, 
        currentData, 
        currentColumns
      );
      
      currentData = updatedData;
      currentColumns = updatedColumns;

      if (viz) {
        viz.messageId = stepMsg.id;
        addVisualization(viz);
      }
      
      setMessages(prev => prev.map(m => 
        m.id === stepMsg.id 
          ? { ...m, content: `Step ${step.step_id} Complete: ${step.tool}\nResult: ${resultText.substring(0, 300)}...` } 
          : m
      ));
    }

    if (intent === 'RESEARCH') {
      addMessage(AgentType.RESEARCHER, "Synthesizing final research report...");
      const allTools = [...INTERNAL_TOOLS, ...mcpTools];
      const report = await generateResearchInsights(
        plan.analysis_steps.map((s: any) => `${s.step_id}. ${s.tool}: ${s.description}`).join('\n'),
        allTools
      );
      
      const reportMsg = addMessage(AgentType.RESEARCHER, "Research Report Generated.");
      const reportViz: ToolVisualization = {
        type: VisualizationType.RESEARCH_REPORT,
        title: 'Research Summary',
        data: { report, stepIdToMessageId },
        messageId: reportMsg.id
      };
      addVisualization(reportViz);
    }
  };

  const handleRestartFromStep = async (messageId: string, newParams: any) => {
    if (!dataset) return;

    const msgIndex = messages.findIndex(m => m.id === messageId);
    if (msgIndex === -1) return;

    const msg = messages[msgIndex];

    if (msg.metadata?.step_id) {
        const stepIndex = msg.metadata.step_id - 1;
        const plannerMessage = [...messages].reverse().find(
            m => (m.role === AgentType.NEURO_PLANNER || m.role === AgentType.GENERAL_PLANNER) && m.metadata?.plan
        );
        if (!plannerMessage?.metadata?.plan) return;

        const plan = plannerMessage.metadata.plan;
        const newMessages = messages.slice(0, msgIndex);
        setMessages(newMessages);
        const validMessageIds = new Set(newMessages.map(m => m.id));
        setVisualizations(prev => prev.filter(v => !v.messageId || validMessageIds.has(v.messageId)));
        setIsProcessing(true);
        addMessage(AgentType.SYSTEM, `Restarting execution from Step ${stepIndex + 1} with updated parameters...`);
        await executePlanSteps(plan, stepIndex, newParams, [...dataset.data], [...dataset.columns], 'RESEARCH');
        setIsProcessing(false);
    } 
    else if (msg.role === AgentType.NEURO_PLANNER || msg.role === AgentType.GENERAL_PLANNER) {
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
        
        addMessage(AgentType.PLAN_VALIDATOR, "Validating manually updated plan...");
        const validation = await validatePlan(newPlan, [...INTERNAL_TOOLS, ...mcpTools], dataset.columns);
        
        if (!validation.valid) {
            addMessage(AgentType.PLAN_VALIDATOR, `⚠️ Validation Error: ${validation.errors.join(', ')}\n\nSuggestion: ${validation.suggestions}`);
            setIsProcessing(false);
            return;
        }

        addMessage(AgentType.PLAN_VALIDATOR, "Plan validated successfully. Resuming execution...");
        await executePlanSteps(newPlan, 0, null, [...dataset.data], [...dataset.columns], intent);
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

    // Normal mode logic...
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
    if (isVizEdit && !dataset && (hasVizHtml || query.toLowerCase().includes('create') || query.toLowerCase().includes('new visualization'))) {
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

    if (!dataset) {
      addMessage(AgentType.USER, query);
      addMessage(AgentType.SYSTEM, "Please upload a dataset first before asking questions.");
      return;
    }
    
    addMessage(AgentType.USER, query);
    setIsProcessing(true);

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
          plan = await generateNeuroPlan(query, dataset.columns.join(', '), allTools, currentFeedback);
          addMessage(AgentType.NEURO_PLANNER, `Plan created:\n${plan.analysis_steps.map((s: any) => `${s.step_id}. ${s.tool}: ${s.description}`).join('\n')}\n\nRationale: ${plan.rationale}`, { plan });
        } else {
          addMessage(AgentType.GENERAL_PLANNER, planningRetries === 0 ? "Formulating general task plan..." : "Refining general plan based on feedback...");
          plan = await generateGeneralPlan(query, allTools, currentFeedback);
          addMessage(AgentType.GENERAL_PLANNER, `Plan created:\n${plan.analysis_steps.map((s: any) => `${s.step_id}. ${s.tool}: ${s.description}`).join('\n')}`, { plan });
        }

        addMessage(AgentType.PLAN_VALIDATOR, "Verifying analysis steps...");
        const validation = await validatePlan(plan, allTools, dataset.columns);

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
      }

      await executePlanSteps(plan, 0, null, [...dataset.data], [...dataset.columns], intent);

    } catch (error) {
      console.error(error);
      addMessage(AgentType.SYSTEM, "An error occurred during the workflow.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleVizClick = (messageId?: string) => {
    if (messageId) {
      setHighlightedMessageId(messageId);
      const clickedViz = visualizations.find(v => v.messageId === messageId);
      if (clickedViz?.type === VisualizationType.VIS_HTML) {
        setSelectedVisualizationId(messageId);
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
          datasetName={dataset?.name} 
          onVizClick={handleVizClick}
          onHtmlChange={handleHtmlChange}
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
          onFileUpload={visualizationMode ? undefined : handleFileUpload}
          onLoadDemo={visualizationMode ? undefined : handleLoadDemo}
          isProcessing={isProcessing}
          hasData={visualizationMode ? true : !!dataset}
          highlightedMessageId={highlightedMessageId}
          onRestartStep={visualizationMode ? undefined : handleRestartFromStep}
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

export default App;