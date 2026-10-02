// A schematic, fictional neighborhood. Coordinates are canvas units, not GPS.
export const mapNodes = Object.freeze({
  a: [150, 100], b: [390, 100], c: [650, 100], d: [860, 100],
  e: [150, 300], f: [390, 300], g: [650, 300], h: [860, 300],
  i: [150, 510], j: [390, 510], k: [650, 510], l: [860, 510]
});

const edgePairs = [
  ["a", "b"], ["b", "c"], ["c", "d"], ["e", "f"], ["f", "g"], ["g", "h"],
  ["i", "j"], ["j", "k"], ["k", "l"], ["a", "e"], ["e", "i"],
  ["b", "f"], ["f", "j"], ["c", "g"], ["g", "k"], ["d", "h"], ["h", "l"]
];
const metersPerUnit = 1.2; // Demo estimate only; never present as real navigation.

export const mapStarts = Object.freeze([
  { id: "e", name: "西门入口" },
  { id: "f", name: "中心广场" },
  { id: "c", name: "北门入口" }
]);

export const mapPlaces = Object.freeze([
  { id: "activity", name: "春和社区活动室", node: "b" },
  { id: "workshop", name: "社区共享工坊", node: "h" },
  { id: "library", name: "社区图书角", node: "i" },
  { id: "street", name: "春和社区周边", node: "k" }
]);

export function placeForLocation(location) {
  return mapPlaces.find((place) => place.name === location) || null;
}

export function walkingRoute(start, finish) {
  if (!mapNodes[start] || !mapNodes[finish]) return null;
  const costs = Object.fromEntries(Object.keys(mapNodes).map((id) => [id, Infinity]));
  const previous = {};
  const open = new Set(Object.keys(mapNodes));
  costs[start] = 0;
  while (open.size) {
    const current = [...open].reduce((best, id) => costs[id] < costs[best] ? id : best);
    if (costs[current] === Infinity || current === finish) break;
    open.delete(current);
    for (const [left, right] of edgePairs) {
      const neighbor = left === current ? right : right === current ? left : null;
      if (!neighbor || !open.has(neighbor)) continue;
      const from = mapNodes[current], to = mapNodes[neighbor];
      const candidate = costs[current] + Math.hypot(from[0] - to[0], from[1] - to[1]) * metersPerUnit;
      if (candidate < costs[neighbor]) { costs[neighbor] = candidate; previous[neighbor] = current; }
    }
  }
  if (costs[finish] === Infinity) return null;
  const nodes = [finish];
  while (nodes[0] !== start) nodes.unshift(previous[nodes[0]]);
  const meters = Math.round(costs[finish]);
  return { nodes, points: nodes.map((id) => mapNodes[id]), meters, minutes: Math.max(1, Math.ceil(meters / 75)) };
}

export function missionScore(post, start, interest = "all") {
  const place = placeForLocation(post.location);
  if (!place) return -Infinity;
  const route = walkingRoute(start, place.node);
  if (!route) return -Infinity;
  const text = `${post.title} ${post.description} ${(post.tags || []).join(" ")} ${post.category || ""}`;
  const keywords = {
    hands: ["亲手", "手工", "木工", "修", "饺子", "劳动", "旧物"],
    street: ["街区", "散步", "社区", "城市", "摄影"],
    stories: ["故事", "写", "家书", "表达", "长辈"],
    photo: ["摄影", "拍", "影像", "手机"]
  };
  const hits = (keywords[interest] || []).filter((word) => text.includes(word)).length;
  return hits * 280 - route.meters;
}

export function rankedMissions(posts, start, interest = "all") {
  return posts.filter((post) => placeForLocation(post.location))
    .sort((left, right) => missionScore(right, start, interest) - missionScore(left, start, interest));
}
