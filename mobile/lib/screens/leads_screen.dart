import 'package:flutter/material.dart';
import '../models/models.dart';
import '../services/api_client.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';
import 'call_flow.dart';

class LeadsScreen extends StatefulWidget {
  const LeadsScreen({super.key});

  @override
  State<LeadsScreen> createState() => _LeadsScreenState();
}

class _LeadsScreenState extends State<LeadsScreen>
    with WidgetsBindingObserver, CallFlowMixin<LeadsScreen> {
  List<Lead> _leads = [];
  bool _loading = true;
  String? _error;
  String _search = '';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _load();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) => handleCallResume(state);

  @override
  void onCallFlowDone() => _load();

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final res = await ApiClient.instance.dio.get('/leads', queryParameters: {
        'pageSize': 50,
        if (_search.isNotEmpty) 'search': _search,
      });
      final rows = (res.data['data'] as List).map((e) => Lead.fromJson(e)).toList();
      if (mounted) setState(() { _leads = rows; _loading = false; });
    } catch (e) {
      if (mounted) setState(() { _error = apiErrorMessage(e); _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(12),
          child: TextField(
            decoration: const InputDecoration(
              prefixIcon: Icon(Icons.search),
              hintText: 'Search leads…',
            ),
            onChanged: (v) { _search = v; },
            onSubmitted: (_) => _load(),
          ),
        ),
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : _error != null
                  ? Center(child: Text(_error!))
                  : _leads.isEmpty
                      ? const Center(child: Text('No leads assigned.'))
                      : RefreshIndicator(
                          onRefresh: _load,
                          child: ListView.separated(
                            itemCount: _leads.length,
                            separatorBuilder: (_, __) => const Divider(height: 1),
                            itemBuilder: (_, i) => _tile(_leads[i]),
                          ),
                        ),
        ),
      ],
    );
  }

  Widget _tile(Lead lead) {
    return ListTile(
      title: Text(lead.name, style: const TextStyle(fontWeight: FontWeight.w600)),
      subtitle: Text('${lead.mobile}${lead.company != null ? ' · ${lead.company}' : ''}'),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          StatusBadge(lead.leadStatus),
          const SizedBox(width: 8),
          IconButton(
            icon: const Icon(Icons.call, color: AppColors.green),
            onPressed: callFlowBusy ? null : () => startCallFlow(lead.mobile, clientId: lead.id),
          ),
        ],
      ),
    );
  }
}
