import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DEMO_MAP_CENTER, placeDemoPosts } from "../public/demo-map.js";

const seed = JSON.parse(await readFile(new URL("../public/data.json", import.meta.url), "utf8"));

test("seed tasks receive distinct randomized map positions near Xuejun Zijin'gang", () => {
  const first = placeDemoPosts(seed, () => 0);
  const second = placeDemoPosts(seed, () => 0.999);
  assert.equal(first.length, seed.length);
  assert.equal(seed.some((post) => post.locationPoint), false);
  assert.notDeepEqual(first.map((post) => post.locationPoint), second.map((post) => post.locationPoint));
  assert.equal(new Set(first.map((post) => `${post.locationPoint.lng},${post.locationPoint.lat}`)).size, seed.length);
  for (const post of first) {
    assert.equal(post.demoMap, true);
    assert.ok(post.firstStep.length >= 3);
    assert.ok(Math.abs(post.locationPoint.lng - DEMO_MAP_CENTER.lng) < 0.005);
    assert.ok(Math.abs(post.locationPoint.lat - DEMO_MAP_CENTER.lat) < 0.004);
  }
});
