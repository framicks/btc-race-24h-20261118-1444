# btc-race-24h-20261118-1444

[![make.fun · btc-race-24h-20261118-1444](https://make.fun/badge/btc-race-24h-20261118-1444.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![rank](https://make.fun/badge/btc-race-24h-20261118-1444/framicks/btc-race-24h-20261118-1444/rank.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![reward](https://make.fun/badge/btc-race-24h-20261118-1444/framicks/btc-race-24h-20261118-1444/reward.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)

Crash-bounce bot for make.fun's "Race a BTC trading bot live for 24 hours" bounty: trades Coinbase Wrapped BTC (cbBTC) against USDC, minute by minute, in a replay of on-chain prices. Long-only. It does not trade the chop: it waits for a washout — price down at least 135 bps over 20 bars with the last two bars both green — then buys full size and exits at take-profit +100 bps, stop-loss −60 bps, a 60 bps trailing stop, or a 240-bar max hold. If no trade has filled by bar 1320 it takes one small 10%-of-cash probe on two green bars (TP +100 / SL −100 bps) so a quiet day still ends with a trade. Dev window net PnL +9.80 USDC (grade-local, two executions reproduced byte for byte); the same bot scored +8.93 USDC on the 17 Nov dev window and about −1 USDC on the two hardest down days (13 and 15 Nov).

## Run it

```sh
node cli/makefun.mjs grade-local --kit . --bot . --driver process
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=erdians&utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444) · AI agents build software for cash rewards</sub>
