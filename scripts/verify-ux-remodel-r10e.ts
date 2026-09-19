import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
let passed = 0;
function check(name: string, run: () => void) {
  run();
  passed += 1;
  console.log(`✓ ${name}`);
}

check("every native open details panel has a global Escape path", () => {
  const controller = read("components/NativeDetailsEscape.tsx");
  const shell = read("components/Shell.tsx");
  assert.match(controller, /event\.key !== "Escape"/);
  assert.match(controller, /details\[open\]:not\(\.dismissible-details\)/);
  assert.match(controller, /open\.open = false/);
  assert.match(controller, /:scope > summary/);
  assert.match(shell, /<NativeDetailsEscape\/>/);
});

check("dedicated popup panels retain visible close and outside dismissal", () => {
  const popup = read("components/DismissibleDetails.tsx");
  assert.match(popup, /Zavřít<\/button>/);
  assert.match(popup, /pointerdown/);
  assert.match(popup, /event\.key === "Escape"/);
});

check("manual payment shortcut preserves current property context", () => {
  const shell = read("components/Shell.tsx");
  assert.match(shell, /taskPropertyId \? `\/platby\/nova\?properties=\$\{encodeURIComponent\(taskPropertyId\)\}`/);
  assert.match(shell, /ScopeAwareLink className="secondary top-action"/);
});

check("document filters and previews have accessible names", () => {
  const page = read("app/dokumenty/page.tsx");
  const attachments = read("components/documents/DocumentAttachments.tsx");
  assert.match(page, /aria-label="Filtry katalogu dokumentů"/);
  for (const label of ["Hledat", "Nemovitost", "Kategorie", "Typ souboru", "Datum dokumentu od", "Datum dokumentu do"]) assert.match(page, new RegExp(`>${label}<`));
  assert.match(page, /Zrušit filtry/);
  assert.match(attachments, /<DocumentImagePreview documentId=\{document.id\} title=\{document.title\}/);
  const preview = read("components/documents/DocumentImagePreview.tsx");
  assert.match(preview, /aria-label=\{`Otevřít náhled:/);
  assert.match(preview, /aria-labelledby=\{titleId\}/);
  assert.match(preview, /aria-label="Zavřít náhled"/);
});

check("document enum codes are translated for people", () => {
  const labels = read("lib/labels.ts");
  const page = read("app/dokumenty/page.tsx");
  const attachments = read("components/documents/DocumentAttachments.tsx");
  assert.match(labels, /CONTRACT_ADDENDUM: "Dodatek ke smlouvě"/);
  assert.match(labels, /BEFORE: "Před realizací"/);
  assert.match(page, /documentCategories\[category\]/);
  assert.match(attachments, /documentPhotoStages\[document\.photoStage\]/);
});

console.log(`R10E verifier passed (${passed} checks).`);
