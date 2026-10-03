// Approximate GCJ-02 center near Hangzhou Xuejun High School's Zijin'gang campus.
// These offsets are only for a fictional map demo, never real meeting places.
export const DEMO_MAP_CENTER = { lng: 120.067672, lat: 30.298105 };

const DEMO_OFFSETS = [
  [-0.0036, 0.0014], [0.0028, 0.0018],
  [-0.0039, -0.0008], [0.0037, -0.0007],
  [-0.0021, -0.0025], [0.0018, -0.0028]
];

const FIRST_STEPS = {
  p1: "先一起揉一小团面",
  p2: "先选一条想走的街巷",
  p3: "先检查一把待修的椅子",
  p4: "先挑一件孩子想做的小物",
  p5: "先写下收信人的名字",
  p6: "先拍一张今天的街景"
};

export function placeDemoPosts(posts, random = Math.random) {
  const offsets = [...DEMO_OFFSETS];
  for (let index = offsets.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [offsets[index], offsets[other]] = [offsets[other], offsets[index]];
  }
  return posts.map((post, index) => {
    const [lngOffset, latOffset] = offsets[index % offsets.length];
    return {
      ...post,
      demoMap: true,
      locationPoint: {
        lng: Number((DEMO_MAP_CENTER.lng + lngOffset).toFixed(6)),
        lat: Number((DEMO_MAP_CENTER.lat + latOffset).toFixed(6))
      },
      firstStep: FIRST_STEPS[post.id] || "先聊聊想怎样开始"
    };
  });
}
