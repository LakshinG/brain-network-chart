
import { McpTool, DatasetRow } from '../types';
import { calculateCorrelation, getGroupStats, performSpectralClustering, stratifyDataset, calculateLinearSVM } from '../utils/stats';

export const INTERNAL_TOOLS: McpTool[] = [
  {
    name: 'DATA_INSPECT',
    description: 'Return the actual data rows to the user interface. Use this when the user explicitly asks to "see" or "show" the data, or when you need to check the format of values (e.g. strings vs numbers) within a column.',
    inputSchema: {
      type: 'object',
      properties: {
        columns: { type: 'array', items: { type: 'string' }, description: 'Specific columns to retrieve (optional)' },
        column_pattern: { type: 'string', description: 'Substring to match multiple columns to inspect (e.g. "Amyloid"). matches all columns containing this string.' }
      }
    }
  },
  {
    name: 'CORRELATION_ANALYSIS',
    description: 'Calculate Pearson correlation between two numeric columns. Optionally group by a categorical column to see correlations per group.',
    inputSchema: {
      type: 'object',
      properties: {
        x_column: { type: 'string', description: 'The first numeric column (X-axis)' },
        y_column: { type: 'string', description: 'The second numeric column (Y-axis)' },
        group_column: { type: 'string', description: 'Optional categorical column to group by (e.g. DX, Sex)' }
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
    description: 'Calculate average values across multiple columns for each row. Matches columns by name using a "condition" string (substring match). Use this to aggregate multiple metrics (e.g. "Amyloid" matches "Amyloid_Orbital", "Amyloid_Frontal").',
    inputSchema: {
      type: 'object',
      properties: {
        condition: { type: 'string', description: 'Substring to search for in column names (e.g. "Amyloid")' }
      },
      required: ['condition']
    }
  },
  {
    name: 'SPECTRAL_CLUSTERING',
    description: 'Perform spectral clustering (PCA + K-Means) on a set of feature columns defined by a pattern, and optionally analyze correlation of clusters with a target column. Plots PC1 vs PC2 colored by Cluster.',
    inputSchema: {
      type: 'object',
      properties: {
        feature_pattern: { type: 'string', description: 'Substring that is included in multiple feature columns (e.g. "CT_") to include automatically.' },
        target_column: { type: 'string', description: 'Optional numeric column to correlate with cluster IDs (e.g., IQ, MMSE)' },
        ncluster: { type: 'number', description: 'Number of clusters (default 5)' }
      },
      required: ['feature_pattern']
    }
  },
  {
    name: 'STRATIFY_DATASET',
    description: 'Split a dataset into subsets based on unique values of a grouping column. Creates new sparse columns for each group (e.g. IQ -> IQ_Sex_F, IQ_Sex_M) and inserts them back into the dataset. Useful for visualizing distributions across groups.',
    inputSchema: {
      type: 'object',
      properties: {
        target_column: { type: 'string', description: 'The value column to split (e.g. IQ)' },
        group_column: { type: 'string', description: 'The categorical/numeric column to group by (e.g. Sex, Age)' },
        max_group_num: { type: 'number', description: 'Max number of groups to create (default 10)' }
      },
      required: ['target_column', 'group_column']
    }
  },
  {
    name: 'SVM_CLASSIFICATION',
    description: 'Fit a Linear SVM classifier to predict a target categorical column based on two numeric feature columns. Preprocesses target to binary if needed. Outputs accuracy and a plot with the decision boundary.',
    inputSchema: {
      type: 'object',
      properties: {
        x_column: { type: 'string', description: 'The first numeric feature column (X-axis)' },
        y_column: { type: 'string', description: 'The second numeric feature column (Y-axis)' },
        target_column: { type: 'string', description: 'The target categorical column (Classes)' }
      },
      required: ['x_column', 'y_column', 'target_column']
    }
  }
];

const validateColumns = (data: DatasetRow[], cols: string[]) => {
    if (data.length === 0) return;
    const available = new Set(Object.keys(data[0]));
    const missing = cols.filter(c => !available.has(c));
    if (missing.length > 0) {
        throw new Error(`Input validation failed: Column(s) '${missing.join(', ')}' not found in dataset. Available columns: ${Array.from(available).join(', ')}`);
    }
};

const resolveColumnSelection = (data: DatasetRow[], explicitCols?: string[], pattern?: string): string[] => {
    const selected = new Set<string>(explicitCols || []);
    if (pattern && data.length > 0) {
        const allCols = Object.keys(data[0]);
        const lowerPattern = pattern.toLowerCase();
        allCols.filter(c => c.toLowerCase().includes(lowerPattern)).forEach(c => selected.add(c));
    }
    return Array.from(selected);
};

export const executeInternalTool = (toolName: string, args: any, data: DatasetRow[]) => {
  if (toolName === 'DATA_INSPECT') {
    const cols = resolveColumnSelection(data, args.columns, args.column_pattern);
    
    if (cols.length > 0) {
        validateColumns(data, cols);
        // Filter data to only include requested columns
        const filteredData = data.map(row => {
            const newRow: any = {};
            cols.forEach((col: string) => newRow[col] = row[col]);
            return newRow;
        });
        return { data: filteredData };
    }
    return { data };
  }

  if (toolName === 'CORRELATION_ANALYSIS') {
    const x = args.x_column || args.target_column || args.column1 || args.x;
    const y = args.y_column || args.comparison_column || args.column2 || args.y;
    const group = args.group_column || args.group;
    
    if (!x || !y) throw new Error(`Missing columns for correlation. Received parameters: ${JSON.stringify(args)}`);
    
    const colsToCheck = [x, y];
    if (group) colsToCheck.push(group);
    
    validateColumns(data, colsToCheck);
    
    return calculateCorrelation(data, x, y, group);
  }

  if (toolName === 'GROUP_COMPARISON') {
    const g = args.group_column || args.group || args.groupCol;
    const t = args.target_column || args.target || args.valueCol;
    
    if (!g || !t) throw new Error(`Missing columns for group comparison. Received parameters: ${JSON.stringify(args)}`);
    validateColumns(data, [g, t]);
    
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
    
    validateColumns(data, [col]);

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
    const condition = args.condition;
    if (!condition || typeof condition !== 'string') {
      throw new Error("Missing or invalid 'condition' parameter for averaging.");
    }
    
    if (data.length === 0) return { data };
    
    const allCols = Object.keys(data[0]);
    const matchedCols = allCols.filter(c => c.toLowerCase().includes(condition.toLowerCase()));

    if (matchedCols.length === 0) {
         throw new Error(`No columns found matching condition '${condition}'. Available: ${allCols.slice(0, 5).join(', ')}...`);
    }

    // Generate new column name
    const cleanCond = condition.replace(/[^a-zA-Z0-9]/g, '');
    const newColName = `avg_${cleanCond}`;

    const transformedData = data.map(row => {
      let sum = 0;
      let count = 0;
      matchedCols.forEach(c => {
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
      newColumn: newColName,
      matchedColumns: matchedCols
    };
  }

  if (toolName === 'SPECTRAL_CLUSTERING') {
    const features = resolveColumnSelection(data, [], args.feature_pattern);
    const target = args.target_column || args.target; // Optional
    const k = args.ncluster || 5;

    if (features.length === 0) throw new Error("No feature columns found matching the pattern. Please provide a valid 'feature_pattern'.");
    
    const colsToValidate = [...features];
    if (target) colsToValidate.push(target);
    validateColumns(data, colsToValidate);

    const result = performSpectralClustering(data, features, target, k);

    // Inject 'colors' column
    const transformedData = data.map((row, idx) => ({ ...row, colors: '' })); // Initialize
    if (result.assignments) {
        result.assignments.forEach(a => {
            transformedData[a.originalIndex].colors = String(a.cluster); // Use string for consistency in DatasetRow
        });
    }

    return {
        success: true, 
        transformedData,
        newColumn: 'colors',
        ...result 
    };
  }

  if (toolName === 'STRATIFY_DATASET') {
      const target = args.target_column || args.target;
      const group = args.group_column || args.group;
      const max = args.max_group_num || 10;
      
      if (!target || !group) throw new Error("Missing columns for stratification.");
      validateColumns(data, [target, group]);

      const { transformedData, result } = stratifyDataset(data, target, group, max);
      
      // Extract new column names for return info
      const newColNames = result.newColumns.map(c => c.name);
      
      return {
          success: true,
          transformedData,
          result, // StratificationResult
          newColumns: newColNames // For App.tsx to update active cols
      };
  }

  if (toolName === 'SVM_CLASSIFICATION') {
      const x = args.x_column;
      const y = args.y_column;
      const target = args.target_column;
      
      if (!x || !y || !target) throw new Error("Missing columns for SVM Classification.");
      validateColumns(data, [x, y, target]);

      return calculateLinearSVM(data, x, y, target);
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