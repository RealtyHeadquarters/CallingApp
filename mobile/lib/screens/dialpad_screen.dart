import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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
  final _numberCtrl = TextEditingController();
  String _lastText = '';
  LookupResult? _lookup;
  Timer? _debounce;

  String get _number => _numberCtrl.text.trim();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _numberCtrl.addListener(_onChanged);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _numberCtrl.removeListener(_onChanged);
    _numberCtrl.dispose();
    _debounce?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) => handleCallResume(state);

  @override
  void onCallFlowDone() => _clear();

  // Fires on text changes (keypad, paste, manual edits) — not cursor moves.
  void _onChanged() {
    if (_numberCtrl.text == _lastText) return;
    _lastText = _numberCtrl.text;
    setState(() {}); // refresh call button / backspace state
    _scheduleLookup();
  }

  // Insert a digit at the current cursor position (or append if none).
  void _press(String d) {
    final t = _numberCtrl.text;
    final sel = _numberCtrl.selection;
    final start = sel.start >= 0 ? sel.start : t.length;
    final end = sel.end >= 0 ? sel.end : t.length;
    final newText = t.replaceRange(start, end, d);
    _numberCtrl.value = TextEditingValue(
      text: newText,
      selection: TextSelection.collapsed(offset: start + d.length),
    );
  }

  // Delete at the cursor (selection, or the char before it).
  void _backspace() {
    final t = _numberCtrl.text;
    if (t.isEmpty) return;
    final sel = _numberCtrl.selection;
    final start = sel.start, end = sel.end;
    if (start < 0) {
      _numberCtrl.value = TextEditingValue(
        text: t.substring(0, t.length - 1),
        selection: TextSelection.collapsed(offset: t.length - 1),
      );
    } else if (start != end) {
      _numberCtrl.value = TextEditingValue(
        text: t.replaceRange(start, end, ''),
        selection: TextSelection.collapsed(offset: start),
      );
    } else if (start > 0) {
      _numberCtrl.value = TextEditingValue(
        text: t.replaceRange(start - 1, start, ''),
        selection: TextSelection.collapsed(offset: start - 1),
      );
    }
  }

  void _clear() {
    _numberCtrl.clear();
    setState(() => _lookup = null);
  }

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
            // Editable field: tap to position cursor, long-press to paste/copy.
            // TextInputType.none keeps the OS keyboard hidden (we use the pad).
            child: TextField(
              controller: _numberCtrl,
              keyboardType: TextInputType.none,
              showCursor: true,
              cursorColor: AppColors.brand,
              cursorWidth: 2.4,
              textAlign: TextAlign.center,
              enableInteractiveSelection: true,
              style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w600, color: AppColors.text, letterSpacing: 1.5),
              inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9*#+ ]'))],
              decoration: const InputDecoration(
                border: InputBorder.none,
                isCollapsed: true,
                hintText: 'Enter number',
                hintStyle: TextStyle(color: AppColors.text3, fontWeight: FontWeight.w500, letterSpacing: 0),
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
