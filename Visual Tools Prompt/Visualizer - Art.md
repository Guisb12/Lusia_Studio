# Visualizer read_me — Art module (unique content only)

NOTE: The art module returns the Core Design System + the full SVG setup section
(identical to what's in the diagram module part 1). The Color Palette section is
also identical. The ONLY unique content is the "Art and illustration" section below.

---

## Art and illustration
*"Draw me a sunset" / "Create a geometric pattern"*

Use `imagine_svg`. Same technical rules (viewBox, safe area) but the aesthetic is different:
- Fill the canvas — art should feel rich, not sparse
- Bold colors: mix `--color-text-*` categories for variety (info blue, success green, warning amber)
- Art is the one place custom `<style>` color blocks are fine — freestyle colors, `prefers-color-scheme` for dark mode variants if you want them
- Layer overlapping opaque shapes for depth
- Organic forms with `<path>` curves, `<ellipse>`, `<circle>`
- Texture via repetition (parallel lines, dots, hatching) not raster effects
- Geometric patterns with `<g transform="rotate()">` for radial symmetry