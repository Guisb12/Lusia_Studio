# Image Styles — Prompt Blocks

Each style defines the VISUAL LANGUAGE of the image. Combined with a type (diagram, place, person, moment, specimen), it produces the full generation prompt.

---

## illustration

Clean, modern, educational illustration. Think textbook quality but contemporary — not dated, not childish. Two-dimensional with confident flat shapes and soft, muted color palette. Limited to 3-4 colors maximum per image, all from the same tonal family. Bold outlines where needed, but not cartoonish. Shapes are simplified but accurate — enough detail to be scientifically or historically correct, simplified enough to be immediately readable.

This is the visual language of a well-designed educational resource. Professional, trustworthy, clear. The student looks at this and takes it seriously as a learning tool.

Background handling: solid flat background matching the slide background color (#FFFFFF). For persons, specimens, and diagrams, the background must be pure white with no gradients, no environmental elements, no decorative noise — the subject floats cleanly on the white surface. For places and moments, the background can contain environmental context but must fade to white at the edges so it blends with the slide.

---

## sketch

Hand-drawn, informal, approachable. Like a talented teacher drawing on a whiteboard or notebook — loose lines, slightly imperfect, warm and human. This style removes the intimidation from complex concepts. It says "this is just an idea, let's explore it together."

Lines are organic and slightly wobbly but deliberate — not sloppy, not random. Hatching and cross-hatching for shading instead of solid fills. Pencil or pen-like quality. Can include handwriting-style labels that feel authentic. Color is minimal — mostly monochrome or duotone with one accent color for emphasis.

This style works beautifully for diagrams that would feel too rigid as clean illustrations. A sketch diagram of a cell feels more inviting than a clinical one. An abstract concept like "custo de oportunidade" drawn as a fork in the road feels natural as a sketch.

Background handling: pure white background, as if drawn on white paper. No environmental elements. The sketch sits on the white canvas of the slide. Edges of the drawing naturally fade because sketch lines taper — no hard rectangular boundary needed.

---

## watercolor

Soft, atmospheric, emotional. Pigment bleeds and transparent washes create depth and mood. This style is about FEELING, not precision. It transports the student into a scene or creates an emotional connection to a subject.

Colors flow into each other with soft edges. Light comes through the pigment — the white of the paper shows through in highlights. Darker values are built through layered washes, not solid fills. The technique is loose but controlled — not a mess, but not tight either. There is a sense of air and space in the image.

This style is strongest for places, moments, and persons — situations where atmosphere matters more than technical accuracy. A watercolor of 19th century Lisboa creates a mood that a clean illustration cannot. A watercolor portrait of Fernando Pessoa captures melancholy in a way that flat shapes cannot.

Background handling: the watercolor naturally bleeds and fades at the edges into white. This is the organic behavior of the medium — use it. The image should NOT have hard rectangular edges. The pigment disperses toward the borders, creating a natural vignette that blends seamlessly with the white slide background. No solid color fills in the background area.

---

# Dimensions

The planner chooses dimensions based on WHERE the image will sit in the slide layout.

| Position in slide | Aspect ratio | Pixel size |
|---|---|---|
| Full width (single image slide) | 16:9 | 912×512 |
| Half slide (2-column layout) | 1:1 | 512×512 |
| Tall half (2-column, vertical emphasis) | 3:4 | 384×512 |
| Wide banner (above or below content) | 2:1 | 512×256 |

All images generated at 512px on the longest side. The aspect ratio is chosen by the planner based on the layout it envisions for the slide.

---

# Background Rules Summary

| Type + Style combination | Background rule |
|---|---|
| Any `diagram` | Pure white (#FFFFFF), no environment |
| Any `specimen` | Pure white (#FFFFFF), no environment |
| `person` + `illustration` | Pure white, subject floats cleanly |
| `person` + `watercolor` | Watercolor fades to white at edges |
| `person` + `sketch` | White paper, sketch lines taper naturally |
| `place` + any style | Environmental context allowed, but MUST fade to white at edges |
| `moment` + any style | Environmental context allowed, but MUST fade to white at edges |

The slide background is always white (#FFFFFF). Images must blend with it — no hard rectangular edges against the white canvas.
