// App.tsx - UPDATED WITH PYTHON BACKEND INTEGRATION

import React, { useState, useCallback, useRef, useMemo } from 'react';
import { 
  Download, Upload, RefreshCcw, ArrowRight,
  Terminal as TerminalIcon, ChevronDown, Layers
} from 'lucide-react';
import Sidebar from './components/Sidebar';
import LogWindow from './components/LogWindow';
import VerificationReport from './components/VerificationReport';
import { PipelineStage, LogEntry, DatasetChunk } from './types';
import * as PipelineLogic from './logic/pipelineLogic';

// API base for fetches (env-safe)
const API = (import.meta as any).env?.VITE_API_BASE || '';

const App: React.FC = () => {
  const [stage, setStage] = useState<PipelineStage>(PipelineStage.INIT);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [filePath, setFilePath] = useState<string>('');
  const [uploadInProgress, setUploadInProgress] = useState<boolean>(false);
  const [uploadComplete, setUploadComplete] = useState<boolean>(false);
  const [chunks, setChunks] = useState<DatasetChunk[]>([]);
  const [generatedFiles, setGeneratedFiles] = useState<Record<string, any>>({});
  const [selectedExport, setSelectedExport] = useState<string>('train.json');
  const [isProcessing, setIsProcessing] = useState(false);
  const [report, setReport] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    const timestamp = new Date().toLocaleTimeString('en-GB', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit', 
      hour12: false 
    });
    setLogs(prev => [...prev, { message, type, timestamp }]);
  }, []);

  /**
   * Handle file upload
   * Stores the file path for Python processing
   */
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setFileName(file.name);
    
    // For browser: Create a temporary path
    // For Tauri: Use actual file path
    if (window.__TAURI__) {
      // Tauri provides actual file paths
      const path = (file as any).path || file.name;
      setFilePath(path);
      addLog(`[INFO] File selected: ${file.name}`, 'info');
    } else {
      // Browser: We'll need to upload to a server first
      // For now, store the file object
      setFilePath(file.name);
      setUploadInProgress(true);
      setUploadComplete(false);
      addLog(`[INFO] File selected: ${file.name} (uploading to server...)`, 'info');

      // Upload file to backend server and await completion
      uploadFileToServer(file).then(success => {
        setUploadInProgress(false);
        setUploadComplete(!!success);
      });
    }
  };

  /**
   * Upload file to Node.js backend (for browser mode)
   */
  const uploadFileToServer = async (file: File): Promise<boolean> => {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${API}/api/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        let errText = `Status ${response.status}`;
        try { errText = await response.text(); } catch {}
        addLog(`[ERROR] Upload failed: ${errText}`, 'error');
        return false;
      }

      let data: any = null;
      try {
        data = await response.json();
      } catch (err) {
        addLog('[WARN] Upload returned non-JSON response', 'warning');
      }

      if (data && data.filePath) {
        setFilePath(data.filePath);
        addLog(`[OK] File uploaded: ${data.filePath}`, 'success');
        return true;
      }

      addLog('[OK] Upload completed', 'success');
      return true;
    } catch (error) {
      addLog(`[ERROR] Upload failed: ${String(error)}`, 'error');
      return false;
    }
  };

  /**
   * Execute the complete Python pipeline
   * This replaces the old step-by-step JavaScript logic
   */
  const runCompletePipeline = async () => {
    if (!filePath) {
      addLog('[ERROR] No file selected', 'error');
      return;
    }

    // Prevent double runs
    if (isProcessing) return;

    setIsProcessing(true);
    addLog('[START] Starting Python Pipeline Engine...', 'info');
    addLog('='.repeat(60), 'info');

    try {
      const success = await PipelineLogic.executePythonPipeline(filePath, (m, t) => addLog(m, t));

      if (!success) {
        addLog('[ERROR] Pipeline execution failed', 'error');
        return;
      }

      addLog('='.repeat(60), 'info');
      addLog('[OK] Pipeline execution complete!', 'success');

      // Load generated datasets
      addLog('[INFO] Loading generated datasets...', 'info');
      try {
        const files = await PipelineLogic.loadGeneratedDatasets();
        if (files && typeof files === 'object') {
          setGeneratedFiles(files);

          if (files['chunks_with_id.json'] && Array.isArray(files['chunks_with_id.json'])) {
            setChunks(files['chunks_with_id.json']);
            addLog(`[OK] Loaded ${files['chunks_with_id.json'].length} chunks`, 'success');
          } else {
            addLog('[WARN] No chunks found in output', 'warning');
          }
        } else {
          addLog('[WARN] No generated files were returned', 'warning');
        }
      } catch (loadError) {
        addLog(`[WARN] Could not load datasets: ${String(loadError)}`, 'warning');
      }

      // Load evaluation report
      try {
        const evalReport = await PipelineLogic.loadEvaluationReport();
        if (evalReport && typeof evalReport === 'object') {
          setReport(evalReport);
          addLog('[OK] Loaded evaluation report', 'success');
        } else {
          addLog('[INFO] No evaluation report produced', 'info');
        }
      } catch (reportError) {
        addLog(`[WARN] Could not load report: ${String(reportError)}`, 'warning');
      }

      // Update stage to exported
      setStage(PipelineStage.EXPORTED);
      addLog('[OK] All datasets ready for export!', 'success');
    } catch (error) {
      addLog(`[ERROR] Pipeline error: ${String(error)}`, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * Download selected dataset file
   */
  const downloadSelected = () => {
    const data = generatedFiles[selectedExport];
    if (!data) return;
    
    const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    const mime = selectedExport.endsWith('.json') ? 'application/json' : 'text/plain';
    const blob = new Blob([content], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = selectedExport;
    a.click();
    addLog(`[OK] Exported ${selectedExport}`, 'success');
  };

  /**
 * Clean all generated files on server
 */
  const handleCleanAll = async () => {
    try {
      addLog('[CLEAN] Clearing all generated files...', 'info');

      // Use POST for clean-all for wider compatibility with some hosts
      const res = await fetch(`${API}/api/clean-all`, { method: 'POST' });

      if (!res.ok) {
        let txt = `Status ${res.status}`;
        try { txt = await res.text(); } catch {}
        throw new Error(txt || 'Clean failed');
      }

      // reset UI state
      setChunks([]);
      setGeneratedFiles({});
      setReport(null);
      setStage(PipelineStage.INIT);
      setFileName('');
      setFilePath('');

      addLog('[OK] Server files cleaned', 'success');

    } catch (e) {
      addLog(`[ERROR] Clean failed: ${e}`, 'error');
    }
  };


  /**
   * Get statistics from chunks or report
   */
  const evalStats = useMemo(() => {
    if (report && typeof report === 'object') {
      const total = report.total_chunks ?? null;
      const wordStats = report.word_stats ?? null;
      return {
        total: total ?? (Array.isArray(chunks) ? chunks.length : 0),
        words: {
          min: wordStats?.min ?? 0,
          max: wordStats?.max ?? 0,
          avg: wordStats?.mean ?? 0
        }
      };
    }

    const texts = Array.isArray(chunks) ? chunks.map(c => c.text || '') : [];
    return PipelineLogic.getStats(texts) ?? { total: 0, words: { min: 0, max: 0, avg: 0 } };
  }, [chunks, report]);

  return (
    <div className="flex h-screen bg-[#0f172a] text-slate-200 overflow-hidden font-sans">
      <Sidebar 
        currentStage={stage} 
        stats={{ 
          totalChunks: Array.isArray(chunks) ? chunks.length : 0, 
          wordCount: (Array.isArray(chunks) ? chunks : []).reduce((acc, curr) => acc + (curr?.word_count || 0), 0)
        }} 
      />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-slate-800 flex items-center justify-between px-8 bg-slate-900/40 backdrop-blur-md z-20">
          <div className="flex items-center gap-4">
            <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">
              Workspace / Python Pipeline
            </h2>
            <div className="px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 tracking-widest">
              ACTIVE
            </div>
          </div>
          <div className="flex items-center gap-4">
            {stage === PipelineStage.EXPORTED && (
              <button 
                onClick={downloadSelected}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 shadow-lg shadow-indigo-600/20"
              >
                <Download size={14} /> Export Selected
              </button>
            )}
            <button
            onClick={handleCleanAll}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-600/20 text-rose-400 border border-rose-500/30 hover:bg-rose-600/30 transition-all"
          >
            Clean All
          </button>

            <div className="h-4 w-[1px] bg-slate-700"></div>
            <button 
              onClick={() => window.location.reload()} 
              className="p-2 text-slate-500 hover:text-white transition-colors"
            >
              <RefreshCcw size={16} />
            </button>
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden">
          <main className="flex-1 overflow-y-auto p-10 scroll-smooth custom-scrollbar bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')]">
            <div className="max-w-3xl mx-auto space-y-10">
              <div className="space-y-2">
                <h1 className="text-3xl font-extrabold text-white tracking-tight">
                  Dataset Preparation
                </h1>
                <p className="text-slate-400 text-sm">
                  Convert technical documentation into high-fidelity training data via Python Pipeline Engine.
                </p>
              </div>

              {/* Central Block Controller */}
              <div className="bg-gradient-to-br from-slate-800/40 to-slate-900/40 border-2 border-slate-700/50 rounded-[2.5rem] p-12 shadow-2xl backdrop-blur-sm">
                {stage === PipelineStage.INIT ? (
                  <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500">
                    <div className="space-y-3">
                      <h3 className="text-2xl font-bold text-white">
                        Pipeline Engine
                      </h3>
                      <p className="text-slate-400 text-sm leading-relaxed max-w-md">
                        Model-agnostic NLP pipeline that converts TEXT/PDFs into clean, chunked, training-ready datasets for BERT, LoRA, QLoRA, and semantic pair training.
                      </p>

                    </div>
                    
                    <div className="flex items-center gap-4 flex-wrap">
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleFileUpload} 
                        className="hidden" 
                        accept=".txt,.pdf" 
                      />
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="px-8 py-4 rounded-2xl bg-slate-800 border-2 border-slate-700 hover:border-indigo-500 text-white text-sm font-bold transition-all flex items-center gap-3 shadow-2xl active:scale-95"
                      >
                        <Upload size={18} /> {fileName || 'Choose Source File'}
                      </button>
                      
                      {filePath && (
                        <button 
                          onClick={runCompletePipeline}
                          disabled={isProcessing || (!uploadComplete && !window.__TAURI__)}
                          className="px-10 py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-black transition-all flex items-center gap-3 shadow-2xl shadow-indigo-600/30 active:scale-95 disabled:opacity-50"
                        >
                          {isProcessing ? 'Processing...' : 'Process Document'} <ArrowRight size={18} />
                        </button>
                      )}
                    </div>
                    
                    <div className="mt-6 p-4 bg-slate-900/40 border border-slate-700/30 rounded-xl">
                      <p className="text-xs text-slate-400 leading-relaxed">
                        <strong className="text-indigo-400">Pipeline Features:</strong> Industrial-grade text extraction and processing. Supports PDF and TXT files up to 100MB. Processing includes automatic text cleaning, intelligent chunking, and quality reporting.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-8 animate-in fade-in slide-in-from-left-4 duration-500">
                    <div className="space-y-3">
                      <h3 className="text-2xl font-bold text-white">Pipeline Complete</h3>
                      <p className="text-slate-400 text-sm leading-relaxed max-w-lg">
                        Dataset processing successful. All files have been generated and are ready for export.
                        Choose your desired format from the dropdown below.
                      </p>
                    </div>
                    
                    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                        Select Export Format
                      </label>
                      <div className="flex items-center gap-4">
                        <div className="relative flex-1">
                          <select 
                            value={selectedExport}
                            onChange={(e) => setSelectedExport(e.target.value)}
                            className="w-full bg-slate-900 border-2 border-slate-700 rounded-2xl px-6 py-4 appearance-none focus:border-indigo-500 transition-colors font-bold text-sm text-white"
                          >
                            <optgroup label="Raw & Cleaned Text">
                              <option value="raw_text.txt">raw_text.txt - Original extracted text</option>
                              <option value="clean_text.txt">clean_text.txt - Cleaned & normalized text</option>
                            </optgroup>
                            <optgroup label="Generated Datasets">
                              {Object.keys(generatedFiles ?? {})
                                .filter(f => !['raw_text.txt', 'clean_text.txt'].includes(f))
                                .map(f => (
                                  <option key={f} value={f}>{f}</option>
                                ))}
                            </optgroup>
                          </select>
                          <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={18} />
                        </div>
                        <button 
                          onClick={downloadSelected}
                          className="px-8 py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-black flex items-center gap-3 transition-all shadow-xl shadow-emerald-900/20 active:scale-95"
                        >
                          <Download size={18} /> Download
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Status & Verification Section */}
              <div className="space-y-8 pb-20">
                {stage === PipelineStage.EXPORTED && evalStats && (
                  <div className="grid grid-cols-3 gap-6 animate-in zoom-in-95 duration-700">
                    <div className="bg-slate-800/20 border border-slate-700/50 p-8 rounded-3xl backdrop-blur-sm">
                      <span className="text-[10px] font-black text-slate-500 uppercase block mb-2 tracking-widest">
                        Total Chunks
                      </span>
                      <span className="text-3xl font-black text-indigo-400 font-mono tracking-tighter">
                        {evalStats.total}
                      </span>
                    </div>
                    <div className="bg-slate-800/20 border border-slate-700/50 p-8 rounded-3xl backdrop-blur-sm">
                      <span className="text-[10px] font-black text-slate-500 uppercase block mb-2 tracking-widest">
                        Avg Word Count
                      </span>
                      <span className="text-3xl font-black text-indigo-400 font-mono tracking-tighter">
                        {evalStats.words.avg}
                      </span>
                    </div>
                    <div className="bg-slate-800/20 border border-slate-700/50 p-8 rounded-3xl backdrop-blur-sm">
                      <span className="text-[10px] font-black text-slate-500 uppercase block mb-2 tracking-widest">
                        Validation Split
                      </span>
                      <span className="text-3xl font-black text-emerald-500 font-mono tracking-tighter">
                        10%
                      </span>
                    </div>
                  </div>
                )}

                {chunks.length > 0 ? (
                  <VerificationReport chunks={chunks} />
                ) : (
                  <div className="h-64 rounded-[2.5rem] border-2 border-dashed border-slate-800/50 flex flex-col items-center justify-center text-slate-600">
                    {isProcessing ? (
                      <>
                        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4" />
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400 animate-pulse">
                          Python Engine Running...
                        </p>
                      </>
                    ) : (
                      <>
                        <Layers size={40} className="mb-4 opacity-10" />
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-30">
                          Awaiting Pipeline Execution
                        </p>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </main>

          {/* Right Column Monitor */}
          <div className="w-[380px] p-6 border-l border-slate-800/50 bg-[#0f172a]/95 backdrop-blur-xl shrink-0">
            <div className="flex items-center justify-between mb-4 px-2">
              <div className="flex items-center gap-2">
                <TerminalIcon size={12} className="text-indigo-500" />
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                  Python Engine Logs
                </h4>
              </div>
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                <div className="w-1.5 h-1.5 rounded-full bg-slate-700" />
              </div>
            </div>
            <div className="h-[calc(100vh-140px)]">
              <LogWindow logs={logs} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;