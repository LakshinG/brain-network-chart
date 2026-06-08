
import { McpTool, McpToolCallResult } from '../types';

const LEGACY_DEFAULT_MCP_URL = 'https://ziquan-cyberneuro-mcp.hf.space';
const DEFAULT_BACKEND_BASE_URL = 'https://xiyunhu-cyberneuro-mcp.hf.space';
const DEFAULT_MCP_API_URL = 'https://xiyunhu-cyberneuro-mcp.hf.space';
const BACKEND_BASE_URL_STORAGE_KEY = 'neuroagent.backendBaseUrl';
const MCP_API_URL_STORAGE_KEY = 'neuroagent.mcpApiUrl';

const normalizeHttpUrl = (value: string) => value.trim().replace(/\/$/, '');
const isValidHttpUrl = (value: string) => /^https?:\/\//i.test(value);

const getStoredUrl = (key: string, fallback: string) => {
  if (typeof window === 'undefined') return fallback;
  const stored = window.localStorage.getItem(key);
  if (!stored) return fallback;

  const normalized = normalizeHttpUrl(stored);
  if (normalized === LEGACY_DEFAULT_MCP_URL) {
    window.localStorage.setItem(key, fallback);
    return fallback;
  }
  return normalized;
};

export let BACKEND_BASE_URL = getStoredUrl(BACKEND_BASE_URL_STORAGE_KEY, DEFAULT_BACKEND_BASE_URL);
let BACKEND_WS_URL = BACKEND_BASE_URL.replace(/^http/, 'ws');
export let MCP_API_URL = getStoredUrl(MCP_API_URL_STORAGE_KEY, DEFAULT_MCP_API_URL);

export const getBackendBaseUrl = () => BACKEND_BASE_URL;
export const getMcpApiUrl = () => MCP_API_URL;

export const setMcpServiceUrls = (next: { backendBaseUrl?: string; mcpApiUrl?: string }) => {
  if (next.backendBaseUrl !== undefined) {
    const normalized = normalizeHttpUrl(next.backendBaseUrl);
    if (!isValidHttpUrl(normalized)) {
      throw new Error('MCP backend URL must start with http:// or https://');
    }
    BACKEND_BASE_URL = normalized;
    BACKEND_WS_URL = BACKEND_BASE_URL.replace(/^http/, 'ws');
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(BACKEND_BASE_URL_STORAGE_KEY, BACKEND_BASE_URL);
    }
  }

  if (next.mcpApiUrl !== undefined) {
    const normalized = normalizeHttpUrl(next.mcpApiUrl);
    if (!isValidHttpUrl(normalized)) {
      throw new Error('MCP API URL must start with http:// or https://');
    }
    MCP_API_URL = normalized;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(MCP_API_URL_STORAGE_KEY, MCP_API_URL);
    }
  }
};

export class McpService {
  public isConnected = false;
  private ws: WebSocket | null = null;

  constructor() {}

  private async parseJsonResponse(response: Response): Promise<any> {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || `Request failed (${response.status})`);
    }
    return payload;
  }

  private openStatusSocket() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.ws = new WebSocket(`${BACKEND_WS_URL}/ws`);

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message?.type === 'mcp_status') {
          this.isConnected = !!message.connected;
        }
      } catch {
      }
    };

    this.ws.onclose = () => {
      this.ws = null;
    };
  }

  async connect(): Promise<void> {
    try {
      const response = await fetch(`${BACKEND_BASE_URL}/api/mcp/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const payload = await this.parseJsonResponse(response);
      this.isConnected = !!payload.connected;
      this.openStatusSocket();
      console.log('MCP: Connected to MCP server');
    } catch (error) {
      console.warn('MCP: Connection Failed', error);
      this.isConnected = false;
      // We don't throw here to allow the app to function without MCP tools if server is down
    }
  }

  async listTools(): Promise<McpTool[]> {
    if (!this.isConnected) return [];

    try {
      const response = await fetch(`${BACKEND_BASE_URL}/api/mcp/tools`);
      const payload = await this.parseJsonResponse(response);
      const tools = Array.isArray(payload?.tools) ? payload.tools : [];

      return tools.map((tool: any) => ({
        name: tool.name,
        description: tool.description || '',
        inputSchema: tool.inputSchema || { type: 'object', properties: {} },
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
      const response = await fetch(`${BACKEND_BASE_URL}/api/mcp/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          args,
        })
      });

      const payload = await this.parseJsonResponse(response);
      const result: any = payload?.result;

      if (result && typeof result === 'object' && Array.isArray(result.content)) {
        return {
          content: result.content,
          isError: !!result.isError,
        };
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
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
  
  async disconnect(): Promise<void> {
    try {
      await fetch(`${BACKEND_BASE_URL}/api/mcp/disconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.warn('MCP: Disconnect warning', error);
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.isConnected = false;
  }

  async registerDataset(dataset: { id: string; name: string; columns: string[]; data: Record<string, any>[]; serverFilename?: string }): Promise<{ dataset_id: string } | null> {
    if (!this.isConnected) return null;
    try {
      const response = await fetch(`${MCP_API_URL}/datasets/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: dataset.id,
          name: dataset.name,
          columns: dataset.columns,
          data: dataset.data,
          ...(dataset.serverFilename ? { serverFilename: dataset.serverFilename } : {}),
        }),
      });
      if (!response.ok) {
        throw new Error(`Dataset registration failed: ${response.statusText}`);
      }
      const result = await response.json();
      return { dataset_id: result.dataset_id };
    } catch (error) {
      console.error("MCP: Dataset registration failed", error);
      return null;
    }
  }

  async uploadFile(file: File): Promise<{ status: string, file_info: any } | null> {
    if (!this.isConnected) {
        return null;
    }
    
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${MCP_API_URL}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error("MCP: File upload failed", error);
      throw error;
    }
  }
  
}

export const mcpClient = new McpService();
