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
  String _disposition = 'INTERESTED';
  bool _scheduleFollowUp = false;
  String? _quick; // quick option key
  DateTime? _customTime;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _remark.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_remark.text.trim().isEmpty) {
      setState(() => _error = 'A remark is required.');
      return;
    }
    setState(() { _busy = true; _error = null; });
    try {
      await _call.submitDisposition(
        widget.callDbId,
        disposition: _disposition,
        remark: _remark.text.trim(),
      );
      if (_scheduleFollowUp && widget.clientId != null) {
        await ApiClient.instance.dio.post('/follow-ups', data: {
          'clientId': widget.clientId,
          'callId': widget.callDbId,
          'followupType': 'CALL',
          if (_customTime != null) 'followupAt': _customTime!.toIso8601String(),
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
    return Scaffold(
      appBar: AppBar(title: const Text('Call Completed')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Outcome summary
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(widget.phoneNumber, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                      const SizedBox(height: 4),
                      Text(
                        o == null
                            ? 'Outcome not captured automatically'
                            : 'Duration: ${_fmt(o.durationSeconds)}',
                        style: const TextStyle(color: AppColors.text2),
                      ),
                    ],
                  ),
                  StatusBadge(o?.callStatus ?? 'NO_ANSWER'),
                ],
              ),
            ),
          ),
          const SizedBox(height: 20),

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

  String _fmt(int s) {
    final m = (s ~/ 60).toString().padLeft(2, '0');
    final sec = (s % 60).toString().padLeft(2, '0');
    return '$m:$sec';
  }
}
