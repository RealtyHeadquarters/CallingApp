import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../models/models.dart';
import '../services/api_client.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';

class CallHistoryScreen extends StatefulWidget {
  const CallHistoryScreen({super.key});

  @override
  State<CallHistoryScreen> createState() => _CallHistoryScreenState();
}

class _CallHistoryScreenState extends State<CallHistoryScreen> {
  List<CallRecord> _calls = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final res = await ApiClient.instance.dio.get('/calls', queryParameters: {'pageSize': 50});
      final rows = (res.data['data'] as List).map((e) => CallRecord.fromJson(e)).toList();
      if (mounted) setState(() { _calls = rows; _loading = false; });
    } catch (e) {
      if (mounted) setState(() { _error = apiErrorMessage(e); _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) return Center(child: Text(_error!));
    if (_calls.isEmpty) return const Center(child: Text('No calls yet.'));

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.separated(
        itemCount: _calls.length,
        separatorBuilder: (_, __) => const Divider(height: 1),
        itemBuilder: (_, i) {
          final c = _calls[i];
          final answered = c.callStatus == 'ANSWERED';
          return ListTile(
            leading: CircleAvatar(
              backgroundColor: (answered ? AppColors.green : AppColors.red).withValues(alpha: 0.12),
              child: Icon(
                answered ? Icons.call_received : Icons.call_missed,
                color: answered ? AppColors.green : AppColors.red,
                size: 20,
              ),
            ),
            title: Text(c.clientName ?? c.phoneNumber, style: const TextStyle(fontWeight: FontWeight.w600)),
            subtitle: Text(
              '${DateFormat('dd MMM, hh:mm a').format(c.createdAt)} · ${c.durationFormatted}'
              '${c.remark != null ? '\n${c.remark}' : ''}',
            ),
            isThreeLine: c.remark != null,
            trailing: StatusBadge(c.callStatus ?? 'CANCELLED'),
          );
        },
      ),
    );
  }
}
