# Tina Admin — Component Style Guide

## Purpose and reference fidelity

Use this guide to build and extend Tina Admin in Cursor. The two supplied dashboard and chat screenshots are the visual references. Their visible labels and chat messages are sample content, not functional requirements or instructions.

The design is a calm school administration workspace: white rounded panels, a pale cool-gray canvas, near-black active navigation, dark text, thin outline icons, and bright lime accents. Preserve the spacious, restrained appearance across new screens.

All colors, measurements, and font choices below are implementation estimates from raster screenshots, not original source tokens. Use these as a consistent baseline; compare rendered screens with the references before finalizing. The screenshots show desktop layouts only; responsive behavior and interaction states below are proposed extensions.

## 1. Design tokens

Import `tokens.css` globally. Components must reference semantic tokens instead of duplicating hex values.

| Role | Value | Usage |
|---|---|---|
| Outside backdrop | `#CDD0D4` | Surrounding canvas when using an inset application frame |
| Workspace | `#F4F5F9` | Main application background, panel gutters |
| Surface | `#FFFFFF` | Cards, sidebar, conversation pane |
| Subtle surface | `#F3F4F8` | Search fields, selected conversation, incoming bubbles |
| Primary text | `#0B0D15` | Headings, values, message text |
| Secondary text | `#565C73` | Navigation, labels, descriptions |
| Muted text | `#7B839F` | Metadata and timestamps; verify contrast at small sizes |
| Border | `#E9ECF3` | Dividers, neutral controls |
| Active surface | `#090D15` | Selected navigation, selected filter |
| Lime | `#B6F34D` | Send button, unread counters, brand accents |
| Lime ink | `#182508` | Text on lime fills |
| Soft lime | `#EFFAE7` | Knowledge action row, assistant messages |
| Success | `#00852D` | Positive deltas and delivery marks |
| Chart green | `#2B725B` | Answered question series |
| Blue | `#6096F8` | General Information category |
| Purple | `#9170FF` | Admissions category |
| Amber | `#FFC75E` | Academics category |
| Pale yellow | `#FFECAF` | Health & Wellbeing category |
| Neutral chart | `#C9CED8` | Unanswered/other series |
| Danger | `#D71938` | Unanswered status text |
| Danger surface | `#FFE9ED` | Unanswered badge |
| Warning | `#8B4B00` | Needs review status text |
| Warning surface | `#FFF0D2` | Needs review badge |

**Typography:** use `Inter` when available, with `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` as fallback. The exact screenshot font is unconfirmed. Use weights 400, 500, and 600; reserve 700 for prominent KPI values if needed.

| Style | Size / line height | Weight | Usage |
|---|---|---|---|
| Page title | 30 / 38px | 600 | Greeting, Chats |
| KPI value | 32 / 38px | 600 | 38, 27, 2.5 h, 78% |
| Card title | 18 / 24px | 600 | Questions over time, Needs attention |
| Brand / chat name | 20 / 28px | 600 | Tina Admin, open conversation header |
| Body | 15 / 22px | 400 | Navigation, ordinary content |
| Message | 16 / 24px | 400 | Chat bubbles |
| Row name | 14 / 20px | 600 | Conversation names |
| Metadata | 12 / 18px | 400 | Timestamps, chart labels, secondary text |
| Tiny badge | 11 / 16px | 500 | Status tags |

Spacing scale: **4, 8, 12, 16, 20, 24, 32, 40px**. Use 16px panel gaps and 20–24px internal card padding. Avoid overly compact layouts.

Radii: **8px** small controls, **12px** controls and filters, **16px** cards and bubbles, **24px** major panes, **999px** pills and avatars. Shadows are very subtle; separation comes primarily from surface colors and gutters.

## 2. Application layouts

### Shared shell

- Desktop sidebar: about **300px**, fixed within the layout. Main content consumes remaining width. Outer inset: **20–28px**; gutter: **12–16px**.
- Minimum comfortable full desktop width: approximately **1280px**. The supplied references are 1536 × 1024px; use that viewport for visual comparison.
- Sidebar is a white, 24px-radius vertical panel. Brand at top, school switcher below, primary navigation, CONTENT section, and account control pinned at bottom.
- Use semantic `<aside>`, `<nav>`, and `<main>` elements. Mark the current destination with `aria-current="page"`.
- Navigation rows are about **46–48px** tall, with 20–24px outline icons, a 16px icon-to-label gap, and optional trailing count.
- School switcher is a rounded subtle surface, about 56–68px tall. It contains the school icon, name, optional subtitle, and chevron.
- Account control contains a 48px avatar, name, role, and trailing menu. Keep it anchored using flex layout rather than absolute coordinates.

### Dashboard

- Main workspace is a pale panel with a 24px corner radius and 16–24px padding.
- Header pairs greeting and supporting sentence with a right-aligned date selector.
- KPI grid: four equal columns, 16px gap, cards about 140px tall.
- Chart row: about **60% / 40%** width, 16px gap; each chart panel about 275px tall.
- Bottom row: attention list, recent conversations, and a column containing top questions above Knowledge Hub. Suggested proportions **1.1 / 1.1 / 1**.
- Allow vertical scrolling when content exceeds the available viewport. Never shrink text or clip rows to force a screenshot-height fit.

### Chats

- Three columns: sidebar **300px**, conversation list approximately **470px**, thread flexible with a practical minimum of **480px**. At the reference width, the thread occupies about 640px.
- A pale rounded outer frame surrounds the white panes. Pane gap is 10–12px.
- Conversation pane: title, search/filter row, filter pills, date sections, and independently scrolling list.
- Thread pane: fixed header, independently scrolling messages, fixed composer. Use `min-height: 0` on flex children to allow correct scrolling.
- Header is about 80px tall with a lower divider. Composer region is about 90–104px tall.

### Responsive extension

These breakpoints are recommendations, not evidence from the screenshots.

- **≥1280px:** full sidebar and desktop grids.
- **1024–1279px:** sidebar becomes a 76px icon rail; dashboard KPIs use two columns; chat list narrows to about 340px.
- **768–1023px:** navigation moves to a drawer; dashboard chart and list rows stack; chats show a list or an open thread with a back control.
- **<768px:** single-column cards, 16px page padding, full-width conversation/thread views; composer remains usable above the on-screen keyboard.
- Keep controls reachable with at least 44px touch targets, including icon buttons whose visible glyphs are smaller.

## 3. Component specifications

### Navigation item

Variants: default, active, disabled. Default uses secondary text and no fill. Active uses a near-black pill, white text, and optionally a lime icon or counter. Hover uses a subtle neutral fill. Disabled styling must remain legible and prevent interaction. Put count at far right; do not use it as the sole indicator of unread state.

### Buttons and icon buttons

- `primary`: lime surface, dark lime ink. Main reference usage is the circular chat send action.
- `secondary`: subtle gray surface, primary text. Example: View profile.
- `ghost`: transparent, secondary text. Example: View all.
- `active`: near-black background with white text. Example: All filter.
- Standard control height: 40–44px. Horizontal padding: 14–16px. Use 8px icon/text spacing.
- Send button: 56–60px circular lime surface, 24px dark send icon. Disable when trimmed message is empty and no attachment is queued.
- Every icon-only control requires an accessible label. Add visible keyboard focus using the shared focus treatment.

### Search field and filter pills

Search height: 42–44px, subtle surface, 12–16px radius, leading 18–20px search icon. Placeholder: secondary text. A separate filter icon button sits alongside it.

Filter pills: 36–40px height, 12–16px radius, 12–16px horizontal padding. Neutral pills use subtle surfaces. Active pill uses near-black; its counter uses dark green with lime text. Example filters: All, Unread, Needs attention, Resolved. Wrap or horizontally scroll the row on narrow screens.

### Card

White surface, 16px radius, 20–24px padding, minimal or no shadow. Header uses an 18px semibold title and optional right-aligned link or legend. Dividers use 1px border color. Provide explicit loading, empty, and error content inside the same frame.

### Metric card

Horizontal layout with a **64px** rounded-square icon tile beside the content. Icon tile radius: 20px. Tile icon: 28–32px outline.

Content order: label with optional info button, value, then delta pill and short comparison label. Example themes: light green questions, light blue parents, light lavender time, light amber resolution. Use `#ECFBDD`, `#E7EFFF`, `#EEE8FF`, and `#FFF3DD` as starting tile colors. The info control opens a tooltip on focus and hover, with an accessible description.

Delta pill uses pale green, success text, and an upward arrow. Include a sign and comparison period in accessible text. A negative change is not automatically an error: determine whether an increase or decrease is favorable for each metric.

### Avatar

Sizes: **32px** compact lists, **40–48px** conversation rows, **48–52px** header/account. Circular photo or initials on cool neutral fill, dark text, medium weight. Initials are fallback content; do not fabricate user photos. Decorative avatars next to a visible name should have empty alternative text.

### Status and count badges

Unread count: lime pill/circle, dark text, minimum 24px height. Cap large visual counts as `99+`, with exact count in accessible text. Neutral navigation count uses pale gray.

Status pills: Unanswered = pale pink/red; Needs review = pale amber/brown; Follow up and Clarify = pale gray/secondary. Heights about 24–26px, padding 8–10px, tiny badge type. Add text labels so meaning does not rely on color. A red dot may supplement an attention status.

### Conversation row

Desktop chat list row height about **74–80px**, 12–16px padding, 16px gap between avatar and content. Main line has name and timestamp; secondary line has a one-line ellipsized preview and optional unread count. Selected row uses subtle gray and 16px rounded corners. Hover may use a slightly lighter neutral surface. Make the entire row a single keyboard-operable selection target; avoid nested buttons inside it.

Dashboard compact version uses about **58–68px** rows, smaller avatars, a divider, and optional trailing status/count. Keep timestamps muted and previews on a single line.

### Ranked question row

Number in a 22px neutral circle, question text, right-aligned count. Approximate row height 28–32px for desktop mouse use; increase to 44px when interactive on touch layouts. Dividers are light and do not cut through the number circle. Allow question text to wrap on small screens.

### Knowledge action row

Icon, label, optional count, and trailing chevron or plus. Primary Add new Q&A action uses a soft green filled row; secondary actions are transparent. Maintain 36–44px row height and 12–16px horizontal padding. Avoid duplicate focusable icons when the entire row is one action.

### Charts

**Questions over time:** stacked vertical bars. Answered = deep green; unanswered = neutral gray. Fine dotted horizontal gridlines, no heavy outer border. Labels use 12px secondary text. Compact legend sits in card header. Give bars consistent width and generous spacing.

**Questions by category:** donut with a center total and small caption. Use green, blue, purple, amber, pale yellow, and gray segments. Legend displays colored dot, category, count, and percentage in aligned columns.

Chart values in the source are illustrative and may not reconcile across labels. Build charts from one data model and derive totals and percentages; do not hard-code conflicting screenshot numbers. Include an accessible text summary or data table, and ensure tooltips work with keyboard focus. Use labels and values as well as colors.

### Thread header

48px avatar, name, and metadata such as grade/role/language. Right side contains View profile and overflow controls. Use 20–24px padding. On smaller widths collapse View profile to a labeled icon control. Do not show school-specific parent attributes for unrelated roles without data.

### Message bubbles

- Incoming: aligned left, neutral subtle surface, external parent avatar. Typical padding **12–16px**, radius **16px**.
- Assistant: aligned right, soft green surface, small external Tina brand mark. Typical padding **16px**, radius **16px**.
- Maximum bubble width: `min(80%, 420px)` on desktop; allow up to 88% on mobile. Use natural content height and wrap long words/URLs.
- Message text: 16px / 24px. Timestamp: 12px / 18px, below body. Assistant timestamp aligns right with delivery/read mark.
- Use about 20–24px between separate messages. Group consecutive messages from the same sender when useful, without losing sender or time context.
- Delivery icons should have accessible state text. Never indicate delivered/read until the underlying state confirms it.
- The visible green identifies Tina assistant responses. Additional human-agent or system-message variants must be designed explicitly and labeled by sender; do not assume all outgoing messages come from Tina.

### Document citation card

White inset card inside an assistant bubble, 12px radius, 12–16px padding. Circular document icon at left; document title above source/page metadata; chevron at right. Use a real link or button appropriate to the destination. Long titles may wrap to two lines. Show a citation only when supported by an actual retrieved source.

### Reply composer

Rounded bordered wrapper with an inner flexible text area, attachment control, emoji control, and separate lime send button. Starting height about **72–84px**; allow text area to grow up to about 160px before scrolling. Text input is 16px to avoid mobile zoom.

Placeholder from reference: “Type a reply (use / to search documents)”. Include that hint only if slash document search exists. Implement Enter to send / Shift+Enter for newline only if consistent with the app’s existing behavior; respect IME composition. Attachments need visible queued, uploading, failed, and remove states. On send failure retain the draft and offer retry.

## 4. Interaction and accessibility

- All controls need distinct default, hover, focus-visible, pressed/selected, and disabled states.
- Keyboard focus: 2px success-green outline with 3px offset; use a lime focus ring on dark surfaces. Never remove focus without a replacement.
- Target WCAG AA: 4.5:1 contrast for normal text and 3:1 for large text and meaningful control boundaries. Muted screenshot text is a visual reference; darken it when necessary for readable small text. Verify actual rendered foreground/background pairs.
- Use buttons for actions and links for navigation. Tooltips cannot be the only source of a control’s accessible name.
- Loading: preserve layout with calm neutral skeletons. Respect `prefers-reduced-motion` and avoid flashing/shimmer-heavy effects.
- Empty: a short explanation and one relevant action. Error: plain-language message and retry when applicable. Do not rely on toast-only reporting for persistent failures.
- Preserve independent scroll regions on desktop chats. Loading older messages must preserve scroll position; new messages should not pull the user away while reading earlier messages.
- Use polite live announcements for new messages where appropriate; avoid announcing an entire historical thread.

## 5. Implementation conventions

Use the project’s existing framework, styling system, and icon library. If starting a new React project, suggested names are:

`AppShell`, `Sidebar`, `SchoolSwitcher`, `NavItem`, `AccountMenu`, `PageHeader`, `Button`, `IconButton`, `SearchField`, `FilterPill`, `Card`, `MetricCard`, `Avatar`, `CountBadge`, `StatusBadge`, `ConversationRow`, `RankedQuestionRow`, `KnowledgeAction`, `QuestionHistoryChart`, `CategoryDonut`, `ThreadHeader`, `MessageBubble`, `DocumentCitation`, `ReplyComposer`.

Separate data from presentation. Use stable IDs, typed statuses, and explicit sender roles. Extract shared primitives before adding page-specific variants. Keep business rules out of CSS classes. Use CSS Grid for dashboard layouts and flex/grid for the chat panes; avoid absolute positioning for page structure.

Icons: thin rounded outline, approximately 1.7–2px stroke, consistent optical size. Reuse the existing icon set; a Lucide-like aesthetic matches the references. Do not substitute emojis for UI icons. The Tina brand is a dark rounded-square mark with four small green dots in a 2 × 2 arrangement; use an official supplied asset if available, otherwise mark an approximation as provisional.

Avoid unrelated gradients, strong card shadows, heavy outlines, square panels, oversized typography, fully saturated green surfaces, or excessive animations. Subtle neutral tonal variation in the references can be implemented with solid fills unless a close visual comparison requires otherwise.

## 6. Cursor handoff

1. Extract the ZIP into the project root. Keep this guide as design documentation.
2. The included `.cursor/rules/tina-admin.mdc` is scoped to UI source files. Adjust its globs to match the project. Merge with existing rules if a rule with that name exists.
3. Import `tokens.css` once through the existing global stylesheet or entry point. It contains tokens and optional base utility classes; opt into the classes where useful.
4. Attach both source screenshots to the Cursor chat for direct visual comparison. The ZIP intentionally contains guidance and CSS, rather than copied personal conversation data or photos.
5. Start with this prompt:

> Implement or update Tina Admin using STYLEGUIDE.md and tokens.css. Follow the attached dashboard and chat screenshots. First inspect the existing app and reuse its framework, routing, components, icon set, and data contracts. Build shared components for the sidebar, cards, badges, conversation rows, messages, document citations, and composer. Use the guide’s proposed responsive and accessible states. Keep illustrative data separate from production data. Verify both screens at 1536 × 1024 and at mobile widths, then report what changed and any unsupported functionality.

## 7. Acceptance checklist

- Sidebar, workspace gutters, rounded panels, and lime/near-black accents match the reference character.
- Dashboard has four metrics, stacked-bar history, category donut, attention list, recent conversations, top questions, and Knowledge Hub.
- Chats has search, status filters, selected conversation, thread header, incoming/assistant bubbles, citation card, and reply composer.
- Text and counts come from coherent data. Long names, large counts, long messages, and missing avatars do not break the layout.
- No clipped content, horizontal page overflow, or inaccessible composer at desktop and mobile sizes.
- Keyboard navigation, focus, control names, contrast, loading, empty, and error states are verified.
- Screen content does not imply live actions or data integrations that have not been implemented.
