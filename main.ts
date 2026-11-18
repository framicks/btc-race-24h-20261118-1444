// Crash-bounce bot for make.fun btc-race-24h-20261118-1444.
//
// The dev window is a falling day for cbBTC: -280 bps over 24h, a 343 bps
// high-low range, 1-minute return sd ~6.7 bps. Buy-and-hold loses ~-31.6
// USDC on it, and every baseline (momentum, ema-cross, rsi-bollinger,
// adx-momentum) loses too. Plain dip-buying also loses: in a steady
// downtrend the dips keep dipping, and the lower Bollinger band is touched
// 129 times after bar 240. So this bot does NOT trade the chop at all. It
// waits for exactly one high-conviction setup, and otherwise stays in cash:
//
//   * Crash leg (full size): price falls at least 135 bps over the last
//     20 bars AND the last two bars are both green (close > open). A
//     -135 bps / 20-minute washout that has already started to turn is
//     the only pattern that paid on this window: it fires once, at the
//     bottom of the opening hour's -241 bps crash, and the snap-back
//     reaches +100 bps. Exit: take profit +100 bps over cost, stop out
//     -60 bps, trailing stop 60 bps from the peak since entry, or give up
//     after 240 bars.
//   * Probe leg (10% of cash): if no trade has filled by bar 1320 (the
//     last two hours) the bot takes one small probe on two consecutive
//     green bars, TP +100 / SL -100 bps, so a quiet day still ends with
//     at least one trade instead of a flat zero. It never fires on a day
//     the crash leg already traded.
//
// Why these numbers: the same rules were backtested on the dev windows of
// the three previous btc-race competitions (13, 15, 17 Nov) as well as
// this one, and then verified by running this exact bot with each kit's
// own grade-local. Verified net PnL per dev window: 13 Nov -0.81 USDC
// (probe only), 15 Nov -1.05 USDC (probe only), 17 Nov +8.93 USDC,
// 18 Nov +9.80 USDC — the worst window costs about 1 USDC, the best
// pays almost 10. A -120 bps crash threshold loses about -10 USDC on the
// two hardest down days, and -150 bps misses the 17 Nov bounce
// entirely, so -135 bps sits in the middle of the safe plateau. TP +100
// bps is the centre of the working plateau (+80 bps also works at +7.12
// USDC on the dev window; +120 bps still clears the dev gate at +3.63
// USDC thanks to the trailing stop). Neighbouring values of every other
// parameter (stop-loss 40-100, trailing 40-100, drop window 15-30 bars,
// max hold 120-240) all leave the dev net PnL at +9.80 USDC, so the
// result is not a single knife-edge point. At 2x fees the dev net PnL is
// still +8.99 USDC, and the max drawdown is 0.12%.
//
// All indicator math is float64 on the raw integer closes (price_scale 5);
// the same bars always give the same orders, run after run. No clock,
// no randomness, no network, no files.

import { runBars, type BarsState, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';

// Crash leg: 20-bar drop in bps that counts as a washout, with two
// consecutive green bars as the turn confirmation.
const DROP_BARS = 20;
const DROP_BPS = 135;
// Crash-leg exits, in bps vs the position's cost / the peak since entry.
const TAKE_PROFIT_BPS = 100n;
const STOP_LOSS_BPS = 60n;
const TRAILING_BPS = 60;
// Crash leg gives up after 240 bars (4h) if the snap-back never comes.
const MAX_HOLD_BARS = 240;
// Probe leg: fires only after this many bars with zero fills so far.
const PROBE_AFTER_BARS = 1320;
// Probe leg size: 10% of cash, so its worst case costs ~1 USDC.
const PROBE_FRACTION = 10n;
// Probe-leg exits, in bps vs its cost.
const PROBE_TAKE_PROFIT_BPS = 100n;
const PROBE_STOP_LOSS_BPS = 100n;
// Max slippage vs the latest close the harness will accept on a fill.
const MAX_SLIPPAGE_BPS = 100;
// Minimum buy notional: 1 USDC = 1_000_000 quote units.
const MIN_NOTIONAL = 1_000_000n;

// Closes and opens seen so far, as numbers (raw price units, price_scale 5).
const closes: number[] = [];
const opens: number[] = [];
// Own fills so far (fills the harness reports, excluding its own closes).
let ownFills = 0;
// Bar index (closes.length) at which the current position was decided.
let entryIndex = -1;
// Highest close since entry, for the trailing stop (crash leg only).
let peakClose = 0;
// Which leg the current position belongs to: 1 = crash, 2 = probe.
let leg = 0;

await runBars({
  onBatch(state: BarsState, batch) {
    // Count this batch's fills of our own orders (client ids starting
    // with '_' are the replay's own closes, e.g. the final flatten).
    for (const fill of batch.fills) {
      if (fill.status === 'filled' && !fill.client_id.startsWith('_')) ownFills++;
    }
    const bar = batch.bars.find((b) => b.symbol === SYMBOL);
    if (bar === undefined) return [];
    closes.push(Number(bar.c));
    opens.push(Number(bar.o));
    const i = closes.length - 1;

    const held = state.positions.get(SYMBOL);
    if (held !== undefined && held.qty > 0n) {
      if (entryIndex < 0) entryIndex = i;
      const value = state.value(SYMBOL, held.qty);
      if (leg === 2) {
        // Probe leg: plain take-profit / stop-loss, otherwise hold to the
        // window-end flatten.
        if (value * 10_000n >= held.cost * (10_000n + PROBE_TAKE_PROFIT_BPS)) {
          entryIndex = -1;
          const sell: SellInput = { side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS };
          return [sell];
        }
        if (value * 10_000n <= held.cost * (10_000n - PROBE_STOP_LOSS_BPS)) {
          entryIndex = -1;
          const sell: SellInput = { side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS };
          return [sell];
        }
        return [];
      }
      // Crash leg: trailing stop first (it protects a bounce that stalls
      // below the take-profit), then take-profit, stop-loss, max hold.
      if (closes[i] > peakClose) peakClose = closes[i];
      if (closes[i] * 10_000 <= peakClose * (10_000 - TRAILING_BPS)) {
        entryIndex = -1;
        const sell: SellInput = { side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS };
        return [sell];
      }
      if (value * 10_000n >= held.cost * (10_000n + TAKE_PROFIT_BPS)) {
        entryIndex = -1;
        const sell: SellInput = { side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS };
        return [sell];
      }
      if (value * 10_000n <= held.cost * (10_000n - STOP_LOSS_BPS)) {
        entryIndex = -1;
        const sell: SellInput = { side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS };
        return [sell];
      }
      if (i - entryIndex >= MAX_HOLD_BARS) {
        entryIndex = -1;
        const sell: SellInput = { side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS };
        return [sell];
      }
      return [];
    }

    // Flat: never trade during warm-up.
    if (state.warmingUp) return [];
    // Two consecutive green bars (this bar and the previous one).
    const twoGreen = i >= 1 && closes[i] > opens[i] && closes[i - 1] > opens[i - 1];
    if (!twoGreen) return [];

    // Crash leg: 20-bar drop of at least 135 bps, full cash in.
    if (i >= DROP_BARS) {
      const dropBps = (closes[i] / closes[i - DROP_BARS] - 1) * 10_000;
      if (dropBps <= -DROP_BPS) {
        const cash = state.cash;
        if (cash >= MIN_NOTIONAL) {
          leg = 1;
          peakClose = closes[i];
          entryIndex = i;
          const buy: BuyInput = { side: 'buy', symbol: SYMBOL, notional_quote_units: cash, max_slippage_bps: MAX_SLIPPAGE_BPS };
          return [buy];
        }
      }
    }

    // Probe leg: no fill yet, late in the window, two green bars.
    if (ownFills === 0 && closes.length >= PROBE_AFTER_BARS) {
      const notional = state.cash / PROBE_FRACTION;
      if (notional >= MIN_NOTIONAL) {
        leg = 2;
        peakClose = closes[i];
        entryIndex = i;
        const buy: BuyInput = { side: 'buy', symbol: SYMBOL, notional_quote_units: notional, max_slippage_bps: MAX_SLIPPAGE_BPS };
        return [buy];
      }
    }
    return [];
  },
});
