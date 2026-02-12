
import React from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, Legend
} from 'recharts';
import { CorrelationResult, GroupComparisonResult } from '../../types';

interface ChartConfig {
  color?: string;
  dotSize?: number;
}

interface ScatterPlotProps {
  data: CorrelationResult;
  config?: ChartConfig;
}

export const ScatterPlot: React.FC<ScatterPlotProps> = ({ data, config }) => {
  const fill = config?.color || "#38bdf8";
  
  return (
    <div className="w-full h-80 bg-slate-900 rounded-lg p-4 border border-slate-700">
      <h3 className="text-center text-slate-300 mb-2 text-sm font-semibold">
        Correlation: {data.xCol} vs {data.yCol} (r={data.r.toFixed(3)})
      </h3>
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis type="number" dataKey="x" name={data.xCol} stroke="#94a3b8" fontSize={12} />
          <YAxis type="number" dataKey="y" name={data.yCol} stroke="#94a3b8" fontSize={12} />
          <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ backgroundColor: '#1e293b', borderColor: '#475569', color: '#f1f5f9' }} />
          <Scatter name="Subjects" data={data.dataPoints} fill={fill} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
};

interface BoxPlotProps {
  data: GroupComparisonResult;
  config?: ChartConfig;
}

// Simulating a Box Plot using Bar Chart (min, median, max) for simplicity in Recharts without custom shapes
// In a real app, use a dedicated BoxPlot component or library
export const StatsBarChart: React.FC<BoxPlotProps> = ({ data, config }) => {
  const fill = config?.color || "#8b5cf6";

  return (
    <div className="w-full h-80 bg-slate-900 rounded-lg p-4 border border-slate-700">
      <h3 className="text-center text-slate-300 mb-2 text-sm font-semibold">
        Group Comparison: {data.valueCol} by {data.groupCol} (p={data.pVal})
      </h3>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data.stats} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="group" stroke="#94a3b8" />
          <YAxis stroke="#94a3b8" />
          <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#475569', color: '#f1f5f9' }} />
          <Legend />
          <Bar dataKey="mean" fill={fill} name="Mean Value" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
