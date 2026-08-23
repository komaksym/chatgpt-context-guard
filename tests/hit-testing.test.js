const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const styles = fs.readFileSync(path.resolve(__dirname, "../src/styles.css"), "utf8");

test("transparent guard area passes clicks through while visible surfaces stay interactive", () => {
  assert.match(styles, /:host\s*\{[^}]*pointer-events:\s*none;/s);
  assert.match(
    styles,
    /\.panel,\s*\.warning-toast,\s*\.collapsed\s*\{[^}]*pointer-events:\s*auto;/s,
  );
});
