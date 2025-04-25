const isColorEnabled = !process.env.NO_COLOR && (process.env.FORCE_COLOR || process.stdout.isTTY);

const baseColors = ["blue", "cyan", "gray", "green", "magenta", "red", "white", "yellow"] as const;
const baseDecorations = ["bold", "dim", "italic", "underline", "reset"] as const;
const ansiCodes = {
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  reset: "\x1b[0m",
  underline: "\x1b[4m",
};

const brightColorMap: Record<string, string> = {
  "\x1b[30m": "\x1b[90m",
  "\x1b[31m": "\x1b[91m",
  "\x1b[32m": "\x1b[92m",
  "\x1b[33m": "\x1b[93m",
  "\x1b[34m": "\x1b[94m",
  "\x1b[35m": "\x1b[95m",
  "\x1b[36m": "\x1b[96m",
  "\x1b[37m": "\x1b[97m",
};

function colorize(colorCode: string) {
  return (text: string) => (isColorEnabled ? `${colorCode}${text}${ansiCodes.reset}` : text);
}

function getColorCode({ bright = false, color }: { bright?: boolean; color: string }) {
  const baseColor = Bun.color(color, "ansi");
  if (!baseColor) return "";

  return bright ? brightColorMap[baseColor] || baseColor : baseColor;
}

const colorDecorations = baseColors.reduce(
  (acc, color) => {
    acc[color] = colorize(getColorCode({ color }));
    acc[`${color}Bright`] = colorize(getColorCode({ bright: true, color }));
    return acc;
  },
  {} as Record<
    (typeof baseColors)[number] | `${(typeof baseColors)[number]}Bright`,
    (text: string) => string
  >,
);

const decorations = baseDecorations.reduce(
  (acc, decoration) => {
    acc[decoration] = colorize(ansiCodes[decoration]);
    return acc;
  },
  {} as Record<(typeof baseDecorations)[number], (text: string) => string>,
);

export const colors = { ...colorDecorations, ...decorations };
