
import React from 'react';
import { ToolVisualization, VisualizationType } from '../../types';
import { ScatterPlot, StatsBarChart } from './Charts';
import { FileText, Database, BookOpen } from 'lucide-react';

interface VisualizerAreaProps {
  visualizations: ToolVisualization[];
  datasetName?: string;
}

const VisualizationCard: React.FC<{ visualization: ToolVisualization }> = ({ visualization }) => {
  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-xl flex-shrink-0">
      <div className="bg-slate-900 px-4 py-3 border-b border-slate-700 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          {visualization.type === VisualizationType.SCATTER_PLOT && <Database className="w-4 h-4 text-sky-400" />}
          {visualization.type === VisualizationType.BOX_PLOT && <Database className="w-4 h-4 text-purple-400" />}
          {visualization.type === VisualizationType.LITERATURE_LIST && <BookOpen className="w-4 h-4 text-amber-400" />}
          {visualization.type === VisualizationType.DATA_TABLE && <FileText className="w-4 h-4 text-emerald-400" />}
          <span className="font-semibold text-slate-200">{visualization.title}</span>
        </div>
        <span className="text-xs px-2 py-1 rounded bg-slate-800 text-slate-400 border border-slate-600">
          {visualization.type}
        </span>
      </div>

      <div className="p-4 bg-slate-800/50">
        {visualization.type === VisualizationType.SCATTER_PLOT && (
          <ScatterPlot data={visualization.data} config={visualization.config} />
        )}

        {visualization.type === VisualizationType.BOX_PLOT && (
          <StatsBarChart data={visualization.data} config={visualization.config} />
        )}

        {visualization.type === VisualizationType.DATA_TABLE && (
          <div className="overflow-x-auto max-h-80 custom-scrollbar">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-700/50 uppercase text-xs font-semibold text-slate-400 sticky top-0">
                <tr>
                   {Object.keys(visualization.data[0] || {}).map(k => (
                     <th key={k} className="px-4 py-3 whitespace-nowrap bg-slate-700/50 backdrop-blur">{k}</th>
                   ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {visualization.data.slice(0, 10).map((row: any, i: number) => (
                  <tr key={i} className="hover:bg-slate-700/30">
                    {Object.values(row).map((val: any, j) => (
                      <td key={j} className="px-4 py-2 font-mono text-xs whitespace-nowrap">{val}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-slate-500 mt-2 italic">Showing first 10 rows.</p>
          </div>
        )}

        {visualization.type === VisualizationType.LITERATURE_LIST && (
           <div className="space-y-4">
             {visualization.data.map((paper: any, idx: number) => (
               <div key={idx} className="p-4 bg-slate-900 rounded-lg border border-slate-700 hover:border-amber-700/50 transition-colors">
                 <h4 className="text-md font-bold text-amber-100 mb-1">{paper.title}</h4>
                 <p className="text-xs text-amber-300/80 mb-2">{paper.authors} • {paper.year} • {paper.journal}</p>
                 <p className="text-sm text-slate-400 leading-relaxed">{paper.summary}</p>
               </div>
             ))}
           </div>
        )}
      </div>
    </div>
  );
};

const VisualizerArea: React.FC<VisualizerAreaProps> = ({ visualizations, datasetName }) => {
  if (!visualizations || visualizations.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-500 bg-slate-900/30 rounded-xl border-2 border-dashed border-slate-700 p-8">
        <Database className="w-16 h-16 mb-4 opacity-20" />
        <p className="text-lg font-medium">Visualization Workspace</p>
        <p className="text-sm">Agent outputs will appear here.</p>
        {datasetName && <p className="text-xs mt-4 text-emerald-500">Loaded: {datasetName}</p>}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-950/30 rounded-xl border border-slate-800 overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
        {visualizations.map((viz, index) => (
           <VisualizationCard key={index} visualization={viz} />
        ))}
      </div>
    </div>
  );
};

export default VisualizerArea;
