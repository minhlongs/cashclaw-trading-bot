#!/usr/bin/env node

// CashClaw Public CLI Executable (Apache-2.0 Open-Core)
// Commands: quickstart | eval | export-sync | steps | --help | --version

const { c } = require('./lib/formatters.js');
const {
  runQuickstartSimulation,
  runQuantitativeEval,
  generateSyncBundle,
  runStepsAudit,
} = require('./lib/commands.js');
const {
  printHelp,
  printQuickstartReport,
  printEvalReport,
  printSyncBundleReport,
  printStepsAuditReport,
} = require('./lib/cli-printers.js');

const VERSION = '1.62.0-open-core';

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
    printHelp(VERSION);
    return 0;
  }

  if (flags.command === 'quickstart') {
    const result = runQuickstartSimulation(flags.symbol);
    if (flags.json) console.log(JSON.stringify(result, null, 2));
    else printQuickstartReport(VERSION, flags.symbol, result);
    return 0;
  }

  if (flags.command === 'eval') {
    const result = runQuantitativeEval(flags.symbol);
    if (flags.json) console.log(JSON.stringify(result, null, 2));
    else printEvalReport(VERSION, flags.symbol, result);
    return 0;
  }

  if (flags.command === 'export-sync') {
    const bundle = generateSyncBundle(flags.name, flags.symbol);
    if (flags.json) console.log(JSON.stringify(bundle, null, 2));
    else printSyncBundleReport(VERSION, bundle);
    return 0;
  }

  if (flags.command === 'steps') {
    const audit = runStepsAudit();
    if (flags.json) console.log(JSON.stringify(audit, null, 2));
    else printStepsAuditReport(VERSION, audit);
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
