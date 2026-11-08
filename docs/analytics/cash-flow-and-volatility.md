# Cash flow, volatility, and performance analytics

## Cash flow

Report gross inflows, gross outflows, and net cash movement separately. Provide breakdowns by source event and classification, with an explicit unknown/unclassified bucket.

Do not label net wallet movement as net profit.

## Volatility

A volatility metric must state:
- exact measurement window and timezone;
- sampling cadence and whether values are daily, transaction-level, or event-level;
- formula and units;
- whether the measure is absolute movement, standard deviation, range, drawdown, or another statistic;
- treatment of transfers and inventory funding;
- source coverage and missing observations.

The user's RIFT-reported observation (about 30B ISK volatility against about 1B ISK net result over 50 days) is an external benchmark only. It is not enough to infer return on capital or a standardized volatility measure. Preserve the exact RIFT definition when it becomes available.

## Performance metrics roadmap

Before cost basis is reliable: cash flow, wallet balance history from observed snapshots, fees/taxes, turnover proxies, unknown movements, and capital deployment indicators with explicit caveats.

After inventory and matching evidence is reliable: inventory cost basis, realized margin, holding period, capital turnover, and return metrics with defined denominators.
