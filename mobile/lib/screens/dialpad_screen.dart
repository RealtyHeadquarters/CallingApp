import 'dart:async';
import 'package:flutter/material.dart';
import '../models/models.dart';
import '../services/api_client.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';
import 'call_flow.dart';

class DialPadScreen extends StatefulWidget {
  const DialPadScreen({super.key});

  @override
  State<DialPadScreen> createState() => _DialPadScreenState();
}

class _DialPadScreenState extends State<DialPadScreen>
    with WidgetsBindingObserver, CallFlowMixin<DialPadScreen> {
  String _number = '';
  LookupResult? _lookup;
  Timer? _debounce;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _debounce?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) => handleCallResume(state);

  @override
  void onCallFlowDone() => _clear();

  void _press(String d) {
    setState(() => _number += d);
    _scheduleLookup();
  }

  void _backspace() {
    if (_number.isEmpty) return;
    setState(() => _number = _number.substring(0, _number.length - 1));
    _scheduleLookup();
  }

  void _clear() => setState(() { _number = ''; _lookup = null; });

  void _scheduleLookup() {
    _debounce?.cancel();
    if (_number.length < 4) { setState(() => _lookup = null); return; }
    _debounce = Timer(const Duration(milliseconds: 400), _doLookup);
  }

  Future<void> _doLookup() async {
    try {
      final res = await ApiClient.instance.dio.get('/leads/lookup', queryParameters: {'number': _number});
      if (mounted) setState(() => _lookup = LookupResult.fromJson(res.data));
    } catch (_) {/* lookup is best-effort */}
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Column(
        children: [
          const SizedBox(height: 8),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
            child: Text(
              _number.isEmpty ? 'Enter number' : _number,
              style: TextStyle(
                fontSize: 30,
                fontWeight: FontWeight.w600,
                color: _number.isEmpty ? AppColors.text3 : AppColors.text,
              ),
            ),
          ),
          if (_lookup != null) _lookupCard(),
          const Spacer(),
          _keypad(),
          _actionRow(),
          const SizedBox(height: 16),
        ],
      ),
    );
  }

  Widget _lookupCard() {
    final l = _lookup!;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: l.found
              ? Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(children: [
                      Expanded(child: Text(l.name ?? '', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16))),
                      if (l.leadStatus != null) StatusBadge(l.leadStatus!),
                    ]),
                    if (l.company != null) Text(l.company!, style: const TextStyle(color: AppColors.text2)),
                    if (l.lastRemark != null) Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Text('Last: ${l.lastRemark}', style: const TextStyle(color: AppColors.text3, fontSize: 13)),
                    ),
                  ],
                )
              : const Row(children: [
                  Icon(Icons.person_add_alt, color: AppColors.text3, size: 18),
                  SizedBox(width: 8),
                  Text('New number — not in CRM', style: TextStyle(color: AppColors.text3)),
                ]),
        ),
      ),
    );
  }

  Widget _keypad() {
    const keys = [
      ['1', '2', '3'],
      ['4', '5', '6'],
      ['7', '8', '9'],
      ['*', '0', '#'],
    ];
    return Column(
      children: keys
          .map((row) => Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: row.map((k) => _key(k)).toList(),
              ))
          .toList(),
    );
  }

  Widget _key(String k) {
    return Padding(
      padding: const EdgeInsets.all(8),
      child: SizedBox(
        width: 74, height: 62,
        child: Material(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(16),
          child: InkWell(
            borderRadius: BorderRadius.circular(16),
            onTap: () => _press(k),
            child: Center(child: Text(k, style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w500))),
          ),
        ),
      ),
    );
  }

  Widget _actionRow() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          const SizedBox(width: 56),
          SizedBox(
            width: 72, height: 72,
            child: FloatingActionButton(
              heroTag: 'call',
              backgroundColor: _number.isEmpty ? AppColors.text3 : AppColors.green,
              onPressed: () => startCallFlow(_number, clientId: _lookup?.clientId),
              child: callFlowBusy
                  ? const CircularProgressIndicator(color: Colors.white)
                  : const Icon(Icons.call, size: 30),
            ),
          ),
          GestureDetector(
            onLongPress: _clear,
            child: IconButton(
              iconSize: 28,
              onPressed: _number.isEmpty ? null : _backspace,
              icon: const Icon(Icons.backspace_outlined),
            ),
          ),
        ],
      ),
    );
  }
}
