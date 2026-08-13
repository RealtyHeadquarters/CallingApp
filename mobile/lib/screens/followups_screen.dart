import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../models/models.dart';
import '../services/api_client.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';

class FollowUpsScreen extends StatefulWidget {
  const FollowUpsScreen({super.key});

  @override
  State<FollowUpsScreen> createState() => _FollowUpsScreenState();
}

class _FollowUpsScreenState extends State<FollowUpsScreen> {
  static const _scopes = ['today', 'upcoming', 'overdue', 'completed'];
  String _scope = 'today';
  List<FollowUp> _items = [];
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
      final res = await ApiClient.instance.dio.get('/follow-ups', queryParameters: {'scope': _scope, 'pageSize': 50});
      final rows = (res.data['data'] as List).map((e) => FollowUp.fromJson(e)).toList();
      if (mounted) setState(() { _items = rows; _loading = false; });
    } catch (e) {
      if (mounted) setState(() { _error = apiErrorMessage(e); _loading = false; });
    }
  }

  Future<void> _complete(FollowUp f) async {
    try {
      await ApiClient.instance.dio.patch('/follow-ups/${f.id}', data: {'status': 'COMPLETED'});
      _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(apiErrorMessage(e))));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.all(12),
          child: Row(
            children: _scopes.map((s) {
              final sel = s == _scope;
              return Padding(
                padding: const EdgeInsets.only(right: 8),
                child: ChoiceChip(
                  label: Text(titleCase(s)),
                  selected: sel,
                  onSelected: (_) { setState(() => _scope = s); _load(); },
                ),
              );
            }).toList(),
          ),
        ),
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : _error != null
                  ? Center(child: Text(_error!))
                  : _items.isEmpty
                      ? const Center(child: Text('No follow-ups.'))
                      : RefreshIndicator(
                          onRefresh: _load,
                          child: ListView.separated(
                            itemCount: _items.length,
                            separatorBuilder: (_, __) => const Divider(height: 1),
                            itemBuilder: (_, i) => _tile(_items[i]),
                          ),
                        ),
        ),
      ],
    );
  }

  Widget _tile(FollowUp f) {
    return ListTile(
      title: Text(f.clientName, style: const TextStyle(fontWeight: FontWeight.w600)),
      subtitle: Text(
        '${DateFormat('dd MMM, hh:mm a').format(f.followupAt)} · ${titleCase(f.followupType)}'
        '${f.note != null ? '\n${f.note}' : ''}',
      ),
      isThreeLine: f.note != null,
      trailing: f.status == 'PENDING'
          ? IconButton(
              icon: const Icon(Icons.check_circle_outline, color: AppColors.green),
              tooltip: 'Mark done',
              onPressed: () => _complete(f),
            )
          : StatusBadge(f.status),
    );
  }
}
