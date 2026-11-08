# Trading history pagination and date range

- History supports selectable windows of 1, 7, 30, 90, 180, or 365 days.
- The selected window is passed to the broker API on both Exness and cTrader routes.
- The History table displays 10 records per page with Previous/Next navigation.
- Changing the date range reloads the selected broker history and returns to page 1.
- Pagination is client-side over the records returned by the broker. If the broker endpoint caps the returned records, widen/narrow the date range to retrieve a different window.

Build verification was not run because dependencies are not installed in this environment.
