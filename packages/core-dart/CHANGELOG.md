# Changelog

## 1.0.1

- Added `toJson`/`fromJson` serialization methods to `StellarAddress`,
  `DecodedMuxedAddress`, `RoutingResult`, `RoutingInput`, `RoutingWarning`,
  and `DestinationError`.
- Added pub.dev package metadata (homepage, documentation, issue tracker).
- Added `publish-dart` GitHub Actions workflow for automated pub.dev releases.
- Added development environment configuration (`.vscode/`, `.gitignore`, `.env.example`).

## 1.0.0

- Initial release of the Stellar Address Kit for Dart and Flutter.
- Support for G, M, and C address detection and validation.
- Support for SEP-0023 Muxed Address encoding and decoding.
- Routing extraction logic for reconciling incoming payments.
