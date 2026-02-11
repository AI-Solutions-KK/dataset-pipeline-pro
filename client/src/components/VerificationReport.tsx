
import React from 'react';
import { FileText, CheckCircle2 } from 'lucide-react';
import { DatasetChunk } from '../types';

interface VerificationReportProps {
  chunks: DatasetChunk[];
}

const VerificationReport: React.FC<VerificationReportProps> = ({ chunks }) => {
  if (chunks.length === 0) return null;

  return (
    <div className="space-y-4 animate-in fade-in duration-700 slide-in-from-bottom-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold uppercase tracking-widest text-slate-500">Verification Report</h4>
        <span className="text-xs text-slate-400">Total: {chunks.length} Chunks</span>
      </div>
      
      <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl overflow-hidden shadow-lg">
        <table className="w-full text-sm text-left">
          <thead className="bg-black/20 text-slate-500 uppercase text-[10px] font-bold tracking-widest">
            <tr>
              <th className="px-6 py-4">ID</th>
              <th className="px-6 py-4">Structure</th>
              <th className="px-6 py-4 text-center">Words</th>
              <th className="px-6 py-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/30">
            {chunks.slice(0, 10).map((chunk) => (
              <tr key={chunk.id} className="hover:bg-slate-700/20 transition-colors">
                <td className="px-6 py-3 font-mono text-indigo-400">{chunk.id.toString().padStart(3, '0')}</td>
                <td className="px-6 py-3">
                  <div className="flex items-center gap-2">
                    <FileText size={14} className="text-slate-500" />
                    <span className="text-slate-300 truncate max-w-[200px]">{chunk.text.substring(0, 40)}...</span>
                  </div>
                </td>
                <td className="px-6 py-3 text-center text-slate-400">{chunk.word_count}</td>
                <td className="px-6 py-3">
                  <div className="flex items-center gap-1.5 text-green-500 font-medium text-xs">
                    <CheckCircle2 size={12} />
                    Verified
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {chunks.length > 10 && (
          <div className="p-4 text-center text-xs text-slate-500 border-t border-slate-700/30 bg-black/5 italic">
            Showing first 10 items of {chunks.length} total chunks...
          </div>
        )}
      </div>
    </div>
  );
};

export default VerificationReport;
