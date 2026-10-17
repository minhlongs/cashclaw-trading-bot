#!/usr/bin/env node

// CashClaw Public CLI Executable (Apache-2.0 Open-Core)
// Commands: quickstart | eval | export-sync | --help | --version

const { renderBanner, renderTable, c } = require('./lib/formatters.js');
const {
  runQuickstartSimulation,
  runQuantitativeEval,
  generateSyncBundle,
  printSaaSCta,
} = require('./lib/commands.js');

const VERSION = '1.62.0-open-core';

function printHelp() {
  console.log(renderBanner(VERSION));
  console.log(`
${c.bold('USAGE:')}
  cashclaw <command> [options]

${c.bold('COMMANDS:')}
  ${c.cyan('quickstart')}     Run paper simulation for Volatility-Adjusted DCA
  ${c.cyan('eval')}           Run quantitative estimators (Garman-Klass, Corwin-Schultz)
  ${c.cyan('export-sync')}    Generate signed JSON bundle for 1-click Cloud SaaS migration

${c.bold('OPTIONS:')}
  ${c.dim('--json')}         Output structured machine-readable JSON
  ${c.dim('--symbol')} <sym> Asset trading pair (default: BTC/USDT)
  ${c.dim('--name')} <name>  Bot instance name for export-sync
  ${c.dim('-h, --help')}     Show this help message
  ${c.dim('-v, --version')}  Show version information

${c.bold('EXAMPLES:')}
  cashclaw quickstart
  cashclaw quickstart --json
  cashclaw eval --symbol ETH/USDT
  cashclaw export-sync --name AlphaGrid --json
`);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const flags = {
    command: null,
    json: false,
    symbol: 'BTC/USDT',
    name: 'CashClawBot',
    help: false,
    version: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') flags.help = true;
    else if (arg === '--version' || arg === '-v') flags.version = true;
    else if (arg === '--json') flags.json = true;
    else if (arg === '--symbol' && args[i + 1]) flags.symbol = args[++i];
    else if (arg === '--name' && args[i + 1]) flags.name = args[++i];
    else if (!flags.command && !arg.startsWith('-')) flags.command = arg;
  }
  return flags;
}

async function main(argv = process.argv) {
  const flags = parseArgs(argv);

  if (flags.version) {
    console.log(`cashclaw v${VERSION}`);
    return 0;
  }

  if (flags.help || !flags.command) {
    printHelp();
    return 0;
  }

  if (flags.command === 'quickstart') {
    const result = runQuickstartSimulation(flags.symbol);
    if (flags.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(renderBanner(VERSION));
      console.log(c.bold(`\n▶ PAPER SIMULATION RESULTS [${flags.symbol}]:\n`));
      console.log(renderTable([
        { label: 'Asset Symbol', value: result.symbol },
        { label: 'Safety Mode', value: result.safetyMode },
        { label: 'Initial Balance', value: `$${result.initialCapital.toLocaleString()}` },
        { label: 'Final Portfolio', value: `$${result.finalValue.toLocaleString()}` },
        { label: 'Simulated PnL', value: `${result.totalPnlPct > 0 ? '+' : ''}${result.totalPnlPct}%` },
        { label: 'Orders Executed', value: `${result.totalOrders}` },
        { label: 'Win Rate', value: `${result.winRatePct}%` },
        { label: 'Max Drawdown', value: `${result.maxDrawdownPct}%` },
      ]));
      printSaaSCta();
    }
    return 0;
  }

  if (flags.command === 'eval') {
    const result = runQuantitativeEval(flags.symbol);
    if (flags.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(renderBanner(VERSION));
      console.log(c.bold(`\n▶ QUANTITATIVE DIAGNOSTIC METRICS [${flags.symbol}]:\n`));
      console.log(renderTable([
        { label: 'Asset Symbol', value: result.symbol },
        { label: 'Sample Bars', value: `${result.sampleBars}` },
        { label: 'Garman-Klass Volatility', value: `${result.garmanKlassVolAnnualized}% annualized` },
        { label: 'Corwin-Schultz Spread', value: `${result.corwinSchultzSpreadBps} bps` },
        { label: 'Market Regime', value: result.regime },
        { label: 'Execution Recommendation', value: result.recommendation },
      ]));
      printSaaSCta();
    }
    return 0;
  }

  if (flags.command === 'export-sync') {
    const bundle = generateSyncBundle(flags.name, flags.symbol);
    if (flags.json) {
      console.log(JSON.stringify(bundle, null, 2));
    } else {
      console.log(renderBanner(VERSION));
      console.log(c.bold(`\n▶ SIGNED CLOUD SYNC BUNDLE CREATED:\n`));
      console.log(renderTable([
        { label: 'Bot Name', value: bundle.payload.botName },
        { label: 'Strategy', value: bundle.payload.strategyId },
        { label: 'Safety Invariant', value: bundle.safetyMode },
        { label: 'SHA-256 Checksum', value: bundle.sha256Checksum },
      ]));
      console.log(c.dim('\nRun with --json to pipe bundle output directly into curl / SaaS API.\n'));
      printSaaSCta();
    }
    return 0;
  }

  console.error(c.red(`Error: Unknown command "${flags.command}". Run "cashclaw --help" for usage.`));
  return 1;
}

if (require.main === module) {
  main().then((code) => {
    if (code !== 0) process.exit(code);
  });
}

module.exports = {
  parseArgs,
  main,
  VERSION,
};
