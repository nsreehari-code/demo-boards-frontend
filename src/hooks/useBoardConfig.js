import { useManagedBoardConfig } from './useManagedBoardConfig.js';

export function useBoardConfig(boardId) {
  const { config, loading } = useManagedBoardConfig(boardId);

  return {
    config: config
      ? {
          metadata: config.metadata ?? {},
          board: config.board ?? null,
        }
      : null,
    loading,
  };
}