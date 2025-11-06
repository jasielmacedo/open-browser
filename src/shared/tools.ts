/**
 * Tool Calling System for AI Agents
 * Provides tools that AI models can call to interact with the browser and system
 */

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required?: boolean;
  enum?: string[];
}

export interface Tool {
  name: string;
  description: string;
  parameters: ToolParameter[];
  execute: (args: Record<string, any>) => Promise<any>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface ToolResult {
  id: string;
  name: string;
  result: any;
  error?: string;
}

/**
 * Available tools for AI models
 */
export const AVAILABLE_TOOLS: Tool[] = [
  {
    name: 'search_history',
    description:
      'Search the browsing history for pages matching a query. Returns recent pages visited.',
    parameters: [
      {
        name: 'query',
        type: 'string',
        description: 'Search query to match against page titles and URLs',
        required: false,
      },
      {
        name: 'limit',
        type: 'number',
        description: 'Maximum number of results to return (default: 10)',
        required: false,
      },
    ],
    execute: async (args) => {
      // Execute via IPC if in renderer process
      if (typeof window !== 'undefined' && window.electron) {
        return await window.electron.invoke('tool:search_history', args);
      }
      // Fallback for main process or when window is not available
      return { tool: 'search_history', args };
    },
  },
  {
    name: 'get_bookmarks',
    description: 'Get saved bookmarks, optionally filtered by search query.',
    parameters: [
      {
        name: 'query',
        type: 'string',
        description: 'Optional search query to filter bookmarks',
        required: false,
      },
    ],
    execute: async (args) => {
      if (typeof window !== 'undefined' && window.electron) {
        return await window.electron.invoke('tool:get_bookmarks', args);
      }
      return { tool: 'get_bookmarks', args };
    },
  },
  {
    name: 'analyze_page_content',
    description:
      'Get detailed content from the current page including full text, structure, and metadata.',
    parameters: [],
    execute: async (args) => {
      if (typeof window !== 'undefined' && window.electron) {
        return await window.electron.invoke('tool:analyze_page_content', args);
      }
      return { tool: 'analyze_page_content', args };
    },
  },
  {
    name: 'capture_screenshot',
    description: 'Capture a screenshot of the current page (only for vision models).',
    parameters: [],
    execute: async (args) => {
      if (typeof window !== 'undefined' && window.electron) {
        return await window.electron.invoke('tool:capture_screenshot', args);
      }
      return { tool: 'capture_screenshot', args };
    },
  },
  {
    name: 'get_page_metadata',
    description:
      'Get metadata about the current page (title, URL, description, canonical URL, etc.)',
    parameters: [],
    execute: async (args) => {
      if (typeof window !== 'undefined' && window.electron) {
        return await window.electron.invoke('tool:get_page_metadata', args);
      }
      return { tool: 'get_page_metadata', args };
    },
  },
  {
    name: 'web_search',
    description:
      'Perform a web search by opening a new tab with the search query, navigating to Google, and capturing the results. This is a multi-step process that returns search results with screenshots.',
    parameters: [
      {
        name: 'query',
        type: 'string',
        description: 'The search query to look up on Google',
        required: true,
      },
      {
        name: 'capture_screenshot',
        type: 'boolean',
        description: 'Whether to capture a screenshot of the search results (default: true)',
        required: false,
      },
    ],
    execute: async (args) => {
      if (typeof window !== 'undefined' && window.electron) {
        return await window.electron.invoke('tool:web_search', args);
      }
      return { tool: 'web_search', args };
    },
  },
];

/**
 * Convert tools to OpenAI function calling format
 */
export function toolsToOpenAIFormat(tools: Tool[]): any[] {
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: 'object',
        properties: tool.parameters.reduce(
          (acc, param) => {
            acc[param.name] = {
              type: param.type,
              description: param.description,
              ...(param.enum ? { enum: param.enum } : {}),
            };
            return acc;
          },
          {} as Record<string, any>
        ),
        required: tool.parameters.filter((p) => p.required).map((p) => p.name),
      },
    },
  }));
}

/**
 * Convert tools to Ollama tool calling format
 * Ollama uses a similar format to OpenAI but with slight differences
 */
export function toolsToOllamaFormat(tools: Tool[]): any[] {
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: 'object',
        properties: tool.parameters.reduce(
          (acc, param) => {
            acc[param.name] = {
              type: param.type,
              description: param.description,
              ...(param.enum ? { enum: param.enum } : {}),
            };
            return acc;
          },
          {} as Record<string, any>
        ),
        required: tool.parameters.filter((p) => p.required).map((p) => p.name),
      },
    },
  }));
}

/**
 * Parse tool calls from model response
 * Different models may format tool calls differently
 */
export function parseToolCalls(content: string): ToolCall[] {
  const toolCalls: ToolCall[] = [];

  // Try to parse JSON tool calls
  try {
    // Look for function call patterns in the response
    const functionCallRegex = /<function_call>(.*?)<\/function_call>/gs;
    const matches = content.matchAll(functionCallRegex);

    for (const match of matches) {
      try {
        const callData = JSON.parse(match[1]);
        toolCalls.push({
          id: crypto.randomUUID(),
          name: callData.name,
          arguments: callData.arguments || {},
        });
      } catch (_e) {
        console.warn('Failed to parse tool call:', match[1]);
      }
    }
  } catch (_e) {
    console.warn('Failed to extract tool calls from response');
  }

  return toolCalls;
}

/**
 * Execute a tool call
 */
export async function executeTool(
  toolName: string,
  args: Record<string, any>
): Promise<ToolResult> {
  const tool = AVAILABLE_TOOLS.find((t) => t.name === toolName);

  if (!tool) {
    return {
      id: crypto.randomUUID(),
      name: toolName,
      result: null,
      error: `Unknown tool: ${toolName}`,
    };
  }

  try {
    const result = await tool.execute(args);
    return {
      id: crypto.randomUUID(),
      name: toolName,
      result,
    };
  } catch (error: any) {
    return {
      id: crypto.randomUUID(),
      name: toolName,
      result: null,
      error: error.message || 'Tool execution failed',
    };
  }
}
