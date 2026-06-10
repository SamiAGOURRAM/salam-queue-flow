export interface SlashQueryState {
  query: string;
  from: number;
  to: number;
}

// Detect a trailing slash command token in the current text segment.
export function extractSlashQuery(textBeforeCursor: string, cursorPosition: number): SlashQueryState | null {
  const match = textBeforeCursor.match(/(?:^|\s)\/([a-zA-Z0-9_-]{0,40})$/);
  if (!match) return null;

  const query = match[1] ?? '';
  const tokenLength = query.length + 1;

  return {
    query,
    from: Math.max(0, cursorPosition - tokenLength),
    to: cursorPosition,
  };
}
