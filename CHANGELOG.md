# Changelog

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
