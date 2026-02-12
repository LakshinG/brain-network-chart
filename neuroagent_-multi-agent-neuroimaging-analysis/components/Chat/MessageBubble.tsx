import React from 'react';
import { AgentType, ChatMessage } from '../../types';
import { AGENT_COLORS } from '../../constants';
import { User, BrainCircuit, Bot, Microscope, Terminal } from 'lucide-react';

interface MessageBubbleProps {
  message: ChatMessage;
}

const getIcon = (role: AgentType) => {
  switch (role) {
    case AgentType.USER: return <User className="w-4 h-4" />;
    case AgentType.PLANNER: return <BrainCircuit className="w-4 h-4" />;
    case AgentType.EXECUTOR: return <Terminal className="w-4 h-4" />;
    case AgentType.RESEARCHER: return <Microscope className="w-4 h-4" />;
    default: return <Bot className="w-4 h-4" />;
  }
};

const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const isUser = message.role === AgentType.USER;
  const colorClass = AGENT_COLORS[message.role] || AGENT_COLORS[AgentType.SYSTEM];

  return (
    <div className={`flex w-full mb-4 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
        <div className={`flex items-center gap-2 mb-1 px-1 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
          <div className={`p-1 rounded-full ${isUser ? 'bg-slate-600' : 'bg-slate-700'} text-slate-200`}>
             {getIcon(message.role)}
          </div>
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            {message.role}
          </span>
          <span className="text-[10px] text-slate-600">
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        
        <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed border shadow-sm whitespace-pre-wrap ${colorClass} ${isUser ? 'rounded-tr-none' : 'rounded-tl-none'}`}>
          {message.content}
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;