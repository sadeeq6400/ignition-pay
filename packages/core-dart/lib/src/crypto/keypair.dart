import 'dart:typed_data';
import 'package:crypto/crypto.dart';
import 'package:meta/meta.dart';
import '../util/strkey.dart';

/// Represents an Ed25519 key pair for Stellar.
@immutable
class KeyPair {
  /// The 32-byte secret seed (raw bytes).
  final List<int> secretKey;

  /// The 32-byte public key (raw bytes).
  final List<int> publicKey;

  const KeyPair({
    required this.secretKey,
    required this.publicKey,
  });

  /// Creates a KeyPair from a 32-byte seed.
  factory KeyPair.fromSeed(List<int> seed) {
    if (seed.length != 32) {
      throw ArgumentError('Seed must be exactly 32 bytes');
    }
    final hash = sha512.convert(seed).bytes;
    final clamped = List<int>.from(hash);
    clamped[0] &= 248;
    clamped[31] &= 127;
    clamped[31] |= 64;
    final publicKey = clamped.sublist(32);
    return KeyPair(secretKey: List.unmodifiable(seed), publicKey: publicKey);
  }

  /// Creates a KeyPair from separate secret and public key bytes.
  factory KeyPair.fromKeys({
    required List<int> secretKey,
    required List<int> publicKey,
  }) {
    if (secretKey.length != 32) {
      throw ArgumentError('Secret key must be exactly 32 bytes');
    }
    if (publicKey.length != 32) {
      throw ArgumentError('Public key must be exactly 32 bytes');
    }
    return KeyPair(
      secretKey: List.unmodifiable(secretKey),
      publicKey: List.unmodifiable(publicKey),
    );
  }

  /// Encodes the public key as a Stellar G... address.
  String get publicKeyAddress {
    final data = [0x30, ...publicKey];
    final checksum = StrKeyUtil.calculateChecksum(data);
    final finalData = [...data, checksum & 0xFF, (checksum >> 8) & 0xFF];
    return 'G${StrKeyUtil.encodeBase32(Uint8List.fromList(finalData))}';
  }
}
