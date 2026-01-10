1. Stack
  Env: Bun (runtime, test, pkg).
  Lang: TypeScript (Front/Back).
  UI: VanJS only (programmatic DOM). No .html.

2. Module Structure (Strict)
  Files: Every folder must contain exactly:
    plan.md (Logic/Requirements/options/analysis/MermaidChart/workflow)
    interface.ts (Contracts + All Docs)
    test.ts (Bun Test)
    impl.ts (Implementation)
    module.ts (Exports/Entry)
  Design: SOLID principles. Isolated via interface.ts. Directory hierarchy = Module hierarchy.

3. Workflow & Git
  Granularity: Edit 1 file at a time. Commit immediately.
  Sequence: plan.md -> interface.ts -> test.ts -> src.ts -> module.ts.
  Branching: Branch name = Folder path (e.g., A/B/C). Base = Parent module branch.
  Versioning: Tag format Path-vX.Y (e.g., A/B/C-v0.2).
  Merge: Merge sub-module to parent branch upon passing tests.  

5. Documentation
  Location: TSDoc/JSDoc in interface.ts ONLY.
  Impl: src.ts stays clean (brief comments only for complexity).

6. Coding conventions
  snake_case naming conventions
  Uppercase for compile-time objects like types
  lowercase for run-time objects like vars
  strict typing. Don't use 'Any'
  keep it concise and isolate to the relevant scope
  prefer chaining functions over intermediate variables
  use block scopes to isolate sequential operations
