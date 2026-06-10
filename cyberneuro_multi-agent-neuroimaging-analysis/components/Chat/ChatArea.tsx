import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { ChatMessage, AgentType, Dataset } from '../../types';
import { WorkflowHistory, WorkflowRecord } from '../../workflowTypes';
import MessageBubble from './MessageBubble';
import ThinkingOverlay from '../AgentProgress/ThinkingOverlay';
import { Send, Upload, PlayCircle, FileSpreadsheet, Plus, Trash2, CheckCircle2, Merge, RefreshCw, ImagePlus, Download, ChevronDown, ChevronUp } from 'lucide-react';
/* ═══════════════════════════════════════════════════════════════════════════
   Roles that stay visible in the outer chat stream.
   Everything else is folded into the ThinkingOverlay.
   ═══════════════════════════════════════════════════════════════════════════ */
const OUTER_CHAT_ROLES = new Set([
  AgentType.USER,
  AgentType.EXECUTOR,
  AgentType.RESEARCHER,
  AgentType.VISION,
  AgentType.PROPOSAL_REPORTER,
  AgentType.DATA_MANIPULATOR,
  AgentType.PREPROCESSOR,
  AgentType.SYSTEM,
]);

/* ═══════════════════════════════════════════════════════════════════════════
   Render-item builder: interleave outer messages with ThinkingOverlay bars
   ═══════════════════════════════════════════════════════════════════════════ */
interface RenderItem {
  type: 'message' | 'thinking';
  message?: ChatMessage;
  record?: WorkflowRecord;
  workflowMessages?: ChatMessage[];
}

interface GroupedRenderItem {
  type: 'message' | 'thinking' | 'system-group';
  message?: ChatMessage;
  record?: WorkflowRecord;
  workflowMessages?: ChatMessage[];
  messages?: ChatMessage[];
  id: string;
}

function buildRenderItems(
  messages: ChatMessage[],
  records: WorkflowRecord[]
): RenderItem[] {
  const items: RenderItem[] = [];
  const recordsByStart = [...records].sort((a, b) => a.startIndex - b.startIndex);

  let nextRecordIdx = 0;

  for (let i = 0; i < messages.length; i++) {
    while (nextRecordIdx < recordsByStart.length && recordsByStart[nextRecordIdx].startIndex <= i) {
      const rec = recordsByStart[nextRecordIdx];
      const end = rec.endIndex === -1 ? messages.length : rec.endIndex;
      const wfMessages = messages.slice(rec.startIndex, end);
      items.push({ type: 'thinking', record: rec, workflowMessages: wfMessages });
      nextRecordIdx++;
    }

    const msg = messages[i];
    if (OUTER_CHAT_ROLES.has(msg.role)) {
      items.push({ type: 'message', message: msg });
    }
  }

  while (nextRecordIdx < recordsByStart.length) {
    const rec = recordsByStart[nextRecordIdx];
    const end = rec.endIndex === -1 ? messages.length : rec.endIndex;
    const wfMessages = messages.slice(rec.startIndex, end);
    items.push({ type: 'thinking', record: rec, workflowMessages: wfMessages });
    nextRecordIdx++;
  }

  return items;
}

function groupSystemMessages(items: RenderItem[]): GroupedRenderItem[] {
  const grouped: GroupedRenderItem[] = [];
  let systemRun: ChatMessage[] = [];

  const flushSystemRun = () => {
    if (systemRun.length === 0) return;
    if (systemRun.length === 1) {
      grouped.push({
        type: 'message',
        message: systemRun[0],
        id: systemRun[0].id,
      });
    } else {
      grouped.push({
        type: 'system-group',
        messages: [...systemRun],
        id: `system-group-${systemRun[0].id}-${systemRun[systemRun.length - 1].id}`,
      });
    }
    systemRun = [];
  };

  items.forEach((item) => {
    if (item.type === 'message' && item.message?.role === AgentType.SYSTEM) {
      systemRun.push(item.message);
      return;
    }

    flushSystemRun();

    if (item.type === 'message' && item.message) {
      grouped.push({ ...item, id: item.message.id });
      return;
    }

    if (item.type === 'thinking' && item.record) {
      grouped.push({ ...item, id: item.record.id });
    }
  });

  flushSystemRun();
  return grouped;
}
/* ═══════════════════════════════════════════════════════════════════════════
   Props — identical to gh-page original + workflow history
   ═══════════════════════════════════════════════════════════════════════════ */
interface ChatAreaProps {
  messages: ChatMessage[];
  onSendMessage: (text: string, forceIntent?: string) => void;
  onAbortWorkflow: () => void;
  canAbortWorkflow: boolean;
  disableAddCsv?: boolean;
  disableAddImage?: boolean;
  addCsvDisabledHint?: string;
  addImageDisabledHint?: string;
  onFileUpload?: (file: File) => void;
  onLoadDemo?: (kind: 'fc' | 'bold' | 'wm') => void;
  isProcessing: boolean;
  hasData: boolean;
  highlightedMessageId: string | null;
  onRestartStep?: (messageId: string, newParams: any) => void;
  placeholder?: string;
  datasets: Dataset[];
  activeDatasetIds: string[];
  onDatasetToggle: (id: string) => void;
  onDatasetRemove: (id: string, e: React.MouseEvent) => void;
  onDatasetDownload?: (id: string, e: React.MouseEvent) => void;
  onMultiFileUpload: (files: FileList | null) => void;
  onImageUpload: (files: FileList | null) => void;
  uploadedImages: { fileName: string; uploadedAt: number }[];
  activeImageId: number | null;
  onImageToggle: (uploadedAt: number) => void;
  onImageRemove: (uploadedAt: number, e: React.MouseEvent) => void;
  onMergeDatasets: () => void;
  onSyncDataset: () => void;
  disableSend?: boolean;
  disableSendHint?: string;
  // NEW: workflow history
  history: WorkflowHistory;
  onWidgetAction?: (messageId: string, action: string, data: any) => void;
}

const ChatArea: React.FC<ChatAreaProps> = React.memo(({
  messages, onSendMessage, onAbortWorkflow, canAbortWorkflow, disableAddCsv = false, disableAddImage = false, addCsvDisabledHint, addImageDisabledHint, onFileUpload, onLoadDemo, isProcessing, hasData, highlightedMessageId, onRestartStep,
  placeholder,
  datasets, activeDatasetIds, onDatasetToggle, onDatasetRemove, onDatasetDownload, onMultiFileUpload, onImageUpload,
  uploadedImages, activeImageId, onImageToggle, onImageRemove, onMergeDatasets, onSyncDataset,
  disableSend = false, disableSendHint,
  history,
  onWidgetAction,
}) => {
  const [input, setInput] = useState('');
  const [forcedIntent, setForcedIntent] = useState<string | null>(null);
  const [expandedWorkflowId, setExpandedWorkflowId] = useState<string | null>(null);
  const [expandedSystemGroupIds, setExpandedSystemGroupIds] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageRefs = useRef<{[key: string]: HTMLDivElement | null}>({});

  // Navigation state for bubble → thinking overlay
  const [pendingHighlightId, setPendingHighlightId] = useState<string | null>(null);
  const [highlightedWorkflowId, setHighlightedWorkflowId] = useState<string | null>(null);

  // Live elapsed timer for the active workflow
  const [liveElapsed, setLiveElapsed] = useState(0);
  const liveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const liveStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (history.activeId) {
      if (!liveStartRef.current) liveStartRef.current = Date.now();
      liveTimerRef.current = setInterval(() => {
        if (liveStartRef.current) setLiveElapsed(Math.floor((Date.now() - liveStartRef.current) / 1000));
      }, 1000);
    } else {
      if (liveTimerRef.current) { clearInterval(liveTimerRef.current); liveTimerRef.current = null; }
      liveStartRef.current = null;
    }
    return () => { if (liveTimerRef.current) clearInterval(liveTimerRef.current); };
  }, [history.activeId]);

  useEffect(() => {
    if (history.activeId) {
      liveStartRef.current = Date.now();
      setLiveElapsed(0);
    }
  }, [history.activeId]);

  // Build render items
  const renderItems = useMemo(
    () => buildRenderItems(messages, history.records),
    [messages, history.records]
  );
  const groupedRenderItems = useMemo(
    () => groupSystemMessages(renderItems),
    [renderItems]
  );

  const scrollToBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
  }, []);

  useEffect(() => {
    if (!highlightedMessageId && !expandedWorkflowId) {
      scrollToBottom();
    }
  }, [messages, highlightedMessageId, expandedWorkflowId, scrollToBottom]);

  useEffect(() => {
    if (highlightedMessageId && !expandedWorkflowId && messageRefs.current[highlightedMessageId]) {
      messageRefs.current[highlightedMessageId]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightedMessageId, expandedWorkflowId]);

  useEffect(() => {
    if (!highlightedMessageId) return;
    const containingGroup = groupedRenderItems.find(
      (item) =>
        item.type === 'system-group' &&
        item.messages?.some((message) => message.id === highlightedMessageId)
    );

    if (!containingGroup) return;
    setExpandedSystemGroupIds(prev => {
      if (prev.has(containingGroup.id)) return prev;
      const next = new Set(prev);
      next.add(containingGroup.id);
      return next;
    });
  }, [groupedRenderItems, highlightedMessageId]);

  // Helper: find which workflow a message belongs to
  const findWorkflowForMessageId = (msgId: string): WorkflowRecord | null => {
    const msgIdx = messages.findIndex((m) => m.id === msgId);
    if (msgIdx === -1) return null;
    for (const rec of history.records) {
      const end = rec.endIndex === -1 ? messages.length : rec.endIndex;
      if (msgIdx >= rec.startIndex && msgIdx < end) return rec;
    }
    return null;
  };

  // Navigation: when highlightedMessageId changes, decide whether to highlight bar or scroll
  useEffect(() => {
    if (!highlightedMessageId) {
      setHighlightedWorkflowId(null);
      setPendingHighlightId(null);
      return;
    }

    const msgIdx = messages.findIndex((m) => m.id === highlightedMessageId);
    if (msgIdx === -1) return;
    const msg = messages[msgIdx];
    const targetWorkflow = findWorkflowForMessageId(highlightedMessageId);

    if (!targetWorkflow) return;

    if (expandedWorkflowId && expandedWorkflowId !== targetWorkflow.id) {
      setExpandedWorkflowId(null);
    }

    if (!OUTER_CHAT_ROLES.has(msg.role)) {
      if (expandedWorkflowId === targetWorkflow.id) {
        return;
      }
      setHighlightedWorkflowId(targetWorkflow.id);
      setPendingHighlightId(highlightedMessageId);
    } else {
      setHighlightedWorkflowId(targetWorkflow.id);
      setPendingHighlightId(highlightedMessageId);
    }
  }, [highlightedMessageId]);

  // Clear bar highlight after timeout
  useEffect(() => {
    if (!highlightedWorkflowId) return;
    const timer = setTimeout(() => setHighlightedWorkflowId(null), 3000);
    return () => clearTimeout(timer);
  }, [highlightedWorkflowId]);

  const handleExpand = (workflowId: string) => {
    setExpandedWorkflowId(workflowId);
    setHighlightedWorkflowId(null);
  };

  const handleCollapse = () => {
    setExpandedWorkflowId(null);
    setPendingHighlightId(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isProcessing && !disableSend) {
      onSendMessage(input, forcedIntent ?? undefined);
      setInput('');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0 && onFileUpload) {
      onFileUpload(e.target.files[0]);
    }
  };

  const inputPlaceholder = placeholder
    || (hasData
      ? "Ask about the data (e.g., 'Correlation between Amyloid and Age?')"
      : "Upload data first...");

  // Dedup tracker for workflow rendering
  const renderedWorkflows = new Set<string>();

  return (
    <div className="h-full">

    {/* BidsConversionForm removed — preprocessing is now handled via multi-agent chat flow */}

    <div className="w-full h-full p-4 flex items-center justify-center bg-transparent relative">
      <div className="w-full rounded-[14px] border-2 border-slate-500/90 bg-slate-900/85 shadow-2xl shadow-slate-950/40 backdrop-blur-xl overflow-hidden">
        <div className="flex-none p-4 border-b border-slate-800 bg-slate-900/50 backdrop-blur">
          <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            Chat Area
          </h2>
          {/* <p className="text-xs text-slate-400">Multi-Agent System Active</p> */}
        </div>
        <div
          ref={scrollContainerRef}    
          // className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2 custom-scrollbar scroll-smooth"
          className="overflow-y-auto p-4 space-y-2 custom-scrollbar scroll-smooth"
          style={{ maxHeight: 'calc(100dvh - 20rem' }}
        >
        {groupedRenderItems.map((item) => {
          if (item.type === 'message' && item.message) {
            return (
              <div key={item.message.id} ref={(el) => { messageRefs.current[item.message!.id] = el; }}>
                <MessageBubble
                  message={item.message}
                  isHighlighted={item.message.id === highlightedMessageId}
                  onRestart={onRestartStep}
                  onWidgetAction={onWidgetAction}
                />
              </div>
            );
          }

          if (item.type === 'system-group' && item.messages) {
            const isExpanded = expandedSystemGroupIds.has(item.id);
            const first = item.messages[0];
            const last = item.messages[item.messages.length - 1];

            return (
              <div key={item.id} className="mb-3">
                <button
                  onClick={() =>
                    setExpandedSystemGroupIds(prev => {
                      const next = new Set(prev);
                      if (next.has(item.id)) next.delete(item.id);
                      else next.add(item.id);
                      return next;
                    })
                  }
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-slate-700 bg-slate-800/70 hover:bg-slate-800 text-left transition-colors"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      System Updates
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {item.messages.length} messages, {new Date(first.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} to {new Date(last.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  )}
                </button>

                {isExpanded && (
                  <div className="mt-2">
                    {item.messages.map((message) => (
                      <div key={message.id} ref={(el) => { messageRefs.current[message.id] = el; }}>
                        <MessageBubble
                          message={message}
                          isHighlighted={message.id === highlightedMessageId}
                          onRestart={onRestartStep}
                          onWidgetAction={onWidgetAction}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          }

          if (item.type === 'thinking' && item.record) {
            if (renderedWorkflows.has(item.record.id)) return null;
            renderedWorkflows.add(item.record.id);

            const rec = item.record;
            const isActiveWf = rec.id === history.activeId;
            const wfMsgs = isActiveWf
              ? messages.slice(rec.startIndex)
              : item.workflowMessages!;

            return (
              <ThinkingOverlay
                key={rec.id}
                record={rec}
                isActive={isActiveWf}
                workflowMessages={wfMsgs}
                highlightedMessageId={highlightedMessageId}
                pendingHighlightId={pendingHighlightId}
                onRestartStep={onRestartStep || (() => {})}
                isExpanded={expandedWorkflowId === rec.id}
                onRequestExpand={() => handleExpand(rec.id)}
                onRequestCollapse={handleCollapse}
                isBarHighlighted={highlightedWorkflowId === rec.id && expandedWorkflowId !== rec.id}
                elapsedSeconds={isActiveWf ? liveElapsed : rec.elapsedSeconds}
              />
            );
          }

          return null;
        })}

        {isProcessing && !history.activeId && (
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

        <div className="flex-none p-4 bg-slate-900/95 border-t border-slate-800">

        {/* Compact File System — preserved from gh-page */}
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
                        onClick={() => onLoadDemo?.('fc')}
                        className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1 hover:bg-slate-800 px-2 py-1 rounded"
                      >
                        <PlayCircle className="w-3 h-3" /> Demo: FC
                      </button>
                      <button
                        onClick={() => onLoadDemo?.('wm')}
                        className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1 hover:bg-slate-800 px-2 py-1 rounded"
                      >
                        <PlayCircle className="w-3 h-3" /> Demo: WM
                      </button>
                      <button
                        onClick={() => onLoadDemo?.('bold')}
                        className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1 hover:bg-slate-800 px-2 py-1 rounded"
                      >
                        <PlayCircle className="w-3 h-3" /> Demo: BOLD
                      </button>
                      <label className={`text-xs flex items-center gap-1 px-2 py-1 rounded transition-colors shadow-sm ${disableAddCsv ? 'cursor-not-allowed bg-indigo-900 text-indigo-300' : 'cursor-pointer bg-indigo-600 hover:bg-indigo-500 text-white'}`} title={disableAddCsv ? (addCsvDisabledHint || 'Disabled during current workflow') : 'Add CSV or NIfTI'}>
                          <Plus className="w-3 h-3" /> Add File
                          <input
                            type="file"
                            multiple
                            accept=".csv,.nii,.nii.gz"
                            className="hidden"
                            disabled={disableAddCsv}
                            onChange={(e) => {
                              onMultiFileUpload(e.target.files);
                              e.currentTarget.value = '';
                            }}
                          />
                      </label>
                      <label className={`text-xs flex items-center gap-1 px-2 py-1 rounded transition-colors shadow-sm ${disableAddImage ? 'cursor-not-allowed bg-cyan-900 text-cyan-300' : 'cursor-pointer bg-cyan-600 hover:bg-cyan-500 text-white'}`} title={disableAddImage ? (addImageDisabledHint || 'Disabled during current workflow') : 'Add Image'}>
                          <ImagePlus className="w-3 h-3" /> Add Image
                          <input
                            type="file"
                            multiple
                            accept="image/*"
                            className="hidden"
                            disabled={disableAddImage}
                            onChange={(e) => {
                              onImageUpload(e.target.files);
                              e.currentTarget.value = '';
                            }}
                          />
                      </label>
                   </div>
            </div>

            {(disableAddCsv || disableAddImage) && (
              <p className="mt-2 text-[11px] text-amber-300">
                {disableAddImage ? (addImageDisabledHint || 'Abort current workflow to begin an image query.') : (addCsvDisabledHint || 'Abort current workflow to begin a CSV query.')}
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto custom-scrollbar content-start">
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
                               {onDatasetDownload && (
                                  <button
                                  onClick={(e) => onDatasetDownload(ds.id, e)}
                                  className="opacity-0 group-hover:opacity-100 hover:text-indigo-400 transition-opacity"
                                  title="Download CSV"
                                  >
                                      <Download className="w-3 h-3" />
                                  </button>
                              )}
                              <button
                              onClick={(e) => onDatasetRemove(ds.id, e)}
                              className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity"
                              title="Remove dataset"
                              >
                                  <Trash2 className="w-3 h-3" />
                              </button>
                          </div>
                      );
                  })}
              </div>

              <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto custom-scrollbar content-start">
                {uploadedImages.length === 0 && (
                  <div className="w-full py-2 text-xs text-slate-500 text-center border border-dashed border-slate-700 rounded bg-slate-800/50">
                    No images uploaded.
                  </div>
                )}
                {uploadedImages.map(img => {
                  const isActive = activeImageId === img.uploadedAt;
                  return (
                    <div
                      key={img.uploadedAt}
                      onClick={() => onImageToggle(img.uploadedAt)}
                      className={`
                        group flex items-center gap-2 px-3 py-1.5 rounded-md text-sm border cursor-pointer transition-all select-none
                        ${isActive
                          ? 'bg-cyan-900/40 border-cyan-500/50 text-cyan-200'
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-slate-200'}
                      `}
                      title={img.fileName}
                    >
                      {isActive && <CheckCircle2 className="w-3 h-3 text-cyan-400" />}
                      <span className="truncate max-w-[160px]">{img.fileName}</span>
                      <button
                        onClick={(e) => onImageRemove(img.uploadedAt, e)}
                        className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity"
                        title="Remove image"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
        </div>

        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            disabled={isProcessing || disableSend}
            placeholder={disableSend ? (disableSendHint || 'No models available — connect Ollama first') : inputPlaceholder}
            rows={1}
            style={{ resize: 'none', overflow: 'hidden' }}
            ref={(el) => {
              if (el) {
                el.style.height = 'auto';
                el.style.height = Math.min(el.scrollHeight, 160) + 'px';
              }
            }}
            className="flex-1 bg-slate-800 text-slate-200 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 border border-slate-700 disabled:opacity-50 placeholder-slate-500 text-sm leading-relaxed"
          />
          <button
            type="button"
            onClick={onAbortWorkflow}
            disabled={!canAbortWorkflow}
            className="p-2.5 bg-red-700 hover:bg-red-600 text-white rounded-md disabled:opacity-40 disabled:hover:bg-red-700 transition-colors flex-shrink-0"
            title="Abort current workflow and restart from beginning"
          >
            Abort
          </button>
          <button
            type="submit"
            disabled={!input.trim() || isProcessing || disableSend}
            className="p-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md disabled:opacity-50 disabled:hover:bg-indigo-600 transition-colors flex-shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>

        {/* Intent force-select */}
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          <span className="text-[10px] text-slate-500 mr-1">Intent:</span>
          {(['Auto', 'RESEARCH', 'GENERAL', 'VISION', 'DATA_MANIPULATION', 'PREPROCESSING'] as const).map(intent => {
            const isAuto = intent === 'Auto';
            const isActive = isAuto ? !forcedIntent : forcedIntent === intent;
            return (
              <button
                key={intent}
                type="button"
                onClick={() => setForcedIntent(isAuto ? null : intent)}
                className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                  isActive
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-600'
                }`}
              >
                {isAuto ? 'Auto' : intent.replace('_', ' ')}
              </button>
            );
          })}
        </div>
        {onFileUpload && (
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".csv,.nii,.nii.gz"
            className="hidden"
          />
        )}
        </div>
        
      </div>
    </div>
    </div>
  );
});

export default ChatArea;
