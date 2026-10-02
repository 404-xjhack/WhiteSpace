import test from "node:test";
import assert from "node:assert/strict";
import { mapNodes, mapPlaces, placeForLocation, walkingRoute, rankedMissions } from "../public/neighborhood.js";

test("known public venues map to schematic waypoints; unconfirmed places do not", () => {
  assert.equal(placeForLocation("社区共享工坊")?.node, "h");
  assert.equal(placeForLocation("地点可协商"), null);
  assert.equal(placeForLocation("春和社区"), null, "A vague neighborhood is not a confirmed public meeting point");
  assert.equal(mapPlaces.every((place) => Boolean(mapNodes[place.node])), true);
});

test("walking route follows connected streets and changes with departure point", () => {
  const route = walkingRoute("e", "h");
  assert.deepEqual(route.nodes, ["e", "f", "g", "h"]);
  assert.equal(route.points.length, 4);
  assert.ok(route.meters > 0);
  assert.ok(route.minutes >= 1);
  assert.ok(walkingRoute("c", "h").meters < route.meters);
  assert.equal(walkingRoute("unknown", "h"), null);
});

test("mission ranking uses topic and walkability, excluding unknown locations", () => {
  const posts = [
    { id: "photo", title: "手机摄影", description: "拍照", location: "社区图书角" },
    { id: "wood", title: "木工修椅子", description: "亲手修旧物", location: "社区共享工坊" },
    { id: "other", title: "随便", description: "", location: "待确认" }
  ];
  assert.deepEqual(rankedMissions(posts, "e", "all").map((post) => post.id), ["photo", "wood"]);
  assert.equal(rankedMissions(posts, "e", "hands")[0].id, "wood");
});
