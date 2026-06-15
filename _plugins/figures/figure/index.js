const fs = require('fs-extra');
const path = require('path');
const Manifest = require('./manifest');
const Transformer = require('./transformer');
const logger = require('../../../lib/chalk')(__filename);

module.exports = class Figure {
  constructor(iiifConfig, imageProcessor, data) {
    const { baseURI, dirs, manifestFileName } = iiifConfig;
    const outputDir = path.join(dirs.outputPath, data.id);

    // ... rest of the constructor code ...

    this.pandocFile = data.pandoc_file || null;
    this.quireFile = data.quire_file || null;
  }

  async processFiles() {
    try {
      if (this.src) {
        await this.processImage();
      } else if (this.typstFile) {
        // Handle Typst files here
        // ... code to handle Typst files ...
      }

      if (this.annotations && this.annotations.length > 0) {
        await Promise.all(this.annotations.map((annotation) => annotation.processFiles()));
      }

      if (this.sequences && this.sequences.length > 0) {
        await Promise.all(this.sequences.map((sequence) => sequence.processItems()));
      }
    } catch (error) {
      logger.error(`Error processing files for figure ${this.id}: ${error}`);
    }
  }

  async createManifest() {
    if (!this.isCanvas) return;
    const manifest = new Manifest(this);

    // Add Pandoc file information to the IIIF manifest
    if (this.pandocFile) {
      manifest.addPandocFile(this.pandocFile);
    }

    // Add Quire file information to the IIIF manifest
    if (this.quireFile) {
      manifest.addQuireFile(this.quireFile);
    }

    const { errors } = await manifest.write();
    if (errors) this.errors = this.errors.concat(errors);
  }
};
