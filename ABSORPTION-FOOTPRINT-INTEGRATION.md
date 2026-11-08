# Absorption panel integration

This patch adds a separate Absorption Candidates panel to the existing Footprint component.
It requests `/api/orderflow/absorption?instrument=GC|SI` based on the selected asset and refreshes once per minute.

The existing candle-derived footprint cells are not relabelled or mixed with stored trade-print candidates. This distinction is intentional: the footprint shown by this component is estimated from candles, while the absorption API uses stored trade prints.

Merge the two files into the project, preserving all other files. Run `npm run build`.
