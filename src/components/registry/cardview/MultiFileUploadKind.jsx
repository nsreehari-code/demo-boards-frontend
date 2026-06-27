import React, { useCallback } from 'react';
import { MessageWithAttachmentsInput } from '../../shared/MessageWithAttachmentsInput.jsx';
import { formatFileSize } from '../../../lib/format.js';

// Reads the bound card_data slice: `data` is expected to be the card_data
// object ({ files, filegroups }). For resilience it also accepts a bare files
// array as `data`.
function resolveFiles(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object' && Array.isArray(data.files)) return data.files;
  return [];
}

function resolveFilegroups(data) {
  if (data && typeof data === 'object' && Array.isArray(data.filegroups)) return data.filegroups;
  return [];
}

function FileGroup({ group, files, fileUrlForIndex }) {
  const fileIdxs = Array.isArray(group?.file_idxs) ? group.file_idxs : [];
  const message = typeof group?.message === 'string' ? group.message.trim() : '';

  return (
    <div className="board-multi-file-upload__group border rounded p-2">
      {message ? (
        <div className="board-multi-file-upload__group-message mb-2">{message}</div>
      ) : null}
      <ul className="board-multi-file-upload__group-files list-unstyled m-0 d-flex flex-wrap gap-2">
        {fileIdxs.map((fileIdx) => {
          const file = files[fileIdx];
          if (!file) return null;
          const href = fileUrlForIndex ? fileUrlForIndex(fileIdx, file) : null;
          const name = file.name || file.stored_name || `file ${fileIdx}`;
          const size = file.size ? ` (${formatFileSize(file.size)})` : '';
          return (
            <li key={fileIdx} className="board-multi-file-upload__group-file badge rounded-pill text-bg-light border d-inline-flex align-items-center gap-1 px-3 py-2 text-body-emphasis">
              {href ? (
                <a href={href} target="_blank" rel="noopener noreferrer" className="text-truncate" style={{ maxWidth: '18rem' }}>{name}</a>
              ) : (
                <span className="text-truncate" style={{ maxWidth: '18rem' }}>{name}</span>
              )}
              {size ? <span className="text-secondary">{size}</span> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function MultiFileUploadKind({ spec = {}, data, services = {} }) {
  const files = resolveFiles(data);
  const filegroups = resolveFilegroups(data);
  const fileUrlForIndex = typeof services.fileUrlForIndex === 'function' ? services.fileUrlForIndex : null;
  const uploadFiles = typeof services.uploadCardFilesMultiple === 'function' ? services.uploadCardFilesMultiple : null;

  const handleSubmit = useCallback(async ({ text, files: staged }) => {
    if (!uploadFiles || !Array.isArray(staged) || staged.length === 0) return;
    await uploadFiles(staged, text);
  }, [uploadFiles]);

  return (
    <div className="board-multi-file-upload d-flex flex-column gap-3">
      {filegroups.length > 0 ? (
        <div className="board-multi-file-upload__groups d-flex flex-column gap-2">
          {filegroups.map((group, groupIndex) => (
            <FileGroup
              key={groupIndex}
              group={group}
              files={files}
              fileUrlForIndex={fileUrlForIndex}
            />
          ))}
        </div>
      ) : null}
      <MessageWithAttachmentsInput
        multiple
        requireAttachment
        disabled={!uploadFiles}
        placeholder={spec.placeholder ?? 'Add a message…'}
        accept={spec.accept}
        submitContent={spec.submitLabel ?? 'Upload'}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
