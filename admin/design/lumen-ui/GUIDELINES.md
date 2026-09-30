# Lumen UI

Lumen UI is a framework-neutral component library inspired by the visual and interaction direction of the supplied Orvia Mail pages. It is an independent interpretation: it does not copy Orvia's brand, product copy, artwork, application UI, source code, assets or services.

The reference research informed a system with large editorial headlines, near-white space, soft surface contrast, rounded navigation and controls, short supporting copy, and calm task-focused mail patterns. The iPhone reference informed the card stack and one-action-at-a-time mobile pattern. Source references: [Orvia Mail](https://orviamail.com/) and [Orvia Mail for iPhone](https://orviamail.com/iphone).

## Quick start

Open `index.html` directly in a browser. It requires no network connection, fonts or package installation. To use it in an application, copy this directory to `design/lumen-ui/`, import `styles.css` once, and apply `lumen-ui` to the shared wrapper or document body. Copy `.cursor/rules/lumen-ui.mdc` into the application's `.cursor/rules/` directory.

The gallery is plain HTML and CSS. Adapt the markup to the existing framework and shared components rather than adding a second UI framework. `gallery.js` only demonstrates local UI feedback; do not use it as application behavior.

## Design foundations

| Token | Light value | Dark value | Purpose |
|---|---:|---:|---|
| `--l-canvas` | `#FAFAFA` | `#0D0F0E` | Main page backdrop |
| `--l-surface` | `#FFFFFF` | `#151817` | Primary surface |
| `--l-raised` | `#FFFFFF` | `#202422` | Elevated or interactive surface |
| `--l-soft` | `#F0F0F0` | `#1D211F` | Secondary grouping |
| `--l-line` | `#DEDEDE` | `#303632` | Dividers and boundaries |
| `--l-ink` | `#161616` | `#F4F5F1` | Text and primary actions |
| `--l-muted` | `#707070` | `#A8AFA9` | Supporting text |
| `--l-accent` | `#FF7839` | `#FF8A4C` | New, urgent or message signal |
| `--l-accent-soft` | `#FFECDF` | `#3A2218` | Gentle accent surface |
| `--l-success` | `#2B7947` | `#76D09D` | Completed or healthy state |
| `--l-warning` | `#9A5B00` | `#F1C873` | Attention state |
| `--l-danger` | `#A03127` | `#FF9C92` | Error or blocked state |
| `--l-radius` | `28px` | `28px` | Feature cards |
| `--l-pill` | `999px` | `999px` | Buttons, chips and compact controls |

Use 8, 12, 16, 24, 28, 40, 72 and 112px spacing. Default card padding is 28px. Large marketing headings are 46–88px with tight tracking; working views should use 28–40px headings. Use system sans-serif fonts unless a licensed project font is already available.

## Components

| Component | Classes | Guidance |
|---|---|---|
| Navigation shell | `l-nav`, `l-logo`, `l-nav-links` | Compact, frosted shell for short navigation only |
| Button | `l-btn`, `secondary`, `outline` | One dark primary action per area; native buttons for actions |
| Chip | `l-chip`, `accent` | Small state, category or context labels |
| Feature card | `l-card`, `soft`, `outline` | One thought per card; avoid excessive nesting |
| Inbox row | `l-mail-row`, `l-avatar` | Sender, why it matters, and a context action |
| Context action | `l-action-card`, `l-action-icon` | Use when a message implies one strong next action |
| Phone card stack | `l-phone`, `l-swipe-card` | Illustrative/demo surface; preserve accessible list alternative in real use |
| Timeline | `l-timeline`, `l-step` | Explain a short sequence of three to five steps |
| Metric signal | `l-signal` | Compact factual context, not a dashboard KPI wall |
| Field | `l-field`, `l-input`, `l-error` | Label every field; bind errors using `aria-describedby` |

```html
<article class="l-action-card">
  <span class="l-action-icon" aria-hidden="true">⌘</span>
  <div>
    <strong>Copy verification code</strong>
    <p class="l-small l-muted">482 911 · expires in 8 minutes</p>
  </div>
  <button class="l-btn secondary" type="button">Copy</button>
</article>
```

## Interaction rules

Put the user’s next action close to the message that needs it. Do not reveal a toolbar full of unrelated actions. A message can show a single relevant button—copy a code, create an event, add a task, reply—or no extra action.

For mobile, prioritize one card or message at a time. Keep the screen’s active decision obvious. In desktop lists, preserve the same hierarchy with sender, content summary, state and action aligned in one row.

Use the accent for new state, an action requiring attention, or a time-sensitive context. It is not a general brand fill. Supporting details should remain quiet and readable.

## Light and dark themes

Set `data-theme="dark"` on the `.lumen-ui` wrapper. The same markup changes to layered charcoal surfaces, warm off-white text and a pale primary control. The gallery initially follows the operating-system preference and then remembers an explicit choice in local storage. When integrating, connect `data-theme` to the product's existing theme system instead of shipping a second source of truth.

Use `--l-canvas`, `--l-surface`, `--l-raised` and `--l-soft` to create depth. Do not brighten every border in dark mode; reserve clear boundaries for interactive controls and important groupings. Semantic colors have separate dark values and must always be paired with text or an icon.

Do not automatically invert photography or message images. Use correctly prepared dark assets where visual information matters. Verify contrast for any custom content added over surfaces.

## Accessibility and responsive behavior

Keep target sizes at least 44px. Use visible keyboard focus. Give buttons text labels or descriptive accessible names. Decorative marks and demo device shells need `aria-hidden`; real message data should remain in an accessible list or detail view. Never communicate status through accent color alone.

At 760px, grids stack, navigation links are hidden, feature cards use 22px padding and the phone-card visual moves below its supporting copy. Test actual product content at narrow and desktop widths; the example only demonstrates a layout pattern.

## Cursor prompt

Read `design/lumen-ui/GUIDELINES.md`, `styles.css`, and `index.html` before changing UI. Apply Lumen UI through existing project components. Use large editorial headings, near-white surfaces, compact black pill actions, small context labels and restrained orange signals. Preserve existing data, routing, permissions and event handlers. Put contextual actions next to the content they affect. Support the same markup in both themes with `data-theme="dark"`. Check keyboard behavior, responsive stacking, contrast and overflow in the rendered product before finishing.

## Files

- `index.html` — offline component gallery
- `styles.css` — scoped tokens and component styles
- `theme.css` — semantic theme tokens, dark-mode refinements and theme examples
- `gallery.js` — local demo interactions
- `.cursor/rules/lumen-ui.mdc` — Cursor rule
- `REFERENCES.md` — research notes and source links
