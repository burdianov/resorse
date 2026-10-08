# DECISION REGISTER — do not invent answers

Statuses: `CONFIRMED` = supplied requirements; `PROPOSED` = design recommendation; `OPEN` = must be answered before dependent implementation. Claude Code must never silently turn an OPEN item into a confirmed rule.

| ID | Status | Topic | Current position / question | Blocking tasks |
|---|---|---|---|---|
| C01 | CONFIRMED | Single entity/currency | One company; AED only. | — |
| C02 | CONFIRMED | Standard hours | 26 working days × 8 hours = 208 hours/full month. | — |
| C03 | CONFIRMED | Rates | Effective-dated designation rate; effective-dated employee rate overrides. | — |
| C04 | CONFIRMED | Forecast revision | Initial save revision 0; explicit checkbox creates next revision. | — |
| C05 | CONFIRMED | Actual cost | Based on actual dated assignments, not forecast %; project-month aggregate. | — |
| C06 | CONFIRMED | Continuing assignment | Continues charging assigned project 100% until transfer/reallocation; missing end date alert. | — |
| C07 | CONFIRMED | Transfer approval | Current actual source project's responsible person approves. | — |
| C08 | CONFIRMED | Paid leave first month | Cost stays with current assignment(s), split by their allocation. | — |
| C09 | CONFIRMED | Project dates | Contractual and forecast completion dates are separate. | — |
| C10 | CONFIRMED | Authentication | Admin-provisioned accounts, forced initial/reset password change, multiple roles. | — |
| C11 | CONFIRMED | Frontend package manager | **pnpm**, overriding `BIG-PROMPT.txt` §2.1/§2.3 ("npm … not pnpm"). Operator decision 2026-10-08. Lockfile is `pnpm-lock.yaml`; all CI and operator commands use pnpm. Backend stays `uv`. | F006, F055, F061 |
| O01 | OPEN | Working day calendar | For partial months, count Mon–Sat excluding Sundays, or a company calendar including UAE holidays? How cap 27-day months at 26? | D022, D023, D047 |
| O02 | OPEN | Rate changes within month | Split 208-hour equivalent by daily effective rates, or select rate as of first/last day? | D014, D025, D051 |
| O03 | OPEN | Percentage rules | Allowed range 0–100 per position-month? Can a forecast row exceed 100 to represent overtime, or must multiple positions be used? | D023, D026 |
| O04 | OPEN | Revision semantics | Does saving without `Create new Revision` overwrite revision 0/latest, or save an editable draft separate from published immutable revisions? Recommended: mutable draft + immutable published revisions. | D029–D032 |
| O05 | OPEN | Rate history vs revision | Do old forecast revisions retain the original calculated cost/rate snapshot, even after rate master updates? Recommended: yes. | D025, D031 |
| O06 | OPEN | Shared actual assignment | Approve effective-dated shares across projects/Head Office totaling 100% daily? Define partial capacity/gaps. | D043–D049 |
| O07 | OPEN | Missing end date | Since every assignment requires end date, should system store a provisional planning end date plus missing-confirmed-end flag, or allow a nullable end with an enforced alert? Recommended: provisional date + `end_date_confirmed=false`, never pretend it is confirmed. | D039, D040 |
| O08 | OPEN | Paid leave after month one | Charge Head Office, existing projects, or another cost centre? How treat unpaid leave? | D056, D057 |
| O09 | OPEN | Forecast vs transfer | Should transfers modify future forecasts automatically? Recommended: **no**, show discrepancy and explicit reconciliation. | D060, D061 |
| O10 | OPEN | Reporting month cutoff | Include current incomplete month as actual-to-date or forecast until close? Recommended: closed months actual, open month configurable actual-to-date + remainder forecast. | D066, D067 |
| O11 | OPEN | Tender demand probability | Treat tenders as 100% demand or apply optional probability/scenario weighting? Recommended: separate unweighted and weighted views. | D074, D075 |
| O12 | OPEN | Assignment day boundary | Date ranges inclusive on both ends; transfer starts next day after source ends, unless shares. Confirm. | D037, D042 |
| O13 | OPEN | Shift economics | Day/night is information only, or night premium/shift-dependent rate? Default: informational only until approved. | D058 |
| O14 | OPEN | Employee status events | Precise approval authority and effects for termination/resignation/secondment. | D059 |
| O15 | OPEN | Project award | Copy tender rows into initial awarded draft or start from blank? Recommended: offer explicit conversion with review. | D033, D034 |
| O16 | OPEN | Rate confidentiality | Which roles can view designation and employee-specific rates, cost breakdowns and executive PDFs? | D012, D086 |
| O17 | OPEN | Forecast time horizon | How many extra months beyond latest planned position by default? Recommended: 6, configurable. | D020 |
| O18 | OPEN | Actual cost precision | Rounding (recommended Decimal 2 AED at project-month total, not per daily slice); retroactive recalculation approval. | D051, D053 |

Operator: mark a decision CONFIRMED with its exact chosen rule before instructing Claude Code to implement a blocked task. Unblocked tasks can proceed while questions are open.
