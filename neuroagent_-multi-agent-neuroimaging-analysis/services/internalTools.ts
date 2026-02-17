
import { McpTool, DatasetRow } from '../types';
import { calculateCorrelation, getGroupStats } from '../utils/stats';

export const INTERNAL_TOOLS: McpTool[] = [
  {
    name: 'DATA_INSPECT',
    description: 'Inspect the distribution and summary of columns in the dataset. Useful for initial data exploration.',
    inputSchema: {
      type: 'object',
      properties: {
        columns: { type: 'array', items: { type: 'string' }, description: 'Specific columns to inspect' }
      }
    }
  },
  {
    name: 'CORRELATION_ANALYSIS',
    description: 'Calculate Pearson correlation between two numeric columns. Use this to find linear relationships between continuous variables.',
    inputSchema: {
      type: 'object',
      properties: {
        x_column: { type: 'string', description: 'The first numeric column (e.g., Age, Amyloid values)' },
        y_column: { type: 'string', description: 'The second numeric column' }
      },
      required: ['x_column', 'y_column']
    }
  },
  {
    name: 'GROUP_COMPARISON',
    description: 'Compare a numeric value across all groups in a categorical column. Performs pairwise T-tests and Cohen\'s d analysis for all unique pairs.',
    inputSchema: {
      type: 'object',
      properties: {
        group_column: { type: 'string', description: 'The categorical column to group by (e.g., DX, Sex)' },
        target_column: { type: 'string', description: 'The numeric column to analyze (e.g., Amyloid, Tau)' }
      },
      required: ['group_column', 'target_column']
    }
  },
  {
    name: 'MODIFY_VISUALIZATION',
    description: 'Update the style of the currently visible visualization. Use this to change colors, titles, or sizes.',
    inputSchema: {
      type: 'object',
      properties: {
        color: { type: 'string', description: 'Color name or hex code (e.g. "red", "#ff0000")' },
        title: { type: 'string', description: 'New title for the chart' },
        dotSize: { type: 'number', description: 'Size of dots in scatter plot (default 100)' }
      }
    }
  },
  {
    name: 'TRANSFORM_DATA',
    description: 'Convert a categorical column to numeric values. This creates a new column with "_numeric" suffix (e.g. DX -> DX_numeric). Use this before correlation analysis involving categorical data.',
    inputSchema: {
      type: 'object',
      properties: {
        column: { type: 'string', description: 'The categorical column to convert (e.g., DX, Sex)' }
      },
      required: ['column']
    }
  },
  {
    name: 'AVERAGE_MULTIPLE_COLUMNS',
    description: 'Calculate average values across multiple columns for each row, insert the result as a new column, and return the new column name. Use this to aggregate multiple metrics (e.g. regional brain volumes) into a single composite score.',
    inputSchema: {
      type: 'object',
      properties: {
        columns: { type: 'array', items: { type: 'string' }, description: 'List of column names to average' }
      },
      required: ['columns']
    }
  }
];

export const executeInternalTool = (toolName: string, args: any, data: DatasetRow[]) => {
  if (toolName === 'DATA_INSPECT') {
    return { data };
  }

  if (toolName === 'CORRELATION_ANALYSIS') {
    const x = args.x_column || args.target_column || args.column1 || args.x;
    const y = args.y_column || args.comparison_column || args.column2 || args.y;
    
    if (!x || !y) throw new Error(`Missing columns for correlation. Received parameters: ${JSON.stringify(args)}`);
    return calculateCorrelation(data, x, y);
  }

  if (toolName === 'GROUP_COMPARISON') {
    const g = args.group_column || args.group || args.groupCol;
    const t = args.target_column || args.target || args.valueCol;
    
    if (!g || !t) throw new Error(`Missing columns for group comparison. Received parameters: ${JSON.stringify(args)}`);
    return getGroupStats(data, g, t);
  }

  if (toolName === 'MODIFY_VISUALIZATION') {
    return args;
  }

  if (toolName === 'TRANSFORM_DATA') {
    const col = args.column;
    const mapping = args.mapping;
    if (!col) throw new Error("Missing column for transformation");
    if (!mapping) throw new Error("Missing numeric mapping for transformation");
    
    const newColName = `${col}_numeric`;
    const transformedData = data.map(row => ({
      ...row,
      [newColName]: mapping[row[col]] !== undefined ? mapping[row[col]] : row[col]
    }));

    return { 
        success: true, 
        transformedData, 
        newColumn: newColName,
        mapping 
    };
  }

  if (toolName === 'AVERAGE_MULTIPLE_COLUMNS') {
    const cols = args.columns;
    if (!cols || !Array.isArray(cols) || cols.length === 0) {
      throw new Error("Missing or invalid columns list for averaging.");
    }
    
    // Check for existence
    const firstRow = data[0] || {};
    const missing = cols.filter(c => firstRow[c] === undefined);
    if (missing.length > 0) {
      throw new Error(`Columns not found in dataset: ${missing.join(', ')}`);
    }

    // Generate new column name
    const suffix = cols.join('_');
    const newColName = `avg_${cols.length}_cols_${Date.now().toString().slice(-4)}`;

    const transformedData = data.map(row => {
      let sum = 0;
      let count = 0;
      cols.forEach(c => {
        const val = parseFloat(String(row[c]));
        if (!isNaN(val)) {
          sum += val;
          count++;
        }
      });
      const avg = count > 0 ? parseFloat((sum / count).toFixed(4)) : 0;
      return {
        ...row,
        [newColName]: avg
      };
    });

    return {
      success: true,
      transformedData,
      newColumn: newColName
    };
  }
  
  throw new Error(`Tool ${toolName} not found internally.`);
};

// Programmatically validate column references in the plan
export const validatePlanColumns = (plan: any, initialColumns: string[], columnsToCheck?: string[][]) => {
  const knownColumns = new Set(initialColumns);
  const errors: string[] = [];

  if (!plan.analysis_steps || !Array.isArray(plan.analysis_steps)) {
    return { valid: false, errors: ["Invalid plan format"] };
  }

  plan.analysis_steps.forEach((step: any, index: number) => {
    // Check if specific columns are requested for validation for this step by the Planner/Validator
    if (columnsToCheck && Array.isArray(columnsToCheck) && Array.isArray(columnsToCheck[index])) {
        const cols = columnsToCheck[index];
        cols.forEach(col => {
            if (col && typeof col === 'string') {
                 if (!knownColumns.has(col)) {
                    errors.push(`Step ${step.step_id} (${step.tool}): Column '${col}' not found in dataset (and not created by previous steps).`);
                 }
            }
        });
    }

    // Always track column creation for subsequent steps
    const params = step.parameters || {};
    if (step.tool === 'TRANSFORM_DATA' && params.column) {
      knownColumns.add(`${params.column}_numeric`);
    }
    // Track new columns from averaging, though we don't know the name deterministically here without the timestamp/randomness. 
    // In a rigorous validator, we might need to predict the name or use a fixed naming schema.
    // For now, we won't strictly validate the *existence* of the future averaged column name in subsequent steps 
    // because the exact name is generated at runtime (avg_N_cols_timestamp).
    // The planner should ideally instruct to use "the new averaged column".
  });

  return { valid: errors.length === 0, errors };
};
