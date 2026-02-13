
import { McpTool, McpToolCallResult } from '../types';

// Connection to Python FastAPI MCP Server
// Endpoints: GET /health, GET /api/schema, POST /api/tools/{name}
const MCP_API_URL = 'http://127.0.0.1:8010';

export class McpService {
  public isConnected = false;

  constructor() {}

  async connect(): Promise<void> {
    console.log(`MCP: Connecting to REST API at ${MCP_API_URL}...`);
    try {
      const response = await fetch(`${MCP_API_URL}/health`);
      if (response.ok) {
        this.isConnected = true;
        console.log('MCP: Connected to FastAPI server');
      } else {
        throw new Error(`Health check failed: ${response.statusText}`);
      }
    } catch (error) {
      console.warn('MCP: Connection Failed', error);
      this.isConnected = false;
      // We don't throw here to allow the app to function without MCP tools if server is down
    }
  }

  async listTools(): Promise<McpTool[]> {
    if (!this.isConnected) return [];
    
    try {
      const response = await fetch(`${MCP_API_URL}/api/schema`);
      if (!response.ok) throw new Error('Failed to fetch tool schema');
      
      const data = await response.json();
      
      // Handle "endpoints" dictionary format (New Python Server Schema)
      if (data.endpoints && typeof data.endpoints === 'object') {
        return Object.entries(data.endpoints).map(([key, value]: [string, any]) => {
          // Normalize input schema:
          // Some endpoints return standard JSON schema ({ type: 'object', properties: {...} })
          // Others might return a direct map of arguments.
          let schema = value.parameters || { type: 'object', properties: {} };

          // If it lacks 'properties' and 'type' isn't explicitly defined as object, 
          // assume it's a simplified key-value map of parameters and wrap it.
          if (!schema.properties && schema.type !== 'object') {
             schema = {
                type: 'object',
                properties: schema
             };
          }

          return {
            name: key,
            description: value.description || '',
            inputSchema: schema
          };
        });
      }

      // Fallback: Handle legacy/array format if structure differs
      let toolsRaw: any[] = [];
      if (Array.isArray(data)) {
        toolsRaw = data;
      } else if (data.tools && Array.isArray(data.tools)) {
        toolsRaw = data.tools;
      }

      return toolsRaw.map(t => ({
        name: t.name || t.title,
        description: t.description || '',
        inputSchema: t.inputSchema || t.parameters || t.args_schema || { type: 'object', properties: {} }
      }));

    } catch (e) {
      console.error("MCP: Failed to list tools", e);
      return [];
    }
  }

  async callTool(name: string, args: any): Promise<McpToolCallResult> {
    if (!this.isConnected) {
      return { content: [{ type: 'text', text: "Error: MCP Server not connected." }], isError: true };
    }
    
    try {
      // Assuming convention: POST /api/tools/{tool_name}
      const response = await fetch(`${MCP_API_URL}/${name}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(args)
      });
      
      const text = await response.text();
      
      if (!response.ok) {
        return {
          content: [{ type: 'text', text: `Tool Error: ${text}` }],
          isError: true
        };
      }

      // Ensure the output is treated as text (JSON string) for the visualizer to parse
      // If the response is already JSON, we stringify it so the visualizer's parse logic works consistently
      let outputText = text;
      try {
        const json = JSON.parse(text);
        if (typeof json === 'object') {
            outputText = JSON.stringify(json);
        }
      } catch (e) {
        // content is plain text
      }

      return {
        content: [{ type: 'text', text: outputText }],
        isError: false
      };
    } catch (e: any) {
      console.error("MCP: Tool execution failed", e);
      return {
        content: [{ type: 'text', text: `Error: ${e.message}` }],
        isError: true
      };
    }
  }
  
  disconnect() {
    this.isConnected = false;
  }
}

export const mcpClient = new McpService();
