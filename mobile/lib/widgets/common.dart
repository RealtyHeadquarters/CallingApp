import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

class KpiCard extends StatelessWidget {
  final String label;
  final String value;
  final bool accent;
  final IconData? icon;
  const KpiCard({super.key, required this.label, required this.value, this.accent = false, this.icon});

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: const Duration(milliseconds: 420),
      curve: Curves.easeOutCubic,
      builder: (context, t, child) => Opacity(
        opacity: t,
        child: Transform.translate(offset: Offset(0, (1 - t) * 14), child: child),
      ),
      child: Container(
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: AppColors.border),
          boxShadow: [
            BoxShadow(color: AppColors.brand.withValues(alpha: 0.06), blurRadius: 16, offset: const Offset(0, 6)),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              height: 4,
              decoration: const BoxDecoration(
                gradient: AppColors.brandGradient,
                borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Text(label.toUpperCase(),
                            style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: AppColors.text3, letterSpacing: 0.6)),
                      ),
                      if (icon != null)
                        Container(
                          width: 30, height: 30,
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(9),
                            gradient: LinearGradient(colors: [
                              AppColors.brand.withValues(alpha: 0.14),
                              AppColors.accent.withValues(alpha: 0.14),
                            ]),
                          ),
                          child: Icon(icon, size: 16, color: AppColors.brand600),
                        ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  ShaderMask(
                    shaderCallback: (r) => accent
                        ? AppColors.brandGradient.createShader(r)
                        : const LinearGradient(colors: [AppColors.text, AppColors.text]).createShader(r),
                    child: Text(value,
                        style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: Colors.white, letterSpacing: -0.5)),
                  ),
                ],
              ),
            ),
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
