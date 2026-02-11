// types.ts
export enum PipelineStage {
  INIT = 'init',
  TEXT_EXTRACTED = 'text_extracted',
  TEXT_CLEANED = 'text_cleaned',
  CHUNKED = 'chunked',
  EXPORTED = 'exported',
}

export interface LogEntry {
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
  timestamp: string;
}

export interface DatasetChunk {
  id: number;
  text: string;
  word_count: number;
}

export interface PipelineState {
  pdf: string;
  stage: string;
  method?: string;
  chunks?: number;
}

export interface DatasetReport {
  total_chunks: number;
  total_records: number;
  word_stats: {
    min: number;
    max: number;
    mean: number;
    median: number;
  };
  char_stats: {
    min: number;
    max: number;
    mean: number;
  };
  short_chunks_under_80w: number;
  duplicate_chunks: number;
  vocab_size_estimate: number;
  pair_label_balance: {
    [key: string]: number;
  };
  splits: {
    train: number;
    val: number;
    test: number;
  };
}

export interface GeneratedFiles {
  'chunks.json': DatasetChunk[];
  'chunks_with_id.json': DatasetChunk[];
  'corpus.txt': string;
  'lora_instruct.json': any[];
  'pairs.json': any[];
  'train.json': DatasetChunk[];
  'val.json': DatasetChunk[];
  'test.json': DatasetChunk[];
  'dataset_report.json': DatasetReport;
}