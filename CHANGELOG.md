# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [v1.0.0] - 2026-03-22

First release of Toothbrush State Card. A custom Home Assistant (Lovelace) card displaying an SVG dental map divided into 8 zones.

### Added
- Initial release of Toothbrush State Card
- SVG dental map with 8 zones (upper/lower, left/right, inner/outer)
- Color interpolation from red (0 score) to white (100 score) for each zone
- Overall score display in the center of the card
- Last brushing date/time display below the diagram
- Optional zone value labels
- Visual UI editor in Home Assistant with entity pickers
- Full internationalization (i18n) support with English and Spanish translations
- Bilingual preview tool (`preview.html`) with language selector and editor mock
- Zone entity configuration per zone
- Responsive design with media queries for small screens
- MIT License
