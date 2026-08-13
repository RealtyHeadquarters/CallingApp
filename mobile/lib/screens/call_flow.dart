import 'package:flutter/material.dart';
import '../services/api_client.dart';
import '../services/call_service.dart';
import 'disposition_screen.dart';

/// Shared SIM-call orchestration (spec §8/§18): request permissions, create the
/// backend record, place the call via the native dialer, then — when the user
/// returns to the app — capture the outcome from the device call log and open
/// the disposition/remark flow.
///
/// Host must:
///   1. mix in `WidgetsBindingObserver` too,
///   2. add/remove `this` as an observer in initState/dispose,
///   3. forward `didChangeAppLifecycleState` to [handleCallResume].
mixin CallFlowMixin<T extends StatefulWidget> on State<T> {
  final CallService callService = CallService();

  String? _pendingCallId;
  String? _pendingNumber;
  String? _pendingClientId;
  DateTime? _pendingStart;
  bool callFlowBusy = false;

  /// Override to reset host UI after a completed call flow.
  void onCallFlowDone() {}

  void handleCallResume(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && _pendingCallId != null) {
      _finishPendingCall();
    }
  }

  Future<void> startCallFlow(String number, {String? clientId}) async {
    if (number.isEmpty || callFlowBusy) return;
    setState(() => callFlowBusy = true);
    try {
      final granted = await callService.ensurePermissions();
      if (!granted) {
        _snack('Phone permission is required to place and track calls.');
        return;
      }
      final start = DateTime.now();
      final created = await callService.initiate(number, clientId: clientId);
      _pendingCallId = created['id'];
      _pendingNumber = number;
      _pendingClientId = clientId;
      _pendingStart = start;
      await callService.placeCall(number);
    } catch (e) {
      _snack(apiErrorMessage(e));
      _pendingCallId = null;
    } finally {
      if (mounted) setState(() => callFlowBusy = false);
    }
  }

  Future<void> _finishPendingCall() async {
    final callId = _pendingCallId!;
    final number = _pendingNumber!;
    final clientId = _pendingClientId;
    final start = _pendingStart!;
    _pendingCallId = null; // consume once

    CallOutcome? outcome;
    try {
      outcome = await callService.captureFromCallLog(number, start);
      if (outcome != null) await callService.complete(callId, outcome);
    } catch (_) {/* fall through to manual entry */}

    if (!mounted) return;
    await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => DispositionScreen(
          callDbId: callId,
          clientId: clientId,
          phoneNumber: number,
          outcome: outcome,
        ),
      ),
    );
    if (mounted) onCallFlowDone();
  }

  void _snack(String m) {
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));
  }
}
