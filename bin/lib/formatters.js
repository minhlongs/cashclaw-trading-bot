// ANSI Terminal Color & Table Formatters for CashClaw CLI
// Complies with < 150 LOC constraint and zero external dependencies.

const isColorSupported = !process.env.NO_COLOR && process.stdout.isTTY;

function color(code, text) {
  return isColorSupported ? `\x1b[${code}m${text}\x1b[0m` : text;
}

const c = {
  bold: (t) => color('1', t),
  dim: (t) => color('2', t),
  cyan: (t) => color('36', t),
  green: (t) => color('32', t),
  yellow: (t) => color('33', t),
  red: (t) => color('31', t),
  magenta: (t) => color('35', t),
};

function renderBanner(version = '1.62.0-open-core') {
  const line = '━'.repeat(54);
  return [
    c.cyan(line),
    c.bold(c.cyan('   ██████╗ █████╗ ███████╗██╗  ██╗ ██████╗██╗      █████╗ ██╗    ██╗')),
    c.bold(c.cyan('  ██╔════╝██╔══██╗██╔════╝██║  ██║██╔════╝██║     ██╔══██╗██║    ██║')),
    c.bold(c.cyan('  ██║     ███████║███████╗███████║██║     ██║     ███████║██║ █╗ ██║')),
    c.bold(c.cyan('  ██║     ██╔══██║╚════██║██╔══██║██║     ██║     ██╔══██║██║███╗██║')),
    c.bold(c.cyan('  ╚██████╗██║  ██║███████║██║  ██║╚██████╗███████╗██║  ██║╚███╔███╔╝')),
    c.bold(c.cyan('   ╚═════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝ ╚═════╝╚══════╝╚═╝  ╚═╝ ╚══╝╚══╝ ')),
    c.dim(`       Open-Core Algorithmic Trading Framework  •  v${version}`),
    c.yellow('  [ADR-001] SAFETY MODE: PAPER / BACKTEST ONLY. No Real Funds.'),
    c.cyan(line),
  ].join('\n');
}

function renderTable(rows) {
  const maxLabel = Math.max(...rows.map((r) => r.label.length));
  return rows
    .map((r) => `  ${c.dim(r.label.padEnd(maxLabel + 2))}: ${c.bold(r.value)}`)
    .join('\n');
}

function renderBox(title, content) {
  const width = 56;
  const top = `┌─ ${c.bold(title)} ${'─'.repeat(Math.max(0, width - title.length - 4))}┐`;
  const bottom = `└${'─'.repeat(width)}┘`;
  return [top, content, bottom].join('\n');
}

module.exports = {
  c,
  renderBanner,
  renderTable,
  renderBox,
};
