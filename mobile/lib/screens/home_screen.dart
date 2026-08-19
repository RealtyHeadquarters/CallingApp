import 'dart:async';
import 'package:flutter/material.dart';
import 'package:phone_state/phone_state.dart';
import 'package:provider/provider.dart';
import '../services/api_client.dart';
import '../services/call_service.dart';
import '../state/auth_state.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';
import 'dashboard_screen.dart';
import 'dialpad_screen.dart';
import 'leads_screen.dart';
import 'call_history_screen.dart';
import 'followups_screen.dart';
import 'notifications_screen.dart';
import 'call_flow.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> with WidgetsBindingObserver {
  int _index = 0;
  final _call = CallService();
  StreamSubscription<PhoneState>? _phoneSub;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      // Finish a call interrupted by an app kill (MIUI), then pull any calls
      // (incoming + outgoing) that happened while away into the CRM.
      completePendingCall(context);
      _syncCalls();
    });
    _listenPhoneState();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _phoneSub?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _syncCalls();
  }

  Future<void> _syncCalls() async {
    final n = await _call.syncCallLog();
    if (n > 0 && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('$n call(s) synced from your phone')),
      );
      setState(() {}); // refresh visible lists
    }
  }

  // Real-time caller ID: when a call comes in (app active), show who's calling;
  // when a call ends, sync it into the CRM immediately.
  void _listenPhoneState() {
    try {
      _phoneSub = PhoneState.stream.listen((event) async {
        final number = event.number;
        if (event.status == PhoneStateStatus.CALL_INCOMING && number != null && number.isNotEmpty) {
          final client = await _call.lookup(number);
          if (mounted) _showIncomingBanner(number, client);
        } else if (event.status == PhoneStateStatus.CALL_ENDED) {
          if (!mounted) return;
          ScaffoldMessenger.of(context).clearMaterialBanners();
          await _syncCalls();
        }
      });
    } catch (_) {/* phone state unavailable — sync still covers logging */}
  }

  void _showIncomingBanner(String number, Map<String, dynamic>? client) {
    final name = client?['name'] as String?;
    final company = client?['company'] as String?;
    final status = client?['leadStatus'] as String?;
    ScaffoldMessenger.of(context)
      ..clearMaterialBanners()
      ..showMaterialBanner(MaterialBanner(
        backgroundColor: AppColors.brandDark,
        leading: const Icon(Icons.phone_callback, color: AppColors.accent),
        content: DefaultTextStyle(
          style: const TextStyle(color: Colors.white),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(name ?? 'Incoming call', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
              Text('$number${company != null ? ' · $company' : ''}${status != null ? ' · ${titleCase(status)}' : ''}',
                  style: const TextStyle(color: Colors.white70, fontSize: 12.5)),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => ScaffoldMessenger.of(context).clearMaterialBanners(),
            child: const Text('Dismiss', style: TextStyle(color: AppColors.accent)),
          ),
        ],
      ));
  }

  final _pages = const [
    DashboardScreen(),
    DialPadScreen(),
    LeadsScreen(),
    CallHistoryScreen(),
    FollowUpsScreen(),
  ];

  final _titles = const ['Dashboard', 'Dial Pad', 'My Leads', 'Call History', 'Follow-ups'];

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthState>();
    return Scaffold(
      appBar: AppBar(
        title: Text(_titles[_index], style: const TextStyle(fontWeight: FontWeight.w700)),
        actions: [
          const _NotificationBell(),
          _PresenceMenu(status: auth.user?.agentStatus ?? 'OFFLINE'),
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: 'Logout',
            onPressed: () => context.read<AuthState>().logout(),
          ),
        ],
      ),
      body: IndexedStack(index: _index, children: _pages),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.dashboard_outlined), selectedIcon: Icon(Icons.dashboard), label: 'Home'),
          NavigationDestination(icon: Icon(Icons.dialpad), label: 'Dial'),
          NavigationDestination(icon: Icon(Icons.people_outline), selectedIcon: Icon(Icons.people), label: 'Leads'),
          NavigationDestination(icon: Icon(Icons.history), label: 'History'),
          NavigationDestination(icon: Icon(Icons.alarm), label: 'Follow-ups'),
        ],
      ),
    );
  }
}

class _NotificationBell extends StatefulWidget {
  const _NotificationBell();

  @override
  State<_NotificationBell> createState() => _NotificationBellState();
}

class _NotificationBellState extends State<_NotificationBell> {
  int _unread = 0;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _loadCount();
    _timer = Timer.periodic(const Duration(seconds: 30), (_) => _loadCount());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _loadCount() async {
    try {
      final res = await ApiClient.instance.dio.get('/notifications/unread-count');
      if (mounted) setState(() => _unread = res.data['unreadCount'] ?? 0);
    } catch (_) {/* best-effort */}
  }

  Future<void> _open() async {
    await Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const NotificationsScreen()),
    );
    _loadCount();
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      alignment: Alignment.center,
      children: [
        IconButton(icon: const Icon(Icons.notifications_none), onPressed: _open),
        if (_unread > 0)
          Positioned(
            top: 8, right: 8,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
              constraints: const BoxConstraints(minWidth: 16),
              decoration: BoxDecoration(color: AppColors.red, borderRadius: BorderRadius.circular(999)),
              child: Text(
                _unread > 99 ? '99+' : '$_unread',
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w700),
              ),
            ),
          ),
      ],
    );
  }
}

class _PresenceMenu extends StatelessWidget {
  final String status;
  const _PresenceMenu({required this.status});

  @override
  Widget build(BuildContext context) {
    return PopupMenuButton<String>(
      tooltip: 'Presence',
      onSelected: (s) => context.read<AuthState>().setStatus(s),
      itemBuilder: (_) => const [
        PopupMenuItem(value: 'AVAILABLE', child: Text('Available')),
        PopupMenuItem(value: 'AWAY', child: Text('Away')),
        PopupMenuItem(value: 'OFFLINE', child: Text('Offline')),
      ],
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8),
        child: Row(children: [
          StatusBadge(status),
          const Icon(Icons.arrow_drop_down, color: AppColors.text3),
        ]),
      ),
    );
  }
}
