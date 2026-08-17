import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

/// A call that has been initiated (record created + dialer launched) but whose
/// outcome/disposition hasn't been saved yet. Persisted to disk so the flow
/// survives the app being killed during the call (common on MIUI/HyperOS).
class PendingCall {
  final String callDbId;
  final String phoneNumber;
  final String? clientId;
  final DateTime start;

  PendingCall({
    required this.callDbId,
    required this.phoneNumber,
    required this.start,
    this.clientId,
  });

  Map<String, dynamic> toJson() => {
        'callDbId': callDbId,
        'phoneNumber': phoneNumber,
        'clientId': clientId,
        'start': start.toIso8601String(),
      };

  factory PendingCall.fromJson(Map<String, dynamic> j) => PendingCall(
        callDbId: j['callDbId'],
        phoneNumber: j['phoneNumber'],
        clientId: j['clientId'],
        start: DateTime.tryParse(j['start'] ?? '') ?? DateTime.now(),
      );
}

class PendingCallStore {
  static const _key = 'pending_call';

  static Future<void> save(PendingCall c) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, jsonEncode(c.toJson()));
  }

  static Future<PendingCall?> get() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_key);
    if (raw == null) return null;
    try {
      return PendingCall.fromJson(jsonDecode(raw));
    } catch (_) {
      return null;
    }
  }

  static Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_key);
  }
}
