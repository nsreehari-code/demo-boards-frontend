import React from 'react';

const VARIANT_BASE = {
  secondary: 'btn btn-outline-secondary board-button',
  primary: 'btn btn-primary board-button',
  // `plain` opts out of the button styling so modal-chrome buttons (e.g. the
  // close "X") can supply their own classes via `className`.
  plain: '',
};

/**
 * Standardized action button used across the board settings modal.
 *
 * Props:
 *   variant   – 'secondary' (default) | 'primary' | 'plain' base styling
 *   icon      – Bootstrap icon class (e.g. 'bi-flask'); rendered as <i>
 *   iconNode  – custom icon node (e.g. an inline SVG); overrides `icon`
 *   children  – button label
 *   className – extra classes appended to the variant base
 *   type      – button type (default 'button')
 *   …rest     – forwarded to <button> (onClick, disabled, title, aria-label,
 *               data-testid, etc.)
 *
 * When an icon and a label are both present, the flex/gap layout classes are
 * added automatically.
 */
export function BoardConfigButton({
  variant = 'secondary',
  icon = null,
  iconNode = null,
  children = null,
  className = '',
  type = 'button',
  ...rest
}) {
  const renderedIcon = iconNode ?? (icon ? <i className={`bi ${icon}`} aria-hidden="true" /> : null);
  const autoFlex = renderedIcon && children != null ? 'd-inline-flex align-items-center gap-1' : '';
  const base = VARIANT_BASE[variant] ?? VARIANT_BASE.secondary;
  const classes = [base, autoFlex, className].filter(Boolean).join(' ');

  return (
    <button type={type} className={classes} {...rest}>
      {renderedIcon}
      {children}
    </button>
  );
}
