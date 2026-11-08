# History currency-neutral formatting

Updated the shared History table formatter to display signed decimal amounts without a hard-coded currency symbol or ISO currency assumption. Examples: `+8.73`, `-0.03`, `+8.70`.

The cTrader history mapper no longer falls back to USD when a deal does not include currency metadata. Monetary scaling continues to use the deal's `moneyDigits`; no FX conversion is performed.

This change affects presentation only. Broker-provided values and the existing realized P&L / commission / net P&L calculations are retained.
