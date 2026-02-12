
import React, { useState, useEffect } from 'react';
import { 
  AgentType, ChatMessage, Dataset, ToolVisualization, VisualizationType, McpTool 
} from './types';
import { MOCK_CSV_DATA } from './constants';
import { parseCSV } from './utils/stats';
import { 
  generatePlan, 
  generateResearchInsights, 
  generateLiterature, 
  checkOllamaConnection, 
  getAvailableModels, 
  setModel 
} from './services/ollamaService';
import { mcpClient } from './services/mcpService';
import { INTERNAL_TOOLS, executeInternalTool } from './services/internalTools';
import ChatArea from './components/Chat/ChatArea';
import VisualizerArea from './components/Visualizer/VisualizerArea';

const App: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [visualizations, setVisualizations] = useState<ToolVisualization[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [mcpTools, setMcpTools] = useState<McpTool[]>([]);
  const [mcpConnected, setMcpConnected] = useState(false);
  const [ollamaConnected, setOllamaConnected] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('llama3');

  // Initialize System (Ollama + MCP)
  useEffect(() => {
    const initSystem = async () => {
      // 1. Check Ollama Connection and fetch models
      const isOllamaUp = await checkOllamaConnection();
      setOllamaConnected(isOllamaUp);
      if (isOllamaUp) {
        addMessage(AgentType.SYSTEM, "AI Service: Connected to Ollama (Local).");
        const models = await getAvailableModels();
        setAvailableModels(models);
        
        if (models.length > 0) {
          // Prefer 'llama3' if available, otherwise take the first one
          const preferred = models.find(m => m.includes('llama3')) || models[0];
          setSelectedModel(preferred);
          setModel(preferred);
        }
      } else {
        addMessage(AgentType.SYSTEM, "CRITICAL WARNING: Could not connect to Ollama (http://127.0.0.1:11434). Ensure it is running with OLLAMA_ORIGINS=\"*\".");
      }

      // 2. Connect to MCP
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
    
    return () => {
      mcpClient.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Welcome message (only if empty)
  useEffect(() => {
    if (messages.length === 0) {
      addMessage(AgentType.SYSTEM, "Welcome to the NeuroAgent Multi-Agent System. Please upload a neuroimaging dataset (CSV) or load the demo data.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addMessage = (role: AgentType, content: string) => {
    setMessages(prev => [...prev, {
      id: Date.now().toString() + Math.random(),
      role,
      content,
      timestamp: Date.now()
    }]);
  };

  const addVisualization = (viz: ToolVisualization) => {
    setVisualizations(prev => [viz, ...prev]);
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

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newModel = e.target.value;
    setSelectedModel(newModel);
    setModel(newModel);
    addMessage(AgentType.SYSTEM, `AI Model switched to: ${newModel}`);
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
      // Heuristics to determine visualization type from JSON result
      
      // 1. Correlation result
      if (json.r !== undefined && json.p !== undefined && Array.isArray(json.dataPoints)) {
        return {
          type: VisualizationType.SCATTER_PLOT,
          title: `Result: ${toolName}`,
          data: json
        };
      }
      
      // 2. Group Stats result
      if (json.stats && Array.isArray(json.stats) && json.pVal !== undefined) {
        return {
          type: VisualizationType.BOX_PLOT,
          title: `Result: ${toolName}`,
          data: json
        };
      }

      // 3. Generic Table (Array of objects)
      if (Array.isArray(json) && json.length > 0 && typeof json[0] === 'object') {
        return {
           type: VisualizationType.DATA_TABLE,
           title: `Output: ${toolName}`,
           data: json
        };
      }

    } catch (e) {
      // Content is simple text, no visualization
    }
    return null;
  };

  // --- The Agent Orchestrator Logic ---
  const handleUserQuery = async (query: string) => {
    if (!dataset) return;
    
    addMessage(AgentType.USER, query);
    setIsProcessing(true);

    try {
      // Check connection again before running
      if (!ollamaConnected) {
         const recheck = await checkOllamaConnection();
         if (!recheck) {
            addMessage(AgentType.SYSTEM, "Error: Ollama is still unreachable. Cannot proceed with AI planning.");
            setIsProcessing(false);
            return;
         }
         setOllamaConnected(true);
      }

      // 1. PLANNER AGENT
      addMessage(AgentType.PLANNER, "Analyzing query and formulating execution plan...");
      
      // Combine internal tools and MCP tools for the planner
      const allTools = [...INTERNAL_TOOLS, ...mcpTools];
      const plan = await generatePlan(query, dataset.columns.join(', '), allTools);
      addMessage(AgentType.PLANNER, `Plan created:\n${plan.analysis_steps.map((s: any) => `${s.step_id}. ${s.tool}: ${s.description}`).join('\n')}\n\nRationale: ${plan.rationale}`);

      const resultsSummary: string[] = [];

      // 2. EXECUTOR AGENT
      for (const step of plan.analysis_steps) {
        addMessage(AgentType.EXECUTOR, `Executing Step ${step.step_id}: ${step.tool}...`);
        
        let stepResult = "";
        let viz: ToolVisualization | null = null;

        const internalToolDef = INTERNAL_TOOLS.find(t => t.name === step.tool);
        const mcpToolDef = mcpTools.find(t => t.name === step.tool);

        // A. EXECUTE INTERNAL TOOL
        if (internalToolDef) {
            try {
                const result = executeInternalTool(step.tool, step.parameters, dataset.data);
                
                if (step.tool === 'MODIFY_VISUALIZATION') {
                    // Update existing visualization state
                    setVisualizations(prev => {
                        if (prev.length === 0) return prev;
                        const updated = [...prev];
                        const latest = { ...updated[0] };
                        latest.config = { ...latest.config, ...result };
                        if (result.title) latest.title = result.title;
                        updated[0] = latest;
                        return updated;
                    });
                    stepResult = `Updated visualization style: ${JSON.stringify(result)}`;
                }
                else if (step.tool === 'CORRELATION_ANALYSIS') {
                    // Cast result to any to access specific properties of the union member
                    const corrResult = result as any;
                    
                    // Reconstruct xCol/yCol from parameters as calculateCorrelation doesn't return them
                    const vizData = {
                      ...corrResult,
                      xCol: step.parameters.x_column || step.parameters.x || 'X',
                      yCol: step.parameters.y_column || step.parameters.y || 'Y'
                    };

                    viz = {
                        type: VisualizationType.SCATTER_PLOT,
                        title: `Correlation: ${corrResult.r.toFixed(2)}`,
                        data: vizData
                    };
                    stepResult = `Correlation Analysis complete. R=${corrResult.r.toFixed(3)}, p-value=${corrResult.p.toExponential(3)}.`;
                } else if (step.tool === 'GROUP_COMPARISON') {
                     const groupResult = result as any;
                     viz = {
                        type: VisualizationType.BOX_PLOT,
                        title: `Group Comparison`,
                        data: groupResult
                     };
                     stepResult = `Group Comparison complete. ANOVA p-value=${groupResult.pVal.toExponential(3)}.`;
                }
            } catch (e: any) {
                stepResult = `Internal Tool Error: ${e.message}`;
            }
        }
        // B. EXECUTE MCP TOOL
        else if (mcpToolDef) {
          try {
             // For simplicity, passing all parameters, plus the full dataset if the tool supports it.
             const args = { ...step.parameters };
             if (mcpToolDef.inputSchema.properties && 'data' in mcpToolDef.inputSchema.properties) {
                args.data = dataset.data;
             }
             
             const result = await mcpClient.callTool(step.tool, args);
             
             // Extract text content
             const textContent = result.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
             stepResult = textContent || "Tool executed successfully (no text output).";
             
             // Try to visualize result
             viz = parseMcpResultToVisualization(step.tool, textContent);
             
             if (result.isError) {
               stepResult = `Error executing tool: ${stepResult}`;
             }
          } catch (e: any) {
            stepResult = `MCP Execution Failed: ${e.message}`;
          }
        } 
        // C. EXECUTE FALLBACK / HARDCODED TOOLS
        else if (step.tool === 'DATA_INSPECT') {
           viz = {
             type: VisualizationType.DATA_TABLE,
             title: 'Data Inspection',
             data: dataset.data
           };
           stepResult = `Inspected data. Loaded ${dataset.data.length} rows.`;
        } 
        else if (step.tool === 'LITERATURE_SEARCH') {
           const topic = step.description.replace('Search literature for', '').trim();
           const papers = await generateLiterature(topic);
           viz = {
             type: VisualizationType.LITERATURE_LIST,
             title: `Literature: ${topic}`,
             data: papers
           };
           stepResult = `Found ${papers.length} relevant papers.`;
        }
        else {
           stepResult = `Unknown tool: ${step.tool}. Skipping.`;
        }

        addMessage(AgentType.EXECUTOR, stepResult);
        if (viz) addVisualization(viz);
        
        resultsSummary.push(`Step ${step.step_id} (${step.tool}): ${stepResult}`);
        await new Promise(r => setTimeout(r, 1000));
      }

      // 3. RESEARCHER AGENT
      addMessage(AgentType.RESEARCHER, "Reviewing findings...");
      const finalInsights = await generateResearchInsights(resultsSummary.join('\n'));
      addMessage(AgentType.RESEARCHER, finalInsights);

    } catch (error) {
      console.error(error);
      addMessage(AgentType.SYSTEM, "An error occurred during the workflow.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-950 text-slate-200">
      <div className="w-1/2 p-4 flex flex-col h-full border-r border-slate-800">
        <header className="mb-4 flex-none flex justify-between items-center">
          <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <span className="bg-indigo-600 p-1 rounded-lg">NA</span>
            NeuroAgent <span className="text-slate-500 font-normal">Platform</span>
          </h1>
          <div className="flex items-center gap-4">
            {availableModels.length > 0 && (
              <select 
                value={selectedModel} 
                onChange={handleModelChange}
                className="bg-slate-800 border border-slate-700 text-xs rounded px-2 py-1 text-slate-300 focus:outline-none focus:border-indigo-500"
              >
                {availableModels.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            )}

            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${ollamaConnected ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-xs text-slate-500">Ollama</span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${mcpConnected ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-xs text-slate-500">MCP</span>
            </div>
          </div>
        </header>
        <div className="flex-1 min-h-0">
          <VisualizerArea visualizations={visualizations} datasetName={dataset?.name} />
        </div>
      </div>

      <div className="w-1/2 h-full flex flex-col">
        <ChatArea 
          messages={messages} 
          onSendMessage={handleUserQuery} 
          onFileUpload={handleFileUpload}
          onLoadDemo={handleLoadDemo}
          isProcessing={isProcessing}
          hasData={!!dataset}
        />
      </div>
    </div>
  );
};

export default App;
