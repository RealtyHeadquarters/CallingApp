import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

class KpiCard extends StatelessWidget {
  final String label;
  final String value;
  final bool accent;
  const KpiCard({super.key, required this.label, required this.value, this.accent = false});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label.toUpperCase(),
                style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.text3, letterSpacing: 0.4)),
            const SizedBox(height: 8),
            Text(value,
                style: TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.w700,
                    color: accent ? AppColors.accent : AppColors.text)),
          ],
        ),
      ),
    );
  }
}

/// Colored pill for statuses (lead/call/follow-up).
class StatusBadge extends StatelessWidget {
  final String status;
  const StatusBadge(this.status, {super.key});

  static const _colors = {
    'ANSWERED': AppColors.green, 'CONVERTED': AppColors.green, 'INTERESTED': AppColors.green,
    'COMPLETED': AppColors.green, 'AVAILABLE': AppColors.green,
    'NO_ANSWER': AppColors.red, 'FAILED': AppColors.red, 'LOST': AppColors.red,
    'NOT_INTERESTED': AppColors.red, 'REJECTED': AppColors.red, 'MISSED': AppColors.red,
    'BUSY': AppColors.amber, 'FOLLOW_UP': AppColors.amber, 'PENDING': AppColors.amber,
    'ON_CALL': AppColors.amber,
    'NEW': AppColors.blue, 'ASSIGNED': AppColors.blue, 'CONTACTED': AppColors.blue,
  };

  @override
  Widget build(BuildContext context) {
    final color = _colors[status] ?? AppColors.text2;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        titleCase(status),
        style: TextStyle(color: color, fontSize: 11.5, fontWeight: FontWeight.w600),
      ),
    );
  }
}

String titleCase(String value) => value
    .toLowerCase()
    .split('_')
    .map((w) => w.isEmpty ? w : '${w[0].toUpperCase()}${w.substring(1)}')
    .join(' ');
