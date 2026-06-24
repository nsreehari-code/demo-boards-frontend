import React from 'react';

/**
 * Shared floating circular icon button.
 *
 * Used for the board settings FAB and the Gandalf / Truthset Explore pane
 * toggles. It is a controlled toggle: the parent owns the `toggled` state.
 *
 * When `toggled` is true the button renders `iconToggled` (falling back to
 * `icon`), fires `onClickToggled` (falling back to `onClick`) and appends
 * `classNameToggled` to the class list. Any additional props (title,
 * aria-label, aria-pressed, data-testid, …) are forwarded to the button.
 */
export function FloatingCircularButton({
  toggled = false,
  icon,
  iconToggled,
  onClick,
  onClickToggled,
  className = '',
  classNameToggled = '',
  ...rest
}) {
  const activeIcon = toggled ? (iconToggled ?? icon) : icon;
  const activeOnClick = toggled ? (onClickToggled ?? onClick) : onClick;
  const classes = [
    'd-inline-flex',
    'align-items-center',
    'justify-content-center',
    className,
    toggled ? classNameToggled : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button type="button" className={classes} onClick={activeOnClick} {...rest}>
      <i className={`bi ${activeIcon}`} />
    </button>
  );
}
