# World-space UI rules — v1

Applies to labels, speech bubbles, interaction prompts, and markers attached to 3D objects.

1. **World anchor**: derive screen position from the target object's current world coordinates, not the player's position or a fixed viewport offset.
2. **Proximity**: show only within a feature-defined distance; hide immediately outside the threshold.
3. **Occlusion**: hide when opaque world geometry blocks the line of sight from the camera to the target. Exclude only deliberately non-occluding surfaces/effects.
4. **Avatar overlap**: do not cover the local avatar's head or critical interaction controls.
5. **Viewport bounds**: hide when clipped or behind the camera; never pin a disappearing world label to a screen edge.
6. **Overview mode**: hide gameplay world labels and markers unless explicitly designed for overview.
7. **Responsive behavior**: test desktop and mobile viewport sizes.
8. **No duplicates**: one authoritative label per target and purpose; clean up on state changes.

## Minimum regression scenarios
- Approach target: label appears at the correct world position.
- Move away: label disappears.
- Orbit camera: label remains anchored to target, not avatar.
- Put opaque ship geometry between camera and target: label disappears.
- Move avatar into label screen region: label avoids covering avatar.
- Toggle overview: gameplay labels disappear.
- Switch targets/modes: stale inline CSS coordinates do not persist.

Tests must verify behavior in a running browser; source review alone is not a pass.
