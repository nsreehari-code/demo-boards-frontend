import React from 'react';
import { FloatingCircularButton } from './FloatingCircularButton.jsx';

const BASE_ASIDE_STYLE = {
  position: 'fixed',
  top: 'calc(var(--nav-height) + 0.5rem)',
  height: 'calc(100dvh - var(--nav-height) - 1rem)',
  zIndex: 1040,
  display: 'flex',
  alignItems: 'flex-start',
  pointerEvents: 'none',
};

const BASE_PANEL_STYLE = {
  pointerEvents: 'auto',
  width: 'min(30rem, calc(100vw - 4.5rem))',
  height: '100%',
  overflow: 'hidden',
};

/**
 * Vertical full-height side panel that composes a FAB toggle with a
 * scrollable rail. The FAB sits in the board corner named by `fabPosition`;
 * the panel opens toward the board centre (left corner → panel on the right of
 * the FAB, right corner → panel on the left of the FAB).
 *
 * Props:
 *   fabPosition    – 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
 *                    which board corner the FAB pins to
 *   expanded       – whether the panel is open
 *   onToggle       – () => void; FAB click handler
 *   ariaLabel      – aria-label for the aside layer
 *   title          – FAB tooltip text
 *   icon           – FAB icon when collapsed
 *   iconToggled    – FAB icon when expanded
 *   fabClassName   – class on the FAB (defaults to the board-ingest toggle)
 *   fabClassNameToggled – extra FAB class when expanded
 *   fabProps       – extra props spread onto the FAB (e.g. data-testid)
 *   className      – extra classes on the aside layer
 *   panelClassName – extra classes on the scrollable panel
 *   backdropClassName – extra classes on the dimming backdrop behind the panel
 *   asideStyle     – style overrides merged onto the aside layer
 *   panelStyle     – style overrides merged onto the scrollable panel
 *   children       – panel content (header / nav / body, etc.)
 */
export function PanelVertical({
  fabPosition = 'top-left',
  expanded = false,
  onToggle,
  ariaLabel,
  title,
  icon,
  iconToggled,
  fabClassName,
  fabClassNameToggled = 'is-open',
  fabProps,
  className = '',
  panelClassName = '',
  backdropClassName = '',
  asideStyle,
  panelStyle,
  children,
}) {
  const [vertical, horizontal] = String(fabPosition).split('-');
  const isRight = horizontal === 'right';
  const isBottom = vertical === 'bottom';
  const resolvedAsideStyle = {
    ...BASE_ASIDE_STYLE,
    ...(isRight ? { right: '12px' } : { left: '12px' }),
    ...asideStyle,
  };
  const resolvedPanelStyle = { ...BASE_PANEL_STYLE, ...panelStyle };
  const resolvedFabClassName = fabClassName ?? `board-ingest-toggle${isRight ? ' board-ingest-toggle--right' : ''}`;
  const fabStyle = isBottom ? { alignSelf: 'flex-end' } : undefined;

  return (
    <aside
      aria-label={ariaLabel}
      className={`board-ingest-layer${isRight ? ' board-ingest-layer--right' : ''}${expanded ? ' is-open' : ''}${className ? ` ${className}` : ''}`}
      style={resolvedAsideStyle}
    >
      <FloatingCircularButton
        toggled={expanded}
        icon={icon}
        iconToggled={iconToggled}
        onClick={onToggle}
        className={resolvedFabClassName}
        classNameToggled={fabClassNameToggled}
        aria-pressed={expanded}
        title={title}
        style={fabStyle}
        {...fabProps}
      />

      {expanded ? (
        <>
          <div
            className={`board-ingest-backdrop${isRight ? ' board-ingest-backdrop--right' : ''}${backdropClassName ? ` ${backdropClassName}` : ''}`}
            aria-hidden="true"
          />
          <div
            className={`board-ingest-pane d-flex flex-column${panelClassName ? ` ${panelClassName}` : ''}`}
            style={resolvedPanelStyle}
          >
            {children}
          </div>
        </>
      ) : null}
    </aside>
  );
}

export default PanelVertical;
