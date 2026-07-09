---
name: SC PTZ Control
description: Desktop tool for controlling PTZ cameras on Intelbras DVR/NVR devices
colors:
  primary: "#1971c2"
  neutral-bg: "#25262b"
  neutral-surface: "#2c2e33"
  neutral-surface-elevated: "#373a40"
  ink: "#c1c2c5"
  ink-dimmed: "#909296"
  danger: "#fa5252"
  success: "#40c057"
  caution: "#f59f00"
  light-bg: "#f8f9fa"
  light-surface: "#f1f3f5"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "clamp(1.5rem, 2.5vw, 1.75rem)"
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.5px"
rounded:
  xs: "2px"
  sm: "4px"
  md: "8px"
  lg: "12px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  card-default:
    backgroundColor: "{colors.neutral-surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
  card-hover:
    backgroundColor: "{colors.neutral-surface-elevated}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "10px 20px"
  button-light:
    backgroundColor: "transparent"
    textColor: "{colors.primary}"
    rounded: "{rounded.sm}"
    padding: "10px 20px"
---

# Design System: SC PTZ Control

## 1. Overview

**Creative North Star: "The Control Room"**

SC PTZ Control is a professional desktop tool for a sign language congregation's AV team — a control room in software. The interface is intentionally unglamorous: dark, dense, and information-rich because that's what operators need during live meetings. Every pixel serves the operational goal of getting the camera to the right position with confidence.

The system uses **Mantine's default dark theme** as its foundation — a proven, accessible starting point that avoids the brittleness of hand-rolled tokens for a solo-maintained project. Custom CSS modules add operational affordances (hover-reveal action panels on preset cards, drag-and-drop seat mapping, capture progress feedback) on top of that base.

**Key Characteristics:**
- Dark-by-default for low-light meeting hall comfort; light mode available as an alternative
- Information-dense but not cluttered — the grid of preset cards, the seat map, and progress feedback each claim their own clear visual zone
- Interactions are explicit: hover reveals actions, click moves the camera, drag assigns a seat
- Motion is functional — hover transitions, progress animations, and the capture pulse are feedback, not decoration
- The interface explicitly rejects decorative flourishes: no glassmorphism, no gradient text, no wide shadowed cards

## 2. Colors

The palette is **Mantine's default dark theme**: cool-tinted neutrals with Signal Blue as the interactive accent. Dark surfaces use the Mantine `dark-*` scale (`dark-8` for background, `dark-7` for surfaces, `dark-6` for elevated surfaces). Light mode swaps to the `gray-*` scale with the same Signal Blue accent.

### Primary
- **Signal Blue** (`#1971c2` / var(--mantine-color-blue-7)): The single interactive accent — buttons, occupied seat indicators, preset badges, and the capture-progress highlight. Used sparingly for maximum signal.

### Neutral
- **Control Room Dark** (`#25262b` / var(--mantine-color-dark-8)): Main body background. Deep but not pure black — it has subtle warmth for comfort under ambient meeting hall light.
- **Surface Dark** (`#2c2e33` / var(--mantine-color-dark-7)): Default card and surface background. Sits one step above the body.
- **Surface Elevated** (`#373a40` / var(--mantine-color-dark-6)): Hover or active surface state.
- **Ink** (`#c1c2c5` / var(--mantine-color-dark-0)): Primary text color on dark surfaces.
- **Ink Dimmed** (`#909296` / var(--mantine-color-dimmed)): Secondary text, labels, placeholders, and metadata.

### Semantic
- **Danger** (`#fa5252` / red-5): Destructive actions — delete image, stop capture, error states.
- **Success** (`#40c057` / green-5): Affirmations — auto-capture complete, save confirmation.
- **Caution** (`#f59f00` / yellow-5): Save/set actions — secondary attention without alarm.

### Light Mode
- **Light Background** (`#f8f9fa` / gray-0) and **Light Surface** (`#f1f3f5` / gray-1) replace the dark surfaces. Borders shift from `dark-4` to `gray-3`. Text shifts to dark-9 (`#25262b`). The Signal Blue accent remains unchanged.

## 3. Typography

**Body Font:** System font stack (`-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif`)

No custom fonts — the system stack renders instantly with no network cost, which matters for an Electron app. The existing Mantine default scale is clean and legible.

**Character:** Direct and unadorned. No decorative type, no wide tracking for display purposes. Hierarchy is achieved through weight (700 for badges and labels, 600 for column headers, 400 for body) and size, not font swaps.

### Hierarchy
- **Display** (700, `clamp(1.5rem, 2.5vw, 1.75rem)`, 1.3): Section titles like "Configurações" on the settings page. `text-wrap: balance` applied.
- **Title** (600, `1rem` / `16px`, 1.4): Card group labels and navigation link text.
- **Body** (400, `14px`, 1.55): Main content text. Caps at ~65ch on wider containers.
- **Label** (600, `12px`, 1.4, 0.5px tracking, uppercase): Badge numbers, seat group labels, column indicators, form descriptions. Minimal size for metadata.
- **Mini** (500, `8–10px`, 1.2): Row numbers on seat columns (`8px`), preset badges (`10px`) — the smallest legible size for the densest information layer.

### Named Rules
**The System Stack Rule.** No custom fonts. The system font stack loads instantly in an Electron context, avoids bundle bloat, and keeps the interface feeling like a tool, not a website.

## 4. Elevation

The system is **flat by default**. Depth is conveyed through tonal layering (surface colors stepping away from the background) rather than drop shadows.

### Surface hierarchy
- **Body level** (`dark-8`): The background. Recedes.
- **Surface level** (`dark-7`): Cards, sidebars, form sections, preset items. Sits one step above the body.
- **Elevated level** (`dark-6`): Image thumbnails, draggable item backgrounds, hover-state surfaces. Sits above surfaces.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest. Shadows appear only on hover as an interactive cue (the preset card lifts `translateY(-2px)` with `shadow-md`), never as a decorative element. The lone exception is the switch thumb's tiny `0 2px 4px rgba(0,0,0,0.2)` drop shadow — a mechanical necessity for a physical knob, not a design choice.

## 5. Components

### Preset Cards
The core interaction surface — a grid of camera preset thumbnails.

- **Shape:** Mantine Card with `border-radius: md` (8px), `withBorder` for a subtle outline.
- **Layout:** Image area (16:9 aspect ratio) with a floating preset number badge (circular, `24px`, white bg, centered, font-weight 700).
- **States:** Hover lifts the card 2px and applies a medium shadow (`shadow-md`). Action buttons (play, save, delete) fade in from the bottom via a gradient overlay. The card itself is clickable (goto preset).
- **Capturing:** A pulsing blue outline (`blue-5`, 1.2s pulse) indicates the preset being actively captured.
- **Empty state:** A centered camera-off icon with "Sem imagem" text in the dimmed color.

### Buttons
Mantine default button styles with consistent semantic color mapping.

- **Primary actions:** Solid Signal Blue with white text (`variant="filled"` color="blue"). Used for navigation and primary operations.
- **Light actions:** Transparent background with Signal Blue text and a subtle hover tint (`variant="light"`). Used for "Capturar todos", auto-capture stop.
- **Destructive actions:** Light red (`variant="light"` color="red"). Used for "Limpar", delete, and stop. Modal confirmation on destructive operations.
- **Caution actions:** Light yellow (`variant="light"` color="yellow"). Used for "Desfazer" (undo).
- **Default/secondary:** Mantine's default variant with subtle border and hover lift.

### App Navigation (Shell)
- **Header:** `60px` tall, contains the app title (order-3, "SC PTZ Control") on the left and theme switch + GitHub link on the right.
- **Side navbar:** `30px` narrow rail with icon-only navigation links (3 items: Presets, Hall Map, Settings). Tooltip reveals label on hover. Active state uses `variant="filled"`. ScrollArea for overflow.

### Seat Cells
- **Shape:** `70px` height, 14:9 aspect ratio, `border-radius: xs` (2px). Compact.
- **Unassigned:** Dashed border (`dark-4` / `gray-4` in light), dark-7 background. Hover: scale(1.05).
- **Assigned:** Solid border (Signal Blue), dark-6 background, thumbnail image fills the cell. Blue badge with preset number.
- **Drag-over:** Green border (`green-5`) with translucent green background as drop target feedback.
- **Remove button:** Appears on hover (opacity transition), positioned top-right.

### Preset Drag List
- **Container:** Full-height sidebar with right border (`dark-4` / `gray-3`), dark-8 background.
- **Items:** Preset number + thumbnail thumbnail + assigned badge. Grab cursor, active grabbing. Assigned items reduce opacity to 0.5. Hover highlights with dark-5 background.

### Form Inputs
Mantine default text inputs, password inputs, and sliders:
- **Text/Password inputs:** Default Mantine style with `leftSection` icon support. Clear error state with red border and error message.
- **Slider:** Mantine default with value labels.
- **Layout:** Cards containing form sections, `SimpleGrid` for responsive field layout.

## 6. Do's and Don'ts

### Do:
- **Do** use **Signal Blue** as the single interactive accent. It signals: "this is actionable."
- **Do** keep surfaces flat. Use tonal layering (dark-7 on dark-8) instead of drop shadows for depth.
- **Do** show actions on hover (preset card overlay, seat remove button). Keeps the default state clean but power is a hover away.
- **Do** use the dimmed color for metadata, labels, and placeholders. Body content gets full ink.
- **Do** confirm destructive actions with a modal ("Tem certeza que deseja remover todas as imagens salvas?"). One click is too fast for an undo.

### Don't:
- **Don't** use decorative shadows, gradient text, glassmorphism, or stripe backgrounds. The interface is a tool, not a showpiece.
- **Don't** stack cards inside cards. The preset card grid, hall map, and settings cards are peers.
- **Don't** add side-stripe borders (border-left >1px as accent). Use full borders or background tints instead.
- **Don't** use numbered section markers (01/02/03). The settings page and hall map don't need section numbers.
- **Don't** use skeleton/loading placeholders — presets load synchronously from localStorage and device config is immediate. Progress is shown only for the actual async operation (auto-capture).
- **Don't** animate layout properties. Hover transitions animate `transform`, `box-shadow`, and `opacity` — never `width`, `height`, or `top`/`left`.
- **Don't** add tiny uppercase tracked eyebrows above every section. One kicker used sparingly is voice; every section is AI grammar.
