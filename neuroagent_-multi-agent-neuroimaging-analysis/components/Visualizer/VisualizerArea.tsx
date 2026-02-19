
import React from 'react';
import ReactMarkdown from 'react-markdown';
import { ToolVisualization, VisualizationType, GroupComparisonResult } from '../../types';
import { ScatterPlot, StatsBarChart, AgingCurveChart, ClusteringDashboard, StratificationChart, SVMBoundaryChart } from './Charts';
import { FileText, Database, BookOpen, Link, FileCheck2, CheckCircle2, TrendingUp, Grid2X2, Layers, Binary } from 'lucide-react';

interface VisualizerAreaProps {
  visualizations: ToolVisualization[];
  datasetName?: string;
  onVizClick?: (id?: string) => void;
  activeDatasetIds?: string[];
}

const ResearchReport: React.FC<{ data: any, onLinkClick: (stepId: number) => void }> = ({ data, onLinkClick }) => {
  const { report, stepIdToMessageId } = data;
  const markdownContent = report.replace(/\[\[Step (\d+)\]\]/g, '[Step $1](urn:step:$1)');

  return (
    <div className="bg-slate-900/50 rounded-lg p-6 border border-slate-700/50">
      <div className="prose prose-invert max-w-none text-slate-300 leading-relaxed">
        <ReactMarkdown
          components={{
            a: ({ node, href, children, ...props }) => {
              if (href?.startsWith('urn:step:')) {
                const stepId = parseInt(href.split(':')[2], 10);
                return (
                  <button
                    onClick={() => onLinkClick(stepId)}
                    className="text-indigo-400 hover:text-indigo-300 font-bold underline decoration-indigo-500/30 underline-offset-4 bg-indigo-500/10 px-1 rounded transition-colors inline-block"
                    title={`Go to Step ${stepId}`}
                  >
                    {children}
                  </button>
                );
              }
              return (
                <a 
                  href={href} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-sky-400 hover:text-sky-300 hover:underline"
                  {...props}
                >
                  {children}
                </a>
              );
            },
            h1: ({children}) => <h1 className="text-2xl font-bold text-slate-100 mb-4 pb-2 border-b border-slate-700">{children}</h1>,
            h2: ({children}) => <h2 className="text-xl font-semibold text-indigo-200 mt-6 mb-3">{children}</h2>,
            h3: ({children}) => <h3 className="text-lg font-medium text-slate-200 mt-4 mb-2">{children}</h3>,
            ul: ({children}) => <ul className="list-disc pl-5 space-y-1 mb-4 text-slate-300">{children}</ul>,
            li: ({children}) => <li className="pl-1">{children}</li>,
            strong: ({children}) => <strong className="font-semibold text-slate-100">{children}</strong>,
          }}
        >
          {markdownContent}
        </ReactMarkdown>
      </div>
    </div>
  );
};

const PairwiseTable: React.FC<{ data: GroupComparisonResult }> = ({ data }) => {
  if (!data.pairwiseComparisons || data.pairwiseComparisons.length === 0) return null;

  return (
    <div className="mt-4 overflow-x-auto">
      <h4 className="text-xs font-semibold text-slate-400 uppercase mb-2">Pairwise Comparisons</h4>
      <table className="w-full text-left text-xs text-slate-300 border-collapse">
        <thead>
          <tr className="bg-slate-900/50 border-b border-slate-700">
            <th className="px-2 py-2">Groups</th>
            <th className="px-2 py-2">Difference</th>
            <th className="px-2 py-2">Effect Size (d)</th>
            <th className="px-2 py-2">P-Value</th>
            <th className="px-2 py-2">Interpretation</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {data.pairwiseComparisons.map((comp, idx) => (
            <tr key={idx} className={comp.significant ? "bg-indigo-900/10" : ""}>
              <td className="px-2 py-2 font-medium">{comp.groupA} vs {comp.groupB}</td>
              <td className="px-2 py-2">{(comp.meanA - comp.meanB).toFixed(2)}</td>
              <td className="px-2 py-2">{comp.cohensD.toFixed(2)} ({comp.effectSize})</td>
              <td className="px-2 py-2 font-mono">{comp.pVal < 0.001 ? '<0.001' : comp.pVal.toFixed(3)}</td>
              <td className="px-2 py-2 opacity-80 max-w-[200px] truncate" title={comp.explanation}>{comp.explanation}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const VisualizationCard: React.FC<{ 
    visualization: ToolVisualization, 
    onClick?: () => void, 
    onReportLinkClick?: (stepId: number) => void,
    isActiveDataset?: boolean
}> = ({ visualization, onClick, onReportLinkClick, isActiveDataset }) => {
  const isClickable = visualization.messageId || visualization.datasetId;
  
  return (
    <div 
        className={`bg-slate-800 rounded-xl border overflow-hidden shadow-xl flex-shrink-0 transition-all 
        ${isActiveDataset ? 'border-indigo-500/60 ring-1 ring-indigo-500/30' : 'border-slate-700'}
        `}
    >
      <div className="bg-slate-900 px-4 py-3 border-b border-slate-700 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          {visualization.type === VisualizationType.SCATTER_PLOT && <Database className="w-4 h-4 text-sky-400" />}
          {visualization.type === VisualizationType.BOX_PLOT && <Database className="w-4 h-4 text-purple-400" />}
          {visualization.type === VisualizationType.AGING_CURVE && <TrendingUp className="w-4 h-4 text-teal-400" />}
          {visualization.type === VisualizationType.CLUSTERING_DASHBOARD && <Grid2X2 className="w-4 h-4 text-rose-400" />}
          {visualization.type === VisualizationType.STRATIFICATION_RESULT && <Layers className="w-4 h-4 text-emerald-400" />}
          {visualization.type === VisualizationType.SVM_BOUNDARY && <Binary className="w-4 h-4 text-blue-500" />}
          {visualization.type === VisualizationType.LITERATURE_LIST && <BookOpen className="w-4 h-4 text-amber-400" />}
          {visualization.type === VisualizationType.DATA_TABLE && <FileText className="w-4 h-4 text-emerald-400" />}
          {visualization.type === VisualizationType.RESEARCH_REPORT && <FileCheck2 className="w-4 h-4 text-indigo-400" />}
          <span className="font-semibold text-slate-200">{visualization.title}</span>
        </div>
        <div className="flex items-center gap-2">
            {isActiveDataset && (
                <span title="Active Dataset" className="flex">
                    <CheckCircle2 className="w-4 h-4 text-indigo-400" />
                </span>
            )}
            
            <button
                onClick={() => isClickable && onClick && onClick()}
                disabled={!isClickable}
                className={`
                    text-xs px-2 py-1 rounded border flex items-center gap-2 transition-all
                    ${isClickable 
                        ? 'bg-slate-800 text-indigo-300 border-indigo-500/30 hover:bg-indigo-900/30 hover:border-indigo-400 cursor-pointer' 
                        : 'bg-slate-800 text-slate-400 border-slate-600 cursor-default'}
                `}
                title={isClickable ? "Jump to source message" : "No source link"}
            >
                {visualization.type}
                {isClickable && <Link className="w-3 h-3" />}
            </button>
        </div>
      </div>

      <div className="p-4 bg-slate-800/50"> 
        {visualization.type === VisualizationType.SCATTER_PLOT && (
          <ScatterPlot data={visualization.data} config={visualization.config} />
        )}

        {visualization.type === VisualizationType.BOX_PLOT && (
          <div>
            <StatsBarChart data={visualization.data} config={visualization.config} />
            <PairwiseTable data={visualization.data} />
          </div>
        )}

        {visualization.type === VisualizationType.AGING_CURVE && (
            <div>
                <AgingCurveChart data={visualization.data} config={visualization.config} />
            </div>
        )}

        {visualization.type === VisualizationType.CLUSTERING_DASHBOARD && (
            <div>
                <ClusteringDashboard data={visualization.data} config={visualization.config} />
            </div>
        )}

        {visualization.type === VisualizationType.STRATIFICATION_RESULT && (
            <div>
                <StratificationChart data={visualization.data} config={visualization.config} />
            </div>
        )}

        {visualization.type === VisualizationType.SVM_BOUNDARY && (
            <div>
                <SVMBoundaryChart data={visualization.data} config={visualization.config} />
            </div>
        )}

        {visualization.type === VisualizationType.DATA_TABLE && (
          <div className="overflow-x-auto custom-scrollbar">
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
               <div key={idx} className="p-4 bg-slate-900 rounded-lg border border-slate-700 transition-colors">
                 <h4 className="text-md font-bold text-amber-100 mb-1">{paper.title}</h4>
                 <p className="text-xs text-amber-300/80 mb-2">{paper.authors} • {paper.year} • {paper.journal}</p>
                 <p className="text-sm text-slate-400 leading-relaxed">{paper.summary}</p>
               </div>
             ))}
           </div>
        )}

        {visualization.type === VisualizationType.RESEARCH_REPORT && (
          <div>
            <ResearchReport 
              data={visualization.data} 
              onLinkClick={(stepId) => onReportLinkClick && onReportLinkClick(stepId)} 
            />
          </div>
        )}
      </div>
    </div>
  );
};

const VisualizerArea: React.FC<VisualizerAreaProps> = ({ visualizations, datasetName, onVizClick, activeDatasetIds }) => {
  const handleReportLinkClick = (stepId: number) => {
    const reportViz = visualizations.find(v => v.type === VisualizationType.RESEARCH_REPORT);
    if (reportViz && reportViz.data.stepIdToMessageId[stepId]) {
      const messageId = reportViz.data.stepIdToMessageId[stepId];
      if (onVizClick) onVizClick(messageId);
    }
  };

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
           <VisualizationCard 
             key={index} 
             visualization={viz} 
             onClick={() => onVizClick && onVizClick(viz.datasetId || viz.messageId)}
             onReportLinkClick={handleReportLinkClick}
             isActiveDataset={viz.datasetId ? activeDatasetIds?.includes(viz.datasetId) : false}
           />
        ))}
      </div>
    </div>
  );
};

export default VisualizerArea;
