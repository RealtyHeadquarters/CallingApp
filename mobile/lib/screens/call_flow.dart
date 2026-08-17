import 'package:flutter/material.dart';
import '../services/api_client.dart';
import '../services/call_service.dart';
import '../services/pending_call.dart';
import 'disposition_screen.dart';

/// Shared SIM-call orchestration (spec §8/§18): request permissions, create the
/// backend record, persist a "pending call" to disk, then place the call via the
/// native dialer. When the app comes back — on resume OR on next startup (the app
/// is often killed mid-call on MIUI/HyperOS) — the pending call is reconciled and
/// the disposition/remark screen opens.
///
/// Host must mix in `WidgetsBindingObserver`, register/unregister as an observer,
/// and forward `didChangeAppLifecycleState` to [handleCallResume].
mixin CallFlowMixin<T extends StatefulWidget> on State<T> {
  final CallService callService = CallService();
  bool callFlowBusy = false;

  /// Override to reset host UI after a completed call flow.
  void onCallFlowDone() {}

  void handleCallResume(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      completePendingCall(context).then((done) {
        if (done && mounted) onCallFlowDone();
      });
    }
  }

  Future<void> startCallFlow(String number, {String? clientId}) async {
    if (number.isEmpty || callFlowBusy) return;
    setState(() => callFlowBusy = true);
    try {
      final granted = await callService.ensurePermissions();
      if (!granted) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Phone permission is required to place and track calls.')),
          );
        }
        return;
      }
      final start = DateTime.now();
      final created = await callService.initiate(number, clientId: clientId);
      // Persist BEFORE dialing so a mid-call app kill doesn't lose it.
      await PendingCallStore.save(PendingCall(
        callDbId: created['id'],
        phoneNumber: number,
        clientId: clientId,
        start: start,
      ));
      debugPrint('[CallFlow] initiated + pending saved: ${created['id']} -> $number');
      await callService.placeCall(number);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(apiErrorMessage(e))));
      }
    } finally {
      if (mounted) setState(() => callFlowBusy = false);
    }
  }
}

// Re-entrancy guard so resume + startup don't both open the screen.
bool _reconciling = false;

/// If a pending call exists, best-effort capture its outcome from the device call
/// log, then open the disposition/remark screen. Returns true if one was handled.
/// Safe to call from anywhere (resume, startup); no-op if nothing is pending.
Future<bool> completePendingCall(BuildContext context) async {
  if (_reconciling) return false;
  final pending = await PendingCallStore.get();
  if (pending == null) {
    debugPrint('[CallFlow] reconcile: no pending call');
    return false;
  }

  _reconciling = true;
  try {
    debugPrint('[CallFlow] reconcile: opening disposition for ${pending.callDbId}');
    final call = CallService();
    CallOutcome? outcome;
    try {
      outcome = await call.captureFromCallLog(pending.phoneNumber, pending.start);
      debugPrint('[CallFlow] call-log capture: ${outcome?.callStatus} ${outcome?.durationSeconds}s');
    } catch (e) {
      debugPrint('[CallFlow] call-log capture failed (manual entry): $e');
    }

    if (!context.mounted) return false;
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => DispositionScreen(
          callDbId: pending.callDbId,
          clientId: pending.clientId,
          phoneNumber: pending.phoneNumber,
          outcome: outcome,
        ),
      ),
    );
    // Clear regardless of submit/cancel so it doesn't nag on every app open.
    await PendingCallStore.clear();
    return true;
  } finally {
    _reconciling = false;
  }
}
