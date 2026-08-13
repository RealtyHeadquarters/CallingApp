import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../models/models.dart';
import '../services/api_client.dart';
import '../theme/app_theme.dart';

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  List<NotificationItem> _items = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final res = await ApiClient.instance.dio.get('/notifications', queryParameters: {'pageSize': 50});
      final rows = (res.data['data'] as List).map((e) => NotificationItem.fromJson(e)).toList();
      if (mounted) setState(() { _items = rows; _loading = false; });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _markAll() async {
    try {
      await ApiClient.instance.dio.post('/notifications/read-all');
    } catch (_) {/* best-effort */}
    _load();
  }

  IconData _icon(String type) {
    switch (type) {
      case 'FOLLOWUP_REMINDER': return Icons.alarm;
      case 'FOLLOWUP_OVERDUE': return Icons.warning_amber_rounded;
      case 'LEAD_ASSIGNED': return Icons.person_add_alt;
      case 'DAILY_TARGET': return Icons.flag_outlined;
      default: return Icons.notifications_none;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [TextButton(onPressed: _markAll, child: const Text('Mark all read'))],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _items.isEmpty
              ? const Center(child: Text('No notifications'))
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView.separated(
                    itemCount: _items.length,
                    separatorBuilder: (_, __) => const Divider(height: 1),
                    itemBuilder: (_, i) {
                      final n = _items[i];
                      return Container(
                        color: n.read ? null : AppColors.brand.withValues(alpha: 0.05),
                        child: ListTile(
                          leading: Icon(_icon(n.type), color: AppColors.brand),
                          title: Text(n.title, style: const TextStyle(fontWeight: FontWeight.w600)),
                          subtitle: Text(
                            '${n.body != null ? '${n.body}\n' : ''}${DateFormat('dd MMM, hh:mm a').format(n.createdAt)}',
                          ),
                          isThreeLine: n.body != null,
                        ),
                      );
                    },
                  ),
                ),
    );
  }
}
