import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../services/api_client.dart';
import '../services/call_service.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';

const _dispositions = [
  'INTERESTED', 'NOT_INTERESTED', 'FOLLOW_UP_REQUIRED', 'CALL_BACK_LATER',
  'MEETING_REQUIRED', 'PRICE_DISCUSSION', 'DETAILS_SHARED', 'CONVERTED',
  'WRONG_NUMBER', 'BUSY', 'NO_RESPONSE', 'OTHER',
];

const _callStatuses = ['ANSWERED', 'NO_ANSWER', 'BUSY', 'REJECTED', 'FAILED'];

class DispositionScreen extends StatefulWidget {
  final String callDbId;
  final String? clientId;
  final String phoneNumber;
  final CallOutcome? outcome;

  const DispositionScreen({
    super.key,
    required this.callDbId,
    required this.phoneNumber,
    this.clientId,
    this.outcome,
  });

  @override
  State<DispositionScreen> createState() => _DispositionScreenState();
}

class _DispositionScreenState extends State<DispositionScreen> {
  final _call = CallService();
  final _remark = TextEditingController();
  final _customerName = TextEditingController();
  String _disposition = 'INTERESTED';
  late String _callStatus;
  // Duration comes ONLY from the device call log — never editable (so talk time
  // stays trustworthy and can't be inflated).
  late final int _capturedDuration;
  bool _scheduleFollowUp = false;
  String? _quick; // quick option key
  DateTime? _customTime;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _callStatus = widget.outcome?.callStatus ?? 'ANSWERED';
    _capturedDuration = widget.outcome?.durationSeconds ?? 0;
  }

  @override
  void dispose() {
    _remark.dispose();
    _customerName.dispose();
    super.dispose();
  }

  String get _durationLabel {
    final s = _capturedDuration;
    final m = (s ~/ 60).toString().padLeft(2, '0');
    final sec = (s % 60).toString().padLeft(2, '0');
    return '$m:$sec';
  }

  Future<void> _submit() async {
    if (_remark.text.trim().isEmpty) {
      setState(() => _error = 'A remark is required.');
      return;
    }
    setState(() { _busy = true; _error = null; });
    try {
      debugPrint('[Disposition] submit: call=${widget.callDbId} status=$_callStatus dur=$_capturedDuration disp=$_disposition');
      // 1) Save the call outcome — duration is the auto-captured value (read-only).
      await _call.completeManual(
        widget.callDbId,
        callStatus: _callStatus,
        durationSeconds: _capturedDuration,
      );
      debugPrint('[Disposition] complete OK');
      // 2) Save disposition + mandatory remark + optional customer name.
      await _call.submitDisposition(
        widget.callDbId,
        disposition: _disposition,
        remark: _remark.text.trim(),
        customerName: _customerName.text.trim().isEmpty ? null : _customerName.text.trim(),
      );
      debugPrint('[Disposition] disposition OK');
      if (_scheduleFollowUp && widget.clientId != null) {
        await ApiClient.instance.dio.post('/follow-ups', data: {
          'clientId': widget.clientId,
          'callId': widget.callDbId,
          'followupType': 'CALL',
          if (_customTime != null) 'followupAt': _customTime!.toUtc().toIso8601String(),
          if (_customTime == null && _quick != null) 'quick': _quick,
          'note': _remark.text.trim(),
        });
      }
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      setState(() => _error = apiErrorMessage(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final o = widget.outcome;
    final answered = _callStatus == 'ANSWERED';
    return Scaffold(
      appBar: AppBar(title: const Text('Call Completed')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Outcome header
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  const Icon(Icons.phone_in_talk, color: AppColors.brand),
                  const SizedBox(width: 10),
                  Expanded(child: Text(widget.phoneNumber, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16))),
                  Text(
                    o == null ? 'Confirm below' : 'Auto-captured',
                    style: const TextStyle(color: AppColors.text3, fontSize: 12),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 20),

          // Call status + duration. Status can be confirmed; duration is
          // read-only (auto-captured from the call log — cannot be edited).
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                flex: 3,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Call Status', style: TextStyle(fontWeight: FontWeight.w600)),
                    const SizedBox(height: 8),
                    DropdownButtonFormField<String>(
                      initialValue: _callStatus,
                      items: _callStatuses.map((s) => DropdownMenuItem(value: s, child: Text(titleCase(s)))).toList(),
                      onChanged: (v) => setState(() => _callStatus = v!),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                flex: 2,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Talk Time', style: TextStyle(fontWeight: FontWeight.w600)),
                    const SizedBox(height: 8),
                    Container(
                      height: 48,
                      alignment: Alignment.centerLeft,
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      decoration: BoxDecoration(
                        color: const Color(0xFFEEF0F5),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.lock_outline, size: 15, color: AppColors.text3),
                          const SizedBox(width: 6),
                          Text(answered ? _durationLabel : '00:00',
                              style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),

          // Customer name — names an unknown number and creates/links a CRM lead.
          const Text('Customer Name', style: TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          TextField(
            controller: _customerName,
            textCapitalization: TextCapitalization.words,
            decoration: const InputDecoration(hintText: 'e.g. Rahul Sharma'),
          ),
          const SizedBox(height: 16),

          const Text('Call Disposition', style: TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          DropdownButtonFormField<String>(
            initialValue: _disposition,
            items: _dispositions
                .map((d) => DropdownMenuItem(value: d, child: Text(titleCase(d))))
                .toList(),
            onChanged: (v) => setState(() => _disposition = v!),
          ),
          const SizedBox(height: 16),

          const Text('Call Remark *', style: TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          TextField(
            controller: _remark,
            maxLines: 3,
            decoration: const InputDecoration(hintText: 'What was discussed?'),
          ),
          const SizedBox(height: 16),

          if (widget.clientId != null) ...[
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Schedule a follow-up'),
              value: _scheduleFollowUp,
              onChanged: (v) => setState(() => _scheduleFollowUp = v),
            ),
            if (_scheduleFollowUp) _followUpPicker(),
          ],

          if (_error != null) Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Text(_error!, style: const TextStyle(color: AppColors.red)),
          ),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: _busy ? null : _submit,
            child: _busy
                ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Text('Submit & Continue'),
          ),
        ],
      ),
    );
  }

  Widget _followUpPicker() {
    const quick = {
      '1hour': 'In 1 hour', 'today': 'Today', 'tomorrow': 'Tomorrow',
      '2days': 'After 2 days', 'nextweek': 'Next week',
    };
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: 8,
          children: quick.entries.map((e) {
            final selected = _quick == e.key && _customTime == null;
            return ChoiceChip(
              label: Text(e.value),
              selected: selected,
              onSelected: (_) => setState(() { _quick = e.key; _customTime = null; }),
            );
          }).toList(),
        ),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          icon: const Icon(Icons.calendar_today, size: 16),
          label: Text(_customTime == null
              ? 'Custom date & time'
              : DateFormat('dd MMM, hh:mm a').format(_customTime!)),
          onPressed: _pickCustom,
        ),
      ],
    );
  }

  Future<void> _pickCustom() async {
    final now = DateTime.now();
    final date = await showDatePicker(
      context: context,
      firstDate: now,
      lastDate: now.add(const Duration(days: 365)),
      initialDate: now,
    );
    if (date == null || !mounted) return;
    final time = await showTimePicker(context: context, initialTime: TimeOfDay.now());
    if (time == null) return;
    setState(() {
      _customTime = DateTime(date.year, date.month, date.day, time.hour, time.minute);
      _quick = null;
    });
  }
}
