---
trigger: always_on
---

1. Stack
  Env: Bun (runtime, test, pkg).
  Lang: TypeScript (Front/Back).
  UI: VanJS only (programmatic DOM). No .html.
  Libraries (top-level npm libs only): node:crypto http-message-signatures node-forge

2. Module Structure (Strict)
  Files: Every folder must contain exactly:
    design.md (Logic/Requirements/options/analysis/MermaidChart/workflow)
    interface.ts (type definitions and contracts, all doc lives here)
    test.ts (e.g Bun Test)
    impl.ts (Implementation of types)
    module.ts (Exports/Entrypoint)
    readme.md (Implementation status, usage instructions, test and performance results)
  Design: SOLID principles. Isolated via interface.ts. Directory hierarchy = Module hierarchy.
  Variants: if an interface has multiple implementations, it is separated into its own sub-module for the generic interface and sub-sub-modules for the implementations.

3. Workflow & Git
  Granularity: Edit 1 file at a time. Commit immediately.
  Sequence: design.md -> interface.ts -> test.ts -> impl.ts -> module.ts -> design.md (revisit) -> readme.md.
  Branching: Branch name = Folder path plus version (e.g., A/B/C-v0).
  Merge: Merge sub-module to parent branch upon passing tests.  

5. Documentation
  Location: TSDoc/JSDoc in interface.ts ONLY.
  Impl: impl.ts stays clean (brief comments only for complexity).

6. Coding conventions
  snake_case naming conventions
  Uppercase for compile-time objects like types
  lowercase for run-time objects like vars
  strict typing. Don't use 'Any'
  keep it concise and isolate to the relevant scope
  prefer chaining functions over intermediate variables
  use block scopes to isolate sequential operations and eliminate dangling intermediate variables.