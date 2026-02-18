import React, { useEffect, useRef, useState } from 'react';
import { ChatMessage, AgentType } from '../../types';
import MessageBubble from './MessageBubble';
import { Send, Upload, PlayCircle } from 'lucide-react';

interface ChatAreaProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  onFileUpload?: (file: File) => void;  // Optional for viz mode
  onLoadDemo?: () => void;               // Optional for viz mode
  isProcessing: boolean;
  hasData: boolean;
  highlightedMessageId: string | null;
  onRestartStep?: (messageId: string, newParams: any) => void;  // Optional for viz mode
  placeholder?: string;  // Custom placeholder text
}

const ChatArea: React.FC<ChatAreaProps> = ({ 
  messages, 
  onSendMessage, 
  onFileUpload, 
  onLoadDemo, 
  isProcessing, 
  hasData, 
  highlightedMessageId, 
  onRestartStep,
  placeholder 
}) => {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageRefs = useRef<{[key: string]: HTMLDivElement | null}>({});

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (!highlightedMessageId) {
        scrollToBottom();
    }
  }, [messages, highlightedMessageId]);

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
    if (e.target.files && e.target.files[0] && onFileUpload) {
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
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
          Research Assistant
        </h2>
        <p className="text-xs text-slate-400">Multi-Agent System Active</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
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
           <div className="flex justify-start animate-pulse ml-2">
             <span className="text-xs text-slate-500 bg-slate-800 px-3 py-1 rounded-full">Agents are working...</span>
           </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="flex-none p-4 bg-slate-900 border-t border-slate-800">
        {showUploadPrompt && (
          <div className="mb-4 p-4 bg-slate-800/50 rounded-lg border border-dashed border-slate-700 text-center">
            <p className="text-sm text-slate-300 mb-3">Upload a CSV dataset to begin analysis</p>
            <div className="flex justify-center gap-3">
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-sm transition-colors"
              >
                <Upload className="w-4 h-4" /> Upload CSV
              </button>
              <button 
                onClick={onLoadDemo}
                className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-sm transition-colors"
              >
                <PlayCircle className="w-4 h-4" /> Load Demo Data
              </button>
            </div>
          </div>
        )}
        
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
};

export default ChatArea;