# ADR-0017: 18% GST added on top of subscription pricing

- **Status:** Accepted
- **Date:** 2026-05-22
- **Decider:** subhransu
- **Affects:** Razorpay plan configuration, pricing page, invoices, billing UI

## Context

SaaS subscriptions in India attract 18% GST. PRD §12.2 Q2 asked whether to advertise prices as inclusive or exclusive of GST. Both are legal; the difference is mostly customer optics and B2B/B2C expectations.

- **Inclusive:** "₹1,000/mo" → customer pays ₹1,000 → ShelfCure earns ~₹847, remits ₹153 GST. Friendly for B2C.
- **Exclusive:** "₹1,000/mo + 18% GST" → customer pays ₹1,180 → ShelfCure earns ₹1,000, remits ₹180 GST. Standard for B2B; customer can claim ITC.

ShelfCure Cloud customers are GST-registered pharmacies (B2B). They expect exclusive pricing and ITC.

## Decision

Prices on the website and in-app are **exclusive of GST**. 18% GST is added at checkout and shown as a separate line on every invoice.

- Razorpay plans configured with the base price; tax handled at invoice generation.
- Invoice has explicit lines: subscription fee, 18% GST (CGST 9% + SGST 9% for same-state, IGST 18% for inter-state).
- ShelfCure's own GSTIN printed on every invoice.
- Customer can provide their GSTIN at signup or in Settings → Billing; if present, it's printed on the invoice so they can claim ITC.
- Pricing page clearly states "+ 18% GST" next to each plan.

## Consequences

**Positive**
- Matches B2B convention; customers expect this.
- Customers can claim Input Tax Credit (ITC) on the GST paid.
- Invoice compliance straightforward (one tax line).
- ShelfCure's revenue numbers (ex-GST) are clean for internal reporting.

**Negative**
- Sticker shock for non-GST-savvy customers (rare in this segment).
- Pricing page must visually balance "₹1,000" with "+ 18% GST" without burying it.

**Neutral**
- Customer-state-based CGST/SGST vs IGST routing handled by Razorpay + ShelfCure's tax engine.

## Alternatives considered

- **Inclusive pricing** — rejected; B2B norm is exclusive; customers expect ITC line.
- **Inclusive on website, exclusive on invoice** — rejected; confusing and creates support tickets.
- **Per-tier different (Solo inclusive, Team/Chain exclusive)** — rejected; complexity outweighs benefit.

## Revisit when

- A material share of customers are unregistered (no GSTIN) → consider inclusive option.
- GST rate changes (currently 18%) → update plan configuration.
- ShelfCure crosses ₹20 lakh / ₹40 lakh GST registration thresholds (already past; mandatory now).
