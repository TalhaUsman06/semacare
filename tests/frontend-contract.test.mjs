import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(projectRoot, "frontend", "index.html"), "utf8");
const app = fs.readFileSync(path.join(projectRoot, "frontend", "app.js"), "utf8");
const styles = fs.readFileSync(path.join(projectRoot, "frontend", "styles.css"), "utf8");

function hasId(id) {
  return html.includes(`id="${id}"`);
}

test("frontend exposes the complete selection and review controls", () => {
  for (const id of [
    "choose-folder", "choose-files", "folder-input", "files-input", "local-ai-consent",
    "processing-status", "processing-phase", "processing-progress-fill", "processing-eta",
    "category-grid", "image-grid", "view-categories", "view-bin", "view-archive",
    "bin-grid", "archive-search", "archive-list", "clear-archive",
  ]) assert.equal(hasId(id), true, `missing #${id}`);
});

test("frontend exposes every required export and deletion action", () => {
  for (const id of [
    "export-csv", "export-info-csv", "export-info-json", "view-information",
    "export-images", "select-visible", "clear-selection", "move-to-bin", "empty-bin",
  ]) assert.equal(hasId(id), true, `missing #${id}`);
  assert.match(html, /recoverable recycle bin/i);
  assert.match(html, /Nothing is deleted without your confirmation/i);
});

test("supported image formats and category taxonomy are declared", () => {
  assert.match(html, /image\/jpeg,image\/png,image\/webp/);
  for (const category of ["Receipts", "Screenshots", "Landscapes", "People", "Memes", "Junk", "Other"]) {
    assert.match(app, new RegExp(`name: "${category}"`), `missing ${category} category`);
  }
});

test("privacy and persistence contracts are present", () => {
  assert.match(app, /semacare-information/);
  assert.match(app, /indexedDB\.open/);
  assert.match(app, /image_deleted/);
  assert.match(app, /sensitive_reasons/);
  assert.match(app, /meaningful_fields/);
  assert.match(app, /ocr_processed/);
  assert.match(app, /JSON\.stringify\(record, null, 2\)/);
  assert.match(html, /Pictures never leave this device/i);
});

test("OCR progress and export reuse are wired", () => {
  assert.match(app, /Extracting local text/);
  assert.match(app, /images\.filter\(\(image\) => !image\.ocrProcessed\)/);
  assert.match(app, /Text extraction complete/);
  assert.match(app, /image\.ocrProcessed = true/);
  assert.match(html, /Export information JSON/);
});

test("archive UI provides search and expandable per-image JSON", () => {
  assert.match(app, /View record JSON/);
  assert.match(app, /JSON\.stringify\(record, null, 2\)/);
  assert.match(styles, /archive-record-json/);
});

test("AWS remains opt-in and service credentials are not referenced by frontend code", () => {
  assert.match(html, /AWS image AI temporarily paused/i);
  assert.doesNotMatch(app, /sb_secret_/i);
  assert.doesNotMatch(app, /service_role/i);
  assert.doesNotMatch(html, /SUPABASE_SERVICE_KEY/i);
});
