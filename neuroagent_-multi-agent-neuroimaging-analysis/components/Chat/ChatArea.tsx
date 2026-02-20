import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ChatMessage, AgentType, Dataset } from '../../types';
import MessageBubble from './MessageBubble';
import { Send, Upload, PlayCircle, FileSpreadsheet, Plus, Trash2, CheckCircle2, Merge, RefreshCw } from 'lucide-react';

interface ChatAreaProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  onFileUpload?: (file: File) => void;  // Optional for viz mode
  onLoadDemo?: () => void;               // Optional for viz mode
  isProcessing: boolean;
  hasData: boolean;
  highlightedMessageId: string | null;
  onRestartStep?: (messageId: string, newParams: any) => void;
  placeholder?: string;
  datasets: Dataset[];
  activeDatasetIds: string[];
  onDatasetToggle: (id: string) => void;
  onDatasetRemove: (id: string, e: React.MouseEvent) => void;
  onMultiFileUpload: (files: FileList | null) => void;
  onMergeDatasets: () => void;
  onSyncDataset: () => void;
}

const ChatArea: React.FC<ChatAreaProps> = React.memo(({ 
  messages, onSendMessage, onFileUpload, onLoadDemo, isProcessing, hasData, highlightedMessageId, onRestartStep,
  placeholder,
  datasets, activeDatasetIds, onDatasetToggle, onDatasetRemove, onMultiFileUpload, onMergeDatasets, onSyncDataset
}) => {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageRefs = useRef<{[key: string]: HTMLDivElement | null}>({});
  const prevMessageCountRef = useRef(messages.length);
  const scrollToBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
  }, []);

  useEffect(() => {
    if (!highlightedMessageId) {
      scrollToBottom();
    }
  }, [messages, highlightedMessageId, scrollToBottom]);

  useEffect(() => {
    if (highlightedMessageId && messageRefs.current[highlightedMessageId]) {
        messageRefs.current[highlightedMessageId]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightedMessageId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isProcessing) {
      onSendMessage(input);
      setInput('');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0 && onFileUpload) {
      onFileUpload(e.target.files[0]);
    }
  };

  // Determine if we should show the upload prompt
  // Don't show if onFileUpload is not provided (viz mode) or if we already have data
  const showUploadPrompt = !hasData && onFileUpload && onLoadDemo;

  // Default placeholder based on context
  const inputPlaceholder = placeholder 
    || (hasData 
      ? "Ask about the data (e.g., 'Correlation between Amyloid and Age?')" 
      : "Upload data first...");

  return (
    <div className="flex flex-col h-full bg-slate-900 border-l border-slate-800">
      <div className="flex-none p-4 border-b border-slate-800 bg-slate-900/50 backdrop-blur">
        <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500"></span>
          Research Assistant
        </h2>
        <p className="text-xs text-slate-400">Multi-Agent System Active</p>
      </div>

      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar scroll-smooth"
      >
        {messages.map((msg) => (
          <div key={msg.id} ref={(el) => { messageRefs.current[msg.id] = el; }}>
            <MessageBubble 
                message={msg} 
                isHighlighted={msg.id === highlightedMessageId}
                onRestart={onRestartStep}
            />
          </div>
        ))}
        {isProcessing && (
           <div className="flex items-center gap-2 ml-2 py-1">
             <svg className="animate-spin h-4 w-4 text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
               <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
               <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
             </svg>
             <span className="text-xs text-slate-400">Agents are working...</span>
           </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="flex-none p-4 bg-slate-900 border-t border-slate-800">
        
        {/* Compact File System */}
        <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
                 <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                      <FileSpreadsheet className="w-3 h-3" /> Data Context
                  </h3>
                   <div className="flex gap-2">
                     {activeDatasetIds.length > 1 && (
                        <button 
                            onClick={onMergeDatasets}
                            className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 bg-indigo-900/20 px-2 py-1 rounded border border-indigo-900/50"
                            title="Merge selected datasets into a new file"
                        >
                            <Merge className="w-3 h-3" /> Merge
                        </button>
                     )}
                     {hasData && (
                        <button 
                            onClick={onSyncDataset}
                            className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1 hover:bg-slate-800 px-2 py-1 rounded"
                            title="Force sync active context to server"
                        >
                            <RefreshCw className="w-3 h-3" /> Sync
                        </button>
                     )}
                     <button 
                        onClick={onLoadDemo}
                        className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1 hover:bg-slate-800 px-2 py-1 rounded"
                      >
                        <PlayCircle className="w-3 h-3" /> Demo
                      </button>
                      <label className="cursor-pointer text-xs flex items-center gap-1 bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-1 rounded transition-colors shadow-sm">
                          <Plus className="w-3 h-3" /> Add CSV
                          <input 
                            type="file" 
                            multiple 
                            accept=".csv" 
                            className="hidden" 
                            onChange={(e) => onMultiFileUpload(e.target.files)} 
                          />
                      </label>
                   </div>
            </div>
            
            <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto custom-scrollbar">
                {datasets.length === 0 && (
                     <div className="w-full py-2 text-xs text-slate-500 text-center border border-dashed border-slate-700 rounded bg-slate-800/50">
                        No datasets active. Upload a CSV to begin.
                     </div>
                )}
                {datasets.map(ds => {
                    const isActive = activeDatasetIds.includes(ds.id);
                    return (
                        <div 
                        key={ds.id}
                        onClick={() => onDatasetToggle(ds.id)}
                        className={`
                            group flex items-center gap-2 px-3 py-1.5 rounded-md text-sm border cursor-pointer transition-all select-none
                            ${isActive
                                ? 'bg-indigo-900/40 border-indigo-500/50 text-indigo-200' 
                                : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-slate-200'}
                        `}
                        >
                            {isActive && <CheckCircle2 className="w-3 h-3 text-indigo-400" />}
                            <span className="truncate max-w-[120px]">{ds.name}</span>
                            <button 
                            onClick={(e) => onDatasetRemove(ds.id, e)}
                            className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity"
                            >
                                <Trash2 className="w-3 h-3" />
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>

        <form onSubmit={handleSubmit} className="relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isProcessing}
            placeholder={inputPlaceholder}
            className="w-full bg-slate-800 text-slate-200 rounded-lg pl-4 pr-12 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 border border-slate-700 disabled:opacity-50 placeholder-slate-500"
          />
          <button
            type="submit"
            disabled={!input.trim() || isProcessing}
            className="absolute right-2 top-2 p-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md disabled:opacity-50 disabled:hover:bg-indigo-600 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
        {onFileUpload && (
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            accept=".csv" 
            className="hidden" 
          />
        )}
      </div>
    </div>
  );
});

export default ChatArea;