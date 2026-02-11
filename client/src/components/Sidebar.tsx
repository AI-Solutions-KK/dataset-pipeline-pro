
import React from 'react';
import { Database, Cpu, Layers, Layout, ChevronRight, Binary, ShieldCheck } from 'lucide-react';
import { PipelineStage } from '../types';

interface SidebarProps {
  currentStage: PipelineStage;
  stats: {
    totalChunks: number;
    wordCount: number;
  };
}

const Sidebar: React.FC<SidebarProps> = ({ currentStage, stats }) => {
  const navItems = [
    { id: 'collection', label: 'Data Collection', icon: Database, stage: PipelineStage.INIT },
    { id: 'cleaning', label: 'Data Processing', icon: Cpu, stage: PipelineStage.TEXT_CLEANED },
    { id: 'dataset', label: 'Dataset Creation', icon: Layers, stage: PipelineStage.CHUNKED },
    { id: 'report', label: 'Final Report', icon: ShieldCheck, stage: PipelineStage.EXPORTED },
  ];

  return (
    <div className="w-[260px] bg-[#1e293b] border-r border-slate-800/50 flex flex-col h-full overflow-hidden shrink-0">
      <div className="p-8 border-b border-slate-800/40">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-600/20">
            <Binary size={22} className="text-white" />
          </div>
          <div className="leading-none">
            <h1 className="font-black text-base tracking-tight text-white uppercase italic">DatasetPro</h1>
            <p className="text-[10px] text-slate-500 font-bold mt-1 tracking-widest uppercase">Pipeline v2.1</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-5 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = currentStage === item.stage;
          return (
            <button
              key={item.id}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-xs font-bold ${
                isActive 
                  ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-600/20' 
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <item.icon size={16} />
              <span className="flex-1 text-left tracking-wide">{item.label}</span>
              {isActive && <ChevronRight size={14} />}
            </button>
          );
        })}
      </nav>

      <div className="p-6 border-t border-slate-800/40 bg-slate-900/20">
        <div className="space-y-4">
          <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-600">Global Stats</h4>
          <div className="space-y-2">
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-slate-500">Samples</span>
              <span className="text-indigo-400 font-mono font-bold">{stats.totalChunks}</span>
            </div>
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-slate-500">Words</span>
              <span className="text-indigo-400 font-mono font-bold">{stats.wordCount.toLocaleString()}</span>
            </div>
          </div>
          <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
            <div 
              className="bg-indigo-500 h-full transition-all duration-1000" 
              style={{ width: `${Math.min((stats.totalChunks / 100) * 100, 100)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
