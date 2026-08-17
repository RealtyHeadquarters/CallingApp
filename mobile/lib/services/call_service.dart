import 'package:call_log/call_log.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:url_launcher/url_launcher.dart';
import 'api_client.dart';

/// Outcome captured from the device call log after a SIM call (spec §10/§11).
class CallOutcome {
  final String callStatus; // ANSWERED | NO_ANSWER | REJECTED | FAILED
  final int durationSeconds;
  final DateTime? answerTime;
  final DateTime? endTime;

  CallOutcome({
    required this.callStatus,
    required this.durationSeconds,
    this.answerTime,
    this.endTime,
  });
}

/// Implements the RUNO-style SIM calling flow: place the call through the
/// device's native dialer, then read the device Call Log to capture the real
/// status and duration. No calls are simulated.
class CallService {
  final _api = ApiClient.instance;

  /// Create the backend call record and return { id, callId }.
  Future<Map<String, dynamic>> initiate(String phoneNumber, {String? clientId}) async {
    final res = await _api.dio.post('/calls', data: {
      'phoneNumber': phoneNumber,
      if (clientId != null) 'clientId': clientId,
    });
    return res.data['call'];
  }

  /// Place the actual call using the device SIM via the native dialer.
  Future<bool> placeCall(String phoneNumber) async {
    final uri = Uri(scheme: 'tel', path: phoneNumber);
    if (await canLaunchUrl(uri)) {
      return launchUrl(uri, mode: LaunchMode.externalApplication);
    }
    return false;
  }

  /// Ask for the permissions needed to place calls and read the call log.
  Future<bool> ensurePermissions() async {
    final statuses = await [Permission.phone].request();
    return statuses.values.every((s) => s.isGranted || s.isLimited);
  }

  /// Read the device call log for the most recent call to [phoneNumber] that
  /// started at or after [since], and map it to a [CallOutcome].
  Future<CallOutcome?> captureFromCallLog(String phoneNumber, DateTime since) async {
    final digits = _digits(phoneNumber);
    final Iterable<CallLogEntry> entries = await CallLog.query(
      dateFrom: since.subtract(const Duration(seconds: 5)).millisecondsSinceEpoch,
    );

    CallLogEntry? match;
    for (final e in entries) {
      final n = _digits(e.number ?? e.formattedNumber ?? '');
      if (n.isNotEmpty && (n.endsWith(digits) || digits.endsWith(n))) {
        match = e;
        break; // query() returns newest-first
      }
    }
    if (match == null) return null;

    final duration = match.duration ?? 0;
    final ts = match.timestamp != null
        ? DateTime.fromMillisecondsSinceEpoch(match.timestamp!)
        : since;

    String status;
    switch (match.callType) {
      case CallType.rejected:
      case CallType.blocked:
        status = 'REJECTED';
        break;
      case CallType.missed:
        status = 'NO_ANSWER';
        break;
      default:
        status = duration > 0 ? 'ANSWERED' : 'NO_ANSWER';
    }

    return CallOutcome(
      callStatus: status,
      durationSeconds: status == 'ANSWERED' ? duration : 0,
      answerTime: status == 'ANSWERED' ? ts : null,
      endTime: ts.add(Duration(seconds: duration)),
    );
  }

  /// Persist the captured outcome (spec §10).
  Future<void> complete(String callDbId, CallOutcome outcome) async {
    await _api.dio.patch('/calls/$callDbId/complete', data: {
      'callStatus': outcome.callStatus,
      'durationSeconds': outcome.durationSeconds,
      if (outcome.answerTime != null) 'callAnswerTime': outcome.answerTime!.toIso8601String(),
      if (outcome.endTime != null) 'callEndTime': outcome.endTime!.toIso8601String(),
    });
  }

  /// Persist a manually-entered/confirmed outcome (fallback when the device
  /// call log can't be read — permissions or OEM restrictions).
  Future<void> completeManual(
    String callDbId, {
    required String callStatus,
    required int durationSeconds,
  }) async {
    final answered = callStatus == 'ANSWERED';
    await _api.dio.patch('/calls/$callDbId/complete', data: {
      'callStatus': callStatus,
      'durationSeconds': answered ? durationSeconds : 0,
      'callEndTime': DateTime.now().toIso8601String(),
    });
  }

  /// Submit the mandatory disposition + remark + optional customer name (spec §14/§15).
  Future<void> submitDisposition(
    String callDbId, {
    required String disposition,
    required String remark,
    String? customerName,
    String? leadStatus,
  }) async {
    await _api.dio.patch('/calls/$callDbId/disposition', data: {
      'disposition': disposition,
      'remark': remark,
      if (customerName != null) 'customerName': customerName,
      if (leadStatus != null) 'leadStatus': leadStatus,
    });
  }

  String _digits(String s) => s.replaceAll(RegExp(r'\D'), '');
}
