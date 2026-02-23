import React, { useState, useEffect, useRef } from 'react';
import { X, Copy, Check, RotateCcw, Save } from 'lucide-react';

interface CodeEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  html: string;
  onSave: (newHtml: string) => void;
  title?: string;
}

const CodeEditorModal: React.FC<CodeEditorModalProps> = ({
  isOpen,
  onClose,
  html,
  onSave,
  title = 'Edit HTML Code'
}) => {
  const [code, setCode] = useState(html);
  const [copied, setCopied] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setCode(html);
    setHasChanges(false);
  }, [html, isOpen]);

  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isOpen]);

  const handleCodeChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setCode(e.target.value);
    setHasChanges(e.target.value !== html);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleReset = () => {
    setCode(html);
    setHasChanges(false);
  };

  const handleSave = () => {
    onSave(code);
    setHasChanges(false);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Ctrl/Cmd + S to save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (hasChanges) {
        handleSave();
      }
    }
    // Escape to close
    if (e.key === 'Escape') {
      onClose();
    }
    // Tab for indentation
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = textareaRef.current;
      if (textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const newCode = code.substring(0, start) + '  ' + code.substring(end);
        setCode(newCode);
        setHasChanges(true);
        // Reset cursor position
        setTimeout(() => {
          textarea.selectionStart = textarea.selectionEnd = start + 2;
        }, 0);
      }
    }
  };

  if (!isOpen) return null;

  // Format/prettify the HTML for display
  const formatHtml = (htmlStr: string): string => {
    try {
      let formatted = htmlStr;
      // Basic formatting - add newlines after closing tags
      formatted = formatted.replace(/></g, '>\n<');
      // Indent nested elements (simple approach)
      const lines = formatted.split('\n');
      let indent = 0;
      const indentedLines = lines.map(line => {
        const trimmed = line.trim();
        if (trimmed.startsWith('</')) {
          indent = Math.max(0, indent - 1);
        }
        const indentedLine = '  '.repeat(indent) + trimmed;
        if (trimmed.startsWith('<') && !trimmed.startsWith('</') && !trimmed.endsWith('/>') && !trimmed.includes('</')) {
          indent++;
        }
        return indentedLine;
      });
      return indentedLines.join('\n');
    } catch {
      return htmlStr;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-[90vw] max-w-4xl h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <span className="text-indigo-400">{'</>'}</span>
            {title}
            {hasChanges && (
              <span className="text-xs bg-amber-600 text-white px-2 py-0.5 rounded">Unsaved</span>
            )}
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded text-slate-300 transition-colors"
              title="Copy to clipboard"
            >
              {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button
              onClick={handleReset}
              disabled={!hasChanges}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded text-slate-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Reset to original"
            >
              <RotateCcw className="w-4 h-4" />
              Reset
            </button>
            <button
              onClick={handleSave}
              disabled={!hasChanges}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-500 rounded text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Save changes (Ctrl+S)"
            >
              <Save className="w-4 h-4" />
              Save
            </button>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-slate-200 transition-colors"
              title="Close (Escape)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Code Editor */}
        <div className="flex-1 overflow-hidden p-4">
          <textarea
            ref={textareaRef}
            value={code}
            onChange={handleCodeChange}
            onKeyDown={handleKeyDown}
            className="w-full h-full bg-slate-950 text-slate-300 font-mono text-sm p-4 rounded-lg border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none"
            style={{ 
              tabSize: 2,
              lineHeight: 1.6,
            }}
            spellCheck={false}
            placeholder="HTML code here..."
          />
        </div>

        {/* Footer with hints */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-slate-700 text-xs text-slate-500">
          <span>Tab for indent • Ctrl+S to save • Escape to close</span>
          <span>{code.length} characters</span>
        </div>
      </div>
    </div>
  );
};

export default CodeEditorModal;