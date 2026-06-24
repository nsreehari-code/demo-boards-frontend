import { createContext } from 'react';

// Bounded recursion guard (conformance item 6). Each container render descends
// one level; the engine refuses to render past MAX_RENDER_DEPTH.
export const MAX_RENDER_DEPTH = 32;

export const RenderDepthContext = createContext(0);
