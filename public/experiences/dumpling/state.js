import { STEPS } from "./data.js";
const blankStep = () => ({ phase: 0, passes: 0, amount: "fit" });
export function createState(saved) {
  const state = { version: 1, currentStepId: STEPS[0].id, steps: Object.fromEntries(STEPS.map(s => [s.id, blankStep()])), completedStepIds: [] };
  if (!saved || saved.version !== 1 || !saved.steps) return state;
  if (STEPS.some(s => s.id === saved.currentStepId)) state.currentStepId = saved.currentStepId;
  for (const step of STEPS) {
    const value = saved.steps[step.id];
    if (!value || !Number.isInteger(value.phase) || value.phase < 0 || value.phase > step.actions.length) continue;
    if (!Number.isInteger(value.passes) || value.passes < 0 || value.passes > 3) continue;
    if (!["small", "fit", "large"].includes(value.amount)) continue;
    if (step.id === "roll" && value.phase === 2 && value.passes !== 3) continue;
    if (step.id === "wrap" && value.phase >= 2 && value.amount === "large") continue;
    state.steps[step.id] = { phase: value.phase, passes: value.passes, amount: value.amount };
  }
  state.completedStepIds = STEPS.filter(s => Array.isArray(saved.completedStepIds) && saved.completedStepIds.includes(s.id)).map(s => s.id);
  return state;
}
export function focusStep(state, id) { return STEPS.some(s => s.id === id) ? { ...state, currentStepId: id } : state; }
export function replayStep(state) { return { ...state, steps: { ...state.steps, [state.currentStepId]: blankStep() } }; }
export function setAmount(state, amount) {
  if (state.currentStepId !== "wrap" || state.steps.wrap.phase >= 2 || !["small", "fit", "large"].includes(amount)) return state;
  return { ...state, steps: { ...state.steps, wrap: { ...state.steps.wrap, amount } } };
}
export function perform(state, actionId) {
  const step = STEPS.find(s => s.id === state.currentStepId), value = state.steps[step.id], action = step.actions[value.phase];
  if (!action || action.id !== actionId) return { state, changed: false, feedback: "请先完成当前操作。", completedNow: false, finishedNow: false };
  if (step.id === "wrap" && actionId === "fold" && value.amount === "large") return { state, changed: false, feedback: "馅量太多，边缘没有足够的封口空间。先选「适量」或「少量」，再试着对折。", completedNow: false, finishedNow: false };
  const nextValue = { ...value }; let feedback = action.result;
  if (step.id === "roll" && actionId === "roll") {
    nextValue.passes = Math.min(3, value.passes + 1); if (nextValue.passes === 3) nextValue.phase++;
    feedback = `${action.result} 已完成 ${nextValue.passes}/3 次转动与擀压。`;
  } else nextValue.phase++;
  const completedNow = nextValue.phase === step.actions.length && !state.completedStepIds.includes(step.id);
  const completedStepIds = completedNow ? STEPS.filter(s => s.id === step.id || state.completedStepIds.includes(s.id)).map(s => s.id) : state.completedStepIds;
  return { state: { ...state, steps: { ...state.steps, [step.id]: nextValue }, completedStepIds }, changed: true, feedback, completedNow, finishedNow: completedNow && completedStepIds.length === STEPS.length };
}
