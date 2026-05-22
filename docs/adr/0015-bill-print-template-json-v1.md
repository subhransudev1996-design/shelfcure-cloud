# ADR-0015: Bill print template = JSON config in v1, drag-drop in v2

- **Status:** Accepted
- **Date:** 2026-05-22
- **Decider:** subhransu
- **Affects:** Print module, Settings UI, `packages/core/billTemplate.ts`

## Context

Pharmacies want customized bill prints: logo, address position, GST breakdown style, footer messages, paper size (A4 / A5 / 80mm thermal). Building a drag-drop WYSIWYG editor is 3-4 weeks of work and an ongoing maintenance burden. A JSON schema config is hours, not weeks.

## Decision

v1 ships with **JSON-config templates** (3 starter presets included: A4 standard, A5 compact, 80mm thermal). The JSON schema is documented:

```ts
type BillTemplate = {
  paperSize: 'A4' | 'A5' | '80mm';
  margins: { top, right, bottom, left }; // mm
  header: { showLogo, logoUrl, showAddress, showGstin, showLicenseNo, customLine };
  table: { columns: Array<'sn'|'item'|'batch'|'expiry'|'qty'|'mrp'|'disc'|'rate'|'amt'>, fontSize };
  footer: { showQr, customMessage, showSignature };
  taxBreakdown: 'inline' | 'summary' | 'none';
  // ...
};
```

Settings UI provides a form (not drag-drop) for the common fields, plus an "advanced JSON" mode for power users. Preview pane renders the bill live as fields change.

v2 introduces a drag-drop editor (likely Q4 2027). Same JSON schema underneath — the editor just produces JSON. Templates created in v1 remain forward-compatible.

## Consequences

**Positive**
- Ships in days, not weeks.
- JSON schema is testable and versionable.
- Power users (chains with design teams) can author JSON directly.
- Forward-compatible with v2 drag-drop editor.

**Negative**
- Non-technical users limited to form fields + preset choices.
- Advanced layouts (e.g. side-by-side QR + summary) not possible in v1.

**Neutral**
- Print rendering uses `packages/ui/InvoicePreview` consuming the JSON.

## Alternatives considered

- **Drag-drop editor in v1** — rejected; 3-4 weeks of work for a non-core feature.
- **Hard-coded templates only** — rejected; pharmacies want their footer message and logo at minimum.
- **HTML templates with mustache-style placeholders** — rejected; gives users a footgun (broken HTML).

## Revisit when

- 5+ customers request layouts impossible in JSON form → prioritize drag-drop.
- Print bugs trace to template authoring → tighten schema validation.
