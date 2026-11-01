# Changelog

## 0.0.12
- Added scenario-based decision path diagrams for pipeline conditions, with input suggestions derived from parameter defaults and values referenced by conditions.
- Added a Mermaid preview for expanded local-template pipelines and explicitly reported expressions that need Azure runtime context.
- Expanded `extends` templates into the unified pipeline root and covered conditional stage, job, and step template inlining.
- Rebuilt scanner caches when scan settings change, persisted file signatures, and applied `minDepth` to the displayed reference tree.
- Bundled the extension into a single runtime JavaScript file and excluded development/build files from the VSIX to reduce package size and improve startup performance.
- Updated the VS Code extension packaging tool (`@vscode/vsce`).

## 0.0.11
- Added a YAML Controls view with editor folding, structure tree, validation, conditions, and parameter display actions.
- Moved those controls from the YAML Structure toolbar into the dedicated view.

## 0.0.10
- Restored the Template Explorer view in the YAML Inspector panel.
- Added a panel action to recursively expand local templates into an editable YAML document, substituting simple parameter references.
- Kept Azure compile-time `if` and `each` expressions unchanged in expanded output.

## 0.0.9
- Fixed expand/collapse controls so they update the YAML Structure tree.

## 0.0.8
- Set parameter icons to the theme’s default foreground color.
- Moved YAML Structure into a dedicated YAML Inspector panel and added a Validate YAML action.
- Added panel toolbar toggles for conditions and stage, job, and step parameters.
- Added separate panel controls to expand/collapse the structure tree and fold/unfold the active YAML editor.
- Added stage, job, and step condition examples to pipeline fixtures.
- Removed the duplicate “Find Template References” editor-title button.

## 0.0.7
- Display template reference paths relative to their highest shared directory.
- Color stage, job, and step icons by type, distinguishing templates from concrete entries.
- Use directional arrow icons for “Referenced by” and “References”.

## 0.0.6
- Flattened jobs and steps in the outline; added distinct icons for concrete and template entries.
- Showed step names with display names and reference paths relative to the active file.
- Hid YAML document-separator groups.

## 0.0.5
- Improved stage/job/step labels, duplicate numbering, and task-type fallbacks.
- Split references into “Referenced by” and “References”.

## 0.0.4
- Added the dockable YAML Structure view with clickable navigation and configurable conditions/parameters.
- Added editor collapse/expand commands and ESLint configuration.

## 0.0.3
- Added navigation from a template to files that reference it.
- Made scanning and validation YAML-generic, avoiding pipeline-specific assumptions and false positives.

## 0.0.2
- Added Ctrl+click navigation for local template paths.
- Improved template scanning, cache invalidation, and Explorer navigation; removed the webview inspector panel.
- Refined validation and added scanner tests.

## 0.0.1
- Initial release: YAML validation, template scanning, caching, and template navigation.
