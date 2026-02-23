/**
 * DynamicChartRenderer.tsx
 * 
 * Renders Recharts JSX code strings dynamically using react-live.
 * This component takes a code string and a data scope, then renders
 * the chart at runtime — allowing LLM-edited code to be displayed.
 */

import React, { useMemo } from 'react';
import { LiveProvider, LivePreview, LiveError } from 'react-live';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend, ComposedChart, Line, ZAxis, Cell, Area, ReferenceLine
} from 'recharts';

/**
 * All Recharts components available in the generated code's scope.
 * When the LLM adds a new Recharts component (e.g. PieChart),
 * add it here so it's available at runtime.
 */
const RECHARTS_SCOPE: Record<string, unknown> = {
  React,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  Legend,
  ComposedChart,
  Line,
  ZAxis,
  Cell,
  Area,
  ReferenceLine,
};

interface DynamicChartRendererProps {
  /** Recharts JSX code string (a single JSX expression) */
  code: string;
  /** Data object injected as `data` in scope */
  data: Record<string, any>;
  /** Optional className for the wrapper */
  className?: string;
}

const DynamicChartRenderer: React.FC<DynamicChartRendererProps> = React.memo(({ code, data, className }) => {
  // Build the full scope: Recharts components + data
  const scope = useMemo(() => ({
    ...RECHARTS_SCOPE,
    data,
  }), [data]);

  return (
    <div className={className || 'w-full'}>
      <LiveProvider code={code} scope={scope} noInline={false}>
        <LivePreview />
        <LiveError
          // @ts-ignore — react-live types are loose here
          style={{
            color: '#f87171',
            backgroundColor: '#1e293b',
            padding: '12px',
            borderRadius: '8px',
            fontSize: '12px',
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap',
            marginTop: '8px',
            border: '1px solid #ef4444',
          }}
        />
      </LiveProvider>
    </div>
  );
});

DynamicChartRenderer.displayName = 'DynamicChartRenderer';

export default DynamicChartRenderer;
