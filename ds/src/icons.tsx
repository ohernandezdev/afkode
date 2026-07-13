// Internal icon set — the exact inline SVGs the app uses. Not exported from the package.

interface IconProps {
  size?: number;
  opacity?: number;
}

export function CloseIcon({ size = 12, opacity }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} opacity={opacity}>
      <path
        fill="currentColor"
        d="m6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6 10.6 12 5 6.4z"
      />
    </svg>
  );
}

export function SearchIcon({ size = 12, opacity = 0.7 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} opacity={opacity}>
      <path
        fill="currentColor"
        d="M10 2a8 8 0 1 0 4.9 14.3l5.4 5.4 1.4-1.4-5.4-5.4A8 8 0 0 0 10 2Zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12Z"
      />
    </svg>
  );
}

export function BranchIcon({ size = 10 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <path
        fill="currentColor"
        d="M7 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm10 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM7 7v6a4 4 0 0 0 4 4h2m2-9V7"
      />
    </svg>
  );
}

export function FolderIcon({ size = 15 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <path
        fill="currentColor"
        d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2Z"
      />
    </svg>
  );
}

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
