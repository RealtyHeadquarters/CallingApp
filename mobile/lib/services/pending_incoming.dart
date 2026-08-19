import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

/// An incoming call that ended but hasn't been classified yet (Personal vs
/// Office). Persisted so the classify popup survives the app being killed
/// mid-call (common on MIUI) — it's shown again on next app open.
class PendingIncoming {
  final String number;
  final DateTime start;

  PendingIncoming({required this.number, required this.start});

  Map<String, dynamic> toJson() => {'number': number, 'start': start.toIso8601String()};

  factory PendingIncoming.fromJson(Map<String, dynamic> j) => PendingIncoming(
        number: j['number'],
        start: DateTime.tryParse(j['start'] ?? '') ?? DateTime.now(),
      );
}

class PendingIncomingStore {
  static const _key = 'pending_incoming';

  static Future<void> save(PendingIncoming p) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, jsonEncode(p.toJson()));
  }

  static Future<PendingIncoming?> get() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_key);
    if (raw == null) return null;
    try {
      return PendingIncoming.fromJson(jsonDecode(raw));
    } catch (_) {
      return null;
    }
  }

  static Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_key);
  }
}
