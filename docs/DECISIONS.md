# Architecture decisions

## Geometry and coordinate spaces

`SceneDocument` schema version 2 is the sole committed scene model. Render meshes are projections of it and are never canonical state. Version 1 projects are migrated on load: `scaleMm` becomes `scale`, a scalar sphere radius becomes three equal radii, and missing opacity receives the established default.

Primitive parameters and custom-mesh vertices are object-local. Every object has local `positionMm`, quaternion `rotation`, and `scale`; its world matrix is the ordered composition of its ancestors and its own local transform. Geometry is not also baked through those transforms during normal rendering. Numeric edits, gizmos, hierarchy commands, and programmatic callers all commit typed operations through the same atomic executor.

Meshes use deterministic indexed triangles. Each triangle must reference three distinct in-range vertices and have nonzero area. Closed-solid checks additionally require each undirected edge to have exactly two incident triangles. Normals are derived from valid indexed positions when rendered or passed to consumers that need them; UVs are not part of canonical geometry because the editor does not currently author texture coordinates.

## Scale and primitive dimensions

Object-mode scale is a transform and remains separate from primitive shape parameters. Shape mode changes `sizeMm`, cylinder radius/height, or ellipsoid radii. A sphere-family object is canonically `{ kind: "sphere", radiiMm: [rx, ry, rz] }`; equal radii are a sphere and unequal radii are an ellipsoid. This avoids competing scale sources while retaining non-uniform object transforms.

Empty groups are restricted to uniform scale. That policy keeps ordinary child transforms representable as translation + rotation + scale when reparenting; operations that would require shear are rejected instead of silently changing geometry.

## Pivots and manipulation controls

Primitive pivots are their natural local origins. Imported or generated indexed meshes use their explicit local origin; Boolean results are recentered so the local origin is the center of their geometric axis-aligned bounds. The corresponding offset is stored as the object's local position under its retained parent (or at the scene root).

Transform gizmos are rendered at the root using the selected object's computed world matrix. They are not nested under a parent that would apply hierarchy transforms a second time. At commit, the target world matrix is converted back to local translation, rotation, and scale relative to the parent.

Primitive Shape-mode handles derive from canonical dimensions and bounds. Their visible size and transparent hit targets are kept usable independently of the edited dimension. Arbitrary Boolean meshes intentionally have no primitive face handles. Box-derived editable meshes may expose their declared editable corner indices.

## Hierarchy policy

Groups are transform-only Empty objects. Group creates an Empty at the average world pivot of the top-level selected objects and reparents them while preserving each world transform. Descendants of an already selected ancestor are not independently grouped. Ungroup reparents a group's direct children to its parent, preserving world transforms, then deletes the group; nested groups therefore remain intact until explicitly ungrouped. Empty groups may be deleted by Ungroup.

Reparenting validates parent existence, requires an Empty parent, prevents self-parenting and cycles, and commits atomically. Group duplication recursively copies its complete descendant subtree with new stable IDs and remapped parent references. Deleting a group through the editor deletes its subtree explicitly.

Boolean operands may be parented solids but may not themselves have children. A Boolean result retains a parent only when both operands share that same parent; otherwise it is placed at the scene root. Source hierarchy is never silently attached to an unrelated surviving object.

## Boolean solid pipeline

The stabilization pass replaced `three-bvh-csg` with `manifold-3d`. The earlier evaluator produced degenerate triangles for round primitives, required inconsistent attributes in chained meshes, and did not guarantee manifold output. The Manifold kernel accepts indexed positional meshes and produces closed manifold results for supported valid inputs.

Before evaluation, primitive or custom geometry is normalized, validated as watertight, and transformed once into world coordinates. Union, subtraction, or intersection runs in the Manifold WASM kernel. Output property-vertex seams are resolved with Manifold's explicit merge vectors rather than guessed positional welding; duplicate and truly degenerate faces are rejected or removed, closed topology is revalidated, and coordinates are converted into the chosen parent's space and recentered around the result pivot. Valid kernel sliver triangles are retained because deleting one would open an otherwise manifold result. Temporary WASM objects are explicitly released.

The canonical result stores indexed vertices and triangle connectivity, not triangle soup. It can be transformed, selected, grouped, serialized, reloaded, and used as a later Boolean operand. An empty Boolean result or invalid/open input produces a visible error and leaves the source scene untouched.

## Overlap diagnostics

Overlap work never runs during React rendering. A scene revision schedules a delayed analysis. World-space bounding boxes provide the broad phase; only a bounded number of candidate pairs receive exact positive-volume Manifold intersections. The UI distinguishes verified intersections, unverified candidates caused by the bound, and evaluator errors. Errors are surfaced and are never interpreted as proof of no overlap.

The current implementation is bounded and deferred on the browser thread, not worker-based. Moving exact analysis to a Web Worker is the next performance step if profiling of substantially larger scenes shows frame disruption.
