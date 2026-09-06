import type { SVGProps } from "react";

export interface IconProps extends SVGProps<SVGSVGElement> {
  size?: 16 | 20;
}

function IconBase ({ size = 16, children, ...props }: IconProps): JSX.Element {
  return (
    <svg
      {...props}
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export function TasksIcon (props: IconProps): JSX.Element {
  return (
    <IconBase {...props}>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="m3.5 6 1 1 2-2M3.5 12l1 1 2-2M3.5 18l1 1 2-2" />
    </IconBase>
  );
}

export function MoreIcon (props: IconProps): JSX.Element {
  return (
    <IconBase {...props}>
      <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
    </IconBase>
  );
}

export function BellIcon (props: IconProps): JSX.Element {
  return (
    <IconBase {...props}>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </IconBase>
  );
}

export function SettingsIcon (props: IconProps): JSX.Element {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
    </IconBase>
  );
}

export function CloseIcon (props: IconProps): JSX.Element {
  return (
    <IconBase {...props}>
      <path d="m6 6 12 12M18 6 6 18" />
    </IconBase>
  );
}

export function ChevronLeftIcon (props: IconProps): JSX.Element {
  return <IconBase {...props}><path d="m15 18-6-6 6-6" /></IconBase>;
}

export function ChevronRightIcon (props: IconProps): JSX.Element {
  return <IconBase {...props}><path d="m9 18 6-6-6-6" /></IconBase>;
}

export function ChevronDownIcon (props: IconProps): JSX.Element {
  return <IconBase {...props}><path d="m6 9 6 6 6-6" /></IconBase>;
}

export function SearchIcon (props: IconProps): JSX.Element {
  return (
    <IconBase {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </IconBase>
  );
}

export function ExternalLinkIcon (props: IconProps): JSX.Element {
  return (
    <IconBase {...props}>
      <path d="M15 4h5v5M20 4l-9 9" />
      <path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6" />
    </IconBase>
  );
}

export function DownloadIcon (props: IconProps): JSX.Element {
  return (
    <IconBase {...props}>
      <path d="M12 3v12m-5-5 5 5 5-5" />
      <path d="M5 21h14" />
    </IconBase>
  );
}

export function RefreshIcon (props: IconProps): JSX.Element {
  return (
    <IconBase {...props}>
      <path d="M20 11a8 8 0 1 0-2.3 5.7" />
      <path d="M20 4v7h-7" />
    </IconBase>
  );
}

export function AlertIcon (props: IconProps): JSX.Element {
  return (
    <IconBase {...props}>
      <path d="M10.3 3.7 2.2 18a2 2 0 0 0 1.8 3h16a2 2 0 0 0 1.8-3L13.7 3.7a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </IconBase>
  );
}

export function InfoIcon (props: IconProps): JSX.Element {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7h.01" />
    </IconBase>
  );
}
