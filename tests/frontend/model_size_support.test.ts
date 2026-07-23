import assert from "node:assert/strict";
import test from "node:test";

import { isModelSizeSupported } from "../../codex_image/webui/frontend/src/model-size-support";

const seedreamLite = {
  sizes: ["2048x2048", "4096x4096"],
  custom_size: true,
  size_constraints: {
    min_dimension: 512,
    max_dimension: 4096,
    min_pixels: 3_686_400,
    min_aspect_ratio: 1 / 3,
    max_aspect_ratio: 3,
  },
};

test("Seedream Lite rejects sizes below the provider minimum pixel count", () => {
  assert.equal(isModelSizeSupported(seedreamLite, "1024x1024"), false);
  assert.equal(isModelSizeSupported(seedreamLite, "1920x1920"), true);
  assert.equal(isModelSizeSupported(seedreamLite, "2048x2048"), true);
});
