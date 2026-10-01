// Keep each light bound to one lamp until it has faded out completely.
// Hysteresis avoids swapping lamps whenever their distance rankings cross.
export class StableLightSelection {
  constructor(count, hysteresis = 140) {
    this.hysteresis = hysteresis;
    this.slots = Array.from({ length: count }, () => ({ source: null, pending: null, weight: 0 }));
  }
  reset() {
    for (const slot of this.slots) { slot.source = slot.pending = null; slot.weight = 0; }
  }
  update(sources, position, dt) {
    const distance = source => Math.hypot(source.fire.position.x - position.x, source.fire.position.y - position.y, source.fire.position.z - position.z);
    const ranked = [...sources].sort((a, b) => distance(a) - distance(b));
    const reserved = new Set(this.slots.flatMap(slot => [slot.source, slot.pending]).filter(Boolean));
    for (const slot of this.slots) {
      if (!slot.source) {
        slot.source = ranked.find(source => !reserved.has(source)) || null;
        slot.weight = slot.source ? 1 : 0;
        if (slot.source) reserved.add(slot.source);
      }
      if (!slot.source) continue;
      if (!slot.pending) {
        const candidate = ranked.find(source => !reserved.has(source));
        if (candidate && distance(candidate) + this.hysteresis < distance(slot.source)) {
          slot.pending = candidate;
          reserved.add(candidate);
        }
      }
      if (slot.pending) {
        slot.weight = Math.max(0, slot.weight - dt / .3);
        if (slot.weight === 0) {
          reserved.delete(slot.source);
          slot.source = slot.pending;
          slot.pending = null;
        }
      } else slot.weight = Math.min(1, slot.weight + dt / .4);
    }
    return this.slots;
  }
}
