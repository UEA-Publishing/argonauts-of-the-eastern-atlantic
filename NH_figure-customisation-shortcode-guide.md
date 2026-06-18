# Figure shortcodes — Argonauts of the Eastern Atlantic

## How to use

The custom layout classes go in the `class` parameter of the standard Quire figure shortcode:

```
{% figure 'fig-id', 'class-name' %}
```

Caption classes can be combined with layout classes by separating them with a space:

```
{% figure 'fig-id', 'is-pulled-right-align has-caption-below-right' %}
```

All these classes affect **screen display only**. They do not carry over to print or EPUB.

---

## Layout classes

These control where the image sits relative to the text column and how far it extends into the surrounding white space.

### Standard Quire (built-in)

**`is-pulled-right`** / **`is-pulled-left`**
The image floats to the right or left of the text at half the column width. Text wraps around it. These are Quire's default pull classes.

---

### Custom layout classes

**`is-pulled-right-50`**
Floats right. The image occupies about three-quarters of the text column width, with the right-hand quarter extending into the white space outside the column. On medium screens it collapses to a standard 50% float; on mobile it stacks full width below the text.

**`is-pulled-left-50`**
The mirror: floats left, same proportions, extending into the left-hand white space.

---

**`is-pulled-right-align`**
Floats right, larger. The right edge of the image aligns with the very edge of the viewport — the image runs from roughly the centre of the text column out to the screen's right edge. A more emphatic pull that reaches the browser margin. On medium screens falls back to a 50% float; on mobile stacks full width.

**`is-pulled-left-align`**
The mirror: floats left, left edge at the viewport's left edge.

---

**`is-pulled-both-50`**
Full-width block (does not float — clears any floats above it). The image extends equally into both sides of the surrounding white space, so it is wider than the text column but narrower than the viewport. The caption is inset slightly from the image edges to align with the column text. On smaller screens it sits at 100% column width.

---

**`is-pulled-full-right`**
Full-width block. Starts at the left edge of the text column and runs all the way to the right edge of the viewport. The caption is inset from the right to remain readable. Use for wide horizontal images where you want the image to expand rightward but keep the left edge anchored to the text.

**`is-pulled-full-left`**
The mirror: runs from the right edge of the text column to the left edge of the viewport.

---

**`is-pulled-full-both`**
Full viewport width — the image spans the entire width of the browser window, breaking out of the text column on both sides. The caption is inset on both sides to keep it within the readable area. On smaller screens the image sits at 100% column width.

---

## Caption classes

These control where the caption appears relative to the image. They can be used on their own or combined with any layout class above.

**`has-caption-right`**
On wide screens (1280px and above), the caption moves out of the image block entirely and sits in the white space to the right of the image, top-aligned with the top of the image. On narrower screens, it falls back to its default position below the image.

**`has-caption-left`**
Same, but to the left. Caption text is right-aligned in that left-hand column to read neatly against the image edge. Same snap-back to below at 1280px.

**`has-caption-below-right`**
Keeps the caption below the image but right-aligns it. The figure label (e.g. "Fig. 4") and its icon are also right-aligned, with the icon appearing to the right of the label text.

**`has-caption-below-left`**
Keeps the caption below the image, explicitly left-aligned. Useful as a companion to layout classes that might otherwise shift caption alignment.

---

## Combining classes — examples from Chapter 1

| Shortcode class | Visual result |
|---|---|
| `is-pulled-right-align` | Large right float, reaching the viewport right edge |
| `is-pulled-right-50 has-caption-right` | Smaller right float with bleed; caption in right white space |
| `is-pulled-left-50 has-caption-left` | Smaller left float with bleed; caption in left white space |
| `is-pulled-both-50` | Slightly wider than column, centred, both sides |
| `is-pulled-right-align has-caption-below-right` | Large right float; caption below, right-aligned |
| `is-pulled-left-align has-caption-below-left` | Large left float; caption below, left-aligned |
| `has-caption-right` *(no layout class)* | Full column width; caption in right margin |
| `has-caption-left` *(no layout class)* | Full column width; caption in left margin |

---

---

# Other customisations

These are changes made to the publication's visual design that are not author-facing via shortcodes — they are built into the site's styles and templates.

## Typography

The default Quire fonts have been replaced throughout:

- **Body text:** Arnhem Pro Blond — a light-weight serif. Used for all running prose.
- **Headings, labels, and navigation:** GT Pressura — a condensed sans-serif. Used for chapter headings, figure captions and labels, and the navigation bar.
- Both are licensed fonts hosted locally in the project; they are not web-loaded from a CDN.

## Colour scheme

The default Quire accent colour (red) has been changed to **black** throughout — borders, label text, link icons.

## Navigation bar

- The navbar is taller than Quire's default (6rem instead of 3rem), giving more breathing room for the logo and navigation icons.
- The **UEA Free Press logo** appears in the top-left of the navbar on every page, linked to the UPP website.

## Drop caps

Chapter opening pages (splash layout) get a **drop cap** on the first paragraph: the first letter is enlarged to roughly 6.5× the body size and floats left, dropping down three lines. The first paragraph is also given extra top space so the drop cap sits comfortably beneath the chapter title.

## Heading spacing

Level 2 headings (`##` in Markdown) have extra space above them — 3rem of padding — so section breaks read clearly within a long essay.

## Figure caption styling

Figure captions use GT Pressura (matching headings) rather than the body serif. The figure label (e.g. "Fig. 4") has its right margin removed so the number reads flush against the caption text.
