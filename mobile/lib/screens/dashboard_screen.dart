import 'package:flutter/material.dart';
import '../models/models.dart';
import '../services/api_client.dart';
import '../widgets/common.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  AgentDashboard? _data;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final res = await ApiClient.instance.dio.get('/dashboard/agent');
      if (mounted) setState(() => _data = AgentDashboard.fromJson(res.data));
    } catch (e) {
      if (mounted) setState(() => _error = apiErrorMessage(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_error != null) {
      return _ErrorRetry(message: _error!, onRetry: () { setState(() => _error = null); _load(); });
    }
    if (_data == null) return const Center(child: CircularProgressIndicator());

    final k = _data!.kpis;
    return RefreshIndicator(
      onRefresh: _load,
      child: GridView.count(
        crossAxisCount: 2,
        padding: const EdgeInsets.all(16),
        childAspectRatio: 1.5,
        mainAxisSpacing: 12,
        crossAxisSpacing: 12,
        children: [
          KpiCard(label: 'Total Calls', value: '${k.totalCalls}', icon: Icons.call),
          KpiCard(label: 'Answered', value: '${k.answeredCalls}', icon: Icons.call_received),
          KpiCard(label: 'Unanswered', value: '${k.unansweredCalls}', icon: Icons.call_missed),
          KpiCard(label: 'Answer Rate', value: '${k.answerRate}%', accent: true, icon: Icons.trending_up),
          KpiCard(label: 'Talk Time', value: k.totalTalkTime, icon: Icons.timer_outlined),
          KpiCard(label: 'Avg Talk Time', value: k.avgTalkTime, icon: Icons.schedule),
          KpiCard(label: "Today's Follow-ups", value: '${_data!.followUpsToday}', icon: Icons.notifications_none),
          KpiCard(label: 'Pending Follow-ups', value: '${_data!.followUpsPending}', icon: Icons.hourglass_empty),
        ],
      ),
    );
  }
}

class _ErrorRetry extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const _ErrorRetry({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(message, textAlign: TextAlign.center),
          const SizedBox(height: 12),
          OutlinedButton(onPressed: onRetry, child: const Text('Retry')),
        ],
      ),
    );
  }
}
