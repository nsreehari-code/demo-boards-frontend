// Platform-free board SSE-frame -> UI-snapshot reducer.
//
// The implementation now lives in yaml-flow (`yaml-flow/board-sse-state`) so the
// React frontend and the embedded Reactor (WinUI) shell share a single source of
// truth. This file re-exports it to keep the existing local import paths stable
// (applyBoardSseFrame, createEmptyBoardSnapshot, EMPTY_ARRAY, EMPTY_OBJECT).
export * from 'yaml-flow/board-sse-state';
