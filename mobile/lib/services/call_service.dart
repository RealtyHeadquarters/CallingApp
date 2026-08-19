import 'package:call_log/call_log.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:shared_preferences/shared_preferences.dart';
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
      if (outcome.answerTime != null) 'callAnswerTime': outcome.answerTime!.toUtc().toIso8601String(),
      if (outcome.endTime != null) 'callEndTime': outcome.endTime!.toUtc().toIso8601String(),
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
      'callEndTime': DateTime.now().toUtc().toIso8601String(),
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

  static const _lastSyncKey = 'call_log_last_sync';
  // Prevents overlapping syncs (resume + phone-state CALL_ENDED can both fire),
  // which would otherwise race the backend dedup and create duplicate rows.
  static bool _syncing = false;

  /// Read the device call log since the last sync and push new INCOMING calls to
  /// the backend — that is how incoming calls become CRM activities in the SIM
  /// model (they have no app-initiated step). OUTGOING calls are already recorded
  /// by the dial → complete flow, so we skip them here to avoid double-logging.
  /// Idempotent: the backend dedupes and we advance a watermark.
  Future<int> syncCallLog() async {
    if (_syncing) return 0;
    _syncing = true;
    try {
      final prefs = await SharedPreferences.getInstance();
      final lastSync = prefs.getInt(_lastSyncKey);
      // First run: look back 24h. Otherwise since last sync (minus a small overlap).
      final from = lastSync != null
          ? lastSync - 5 * 60 * 1000
          : DateTime.now().subtract(const Duration(hours: 24)).millisecondsSinceEpoch;

      final Iterable<CallLogEntry> entries = await CallLog.query(dateFrom: from);
      final list = entries
          .where((e) => (e.number ?? '').isNotEmpty)
          .map(_mapEntry)
          .where((m) => m['direction'] == 'INCOMING')
          .toList();
      if (list.isEmpty) {
        await prefs.setInt(_lastSyncKey, DateTime.now().millisecondsSinceEpoch);
        return 0;
      }
      final res = await _api.dio.post('/calls/sync', data: {'entries': list});
      await prefs.setInt(_lastSyncKey, DateTime.now().millisecondsSinceEpoch);
      return (res.data['created'] as int?) ?? 0;
    } catch (_) {
      return 0; // best-effort; never blocks the UI
    } finally {
      _syncing = false;
    }
  }

  Map<String, dynamic> _mapEntry(CallLogEntry e) {
    final duration = e.duration ?? 0;
    String direction;
    String status;
    switch (e.callType) {
      case CallType.incoming:
      case CallType.wifiIncoming:
        direction = 'INCOMING';
        status = duration > 0 ? 'ANSWERED' : 'NO_ANSWER';
        break;
      case CallType.missed:
        direction = 'INCOMING';
        status = 'NO_ANSWER';
        break;
      case CallType.rejected:
      case CallType.blocked:
        direction = 'INCOMING';
        status = 'REJECTED';
        break;
      default: // outgoing / wifiOutgoing / unknown
        direction = 'OUTGOING';
        status = duration > 0 ? 'ANSWERED' : 'NO_ANSWER';
    }
    return {
      'phoneNumber': e.number,
      'direction': direction,
      'callStatus': status,
      // Absolute UTC instant — epoch ms is timezone-independent; .toUtc() ensures
      // the ISO string carries 'Z' so the server stores the correct time.
      'callStartTime': DateTime.fromMillisecondsSinceEpoch(e.timestamp ?? 0).toUtc().toIso8601String(),
      'durationSeconds': status == 'ANSWERED' ? duration : 0,
    };
  }

  /// Record an INCOMING call (after the agent classifies it as "Office").
  /// Returns the created call { id, callId, ... } so the disposition/remark
  /// screen can open for it.
  Future<Map<String, dynamic>> logIncoming({
    required String phoneNumber,
    required String callStatus,
    required int durationSeconds,
    DateTime? startTime,
    String? clientId,
  }) async {
    final answered = callStatus == 'ANSWERED';
    final res = await _api.dio.post('/calls/log', data: {
      'phoneNumber': phoneNumber,
      'direction': 'INCOMING',
      'callStatus': callStatus,
      'durationSeconds': answered ? durationSeconds : 0,
      if (startTime != null) 'callStartTime': startTime.toUtc().toIso8601String(),
      if (clientId != null) 'clientId': clientId,
    });
    return res.data['call'] as Map<String, dynamic>;
  }

  static const _incomingWatermarkKey = 'incoming_classify_watermark';

  /// New INCOMING calls from the device call log that the agent hasn't yet
  /// classified (Personal/Office). Reads from a watermark so we never re-ask.
  /// This is reliable on MIUI/HyperOS where real-time phone-state events don't
  /// fire in the background — the log is read whenever the app is opened.
  Future<List<Map<String, dynamic>>> fetchNewIncoming() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      int? wm = prefs.getInt(_incomingWatermarkKey);
      if (wm == null) {
        // First run: start from now so we don't flood with call history.
        await prefs.setInt(_incomingWatermarkKey, DateTime.now().millisecondsSinceEpoch);
        return [];
      }
      final Iterable<CallLogEntry> entries = await CallLog.query(dateFrom: wm + 1);
      final incoming = entries.where((e) {
        final t = e.callType;
        final isIncoming = t == CallType.incoming ||
            t == CallType.wifiIncoming ||
            t == CallType.missed ||
            t == CallType.rejected ||
            t == CallType.blocked;
        return isIncoming && (e.number ?? '').isNotEmpty && (e.timestamp ?? 0) > wm;
      }).toList()
        ..sort((a, b) => (a.timestamp ?? 0).compareTo(b.timestamp ?? 0)); // oldest first

      return incoming.map((e) {
        final duration = e.duration ?? 0;
        String status;
        switch (e.callType) {
          case CallType.missed:
            status = 'NO_ANSWER';
            break;
          case CallType.rejected:
          case CallType.blocked:
            status = 'REJECTED';
            break;
          default:
            status = duration > 0 ? 'ANSWERED' : 'NO_ANSWER';
        }
        return {
          'number': e.number,
          'startMs': e.timestamp ?? 0,
          'callStatus': status,
          'durationSeconds': status == 'ANSWERED' ? duration : 0,
        };
      }).toList();
    } catch (_) {
      return [];
    }
  }

  /// Mark an incoming call as classified so it isn't asked about again.
  Future<void> markIncomingClassified(int startMs) async {
    final prefs = await SharedPreferences.getInstance();
    final cur = prefs.getInt(_incomingWatermarkKey) ?? 0;
    if (startMs > cur) await prefs.setInt(_incomingWatermarkKey, startMs);
  }

  /// Look up a client by phone number (used for the incoming caller screen).
  Future<Map<String, dynamic>?> lookup(String phoneNumber) async {
    try {
      final res = await _api.dio.get('/leads/lookup', queryParameters: {'number': phoneNumber});
      return res.data['found'] == true ? res.data['client'] as Map<String, dynamic> : null;
    } catch (_) {
      return null;
    }
  }
}
