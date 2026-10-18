// CashClaw Public CLI Terminal Printers (Apache-2.0 Open-Core)
// Extracted from bin/cashclaw.js & bin/lib/commands.js to keep all CLI files <= 110 LOC.

const { renderBanner, renderTable, renderBox, c } = require('./formatters.js');

function printSaaSCta() {
  const ctaContent = [
    `  ${c.cyan('Ready for 24/7 cloud execution with zero server ops?')}`,
    `  ${c.dim('Upgrade to CashClaw Cloud SaaS to run your bots in Cloudflare Workers:')}`,
    `  ${c.bold(c.green('https://cashclaw.app/pricing'))}  ${c.magenta('[Instant Activation via NOWPayments]')}`,
  ].join('\n');
  console.log('\n' + renderBox('CashClaw Cloud Upgrade (Enterprise & Pro)', ctaContent) + '\n');
}

function printHelp(version) {
  console.log(renderBanner(version));
  console.log(`
${c.bold('USAGE:')}
  cashclaw <command> [options]

${c.bold('COMMANDS:')}
  ${c.cyan('quickstart')}     Run paper simulation for Volatility-Adjusted DCA
  ${c.cyan('eval')}           Run quantitative estimators (Garman-Klass, Corwin-Schultz)
  ${c.cyan('export-sync')}    Generate signed JSON bundle for 1-click Cloud SaaS migration
  ${c.cyan('steps')}          Audit 25-step Open-Core & Cloud SaaS readiness

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

function printQuickstartReport(version, symbol, result) {
  console.log(renderBanner(version));
  console.log(c.bold(`\n▶ PAPER SIMULATION RESULTS [${symbol}]:\n`));
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

function printEvalReport(version, symbol, result) {
  console.log(renderBanner(version));
  console.log(c.bold(`\n▶ QUANTITATIVE DIAGNOSTIC METRICS [${symbol}]:\n`));
  console.log(renderTable([
    { label: 'Asset Symbol', value: result.symbol },
    { label: 'Sample Bars', value: `${result.sampleBars}` },
    { label: 'Garman-Klass Volatility', value: `${result.garmanKlassVolAnnualized}% annualized` },
    { label: 'Corwin-Schultz Spread', value: `${result.corwinSchultzSpreadBps} bps` },
    { label: 'Amihud Illiquidity', value: `${result.amihudIlliquidityRatio} (1e-6 ratio)` },
    { label: 'Roll Effective Spread', value: `${result.rollEffectiveSpreadBps} bps` },
    { label: 'Hamilton Crisis Prob', value: `${result.hamiltonCrisisProb}` },
    { label: 'HRP Diversification', value: `${result.hrpDiversificationRatio}x` },
    { label: 'Dupire ATM Local Vol', value: `${result.dupireAtmLocalVol}` },
    { label: 'MOT Corridor Width', value: `${result.motCorridorWidthBps} bps` },
    { label: 'Rough Path Levy Area', value: `${result.roughPathLevyArea12}` },
    { label: 'Avellaneda Opt Spread', value: `${result.avellanedaOptimalSpreadBps} bps` },
    { label: 'Kalman Half-Life', value: `${result.kalmanHalfLifeBars} bars` },
    { label: 'VPIN Toxicity Score', value: `${result.vpinToxicityScore}` },
    { label: 'Funding Basis APR', value: `${result.fundingBasisAprPct}%` },
    { label: 'Market Regime', value: result.regime },
    { label: 'Execution Recommendation', value: result.recommendation },
  ]));
  printSaaSCta();
}

function printSyncBundleReport(version, bundle) {
  console.log(renderBanner(version));
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

function printStepsAuditReport(version, audit) {
  console.log(renderBanner(version));
  console.log(c.bold(`\n▶ 25-STEP OPEN-CORE & CLOUD SAAS AUDIT:\n`));
  console.log(renderTable([
    { label: 'Total Steps', value: `${audit.totalSteps}/25` },
    { label: 'Apache-2.0 Community Core', value: `${audit.apacheSteps} steps` },
    { label: 'Proprietary Cloud SaaS (src/ee)', value: `${audit.commercialSteps} steps` },
    { label: 'Status', value: audit.status },
    { label: 'Readiness Score', value: `${audit.readinessPct}%` },
  ]));
  printSaaSCta();
}

module.exports = {
  printSaaSCta,
  printHelp,
  printQuickstartReport,
  printEvalReport,
  printSyncBundleReport,
  printStepsAuditReport,
};
