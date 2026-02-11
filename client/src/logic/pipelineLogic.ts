// logic/pipelineLogic.ts
/**
 * Pipeline Logic - Python Backend Integration
 * 
 * This module communicates with the Python pipeline_engine.py script
 * to perform actual text processing, chunking, and dataset generation.
 */

import { DatasetChunk, DatasetReport } from '../types';

// API base (env-safe). If empty, use same origin.
const API = (import.meta as any).env?.VITE_API_BASE || '';

// ============================================================================
// PYTHON BACKEND COMMUNICATION
// ============================================================================

/**
 * Execute the Python pipeline and get real-time logs
 * 
 * For Node.js/Electron integration:
 * Uses child_process to spawn Python script
 * 
 * For Tauri integration:
 * Uses Tauri's Command API to invoke Rust backend
 */
export async function executePythonPipeline(
  filePath: string,
  onLog: (message: string, type: 'info' | 'success' | 'error' | 'warning') => void
): Promise<boolean> {
  try {
    // Check if we're running in Tauri environment
    if (window.__TAURI__) {
      return await executeTauriPipeline(filePath, onLog);
    } else {
      // Fallback to fetch-based approach (requires backend server)
      return await executeFetchPipeline(filePath, onLog);
    }
  } catch (error) {
    onLog(`Pipeline error: ${error}`, 'error');
    return false;
  }
}

/**
 * Execute pipeline using Tauri's invoke command
 */
async function executeTauriPipeline(
  filePath: string,
  onLog: (message: string, type: 'info' | 'success' | 'error' | 'warning') => void
): Promise<boolean> {
  try {
    const { invoke } = window.__TAURI__.tauri;
    
    // Call Rust backend which spawns Python process
    const result = await invoke('run_pipeline', { filePath });
    
    // Parse logs from Python output
    const logs = (result as string).split('\n');
    for (const line of logs) {
      if (line.startsWith('LOG:')) {
        const message = line.substring(5).trim();
        const type = detectLogType(message);
        onLog(message, type);
      }
    }
    
    return true;
  } catch (error) {
    onLog(`Tauri pipeline error: ${error}`, 'error');
    return false;
  }
}

/**
 * Execute pipeline using HTTP API (requires Node.js backend)
 */
async function executeFetchPipeline(
  filePath: string,
  onLog: (message: string, type: 'info' | 'success' | 'error' | 'warning') => void
): Promise<boolean> {
  const controller = new AbortController();
  const timeoutMs = 2 * 60 * 1000; // 2 minutes
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    onLog('[INFO] Connecting to backend server...', 'info');

    const response = await fetch(`${API}/api/run-pipeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath }),
      signal: controller.signal,
    });

    if (!response.ok) {
      let errText = response.statusText || `Status ${response.status}`;
      try {
        const txt = await response.text();
        if (txt) errText = txt;
      } catch {}
      onLog(`[ERROR] Server returned: ${errText}`, 'error');
      return false;
    }

    // If streaming is not supported, fallback to whole text
    if (!response.body || !response.body.getReader) {
      try {
        const text = await response.text();
        if (text) onLog(text, 'info');
        return response.ok;
      } catch (err) {
        onLog(`[ERROR] Failed to read response: ${String(err)}`, 'error');
        return false;
      }
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    onLog('[INFO] Backend connected, running pipeline...', 'info');

    while (true) {
      let chunk;
      try {
        chunk = await reader.read();
      } catch (err) {
        onLog(`[ERROR] Stream read failed: ${String(err)}`, 'error');
        return false;
      }

      const { done, value } = chunk as any;
      if (done) break;

      try {
        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n');
        for (const line of lines) {
          if (!line) continue;
          if (line.startsWith('LOG:')) {
            const message = line.substring(5).trim();
            const type = detectLogType(message);
            onLog(message, type);
          } else {
            onLog(line, 'info');
          }
        }
      } catch (err) {
        onLog(`[ERROR] Failed to decode stream chunk: ${String(err)}`, 'error');
      }
    }

    return true;
  } catch (err) {
    if ((err as any)?.name === 'AbortError') {
      onLog('[ERROR] Request timed out', 'error');
    } else {
      onLog(`[ERROR] Network error: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
    return false;
  } finally {
    try { clearTimeout(timeoutId); } catch {}
  }
}

/**
 * Detect log type from message content
 */
function detectLogType(message: string): 'info' | 'success' | 'error' | 'warning' {
  if (message.includes('✅') || message.includes('COMPLETE')) return 'success';
  if (message.includes('❌') || message.includes('Error') || message.includes('Failed')) return 'error';
  if (message.includes('⚠️') || message.includes('Warning')) return 'warning';
  return 'info';
}

// ============================================================================
// DATASET FILE LOADING
// ============================================================================

/**
 * Load generated dataset files from the output directory
 */
export async function loadGeneratedDatasets(): Promise<Record<string, any>> {
  let files: Record<string, any> = {};
  const baseDir = '../datasets'; // Adjust path as needed
  
  try {
    // For Tauri: Use Tauri's fs API
    if (window.__TAURI__) {
      const { readTextFile, readDir } = window.__TAURI__.fs;
      const { resolveResource } = window.__TAURI__.path;
      
      const datasetPath = await resolveResource('datasets');
      const entries = await readDir(datasetPath);
      
      for (const entry of entries) {
        if (entry.name) {
          const content = await readTextFile(`${datasetPath}/${entry.name}`);
          
          if (entry.name.endsWith('.json')) {
            files[entry.name] = JSON.parse(content);
          } else {
            files[entry.name] = content;
          }
        }
      }
    } else {
      // For HTTP API: Fetch from backend (env-safe)
      try {
        const response = await fetch(`${API}/api/datasets`);
        if (!response.ok) {
          return {};
        }

        const text = await response.text().catch(() => '');
        if (!text) return {};

        try {
          files = JSON.parse(text);
        } catch (err) {
          // If backend returned plain text, keep it under a key
          files = { 'raw_output.txt': text } as any;
        }
      } catch (err) {
        console.error('Error fetching datasets:', err);
        return {};
      }
    }
    
    return files;
  } catch (error) {
    console.error('Error loading datasets:', error);
    return {};
  }
}

/**
 * Load the evaluation report
 */
export async function loadEvaluationReport(): Promise<DatasetReport | null> {
  try {
    if (window.__TAURI__) {
      const { readTextFile } = window.__TAURI__.fs;
      const { resolveResource } = window.__TAURI__.path;
      
      const reportPath = await resolveResource('outputs/dataset_report.json');
      const content = await readTextFile(reportPath);
      return JSON.parse(content);
    } else {
      try {
        const response = await fetch(`${API}/api/report`);
        if (!response.ok) return null;
        const text = await response.text().catch(() => '');
        if (!text) return null;
        try {
          return JSON.parse(text);
        } catch (err) {
          return null;
        }
      } catch (err) {
        console.error('Error fetching report:', err);
        return null;
      }
    }
  } catch (error) {
    console.error('Error loading report:', error);
    return null;
  }
}

// ============================================================================
// LEGACY JAVASCRIPT FALLBACK (for demo/testing without Python)
// ============================================================================

/**
 * Clean text using JavaScript (fallback for demo purposes)
 * NOTE: This is NOT the same as the Python implementation!
 * Use executePythonPipeline() for production.
 */
export function cleanText(text: string): string {
  let cleaned = text;
  
  // Fix ligatures
  cleaned = cleaned.replace(/ﬁ/g, 'fi')
                   .replace(/ﬂ/g, 'fl')
                   .replace(/ﬀ/g, 'ff')
                   .replace(/ﬃ/g, 'ffi')
                   .replace(/ﬄ/g, 'ffl');
  
  // Fix smart quotes
  cleaned = cleaned.replace(/['']/g, "'")
                   .replace(/[""]/g, '"')
                   .replace(/[–—]/g, '-');
  
  // Remove URLs
  cleaned = cleaned.replace(/https?:\/\/\S+/g, '');
  cleaned = cleaned.replace(/www\.\S+/g, '');
  
  // Remove excessive whitespace
  cleaned = cleaned.replace(/[ \t]+/g, ' ');
  cleaned = cleaned.replace(/ +\n/g, '\n');
  
  return cleaned;
}

/**
 * Create chunks using JavaScript (fallback for demo purposes)
 * NOTE: This is NOT the same as the Python implementation!
 * Use executePythonPipeline() for production.
 */
export function createChunks(text: string): string[] {
  // Remove unicode issues
  text = text.replace(/\u201c/g, '"').replace(/\u201d/g, '"')
             .replace(/\u2018/g, "'").replace(/\u2019/g, "'")
             .replace(/\u2014/g, "-");
  
  // Sentence split
  const sentences = text.split(/(?<=[.!?])\s+/);
  
  // Filter good sentences
  const goodSentences = sentences.filter(s => {
    s = s.trim();
    if (s.length < 40) return false;
    
    const symbolRatio = (s.match(/[^a-zA-Z0-9\s]/g) || []).length / s.length;
    if (symbolRatio > 0.25) return false;
    
    return true;
  });
  
  // Build chunks
  const CHUNK_WORDS = 180;
  const OVERLAP = 30;
  const chunks: string[] = [];
  let currentWords: string[] = [];
  
  for (const sent of goodSentences) {
    const words = sent.split(/\s+/);
    
    if (currentWords.length + words.length <= CHUNK_WORDS) {
      currentWords.push(...words);
    } else {
      if (currentWords.length > 80) {
        chunks.push(currentWords.join(' '));
      }
      currentWords = [...currentWords.slice(-OVERLAP), ...words];
    }
  }
  
  if (currentWords.length > 80) {
    chunks.push(currentWords.join(' '));
  }
  
  return chunks;
}

/**
 * Generate full dataset (fallback for demo purposes)
 * NOTE: This is NOT the same as the Python implementation!
 * Use executePythonPipeline() for production.
 */
export function generateFullDataset(chunks: string[]): Record<string, any> {
  // Create records
  const records = chunks.map((text, id) => ({
    id,
    text,
    word_count: text.split(/\s+/).length
  }));
  
  // Shuffle for splits
  const shuffled = [...records].sort(() => Math.random() - 0.5);
  const n = shuffled.length;
  const trainEnd = Math.floor(n * 0.8);
  const valEnd = Math.floor(n * 0.9);
  
  const train = shuffled.slice(0, trainEnd);
  const val = shuffled.slice(trainEnd, valEnd);
  const test = shuffled.slice(valEnd);
  
  // Create pairs
  const pairs = [];
  for (let i = 0; i < chunks.length - 1; i++) {
    pairs.push({
      text_a: chunks[i],
      text_b: chunks[i + 1],
      label: 1
    });
  }
  
  // Negative pairs
  for (let i = 0; i < chunks.length; i++) {
    const a = chunks[Math.floor(Math.random() * chunks.length)];
    const b = chunks[Math.floor(Math.random() * chunks.length)];
    if (a !== b) {
      pairs.push({ text_a: a, text_b: b, label: 0 });
    }
  }
  
  // LoRA format
  const loraInstruct = records.map(r => ({
    instruction: "Study the following passage and learn its content.",
    input: "",
    output: r.text
  }));
  
  return {
    'chunks.json': chunks,
    'chunks_with_id.json': records,
    'corpus.txt': chunks.join('\n\n'),
    'lora_instruct.json': loraInstruct,
    'pairs.json': pairs,
    'train.json': train,
    'val.json': val,
    'test.json': test,
  };
}

/**
 * Get statistics from chunks
 */
export function getStats(chunks: string[]) {
  if (chunks.length === 0) return null;
  
  const wordCounts = chunks.map(c => c.split(/\s+/).length);
  const sum = wordCounts.reduce((a, b) => a + b, 0);
  const avg = Math.round(sum / wordCounts.length);
  
  return {
    total: chunks.length,
    words: {
      min: Math.min(...wordCounts),
      max: Math.max(...wordCounts),
      avg: avg
    }
  };
}

// ============================================================================
// TYPESCRIPT TYPE DECLARATIONS
// ============================================================================

declare global {
  interface Window {
    __TAURI__?: {
      tauri: {
        invoke: (cmd: string, args?: any) => Promise<any>;
      };
      fs: {
        readTextFile: (path: string) => Promise<string>;
        readDir: (path: string) => Promise<Array<{ name?: string }>>;
        writeFile: (path: string, content: string) => Promise<void>;
      };
      path: {
        resolveResource: (path: string) => Promise<string>;
      };
    };
  }
}

export {};