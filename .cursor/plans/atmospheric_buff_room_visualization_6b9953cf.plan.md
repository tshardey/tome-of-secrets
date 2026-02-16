---
name: Atmospheric Buff Room Visualization
overview: Add an isometric sticker-room visualization to the Environment tab that composites per-buff sticker overlays onto a base room image when atmospheric buffs are active. The architecture is data-driven and extensible to support future room themes, magical item stickers, and familiar stickers.
todos:
  - id: room-themes-json
    content: Create assets/data/roomThemes.json with cozy-modern theme, base image path, and per-sticker placement config (positions will need iteration)
    status: pending
  - id: update-atmo-buffs-json
    content: Add stickerSlug field to each entry in assets/data/atmosphericBuffs.json
    status: pending
  - id: generate-data
    content: Run node scripts/generate-data.js and update data.js exports for roomThemes
    status: pending
  - id: room-viz-service
    content: Create assets/js/services/RoomVisualizationService.js with getActiveStickers() and getStickerForBuff()
    status: pending
  - id: room-viz-component
    content: Create assets/js/components/RoomVisualization.js -- pure DOM renderer with render() and toggleSticker() methods
    status: pending
  - id: update-character-sheet-html
    content: Add room visualization container div to character-sheet.md above the atmospheric buffs table
    status: pending
  - id: update-buff-controller
    content: Wire BuffController.js to update room visualization on buff toggle and initial load
    status: pending
  - id: update-main-init
    content: Update character-sheet.js to pass RoomVisualization as dependency to BuffController
    status: pending
  - id: add-css
    content: Add room visualization CSS to character-sheet.css (responsive container, sticker positioning, transitions)
    status: pending
  - id: add-tests
    content: Add tests for RoomVisualizationService and buff-to-sticker mapping
    status: pending
  - id: visual-iteration
    content: Iterate on sticker positions/scales in roomThemes.json using the live site with CDN images
    status: pending
isProject: false
---

# Atmospheric Buff Room Visualization

## Approach: Fine-Tuned Placement (not drag-and-drop)

Each sticker has a designated physical slot in the room (fireplace, dresser, reading nook, etc.), so **predefined position/scale per sticker** is the right fit. This avoids the complexity of persisting drag positions, produces a polished result, and matches the semantic intent of the stickers. Positions are defined as percentage-based CSS values in a JSON config, making iteration straightforward -- just tweak the numbers.

## Architecture Overview

```mermaid
graph TD
    subgraph dataLayer [Data Layer]
        RoomThemesJSON["roomThemes.json<br/>Room configs + sticker placements"]
        AtmoBuffsJSON["atmosphericBuffs.json<br/>+ stickerSlug field"]
    end

    subgraph serviceLayer [Service Layer]
        RoomVizService["RoomVisualizationService.js<br/>Which stickers to show"]
    end

    subgraph uiLayer [UI Layer]
        RoomVizComponent["RoomVisualization.js<br/>Pure DOM renderer"]
        BuffController["BuffController.js<br/>Toggle handler"]
    end

    subgraph htmlCSS [HTML/CSS]
        CharSheet["character-sheet.md<br/>Room container div"]
        CSS["character-sheet.css<br/>Room + sticker styles"]
    end

    RoomThemesJSON --> RoomVizService
    AtmoBuffsJSON --> RoomVizService
    RoomVizService --> RoomVizComponent
    BuffController --> RoomVizComponent
    RoomVizComponent --> CharSheet
    CSS --> CharSheet
```



## Key Design Decisions

- **Percentage-based positioning**: All sticker positions use `top`, `left`, `width` as percentages of the room container, making the visualization responsive.
- **Data-driven themes**: Room themes are defined in JSON. Adding a sci-fi or fantasy room later means adding a new entry to `roomThemes.json` plus uploading new base/sticker images.
- **Sticker categories**: The `roomThemes.json` schema supports multiple sticker categories (`atmospheric`, `item`, `familiar`) so magical items and familiars can be added later without restructuring.
- **CDN-compatible**: Images use the existing `toCdnImageUrlIfConfigured()` utility via the `assets/images/` prefix convention, so they work with the Supabase CDN bucket.
- **Buff-to-sticker decoupling**: Each buff gets a `stickerSlug` in `atmosphericBuffs.json` that maps to a sticker entry in the room theme. Different room themes can have different sticker art for the same buff.

## File Changes

### 1. New: `assets/data/roomThemes.json`

Defines room themes. Initial theme: `cozy-modern`. Each theme has a base image and a map of sticker slots with placement data.

```json
{
  "cozy-modern": {
    "id": "cozy-modern",
    "name": "Cozy Modern Library",
    "baseImage": "assets/images/atmospheric-buffs/cozy-modern-stickers/cozy-modern-plain-base.png",
    "aspectRatio": "16/10",
    "stickers": {
      "candlelight-study": {
        "image": "assets/images/atmospheric-buffs/cozy-modern-stickers/candlelight-study.png",
        "category": "atmospheric",
        "top": "10%", "left": "5%", "width": "30%", "zIndex": 2
      },
      "herbalists-nook": { "..." : "..." },
      "soundscape-spire": { "..." : "..." },
      "the-excavation": { "..." : "..." },
      "cozy-hearth": { "..." : "..." },
      "soaking-in-nature": { "..." : "..." },
      "wanderers-path": { "..." : "..." },
      "head-in-the-clouds": { "..." : "..." }
    }
  }
}
```

Positions will need iteration once we see the actual images composited. Initial values will be rough estimates based on the sticker descriptions (fireplace center, dresser left side, etc.).

### 2. Update: `[assets/data/atmosphericBuffs.json](assets/data/atmosphericBuffs.json)`

Add `stickerSlug` to each buff, mapping buff identity to the sticker key in `roomThemes.json`. This handles the ID mismatch (e.g., `the-candlight-study` vs sticker `candlelight-study`):

```json
{
  "The Candlight Study": {
    "id": "the-candlight-study",
    "name": "The Candlight Study",
    "stickerSlug": "candlelight-study",
    "description": "..."
  }
}
```

### 3. Run `node scripts/generate-data.js`

Regenerate exports after JSON changes.

### 4. Update: `[assets/js/character-sheet/data.js](assets/js/character-sheet/data.js)`

Add exports for `roomThemes` data and a helper like `getRoomTheme(themeId)`.

### 5. New: `assets/js/services/RoomVisualizationService.js`

Pure business logic:

- `getActiveStickers(characterState, themeId)` -- returns list of sticker configs for currently active atmospheric buffs
- `getStickerForBuff(buffName, themeId)` -- maps a buff name to its sticker config via `stickerSlug` lookup
- Future: `getItemStickers(characterState, themeId)` for magical items/familiars

### 6. New: `assets/js/components/RoomVisualization.js`

Pure DOM renderer (follows the project's renderer pattern). Responsibilities:

- Renders a container with the base room image as background
- Creates/shows/hides sticker `<img>` elements based on active buffs
- `render(containerEl, theme, activeStickers)` -- full render
- `toggleSticker(stickerSlug, isActive)` -- show/hide individual sticker with CSS transition (fade in/out)
- Uses `toCdnImageUrlIfConfigured()` from `[assets/js/utils/imageCdn.js](assets/js/utils/imageCdn.js)` for all image URLs

HTML structure produced:

```html
<div class="room-visualization" style="position: relative; aspect-ratio: 16/10;">
  <img class="room-base" src="...base.png" />
  <img class="room-sticker" data-sticker="candlelight-study"
       style="position: absolute; top: 10%; left: 5%; width: 30%; opacity: 1;"
       src="...candlelight-study.png" />
  <!-- more stickers, hidden ones have opacity: 0 -->
</div>
```

### 7. Update: `[character-sheet.md](character-sheet.md)` (lines ~388-412)

Add a room visualization container **above** the existing atmospheric buffs table, inside the `.rpg-atmospheric-buffs-panel`:

```html
<div id="room-visualization-container" class="room-visualization-wrapper">
  <!-- Rendered by RoomVisualization.js -->
</div>
```

The atmospheric buffs table is **kept** below for tracking Days Used and Monthly Total, but the Active checkbox column will now also trigger sticker visibility in the room.

### 8. Update: `[assets/js/controllers/BuffController.js](assets/js/controllers/BuffController.js)`

Wire `handleAtmosphericBuffToggle()` to also call `RoomVisualization.toggleSticker()`. During `initialize()`, create the room visualization using the current active buff state. Listen for `ATMOSPHERIC_BUFFS_CHANGED` events to keep the room in sync.

### 9. Update: `[assets/js/character-sheet.js](assets/js/character-sheet.js)`

Pass the `RoomVisualization` component as a dependency to `BuffController`, and trigger initial render after state is loaded.

### 10. New CSS in `[assets/css/character-sheet.css](assets/css/character-sheet.css)`

```css
.room-visualization-wrapper { /* centering, max-width, margin */ }
.room-visualization { position: relative; overflow: hidden; border-radius: 12px; }
.room-base { width: 100%; display: block; }
.room-sticker {
  position: absolute;
  transition: opacity 0.4s ease;
  pointer-events: none;
}
.room-sticker.hidden { opacity: 0; }
```

### 11. Tests

Add tests in `tests/` for:

- `RoomVisualizationService` -- sticker resolution, active sticker calculation
- Buff-to-sticker slug mapping
- Edge cases: no active buffs, Grove Tender always-active buff

## Extensibility Points

- **New room themes**: Add entry to `roomThemes.json`, upload base + sticker images to bucket. Could add a theme selector dropdown in the UI later.
- **Item/familiar stickers**: Add entries with `"category": "item"` or `"category": "familiar"` to the room theme's stickers map. The service layer filters by category. Items like the Garden Gnome would get a `stickerSlug` in `allItems.json`.
- **User theme selection**: Store selected theme ID in character state via `StateAdapter`. Default to `cozy-modern`.

## Buff ID to Sticker Slug Mapping

For reference, the explicit mappings needed:

- `the-candlight-study` -> `candlelight-study` (note the spelling difference in the buff ID)
- `the-herbalists-nook` -> `herbalists-nook`
- `the-soundscape-spire` -> `soundscape-spire`
- `the-excavation` -> `the-excavation`
- `the-cozy-hearth` -> `cozy-hearth`
- `the-soaking-in-nature` -> `soaking-in-nature`
- `the-wanderers-path` -> `wanderers-path`
- `head-in-the-clouds` -> `head-in-the-clouds`

