/**
 * Reorders Good Wood Show accordion: EP9 (top, open) … EP1 (bottom).
 * Run from site root: node scripts/reorder-goodwood-accordion.js
 */
const fs = require("fs");
const path = require("path");
const file = path.join(__dirname, "..", "index.html");
const html = fs.readFileSync(file, "utf8");

const open = '<div class="accordion" id="accordionExample">';
const iOpen = html.indexOf(open);
if (iOpen < 0) throw new Error("accordion not found");
const afterOpen = iOpen + open.length;
const closeNeedle = "\n        </div>\n      </div>\n    </section>";
const iClose = html.indexOf(closeNeedle, afterOpen);
if (iClose < 0) throw new Error("accordion end not found");

let inner = html.slice(afterOpen, iClose);
inner = inner.replace(/^\s+/, "");
// Heal accidental minification between items (breaks split below)
inner = inner.replace(
  /<\/div>\s*<div class="accordion-item">/g,
  "</div>\n\n          <div class=\"accordion-item\">"
);

const delim = /\n\n          <div class="accordion-item">\n/;
const blocks = inner.split(delim);
if (blocks.length !== 9) {
  throw new Error(`Expected 9 accordion blocks, got ${blocks.length}`);
}
const items = blocks.map((b, i) =>
  i === 0 ? b : "\n\n          <div class=\"accordion-item\">\n" + b
);

const names = [
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
];
const fromSuffix = [
  "Nine",
  "Eight",
  "Seven",
  "Six",
  "Five",
  "Four",
  "Three",
  "Two",
  "One",
];

function remapChunk(chunk, i) {
  const from = fromSuffix[i];
  const to = names[i];
  let out = chunk
    .replace(new RegExp(`heading${from}`, "g"), `heading${to}`)
    .replace(new RegExp(`collapse${from}`, "g"), `collapse${to}`);

  if (i === 0) {
    out = out.replace(
      /class="accordion-button collapsed text-warning/g,
      'class="accordion-button text-warning'
    );
    out = out.replace(/aria-expanded="false"/g, 'aria-expanded="true"');
    out = out.replace(
      /class="accordion-collapse collapse"(?! show)/g,
      'class="accordion-collapse collapse show"'
    );
  } else {
    out = out.replace(
      /class="accordion-button text-warning text-start/g,
      'class="accordion-button collapsed text-warning text-start'
    );
    out = out.replace(/aria-expanded="true"/g, 'aria-expanded="false"');
    out = out.replace(
      /class="accordion-collapse collapse show"/g,
      'class="accordion-collapse collapse"'
    );
  }
  return out;
}

const reversed = [...items].reverse();
const newItems = reversed.map((ch, i) => remapChunk(ch, i));
let newInner = newItems.join("") + "\n        ";
// Join can rarely stick `</div>` to the next item; normalize before write
newInner = newInner.replace(
  /<\/div>\s*<div class="accordion-item">/g,
  "</div>\n\n          <div class=\"accordion-item\">"
);

const out = html.slice(0, afterOpen) + newInner + html.slice(iClose);
fs.writeFileSync(file, out, "utf8");
console.log("OK: EP9 … EP1 (EP9 open).");
