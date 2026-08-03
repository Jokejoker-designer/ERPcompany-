# 5 giai đoạn — POS → ERP thu nhỏ

## Giai đoạn 1 — Master Data Management

- Hierarchical taxonomy (FMCG, DRY, COLD, FRESH, HPC) + rule kế thừa (cold-chain, HSD).
- UOM conversion: Purchasing UOM → Base UOM → Sales UOM.
- Barcode EAN/UPC + dynamic weighted barcode (cân ký).
- Vendor master, Customer CRM (bronze/silver/gold), RBAC.

## Giai đoạn 2 — Inbound Logistics

- PO → GRN scan/receive.
- Three-way matching (PO vs received qty flagged).
- Lot / expiry mandatory when trackLot.
- Moving Average Price (MAP) on commit.
- QC gate before stock increase.

## Giai đoạn 3 — POS Output

- Barcode scan + promo rules (bundle, time window, tier).
- CRM lookup, points, cross-sell hints.
- Multi-pay: cash (change + denom hints), QR webhook demo, card.
- Realtime stock deduct + FEFO lot consume.

## Giai đoạn 4 — Inventory Audit

- Cycle counting by ABC slice.
- Variance = physical − system; reason codes 01–05.
- Manager approve before stock rewrite.
- Near-expiry list (FEFO) → markdown / RTV actions.

## Giai đoạn 5 — BI & EOD

- Z-read blind close: counted cash vs system cash.
- Gross margin from MAP COGS.
- ABC portfolio + inventory turnover.
- Sales ledger for audit trail.
