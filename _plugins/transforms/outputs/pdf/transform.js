const chalkFactory = require('~lib/chalk')
const filterOutputs = require('../filter.js')
const fs = require('fs')
const jsdom = require('jsdom')
const path = require('path')
const sharp = require('sharp')
const truncate = require('~lib/truncate')
const writer = require('./write')

const logger = chalkFactory('pdf:transform')

const { JSDOM } = jsdom

// Page geometry — keep in sync with variables.scss
const COLUMN_WIDTH_MM = 120    // single column: 210 - 71 - 19
const MAX_FIGURE_HEIGHT_MM = 140  // ~half page height (279mm); cap for Pass 1 blueprint mode
const CAPTION_HEIGHT_ESTIMATE_MM = 10  // rough estimate of caption height for natural figure height calculation
const FIGURE_TOP_MARGIN_MM = 0   // .q-figure margin-top in print — zero; preceding element's margin provides gap
const FIGURE_BOTTOM_MARGIN_MM = 3   // .q-figure margin-bottom in print
const HEIGHT_REDUCTION_TOLERANCE = parseFloat(process.env.FIGURE_HEIGHT_TOLERANCE ?? '0.20')  // override: FIGURE_HEIGHT_TOLERANCE=0.10 npm run dev

// Two-pass system:
//   Pass 1 (blueprint): figure-heights.json absent → hasTier2Data false → anchor + break-inside: auto only
//   Pass 2 (constrained): figure-heights.json present → hasTier2Data true → apply Tier 2 heights with tolerance
let tier2Heights = {}
try {
  const tier2Path = path.join(process.cwd(), '_site', 'figure-heights.json')
  if (fs.existsSync(tier2Path)) {
    tier2Heights = JSON.parse(fs.readFileSync(tier2Path, 'utf8'))
    logger.info(`Tier 2: loaded precise heights for ${Object.keys(tier2Heights).length} figures`)
  }
} catch (e) {
  logger.warn('Could not load figure-heights.json — pass 1 (blueprint) mode')
}
const hasTier2Data = Object.keys(tier2Heights).length > 0

// Module-level cache so the same image is only read once across all chapter sections
const imageDimsCache = new Map()

const getImageDims = async (imgPath) => {
  if (imageDimsCache.has(imgPath)) return imageDimsCache.get(imgPath)
  try {
    const { width, height } = await sharp(imgPath).metadata()
    const dims = (width && height) ? { width, height } : null
    imageDimsCache.set(imgPath, dims)
    return dims
  } catch {
    imageDimsCache.set(imgPath, null)
    return null
  }
}

/**
 * Two-pass figure height system.
 *
 * Pass 1 (no figure-heights.json): inserts anchor markers and sets
 * break-inside: auto on every inline figure so they render at natural height.
 * Anchors record reliable column positions regardless of figure size.
 *
 * Pass 2 (figure-heights.json present): applies Tier 2 heights from
 * analyze-layout.js to figures within HEIGHT_REDUCTION_TOLERANCE of their
 * natural height. Figures outside tolerance are left untouched — CSS
 * break-inside: avoid stays in effect and they push cleanly to the next column.
 *
 * Figures inside .quire-entry__image-wrap are skipped throughout.
 */
const constrainFigureHeights = async (sectionElement, contentDir) => {
  const doc = sectionElement.ownerDocument
  const figures = sectionElement.querySelectorAll('figure.q-figure')

  for (const figure of figures) {
    if (figure.closest('.quire-entry__image-wrap')) continue
    if (!figure.id) continue

    // Anchor marker — self-referential link forces Vivliostyle to create a PDF
    // named destination. analyze-layout.js reads these to compute available space.
    const marker = doc.createElement('span')
    marker.id = `anchor-${figure.id}`
    marker.setAttribute('style', 'display:block;height:0;width:0;overflow:hidden;')
    const selfLink = doc.createElement('a')
    selfLink.setAttribute('href', `#anchor-${figure.id}`)
    selfLink.setAttribute('aria-hidden', 'true')
    selfLink.textContent = '​'
    marker.appendChild(selfLink)
    figure.parentNode.insertBefore(marker, figure)

    // Pass 1: render inline at natural height so anchor positions are reliable.
    // Caption may detach from image if figure overflows a column — acceptable in blueprint.
    if (!hasTier2Data) {
      const capMm = MAX_FIGURE_HEIGHT_MM - CAPTION_HEIGHT_ESTIMATE_MM
      figure.setAttribute('style', `max-height: ${MAX_FIGURE_HEIGHT_MM}mm; break-inside: auto`)
      const img1 = figure.querySelector('img[src]')
      if (img1) img1.setAttribute('style', `max-height: ${capMm}mm`)
      continue
    }

    // Pass 2: apply Tier 2 height if within tolerance
    const img = figure.querySelector('img[src]')
    if (!img) continue
    const src = img.getAttribute('src')
    if (!src || !src.startsWith('_assets/images/')) continue

    const tier2Mm = tier2Heights[figure.id]
    if (tier2Mm === undefined) continue  // no data for this figure — CSS break-inside: avoid stays

    const imgPath = path.join(contentDir, src)
    const dims = await getImageDims(imgPath)
    if (!dims) continue

    const naturalHeightMm = COLUMN_WIDTH_MM * (dims.height / dims.width)
    const naturalFigureMm = naturalHeightMm + CAPTION_HEIGHT_ESTIMATE_MM
    const availableMm = tier2Mm - FIGURE_TOP_MARGIN_MM - FIGURE_BOTTOM_MARGIN_MM

    // Skip if the required reduction exceeds tolerance — figure will push cleanly
    if (availableMm < naturalFigureMm * (1 - HEIGHT_REDUCTION_TOLERANCE)) continue

    // Only apply inline max-height when tighter than the CSS cap.
    // If available space exceeds MAX_FIGURE_HEIGHT_MM, the CSS rule handles it —
    // setting a larger inline value would silently override and remove the cap.
    if (availableMm >= MAX_FIGURE_HEIGHT_MM) continue

    const imgAvailMm = availableMm - CAPTION_HEIGHT_ESTIMATE_MM
    figure.setAttribute('style', `max-height: ${availableMm.toFixed(1)}mm; break-inside: auto`)
    img.setAttribute('style', `max-height: ${imgAvailMm.toFixed(1)}mm`)
  }
}

/**
 * A function to transform and write Eleventy content for pdf
 *
 * @param      {Object}  collections  Eleventy collections object
 * @param      {String}  content      Output content
 * @return     {Array}   The transformed content string
 */
/**
 * Wrap print-float-right/left figures with their immediately following paragraph
 * in a flex row container (.print-aside). CSS floats are processed as page floats
 * by Vivliostyle and cannot produce inline text-wrap; the flex wrapper achieves
 * the same visual result structurally.
 *
 * Only wraps when the immediately following sibling is a <p> element. Figures
 * with no following paragraph are left inline (full-width, no wrapping).
 */
function wrapInlineFloatFigures(content, document) {
  // Takes exactly ONE following <p> into the text column.
  // More paragraphs would extend the narrow-column constraint beyond the figure's
  // bottom edge. The correct amount requires vivpipe pass 2 height data to calculate
  // how much text fills the figure height — that refinement comes later.
  const floatFigs = Array.from(
    content.querySelectorAll('.q-figure.print-float-right, .q-figure.print-float-left')
  )

  for (const fig of floatFigs) {
    const isRight = fig.classList.contains('print-float-right')
    const nextEl = fig.nextElementSibling

    if (!nextEl || nextEl.tagName !== 'P') continue

    // Marker preserves insertion point before DOM nodes are moved
    const marker = document.createElement('span')
    fig.parentNode.insertBefore(marker, fig)

    const wrapper = document.createElement('div')
    wrapper.classList.add('print-aside', isRight ? 'print-aside--right' : 'print-aside--left')

    const textDiv = document.createElement('div')
    textDiv.classList.add('print-aside__text')
    textDiv.appendChild(nextEl)

    if (isRight) {
      wrapper.appendChild(textDiv)
      wrapper.appendChild(fig)
    } else {
      wrapper.appendChild(fig)
      wrapper.appendChild(textDiv)
    }

    marker.replaceWith(wrapper)
  }
}

module.exports = async function(eleventyConfig, collections, content) {
  const pageTitle = eleventyConfig.getFilter('pageTitle')
  const slugify = eleventyConfig.getFilter('slugify')
  const citation = eleventyConfig.getFilter('citation')
  const citePage = eleventyConfig.getFilter('citePage')
  const formatCitation = eleventyConfig.getFilter('formatCitation')
  const { pdf: pdfConfig } = eleventyConfig.globalData.config
  const slugifyIds = eleventyConfig.getFilter('slugifyIds')

  const writeOutput = writer(eleventyConfig)

  /**
   * Truncated page or section title for footer
   * @param  {Object} page
   * @return {String} Formatted page or section title
   */
  const formatTitle = ({ label, short_title: shortTitle, title }) => {
    const truncatedTitle = shortTitle || truncate(title, 35)
    return pageTitle({ label, title: truncatedTitle })
  }

  /**
   * Sets data attribute used for PDF footer
   * @see `_assets/styles/print.css`
   *
   * @param  {Object}       page     The page being transformed
   * @param  {HTMLElement}  element  HTML element on which to set data attributes
   * @param  {boolean}      generatePagedPDF Whether to generate a PDF for this webpage
   * 
   * 
   */
  const setDataAttributes = (page, element, generatePagedPDF) => {
    const { dataset } = element
    const { parentPage, layout } = page.data
    const { pagePDF } = pdfConfig

    dataset.footerPageTitle = formatTitle(page.data)

    if (parentPage) {
      dataset.footerSectionTitle = formatTitle(parentPage.data)
    }

    if (!generatePagedPDF) {
      return
    }

    if (layout === 'cover') {
      logger.warn(`${page.data.page.inputPath} uses a \`cover\` layout, this will only appear in the full publication PDF`)
      return
    }

    dataset.pagePdf = true
  }

  /**
   * Transform relative links to anchor links
   *
   * @param      {HTMLElement}  element
   */
  const transformRelativeLinks = (element) => {
    const nodes = element.querySelectorAll('a:not(.footnote-backref, .footnote-ref-anchor)')
    nodes.forEach((a) => {
      const url = a.getAttribute('href')
      a.setAttribute('href', slugify(`page-${url}`).replace(/^([^#])/, '#$1'))
    })
    return element
  }

  /**
   * Prefix footnote hrefs and ids to guarantee unique references in PDF output
   * 
   * @param {HTMLElement} element 
   * @param {String} prefix 
   */
  const prefixFootnotes = (element, prefix) => {
    const footnoteItems = element.querySelectorAll('.footnote-item')
    footnoteItems.forEach((item) => {
      const id = item.getAttribute('id')
      item.setAttribute('id', `${prefix}-${id}`)
    })
    const footnoteBackrefs = element.querySelectorAll('.footnote-backref')
    footnoteBackrefs.forEach((item) => {
      const href = item.getAttribute('href')
      item.setAttribute('href', `#${prefix}-${href.replace(/^#/, '')}`)
    })
    const footnoteRefAnchors = element.querySelectorAll('.footnote-ref-anchor')
    footnoteRefAnchors.forEach((item) => {
      const href = item.getAttribute('href')
      const id = item.getAttribute('id')
      item.setAttribute('href', `#${prefix}-${href.replace(/^#/, '')}`)
      item.setAttribute('id', `${prefix}-${id}`)
    })
  }

  /**
   * @function trimLeadingSeparator
   * 
   * Trims the publication URL path from @src attribs and style background-image URLs

   * @param {Object} document JSDom `document` object of a section element
   */
  const trimLeadingSeparator = (document) => {
    const urlPath = eleventyConfig.globalData.publication.pathname

    /**
     * This function removes either the deploy path or just the leading slash 
     * 
     * @example /foo/_assets/image.jpg -> _assets/image.jpg
     * @example /_assets/image.jpg -> _assets/image.jpg
     * @example Pass any other @src attributes (incl. `http(s)://..`)
     * 
     * @todo Why does background-image carry the root asset path but no pathPrefix?
     */
    const trimDeployPathComponentOrSlash = (srcAttr) => {
      switch (true) {
        case srcAttr.startsWith(urlPath):
          return srcAttr.substr(urlPath.length)
        case srcAttr.startsWith('/'):
          return srcAttr.substr(1)
        default:
          return srcAttr
      }
    }

    document.querySelectorAll('[src]').forEach((asset) => {
      const src = asset.getAttribute('src')
      asset.setAttribute('src', trimDeployPathComponentOrSlash(src))
    })

    document.querySelectorAll('[style*="background-image"]').forEach((element) => {
      const backgroundImageUrl = element.style.backgroundImage.match(/[(](.*)[)]/)[1] || ''
      element.style.backgroundImage = `url('${trimDeployPathComponentOrSlash(backgroundImageUrl)}')`
    })
  }

  /**
   * @function normalizeCoverPageData
   * 
   * @param {Object} pageData - page data object
   * @param {Object} pdfConfig - configuration for the pdf
   * 
   * @return {Object} data formatted for the layout at _layouts/pdf-cover-pages.liquid
   */
  function normalizeCoverPageData(page,pdfConfig) {
    const { pagePDFCoverPageCitationStyle } = page.data

    // NB: `id` must match the @id slug scheme in `base.11ty.js` so the cover pages have the same keys
    const accessURL = page.data.canonicalURL
    const contributors = page.data.pageContributors ?? []    
    const copyright = page.data.publication.copyright
    const id = `page-${slugify(page.data.pageData.url)}` 

    // @todo Need license *text* per example

    const license = page.data.publication.license.name 

    // @todo replace date in mla citation
    /**
     * The function to do this in the app client code:
       function mlaDate(date) {
          const options = {
            month: 'long'
          }
          const monthNum = date.getMonth()
          let month
          if ([4, 5, 6].includes(monthNum)) {
            let dateString = date.toLocaleDateString('en-US', options)
            month = dateString.replace(/[^A-Za-z]+/, '')
          } else {
            month = (month === 8) ? 'Sept' : date.toLocaleDateString('en-US', options).slice(0, 3)
            month += '.'
          }
          const day = date.getDate()
          const year = date.getFullYear()
          return [day, month, year].join(' ')
        }
     * 
     **/

    // Feed the CSL processor an access date (@todo: either make this work or use the func above..)
    const pageCiteData = citePage({ page, context: 'page', type: 'mla' })
    const mla = formatCitation(
      { ...pageCiteData, accessed: '01 Oct 1999' },
      { page, context: 'page', type: 'mla' }
    )
    const pageCitations = {
      chicago: citation({ context: 'page', page, type: 'chicago' }),
      mla
    }
    const title = pageTitle({ ...page.data, label: '' })

    return { 
      accessURL, 
      citations: pageCitations, 
      contributors, 
      copyright, 
      id, 
      license, 
      title 
    }
  }

  const pdfPages = collections.pdf.map(({ outputPath }) => outputPath)

  // Returning content allows subsequent transforms to process it unmodified
  if (!pdfPages.includes(this.outputPath)) return content

  const { document } = new JSDOM(content).window
  const mainElement = document.querySelector('main[data-output-path]')
  const svgSymbolElements = document.querySelectorAll('body > svg')
  const pageIndex = pdfPages.findIndex((path) => path === this.outputPath)

  // Returning content allows subsequent transforms to process it unmodified
  if (!mainElement || pageIndex === -1) return content

  const currentPage = collections.pdf[pageIndex]
  const sectionElement = document.createElement('section')
  const pageId = mainElement.dataset.pageId

  const hasPagePDF = (currentPage.data.page_pdf_output === true) || (pdfConfig.pagePDF.output === true && currentPage.data.page_pdf_output !== false)
  const hasCoverPage = (currentPage.data.page_pdf_output === true) || (pdfConfig.pagePDF.output === true && currentPage.data.page_pdf_output !== false)

  sectionElement.innerHTML = mainElement.innerHTML

  for (const className of mainElement.classList) {
    sectionElement.classList.add(className)
  }

  setDataAttributes(currentPage, sectionElement, hasPagePDF)

  // set an id for anchor links to each section
  sectionElement.setAttribute('id', pageId)

  // transform relative links to anchor links
  transformRelativeLinks(sectionElement)

  // prefix footnote attributes to prevent duplicates
  prefixFootnotes(sectionElement, pageId)

  // markdown-it-footnote emits <section class="footnotes"> as a sibling after
  // the {% backmatter %} shortcode closes, so it lands outside the
  // <div class="backmatter"> that carries column-count: 2. Move it inside.
  const footnotesSection = sectionElement.querySelector('section.footnotes')
  if (footnotesSection) {
    const prev = footnotesSection.previousElementSibling
    if (prev && prev.classList.contains('backmatter')) {
      prev.appendChild(footnotesSection)
    }
  }

  // Final cleanups: remove non-pdf content, remove image leading slashes, slugify it all
  filterOutputs(sectionElement, 'pdf')
  trimLeadingSeparator(sectionElement)
  slugifyIds(sectionElement)

  // Remove inline scripts — they serve no purpose in PDF output and cause
  // re-execution errors when Vivliostyle moves DOM nodes across page areas.
  sectionElement.querySelectorAll('script').forEach((el) => el.remove())

  // Constrain inline figures to aspect-ratio-computed heights at column width.
  // Replaces the blunt global CSS max-height with per-figure values.
  await constrainFigureHeights(sectionElement, path.join(process.cwd(), 'content'))

  // Hoist hero-image out to a sibling top-level section so Vivliostyle sees a
  // clean named-page transition without nested page: property limitations.
  // Also: remove background-image (pixelated cover images unsuitable for print)
  // and move any opening blockquote (epigraph) from the chapter content to the
  // title page.
  const heroHeader = sectionElement.querySelector('.quire-page__header.hero-image')
  if (heroHeader) {
    // Remove background image — clean title page, no cover photo
    heroHeader.style.backgroundImage = ''

    // Recto: title page — hero header in its own section with all original page classes
    // (quire-splash, page-one etc.) so break-before: right and page: splash-image apply.
    const heroRectoSection = document.createElement('section')
    for (const className of sectionElement.classList) {
      heroRectoSection.classList.add(className)
    }
    heroRectoSection.classList.add('quire-pdf-hero-section')
    heroRectoSection.setAttribute('id', `${pageId}-hero`)
    heroRectoSection.appendChild(heroHeader) // moves node out of sectionElement

    // Build a hero-content-column (.container > .content) for epigraphs and any
    // leading figure. Using .content as the ancestor satisfies all existing CSS
    // selector chains (caption font, figure sizing, etc.) without triggering a
    // page: property change that would push content onto a new named page.
    const heroCol = document.createElement('div')
    heroCol.classList.add('hero-content-column')
    const heroContainer = document.createElement('div')
    heroContainer.classList.add('container')
    const heroContent = document.createElement('div')
    heroContent.classList.add('content')
    heroContainer.appendChild(heroContent)
    heroCol.appendChild(heroContainer)

    const content = sectionElement.querySelector('.content')
    if (content) {
      let el = content.firstElementChild

      // Move leading blockquotes (epigraphs) into the hero content column.
      while (el && el.tagName === 'BLOCKQUOTE') {
        const next = el.nextElementSibling
        heroContent.appendChild(el)
        el = next
      }

      // Move a leading figure into the hero content column.
      // constrainFigureHeights has already run, so anchor spans precede each figure.
      let anchorEl = null
      let figEl = el
      if (figEl && figEl.tagName === 'SPAN' && figEl.id && figEl.id.startsWith('anchor-')) {
        anchorEl = figEl
        figEl = figEl.nextElementSibling
      }
      if (figEl && figEl.tagName === 'FIGURE' && figEl.classList.contains('q-figure')) {
        if (anchorEl) heroContent.appendChild(anchorEl)
        heroContent.appendChild(figEl)
      }

      if (heroContent.children.length > 0) {
        // Verso: epigraph page — separate section so Vivliostyle starts it at the
        // top of a fresh page, enabling flex layout to reliably pin the figure to
        // the bottom. Does NOT include quire-splash (which carries break-before: right)
        // — page: splash-image is assigned via .hero-verso in print.scss instead.
        const heroVersoSection = document.createElement('section')
        heroVersoSection.classList.add('quire-page')
        heroVersoSection.classList.add('quire-pdf-hero-section')
        heroVersoSection.classList.add('hero-verso')
        heroVersoSection.setAttribute('id', `${pageId}-hero-verso`)
        heroVersoSection.appendChild(heroCol)
        collections.pdf[pageIndex].heroSectionElement = heroRectoSection.outerHTML + heroVersoSection.outerHTML
      } else {
        collections.pdf[pageIndex].heroSectionElement = heroRectoSection.outerHTML
      }

      // Insert sink spacer as first child of content — text starts 1/3 down the page.
      // A physical element is more reliable than padding-top on a named-page element in Vivliostyle.
      const sink = document.createElement('div')
      sink.classList.add('chapter-sink')
      sink.setAttribute('aria-hidden', 'true')
      content.insertBefore(sink, content.firstElementChild)
    } else {
      collections.pdf[pageIndex].heroSectionElement = heroRectoSection.outerHTML
    }
  }

  // Wrap print-float-right/left figures with adjacent paragraph in a flex row.
  const contentForWrap = sectionElement.querySelector('.content')
  if (contentForWrap) wrapInlineFloatFigures(contentForWrap, document)

  collections.pdf[pageIndex].svgSymbolElements = Array.from(svgSymbolElements).map( el => el.outerHTML )
  collections.pdf[pageIndex].sectionElement = sectionElement.outerHTML

  if (hasPagePDF && hasCoverPage) {
    collections.pdf[pageIndex].coverPageData = normalizeCoverPageData(currentPage,pdfConfig)         
  }

  /**
   * Once this transform has been called for each PDF page
   * every item in the collection will have `sectionContent`
   */
  if (collections.pdf.every(({ sectionElement }) => !!sectionElement)) {
    writeOutput(collections.pdf)
  }

  // Return unmodified `content`
  return content
}
