## Context

Hotline Navigator is a fully functional Tauri v2 app with ~20 distinct capabilities already implemented. The `openspec/specs/` directory is empty — no behavioral specs exist yet. This change bootstraps specs for all current capabilities so the propose → apply → archive workflow has a foundation to reference.

This is a documentation-only change. No application code is modified.

## Goals / Non-Goals

**Goals:**
- Write one spec file per capability covering all current behavioral requirements
- Ensure every requirement has testable WHEN/THEN scenarios
- Use consistent naming and structure across all 19 spec files
- Capture protocol-level details where they define external behavior (HTXF handshake, HTRK protocol, HOPE negotiation)

**Non-Goals:**
- Achieving 100% coverage of every edge case on the first pass — specs will evolve as changes are proposed
- Writing implementation tests — specs define what to test, not the tests themselves
- Documenting internal architecture (that's the README's job)
- Changing any application code

## Decisions

### One spec per capability, not per component or module
**Rationale:** Specs describe behavioral capabilities (what users and the protocol can do), not code structure. A single capability like "file-transfers" spans frontend components, Zustand stores, Tauri commands, and Rust protocol code. Organizing by capability keeps specs stable even when code is refactored.

**Alternative considered:** One spec per Tauri command or per component directory. Rejected because it couples specs to implementation structure, which changes more frequently than behavior.

### Use the proposal's capability list as the canonical set
**Rationale:** The 19 capabilities in proposal.md were derived from a full audit of both frontend components and backend commands. This avoids gaps from only looking at one layer.

### Include protocol wire details only when they define observable behavior
**Rationale:** HTXF handshake bytes, HTRK batch format, and HOPE negotiation steps are part of the behavioral contract — a client that gets them wrong fails to interoperate. Internal implementation choices (which Rust crate, which async pattern) are excluded.

**Alternative considered:** Exclude all protocol details and keep specs purely UI-behavioral. Rejected because Hotline Navigator is a protocol client — the wire format IS the behavior for interop purposes.

### Parallelized authoring with batched agents
**Rationale:** 19 spec files is a large volume. Splitting into 5 parallel batches (4+4+4+4+3) reduces wall-clock time while keeping each agent's scope focused enough to produce quality specs.

## Risks / Trade-offs

- **[Specs may drift from code]** → Specs are bootstrapped from current behavior but not auto-verified. Mitigation: future changes use the propose → apply cycle, which keeps specs in sync. Consider adding spec-to-test generation later.
- **[Over-specification]** → Some requirements may be too detailed for a first pass, constraining future implementation changes unnecessarily. Mitigation: review during apply phase and relax overly specific requirements.
- **[Under-specification]** → First pass may miss edge cases. Mitigation: acceptable — specs grow organically as new changes reference and extend them.
