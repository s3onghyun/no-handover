// Report evidence: which pins count, per slot and kind. Pure functions over the case and the pins
// (no DOM), shared by the engine (citations, checklist count), the board and the report.
//
//   kindsFor(slot, pins)      -> [{ kind, pins: [ids] }]   met = pins.length > 0
//   supports(slot, pin)       -> the pin meets one of the slot's kinds
//   evidencePins(cs, pins)    -> pins that meet any slot's kind (all pins when no slot has kinds)

import type { CaseFile, EvidenceKind, SlotDef } from './types.ts';

export interface PinLike {
  id: string;
  clueIds: string[];
}

export interface KindStatus {
  kind: EvidenceKind;
  /** Pin ids that meet this kind, in pin order. */
  pins: string[];
}

/** True when any report slot defines evidence kinds. */
export function hasEvidence(cs: CaseFile): boolean {
  return cs.accusation.slots.some((s) => s.evidence?.length);
}

export function kindsOf(slot: SlotDef, pin: PinLike): EvidenceKind[] {
  return (slot.evidence ?? []).filter((k) => k.clues.some((c) => pin.clueIds.includes(c)));
}

export function supports(slot: SlotDef, pin: PinLike): boolean {
  return kindsOf(slot, pin).length > 0;
}

export function kindsFor(slot: SlotDef, pins: PinLike[]): KindStatus[] {
  return (slot.evidence ?? []).map((kind) => ({ kind, pins: pins.filter((p) => kind.clues.some((c) => p.clueIds.includes(c))).map((p) => p.id) }));
}

/** Pins the checklist's "증거 N개" counts: they meet some slot's kind (any pin without kinds). */
export function evidencePins<P extends PinLike>(cs: CaseFile, pins: P[]): P[] {
  if (!hasEvidence(cs)) return pins;
  return pins.filter((p) => cs.accusation.slots.some((s) => supports(s, p)));
}

export type CiteState = 'ok' | 'missing' | 'unsupported';

/** How a slot's citation stands: no pin cited, cited pins that meet no kind, or ok. */
export function citeState(slot: SlotDef, cited: string[] | undefined, pins: PinLike[]): CiteState {
  const chosen = pins.filter((p) => cited?.includes(p.id));
  if (!chosen.length) return 'missing';
  return chosen.some((p) => supports(slot, p)) ? 'ok' : 'unsupported';
}

export interface SlotProgress {
  slot: SlotDef;
  kinds: KindStatus[];
  /** Kinds with at least one pin. */
  met: number;
  /** Some pin meets one of the slot's kinds: the slot can be cited. */
  ready: boolean;
}

/**
 * Per report slot with evidence kinds: which kinds have a pin ("원인 증거 1/2") and whether the
 * slot can be cited yet. Kinds are neutral types, so this is progress without the answer.
 */
export function slotProgress(cs: CaseFile, pins: PinLike[]): SlotProgress[] {
  return cs.accusation.slots
    .filter((s) => s.evidence?.length)
    .map((slot) => {
      const kinds = kindsFor(slot, pins);
      const met = kinds.filter((k) => k.pins.length).length;
      return { slot, kinds, met, ready: met > 0 };
    });
}

/** Slots with evidence kinds that no pin meets yet (0 when the case defines no kinds). */
export function uncoveredSlots(cs: CaseFile, pins: PinLike[]): number {
  return slotProgress(cs, pins).filter((p) => !p.ready).length;
}
