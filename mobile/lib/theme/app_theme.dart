import 'package:flutter/material.dart';

/// Original CallingApp brand — deep indigo + teal accent (matches the web CRM).
class AppColors {
  static const brand = Color(0xFF3A3F8F);
  static const brandDark = Color(0xFF16183A);
  static const accent = Color(0xFF0EA5A4);
  static const bg = Color(0xFFF5F6FB);
  static const surface = Colors.white;
  static const text = Color(0xFF1A1C2E);
  static const text2 = Color(0xFF5B5F77);
  static const text3 = Color(0xFF8B8FA6);
  static const green = Color(0xFF16A34A);
  static const red = Color(0xFFDC2626);
  static const amber = Color(0xFFD97706);
  static const blue = Color(0xFF2563EB);
  static const border = Color(0xFFE6E8F0);
}

ThemeData buildTheme() {
  final base = ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(
      seedColor: AppColors.brand,
      primary: AppColors.brand,
      secondary: AppColors.accent,
    ),
    scaffoldBackgroundColor: AppColors.bg,
  );
  return base.copyWith(
    appBarTheme: const AppBarTheme(
      backgroundColor: AppColors.surface,
      foregroundColor: AppColors.text,
      elevation: 0,
      centerTitle: false,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: AppColors.surface,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: AppColors.border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: AppColors.border),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: AppColors.brand,
        minimumSize: const Size.fromHeight(50),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    ),
    cardTheme: CardThemeData(
      color: AppColors.surface,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: const BorderSide(color: AppColors.border),
      ),
    ),
  );
}
