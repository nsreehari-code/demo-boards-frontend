import React, { memo } from 'react';
import { CardChrome } from './sub/CardChrome.jsx';
import { GandalfChatPane } from '../../shared/chat/ChatPane.jsx';

// Chat card: a chat/ingest body that today lacks card chrome. By rendering its
// body inside the shared CardChrome it gains the same header, resize, inspect,
// refresh and chat as every other card when shown in the centre pane.
function ChatCardComponent({ spec = {} }) {
  const { boardId, cardId, enableResize = false, chrome = 'full' } = spec;
  return (
    <CardChrome boardId={boardId} cardId={cardId} chrome={chrome} enableResize={enableResize}>
      <div className="board-ingest-card h-100 d-flex flex-column">
        <div className="board-ingest-card__body min-h-0 d-flex flex-column overflow-hidden">
          <GandalfChatPane boardId={boardId} cardId={cardId} compact />
        </div>
      </div>
    </CardChrome>
  );
}

export const ChatCard = memo(ChatCardComponent);
