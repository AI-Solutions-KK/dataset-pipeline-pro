
import React, { useEffect, useRef } from 'react';
import { Activity, Terminal } from 'lucide-react';
import { LogEntry } from '../types';

interface LogWindowProps {
  logs: LogEntry[];
}

const LogWindow: React.FC<LogWindowProps> = ({ logs }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="bg-black/40 border border-slate-800/50 rounded-[2rem] flex flex-col h-full overflow-hidden shadow-2xl ring-1 ring-white/5">
      <div className="bg-slate-900/80 px-6 py-3 border-b border-slate-800 flex items-center justify-between">
        <span className="text-[9px] text-slate-400 font-black uppercase tracking-[0.2em]">System Log Stream</span>
        <Activity size={12} className="text-slate-600 animate-pulse" />
      </div>

      <div 
        ref={scrollRef}
        className="flex-1 p-6 overflow-y-auto font-mono text-[10px] space-y-4 selection:bg-indigo-500/50 custom-scrollbar"
      >
        {logs.length === 0 ? (
          <div className="text-slate-700 italic flex flex-col items-center justify-center h-full gap-4 opacity-40">
            <Terminal size={32} strokeWidth={1} />
            <span className="tracking-widest text-[9px] font-black uppercase">Engine Standby</span>
          </div>
        ) : (
          logs.map((log, idx) => (
            <div key={idx} className="flex gap-4 group transition-all">
              <span className="shrink-0 select-none text-[8px] font-bold text-slate-600 tabular-nums pt-0.5">
                {log.timestamp}
              </span>
              <span className={`leading-relaxed relative pl-4 border-l border-slate-800 group-hover:border-indigo-500/40 transition-colors ${
                log.type === 'error' ? 'text-red-400' : 
                log.type === 'success' ? 'text-emerald-400' : 
                log.type === 'warning' ? 'text-amber-400' : 'text-slate-400'
              }`}>
                <span className="absolute -left-[3px] top-1.5 w-1.5 h-1.5 rounded-full bg-current opacity-20" />
                <span className="opacity-40 mr-1.5 font-black">{log.type === 'success' ? '>>' : '>'}</span>
                {log.message}
              </span>
            </div>
          ))
        )}
      </div>
      
      <div className="p-4 bg-black/40 border-t border-slate-800/50 flex justify-between items-center px-6">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Active Session</span>
        </div>
        <span className="text-[9px] text-slate-600 font-mono uppercase">Node-V8</span>
      </div>
    </div>
  );
};

export default LogWindow;
